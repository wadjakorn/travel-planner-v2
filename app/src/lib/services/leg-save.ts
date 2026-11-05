// The one write path for the leg detail sheet (TP-0152). It calls the same
// services the REST API uses (setPlaceArrive / setHotelLegMode) with the same
// input parser, so web, API and MCP save a leg identically.

import type { dbNode } from '@/db';
import { parseArrive } from '@/lib/api/arrive-input';
import { afterCommit, setPlaceArrive } from './leg-service';
import { setHotelLegMode } from './segment-service';
import { ServiceError } from './service-error';

export type LegSaveInput =
  | {
      target: 'arrive';
      dayId: string;
      placeId: string;
      after: string | null;
      mode: unknown;
      durationMin: unknown;
      note: unknown;
    }
  | {
      target: 'hotel';
      hotelId: string;
      leg: 'arrival' | 'departure';
      mode: unknown;
    };

export async function saveLeg(
  userId: string,
  input: LegSaveInput,
  txDb?: typeof dbNode,
): Promise<{ tripId: string }> {
  // Server actions can be invoked directly with arbitrary payloads.
  if (typeof input !== 'object' || input === null) {
    throw new ServiceError('bad_request', 'Invalid leg input');
  }
  if (input.target !== 'hotel' && input.target !== 'arrive') {
    throw new ServiceError('bad_request', 'Invalid leg target');
  }
  if (input.target === 'hotel' && input.leg !== 'arrival' && input.leg !== 'departure') {
    throw new ServiceError('bad_request', 'Invalid hotel leg');
  }
  if (input.target === 'hotel') {
    // Same mode validation (and message) as an `arrive` body.
    const { mode } = parseArrive({ mode: input.mode });
    return setHotelLegMode(
      userId,
      input.hotelId,
      input.leg,
      mode,
      txDb ? afterCommit(txDb) : undefined,
    );
  }
  const arrive = parseArrive({
    mode: input.mode,
    durationMin: input.durationMin,
    note: input.note,
  });
  const { tripId } = await setPlaceArrive(
    userId,
    input.placeId,
    arrive,
    txDb,
    input.after
      ? { dayId: input.dayId, after: input.after }
      : { dayId: input.dayId, at: 'start' },
  );
  return { tripId };
}
