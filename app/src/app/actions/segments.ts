'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { days, places, segments } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { writeAudit } from '@/lib/audit';

const MODES = ['drive', 'walk', 'transit'] as const;
type Mode = (typeof MODES)[number];

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseMode(v: FormDataEntryValue | null): Mode {
  if (typeof v !== 'string' || !MODES.includes(v as Mode)) {
    throw new Error('Invalid mode');
  }
  return v as Mode;
}

async function ownsDay(
  userId: string,
  dayId: string,
): Promise<{ tripId: string } | null> {
  const row = await db
    .select({ tripId: days.tripId })
    .from(days)
    .where(eq(days.id, dayId))
    .limit(1);
  const r = row[0];
  if (!r) return null;
  if (!canWrite(await getTripRole(r.tripId, userId))) return null;
  return { tripId: r.tripId };
}

async function upsertSegment(
  dayId: string,
  idx: number,
  mode: Mode,
): Promise<void> {
  const existing = await db
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.dayId, dayId), eq(segments.idx, idx)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(segments)
      .set({ mode })
      .where(eq(segments.id, existing[0].id));
  } else {
    await db.insert(segments).values({
      dayId,
      idx,
      mode,
      distance: '',
      time: '',
    });
  }
}

export async function setSegmentModeAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const dayId = trimOrNull(formData.get('dayId'));
  const idxRaw = formData.get('idx');
  if (!dayId || typeof idxRaw !== 'string') {
    throw new Error('dayId + idx required');
  }
  const idx = Number(idxRaw);
  if (!Number.isFinite(idx) || idx < 0) throw new Error('Invalid idx');
  const mode = parseMode(formData.get('mode'));

  const owned = await ownsDay(session.user.id, dayId);
  if (!owned) throw new Error('Forbidden');

  await upsertSegment(dayId, idx, mode);
  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId: session.user.id,
    action: 'update',
    entityType: 'segment',
    after: { dayId, idx, mode },
  });
  revalidatePath(`/trip/${owned.tripId}`);
}

export async function persistSegmentLegAction(formData: FormData) {
  // Client calls once per (lat,lng,mode) signature after fetching from
  // Google Directions. Caches distance + time strings.
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const dayId = trimOrNull(formData.get('dayId'));
  const idxRaw = formData.get('idx');
  const distance = trimOrNull(formData.get('distance')) ?? '';
  const time = trimOrNull(formData.get('time')) ?? '';
  if (!dayId || typeof idxRaw !== 'string') {
    throw new Error('dayId + idx required');
  }
  const idx = Number(idxRaw);
  if (!Number.isFinite(idx) || idx < 0) throw new Error('Invalid idx');
  const mode = parseMode(formData.get('mode'));

  const owned = await ownsDay(session.user.id, dayId);
  if (!owned) throw new Error('Forbidden');

  const existing = await db
    .select({ id: segments.id, distance: segments.distance, time: segments.time, mode: segments.mode })
    .from(segments)
    .where(and(eq(segments.dayId, dayId), eq(segments.idx, idx)))
    .limit(1);
  if (existing[0]) {
    if (
      existing[0].distance === distance &&
      existing[0].time === time &&
      existing[0].mode === mode
    ) {
      return; // no-op
    }
    await db
      .update(segments)
      .set({ distance, time, mode })
      .where(eq(segments.id, existing[0].id));
  } else {
    await db.insert(segments).values({ dayId, idx, mode, distance, time });
  }
  await touchTrip(owned.tripId);
}

export async function setDayDefaultModeAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const dayId = trimOrNull(formData.get('dayId'));
  if (!dayId) throw new Error('dayId required');
  const rawMode = formData.get('mode');
  const isMixed = typeof rawMode === 'string' && rawMode === 'mixed';
  const mode: Mode | null = isMixed ? null : parseMode(rawMode);

  const owned = await ownsDay(session.user.id, dayId);
  if (!owned) throw new Error('Forbidden');

  await db.update(days).set({ defaultMode: mode }).where(eq(days.id, dayId));

  let segCount = 0;
  if (mode) {
    // Hard-overwrite every segment in the day to the new mode.
    const placesInDay = await db
      .select({ idx: places.idx })
      .from(places)
      .where(eq(places.dayId, dayId))
      .orderBy(asc(places.idx));
    segCount = Math.max(0, placesInDay.length - 1);
    for (let i = 0; i < segCount; i++) {
      await upsertSegment(dayId, i, mode);
    }
  }

  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId: session.user.id,
    action: 'update',
    entityType: 'day',
    entityId: dayId,
    after: { defaultMode: mode, overwroteSegments: segCount },
  });
  revalidatePath(`/trip/${owned.tripId}`);
}
