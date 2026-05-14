'use server';

// Server action wrapping the Routes REST API. Called from
// `components/map-directions.tsx` (one call per leg, in parallel).
//
// Lightweight authz: requires a signed-in user. We don't gate on trip
// membership because route compute reveals no private data — it's a
// geocoded fact derived from coordinates the user already supplied.
// Higher-fidelity gating (per-trip role check) is left to the caller
// of the action via the existing day/segment write paths.

import { requireUserId } from '@/lib/with-trip-auth';
import {
  computeRouteLeg,
  type ComputeRouteLegResult,
} from '@/lib/routes-server';
import { toRestTravelMode, type Mode } from '@/lib/map-helpers';

const MODES: readonly Mode[] = ['drive', 'walk', 'transit'] as const;

function parseLatLng(v: FormDataEntryValue | null): number {
  if (typeof v !== 'string') throw new Error('Invalid coordinate');
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('Invalid coordinate');
  return n;
}

function parseMode(v: FormDataEntryValue | null): Mode {
  if (typeof v !== 'string' || !(MODES as readonly string[]).includes(v)) {
    throw new Error('Invalid mode');
  }
  return v as Mode;
}

export type ComputeRouteActionResult =
  | {
      ok: true;
      mode: Mode;
      distance: string;
      time: string;
      polyline: string;
    }
  | { ok: false; mode: Mode };

/**
 * Compute one leg. Returns serializable result for client rendering +
 * persistence. Caller decides whether to retry with a fallback mode.
 */
export async function computeRouteLegAction(
  formData: FormData,
): Promise<ComputeRouteActionResult> {
  try {
    await requireUserId();
  } catch {
    return { ok: false, mode: 'drive' };
  }

  let originLat: number;
  let originLng: number;
  let destLat: number;
  let destLng: number;
  let mode: Mode;
  try {
    originLat = parseLatLng(formData.get('originLat'));
    originLng = parseLatLng(formData.get('originLng'));
    destLat = parseLatLng(formData.get('destLat'));
    destLng = parseLatLng(formData.get('destLng'));
    mode = parseMode(formData.get('mode'));
  } catch {
    return { ok: false, mode: 'drive' };
  }

  const result: ComputeRouteLegResult | null = await computeRouteLeg({
    origin: { lat: originLat, lng: originLng },
    destination: { lat: destLat, lng: destLng },
    travelMode: toRestTravelMode(mode),
  });

  if (!result) return { ok: false, mode };

  return {
    ok: true,
    mode,
    distance: result.distanceText,
    time: result.durationText,
    polyline: result.encodedPolyline,
  };
}
