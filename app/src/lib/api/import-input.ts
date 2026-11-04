// Validate + normalize the /api/v1/trips/import payload (API-IMPORT). Delegates
// per-entity validation to the existing place parser and the hotel parser, and
// enforces payload-size caps so one request can't create an unbounded plan.
// Throws ServiceError('bad_request') on any problem — the route maps it to 400
// and (because importPlan runs in a transaction) nothing is written.

import { ServiceError } from '@/lib/services/service-error';
import { isRealISODate } from '@/lib/api/iso-date';
import {
  parsePlaceFields,
  readPlaceLink,
  readPlaceExtras,
  parseHttpUrl,
  type PlaceInputExtras,
} from '@/lib/api/place-input';
import { parseHotelFields, readHotelLink, type HotelFields, type HotelLinkInput } from '@/lib/api/hotel-input';
import { parseSections, type ParsedSections } from '@/lib/api/import-sections';
import { expectedDayCount } from '@/lib/seed-days';
import { readArrive } from '@/lib/api/arrive-input';
import type { ArriveInput } from '@/lib/legs';
import type { PlaceFields } from '@/lib/services/place-service';

export const MAX_DAYS = 60;
export const MAX_PLACES_PER_DAY = 100;
export const MAX_HOTELS = 50;

export type ParsedImportPlan = {
  trip: {
    title: string;
    subtitle: string | null;
    startDate: string | null;
    endDate: string | null;
    cover: string | null;
    // Maps to trip.source_url; persisted by importPlan (TP-0040). parseImportPlan
    // always sets it; optional so existing plan literals stay valid.
    sourceUrl?: string | null;
  };
  // `arrives[j]` is the travel INTO place j (TP-0141): j = 0 is the day's start
  // leg, j >= 1 the segment from place j-1. Parallel to `places`; absent/null =
  // no leg detail. parseImportPlan always sets it; optional for plan literals.
  days: { date: string | null; places: PlaceFields[]; arrives?: (ArriveInput | null)[] }[];
  hotels: HotelFields[];
  // Validated transport/expenses/notes/budget sections (see import-sections.ts).
  // parseImportPlan always sets this; optional so existing plan literals stay
  // valid. importPlan persists them in the import transaction (TP-0040).
  sections?: ParsedSections;
};

function obj(v: unknown, label: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new ServiceError('bad_request', `${label} must be an object`);
  }
  return v as Record<string, unknown>;
}

function optStr(v: unknown, label: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    throw new ServiceError('bad_request', `${label} must be a string`);
  }
  const t = v.trim();
  return t === '' ? null : t;
}

// A real YYYY-MM-DD calendar date (rejects e.g. 2026-02-31, which JS would
// otherwise roll over). Returns the normalized string, or null when absent.
function optISODate(v: unknown, label: string): string | null {
  const s = optStr(v, label);
  if (s === null) return null;
  if (isRealISODate(s)) return s;
  throw new ServiceError('bad_request', `${label} must be a valid YYYY-MM-DD date`);
}

function arr(v: unknown, label: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    throw new ServiceError('bad_request', `${label} must be an array`);
  }
  return v;
}

// Re-tag a nested ServiceError with positional context (e.g. which day/place)
// so the caller gets a precise 400 message. Non-ServiceErrors propagate as-is.
function withContext<T>(prefix: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ServiceError) {
      throw new ServiceError('bad_request', `${prefix}: ${e.message}`);
    }
    throw e;
  }
}

// [day][place] googleMapsUrl values. Call only after parseImportPlan succeeded
// (shape is then known-good); errors carry the same positional context.
export function readImportPlaceLinks(body: Record<string, unknown>): (string | null)[][] {
  return arr(body.days, '"days"').map((d, di) =>
    arr((d as Record<string, unknown>).places, `day ${di + 1} "places"`).map((p, pi) =>
      withContext(`day ${di + 1} place ${pi + 1}`, () => readPlaceLink(p as Record<string, unknown>)),
    ),
  );
}

// [day][place] optional extras (query/near/status/sourceUrl). Parallel to
// readImportPlaceLinks — a parse slot Wave-1 (TP-0037/TP-0040) consumes without
// re-touching this parser. Call after parseImportPlan succeeded.
export function readImportPlaceExtras(body: Record<string, unknown>): PlaceInputExtras[][] {
  return arr(body.days, '"days"').map((d, di) =>
    arr((d as Record<string, unknown>).places, `day ${di + 1} "places"`).map((p, pi) =>
      withContext(`day ${di + 1} place ${pi + 1}`, () => readPlaceExtras(p as Record<string, unknown>)),
    ),
  );
}

// [hotel] resolve-time location input (googleMapsUrl/query/near + the dryRun
// coordsApprox echo), never stored. Call after parseImportPlan succeeded.
export function readImportHotelLinks(body: Record<string, unknown>): HotelLinkInput[] {
  return arr(body.hotels, '"hotels"').map((h, hi) =>
    withContext(`hotel ${hi + 1}`, () => readHotelLink(h as Record<string, unknown>)),
  );
}

// TP-0056: cross-section checks the per-item validators can't do on their own.
// - Every dayIdx (hotel / transport / expense) must point at a day the import
//   actually creates; otherwise it is stored as an orphan index.
// - Expense paidBy / split accountId must be a trip member. A freshly imported
//   trip has exactly one member — the importer — so any other account would be
//   a non-member (and an unknown id would surface as a raw FK violation).
function checkDayIdx(v: unknown, dayCount: number, label: string): void {
  if (v === undefined || v === null) return;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= dayCount) {
    throw new ServiceError(
      'bad_request',
      dayCount === 0
        ? `${label} "dayIdx" is set but the plan has no days`
        : `${label} "dayIdx" must be an integer from 0 to ${dayCount - 1}`,
    );
  }
}

function checkCrossRefs(
  plan: ParsedImportPlan,
  dayCount: number,
  importerId: string | undefined,
): void {
  plan.hotels.forEach((h, i) =>
    checkDayIdx((h as { dayIdx?: unknown }).dayIdx, dayCount, `hotel ${i + 1}`),
  );
  const sections = plan.sections;
  if (!sections) return;
  sections.transport.forEach((t, i) =>
    checkDayIdx((t as { dayIdx?: unknown }).dayIdx, dayCount, `transport ${i + 1}`),
  );
  sections.expenses.forEach((e, i) => {
    const label = `expenses ${i + 1}`;
    const values = e.values as { dayIdx?: unknown; paidBy?: unknown };
    checkDayIdx(values.dayIdx, dayCount, label);
    if (importerId === undefined) return;
    const notMember = (id: unknown) =>
      typeof id === 'string' && id !== importerId;
    if (notMember(values.paidBy)) {
      throw new ServiceError(
        'bad_request',
        `${label} "paidBy" must be a trip member (only the importing account is a member of a new trip)`,
      );
    }
    for (const sp of e.splits ?? []) {
      if (notMember(sp.accountId)) {
        throw new ServiceError(
          'bad_request',
          `${label} split "accountId" must be a trip member (only the importing account is a member of a new trip)`,
        );
      }
    }
  });
}

// `importerId` (the authenticated user) enables the membership check on expense
// paidBy / split accounts; omit it only in pure shape tests.
export function parseImportPlan(
  body: Record<string, unknown>,
  importerId?: string,
): ParsedImportPlan {
  const tripBody = obj(body.trip, '"trip"');
  const title = optStr(tripBody.title, '"trip.title"');
  if (!title) throw new ServiceError('bad_request', '"title" is required');
  const startDate = optISODate(tripBody.startDate, '"trip.startDate"');
  const endDate = optISODate(tripBody.endDate, '"trip.endDate"');

  const daysIn = arr(body.days, '"days"');
  if (daysIn.length > MAX_DAYS) {
    throw new ServiceError('bad_request', `"days" exceeds the limit of ${MAX_DAYS}`);
  }
  const days = daysIn.map((d, di) => {
    const dayBody = obj(d, `day ${di + 1}`);
    const placesIn = arr(dayBody.places, `day ${di + 1} "places"`);
    if (placesIn.length > MAX_PLACES_PER_DAY) {
      throw new ServiceError(
        'bad_request',
        `day ${di + 1} "places" exceeds the limit of ${MAX_PLACES_PER_DAY}`,
      );
    }
    const parsedPlaces = placesIn.map((p, pi) =>
      withContext(`day ${di + 1} place ${pi + 1}`, () => {
        const placeBody = obj(p, `day ${di + 1} place ${pi + 1}`);
        return { fields: parsePlaceFields(placeBody), arrive: readArrive(placeBody) ?? null };
      }),
    );
    return {
      date: optISODate(dayBody.date, `day ${di + 1} "date"`),
      places: parsedPlaces.map((x) => x.fields),
      arrives: parsedPlaces.map((x) => x.arrive),
    };
  });

  const hotelsIn = arr(body.hotels, '"hotels"');
  if (hotelsIn.length > MAX_HOTELS) {
    throw new ServiceError('bad_request', `"hotels" exceeds the limit of ${MAX_HOTELS}`);
  }
  const hotels = hotelsIn.map((h, hi) =>
    withContext(`hotel ${hi + 1}`, () => parseHotelFields(obj(h, `hotel ${hi + 1}`))),
  );

  // When no explicit days are given but a date range is, importPlan seeds one
  // day per date — cap that implied count too, so a huge range can't bypass
  // MAX_DAYS with an empty days array.
  if (days.length === 0 && startDate && endDate) {
    const implied = expectedDayCount(startDate, endDate);
    if (implied > MAX_DAYS) {
      throw new ServiceError(
        'bad_request',
        `date range implies ${implied} days, exceeds the limit of ${MAX_DAYS}`,
      );
    }
  }

  const plan: ParsedImportPlan = {
    trip: {
      title,
      subtitle: optStr(tripBody.subtitle, '"trip.subtitle"'),
      startDate,
      endDate,
      cover: optStr(tripBody.cover, '"trip.cover"'),
      sourceUrl: parseHttpUrl(tripBody.sourceUrl, '"trip.sourceUrl"'),
    },
    days,
    hotels,
    sections: parseSections(body),
  };
  // Days the import will create: explicit days, else one per date in range.
  const dayCount =
    days.length > 0
      ? days.length
      : startDate && endDate
        ? expectedDayCount(startDate, endDate)
        : 0;
  checkCrossRefs(plan, dayCount, importerId);
  return plan;
}
