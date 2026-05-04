'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { notes, checklistItems } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { writeAudit } from '@/lib/audit';

async function assertNoteOwner(noteId: string, userId: string) {
  const row = await db
    .select({
      tripId: notes.tripId,
      kind: notes.kind,
    })
    .from(notes)
    .where(eq(notes.id, noteId))
    .limit(1);
  const r = row[0];
  if (!r) throw new Error('Not found');
  if (!canWrite(await getTripRole(r.tripId, userId))) throw new Error('Forbidden');
  return r;
}

async function assertTripOwner(tripId: string, userId: string) {
  if (!canWrite(await getTripRole(tripId, userId))) throw new Error('Forbidden');
}

export async function addNoteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  const tripId = String(formData.get('tripId') ?? '');
  const kind = String(formData.get('kind') ?? 'checklist') as
    | 'checklist'
    | 'doc';
  const title = String(formData.get('title') ?? '').trim() || 'Untitled';
  await assertTripOwner(tripId, session.user.id);

  const maxRow = await db
    .select({ idx: notes.idx })
    .from(notes)
    .where(eq(notes.tripId, tripId))
    .orderBy(desc(notes.idx))
    .limit(1);
  const nextIdx = (maxRow[0]?.idx ?? -1) + 1;

  const [created] = await db
    .insert(notes)
    .values({ tripId, kind, title, idx: nextIdx, body: null })
    .returning({ id: notes.id });

  await touchTrip(tripId);
  await writeAudit({
    tripId,
    userId: session.user.id,
    action: 'add',
    entityType: 'note',
    entityId: created.id,
    after: { title, kind },
  });
  revalidatePath(`/trip/${tripId}/notes`);
  redirect(`/trip/${tripId}/notes?n=${created.id}`);
}

export async function renameNoteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  const noteId = String(formData.get('noteId') ?? '');
  const title = String(formData.get('title') ?? '').trim() || 'Untitled';
  const r = await assertNoteOwner(noteId, session.user.id);
  await db
    .update(notes)
    .set({ title, updatedAt: new Date() })
    .where(eq(notes.id, noteId));
  await touchTrip(r.tripId);
  revalidatePath(`/trip/${r.tripId}/notes`);
}

export async function updateDocBodyAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  const noteId = String(formData.get('noteId') ?? '');
  const body = String(formData.get('body') ?? '');
  const r = await assertNoteOwner(noteId, session.user.id);
  await db
    .update(notes)
    .set({ body, updatedAt: new Date() })
    .where(eq(notes.id, noteId));
  await touchTrip(r.tripId);
  revalidatePath(`/trip/${r.tripId}/notes`);
}

export async function removeNoteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  const noteId = String(formData.get('noteId') ?? '');
  const r = await assertNoteOwner(noteId, session.user.id);
  await db
    .update(notes)
    .set({ deletedAt: new Date() })
    .where(eq(notes.id, noteId));
  await touchTrip(r.tripId);
  await writeAudit({
    tripId: r.tripId,
    userId: session.user.id,
    action: 'remove',
    entityType: 'note',
    entityId: noteId,
  });
  revalidatePath(`/trip/${r.tripId}/notes`);
  redirect(`/trip/${r.tripId}/notes`);
}

export async function addChecklistItemAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  const noteId = String(formData.get('noteId') ?? '');
  const text = String(formData.get('text') ?? '').trim();
  if (!text) return;
  const r = await assertNoteOwner(noteId, session.user.id);

  const maxRow = await db
    .select({ idx: checklistItems.idx })
    .from(checklistItems)
    .where(eq(checklistItems.noteId, noteId))
    .orderBy(desc(checklistItems.idx))
    .limit(1);
  const nextIdx = (maxRow[0]?.idx ?? -1) + 1;

  await db.insert(checklistItems).values({ noteId, idx: nextIdx, text });
  await touchTrip(r.tripId);
  revalidatePath(`/trip/${r.tripId}/notes`);
}

export async function toggleChecklistItemAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  const itemId = String(formData.get('itemId') ?? '');

  const row = await db
    .select({
      noteId: checklistItems.noteId,
      tripId: notes.tripId,
      done: checklistItems.done,
    })
    .from(checklistItems)
    .innerJoin(notes, eq(notes.id, checklistItems.noteId))
    .where(eq(checklistItems.id, itemId))
    .limit(1);
  const r = row[0];
  if (!r) throw new Error('Not found');
  if (!canWrite(await getTripRole(r.tripId, session.user.id)))
    throw new Error('Forbidden');

  await db
    .update(checklistItems)
    .set({ done: !r.done, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId));
  await touchTrip(r.tripId);
  revalidatePath(`/trip/${r.tripId}/notes`);
}

export async function removeChecklistItemAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  const itemId = String(formData.get('itemId') ?? '');

  const row = await db
    .select({ tripId: notes.tripId })
    .from(checklistItems)
    .innerJoin(notes, eq(notes.id, checklistItems.noteId))
    .where(eq(checklistItems.id, itemId))
    .limit(1);
  const r = row[0];
  if (!r) throw new Error('Not found');
  if (!canWrite(await getTripRole(r.tripId, session.user.id)))
    throw new Error('Forbidden');

  await db.delete(checklistItems).where(eq(checklistItems.id, itemId));
  await touchTrip(r.tripId);
  revalidatePath(`/trip/${r.tripId}/notes`);
}

