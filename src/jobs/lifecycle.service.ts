import { Injectable } from '@nestjs/common';
import { OrganisationStatus, SubscriptionStatus, TrialRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async run(now = new Date()) {
    const expiredActivationLinks = await this.prisma.trialRequest.updateMany({
      where: { status: TrialRequestStatus.APPROVED, activationExpiresAt: { lte: now } },
      data: { status: TrialRequestStatus.EXPIRED, activationTokenHash: null },
    });

    const expiring = await this.prisma.organisation.findMany({
      where: { status: OrganisationStatus.TRIAL, trialEndsAt: { lte: now }, subscriptionStatus: { not: SubscriptionStatus.ACTIVE } },
      select: { id: true },
    });
    for (const organisation of expiring) {
      await this.prisma.$transaction([
        this.prisma.organisation.update({ where: { id: organisation.id }, data: { status: OrganisationStatus.READ_ONLY } }),
        this.prisma.auditLog.create({ data: { organisationId: organisation.id, action: 'trial.expired', targetType: 'organisation', targetId: organisation.id, metadata: { enforcedAt: now.toISOString() } } }),
      ]);
    }

    const deletable = await this.prisma.organisation.findMany({
      where: { status: { in: [OrganisationStatus.READ_ONLY, OrganisationStatus.PENDING_DELETION] }, recoveryEndsAt: { lte: now }, subscriptionStatus: { not: SubscriptionStatus.ACTIVE } },
      select: { id: true },
    });
    for (const organisation of deletable) {
      await this.prisma.$transaction([
        this.prisma.auditLog.create({ data: { action: 'organisation.retention_expired', targetType: 'organisation', targetId: organisation.id, metadata: { deletedAt: now.toISOString() } } }),
        this.prisma.organisation.delete({ where: { id: organisation.id } }),
      ]);
    }
    return { activationLinksExpired: expiredActivationLinks.count, locked: expiring.length, deleted: deletable.length };
  }
}
