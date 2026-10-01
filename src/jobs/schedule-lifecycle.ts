import 'dotenv/config';
import { Queue } from 'bullmq';

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
const queue = new Queue('nex4-lifecycle', { connection });

async function schedule() {
  await queue.upsertJobScheduler('hourly-trial-lifecycle', { every: 60 * 60 * 1000 }, { name: 'enforce-trial-lifecycle', data: {} });
  process.stdout.write('Trial lifecycle schedule is ready.\n');
  await queue.close();
}

void schedule();

