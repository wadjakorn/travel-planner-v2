// PUT /trips/:tripId/plan body parser (TP-0146, design v3 §3). Pure: shape,
// sections and duplicate ids. Checks that need the stored trip (day order,
// unknown ids) live in plan-diff.validatePlanAgainst.

import { ServiceError } from '@/lib/services/service-error';
import type { PlaceFields } from '@/lib/services/place-service';
import type { ArriveInput } from '@/lib/legs';
import { parsePlaceFields, parsePlacePatch, readPlaceExtras, readPlaceLink, type PlaceNear } from '@/lib/api/place-input';
import { readArrive } from '@/lib/api/arrive-input';

type Mode = 'drive' | 'walk' | 'transit';
const MODES: readonly Mode[] = ['drive', 'walk', 'transit'];

export type ParsedExistingPlace = {
  kind: 'existing';
  id: string;
  path: string;
  patch: Partial<PlaceFields>;
  link: string | null;
  arrive: ArriveInput | null | undefined;
};
export type ParsedNewPlace = {
  kind: 'new';
  path: string;
  fields: PlaceFields;
  link: string | null;
  query: string | null;
  near: PlaceNear | null;
  arrive: ArriveInput | null | undefined;
};
export type ParsedPlanPlace = ParsedExistingPlace | ParsedNewPlace;
export type ParsedPlanDay = {
  id: string;
  path: string;
  title?: string;
  defaultMode?: Mode | null;
  places?: ParsedPlanPlace[];
};
export type ParsedPlanUpdate = {
  ifUpdatedAt: Date | null;
  prune: boolean;
  dryRun: boolean;
  days: ParsedPlanDay[];
};

const UNSUPPORTED_SECTIONS = ['trip', 'budget', 'hotels', 'transport', 'expenses', 'notes'] as const;
const USE_INSTEAD: Record<(typeof UNSUPPORTED_SECTIONS)[number], string> = {
  trip: 'PATCH /trips/:tripId',
  budget: 'PATCH /trips/:tripId',
  hotels: 'the /hotels endpoints',
  transport: 'the /transport endpoints',
  expenses: 'the /expenses endpoints',
  notes: 'the /notes endpoints',
};

export const bad = (message: string, reason: string, extra: Record<string, unknown> = {}) =>
  new ServiceError('bad_request', message, { reason, ...extra });

function obj(v: unknown, label: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw bad(`${label} must be an object`, 'bad_shape');
  }
  return v as Record<string, unknown>;
}

// Re-throw a field parser's ServiceError with the body path in front.
function at<T>(path: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'bad_request') {
      throw new ServiceError('bad_request', `${path}: ${e.message}`, { reason: 'bad_field', path, ...e.extra });
    }
    throw e;
  }
}

function parsePlace(v: unknown, path: string): ParsedPlanPlace {
  const o = obj(v, path);
  return at(path, () => {
    const link = readPlaceLink(o);
    const arrive = readArrive(o);
    if (o.id !== undefined) {
      if (typeof o.id !== 'string' || !o.id) throw new ServiceError('bad_request', '"id" must be a non-empty string');
      if (o.query !== undefined || o.near !== undefined) {
        throw new ServiceError('bad_request', '"query"/"near" only resolve new places; send googleMapsUrl or lat/lng');
      }
      return { kind: 'existing', id: o.id, path, patch: parsePlacePatch(o), link, arrive };
    }
    const extras = readPlaceExtras(o);
    return { kind: 'new', path, fields: parsePlaceFields(o), link, query: extras.query, near: extras.near, arrive };
  });
}

function parseDay(v: unknown, i: number): ParsedPlanDay {
  const path = `/days/${i}`;
  const o = obj(v, path);
  if (typeof o.id !== 'string' || !o.id) {
    throw bad(
      `${path}: every day needs its "id" — adding days is not supported here; POST /trips/:tripId/days first`,
      'day_order_unsupported',
      { path },
    );
  }
  if ('date' in o) throw bad(`${path}: "date" follows the day's position and cannot be set here`, 'unsupported_field', { path });
  const day: ParsedPlanDay = { id: o.id, path };
  if ('title' in o) {
    if (typeof o.title !== 'string' || !o.title.trim()) throw bad(`${path}: "title" must be a non-empty string`, 'bad_field', { path });
    day.title = o.title.trim();
  }
  if ('defaultMode' in o) {
    if (o.defaultMode !== null && !MODES.includes(o.defaultMode as Mode)) {
      throw bad(`${path}: "defaultMode" must be one of ${MODES.join(', ')} or null`, 'bad_field', { path });
    }
    day.defaultMode = o.defaultMode as Mode | null;
  }
  if ('places' in o) {
    if (!Array.isArray(o.places)) throw bad(`${path}: "places" must be an array`, 'bad_shape', { path });
    day.places = o.places.map((p, j) => parsePlace(p, `${path}/places/${j}`));
  }
  return day;
}

export function parsePlanUpdate(body: Record<string, unknown>): ParsedPlanUpdate {
  for (const k of UNSUPPORTED_SECTIONS) {
    if (k in body) {
      throw bad(`"${k}" is not supported by PUT /plan yet; use ${USE_INSTEAD[k]}`, 'unsupported_section', { section: k });
    }
  }
  let ifUpdatedAt: Date | null = null;
  if (body.ifUpdatedAt !== undefined && body.ifUpdatedAt !== null) {
    const d = typeof body.ifUpdatedAt === 'string' ? new Date(body.ifUpdatedAt) : null;
    if (!d || Number.isNaN(d.getTime())) throw bad('"ifUpdatedAt" must be an ISO timestamp (trip.updatedAt)', 'bad_field');
    ifUpdatedAt = d;
  }
  for (const k of ['prune', 'dryRun'] as const) {
    if (body[k] !== undefined && typeof body[k] !== 'boolean') throw bad(`"${k}" must be a boolean`, 'bad_field');
  }
  const prune = body.prune === true;
  if (prune && !ifUpdatedAt) {
    throw bad('"prune": true needs "ifUpdatedAt" (trip.updatedAt from your GET) so nothing added since is deleted', 'version_required');
  }
  if (!Array.isArray(body.days)) throw bad('"days" is required: every day of the trip, in order', 'bad_shape');
  const days = body.days.map(parseDay);

  const seen = new Map<string, string>();
  for (const d of days) {
    for (const p of d.places ?? []) {
      if (p.kind !== 'existing') continue;
      const prev = seen.get(p.id);
      if (prev) throw bad(`place ${p.id} is listed twice (${prev} and ${p.path})`, 'duplicate_id', { paths: [prev, p.path] });
      seen.set(p.id, p.path);
    }
  }
  return { ifUpdatedAt, prune, dryRun: body.dryRun === true, days };
}
