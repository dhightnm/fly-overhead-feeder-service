import fs from 'fs';
import path from 'path';
import pgPromise, { IMain } from 'pg-promise';
import dotenv from 'dotenv';

dotenv.config();

const pgp: IMain = pgPromise();
const db = pgp(process.env.POSTGRES_URL || '');

async function runMigrations(): Promise<void> {
  console.log('Starting database migrations...');
  console.log(`Database URL: ${process.env.POSTGRES_URL?.replace(/:[^:]*@/, ':****@')}`);

  try {
    // Test database connection
    await db.query('SELECT NOW()');
    console.log('✓ Database connection successful');

    // Get all migration files
    const migrationsDir = __dirname;
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found');
      return;
    }

    // Run each migration
    for (const file of files) {
      console.log(`\nRunning migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await db.none(sql);
      console.log(`✓ ${file} completed successfully`);
    }

    console.log('\n✓ All migrations completed successfully');
  } catch (error) {
    const err = error as Error;
    console.error('\n✗ Migration failed:', err.message);
    console.error(error);
    process.exit(1);
  } finally {
    pgp.end();
  }
}

// Run migrations
runMigrations();

