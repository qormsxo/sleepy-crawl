import 'dotenv/config';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb } from './client';
import { DB_SCHEMA } from './schema';

// Migration bookkeeping also stays in this app's schema (the database is shared).
migrate(getDb(), { migrationsFolder: path.resolve(__dirname, 'migrations'), migrationsSchema: DB_SCHEMA })
  .then(() => {
    console.log('migrate: done');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
