import 'dotenv/config';
import { MembershipRole, OrganisationStatus, OrganisationType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  if (process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Set ALLOW_DEMO_SEED=true only for the isolated local or demo database.');
  const organisation = await prisma.organisation.upsert({
    where: { slug: 'bright-path-academy' },
    update: {},
    create: {
      name: 'Bright Path Academy', slug: 'bright-path-academy', type: OrganisationType.INTERNATIONAL_SCHOOL,
      country: 'MY', preferredCurrency: 'MYR', status: OrganisationStatus.TRIAL,
      trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 14 * 86_400_000), recoveryEndsAt: new Date(Date.now() + 44 * 86_400_000),
      branches: { create: [{ name: 'Riverside Campus' }, { name: 'Garden Campus' }] },
    },
  });
  const people = [
    ['maya.student@example.test', MembershipRole.STUDENT],
    ['hana.guardian@example.test', MembershipRole.GUARDIAN],
    ['daniel.teacher@example.test', MembershipRole.TEACHER],
    ['sarah.admin@example.test', MembershipRole.ORGANISATION_ADMIN],
  ] as const;
  for (const [email, role] of people) {
    const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, emailVerifiedAt: new Date() } });
    await prisma.membership.upsert({
      where: { organisationId_userId_role: { organisationId: organisation.id, userId: user.id, role } },
      update: {}, create: { organisationId: organisation.id, userId: user.id, role },
    });
  }
  const existingCourse = await prisma.course.findFirst({ where: { organisationId: organisation.id, title: 'Everyday Mathematics' } });
  if (!existingCourse) {
    await prisma.course.create({
      data: {
        organisationId: organisation.id, title: 'Everyday Mathematics', description: 'A fictional course used only for the public read-only showcase.', published: true,
        lessons: { create: [{ title: 'Fractions in everyday life', content: { sections: ['Warm-up', 'Practice', 'Reflection'] }, position: 1 }] },
        assignments: { create: [{ title: 'Kitchen fractions activity', points: 20 }] },
      },
    });
  }
  process.stdout.write('Fictional demo data is ready.\n');
}

run().finally(() => prisma.$disconnect());

