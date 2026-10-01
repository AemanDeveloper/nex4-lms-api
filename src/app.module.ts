import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { DemoModule } from './demo/demo.module';
import { DemoReadOnlyGuard } from './demo/demo-read-only.guard';
import { EmailModule } from './email/email.module';
import { HealthController } from './health.controller';
import { LearningModule } from './learning/learning.module';
import { JobsModule } from './jobs/jobs.module';
import { OwnerModule } from './owner/owner.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { TrialModule } from './trial/trial.module';
import { WorkspaceModule } from './workspace/workspace.module';

function validateEnvironment(environment: Record<string, unknown>) {
  const required = [
    'DATABASE_URL',
    'DIRECT_DATABASE_URL',
    'AUTH_JWT_SECRET',
    'DEMO_JWT_SECRET',
    'TRIAL_TOKEN_SECRET',
    'PUBLIC_WEB_URL',
  ];
  for (const key of required) {
    if (!environment[key]) throw new Error(`Missing required environment variable: ${key}`);
  }
  for (const key of ['AUTH_JWT_SECRET', 'DEMO_JWT_SECRET', 'TRIAL_TOKEN_SECRET']) {
    if (String(environment[key]).length < 32) {
      throw new Error(`${key} must contain at least 32 characters`);
    }
  }
  return environment;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    EmailModule,
    AuthModule,
    LearningModule,
    BillingModule,
    JobsModule,
    DemoModule,
    TrialModule,
    OwnerModule,
    StorageModule,
    WorkspaceModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: DemoReadOnlyGuard },
  ],
})
export class AppModule {}
