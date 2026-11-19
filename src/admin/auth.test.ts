import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { adminSessions, adminUsers } from '@/db/schema';
import { createAdmin, hashPassword, login, logout, sessionFromToken, verifyPassword, SESSION_DAYS } from './auth';

const NOW = new Date('2026-11-19T10:00:00+09:00');
let db: DB;

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  await createAdmin(db, 'admin@example.com', 'correct horse battery');
});

describe('password hashing', () => {
  it('verifies the right password and rejects others; never stores the password', async () => {
    const h = await hashPassword('s3cret-pass');
    expect(h).not.toContain('s3cret-pass');
    expect(await verifyPassword('s3cret-pass', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
    expect(await verifyPassword('s3cret-pass', 'garbage')).toBe(false);
  });

  it('salts: the same password hashes differently', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('createAdmin rejects short passwords and duplicate emails', async () => {
    await expect(createAdmin(db, 'b@example.com', 'short')).rejects.toThrow(/12/);
    await expect(createAdmin(db, 'ADMIN@example.com', 'another long password')).rejects.toThrow();
    const [u] = await db.select().from(adminUsers);
    expect(u.passwordHash).not.toContain('correct horse');
  });
});

describe('login and sessions', () => {
  it('logs in, returns a token, and stores only its hash', async () => {
    const r = await login(db, 'Admin@Example.com', 'correct horse battery', 'ip1', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [s] = await db.select().from(adminSessions);
    expect(s.tokenHash).not.toBe(r.token);
    expect(JSON.stringify(s)).not.toContain(r.token);
    expect((await sessionFromToken(db, r.token, NOW))?.email).toBe('admin@example.com');
  });

  it('rejects a wrong password with the same error as an unknown email', async () => {
    expect(await login(db, 'admin@example.com', 'nope', 'ip1', NOW)).toEqual({ ok: false, error: 'invalid' });
    expect(await login(db, 'nobody@example.com', 'correct horse battery', 'ip1', NOW)).toEqual({ ok: false, error: 'invalid' });
  });

  it('expires sessions after SESSION_DAYS', async () => {
    const r = await login(db, 'admin@example.com', 'correct horse battery', 'ip1', NOW);
    if (!r.ok) throw new Error();
    const later = new Date(NOW.getTime() + SESSION_DAYS * 86_400_000 + 1000);
    expect(await sessionFromToken(db, r.token, later)).toBeNull();
  });

  it('logout removes the session', async () => {
    const r = await login(db, 'admin@example.com', 'correct horse battery', 'ip1', NOW);
    if (!r.ok) throw new Error();
    await logout(db, r.token);
    expect(await sessionFromToken(db, r.token, NOW)).toBeNull();
  });

  it('locks an IP after 5 failures in 15 minutes, even for the right password, then unlocks', async () => {
    for (let i = 0; i < 5; i++) await login(db, 'admin@example.com', 'bad', 'ip1', NOW);
    expect(await login(db, 'admin@example.com', 'correct horse battery', 'ip1', NOW)).toEqual({ ok: false, error: 'locked' });
    expect((await login(db, 'admin@example.com', 'correct horse battery', 'ip2', NOW)).ok).toBe(true);
    const later = new Date(NOW.getTime() + 16 * 60_000);
    expect((await login(db, 'admin@example.com', 'correct horse battery', 'ip1', later)).ok).toBe(true);
  });

  it('ignores garbage tokens', async () => {
    expect(await sessionFromToken(db, '', NOW)).toBeNull();
    expect(await sessionFromToken(db, 'x'.repeat(64), NOW)).toBeNull();
  });
});
