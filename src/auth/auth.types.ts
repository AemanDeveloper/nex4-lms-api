import type { MembershipRole } from '@prisma/client';
import type { Request } from 'express';

export type MemberClaims = {
  sub: string;
  aud: 'nex4-app';
  organisationId: string;
  role: MembershipRole;
};

export type MemberRequest = Request & { member: MemberClaims };
