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
import {
  parseImportPlan,
  readImportPlaceLinks,
  readImportPlaceExtras,
  readImportHotelLinks,
  readImportTransportEnds,
  type ParsedImportPlan,
} from '@/lib/api/import-input';
import { LinkBudget, resolvePlanLinks } from '@/lib/api/place-link';
import { resolvePlanHotels } from '@/lib/api/hotel-link';
import { resolvePlanTransport } from '@/lib/api/transport-link';
import {
  collectTripWarnings,
  finalizeImportWarnings,
  summarizeWarnings,
  type ImportWarning,
} from '@/lib/api/import-warnings';
import { collectLegWarnings } from '@/lib/api/leg-warnings';
import { importLegRows, arriveForPlaces } from '@/lib/legs';
import { importPlan } from '@/lib/services/import-service';
import { loadApiTrip } from '@/lib/trip-queries';
import { addDaysIso } from '@/lib/calendar-queries';
import { dayRowFields, parseISODate, expectedDayCount } from '@/lib/seed-days';
import { withLegEstimates, type HotelLike } from '@/lib/leg-estimate';
import type { TripBudgetConfig } from '@/db/schema';

type Marker = { __idem: true; tripId: string; warnings?: ImportWarning[] };
function importMarker(tripId: string, warnings: ImportWarning[]): Marker {
  return { __idem: true, tripId, warnings };
}

// Effective date for day index i (mirrors import-service.effectiveDate): an
// explicit day.date, else startDate + i days, else null.
function effectiveDate(dayDate: string | null, startDate: string | null, i: number): Date | null {
  if (dayDate) return parseISODate(dayDate);
  if (startDate) {
    const s = parseISODate(startDate);
    if (s) {
      const d = new Date(s);
      d.setDate(d.getDate() + i);
      return d;
    }
  }
  return null;
}

// TP-0141: the leg rows importPlan writes for a day (N-1 segments + the start
// leg) and the per-place `arrive` they imply, so the preview matches GET.
// Memoized per day object: the preview reads it for start, places and segments.
const legsCache = new WeakMap<object, ReturnType<typeof computePreviewLegs>>();
function computePreviewLegs(d: ParsedImportPlan['days'][number] | undefined) {
  const n = d?.places?.length ?? 0;
  const legs = importLegRows(n, d?.arrives ?? []);
  return {
    start: legs.start,
    arrives: arriveForPlaces(n, legs.segments, legs.start),
    segments: legs.segments.map((s) => ({ id: null, dayId: null, ...s })),
  };
}
function previewLegs(d: ParsedImportPlan['days'][number] | undefined) {
  if (!d) return computePreviewLegs(d);
  let hit = legsCache.get(d);
  if (!hit) legsCache.set(d, (hit = computePreviewLegs(d)));
  return hit;
}

// A read-only preview of the trip the plan WOULD create, shaped like
// GET /trips/:id (loadApiTrip): trip fields + url/budget + days(+places,
// +segments) + hotels. Nothing is written, so server-managed columns
// (id/timestamps) are null. Day skeletons are seeded from the date range to
// match importPlan, and dayRowFields is reused for the day labels.
function buildImportPreview(plan: ParsedImportPlan) {
  const trip = plan?.trip ?? ({} as ParsedImportPlan['trip']);
  const startDate = trip?.startDate ?? null;

  let dayInputs = plan?.days ?? [];
  if (dayInputs.length === 0 && startDate && trip?.endDate) {
    const n = expectedDayCount(startDate, trip.endDate);
    dayInputs = Array.from({ length: n }, () => ({ date: null, places: [] }));
  }

  // The parsed budget section is { config, currency }; the preview exposes the
  // flat TripBudgetConfig (matching import-service persistence + the GET shape),
  // so unwrap `.config` rather than leaking the whole wrapper.
  const budgetConfig: TripBudgetConfig | null = plan?.sections?.budget?.config ?? null;

  return {
    id: null,
    title: trip?.title ?? null,
    subtitle: trip?.subtitle ?? null,
    startDate,
    endDate: trip?.endDate ?? null,
    cover: trip?.cover ?? null,
    sourceUrl: trip?.sourceUrl ?? null,
    currency: plan?.sections?.budget?.currency ?? null,
    budgetConfig,
    isPublic: false,
    collaborators: [],
    recco: [],
    url: null,
    budget: budgetConfig,
    // est* per arrive (TP-0149), same helper as GET /trips/:id.
    days: dayInputs.map((d, i) => withLegEstimates({
      id: null,
      tripId: null,
      idx: i,
      // Same dateIso rule as importPlan: explicit day.date, else start + idx.
      ...dayRowFields(
        i,
        effectiveDate(d?.date ?? null, startDate, i),
        d?.date ?? (startDate && parseISODate(startDate) ? addDaysIso(startDate, i) : null),
      ),
      start: previewLegs(d).start,
      places: (d?.places ?? []).map((p, j) => ({
        id: null,
        dayId: null,
        idx: j,
        // status + sourceUrl now ride on PlaceFields (TP-0042/TP-0043), so the
        // ...p spread makes the preview reflect the REAL parsed values the plan
        // sent, not hard-coded 'confirmed'/null defaults.
        ...p,
        tags: p.tags ?? [],
        arrive: previewLegs(d).arrives[j],
      })),
      segments: previewLegs(d).segments,
    }, (plan?.hotels ?? []) as HotelLike[])),
    hotels: (plan?.hotels ?? []).map((h) => ({ id: null, tripId: null, ...h })),
    // `sections` is preview-only (not on the GET /trips/:id contract) so the
    // agent can see the passthrough transport/expenses/notes/budget it sent;
    // server-managed fields (ownerId, timestamps) are intentionally omitted.
    sections: plan?.sections ?? null,
  };
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
  resolveLinks: typeof resolvePlanLinks;
  resolveHotels: typeof resolvePlanHotels;
  // Optional so older callers/tests that omit it keep working.
  resolveTransport?: typeof resolvePlanTransport;
};

const defaultDeps: ImportDeps = {
  loadApiTrip,
  idemDb: db,
  txDb: dbNode,
  resolveLinks: resolvePlanLinks,
  resolveHotels: resolvePlanHotels,
  resolveTransport: resolvePlanTransport,
};

// Shared by dryRun and commit (TP-0143, TP-0142): parse, then resolve hotels,
// then places, then transport ends on ONE per-import LinkBudget (R8: hotels get
// pins first, transport ends see lookup_skipped first when it runs low), then
// merge hotel-link, place-link, transport-link, semantic and leg warnings.
async function resolveImport(
  userId: string,
  body: Record<string, unknown>,
  deps: ImportDeps,
): Promise<{ plan: ParsedImportPlan; warnings: ImportWarning[] }> {
  const parsed = parseImportPlan(body, userId);
  const placeLinks = readImportPlaceLinks(body);
  const hotelLinks = readImportHotelLinks(body);
  const placeExtras = readImportPlaceExtras(body);
  const transportEnds = readImportTransportEnds(body);
  const budget = new LinkBudget(userId);
  const h = await deps.resolveHotels(parsed, hotelLinks, budget);
  const { plan: placed, warnings: linkWarnings } = await deps.resolveLinks(
    userId,
    h.plan,
    placeLinks,
    { budget },
    placeExtras,
  );
  const { plan, warnings: transportLinkWarnings } = await (
    deps.resolveTransport ?? resolvePlanTransport
  )(placed, transportEnds, budget);
  return {
    plan,
    warnings: finalizeImportWarnings(
      [
        ...h.warnings,
        ...linkWarnings,
        ...transportLinkWarnings,
        ...collectTripWarnings(plan),
        ...collectLegWarnings(plan, placeLinks),
      ],
      plan,
    ),
  };
}

// A full body persisted before TP-0144 has no `summary`; add it on replay.
function withSummary(body: unknown): unknown {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const b = body as { warnings?: unknown; summary?: unknown };
    if (Array.isArray(b.warnings) && b.summary === undefined) {
      return { ...b, summary: summarizeWarnings(b.warnings as ImportWarning[]) };
    }
  }
  return body;
}

export async function importTripIdempotent(
  userId: string,
  req: Request,
  body: Record<string, unknown>,
  deps: ImportDeps = defaultDeps,
  dryRun = false,
): Promise<NextResponse> {
  // dryRun seam (P0-CONTRACT / TP-0041): validate + resolve links, then return a
  // full preview of the trip the plan would create plus the merged warnings,
  // writing nothing. Branch BEFORE claimKey so a dry run never consumes an
  // idempotency key (pinned by a regression test).
  if (dryRun) {
    const { plan, warnings } = await resolveImport(userId, body, deps);
    return NextResponse.json(
      { trip: buildImportPreview(plan), warnings, summary: summarizeWarnings(warnings) },
      { status: 200 },
    );
  }

  // Import opts into TTL takeover: it is the only caller that can roll back a
  // superseded mutation (the in-tx marker write fails when its claim is gone),
  // so taking over an abandoned claim can never duplicate a trip here.
  const outcome = await claimKey(userId, req, body, deps.idemDb, {
    allowTakeover: true,
  });

  if (outcome.kind === 'conflict') return outcome.response;
  if (outcome.kind === 'replay') {
    if (isImportMarker(outcome.responseJson)) {
      const trip = await deps.loadApiTrip(outcome.responseJson.tripId);
      const warnings = outcome.responseJson.warnings ?? [];
      return NextResponse.json(
        { trip, warnings, summary: summarizeWarnings(warnings) },
        { status: outcome.statusCode },
      );
    }
    return NextResponse.json(withSummary(outcome.responseJson), { status: outcome.statusCode });
  }

  const owned = outcome.kind === 'owned' ? { key: outcome.key, id: outcome.id } : null;
  let committed = false;
  try {
    // Same resolve + warning merge as dryRun (hotels, places, semantic, legs).
    const { plan, warnings } = await resolveImport(userId, body, deps);
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
            const n = await persistCompletion(tx, userId, owned.key, owned.id, 201, importMarker(tripId, warnings));
            if (n === 0) {
              throw new Error('idempotency claim was taken over mid-import; rolling back to avoid a duplicate');
            }
          }
        : undefined,
    );
    committed = true; // trip + marker committed atomically
    const trip = await deps.loadApiTrip(id);
    const full = { trip, warnings, summary: summarizeWarnings(warnings) };
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
