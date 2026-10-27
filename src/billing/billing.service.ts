import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { OrganisationStatus, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PAID_PLANS } from './plan-quotas';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe | null;

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = key ? new Stripe(key) : null;
  }

  async createCheckout(organisationId: string, input: CreateCheckoutDto) {
    if (!['STARTER', 'GROWTH'].includes(input.plan) || input.currency !== 'MYR' || input.interval !== 'MONTHLY') {
      throw new BadRequestException('Only Starter and Growth monthly MYR plans are available.');
    }
    if (!this.stripe) throw new ServiceUnavailableException({ code: 'BILLING_NOT_CONFIGURED', message: 'Subscription checkout is not available yet. Please contact support.' });
    const organisation = await this.prisma.organisation.findUnique({ where: { id: organisationId } });
    if (!organisation) throw new BadRequestException({ code: 'ORGANISATION_NOT_FOUND', message: 'The organisation could not be found.' });
    if (['SUSPENDED', 'PENDING_DELETION', 'DELETED'].includes(organisation.status)) {
      throw new ForbiddenException({ code: 'ORGANISATION_UNAVAILABLE', message: 'This organisation cannot start a subscription.' });
    }
    if (organisation.stripeSubscriptionId) {
      const existing = await this.stripe.subscriptions.retrieve(organisation.stripeSubscriptionId);
      if (!['canceled', 'incomplete_expired'].includes(existing.status)) {
        throw new ConflictException({ code: 'SUBSCRIPTION_EXISTS', message: 'This organisation already has a subscription. Contact support to change it.' });
      }
    }
    const priceId = this.config.get<string>(`STRIPE_${input.plan}_${input.currency}_${input.interval}_PRICE_ID`);
    if (!priceId) throw new ServiceUnavailableException({ code: 'PRICE_NOT_CONFIGURED', message: 'This plan is not available in the selected currency and interval.' });
    const price = await this.stripe.prices.retrieve(priceId);
    if (!price.active || price.currency !== 'myr' || price.unit_amount !== PAID_PLANS[input.plan].monthlyMyr * 100 || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1) {
      throw new ServiceUnavailableException({ code: 'PRICE_CONFIGURATION_INVALID', message: 'The subscription price requires administrator attention.' });
    }
    const customer = organisation.stripeCustomerId
      ? organisation.stripeCustomerId
      : (await this.stripe.customers.create({ name: organisation.name, metadata: { organisationId } })).id;
    if (!organisation.stripeCustomerId) await this.prisma.organisation.update({ where: { id: organisationId }, data: { stripeCustomerId: customer } });
    const webUrl = this.config.getOrThrow<string>('PUBLIC_WEB_URL');
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription', customer, line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${webUrl}/workspace?checkout=success`, cancel_url: `${webUrl}/workspace?checkout=cancelled`,
      subscription_data: { metadata: { organisationId, plan: input.plan } }, metadata: { organisationId, plan: input.plan },
    });
    return { checkoutUrl: session.url };
  }

  async getPlans(organisationId: string) {
    const organisation = await this.prisma.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { subscriptionPlan: true, subscriptionStatus: true, stripeCustomerId: true } });
    return {
      currentPlan: organisation.subscriptionPlan, status: organisation.subscriptionStatus,
      canManageBilling: Boolean(this.stripe && organisation.stripeCustomerId),
      plans: Object.entries(PAID_PLANS).map(([id, plan]) => ({ id, ...plan, available: Boolean(this.stripe && this.config.get(`STRIPE_${id}_MYR_MONTHLY_PRICE_ID`)) })),
    };
  }

  async createPortal(organisationId: string) {
    if (!this.stripe) throw new ServiceUnavailableException('Billing is not configured.');
    const organisation = await this.prisma.organisation.findUniqueOrThrow({ where: { id: organisationId } });
    if (!organisation.stripeCustomerId || ['SUSPENDED', 'PENDING_DELETION', 'DELETED'].includes(organisation.status)) throw new ForbiddenException('Billing access is unavailable.');
    const session = await this.stripe.billingPortal.sessions.create({ customer: organisation.stripeCustomerId, return_url: `${this.config.getOrThrow<string>('PUBLIC_WEB_URL')}/workspace/billing` });
    return { checkoutUrl: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!this.stripe) throw new ServiceUnavailableException();
    const secret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException({ code: 'INVALID_WEBHOOK', message: 'Invalid Stripe signature.' });
    }
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      // Deliveries can arrive out of order: reconcile against Stripe's current state.
      const subscription = await this.stripe.subscriptions.retrieve(event.data.object.id);
      const organisationId = subscription.metadata.organisationId;
      // Metadata is not an entitlement: only the configured, single-unit paid price
      // can activate a plan. Portal plan changes must follow the actual price too.
      const items = subscription.items?.data ?? [];
      const item = items.length === 1 ? items[0] : undefined;
      const plan = ([SubscriptionPlan.STARTER, SubscriptionPlan.GROWTH] as const).find((candidate) => {
        const priceId = this.config.get<string>(`STRIPE_${candidate}_MYR_MONTHLY_PRICE_ID`);
        return Boolean(priceId && item?.price.id === priceId && item.quantity === 1
          && item.price.currency === 'myr'
          && item.price.unit_amount === PAID_PLANS[candidate].monthlyMyr * 100
          && item.price.recurring?.interval === 'month'
          && item.price.recurring.interval_count === 1);
      });
      if (organisationId && plan && subscription.status === 'active') {
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
        await this.prisma.$transaction(async (transaction) => {
          const updated = await transaction.organisation.updateMany({
            where: { id: organisationId, stripeCustomerId: customerId, status: { in: [OrganisationStatus.TRIAL, OrganisationStatus.ACTIVE, OrganisationStatus.READ_ONLY] }, OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: subscription.id }, { subscriptionStatus: SubscriptionStatus.CANCELED }] },
            data: { status: OrganisationStatus.ACTIVE, subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlan: plan, stripeSubscriptionId: subscription.id },
          });
          if (updated.count) await transaction.auditLog.create({ data: { organisationId, action: 'subscription.activated', targetType: 'subscription', targetId: subscription.id, metadata: { plan, stripeEventId: event.id } } });
        });
      }
    }
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const organisationId = subscription.metadata.organisationId;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      if (organisationId) await this.prisma.organisation.updateMany({
        where: { id: organisationId, stripeCustomerId: customerId, stripeSubscriptionId: subscription.id, status: { in: [OrganisationStatus.TRIAL, OrganisationStatus.ACTIVE, OrganisationStatus.READ_ONLY] } },
        data: { status: OrganisationStatus.READ_ONLY, subscriptionStatus: SubscriptionStatus.CANCELED },
      });
    }
    return { received: true };
  }
}
