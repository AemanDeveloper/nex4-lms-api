import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { OrganisationStatus, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe | null;

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = key ? new Stripe(key) : null;
  }

  async createCheckout(organisationId: string, input: CreateCheckoutDto) {
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
      const plan = subscription.metadata.plan as SubscriptionPlan | undefined;
      if (organisationId && plan && Object.values(SubscriptionPlan).includes(plan) && ['active', 'trialing'].includes(subscription.status)) {
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
