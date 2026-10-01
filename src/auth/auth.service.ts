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
    const organisation = await this.prisma.organisation.findUnique({ where: { slug: input.organisationSlug.toLowerCase() } });
    if (!organisation) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'The email, password or organisation is incorrect.' });
    const user = await this.prisma.forOrganisation(organisation.id, (transaction) => transaction.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      include: { memberships: { where: { organisationId: organisation.id }, include: { organisation: true } } },
    }));
    const membership = user?.memberships[0];
    if (!user?.passwordHash || !membership || !(await verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'The email, password or organisation is incorrect.' });
    }
    const accessToken = this.jwt.sign(
      { sub: user.id, aud: 'nex4-app', organisationId: membership.organisationId, role: membership.role },
      { secret: this.config.getOrThrow<string>('AUTH_JWT_SECRET'), expiresIn: '1h' },
    );
    return { accessToken, expiresInSeconds: 3600, role: membership.role, organisation: { id: membership.organisation.id, name: membership.organisation.name, slug: membership.organisation.slug, status: membership.organisation.status } };
  }
}
