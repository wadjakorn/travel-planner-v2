import { eq, asc, isNull, and, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { notes, checklistItems, trips } from '@/db/schema';

export type ChecklistItemRow = {
  id: string;
  idx: number;
  text: string;
  done: boolean;
};

export type NoteRow = {
  id: string;
  idx: number;
  kind: 'checklist' | 'doc';
  title: string;
  body: string | null;
  updatedAt: Date;
  items: ChecklistItemRow[];
};

export async function loadNotesForTrip(
  tripId: string,
  ownerId: string,
): Promise<NoteRow[] | null> {
  const tripRow = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.ownerId, ownerId)))
    .limit(1);
  if (!tripRow[0]) return null;

  const noteRows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.tripId, tripId), isNull(notes.deletedAt)))
    .orderBy(asc(notes.idx));

  if (noteRows.length === 0) return [];

  const noteIds = noteRows.map((n) => n.id);
  const items = await db
    .select()
    .from(checklistItems)
    .where(inArray(checklistItems.noteId, noteIds))
    .orderBy(asc(checklistItems.idx));

  const byNote = new Map<string, ChecklistItemRow[]>();
  for (const it of items) {
    const arr = byNote.get(it.noteId) ?? [];
    arr.push({ id: it.id, idx: it.idx, text: it.text, done: it.done });
    byNote.set(it.noteId, arr);
  }

  return noteRows.map((n) => ({
    id: n.id,
    idx: n.idx,
    kind: n.kind as 'checklist' | 'doc',
    title: n.title,
    body: n.body,
    updatedAt: n.updatedAt,
    items: byNote.get(n.id) ?? [],
  }));
}

