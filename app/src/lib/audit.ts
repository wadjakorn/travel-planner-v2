// Audit log writer. Phase 10A. Best-effort — failures swallowed so a
// log-write outage never breaks user mutations. Actions call this from
// inside their existing transaction-of-actions; not atomic with the
// mutation itself, but acceptable for v1 per ROADMAP.

import 'server-only';
import { db } from '@/db';
import { auditLog } from '@/db/schema';

export type AuditAction = 'add' | 'update' | 'remove' | 'reorder';
export type AuditEntity =
  | 'place'
  | 'day'
  | 'hotel'
  | 'transport'
  | 'expense'
  | 'note'
  | 'checklist_item'
  | 'invite'
  | 'trip'
  | 'segment';

export async function writeAudit(args: {
  tripId: string;
  userId: string | null;
  action: AuditAction;
  entityType: AuditEntity;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      tripId: args.tripId,
      userId: args.userId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId ?? null,
      before: (args.before as object | null) ?? null,
      after: (args.after as object | null) ?? null,
    });
  } catch {
    // Swallow — log writer is non-critical.
  }
}
