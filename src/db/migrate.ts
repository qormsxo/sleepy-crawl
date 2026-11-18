import 'dotenv/config';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb } from './client';

migrate(getDb(), { migrationsFolder: path.resolve(__dirname, 'migrations') })
  .then(() => {
    console.log('migrate: done');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
