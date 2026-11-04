import 'server-only';
import {
  readTransportEnds,
  type TransportEndInput,
  type TransportEnds,
} from '@/lib/api/transport-input';
import { transportWarnings, type ImportWarning } from '@/lib/api/import-warnings';
import {
  applyPlaceLink,
  LinkBudget,
  type PlaceLinkDeps,
  type PlaceLinkSource,
  type PlaceLinkWarning,
} from '@/lib/api/place-link';
import type { PlaceFields } from '@/lib/services/place-service';
import {
  parseTransportInput,
  parseTransportPatch,
  resolveTransport,
  updateTransport,
} from '@/lib/services/booking-service';
import { requireTripAccess } from '@/lib/services/access';
import type { ParsedImportPlan } from '@/lib/api/import-input';
import type { TransportBooking } from '@/db/schema';

export type TransportEndResolved = {
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  address: null;
  warnings: PlaceLinkWarning[];
  source: PlaceLinkSource;
};

// Thin adapter over applyPlaceLink (never searches itself). The shell kind
// decides whether a name/query search can run: applyPlaceLink never searches a
// 'transit' place (place-link.ts:~224) but reads its link before that check, so
// a query is searched ('sight') while a failed link never falls back to a name
// search ('transit'). Scrutiny B1 / re-review R1.
export async function resolveTransportEnd(
  end: TransportEndInput,
  budget: LinkBudget,
  deps: PlaceLinkDeps = {},
): Promise<TransportEndResolved> {
  const fields: PlaceFields = {
    kind: end.query !== null ? 'sight' : 'transit',
    status: 'confirmed', sourceUrl: null,
    name: end.name ?? end.query ?? '', category: null, rating: null, reviews: null, time: null,
    duration: null, price: null, address: null, phone: null, website: null, hours: null,
    tags: [], thumb: null, note: null, lat: end.lat, lng: end.lng, placeIdExternal: end.placeId,
  };
  const { fields: out, warnings, source } = await applyPlaceLink(
    fields,
    end.googleMapsUrl,
    budget,
    deps,
    { query: end.query, near: end.near },
  );
  return { lat: out.lat, lng: out.lng, placeId: out.placeIdExternal, address: null, warnings, source };
}

export type TransportResolveDeps = {
  budget?: LinkBudget;
  linkDeps?: PlaceLinkDeps;
};

const withPath = (ws: PlaceLinkWarning[], path: string): ImportWarning[] =>
  ws.map((w) => ({ code: w.code, path, message: w.message }));

const ENDS = ['from', 'to'] as const;

export type TransportCreateDeps = TransportResolveDeps & {
  authorize?: (userId: string, tripId: string) => Promise<unknown>;
};

// POST: authorize + validate (no lookup on a 400/403), then resolve outside the
// idempotent tx.
export async function prepareTransportCreate(
  userId: string,
  tripId: string,
  body: Record<string, unknown>,
  deps: TransportCreateDeps = {},
): Promise<{ body: Record<string, unknown>; warnings: ImportWarning[] }> {
  await (deps.authorize ?? ((u, t) => requireTripAccess(u, t, 'write')))(userId, tripId);
  const ends = readTransportEnds(body);
  parseTransportInput(ends.body);
  const budget = deps.budget ?? new LinkBudget(userId);

  const prepared: Record<string, unknown> = { ...ends.body };
  delete prepared.from;
  delete prepared.to;
  const warnings: ImportWarning[] = [];
  for (const key of ENDS) {
    const end = ends[key];
    if (end === undefined) continue;
    if (end === null) {
      prepared[`${key}Lat`] = null;
      prepared[`${key}Lng`] = null;
      prepared[`${key}PlaceId`] = null;
      continue;
    }
    const r = await resolveTransportEnd(end, budget, deps.linkDeps);
    prepared[`${key}Lat`] = r.lat;
    prepared[`${key}Lng`] = r.lng;
    prepared[`${key}PlaceId`] = r.placeId;
    if (end.name && !(`${key}Name` in prepared)) prepared[`${key}Name`] = end.name;
    warnings.push(...withPath(r.warnings, `/${key}`));
  }
  // Base path '' yields '/fromCode'; transport_without_day carries no path on REST.
  for (const w of transportWarnings(prepared, '')) {
    warnings.push(w.path ? w : { code: w.code, message: w.message });
  }
  return { body: prepared, warnings };
}

export type TransportPatchDeps = TransportResolveDeps & {
  authorize?: (userId: string, id: string) => Promise<unknown>;
  update?: typeof updateTransport;
};

async function authorizeTransport(userId: string, id: string) {
  await requireTripAccess(userId, await resolveTransport(id), 'write');
}

// PATCH: only a sent end is re-resolved; a failed resolve writes no coordinate
// columns, so the stored pin survives.
export async function patchTransport(
  userId: string,
  id: string,
  body: Record<string, unknown>,
  deps: TransportPatchDeps = {},
): Promise<{ transport: TransportBooking; warnings: ImportWarning[] }> {
  await (deps.authorize ?? authorizeTransport)(userId, id);
  const ends = readTransportEnds(body);
  parseTransportPatch(ends.body);

  const patch: Record<string, unknown> = { ...ends.body };
  delete patch.from;
  delete patch.to;
  const warnings: ImportWarning[] = [];
  let budget = deps.budget;
  for (const key of ENDS) {
    const end = ends[key];
    if (end === undefined) continue;
    if (end === null) {
      patch[`${key}Lat`] = null;
      patch[`${key}Lng`] = null;
      patch[`${key}PlaceId`] = null;
      continue;
    }
    budget ??= new LinkBudget(userId);
    const r = await resolveTransportEnd(end, budget, deps.linkDeps);
    warnings.push(...withPath(r.warnings, `/${key}`));
    if (r.lat != null) {
      patch[`${key}Lat`] = r.lat;
      patch[`${key}Lng`] = r.lng;
      patch[`${key}PlaceId`] = r.placeId;
    }
    if (end.name && !(`${key}Name` in patch)) patch[`${key}Name`] = end.name;
  }
  const transport = await (deps.update ?? updateTransport)(userId, id, patch);
  return { transport, warnings };
}

const TRANSPORT_CONCURRENCY = 4;

// Import: resolve every ride end on the per-import budget, AFTER hotels and
// places (R8). Each end resolves independently. For an end that was sent (object
// or null) the parsed row's <end>Lat/Lng/PlaceId are overwritten from the
// resolved end (null when unresolved / null end) so a stray flat key never
// survives (R9); an end that was not sent keeps the parsed values.
export async function resolvePlanTransport(
  plan: ParsedImportPlan,
  ends: TransportEnds[],
  budget: LinkBudget,
  deps: PlaceLinkDeps = {},
): Promise<{ plan: ParsedImportPlan; warnings: ImportWarning[] }> {
  const sections = plan.sections;
  if (!sections || sections.transport.length === 0) return { plan, warnings: [] };
  const rows = [...sections.transport];
  const results: ImportWarning[][] = [];
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const i = next++;
      const row: Record<string, unknown> = { ...rows[i] };
      const ws: ImportWarning[] = [];
      for (const key of ENDS) {
        const end = ends[i]?.[key];
        if (end === undefined) continue;
        if (end === null) {
          row[`${key}Lat`] = null;
          row[`${key}Lng`] = null;
          row[`${key}PlaceId`] = null;
          continue;
        }
        const r = await resolveTransportEnd(end, budget, deps);
        row[`${key}Lat`] = r.lat;
        row[`${key}Lng`] = r.lng;
        row[`${key}PlaceId`] = r.placeId;
        if (end.name && !row[`${key}Name`]) row[`${key}Name`] = end.name;
        ws.push(...withPath(r.warnings, `/transport/${i}/${key}`));
      }
      rows[i] = row as (typeof rows)[number];
      results[i] = ws;
    }
  };
  await Promise.all(Array.from({ length: Math.min(TRANSPORT_CONCURRENCY, rows.length) }, worker));
  return {
    plan: { ...plan, sections: { ...sections, transport: rows } },
    warnings: results.flatMap((w) => w ?? []),
  };
}
