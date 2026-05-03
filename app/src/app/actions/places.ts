'use server';

// Place CRUD server actions. Slice 2D ships add + update + remove.
// Reorder lands in slice 2E with the drag/drop work.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { days, places, trips } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';

const KINDS = ['hotel', 'food', 'sight', 'transit'] as const;
type Kind = (typeof KINDS)[number];

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseTags(v: FormDataEntryValue | null): string[] | null {
  if (typeof v !== 'string') return null;
  const tags = v
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return tags.length > 0 ? tags : [];
}

function parseNumber(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseKind(v: FormDataEntryValue | null): Kind {
  if (typeof v !== 'string' || !KINDS.includes(v as Kind)) {
    throw new Error('Invalid kind');
  }
  return v as Kind;
}

// Resolve which trip a day belongs to and confirm the user owns it.
async function ownsDay(
  userId: string,
  dayId: string,
): Promise<{ tripId: string } | null> {
  const row = await db
    .select({ tripId: days.tripId, ownerId: trips.ownerId })
    .from(days)
    .innerJoin(trips, eq(trips.id, days.tripId))
    .where(eq(days.id, dayId))
    .limit(1);
  const r = row[0];
  if (!r || r.ownerId !== userId) return null;
  return { tripId: r.tripId };
}

async function ownsPlace(
  userId: string,
  placeId: string,
): Promise<{ tripId: string; dayId: string; idx: number } | null> {
  const row = await db
    .select({
      placeId: places.id,
      dayId: places.dayId,
      idx: places.idx,
      tripId: days.tripId,
      ownerId: trips.ownerId,
    })
    .from(places)
    .innerJoin(days, eq(days.id, places.dayId))
    .innerJoin(trips, eq(trips.id, days.tripId))
    .where(eq(places.id, placeId))
    .limit(1);
  const r = row[0];
  if (!r || r.ownerId !== userId) return null;
  return { tripId: r.tripId, dayId: r.dayId, idx: r.idx };
}

function readPlaceFields(formData: FormData) {
  return {
    kind: parseKind(formData.get('kind')),
    name: trimOrNull(formData.get('name')) ?? '',
    category: trimOrNull(formData.get('category')),
    rating: parseNumber(formData.get('rating')),
    reviews: parseNumber(formData.get('reviews'))
      ? Math.round(parseNumber(formData.get('reviews'))!)
      : null,
    time: trimOrNull(formData.get('time')),
    duration: trimOrNull(formData.get('duration')),
    price: trimOrNull(formData.get('price')),
    address: trimOrNull(formData.get('address')),
    phone: trimOrNull(formData.get('phone')),
    website: trimOrNull(formData.get('website')),
    hours: trimOrNull(formData.get('hours')),
    tags: parseTags(formData.get('tags')),
    thumb: trimOrNull(formData.get('thumb')),
    note: trimOrNull(formData.get('note')),
  };
}

export async function addPlaceAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const dayId = trimOrNull(formData.get('dayId'));
  if (!dayId) throw new Error('dayId required');

  const owned = await ownsDay(session.user.id, dayId);
  if (!owned) throw new Error('Forbidden');

  const fields = readPlaceFields(formData);
  if (!fields.name) throw new Error('Name is required');

  // Append at end of day.
  const last = await db
    .select({ idx: places.idx })
    .from(places)
    .where(eq(places.dayId, dayId))
    .orderBy(desc(places.idx))
    .limit(1);
  const nextIdx = (last[0]?.idx ?? -1) + 1;

  await db.insert(places).values({ ...fields, dayId, idx: nextIdx });
  await touchTrip(owned.tripId);

  revalidatePath(`/trip/${owned.tripId}`);
  redirect(`/trip/${owned.tripId}`);
}

export async function updatePlaceAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const placeId = trimOrNull(formData.get('placeId'));
  if (!placeId) throw new Error('placeId required');

  const owned = await ownsPlace(session.user.id, placeId);
  if (!owned) throw new Error('Forbidden');

  const fields = readPlaceFields(formData);
  if (!fields.name) throw new Error('Name is required');

  await db
    .update(places)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(places.id, placeId));
  await touchTrip(owned.tripId);

  revalidatePath(`/trip/${owned.tripId}`);
  redirect(`/trip/${owned.tripId}`);
}

export async function removePlaceAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const placeId = trimOrNull(formData.get('placeId'));
  if (!placeId) throw new Error('placeId required');

  const owned = await ownsPlace(session.user.id, placeId);
  if (!owned) throw new Error('Forbidden');

  // Hard-delete (cascade would also drop child rows if any). idx
  // re-indexed below. Soft delete is a future concern — REQUIREMENTS
  // §19 lists undo as 7-day for trips, immediate for items.
  await db.delete(places).where(eq(places.id, placeId));

  await db
    .update(places)
    .set({ idx: sql`${places.idx} - 1` })
    .where(and(eq(places.dayId, owned.dayId), gt(places.idx, owned.idx)));
  await touchTrip(owned.tripId);

  revalidatePath(`/trip/${owned.tripId}`);
  redirect(`/trip/${owned.tripId}`);
}

export async function reorderPlacesAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const dayId = trimOrNull(formData.get('dayId'));
  const idsCsv = trimOrNull(formData.get('placeIds'));
  if (!dayId || !idsCsv) throw new Error('dayId + placeIds required');

  const owned = await ownsDay(session.user.id, dayId);
  if (!owned) throw new Error('Forbidden');

  const newOrder = idsCsv.split(',').map((s) => s.trim()).filter(Boolean);
  if (newOrder.length === 0) return;

  // Two-phase write to dodge the unique (day_id, idx) collision while
  // shuffling — bump every place to a temporary high idx, then rewrite.
  const offset = 1_000_000;
  await db
    .update(places)
    .set({ idx: sql`${places.idx} + ${offset}` })
    .where(eq(places.dayId, dayId));

  for (let i = 0; i < newOrder.length; i++) {
    await db
      .update(places)
      .set({ idx: i, updatedAt: new Date() })
      .where(and(eq(places.id, newOrder[i]), eq(places.dayId, dayId)));
  }

  await touchTrip(owned.tripId);
  revalidatePath(`/trip/${owned.tripId}`);
}

export async function optimizeRouteAction(formData: FormData) {
  // Stub — Phase 4 ships the real Directions-API distance matrix and
  // travelling-salesman heuristic. For now the action simply touches
  // the trip and redirects, so the UI affordance is wireable.
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const dayId = trimOrNull(formData.get('dayId'));
  if (!dayId) throw new Error('dayId required');

  const owned = await ownsDay(session.user.id, dayId);
  if (!owned) throw new Error('Forbidden');

  // No-op for now. Phase 4: compute new order, persist, recompute
  // segments.
  await touchTrip(owned.tripId);

  revalidatePath(`/trip/${owned.tripId}`);
  redirect(`/trip/${owned.tripId}`);
}
