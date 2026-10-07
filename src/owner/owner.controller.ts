import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { TrialService } from '../trial/trial.service';
import { PrivateOwnerGuard } from './private-owner.guard';
import type { OwnerRequest } from './owner.types';
import { DeleteOrganisationDto, SuspendOrganisationDto } from './dto/organisation-action.dto';

@ApiExcludeController()
@UseGuards(PrivateOwnerGuard)
@Controller('_control')
export class OwnerController {
  constructor(
    private readonly trials: TrialService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('trial-requests')
  listTrialRequests() {
    return this.trials.listPending();
  }

  @Post('trial-requests/:id/approve')
  approveTrial(@Param('id') id: string, @Req() request: OwnerRequest) {
    return this.trials.approve(id, request.owner.sub);
  }

  @Post('trial-requests/:id/reject')
  rejectTrial(@Param('id') id: string, @Req() request: OwnerRequest) {
    return this.trials.reject(id, request.owner.sub);
  }

  @Post('trial-requests/:id/resend-activation')
  resendTrialActivation(@Param('id') id: string, @Req() request: OwnerRequest) {
    return this.trials.resendActivation(id, request.owner.sub);
  }

  @Get('organisations')
  async listOrganisations() {
    const organisations = await this.prisma.organisation.findMany({
      select: { id: true, name: true, slug: true, type: true, status: true, trialEndsAt: true, recoveryEndsAt: true, subscriptionPlan: true, subscriptionStatus: true, storageUsedBytes: true, _count: { select: { memberships: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return organisations.map((organisation) => {
      const { _count, ...details } = organisation;
      return {
        ...details,
        ...(_count ? { memberCount: _count.memberships } : {}),
        storageUsedBytes: organisation.storageUsedBytes.toString(),
      };
    });
  }

  @Get('organisations/:id')
  async organisationDetail(@Param('id') id: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, type: true, country: true, preferredCurrency: true, status: true, trialStartedAt: true, trialEndsAt: true, recoveryEndsAt: true, subscriptionPlan: true, subscriptionStatus: true, storageUsedBytes: true, createdAt: true },
    });
    if (!organisation) throw new NotFoundException();
    const members = await this.prisma.forOrganisation(id, (transaction) => transaction.membership.findMany({
      where: { organisationId: id },
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, email: true, displayName: true, emailVerifiedAt: true } } },
      orderBy: { createdAt: 'asc' },
    }));
    const roleCounts = members.reduce<Record<string, number>>((counts, member) => {
      counts[member.role] = (counts[member.role] ?? 0) + 1;
      return counts;
    }, {});
    return { ...organisation, storageUsedBytes: organisation.storageUsedBytes.toString(), memberCount: members.length, roleCounts, members };
  }

  @Post('organisations/:id/suspend')
  async suspendOrganisation(@Param('id') id: string, @Body() body: SuspendOrganisationDto, @Req() request: OwnerRequest) {
    const organisation = await this.prisma.organisation.findUnique({ where: { id } });
    if (!organisation) throw new NotFoundException();
    if (['PENDING_DELETION', 'DELETED'].includes(organisation.status)) {
      throw new ConflictException({ code: 'ORGANISATION_NOT_SUSPENDABLE', message: 'This organisation cannot be suspended.' });
    }
    await this.prisma.$transaction([
      this.prisma.organisation.update({ where: { id }, data: { status: 'SUSPENDED' } }),
      this.prisma.auditLog.create({ data: { organisationId: id, actorUserId: request.owner.sub, action: 'organisation.suspended', targetType: 'organisation', targetId: id, metadata: { reason: body.reason?.trim() || null, previousStatus: organisation.status } } }),
    ]);
    return { id, status: 'SUSPENDED' };
  }

  @Post('organisations/:id/restore')
  async restoreOrganisation(@Param('id') id: string, @Req() request: OwnerRequest) {
    const organisation = await this.prisma.organisation.findUnique({ where: { id } });
    if (!organisation) throw new NotFoundException();
    if (!['SUSPENDED', 'PENDING_DELETION'].includes(organisation.status)) {
      throw new ConflictException({ code: 'ORGANISATION_NOT_RESTORABLE', message: 'This organisation does not need restoring.' });
    }
    const status = organisation.subscriptionStatus === 'ACTIVE'
      ? 'ACTIVE'
      : organisation.trialEndsAt && organisation.trialEndsAt > new Date()
        ? 'TRIAL'
        : 'READ_ONLY';
    await this.prisma.$transaction([
      this.prisma.organisation.update({ where: { id }, data: { status, recoveryEndsAt: status === 'TRIAL' ? organisation.recoveryEndsAt : null } }),
      this.prisma.auditLog.create({ data: { organisationId: id, actorUserId: request.owner.sub, action: 'organisation.restored', targetType: 'organisation', targetId: id, metadata: { previousStatus: organisation.status, status } } }),
    ]);
    return { id, status };
  }

  @Delete('organisations/:id')
  async scheduleOrganisationDeletion(@Param('id') id: string, @Body() body: DeleteOrganisationDto, @Req() request: OwnerRequest) {
    const organisation = await this.prisma.organisation.findUnique({ where: { id } });
    if (!organisation) throw new NotFoundException();
    if (body.confirmation !== organisation.slug) {
      throw new BadRequestException({ code: 'CONFIRMATION_MISMATCH', message: `Type ${organisation.slug} exactly to confirm deletion.` });
    }
    if (organisation.status === 'DELETED') throw new ConflictException({ code: 'ORGANISATION_DELETED', message: 'This organisation has already been deleted.' });
    const recoveryEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
    await this.prisma.$transaction([
      this.prisma.organisation.update({ where: { id }, data: { status: 'PENDING_DELETION', recoveryEndsAt } }),
      this.prisma.auditLog.create({ data: { organisationId: id, actorUserId: request.owner.sub, action: 'organisation.deletion_scheduled', targetType: 'organisation', targetId: id, metadata: { recoveryEndsAt: recoveryEndsAt.toISOString(), previousStatus: organisation.status } } }),
    ]);
    return { id, status: 'PENDING_DELETION', recoveryEndsAt };
  }

  @Get('overview')
  async getOverview() {
    const [pendingTrials, organisations, activeSubscriptions, users, auditEvents] = await Promise.all([
      this.prisma.trialRequest.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.organisation.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.organisation.count({ where: { subscriptionStatus: 'ACTIVE' } }),
      this.prisma.user.count({ where: { isPlatformOwner: false } }),
      this.prisma.auditLog.count(),
    ]);
    return { pendingTrials, organisations, activeSubscriptions, users, auditEvents };
  }

  @Get('service-health')
  async getServiceHealth() {
    let database: 'operational' | 'unavailable';
    let jobsAndCache: 'operational' | 'unavailable' | 'not_configured' = 'not_configured';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'operational';
    } catch {
      database = 'unavailable';
    }

    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl) {
      const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 1_500, maxRetriesPerRequest: 0 });
      try {
        await redis.connect();
        jobsAndCache = (await redis.ping()) === 'PONG' ? 'operational' : 'unavailable';
      } catch {
        jobsAndCache = 'unavailable';
      } finally {
        redis.disconnect();
      }
    }

    return {
      status: database === 'operational' && jobsAndCache === 'operational' ? 'ok' : 'degraded',
      api: 'operational',
      database,
      jobsAndCache,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('audit')
  listAudit() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
