import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MembershipRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { EmailService } from '../src/email/email.service';
import { InvitationService } from '../src/learning/invitation.service';
import { LearningService } from '../src/learning/learning.service';
import type { PrismaService } from '../src/prisma/prisma.service';

function tenantPrisma(transaction: object) {
  return { forOrganisation: vi.fn((_organisationId, operation) => operation(transaction)) } as unknown as PrismaService;
}

describe('learning core access boundaries', () => {
  it('rejects an expired invitation before creating an account', async () => {
    const transaction = {
      invitation: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'invite-id',
          organisationId: '00000000-0000-0000-0000-000000000000',
          role: MembershipRole.STUDENT,
          acceptedAt: null,
          expiresAt: new Date('2026-10-01T00:00:00.000Z'),
          organisation: { slug: 'sample-school' },
        }),
      },
    };
    const service = new InvitationService(tenantPrisma(transaction), {} as EmailService, {} as ConfigService);
    await expect(service.accept({
      token: '00000000-0000-0000-0000-000000000000.valid-token-with-more-than-32-characters',
      password: 'StrongPassword123',
    })).rejects.toBeInstanceOf(GoneException);
  });

  it('keeps accepted invitation links single-use', async () => {
    const transaction = {
      invitation: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'invite-id',
          organisationId: '00000000-0000-0000-0000-000000000000',
          role: MembershipRole.TEACHER,
          acceptedAt: new Date(),
          expiresAt: new Date('2099-10-01T00:00:00.000Z'),
          organisation: { slug: 'sample-school' },
        }),
      },
    };
    const service = new InvitationService(tenantPrisma(transaction), {} as EmailService, {} as ConfigService);
    await expect(service.accept({
      token: '00000000-0000-0000-0000-000000000000.valid-token-with-more-than-32-characters',
      password: 'StrongPassword123',
    })).rejects.toBeInstanceOf(GoneException);
  });

  it('counts pending invitations when enforcing trial role quotas', async () => {
    const transaction = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      invitation: {
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
      },
      membership: { count: vi.fn().mockResolvedValue(3) },
    };
    const service = new InvitationService(tenantPrisma(transaction), {} as EmailService, {} as ConfigService);
    await expect(service.create(
      '00000000-0000-0000-0000-000000000000',
      'user-id',
      MembershipRole.ORGANISATION_ADMIN,
      { email: 'teacher@example.com', role: 'TEACHER' },
    )).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('locks a scheduled lesson before availableFrom', async () => {
    const transaction = {
      membership: { findUnique: vi.fn().mockResolvedValue({ id: 'student-membership' }) },
      lesson: { findFirst: vi.fn().mockResolvedValue({ id: 'lesson-id', availableFrom: new Date('2099-10-01T00:00:00.000Z') }) },
    };
    const service = new LearningService(tenantPrisma(transaction));
    await expect(service.completeLesson({
      organisationId: '00000000-0000-0000-0000-000000000000',
      userId: 'student-id',
      role: MembershipRole.STUDENT,
    }, '00000000-0000-0000-0000-000000000001')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose a submission when the Student lacks course enrolment', async () => {
    const transaction = {
      assignment: { findFirst: vi.fn().mockResolvedValue({ id: 'assignment-id', courseId: 'course-id' }) },
      membership: { findUnique: vi.fn().mockResolvedValue({ id: 'student-membership' }) },
      course: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new LearningService(tenantPrisma(transaction));
    await expect(service.listSubmissions({
      organisationId: '00000000-0000-0000-0000-000000000000',
      userId: 'student-id',
      role: MembershipRole.STUDENT,
    }, '00000000-0000-0000-0000-000000000002')).rejects.toBeInstanceOf(NotFoundException);
  });
});
