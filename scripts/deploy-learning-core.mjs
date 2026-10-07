import { readFile } from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to deploy the Learning Core schema.');
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const { rows } = await client.query(
    "select to_regclass('public.invitations') is not null as installed",
  );

  if (rows[0]?.installed) {
    console.log('Learning Core schema is already installed.');
  } else {
    const migration = await readFile(
      new URL(
        '../prisma/migrations/202610060001_learning_core/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );

    await client.query('BEGIN');
    try {
      await client.query(migration);
      await client.query('COMMIT');
      console.log('Learning Core schema installed successfully.');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
