// Note + checklist-item mutation service for the REST API. Notes are
// trip-scoped (soft-deleted, ordered by idx); checklist items are
// note-scoped (ordered by idx, hard-deleted like the web action).

import 'server-only';
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { notes, checklistItems } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { writeAudit } from '@/lib/audit';
import { ServiceError } from './service-error';
import { requireTripAccess } from './access';

const NOTE_KINDS = ['checklist', 'doc'];

export async function listNotes(userId: string, tripId: string) {
  await requireTripAccess(userId, tripId, 'read');
  const noteRows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.tripId, tripId), isNull(notes.deletedAt)))
    .orderBy(asc(notes.idx));
  if (noteRows.length === 0) return [];
  const items = await db
    .select()
    .from(checklistItems)
    .orderBy(asc(checklistItems.idx));
  const byNote = new Map<string, typeof items>();
  for (const it of items) {
    const arr = byNote.get(it.noteId) ?? [];
    arr.push(it);
    byNote.set(it.noteId, arr);
  }
  return noteRows.map((n) => ({ ...n, items: byNote.get(n.id) ?? [] }));
}

export async function createNote(
  userId: string,
  tripId: string,
  body: Record<string, unknown>,
) {
  await requireTripAccess(userId, tripId, 'write');
  const kind = body.kind;
  if (typeof kind !== 'string' || !NOTE_KINDS.includes(kind)) {
    throw new ServiceError('bad_request', '"kind" must be "checklist" or "doc"');
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) throw new ServiceError('bad_request', '"title" is required');
  const bodyText = typeof body.body === 'string' ? body.body : null;

  const [last] = await db
    .select({ idx: notes.idx })
    .from(notes)
    .where(eq(notes.tripId, tripId))
    .orderBy(desc(notes.idx))
    .limit(1);
  const idx = (last?.idx ?? -1) + 1;

  const [row] = await db
    .insert(notes)
    .values({ tripId, idx, kind: kind as 'checklist' | 'doc', title, body: bodyText })
    .returning();
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'note', entityId: row.id });
  return row;
}

async function resolveNote(id: string) {
  const [row] = await db
    .select({ tripId: notes.tripId })
    .from(notes)
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .limit(1);
  if (!row) throw new ServiceError('not_found', 'Note not found');
  return row.tripId;
}

export async function updateNote(
  userId: string,
  id: string,
  body: Record<string, unknown>,
) {
  const tripId = await resolveNote(id);
  await requireTripAccess(userId, tripId, 'write');
  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw new ServiceError('bad_request', '"title" cannot be empty');
    }
    patch.title = body.title.trim();
  }
  if (body.body !== undefined) {
    patch.body = typeof body.body === 'string' ? body.body : null;
  }
  patch.updatedAt = new Date();
  const [row] = await db.update(notes).set(patch).where(eq(notes.id, id)).returning();
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'update', entityType: 'note', entityId: id });
  return row;
}

export async function removeNote(userId: string, id: string) {
  const tripId = await resolveNote(id);
  await requireTripAccess(userId, tripId, 'write');
  await db.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, id));
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'remove', entityType: 'note', entityId: id });
  return { tripId };
}

// ── Checklist items (note-scoped) ────────────────────────────────────────────

async function resolveNoteForItem(noteId: string) {
  const [row] = await db
    .select({ tripId: notes.tripId })
    .from(notes)
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
    .limit(1);
  if (!row) throw new ServiceError('not_found', 'Note not found');
  return row.tripId;
}

async function resolveItem(id: string) {
  const [row] = await db
    .select({ noteId: checklistItems.noteId, idx: checklistItems.idx, tripId: notes.tripId })
    .from(checklistItems)
    .innerJoin(notes, eq(notes.id, checklistItems.noteId))
    .where(eq(checklistItems.id, id))
    .limit(1);
  if (!row) throw new ServiceError('not_found', 'Checklist item not found');
  return row;
}

export async function addChecklistItem(
  userId: string,
  noteId: string,
  body: Record<string, unknown>,
) {
  const tripId = await resolveNoteForItem(noteId);
  await requireTripAccess(userId, tripId, 'write');
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw new ServiceError('bad_request', '"text" is required');
  const [last] = await db
    .select({ idx: checklistItems.idx })
    .from(checklistItems)
    .where(eq(checklistItems.noteId, noteId))
    .orderBy(desc(checklistItems.idx))
    .limit(1);
  const idx = (last?.idx ?? -1) + 1;
  const [row] = await db
    .insert(checklistItems)
    .values({ noteId, idx, text, done: body.done === true })
    .returning();
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'checklist_item', entityId: row.id });
  return row;
}

export async function updateChecklistItem(
  userId: string,
  id: string,
  body: Record<string, unknown>,
) {
  const { tripId } = await resolveItem(id);
  await requireTripAccess(userId, tripId, 'write');
  const patch: Record<string, unknown> = {};
  if (body.text !== undefined) {
    if (typeof body.text !== 'string' || !body.text.trim()) {
      throw new ServiceError('bad_request', '"text" cannot be empty');
    }
    patch.text = body.text.trim();
  }
  if (body.done !== undefined) {
    if (typeof body.done !== 'boolean') {
      throw new ServiceError('bad_request', '"done" must be a boolean');
    }
    patch.done = body.done;
  }
  patch.updatedAt = new Date();
  const [row] = await db
    .update(checklistItems)
    .set(patch)
    .where(eq(checklistItems.id, id))
    .returning();
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'update', entityType: 'checklist_item', entityId: id });
  return row;
}

export async function removeChecklistItem(userId: string, id: string) {
  const { tripId, noteId, idx } = await resolveItem(id);
  await requireTripAccess(userId, tripId, 'write');
  await db.delete(checklistItems).where(eq(checklistItems.id, id));
  // Re-index survivors so idx stays contiguous.
  await db
    .update(checklistItems)
    .set({ idx: sql`${checklistItems.idx} - 1` })
    .where(and(eq(checklistItems.noteId, noteId), gt(checklistItems.idx, idx)));
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'remove', entityType: 'checklist_item', entityId: id });
  return { tripId };
}
