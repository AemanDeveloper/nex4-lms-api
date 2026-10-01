import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { TrialService } from '../trial/trial.service';
import { PrivateOwnerGuard } from './private-owner.guard';
import type { OwnerRequest } from './owner.types';

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
      select: { id: true, name: true, type: true, status: true, trialEndsAt: true, subscriptionPlan: true, subscriptionStatus: true, storageUsedBytes: true },
      orderBy: { createdAt: 'desc' },
    });
    return organisations.map((organisation) => ({
      ...organisation,
      storageUsedBytes: organisation.storageUsedBytes.toString(),
    }));
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
