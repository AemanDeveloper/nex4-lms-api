import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { TRIAL_QUOTAS } from '../trial/trial.constants';

export const PAID_PLANS = {
  STARTER: { monthlyMyr: 300, quotas: { ...TRIAL_QUOTAS, teachers: 10, learners: 100, branches: 2, organisationAdmins: 2, privateStorageBytes: 10 * 1_073_741_824 } },
  GROWTH: { monthlyMyr: 500, quotas: { ...TRIAL_QUOTAS, teachers: 25, learners: 300, branches: 5, organisationAdmins: 5, privateStorageBytes: 30 * 1_073_741_824 } },
} as const;

export function organisationQuotas(organisation: { subscriptionPlan?: SubscriptionPlan | null; subscriptionStatus?: SubscriptionStatus }) {
  if (organisation.subscriptionStatus === SubscriptionStatus.ACTIVE &&
      (organisation.subscriptionPlan === 'STARTER' || organisation.subscriptionPlan === 'GROWTH')) {
    return PAID_PLANS[organisation.subscriptionPlan].quotas;
  }
  // Enterprise requires a separately approved contract; never grant unlimited access by default.
  return TRIAL_QUOTAS;
}
