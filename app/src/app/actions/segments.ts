'use server';

// Segment / travel-mode server actions — thin wrappers over
// segment-service. FormData parsing + mode validation live here.

import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/with-trip-auth';
import { trimOrNull } from '@/lib/form-parsers';
import { type SegmentMode } from '@/lib/services/access';
import {
  setSegmentMode,
  setHotelLegMode,
  setDayDefaultMode,
} from '@/lib/services/segment-service';

const MODES = ['drive', 'walk', 'transit'] as const;

function parseMode(v: FormDataEntryValue | null): SegmentMode {
  if (typeof v !== 'string' || !MODES.includes(v as SegmentMode)) {
    throw new Error('Invalid mode');
  }
  return v as SegmentMode;
}

export async function setSegmentModeAction(formData: FormData) {
  const userId = await requireUserId();

  const dayId = trimOrNull(formData.get('dayId'));
  const idxRaw = formData.get('idx');
  if (!dayId || typeof idxRaw !== 'string') {
    throw new Error('dayId + idx required');
  }
  const idx = Number(idxRaw);
  if (!Number.isFinite(idx) || idx < 0) throw new Error('Invalid idx');
  const mode = parseMode(formData.get('mode'));

  const { tripId } = await setSegmentMode(userId, dayId, idx, mode);
  revalidatePath(`/trip/${tripId}`);
}

export async function setHotelLegModeAction(
  hotelId: string,
  leg: 'arrival' | 'departure',
  formData: FormData,
) {
  const userId = await requireUserId();
  if (leg !== 'arrival' && leg !== 'departure') throw new Error('Invalid leg');
  const mode = parseMode(formData.get('mode'));

  const { tripId } = await setHotelLegMode(userId, hotelId, leg, mode);
  revalidatePath(`/trip/${tripId}`);
}

export async function setDayDefaultModeAction(formData: FormData) {
  const userId = await requireUserId();

  const dayId = trimOrNull(formData.get('dayId'));
  if (!dayId) throw new Error('dayId required');
  const rawMode = formData.get('mode');
  const isMixed = typeof rawMode === 'string' && rawMode === 'mixed';
  const mode: SegmentMode | null = isMixed ? null : parseMode(rawMode);

  const { tripId } = await setDayDefaultMode(userId, dayId, mode);
  revalidatePath(`/trip/${tripId}`);
}
