import 'server-only';
import {
  readTransportEnds,
  type TransportEndInput,
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
} from '@/lib/services/booking-service';
import { requireTripAccess } from '@/lib/services/access';

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
