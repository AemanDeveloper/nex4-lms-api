import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { PrivateOwnerGuard } from '../src/owner/private-owner.guard';
import { matchTotpCounter, verifyTotp } from '../src/owner/totp';

const secret = 'application-secret-with-more-than-thirty-two-characters';

function context(authorization?: string) {
  const request = { headers: authorization ? { authorization } : {} };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('private control plane', () => {
  const jwt = new JwtService();
  const config = { getOrThrow: () => secret } as unknown as ConfigService;

  it('returns not found when no private account session is supplied', async () => {
    const prisma = { user: { findUnique: vi.fn() } } as unknown as PrismaService;
    const guard = new PrivateOwnerGuard(jwt, config, prisma);
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns not found when MFA is absent from the session', async () => {
    const token = jwt.sign({ sub: 'owner-id', aud: 'nex4-control-plane', isPlatformOwner: true, amr: ['password'] }, { secret });
    const prisma = { user: { findUnique: vi.fn() } } as unknown as PrismaService;
    const guard = new PrivateOwnerGuard(jwt, config, prisma);
    await expect(guard.canActivate(context(`Bearer ${token}`))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates a standards-based six-digit authenticator code', () => {
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59_000)).toBe(true);
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '000000', 59_000)).toBe(false);
  });

  it('returns the accepted time step so a code cannot be reused', () => {
    expect(matchTotpCounter('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59_000)).toBe(1);
  });
});
