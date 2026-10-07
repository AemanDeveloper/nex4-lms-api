import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipRole, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createOpaqueToken, hashToken } from '../common/hash-token';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { TRIAL_ACTIVATION_DAYS, TRIAL_QUOTAS } from '../trial/trial.constants';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
} from './dto/learning-core.dto';

const invitationRoles = new Set<MembershipRole>([
  MembershipRole.TEACHER,
  MembershipRole.STUDENT,
]);

@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async list(organisationId: string, role: MembershipRole) {
    this.requireAdmin(role);
    return this.prisma.forOrganisation(organisationId, (transaction) =>
      transaction.invitation.findMany({
        where: { organisationId },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async create(
    organisationId: string,
    userId: string,
    role: MembershipRole,
    input: CreateInvitationDto,
  ) {
    this.requireAdmin(role);
    const email = input.email.trim().toLowerCase();
    const invitedRole =
      input.role === 'TEACHER'
        ? MembershipRole.TEACHER
        : MembershipRole.STUDENT;
    const { token: opaque } = createOpaqueToken();
    const token = `${organisationId}.${opaque}`;
    const expiresAt = this.expiry();

    const invitation = await this.prisma.forOrganisation(
      organisationId,
      async (transaction) => {
        const existingUser = await transaction.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (existingUser) {
          const existingMembership = await transaction.membership.findFirst({
            where: {
              organisationId,
              userId: existingUser.id,
              role: invitedRole,
            },
          });
          if (existingMembership) {
            throw new ConflictException({
              code: 'MEMBERSHIP_EXISTS',
              message: 'This person already has that role.',
            });
          }
        }

        const duplicate = await transaction.invitation.findFirst({
          where: {
            organisationId,
            email,
            role: invitedRole,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        if (duplicate) {
          throw new ConflictException({
            code: 'INVITATION_EXISTS',
            message: 'An active invitation already exists for this email.',
          });
        }

        await this.enforceQuota(transaction, organisationId, invitedRole);
        const created = await transaction.invitation.create({
          data: {
            organisationId,
            email,
            role: invitedRole,
            tokenHash: hashToken(token),
            expiresAt,
            invitedByUserId: userId,
          },
        });
        await transaction.auditLog.create({
          data: {
            organisationId,
            actorUserId: userId,
            action: 'invitation.created',
            targetType: 'invitation',
            targetId: created.id,
            metadata: {
              email,
              role: invitedRole,
              expiresAt: expiresAt.toISOString(),
            },
          },
        });
        return created;
      },
    );

    await this.send(invitation.id, email, invitedRole, token);
    return { id: invitation.id, email, role: invitedRole, expiresAt };
  }

  async resend(
    organisationId: string,
    userId: string,
    role: MembershipRole,
    invitationId: string,
  ) {
    this.requireAdmin(role);
    const { token: opaque } = createOpaqueToken();
    const token = `${organisationId}.${opaque}`;
    const expiresAt = this.expiry();
    const invitation = await this.prisma.forOrganisation(
      organisationId,
      async (transaction) => {
        const existing = await transaction.invitation.findFirst({
          where: { id: invitationId, organisationId },
        });
        if (!existing) throw new NotFoundException();
        if (existing.acceptedAt) {
          throw new ConflictException({
            code: 'INVITATION_USED',
            message: 'This invitation has already been accepted.',
          });
        }
        await this.enforceQuota(
          transaction,
          organisationId,
          existing.role,
          existing.id,
        );
        const updated = await transaction.invitation.update({
          where: { id: existing.id },
          data: { tokenHash: hashToken(token), expiresAt },
        });
        await transaction.auditLog.create({
          data: {
            organisationId,
            actorUserId: userId,
            action: 'invitation.resent',
            targetType: 'invitation',
            targetId: updated.id,
            metadata: { expiresAt: expiresAt.toISOString() },
          },
        });
        return updated;
      },
    );
    await this.send(invitation.id, invitation.email, invitation.role, token);
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt,
    };
  }

  async accept(input: AcceptInvitationDto) {
    const organisationId = input.token.split('.', 1)[0];
    if (
      !organisationId ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(organisationId)
    ) {
      throw new BadRequestException({
        code: 'INVITATION_INVALID',
        message: 'This invitation link is invalid.',
      });
    }
    return this.prisma.forOrganisation(organisationId, async (transaction) => {
      const invitation = await transaction.invitation.findUnique({
        where: { tokenHash: hashToken(input.token) },
        include: { organisation: { select: { slug: true } } },
      });
      if (!invitation || invitation.organisationId !== organisationId) {
        throw new NotFoundException({
          code: 'INVITATION_NOT_FOUND',
          message: 'This invitation link is invalid.',
        });
      }
      if (invitation.acceptedAt) {
        throw new GoneException({
          code: 'INVITATION_USED',
          message: 'This invitation has already been accepted.',
        });
      }
      if (invitation.expiresAt <= new Date()) {
        throw new GoneException({
          code: 'INVITATION_EXPIRED',
          message:
            'This invitation has expired. Ask an administrator to resend it.',
        });
      }
      if (!invitationRoles.has(invitation.role)) throw new ForbiddenException();

      await this.enforceQuota(
        transaction,
        organisationId,
        invitation.role,
        invitation.id,
      );
      const existing = await transaction.user.findUnique({
        where: { email: invitation.email },
      });
      const passwordHash =
        existing?.passwordHash ?? (await argon2.hash(input.password));
      const user = existing
        ? await transaction.user.update({
            where: { id: existing.id },
            data: {
              emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
              passwordHash,
            },
          })
        : await transaction.user.create({
            data: {
              email: invitation.email,
              emailVerifiedAt: new Date(),
              passwordHash,
            },
          });
      const membership = await transaction.membership.upsert({
        where: {
          organisationId_userId_role: {
            organisationId,
            userId: user.id,
            role: invitation.role,
          },
        },
        update: {},
        create: { organisationId, userId: user.id, role: invitation.role },
      });
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: {
          acceptedAt: new Date(),
          tokenHash: hashToken(`used.${input.token}.${Date.now()}`),
        },
      });
      await transaction.auditLog.create({
        data: {
          organisationId,
          actorUserId: user.id,
          action: 'invitation.accepted',
          targetType: 'membership',
          targetId: membership.id,
          metadata: { role: invitation.role, invitationId: invitation.id },
        },
      });
      return {
        accepted: true,
        existingAccount: Boolean(existing?.passwordHash),
        email: user.email,
        role: membership.role,
        organisationId,
        organisationSlug: invitation.organisation.slug,
      };
    });
  }

  private async send(
    invitationId: string,
    email: string,
    role: MembershipRole,
    token: string,
  ) {
    const roleName = role === MembershipRole.TEACHER ? 'Teacher' : 'Student';
    const actionUrl = `${this.config.getOrThrow<string>('PUBLIC_WEB_URL').replace(/\/$/, '')}/invite/accept?token=${encodeURIComponent(token)}`;
    await this.email.sendAccessEmail({
      to: email,
      subject: `Join Nex4LMS as a ${roleName}`,
      text: `Your organisation administrator invited you to join Nex4LMS as a ${roleName}. This single-use link expires in seven days.`,
      actionUrl,
      actionLabel: 'Accept invitation',
      idempotencyKey: `membership-invitation-${invitationId}-${hashToken(token).slice(0, 12)}`,
    });
  }

  private async enforceQuota(
    transaction: Prisma.TransactionClient,
    organisationId: string,
    role: MembershipRole,
    ignoredInvitationId?: string,
  ) {
    const limit =
      role === MembershipRole.TEACHER
        ? TRIAL_QUOTAS.teachers
        : TRIAL_QUOTAS.learners;
    const [members, pending] = await Promise.all([
      transaction.membership.count({ where: { organisationId, role } }),
      transaction.invitation.count({
        where: {
          organisationId,
          role,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
          ...(ignoredInvitationId ? { id: { not: ignoredInvitationId } } : {}),
        },
      }),
    ]);
    if (members + pending >= limit) {
      throw new ForbiddenException({
        code: 'TRIAL_QUOTA_EXCEEDED',
        message: `The trial allows up to ${limit} ${role === MembershipRole.TEACHER ? 'teachers' : 'students'}.`,
      });
    }
  }

  private expiry() {
    return new Date(Date.now() + TRIAL_ACTIVATION_DAYS * 24 * 60 * 60 * 1_000);
  }

  private requireAdmin(role: MembershipRole) {
    if (role !== MembershipRole.ORGANISATION_ADMIN) {
      throw new ForbiddenException({
        code: 'ROLE_NOT_ALLOWED',
        message: 'Only organisation administrators can manage invitations.',
      });
    }
  }
}
