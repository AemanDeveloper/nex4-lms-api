import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { DemoReadOnlyGuard } from '../src/demo/demo-read-only.guard';
import { DEMO_PERSPECTIVES } from '../src/demo/demo.types';

const secret = 'demo-secret-with-more-than-thirty-two-characters';

function context(method: string, originalUrl: string, authorization?: string) {
  const request = { method, originalUrl, headers: authorization ? { authorization } : {} };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('public showcase boundary', () => {
  const config = { getOrThrow: () => secret } as unknown as ConfigService;
  const guard = new DemoReadOnlyGuard(config);

  it('contains only public product perspectives', () => {
    expect(DEMO_PERSPECTIVES).toEqual(['student', 'guardian', 'teacher', 'organisation-admin']);
  });

  it('allows creating a new anonymous demo session', () => {
    expect(guard.canActivate(context('POST', '/api/v1/demo/session'))).toBe(true);
  });

  it('rejects every demo mutation with DEMO_READ_ONLY', () => {
    try {
      guard.canActivate(context('POST', '/api/v1/demo/actions'));
      throw new Error('Expected demo mutation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'DEMO_READ_ONLY' });
    }
  });

  it('does not let a demo token mutate a public trial endpoint', () => {
    const token = new JwtService().sign(
      { sub: 'demo', aud: 'nex4-demo', accessMode: 'read-only', perspectives: DEMO_PERSPECTIVES },
      { secret, expiresIn: '1h' },
    );
    expect(() => guard.canActivate(context('POST', '/api/v1/trials', `Bearer ${token}`))).toThrow(ForbiddenException);
  });
});
