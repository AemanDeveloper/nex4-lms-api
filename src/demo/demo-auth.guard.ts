import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { DemoClaims } from './demo.types';

export type DemoRequest = Request & { demo: DemoClaims };

@Injectable()
export class DemoAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<DemoRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException({ code: 'DEMO_SESSION_REQUIRED', message: 'Start a demo session first.' });
    try {
      const claims = this.jwt.verify<DemoClaims>(token, {
        secret: this.config.getOrThrow<string>('DEMO_JWT_SECRET'),
        audience: 'nex4-demo',
      });
      request.demo = claims;
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'DEMO_SESSION_EXPIRED', message: 'The demo session has expired.' });
    }
  }
}

