import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { OwnerSessionDto } from './dto/owner-session.dto';
import { verifyTotp } from './totp';

@Injectable()
export class OwnerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async createSession(input: OwnerSessionDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    const secret = this.config.get<string>('OWNER_TOTP_SECRET');
    const valid = Boolean(
      user?.isPlatformOwner &&
        user.mfaEnrolledAt &&
        user.passwordHash &&
        secret &&
        (await verify(user.passwordHash, input.password)) &&
        verifyTotp(secret, input.totpCode),
    );
    if (!valid || !user) throw new NotFoundException();

    await this.prisma.auditLog.create({
      data: { actorUserId: user.id, action: 'owner.session.created', targetType: 'owner_session', ipAddress, userAgent, metadata: { mfa: true } },
    });
    return {
      accessToken: this.jwt.sign(
        { sub: user.id, aud: 'nex4-control-plane', isPlatformOwner: true, amr: ['password', 'totp'] },
        { secret: this.config.getOrThrow<string>('AUTH_JWT_SECRET'), expiresIn: '15m' },
      ),
      expiresInSeconds: 900,
    };
  }
}

