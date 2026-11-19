import type { DB } from '../db/client';
import { adminAuditLog } from '../db/schema';

/** Every admin change is recorded: who, what, and a before/after summary. */
export async function audit(
  db: DB,
  adminId: number,
  action: string,
  target: string,
  detail: Record<string, unknown>,
  at: Date = new Date(),
): Promise<void> {
  await db.insert(adminAuditLog).values({ adminId, action, target, detail, at });
}
