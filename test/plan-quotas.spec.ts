import { describe, expect, it } from 'vitest';
import { organisationQuotas, PAID_PLANS } from '../src/billing/plan-quotas';

describe('approved commercial plans', () => {
  it('uses approved MYR monthly prices', () => {
    expect(PAID_PLANS.STARTER.monthlyMyr).toBe(300);
    expect(PAID_PLANS.GROWTH.monthlyMyr).toBe(500);
  });
  it('grants paid quotas only for an active subscription', () => {
    expect(organisationQuotas({ subscriptionStatus: 'ACTIVE', subscriptionPlan: 'STARTER' })).toMatchObject({ learners: 100, teachers: 10, branches: 2, organisationAdmins: 2, privateStorageBytes: 10_737_418_240 });
    expect(organisationQuotas({ subscriptionStatus: 'ACTIVE', subscriptionPlan: 'GROWTH' })).toMatchObject({ learners: 300, teachers: 25, branches: 5, organisationAdmins: 5, privateStorageBytes: 32_212_254_720 });
    expect(organisationQuotas({ subscriptionStatus: 'TRIALING', subscriptionPlan: 'GROWTH' }).learners).toBe(20);
  });
});
