import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

describe('application module graph', () => {
  it('resolves every controller and guard dependency', async () => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://nex4_app:local@localhost:5432/nex4_lms',
      DIRECT_DATABASE_URL: 'postgresql://nex4_migrator:local@localhost:5432/nex4_lms',
      AUTH_JWT_SECRET: 'test-auth-secret-with-at-least-thirty-two-characters',
      DEMO_JWT_SECRET: 'test-demo-secret-with-at-least-thirty-two-characters',
      TRIAL_TOKEN_SECRET: 'test-trial-secret-with-at-least-thirty-two-characters',
      PUBLIC_WEB_URL: 'http://localhost:3000',
    });

    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(module).toBeDefined();
    await module.close();
  }, 15_000);
});
