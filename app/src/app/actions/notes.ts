'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { notes, checklistItems, trips } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';

async function assertNoteOwner(noteId: string, userId: string) {
  const row = await db
    .select({
      tripId: notes.tripId,
      ownerId: trips.ownerId,
      kind: notes.kind,
    })
    .from(notes)
    .innerJoin(trips, eq(trips.id, notes.tripId))
    .where(eq(notes.id, noteId))
    .limit(1);
  const r = row[0];
  if (!r || r.ownerId !== userId) throw new Error('Not found');
  return r;
}

async function assertTripOwner(tripId: string, userId: string) {
  const row = await db
    .select({ ownerId: trips.ownerId })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!row[0] || row[0].ownerId !== userId) throw new Error('Not found');
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
      ownerId: trips.ownerId,
      done: checklistItems.done,
    })
    .from(checklistItems)
    .innerJoin(notes, eq(notes.id, checklistItems.noteId))
    .innerJoin(trips, eq(trips.id, notes.tripId))
    .where(eq(checklistItems.id, itemId))
    .limit(1);
  const r = row[0];
  if (!r || r.ownerId !== session.user.id) throw new Error('Not found');

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
    .select({
      tripId: notes.tripId,
      ownerId: trips.ownerId,
    })
    .from(checklistItems)
    .innerJoin(notes, eq(notes.id, checklistItems.noteId))
    .innerJoin(trips, eq(trips.id, notes.tripId))
    .where(eq(checklistItems.id, itemId))
    .limit(1);
  const r = row[0];
  if (!r || r.ownerId !== session.user.id) throw new Error('Not found');

  await db.delete(checklistItems).where(eq(checklistItems.id, itemId));
  await touchTrip(r.tripId);
  revalidatePath(`/trip/${r.tripId}/notes`);
}

