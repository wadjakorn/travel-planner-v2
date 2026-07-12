// Validate + normalize the /api/v1/trips/import payload (API-IMPORT). Delegates
// per-entity validation to the existing place parser and the hotel parser, and
// enforces payload-size caps so one request can't create an unbounded plan.
// Throws ServiceError('bad_request') on any problem — the route maps it to 400
// and (because importPlan runs in a transaction) nothing is written.

import { ServiceError } from '@/lib/services/service-error';
import { parsePlaceFields } from '@/lib/api/place-input';
import { parseHotelFields, type HotelFields } from '@/lib/api/hotel-input';
import { expectedDayCount } from '@/lib/seed-days';
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
  };
  days: { date: string | null; places: PlaceFields[] }[];
  hotels: HotelFields[];
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
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) {
      return s;
    }
  }
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

export function parseImportPlan(body: Record<string, unknown>): ParsedImportPlan {
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
    const places = placesIn.map((p, pi) =>
      withContext(`day ${di + 1} place ${pi + 1}`, () =>
        parsePlaceFields(obj(p, `day ${di + 1} place ${pi + 1}`)),
      ),
    );
    return { date: optISODate(dayBody.date, `day ${di + 1} "date"`), places };
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

  return {
    trip: {
      title,
      subtitle: optStr(tripBody.subtitle, '"trip.subtitle"'),
      startDate,
      endDate,
      cover: optStr(tripBody.cover, '"trip.cover"'),
    },
    days,
    hotels,
  };
}
