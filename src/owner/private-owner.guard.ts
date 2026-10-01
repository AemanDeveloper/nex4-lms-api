import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { OwnerClaims, OwnerRequest } from './owner.types';

@Injectable()
export class PrivateOwnerGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<OwnerRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    try {
      if (!token) throw new Error('missing');
      const claims = this.jwt.verify<OwnerClaims>(token, {
        secret: this.config.getOrThrow<string>('AUTH_JWT_SECRET'),
        audience: 'nex4-control-plane',
      });
      if (!claims.isPlatformOwner || !claims.amr?.includes('totp')) throw new Error('invalid');
      const owner = await this.prisma.user.findUnique({ where: { id: claims.sub }, select: { isPlatformOwner: true, mfaEnrolledAt: true } });
      if (!owner?.isPlatformOwner || !owner.mfaEnrolledAt) throw new Error('invalid');
      request.owner = claims;
      return true;
    } catch {
      throw new NotFoundException();
    }
  }
}

