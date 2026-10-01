import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MembershipRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { WorkspaceService } from '../src/workspace/workspace.service';

describe('interactive trial workspace', () => {
  it('returns tenant-scoped dashboard data and serializes storage usage', async () => {
    const transaction = {
      organisation: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'org-id', storageUsedBytes: 512n }) },
      user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'user-id', email: 'admin@example.com' }) },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
      course: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(2) },
      announcement: { findMany: vi.fn().mockResolvedValue([]) },
      lesson: { count: vi.fn().mockResolvedValue(4) },
      assignment: { count: vi.fn().mockResolvedValue(3) },
      membership: { count: vi.fn().mockResolvedValue(5) },
      storedFile: { count: vi.fn().mockResolvedValue(1) },
    };
    const prisma = {
      forOrganisation: vi.fn((_organisationId, operation) => operation(transaction)),
    } as unknown as PrismaService;
    const service = new WorkspaceService(prisma);

    const dashboard = await service.getDashboard('org-id', 'user-id', MembershipRole.ORGANISATION_ADMIN);

    expect(dashboard.organisation.storageUsedBytes).toBe('512');
    expect(dashboard.metrics).toEqual({ courses: 2, lessons: 4, assignments: 3, members: 5, files: 1 });
    expect(dashboard.capabilities.canManageOrganisation).toBe(true);
    expect(prisma.forOrganisation).toHaveBeenCalledWith('org-id', expect.any(Function));
  });

  it('rejects unsafe file types before creating a storage record', async () => {
    const service = new StorageService({} as PrismaService, {} as ConfigService);
    await expect(
      service.createUploadIntent('org-id', 'user-id', {
        fileName: 'installer.exe',
        contentType: 'application/x-msdownload',
        sizeBytes: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
