'use server';

// Place CRUD server actions. Slice 2D ships add + update + remove.
// Reorder lands in slice 2E with the drag/drop work.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { days, places, segments } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { writeAudit } from '@/lib/audit';

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

// Resolve which trip a day belongs to and confirm the user can write.
async function ownsDay(
  userId: string,
  dayId: string,
): Promise<{ tripId: string; defaultMode: 'drive' | 'walk' | 'transit' | null } | null> {
  const row = await db
    .select({ tripId: days.tripId, defaultMode: days.defaultMode })
    .from(days)
    .where(eq(days.id, dayId))
    .limit(1);
  const r = row[0];
  if (!r) return null;
  if (!canWrite(await getTripRole(r.tripId, userId))) return null;
  return { tripId: r.tripId, defaultMode: r.defaultMode };
}

// When a place is appended after another, ensure a segment row exists
// at the previous-place idx. distance/time are placeholders — Map's
// Directions client fills them via fallback logic; Phase 4D will persist
// real values server-side.
async function ensureSegmentForAppendedPlace(
  dayId: string,
  prevIdx: number,
  defaultMode: 'drive' | 'walk' | 'transit' | null,
): Promise<void> {
  if (prevIdx < 0) return;
  const existing = await db
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.dayId, dayId), eq(segments.idx, prevIdx)))
    .limit(1);
  if (existing[0]) return;
  await db.insert(segments).values({
    dayId,
    idx: prevIdx,
    mode: defaultMode ?? 'drive',
    distance: '',
    time: '',
  });
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
    })
    .from(places)
    .innerJoin(days, eq(days.id, places.dayId))
    .where(eq(places.id, placeId))
    .limit(1);
  const r = row[0];
  if (!r) return null;
  if (!canWrite(await getTripRole(r.tripId, userId))) return null;
  return { tripId: r.tripId, dayId: r.dayId, idx: r.idx };
}

function readPlaceFields(formData: FormData) {
  // Visible address wins; PlaceAutocomplete's `autoAddress` fills in
  // when the user didn't type one manually.
  const visibleAddress = trimOrNull(formData.get('address'));
  const autoAddress = trimOrNull(formData.get('autoAddress'));
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
    address: visibleAddress ?? autoAddress,
    phone: trimOrNull(formData.get('phone')),
    website: trimOrNull(formData.get('website')),
    hours: trimOrNull(formData.get('hours')),
    tags: parseTags(formData.get('tags')),
    thumb: trimOrNull(formData.get('thumb')),
    note: trimOrNull(formData.get('note')),
    lat: parseNumber(formData.get('lat')),
    lng: parseNumber(formData.get('lng')),
    placeIdExternal: trimOrNull(formData.get('placeIdExternal')),
  };
}

export async function addPlaceInlineAction(formData: FormData) {
  // Same as addPlaceAction but no redirect — used by inline picker so
  // current ?day=N query param survives.
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const dayId = trimOrNull(formData.get('dayId'));
  if (!dayId) throw new Error('dayId required');

  const owned = await ownsDay(session.user.id, dayId);
  if (!owned) throw new Error('Forbidden');

  const fields = readPlaceFields(formData);
  if (!fields.name) throw new Error('Name is required');

  const last = await db
    .select({ idx: places.idx })
    .from(places)
    .where(eq(places.dayId, dayId))
    .orderBy(desc(places.idx))
    .limit(1);
  const nextIdx = (last[0]?.idx ?? -1) + 1;

  const [created] = await db
    .insert(places)
    .values({ ...fields, dayId, idx: nextIdx })
    .returning({ id: places.id });
  await ensureSegmentForAppendedPlace(dayId, nextIdx - 1, owned.defaultMode);
  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId: session.user.id,
    action: 'add',
    entityType: 'place',
    entityId: created.id,
    after: { name: fields.name, kind: fields.kind },
  });

  revalidatePath(`/trip/${owned.tripId}`);
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

  const [created] = await db
    .insert(places)
    .values({ ...fields, dayId, idx: nextIdx })
    .returning({ id: places.id });
  await ensureSegmentForAppendedPlace(dayId, nextIdx - 1, owned.defaultMode);
  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId: session.user.id,
    action: 'add',
    entityType: 'place',
    entityId: created.id,
    after: { name: fields.name, kind: fields.kind },
  });

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
  await writeAudit({
    tripId: owned.tripId,
    userId: session.user.id,
    action: 'update',
    entityType: 'place',
    entityId: placeId,
    after: { name: fields.name },
  });

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

  // Drop the segment that originated from this place (idx == owned.idx),
  // then shift any segments at higher idx down by 1 to stay aligned with
  // the new place ordering.
  await db
    .delete(segments)
    .where(and(eq(segments.dayId, owned.dayId), eq(segments.idx, owned.idx)));
  await db
    .update(segments)
    .set({ idx: sql`${segments.idx} - 1` })
    .where(and(eq(segments.dayId, owned.dayId), gt(segments.idx, owned.idx)));

  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId: session.user.id,
    action: 'remove',
    entityType: 'place',
    entityId: placeId,
  });

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
  await writeAudit({
    tripId: owned.tripId,
    userId: session.user.id,
    action: 'reorder',
    entityType: 'place',
    after: { dayId, order: newOrder },
  });
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
