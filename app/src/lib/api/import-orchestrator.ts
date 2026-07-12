// Atomic idempotent import (API-IDEM). Composes the idempotency primitives so
// the trip and its idempotency completion commit in ONE dbNode transaction: the
// recordCompletion hook writes a marker inside importPlan's tx. The read-back
// runs post-commit on neon-http (loadApiTrip untouched); a best-effort upgrade
// replaces the marker with the full body. On replay, a marker is re-rendered
// from its tripId — so a retry never re-runs importPlan and can never duplicate.
//
// The "never duplicates" guarantee holds even under TTL takeover of a live but
// slow import (> CLAIM_TTL_MS): the marker write is scoped to the claim row id
// inside the import tx, so if a retry has already taken the claim over, the
// marker updates 0 rows and the slow import rolls back — the taker's trip is the
// only one, and the key replays to it.

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

  const owned = outcome.kind === 'owned' ? { key: outcome.key, id: outcome.id } : null;
  let committed = false;
  try {
    const plan = parseImportPlan(body);
    const { id } = await importPlan(
      userId,
      plan,
      deps.txDb,
      owned
        ? async (tx, tripId) => {
            // Write the marker inside the import tx, scoped to OUR claim row. If
            // a TTL takeover deleted it while this (slow) import ran, 0 rows are
            // updated → throw so the whole import rolls back. That closes the
            // last duplicate window: a superseded slow import creates no trip.
            const n = await persistCompletion(tx, userId, owned.key, owned.id, 201, importMarker(tripId));
            if (n === 0) {
              throw new Error('idempotency claim was taken over mid-import; rolling back to avoid a duplicate');
            }
          }
        : undefined,
    );
    committed = true; // trip + marker committed atomically
    const trip = await deps.loadApiTrip(id);
    const full = { trip };
    if (owned) {
      // Best-effort: replace the marker with the full body so replays skip the
      // read-back. Failure is harmless — replay re-renders from the marker.
      await persistCompletion(deps.idemDb, userId, owned.key, owned.id, 201, full).catch(() => {});
    }
    return NextResponse.json(full, { status: 201 });
  } catch (err) {
    // Only release when the mutation never committed (e.g. bad payload). After
    // commit the marker is the durable truth; releasing is both wrong and a
    // no-op (releaseClaim is guarded on status_code = 0). Scoped to our own
    // claim row id so a concurrent retry's fresh claim is never evicted.
    if (owned && !committed)
      await releaseClaim(userId, owned.key, owned.id, deps.idemDb);
    throw err;
  }
}
