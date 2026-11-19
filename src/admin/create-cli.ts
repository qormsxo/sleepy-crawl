import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { getDb } from '../db/client';
import { createAdmin } from './auth';

/**
 * npm run admin:create -- <email>
 * Password: ADMIN_PASSWORD if set, otherwise a random one printed once. Never taken as an
 * argument, so it doesn't end up in shell history.
 */
async function main() {
  const email = process.argv[2];
  if (!email || !email.includes('@')) throw new Error('usage: npm run admin:create -- <email>');
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || randomBytes(15).toString('base64url');
  await createAdmin(getDb(), email, password);
  console.log(`admin created: ${email.toLowerCase()}`);
  if (generated) console.log(`password (shown once, store it now): ${password}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
