import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { OrganisationStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { MemberRequest } from './auth.types';

@Injectable()
export class OrganisationWriteGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<MemberRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const organisation = await this.prisma.organisation.findUnique({ where: { id: request.member.organisationId }, select: { status: true, subscriptionStatus: true } });
    const lockedStatuses = new Set<OrganisationStatus>([
      OrganisationStatus.READ_ONLY,
      OrganisationStatus.SUSPENDED,
      OrganisationStatus.PENDING_DELETION,
      OrganisationStatus.DELETED,
    ]);
    if (!organisation || lockedStatuses.has(organisation.status)) {
      throw new ForbiddenException({ code: 'WORKSPACE_READ_ONLY', message: 'This workspace is read-only. An organisation administrator can restore access from billing.' });
    }
    if (organisation.status !== OrganisationStatus.TRIAL && organisation.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
      throw new ForbiddenException({ code: 'WORKSPACE_READ_ONLY', message: 'An active subscription is required for changes.' });
    }
    return true;
  }
}
