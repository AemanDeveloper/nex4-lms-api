import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

@Injectable()
export class DemoReadOnlyGuard implements CanActivate {
  private readonly jwt = new JwtService();

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;

    const path = request.originalUrl.split('?')[0];
    const bearer = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    let hasDemoToken = false;
    if (bearer) {
      try {
        const claims = this.jwt.verify<{ aud?: string }>(bearer, {
          secret: this.config.getOrThrow<string>('DEMO_JWT_SECRET'),
        });
        hasDemoToken = claims.aud === 'nex4-demo';
      } catch {
        hasDemoToken = false;
      }
    }

    if (request.method === 'POST' && path.endsWith('/api/v1/demo/session') && !hasDemoToken) return true;
    if (path.includes('/api/v1/demo/') || hasDemoToken) {
      throw new ForbiddenException({
        code: 'DEMO_READ_ONLY',
        message: 'The public showcase does not allow changes. Request a trial to use interactive features.',
      });
    }
    if (request.method === 'POST' && path.endsWith('/api/v1/trials')) return true;
    if (request.method === 'POST' && path.includes('/api/v1/trials/verify/')) return true;
    if (request.method === 'POST' && path.includes('/api/v1/trials/activate/')) return true;
    return true;
  }
}
