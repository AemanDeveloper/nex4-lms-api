export const DEMO_PERSPECTIVES = ['student', 'guardian', 'teacher', 'organisation-admin'] as const;
export type DemoPerspective = (typeof DEMO_PERSPECTIVES)[number];

export type DemoClaims = {
  sub: string;
  aud: 'nex4-demo';
  accessMode: 'read-only';
  perspectives: readonly DemoPerspective[];
};
