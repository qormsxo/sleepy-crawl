import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  schemaFilter: ['sleepy'],
  migrations: { schema: 'sleepy' },
  // drizzle-kit only needs a URL for push/introspect; generation works offline.
  dbCredentials: { url: (process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres').replace(/[?&]schema=[^&]*/, '') },
});
