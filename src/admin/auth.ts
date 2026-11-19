import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { and, count, eq, gt } from 'drizzle-orm';
import type { DB } from '../db/client';
import { adminLoginAttempts, adminSessions, adminUsers } from '../db/schema';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;
export const MIN_PASSWORD = 12;
export const SESSION_DAYS = 7;
export const LOCK_FAILURES = 5;
export const LOCK_WINDOW_MS = 15 * 60_000;

/** scrypt$N$r$p$salt$hash (Node built-in, no native module). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  try {
    const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createAdmin(db: DB, email: string, password: string): Promise<number> {
  if (Array.from(password).length < MIN_PASSWORD) throw new Error(`password must be at least ${MIN_PASSWORD} characters`);
  const [row] = await db
    .insert(adminUsers)
    .values({ email: email.trim().toLowerCase(), passwordHash: await hashPassword(password) })
    .returning({ id: adminUsers.id });
  return row.id;
}

export type LoginResult = { ok: true; token: string; expiresAt: Date } | { ok: false; error: 'invalid' | 'locked' };

/** Same 'invalid' answer for unknown email and wrong password; locks an IP after repeated failures. */
export async function login(db: DB, email: string, password: string, ipHash: string, now: Date): Promise<LoginResult> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(adminLoginAttempts)
    .where(
      and(
        eq(adminLoginAttempts.ipHash, ipHash),
        eq(adminLoginAttempts.success, false),
        gt(adminLoginAttempts.at, new Date(now.getTime() - LOCK_WINDOW_MS)),
      ),
    );
  if (n >= LOCK_FAILURES) return { ok: false, error: 'locked' };

  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email.trim().toLowerCase()));
  // Hash even for unknown emails so response time doesn't reveal which emails exist.
  const ok = user ? await verifyPassword(password, user.passwordHash) : (await hashPassword(password), false);
  await db.insert(adminLoginAttempts).values({ ipHash, success: ok, at: now });
  if (!ok || !user) return { ok: false, error: 'invalid' };

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insert(adminSessions).values({ tokenHash: sha256(token), adminId: user.id, createdAt: now, expiresAt });
  await db.update(adminUsers).set({ lastLoginAt: now }).where(eq(adminUsers.id, user.id));
  return { ok: true, token, expiresAt };
}

export type Admin = { id: number; email: string };

export async function sessionFromToken(db: DB, token: string, now: Date): Promise<Admin | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db
    .select({ id: adminUsers.id, email: adminUsers.email, expiresAt: adminSessions.expiresAt })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminId))
    .where(eq(adminSessions.tokenHash, sha256(token)));
  if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
  return { id: row.id, email: row.email };
}

export async function logout(db: DB, token: string): Promise<void> {
  if (token) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, sha256(token)));
}
