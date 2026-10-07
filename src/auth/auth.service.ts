import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly config: ConfigService) {}

  async createSession(input: CreateSessionDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      select: { id: true, passwordHash: true, defaultOrganisationId: true },
    });
    if (!user?.passwordHash || !(await verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' });
    }

    const organisation = input.organisationSlug
      ? await this.prisma.organisation.findUnique({ where: { slug: input.organisationSlug.toLowerCase() } })
      : user.defaultOrganisationId
        ? await this.prisma.organisation.findUnique({ where: { id: user.defaultOrganisationId } })
        : null;
    if (!organisation || ['SUSPENDED', 'PENDING_DELETION', 'DELETED'].includes(organisation.status)) {
      throw new UnauthorizedException({ code: 'WORKSPACE_UNAVAILABLE', message: 'This workspace is not available. Contact the organisation administrator.' });
    }

    const membership = await this.prisma.forOrganisation(organisation.id, (transaction) => transaction.membership.findFirst({
      where: { organisationId: organisation.id, userId: user.id },
      orderBy: { role: 'desc' },
    }));
    if (!membership) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' });
    const accessToken = this.jwt.sign(
      { sub: user.id, aud: 'nex4-app', organisationId: membership.organisationId, role: membership.role },
      { secret: this.config.getOrThrow<string>('AUTH_JWT_SECRET'), expiresIn: '1h' },
    );
    return { accessToken, expiresInSeconds: 3600, role: membership.role, organisation: { id: organisation.id, name: organisation.name, slug: organisation.slug, status: organisation.status } };
  }
}
