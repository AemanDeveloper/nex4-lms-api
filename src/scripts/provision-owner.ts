import 'dotenv/config';
import { hash } from 'argon2';
import { PrismaClient } from '@prisma/client';

async function run() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_INITIAL_PASSWORD;
  const totpSecret = process.env.OWNER_TOTP_SECRET;
  const databaseUrl = process.env.DATABASE_URL;
  if (!email || !password || !totpSecret || !databaseUrl) {
    throw new Error('OWNER_EMAIL, OWNER_INITIAL_PASSWORD, OWNER_TOTP_SECRET and DATABASE_URL are required.');
  }
  if (password.length < 16) throw new Error('The initial password must contain at least 16 characters.');
  if (!/^[A-Z2-7]+=*$/i.test(totpSecret)) throw new Error('OWNER_TOTP_SECRET must be a base32 secret.');

  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaClient();
  try {
    const existingOwner = await prisma.user.findFirst({ where: { isPlatformOwner: true } });
    if (existingOwner && existingOwner.email !== email) throw new Error('A platform owner is already provisioned.');
    const owner = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: await hash(password), isPlatformOwner: true, mfaEnrolledAt: new Date(), mfaLastUsedStep: null, emailVerifiedAt: new Date() },
      create: { email, passwordHash: await hash(password), isPlatformOwner: true, mfaEnrolledAt: new Date(), mfaLastUsedStep: null, emailVerifiedAt: new Date() },
    });
    await prisma.auditLog.create({ data: { actorUserId: owner.id, action: 'owner.provisioned', targetType: 'user', targetId: owner.id, metadata: { method: 'deployment-command' } } });
    process.stdout.write('Private platform account provisioned.\n');
  } finally {
    await prisma.$disconnect();
  }
}

void run();
