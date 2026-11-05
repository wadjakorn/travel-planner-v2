'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/with-trip-auth';
import { db } from '@/db';
import { notes, checklistItems } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { canWrite, getTripRole } from '@/lib/trip-access';
import {
  addChecklistItem,
  createNote,
  removeChecklistItem,
  removeNote,
  reorderChecklistItems,
  updateNote,
} from '@/lib/services/note-service';

// Note-level writes delegate to note-service (shared with the REST API).
// Checklist-item ops (add/toggle/reorder/remove) stay inline: the web keeps
// its lighter semantics (no per-toggle audit, no re-index on delete) and
// toggle/reorder have no API counterpart, so there is no faithful shared
// primitive to route through.
export async function addNoteAction(formData: FormData) {
  const userId = await requireUserId();
  const tripId = String(formData.get('tripId') ?? '');
  const kind = String(formData.get('kind') ?? 'checklist');
  const title = String(formData.get('title') ?? '').trim() || 'Untitled';

  const note = await createNote(userId, tripId, { kind, title, body: null });

  revalidatePath(`/trip/${tripId}/notes`);
  redirect(`/trip/${tripId}/notes?n=${note.id}`);
}

export async function renameNoteAction(formData: FormData) {
  const userId = await requireUserId();
  const noteId = String(formData.get('noteId') ?? '');
  const title = String(formData.get('title') ?? '').trim() || 'Untitled';

  const note = await updateNote(userId, noteId, { title });

  revalidatePath(`/trip/${note.tripId}/notes`);
}

export async function updateDocBodyAction(formData: FormData) {
  const userId = await requireUserId();
  const noteId = String(formData.get('noteId') ?? '');
  const body = String(formData.get('body') ?? '');

  const note = await updateNote(userId, noteId, { body });

  revalidatePath(`/trip/${note.tripId}/notes`);
}

export async function removeNoteAction(formData: FormData) {
  const userId = await requireUserId();
  const noteId = String(formData.get('noteId') ?? '');

  const { tripId } = await removeNote(userId, noteId);

  revalidatePath(`/trip/${tripId}/notes`);
  redirect(`/trip/${tripId}/notes`);
}

export async function addChecklistItemAction(formData: FormData) {
  const userId = await requireUserId();
  const noteId = String(formData.get('noteId') ?? '');
  const text = String(formData.get('text') ?? '').trim();
  if (!text) return;
  // Canonical service ([API-CHK]): audit row + same rules as the API.
  await addChecklistItem(userId, noteId, { text });
  const [n] = await db.select({ tripId: notes.tripId }).from(notes).where(eq(notes.id, noteId)).limit(1);
  if (n) revalidatePath(`/trip/${n.tripId}/notes`);
}

export async function toggleChecklistItemAction(formData: FormData) {
  const userId = await requireUserId();
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
  if (!canWrite(await getTripRole(r.tripId, userId)))
    throw new Error('Forbidden');

  await db
    .update(checklistItems)
    .set({ done: !r.done, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId));
  await touchTrip(r.tripId);
  revalidatePath(`/trip/${r.tripId}/notes`);
}

export async function reorderChecklistItemsAction(formData: FormData) {
  const userId = await requireUserId();
  const noteId = String(formData.get('noteId') ?? '');
  const idsCsv = String(formData.get('itemIds') ?? '');
  if (!noteId || !idsCsv) throw new Error('noteId + itemIds required');
  const ids = idsCsv.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return;
  // [API-CHK]: the service scopes every id to this note (the inline version
  // updated any item id it was given) and keeps idx contiguous.
  const { tripId } = await reorderChecklistItems(userId, noteId, ids);
  revalidatePath(`/trip/${tripId}/notes`);
}

export async function removeChecklistItemAction(formData: FormData) {
  const userId = await requireUserId();
  const itemId = String(formData.get('itemId') ?? '');
  // [API-CHK]: re-indexes survivors + audit, like DELETE /items/:id.
  const { tripId } = await removeChecklistItem(userId, itemId);
  revalidatePath(`/trip/${tripId}/notes`);
}
