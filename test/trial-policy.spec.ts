import { addDays } from '../src/trial/trial-time';
import { TRIAL_ACTIVATION_DAYS, TRIAL_DURATION_DAYS, TRIAL_QUOTAS, TRIAL_RECOVERY_DAYS } from '../src/trial/trial.constants';
import { describe, expect, it } from 'vitest';

describe('trial policy', () => {
  it('starts the fourteen-day duration from activation', () => {
    const activatedAt = new Date('2026-09-29T00:00:00.000Z');
    expect(addDays(activatedAt, TRIAL_DURATION_DAYS).toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });

  it('keeps activation links for seven days and data for thirty days', () => {
    expect(TRIAL_ACTIVATION_DAYS).toBe(7);
    expect(TRIAL_RECOVERY_DAYS).toBe(30);
  });

  it('matches the approved local trial quotas', () => {
    expect(TRIAL_QUOTAS).toEqual({ organisations: 1, branches: 2, organisationAdmins: 2, teachers: 3, learners: 20, guardians: 20, privateStorageBytes: 1_073_741_824 });
  });
});
