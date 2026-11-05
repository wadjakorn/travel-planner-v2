'use server';

// Day travel-mode server action — a thin wrapper over segment-service.
// FormData parsing + mode validation live here. A leg's own mode is saved
// from the leg sheet (actions/legs.ts saveLegAction).

import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/with-trip-auth';
import { trimOrNull } from '@/lib/form-parsers';
import { type SegmentMode } from '@/lib/services/access';
import { setDayDefaultMode } from '@/lib/services/segment-service';

const MODES = ['drive', 'walk', 'transit'] as const;

function parseMode(v: FormDataEntryValue | null): SegmentMode {
  if (typeof v !== 'string' || !MODES.includes(v as SegmentMode)) {
    throw new Error('Invalid mode');
  }
  return v as SegmentMode;
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
