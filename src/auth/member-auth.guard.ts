import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { MemberClaims, MemberRequest } from './auth.types';

@Injectable()
export class MemberAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<MemberRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    try {
      if (!token) throw new Error('missing');
      const claims = this.jwt.verify<MemberClaims>(token, { secret: this.config.getOrThrow<string>('AUTH_JWT_SECRET'), audience: 'nex4-app' });
      const membership = await this.prisma.forOrganisation(claims.organisationId, (transaction) => transaction.membership.findUnique({
        where: { organisationId_userId_role: { organisationId: claims.organisationId, userId: claims.sub, role: claims.role } },
      }));
      if (!membership) throw new Error('invalid');
      request.member = claims;
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'SESSION_INVALID', message: 'Sign in again to continue.' });
    }
  }
}
