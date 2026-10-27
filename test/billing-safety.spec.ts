import { BadRequestException, ConflictException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { BillingService } from '../src/billing/billing.service';
import { OrganisationWriteGuard } from '../src/auth/organisation-write.guard';

const stripe = vi.hoisted(() => ({ webhooks: { constructEvent: vi.fn() }, subscriptions: { retrieve: vi.fn() }, customers: { create: vi.fn() }, checkout: { sessions: { create: vi.fn() } } }));
vi.mock('stripe', () => ({ default: class { constructor() { return stripe; } } }));
beforeEach(() => vi.resetAllMocks());

function fixture() {
  const transaction = { organisation: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, auditLog: { create: vi.fn() } };
  const prisma = { organisation: { findUnique: vi.fn(), updateMany: transaction.organisation.updateMany }, $transaction: vi.fn(async (operation) => operation(transaction)) };
  const config = { get: vi.fn((key: string) => key === 'STRIPE_STARTER_MYR_MONTHLY_PRICE_ID' ? 'price-starter' : key === 'STRIPE_GROWTH_MYR_MONTHLY_PRICE_ID' ? 'price-growth' : 'test-key'), getOrThrow: vi.fn(() => 'test-secret') };
  return { prisma, transaction, service: new BillingService(config as unknown as ConfigService, prisma as unknown as PrismaService) };
}

describe('billing release safety', () => {
  it('rejects invalid signatures as a bad request', async () => {
    const { service } = fixture();
    stripe.webhooks.constructEvent.mockImplementation(() => { throw new Error('invalid'); });
    await expect(service.handleWebhook(Buffer.from('{}'), 'bad')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('prevents checkout for a suspended organisation', async () => {
    const { service, prisma } = fixture();
    prisma.organisation.findUnique.mockResolvedValue({ status: 'SUSPENDED' });
    await expect(service.createCheckout('org', { plan: 'STARTER', currency: 'MYR', interval: 'MONTHLY' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it('prevents another checkout when a subscription still exists', async () => {
    const { service, prisma } = fixture();
    prisma.organisation.findUnique.mockResolvedValue({ status: 'ACTIVE', stripeSubscriptionId: 'sub-1' });
    stripe.subscriptions.retrieve.mockResolvedValue({ status: 'active' });
    await expect(service.createCheckout('org', { plan: 'STARTER', currency: 'MYR', interval: 'MONTHLY' })).rejects.toBeInstanceOf(ConflictException);
  });
  it('matches the customer and excludes Owner-locked statuses atomically', async () => {
    const { service, transaction } = fixture();
    stripe.webhooks.constructEvent.mockReturnValue({ id: 'evt-1', type: 'customer.subscription.updated', data: { object: { id: 'sub-1' } } });
    stripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub-1', customer: 'cus-1', status: 'active', metadata: { organisationId: 'org', plan: 'STARTER' }, items: { data: [{ quantity: 1, price: { id: 'price-starter', currency: 'myr', unit_amount: 30000, recurring: { interval: 'month', interval_count: 1 } } }] } });
    await service.handleWebhook(Buffer.from('{}'), 'valid');
    expect(transaction.organisation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ stripeCustomerId: 'cus-1', status: { in: ['TRIAL', 'ACTIVE', 'READ_ONLY'] } }) }));
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });
  it('does not reactivate from a stale active event when Stripe now says canceled', async () => {
    const { service, transaction } = fixture();
    stripe.webhooks.constructEvent.mockReturnValue({ type: 'customer.subscription.updated', data: { object: { id: 'sub-1', status: 'active' } } });
    stripe.subscriptions.retrieve.mockResolvedValue({ status: 'canceled', metadata: { organisationId: 'org', plan: 'STARTER' } });
    await service.handleWebhook(Buffer.from('{}'), 'valid');
    expect(transaction.organisation.updateMany).not.toHaveBeenCalled();
  });
  it.each(['price-unknown', 'price-growth'])('does not grant Starter access from metadata for invalid price %s', async (priceId) => {
    const { service, transaction } = fixture();
    stripe.webhooks.constructEvent.mockReturnValue({ type: 'customer.subscription.updated', data: { object: { id: 'sub-1' } } });
    stripe.subscriptions.retrieve.mockResolvedValue({ status: 'active', metadata: { organisationId: 'org', plan: 'STARTER' }, items: { data: [{ quantity: 1, price: { id: priceId, currency: 'myr', unit_amount: 30000, recurring: { interval: 'month', interval_count: 1 } } }] } });
    await service.handleWebhook(Buffer.from('{}'), 'valid');
    expect(transaction.organisation.updateMany).not.toHaveBeenCalled();
  });
});

describe('trial expiry without a running worker', () => {
  it.each([new Date(0), null])('blocks expired or missing trial deadlines', async (trialEndsAt) => {
    const prisma = { organisation: { findUnique: vi.fn().mockResolvedValue({ status: 'TRIAL', subscriptionStatus: 'TRIALING', trialEndsAt }) } };
    const guard = new OrganisationWriteGuard(prisma as unknown as PrismaService);
    const context = { switchToHttp: () => ({ getRequest: () => ({ method: 'POST', member: { organisationId: 'org' } }) }) } as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
