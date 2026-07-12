// Atomic idempotent import (API-IDEM). Composes the idempotency primitives so
// the trip and its idempotency completion commit in ONE dbNode transaction: the
// recordCompletion hook writes a marker inside importPlan's tx. The read-back
// runs post-commit on neon-http (loadApiTrip untouched); a best-effort upgrade
// replaces the marker with the full body. On replay, a marker is re-rendered
// from its tripId — so a retry never re-runs importPlan and can never duplicate.
//
// Caveat: the "never duplicates" guarantee covers owner crash and post-commit
// read-back failure. TTL takeover (CLAIM_TTL_MS, 60s) assumes no single import
// transaction stays in-flight longer than the TTL — a live-but-slow import
// exceeding CLAIM_TTL_MS could be taken over by a retry and produce a
// duplicate. Imports are pure DB inserts with no external calls, so this is
// far above p99 and treated as an accepted, spec-consistent residual.

import 'server-only';
import { NextResponse } from 'next/server';
import { db, dbNode } from '@/db';
import {
  claimKey,
  persistCompletion,
  releaseClaim,
  type IdemExecutor,
} from '@/lib/api/idempotency';
import { parseImportPlan } from '@/lib/api/import-input';
import { importPlan } from '@/lib/services/import-service';
import { loadApiTrip } from '@/lib/trip-queries';

type Marker = { __idem: true; tripId: string };
function importMarker(tripId: string): Marker {
  return { __idem: true, tripId };
}
function isImportMarker(json: unknown): json is Marker {
  return (
    typeof json === 'object' &&
    json !== null &&
    (json as { __idem?: unknown }).__idem === true &&
    typeof (json as { tripId?: unknown }).tripId === 'string'
  );
}

export type ImportDeps = {
  loadApiTrip: typeof loadApiTrip;
  idemDb: IdemExecutor;
  txDb: typeof dbNode;
};

const defaultDeps: ImportDeps = { loadApiTrip, idemDb: db, txDb: dbNode };

export async function importTripIdempotent(
  userId: string,
  req: Request,
  body: Record<string, unknown>,
  deps: ImportDeps = defaultDeps,
): Promise<NextResponse> {
  const outcome = await claimKey(userId, req, body, deps.idemDb);

  if (outcome.kind === 'conflict') return outcome.response;
  if (outcome.kind === 'replay') {
    if (isImportMarker(outcome.responseJson)) {
      const trip = await deps.loadApiTrip(outcome.responseJson.tripId);
      return NextResponse.json({ trip }, { status: outcome.statusCode });
    }
    return NextResponse.json(outcome.responseJson, { status: outcome.statusCode });
  }

  const key = outcome.kind === 'owned' ? outcome.key : null;
  const claimId = outcome.kind === 'owned' ? outcome.id : null;
  let committed = false;
  try {
    const plan = parseImportPlan(body);
    const { id } = await importPlan(
      userId,
      plan,
      deps.txDb,
      key
        ? (tx, tripId) => persistCompletion(tx, userId, key, 201, importMarker(tripId))
        : undefined,
    );
    committed = true; // trip + marker committed atomically
    const trip = await deps.loadApiTrip(id);
    const full = { trip };
    if (key) {
      // Best-effort: replace the marker with the full body so replays skip the
      // read-back. Failure is harmless — replay re-renders from the marker.
      await persistCompletion(deps.idemDb, userId, key, 201, full).catch(() => {});
    }
    return NextResponse.json(full, { status: 201 });
  } catch (err) {
    // Only release when the mutation never committed (e.g. bad payload). After
    // commit the marker is the durable truth; releasing is both wrong and a
    // no-op (releaseClaim is guarded on status_code = 0). Scoped to our own
    // claim row id so a concurrent retry's fresh claim is never evicted.
    if (key && claimId && !committed)
      await releaseClaim(userId, key, claimId, deps.idemDb);
    throw err;
  }
}
