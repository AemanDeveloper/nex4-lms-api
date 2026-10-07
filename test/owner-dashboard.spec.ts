import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { OwnerController } from '../src/owner/owner.controller';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TrialService } from '../src/trial/trial.service';

describe('owner dashboard data', () => {
  it('returns overview metrics from independent platform counts', async () => {
    const prisma = {
      trialRequest: { count: vi.fn().mockResolvedValue(3) },
      organisation: { count: vi.fn().mockResolvedValueOnce(8).mockResolvedValueOnce(5) },
      user: { count: vi.fn().mockResolvedValue(124) },
      auditLog: { count: vi.fn().mockResolvedValue(42) },
    } as unknown as PrismaService;
    const controller = new OwnerController({} as TrialService, prisma, {} as ConfigService);

    await expect(controller.getOverview()).resolves.toEqual({
      pendingTrials: 3,
      organisations: 8,
      activeSubscriptions: 5,
      users: 124,
      auditEvents: 42,
    });
  });

  it('serializes organisation storage without exposing a BigInt JSON failure', async () => {
    const prisma = {
      organisation: {
        findMany: vi.fn().mockResolvedValue([{ id: 'organisation-id', name: 'Bright Path', storageUsedBytes: BigInt(1_048_576) }]),
      },
    } as unknown as PrismaService;
    const controller = new OwnerController({} as TrialService, prisma, {} as ConfigService);

    await expect(controller.listOrganisations()).resolves.toEqual([
      { id: 'organisation-id', name: 'Bright Path', storageUsedBytes: '1048576' },
    ]);
  });

  it('suspends an organisation and records the owner action', async () => {
    const update = vi.fn();
    const createAudit = vi.fn();
    const prisma = {
      organisation: {
        findUnique: vi.fn().mockResolvedValue({ id: 'organisation-id', status: 'TRIAL' }),
        update,
      },
      auditLog: { create: createAudit },
      $transaction: vi.fn().mockImplementation(async (operations: unknown[]) => Promise.all(operations)),
    } as unknown as PrismaService;
    const controller = new OwnerController({} as TrialService, prisma, {} as ConfigService);

    await expect(controller.suspendOrganisation(
      'organisation-id',
      { reason: 'Account review' },
      { owner: { sub: 'owner-id' } } as never,
    )).resolves.toEqual({ id: 'organisation-id', status: 'SUSPENDED' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'organisation-id' }, data: { status: 'SUSPENDED' } });
    expect(createAudit).toHaveBeenCalledOnce();
  });

  it('requires the exact organisation slug before scheduling deletion', async () => {
    const prisma = {
      organisation: { findUnique: vi.fn().mockResolvedValue({ id: 'organisation-id', slug: 'bright-path', status: 'TRIAL' }) },
    } as unknown as PrismaService;
    const controller = new OwnerController({} as TrialService, prisma, {} as ConfigService);

    await expect(controller.scheduleOrganisationDeletion(
      'organisation-id',
      { confirmation: 'Bright Path' },
      { owner: { sub: 'owner-id' } } as never,
    )).rejects.toMatchObject({ response: { code: 'CONFIRMATION_MISMATCH' } });
  });
});
