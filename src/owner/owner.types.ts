import type { Request } from 'express';

export type OwnerClaims = {
  sub: string;
  aud: 'nex4-control-plane';
  isPlatformOwner: true;
  amr: string[];
};

export type OwnerRequest = Request & { owner: OwnerClaims };

