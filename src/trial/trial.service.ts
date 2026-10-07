import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { hash } from 'argon2';
import { addDays } from './trial-time';
import { createOpaqueToken, hashToken } from '../common/hash-token';
import { EmailService } from '../email/email.service';
import { MembershipRole, OrganisationStatus, Prisma, TrialRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivateTrialDto } from './dto/activate-trial.dto';
import { RequestTrialDto } from './dto/request-trial.dto';
import { ResendTrialEmailDto } from './dto/resend-trial-email.dto';
import { TRIAL_ACTIVATION_DAYS, TRIAL_DURATION_DAYS, TRIAL_QUOTAS, TRIAL_RECOVERY_DAYS } from './trial.constants';

@Injectable()
export class TrialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async requestTrial(input: RequestTrialDto) {
    if (!input.acceptedPrivacyAndTrialTerms) {
      throw new BadRequestException({ code: 'TERMS_REQUIRED', message: 'Privacy and trial terms must be accepted.' });
    }
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.trialRequest.findFirst({
      where: { email, status: { in: [TrialRequestStatus.EMAIL_PENDING, TrialRequestStatus.PENDING_REVIEW, TrialRequestStatus.APPROVED] } },
    });
    if (existing) throw new ConflictException({ code: 'TRIAL_REQUEST_EXISTS', message: 'A trial request is already in progress.' });

    const verification = createOpaqueToken();
    const record = await this.prisma.trialRequest.create({
      data: {
        name: input.name.trim(),
        email,
        organisationName: input.organisationName.trim(),
        organisationType: input.organisationType,
        country: input.country.toUpperCase(),
        intendedUse: input.intendedUse.trim(),
        estimatedLearners: input.estimatedLearners,
        estimatedTeachers: input.estimatedTeachers,
        preferredCurrency: input.preferredCurrency.toUpperCase(),
        termsAcceptedAt: new Date(),
        verificationTokenHash: verification.hash,
      },
    });
    const verificationUrl = `${this.config.getOrThrow<string>('PUBLIC_WEB_URL')}/trial/verify/${verification.token}`;
    let delivery;
    try {
      delivery = await this.email.sendAccessEmail({
        to: email,
        subject: 'Verify your Nex4LMS trial request',
        text: 'Confirm your work email so the Nex4 team can review your trial request.',
        actionUrl: verificationUrl,
        actionLabel: 'Verify trial request',
        idempotencyKey: `trial-verification-${record.id}`,
      });
    } catch (error) {
      await this.prisma.trialRequest.deleteMany({
        where: { id: record.id, status: TrialRequestStatus.EMAIL_PENDING, verificationEmailSentAt: null },
      });
      throw error;
    }
    if (delivery.delivered) {
      await this.prisma.trialRequest.update({
        where: { id: record.id },
        data: { verificationEmailId: delivery.id, verificationEmailSentAt: new Date() },
      });
    }
    return {
      requestId: record.id,
      status: record.status,
      message: 'Check your work email to verify the request.',
      ...(this.isLocal() && !delivery.delivered ? { localVerificationUrl: verificationUrl } : {}),
    };
  }

  async resendVerification(requestId: string, input: ResendTrialEmailDto) {
    const email = input.email.trim().toLowerCase();
    const record = await this.prisma.trialRequest.findFirst({
      where: { id: requestId, email, status: TrialRequestStatus.EMAIL_PENDING },
    });
    if (!record) throw new NotFoundException();
    const verification = createOpaqueToken();
    await this.prisma.trialRequest.update({
      where: { id: record.id },
      data: { verificationTokenHash: verification.hash },
    });
    const verificationUrl = `${this.config.getOrThrow<string>('PUBLIC_WEB_URL')}/trial/verify/${verification.token}`;
    const delivery = await this.email.sendAccessEmail({
      to: email,
      subject: 'Verify your Nex4LMS trial request',
      text: 'Confirm your work email so the Nex4 team can review your trial request.',
      actionUrl: verificationUrl,
      actionLabel: 'Verify trial request',
      idempotencyKey: `trial-verification-${record.id}-${verification.hash.slice(0, 16)}`,
    });
    if (delivery.delivered) {
      await this.prisma.trialRequest.update({
        where: { id: record.id },
        data: { verificationEmailId: delivery.id, verificationEmailSentAt: new Date() },
      });
    }
    return { requestId: record.id, status: record.status, message: 'A new verification email has been sent.' };
  }

  async verifyEmail(token: string) {
    const record = await this.prisma.trialRequest.findUnique({ where: { verificationTokenHash: hashToken(token) } });
    if (!record || record.status !== TrialRequestStatus.EMAIL_PENDING) throw new NotFoundException();
    await this.prisma.trialRequest.update({
      where: { id: record.id },
      data: { status: TrialRequestStatus.PENDING_REVIEW, emailVerifiedAt: new Date(), verificationTokenHash: null },
    });
    return { status: TrialRequestStatus.PENDING_REVIEW, message: 'Your request is ready for review.' };
  }

  async approve(requestId: string, ownerId: string) {
    const record = await this.prisma.trialRequest.findUnique({ where: { id: requestId } });
    if (!record || record.status !== TrialRequestStatus.PENDING_REVIEW || !record.emailVerifiedAt) throw new NotFoundException();
    const activation = createOpaqueToken();
    const expiresAt = addDays(new Date(), TRIAL_ACTIVATION_DAYS);
    await this.prisma.$transaction([
      this.prisma.trialRequest.update({
        where: { id: requestId },
        data: {
          status: TrialRequestStatus.APPROVED,
          activationTokenHash: activation.hash,
          activationExpiresAt: expiresAt,
          reviewedByOwnerId: ownerId,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.auditLog.create({
        data: { actorUserId: ownerId, action: 'trial.approved', targetType: 'trial_request', targetId: requestId, metadata: {} },
      }),
    ]);
    const activationUrl = `${this.config.getOrThrow<string>('PUBLIC_WEB_URL')}/trial/activate/${activation.token}`;
    const delivery = await this.email.sendAccessEmail({
      to: record.email,
      subject: 'Your Nex4LMS trial is approved',
      text: 'Your organisation workspace is ready. Activate it within seven days.',
      actionUrl: activationUrl,
      actionLabel: 'Activate 14-day trial',
      idempotencyKey: `trial-activation-${record.id}`,
    });
    if (delivery.delivered) {
      await this.prisma.trialRequest.update({
        where: { id: record.id },
        data: { activationEmailId: delivery.id, activationEmailSentAt: new Date() },
      });
    }
    return { status: TrialRequestStatus.APPROVED, expiresAt, ...(this.isLocal() && !delivery.delivered ? { localActivationUrl: activationUrl } : {}) };
  }

  async resendActivation(requestId: string, ownerId: string) {
    const record = await this.prisma.trialRequest.findFirst({
      where: { id: requestId, status: TrialRequestStatus.APPROVED, activationExpiresAt: { gt: new Date() } },
    });
    if (!record) throw new NotFoundException();
    const activation = createOpaqueToken();
    const activationUrl = `${this.config.getOrThrow<string>('PUBLIC_WEB_URL')}/trial/activate/${activation.token}`;
    const delivery = await this.email.sendAccessEmail({
      to: record.email,
      subject: 'Your Nex4LMS trial is approved',
      text: 'Your organisation workspace is ready. Activate it within seven days.',
      actionUrl: activationUrl,
      actionLabel: 'Activate 14-day trial',
      idempotencyKey: `trial-activation-${record.id}-${activation.hash.slice(0, 16)}`,
    });
    await this.prisma.$transaction([
      this.prisma.trialRequest.update({
        where: { id: record.id },
        data: {
          activationTokenHash: activation.hash,
          activationEmailId: delivery.delivered ? delivery.id : null,
          activationEmailSentAt: delivery.delivered ? new Date() : null,
        },
      }),
      this.prisma.auditLog.create({
        data: { actorUserId: ownerId, action: 'trial.activation_resent', targetType: 'trial_request', targetId: record.id, metadata: {} },
      }),
    ]);
    return { status: record.status, activationExpiresAt: record.activationExpiresAt };
  }

  async reject(requestId: string, ownerId: string) {
    const record = await this.prisma.trialRequest.findFirst({ where: { id: requestId, status: TrialRequestStatus.PENDING_REVIEW } });
    if (!record) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.trialRequest.update({ where: { id: requestId }, data: { status: TrialRequestStatus.REJECTED, reviewedByOwnerId: ownerId, reviewedAt: new Date() } }),
      this.prisma.auditLog.create({ data: { actorUserId: ownerId, action: 'trial.rejected', targetType: 'trial_request', targetId: requestId, metadata: {} } }),
    ]);
    return { status: TrialRequestStatus.REJECTED };
  }

  async activate(token: string, input: ActivateTrialDto) {
    const tokenHash = hashToken(token);
    const record = await this.prisma.trialRequest.findUnique({ where: { activationTokenHash: tokenHash } });
    if (!record || record.status !== TrialRequestStatus.APPROVED || !record.activationExpiresAt || record.activationExpiresAt <= new Date()) {
      throw new NotFoundException();
    }
    const passwordHash = await hash(input.password);
    const startedAt = new Date();
    const trialEndsAt = addDays(startedAt, TRIAL_DURATION_DAYS);
    const recoveryEndsAt = addDays(trialEndsAt, TRIAL_RECOVERY_DAYS);
    const organisationId = randomUUID();
    let organisation;
    try {
      organisation = await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT set_config('app.current_organisation_id', ${organisationId}, true)`;
        const claimed = await transaction.trialRequest.updateMany({
          where: {
            id: record.id,
            status: TrialRequestStatus.APPROVED,
            activationTokenHash: tokenHash,
            activationExpiresAt: { gt: startedAt },
          },
          data: { status: TrialRequestStatus.ACTIVATED, activationTokenHash: null },
        });
        if (claimed.count !== 1) throw new NotFoundException();

        const user = await transaction.user.upsert({
          where: { email: record.email },
          update: { passwordHash, emailVerifiedAt: record.emailVerifiedAt },
          create: { email: record.email, passwordHash, emailVerifiedAt: record.emailVerifiedAt },
        });
        const created = await transaction.organisation.create({
          data: {
            id: organisationId,
            name: record.organisationName,
            slug: input.organisationSlug.toLowerCase(),
            type: record.organisationType,
            country: record.country,
            preferredCurrency: record.preferredCurrency,
            status: OrganisationStatus.TRIAL,
            trialStartedAt: startedAt,
            trialEndsAt,
            recoveryEndsAt,
            branches: { create: { name: 'Main Branch' } },
            memberships: { create: { userId: user.id, role: MembershipRole.ORGANISATION_ADMIN } },
          },
        });
        await transaction.user.update({
          where: { id: user.id },
          data: { defaultOrganisationId: created.id },
        });
        await transaction.trialRequest.update({
          where: { id: record.id },
          data: { organisationId: created.id },
        });
        await transaction.auditLog.create({
          data: { organisationId: created.id, actorUserId: user.id, action: 'trial.activated', targetType: 'organisation', targetId: created.id, metadata: { quotas: TRIAL_QUOTAS } },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'WORKSPACE_ADDRESS_UNAVAILABLE', message: 'Choose a different workspace address.' });
      }
      throw error;
    }
    return { organisationId: organisation.id, status: organisation.status, trialStartedAt: startedAt, trialEndsAt, quotas: TRIAL_QUOTAS };
  }

  listPending() {
    return this.prisma.trialRequest.findMany({
      where: { status: { in: [TrialRequestStatus.PENDING_REVIEW, TrialRequestStatus.APPROVED] } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private isLocal() {
    return this.config.get<string>('NODE_ENV') !== 'production';
  }
}
