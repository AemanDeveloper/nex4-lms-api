import { readFile } from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to deploy the Learning Core schema.');
}

const client = new pg.Client({ connectionString: databaseUrl });

async function applyMigration(relativePath, installedQuery, label) {
  const { rows } = await client.query(installedQuery);
  if (rows[0]?.installed) {
    console.log(`${label} is already installed.`);
    return;
  }

  const migration = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(migration);
    await client.query('COMMIT');
    console.log(`${label} installed successfully.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

try {
  await client.connect();
  await applyMigration(
    '../prisma/migrations/202610060001_learning_core/migration.sql',
    "select to_regclass('public.invitations') is not null as installed",
    'Learning Core schema',
  );
  await applyMigration(
    '../prisma/migrations/202610070001_profile_management/migration.sql',
    "select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'avatarFileId') as installed",
    'Profile schema',
  );
} finally {
  await client.end();
}
