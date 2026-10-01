import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { AppModule } from './app.module';
import { LifecycleService } from './jobs/lifecycle.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const lifecycle = app.get(LifecycleService);
  const worker = new Worker('nex4-lifecycle', async (job) => {
    if (job.name !== 'enforce-trial-lifecycle') return;
    return lifecycle.run();
  }, { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' }, concurrency: 1 });
  const shutdown = async () => { await worker.close(); await app.close(); };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void bootstrap();

