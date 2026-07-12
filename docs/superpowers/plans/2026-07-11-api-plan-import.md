# API Plan Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/v1/trips/import` — one call that creates a whole trip (days + places + hotels) from an agent-authored plan, atomically — plus single-call read-back.

**Architecture:** A new `importPlan` service runs all inserts inside one `dbNode` (postgres-js/TCP) transaction, because the default neon-http `db` can't do interactive transactions. A payload parser (reusing the existing place parser + a new hotel parser) validates and caps input before any write. The import route reuses `withUser` (auth + rate limit + scope) and `withIdempotency`. Read-back composes the existing `loadTrip` with `loadHotelsForTrip` in an API-only helper, leaving the web-facing `loadTrip` untouched.

**Tech Stack:** Next.js 15 App Router route handlers, Drizzle ORM (postgres-js for the transaction, neon-http elsewhere), Postgres (Neon), vitest.

## Global Constraints

- **Zero web-UI impact.** Only additive `/api/v1` changes. The one shared file (`src/lib/seed-days.ts`) gets a behavior-preserving refactor guarded by an equality test. Do **not** modify `loadTrip`, server actions, `trip-queries` web loaders' behavior, or any component.
- **No Google calls at import.** Place IDs are stored in `placeIdExternal` only.
- **Always create a new trip.** No import-into-existing.
- **Atomic:** any `400`/failure writes nothing.
- **Package manager:** `pnpm`. It is not on PATH by default in this environment — prefix commands with `export PATH="/home/wadjakorn/.local/node-v22.14.0-linux-x64/bin:$PATH"` or call `node_modules/.bin/<tool>` directly.
- **Tests:** vitest. Unit tests always run; integration tests self-skip unless `TEST_DATABASE_URL` is set. Run `node_modules/.bin/vitest run`.
- **Caps:** `MAX_DAYS = 60`, `MAX_PLACES_PER_DAY = 100`, `MAX_HOTELS = 50`.
- Spec: `docs/superpowers/specs/2026-07-11-api-plan-import-design.md`.
- Commit after each task. Do not push until the plan is complete and self-reviewed.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app/src/lib/seed-days.ts` | **Modify** — extract a pure `dayRowFields(idx, date)` helper; `seedTripDays` delegates to it (no behavior change). Export `parseISODate`. |
| `app/src/lib/api/hotel-input.ts` | **Create** — `parseHotelFields(body)`: whitelist-pick hotel columns + require `name`. |
| `app/src/lib/api/import-input.ts` | **Create** — `parseImportPlan(body)`: validate top-level shape, caps, delegate to place/hotel parsers. |
| `app/src/lib/services/import-service.ts` | **Create** — `importPlan(userId, plan)`: one `dbNode` transaction inserting trip → days → places → hotels. |
| `app/src/lib/trip-queries.ts` | **Modify** — add API-only `loadApiTrip(tripId)` = `loadTrip` + `loadHotelsForTrip`. |
| `app/src/app/api/v1/trips/import/route.ts` | **Create** — POST handler wiring auth/idempotency/parse/service/read-back. |
| `app/src/app/api/v1/trips/[tripId]/route.ts` | **Modify** — GET returns `hotels[]` via `loadApiTrip` (additive). |
| `API.md`, `agent-skill/travel-planner-api/SKILL.md`, `REQUIREMENTS.md` | **Modify** — document import + extended GET; lead agent docs with import. |
| Test files | co-located `*.test.ts` (unit) + `*.integration.test.ts` (DB). |

---

## Task 1: Extract pure day-row helper in `seed-days.ts` (web-UI guardrail)

**Files:**
- Modify: `app/src/lib/seed-days.ts`
- Test: `app/src/lib/seed-days.test.ts`

**Interfaces:**
- Produces: `dayRowFields(idx: number, date: Date | null): { label: string; num: number; date: string; title: string }` and `parseISODate(iso: string): Date | null` (exported).

- [ ] **Step 1: Write the failing test** — `app/src/lib/seed-days.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { dayRowFields, parseISODate } from './seed-days';

describe('dayRowFields', () => {
  it('derives label/num/date from a real date, title from index', () => {
    // 2026-11-01 is a Sunday.
    const d = parseISODate('2026-11-01')!;
    expect(dayRowFields(0, d)).toEqual({
      label: 'Sun',
      num: 1,
      date: 'Sunday, November 1',
      title: 'Day 1',
    });
  });

  it('falls back to Day N labels when there is no date', () => {
    expect(dayRowFields(2, null)).toEqual({
      label: 'Day',
      num: 3,
      date: 'Day 3',
      title: 'Day 3',
    });
  });
});

describe('parseISODate', () => {
  it('parses a valid ISO date', () => {
    expect(parseISODate('2026-11-05')).toEqual(new Date(2026, 10, 5));
  });
  it('returns null for a bad string', () => {
    expect(parseISODate('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/home/wadjakorn/.local/node-v22.14.0-linux-x64/bin:$PATH"; node_modules/.bin/vitest run src/lib/seed-days.test.ts`
Expected: FAIL — `dayRowFields`/`parseISODate` not exported.

- [ ] **Step 3: Refactor `seed-days.ts` to add the pure helper**

Make `parseISODate` exported (change `function parseISODate` → `export function parseISODate`). Add after `partsForDate`:

```ts
// Pure day-row field derivation shared by seedTripDays and the plan importer.
// With a date: weekday/day-number/pretty-date from the date, title "Day N".
// Without a date: neutral "Day N" placeholders (label/num/date are NOT NULL).
export function dayRowFields(
  idx: number,
  date: Date | null,
): { label: string; num: number; date: string; title: string } {
  if (date) {
    const p = partsForDate(date);
    return { label: p.label, num: p.num, date: p.dateLabel, title: `Day ${idx + 1}` };
  }
  return { label: 'Day', num: idx + 1, date: `Day ${idx + 1}`, title: `Day ${idx + 1}` };
}
```

Then change the row build inside `seedTripDays` to delegate (behavior identical — it always has a date):

```ts
    const idx = startIdx + i;
    rows.push({ tripId, idx, ...dayRowFields(idx, d) });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest run src/lib/seed-days.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Verify no behavior change to the seeder**

Run: `export PATH="/home/wadjakorn/.local/node-v22.14.0-linux-x64/bin:$PATH"; node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/seed-days.ts app/src/lib/seed-days.test.ts
git commit -m "refactor(days): extract pure dayRowFields helper for reuse [API-IMPORT]"
```

---

## Task 2: Hotel field parser

**Files:**
- Create: `app/src/lib/api/hotel-input.ts`
- Test: `app/src/lib/api/hotel-input.test.ts`

**Interfaces:**
- Produces: `parseHotelFields(body: Record<string, unknown>): HotelFields` where `HotelFields = Record<string, unknown> & { name: string }` — a whitelist-picked subset of the writable hotel columns with a validated `name`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing test** — `app/src/lib/api/hotel-input.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseHotelFields } from './hotel-input';
import { ServiceError } from '@/lib/services/service-error';

describe('parseHotelFields', () => {
  it('keeps only whitelisted fields and requires name', () => {
    const out = parseHotelFields({
      name: 'Hotel Granvia',
      checkInDate: '2026-11-01',
      lat: 34.98,
      placeIdExternal: 'ChIJ123',
      dayIdx: 0,
      id: 'HACK',            // server-managed, must be dropped
      tripId: 'HACK',        // dropped
      bogus: 'nope',         // unknown, dropped
    });
    expect(out).toEqual({
      name: 'Hotel Granvia',
      checkInDate: '2026-11-01',
      lat: 34.98,
      placeIdExternal: 'ChIJ123',
      dayIdx: 0,
    });
  });

  it('throws bad_request when name is missing or blank', () => {
    expect(() => parseHotelFields({ address: 'x' })).toThrow(ServiceError);
    expect(() => parseHotelFields({ name: '  ' })).toThrow('"name" is required');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/api/hotel-input.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `hotel-input.ts`**

```ts
// Map a JSON request body to the writable hotel columns the booking-service
// insert takes. Mirrors the whitelist in booking-service.createHotel, but as a
// standalone parser the plan importer can reuse inside a transaction.

import { ServiceError } from '@/lib/services/service-error';

// Server-managed columns (id/tripId/timestamps/deletedAt) are never accepted.
const HOTEL_FIELDS = [
  'dayIdx', 'name', 'address', 'lat', 'lng', 'placeIdExternal',
  'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime', 'nights',
  'room', 'guests', 'ref', 'costAmount', 'costCurrency', 'cancellation',
  'contact', 'notes', 'thumb', 'arrivalMode', 'departureMode',
  'attachmentName', 'attachmentSize',
] as const;

export type HotelFields = Record<string, unknown> & { name: string };

export function parseHotelFields(body: Record<string, unknown>): HotelFields {
  const out: Record<string, unknown> = {};
  for (const k of HOTEL_FIELDS) if (body[k] !== undefined) out[k] = body[k];
  if (typeof out.name !== 'string' || !out.name.trim()) {
    throw new ServiceError('bad_request', '"name" is required');
  }
  return out as HotelFields;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run src/lib/api/hotel-input.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/api/hotel-input.ts app/src/lib/api/hotel-input.test.ts
git commit -m "feat(api): parseHotelFields for JSON hotel input [API-IMPORT]"
```

---

## Task 3: Import payload parser + caps

**Files:**
- Create: `app/src/lib/api/import-input.ts`
- Test: `app/src/lib/api/import-input.test.ts`

**Interfaces:**
- Consumes: `parsePlaceFields` (`@/lib/api/place-input`, existing → `PlaceFields`), `parseHotelFields` (Task 2 → `HotelFields`).
- Produces:
```ts
type ParsedImportPlan = {
  trip: { title: string; subtitle: string | null; startDate: string | null; endDate: string | null; cover: string | null };
  days: { date: string | null; places: import('@/lib/services/place-service').PlaceFields[] }[];
  hotels: import('@/lib/api/hotel-input').HotelFields[];
};
export const MAX_DAYS = 60;
export const MAX_PLACES_PER_DAY = 100;
export const MAX_HOTELS = 50;
export function parseImportPlan(body: Record<string, unknown>): ParsedImportPlan;
```

- [ ] **Step 1: Write the failing test** — `app/src/lib/api/import-input.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseImportPlan, MAX_DAYS, MAX_PLACES_PER_DAY } from './import-input';
import { ServiceError } from '@/lib/services/service-error';

const base = { trip: { title: 'Kyoto' } };

describe('parseImportPlan', () => {
  it('accepts a minimal trip with no days/hotels', () => {
    const out = parseImportPlan({ trip: { title: 'Kyoto' } });
    expect(out.trip.title).toBe('Kyoto');
    expect(out.days).toEqual([]);
    expect(out.hotels).toEqual([]);
  });

  it('parses days, places and hotels', () => {
    const out = parseImportPlan({
      trip: { title: 'Kyoto', startDate: '2026-11-01', endDate: '2026-11-02' },
      days: [{ date: '2026-11-01', places: [{ kind: 'food', name: 'Nishiki', lat: 35, lng: 135 }] }],
      hotels: [{ name: 'Granvia', checkInDate: '2026-11-01' }],
    });
    expect(out.days).toHaveLength(1);
    expect(out.days[0].places[0].name).toBe('Nishiki');
    expect(out.days[0].date).toBe('2026-11-01');
    expect(out.hotels[0].name).toBe('Granvia');
  });

  it('requires a non-empty title', () => {
    expect(() => parseImportPlan({ trip: { title: '' } })).toThrow('"title" is required');
    expect(() => parseImportPlan({})).toThrow(ServiceError);
  });

  it('rejects a bad place kind (delegated to parsePlaceFields)', () => {
    expect(() =>
      parseImportPlan({ ...base, days: [{ places: [{ kind: 'x', name: 'y' }] }] }),
    ).toThrow(ServiceError);
  });

  it('enforces caps', () => {
    const days = Array.from({ length: MAX_DAYS + 1 }, () => ({ places: [] }));
    expect(() => parseImportPlan({ ...base, days })).toThrow(`"days" exceeds the limit of ${MAX_DAYS}`);

    const places = Array.from({ length: MAX_PLACES_PER_DAY + 1 }, () => ({ kind: 'food', name: 'p' }));
    expect(() => parseImportPlan({ ...base, days: [{ places }] })).toThrow(
      `exceeds the limit of ${MAX_PLACES_PER_DAY}`,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/api/import-input.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `import-input.ts`**

```ts
// Validate + normalize the /api/v1/trips/import payload. Delegates per-entity
// validation to the existing place parser and the hotel parser, and enforces
// payload-size caps so one request can't create an unbounded plan. Throws
// ServiceError('bad_request') on any problem — the route maps it to 400 and
// (because importPlan runs in a transaction) nothing is written.

import { ServiceError } from '@/lib/services/service-error';
import { parsePlaceFields } from '@/lib/api/place-input';
import { parseHotelFields, type HotelFields } from '@/lib/api/hotel-input';
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
  if (typeof v !== 'string') throw new ServiceError('bad_request', `${label} must be a string`);
  const t = v.trim();
  return t === '' ? null : t;
}

function arr(v: unknown, label: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ServiceError('bad_request', `${label} must be an array`);
  return v;
}

export function parseImportPlan(body: Record<string, unknown>): ParsedImportPlan {
  const tripBody = obj(body.trip, '"trip"');
  const title = optStr(tripBody.title, '"trip.title"');
  if (!title) throw new ServiceError('bad_request', '"title" is required');

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
    const places = placesIn.map((p, pi) => {
      try {
        return parsePlaceFields(obj(p, `day ${di + 1} place ${pi + 1}`));
      } catch (e) {
        if (e instanceof ServiceError) {
          throw new ServiceError('bad_request', `day ${di + 1} place ${pi + 1}: ${e.message}`);
        }
        throw e;
      }
    });
    return { date: optStr(dayBody.date, `day ${di + 1} "date"`), places };
  });

  const hotelsIn = arr(body.hotels, '"hotels"');
  if (hotelsIn.length > MAX_HOTELS) {
    throw new ServiceError('bad_request', `"hotels" exceeds the limit of ${MAX_HOTELS}`);
  }
  const hotels = hotelsIn.map((h, hi) => {
    try {
      return parseHotelFields(obj(h, `hotel ${hi + 1}`));
    } catch (e) {
      if (e instanceof ServiceError) {
        throw new ServiceError('bad_request', `hotel ${hi + 1}: ${e.message}`);
      }
      throw e;
    }
  });

  return {
    trip: {
      title,
      subtitle: optStr(tripBody.subtitle, '"trip.subtitle"'),
      startDate: optStr(tripBody.startDate, '"trip.startDate"'),
      endDate: optStr(tripBody.endDate, '"trip.endDate"'),
      cover: optStr(tripBody.cover, '"trip.cover"'),
    },
    days,
    hotels,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run src/lib/api/import-input.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/api/import-input.ts app/src/lib/api/import-input.test.ts
git commit -m "feat(api): parseImportPlan payload validation + caps [API-IMPORT]"
```

---

## Task 4: `importPlan` transactional service

**Files:**
- Create: `app/src/lib/services/import-service.ts`
- Test: `app/src/lib/services/import-service.integration.test.ts`

**Interfaces:**
- Consumes: `ParsedImportPlan` (Task 3); `dbNode` (`@/db`); `dayRowFields`, `parseISODate` (Task 1); schema tables.
- Produces: `importPlan(userId: string, plan: ParsedImportPlan, database?: typeof dbNode): Promise<{ id: string }>` — inserts everything in one transaction and returns the new trip id. `database` is injectable for tests.

**Day derivation rule (from spec §4):** for day index `i`, `effectiveDate = day.date ?? (trip.startDate + i days) ?? null`; build fields with `dayRowFields(i, effectiveDate)`. If `days` is empty **and** both `startDate`+`endDate` are present, seed the skeleton for the whole range.

- [ ] **Step 1: Write the failing integration test** — `app/src/lib/services/import-service.integration.test.ts`

```ts
// Skipped unless TEST_DATABASE_URL is set (same pattern as
// rate-limit.integration.test.ts). Run against a scratch Postgres:
//   TEST_DATABASE_URL=postgres://postgres:pw@localhost:5432/tp pnpm test
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { parseImportPlan } from '@/lib/api/import-input';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

suite('importPlan (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let importPlan: typeof import('./import-service').importPlan;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    db = drizzle(client, { schema });
    // Apply the full schema so trip/day/place/hotel FKs exist.
    await client.file('drizzle/0000_stormy_harpoon.sql').catch(() => {});
    // Simpler: assume migrations already applied to the scratch DB via
    // `drizzle-kit migrate`. The test only needs a user row to own the trip.
    await db.execute(sql`INSERT INTO "user"(id,name,email) VALUES ('imp-u1','I','i@t.local') ON CONFLICT (id) DO NOTHING`);
    ({ importPlan } = await import('./import-service'));
  });

  afterAll(async () => { await client?.end(); });

  it('creates trip + ordered days + ordered places + hotels', async () => {
    const plan = parseImportPlan({
      trip: { title: 'Kyoto', startDate: '2026-11-01', endDate: '2026-11-02' },
      days: [
        { date: '2026-11-01', places: [
          { kind: 'food', name: 'A', lat: 35, lng: 135 },
          { kind: 'sight', name: 'B', lat: 35, lng: 135 },
        ] },
        { date: '2026-11-02', places: [{ kind: 'food', name: 'C' }] },
      ],
      hotels: [{ name: 'Granvia', checkInDate: '2026-11-01' }],
    });
    const { id } = await importPlan('imp-u1', plan, db as never);

    const dayRows = await db.execute(sql`SELECT id, idx FROM day WHERE trip_id = ${id} ORDER BY idx`);
    expect(dayRows.length).toBe(2);
    const placeRows = await db.execute(sql`SELECT name, idx, day_id FROM place WHERE day_id = ${(dayRows as any)[0].id} ORDER BY idx`);
    expect((placeRows as any).map((r: any) => r.name)).toEqual(['A', 'B']);
    const hotelRows = await db.execute(sql`SELECT name FROM hotel_booking WHERE trip_id = ${id}`);
    expect((hotelRows as any)[0].name).toBe('Granvia');
  });

  it('rolls back completely on a mid-plan failure', async () => {
    // A place with a NULL name bypasses the parser (constructed directly) to
    // force a DB NOT-NULL violation inside the transaction.
    const badPlan = {
      trip: { title: 'RollbackTrip', startDate: null, endDate: null, cover: null, subtitle: null },
      days: [{ date: null, places: [{ kind: 'food', name: null } as never] }],
      hotels: [],
    };
    await expect(importPlan('imp-u1', badPlan as never, db as never)).rejects.toThrow();
    const trips = await db.execute(sql`SELECT id FROM trip WHERE title = 'RollbackTrip'`);
    expect(trips.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/services/import-service.integration.test.ts` (with `TEST_DATABASE_URL` set to a migrated scratch DB)
Expected: FAIL — `import-service` module not found.

- [ ] **Step 3: Implement `import-service.ts`**

```ts
// One-shot plan import (API-IMPORT). Inserts trip → days → places → hotels in a
// SINGLE transaction via the postgres-js `dbNode` client (the neon-http `db`
// can't do interactive transactions). Any failure rolls the whole plan back, so
// a bad payload never leaves an orphan trip. No Google calls, no segments.

import 'server-only';
import { dbNode } from '@/db';
import { trips, days, places, hotelBookings } from '@/db/schema';
import { dayRowFields, parseISODate } from '@/lib/seed-days';
import { expectedDayCount } from '@/lib/seed-days';
import type { ParsedImportPlan } from '@/lib/api/import-input';

// The effective date for day index i: explicit day.date, else startDate + i.
function effectiveDate(
  dayDate: string | null,
  startDate: string | null,
  i: number,
): Date | null {
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

export async function importPlan(
  userId: string,
  plan: ParsedImportPlan,
  database: typeof dbNode = dbNode,
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const [trip] = await tx
      .insert(trips)
      .values({
        ownerId: userId,
        title: plan.trip.title,
        subtitle: plan.trip.subtitle,
        startDate: plan.trip.startDate,
        endDate: plan.trip.endDate,
        cover: plan.trip.cover,
      })
      .returning({ id: trips.id });

    // Day rows: explicit payload days, or (when none) the date-range skeleton.
    let dayInputs = plan.days;
    if (dayInputs.length === 0 && plan.trip.startDate && plan.trip.endDate) {
      const n = expectedDayCount(plan.trip.startDate, plan.trip.endDate);
      dayInputs = Array.from({ length: n }, () => ({ date: null, places: [] }));
    }

    for (let i = 0; i < dayInputs.length; i++) {
      const di = dayInputs[i];
      const date = effectiveDate(di.date, plan.trip.startDate, i);
      const [day] = await tx
        .insert(days)
        .values({ tripId: trip.id, idx: i, ...dayRowFields(i, date) })
        .returning({ id: days.id });

      for (let j = 0; j < di.places.length; j++) {
        await tx.insert(places).values({ ...di.places[j], dayId: day.id, idx: j });
      }
    }

    for (const hotel of plan.hotels) {
      await tx.insert(hotelBookings).values({ ...hotel, tripId: trip.id, name: hotel.name });
    }

    return { id: trip.id };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest run src/lib/services/import-service.integration.test.ts` (with `TEST_DATABASE_URL`)
Expected: PASS (2 tests) — creation + rollback.

- [ ] **Step 5: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/services/import-service.ts app/src/lib/services/import-service.integration.test.ts
git commit -m "feat(api): importPlan transactional service (dbNode) [API-IMPORT]"
```

---

## Task 5: API read-back helper + extend GET `/trips/:tripId`

**Files:**
- Modify: `app/src/lib/trip-queries.ts` (add `loadApiTrip`)
- Modify: `app/src/app/api/v1/trips/[tripId]/route.ts` (GET uses `loadApiTrip`)

**Interfaces:**
- Consumes: existing `loadTrip`, `loadHotelsForTrip` (both in `trip-queries.ts`).
- Produces: `loadApiTrip(tripId: string): Promise<(LoadedTrip & { hotels: HotelBooking[] }) | null>`.

**Why a new function:** `loadTrip` is consumed by the web UI; do not change its shape. `loadApiTrip` is API-only and additive.

- [ ] **Step 1: Add `loadApiTrip` to `trip-queries.ts`**

Add near `loadTrip` (it and `loadHotelsForTrip` already exist in this file):

```ts
// API read-back: the full trip plus its hotels, for /api/v1 responses. Kept
// separate from loadTrip so the web-facing loader's shape is untouched.
export async function loadApiTrip(tripId: string) {
  const trip = await loadTrip(tripId);
  if (!trip) return null;
  const hotels = await loadHotelsForTrip(tripId);
  return { ...trip, hotels };
}
```

- [ ] **Step 2: Use it in the GET handler**

In `app/src/app/api/v1/trips/[tripId]/route.ts`, change the import and the GET body:

```ts
import { loadApiTrip, loadTripBasic } from '@/lib/trip-queries';
```

```ts
export function GET(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    await requireTripAccess(userId, tripId, 'read');
    const trip = await loadApiTrip(tripId);
    if (!trip) throw new ServiceError('not_found', 'Trip not found');
    return apiJson({ trip });
  });
}
```

(Leave `PATCH`/`DELETE` unchanged — `loadTripBasic` is still imported for PATCH.)

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Verify GET returns hotels (manual, against a scratch DB)**

With a dev server on a migrated scratch DB and a seeded token (see the rate-limit PR's verification recipe), create a hotel then:
Run: `curl -s $HOST/api/v1/trips/$TRIP -H "Authorization: Bearer $TOKEN" | jq '.trip | {days: (.days|length), hotels: (.hotels|length)}'`
Expected: JSON includes a `hotels` array.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/trip-queries.ts app/src/app/api/v1/trips/[tripId]/route.ts
git commit -m "feat(api): include hotels[] in GET /trips/:tripId read-back [API-IMPORT]"
```

---

## Task 6: Import route wiring

**Files:**
- Create: `app/src/app/api/v1/trips/import/route.ts`

**Interfaces:**
- Consumes: `withUser`, `readJsonBody` (`@/lib/api/http`); `withIdempotency` (`@/lib/api/idempotency`); `parseImportPlan` (Task 3); `importPlan` (Task 4); `loadApiTrip` (Task 5); `apiJson` (`@/lib/api-response`).

- [ ] **Step 1: Implement the route**

```ts
// POST /api/v1/trips/import — create a whole trip (days + places + hotels) from
// an agent-authored plan, atomically. Always creates a NEW trip. Read-write
// scope + rate limit come from withUser; retries are safe via Idempotency-Key.

import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { withIdempotency } from '@/lib/api/idempotency';
import { parseImportPlan } from '@/lib/api/import-input';
import { importPlan } from '@/lib/services/import-service';
import { loadApiTrip } from '@/lib/trip-queries';

export function POST(req: Request) {
  return withUser(req, async (userId) => {
    const body = await readJsonBody(req);
    return withIdempotency(userId, req, body, async () => {
      const plan = parseImportPlan(body);
      const { id } = await importPlan(userId, plan);
      const trip = await loadApiTrip(id);
      return { status: 201, body: { trip } };
    });
  });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint src/app/api/v1/trips/import/route.ts src/lib/services/import-service.ts src/lib/api/import-input.ts src/lib/api/hotel-input.ts`
Expected: exit 0, no errors.

- [ ] **Step 3: End-to-end verification (scratch DB + dev server)**

Bring up a scratch Postgres, `drizzle-kit migrate`, start `next dev`, seed a read-write token (reuse the rate-limit PR recipe). Then:

```bash
curl -s -X POST $HOST/api/v1/trips/import \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"trip":{"title":"Kyoto","startDate":"2026-11-01","endDate":"2026-11-02"},
       "days":[{"date":"2026-11-01","places":[{"kind":"food","name":"Nishiki","lat":35.0,"lng":135.7}]}],
       "hotels":[{"name":"Granvia","checkInDate":"2026-11-01"}]}' | jq '.trip | {id, days:(.days|length), places:(.days[0].places|length), hotels:(.hotels|length)}'
```
Expected: `201`, one day, one place, one hotel. Re-running with the same `Idempotency-Key` returns the same trip id (no duplicate). A payload with a bad `kind` returns `400` and creates no trip.

- [ ] **Step 4: Commit**

```bash
git add app/src/app/api/v1/trips/import/route.ts
git commit -m "feat(api): POST /api/v1/trips/import route [API-IMPORT]"
```

---

## Task 7: Documentation

**Files:**
- Modify: `API.md`, `agent-skill/travel-planner-api/SKILL.md`, `REQUIREMENTS.md`

- [ ] **Step 1: `API.md`** — Add an "Import a plan (agents start here)" section near the top of the endpoint docs, before the granular trip table, documenting `POST /trips/import` with the payload from Task 6 and the `201 { trip }` read-back. Add a row to the Endpoints table:

```
| `POST /trips/import` | `{ trip{title*,…}, days[{date?,places[]}], hotels[] }` | `201 { trip }` — creates a new trip with days+places+hotels, atomically. Idempotent. |
```

Note in the trip GET row that the response now includes `hotels[]`. In "Not in v1", clarify transport/expenses/notes are not importable yet and import always creates a new trip.

- [ ] **Step 2: `agent-skill/.../SKILL.md`** — Add an early "Import a whole plan" recipe (the primary flow: build the JSON, POST once, done), and demote the per-endpoint CRUD to "fine-grained edits (optional)". Reference caps (≤60 days, ≤100 places/day, ≤50 hotels → 400) and that `name` (+lat/lng) is required per place/hotel; place IDs go in `placeIdExternal`.

- [ ] **Step 3: `REQUIREMENTS.md`** — In the API surface note (§4, near ApiToken/rate-limit), add one line: `POST /api/v1/trips/import` — one-shot agent plan import (new trip; days+places+hotels; atomic).

- [ ] **Step 4: Commit**

```bash
git add API.md agent-skill/travel-planner-api/SKILL.md REQUIREMENTS.md
git commit -m "docs(api): document plan import + hotels[] read-back [API-IMPORT]"
```

---

## Final verification (before PR)

- [ ] `node_modules/.bin/vitest run` → all unit tests pass; integration self-skips without `TEST_DATABASE_URL`.
- [ ] With `TEST_DATABASE_URL` (migrated scratch DB) → integration tests pass (creation + rollback).
- [ ] `node_modules/.bin/tsc --noEmit` → exit 0.
- [ ] `node_modules/.bin/eslint src` → no new errors (pre-existing warnings in unrelated files are fine).
- [ ] `node_modules/.bin/next build` → exit 0.
- [ ] Manual E2E (Task 6 Step 3) → 201 create, idempotent retry, 400 rollback all confirmed.
- [ ] Self-review with `codex` (per repo workflow), then open PR to `main`. Move ticket `ShULpTKuaROd` to Review (`completed`) and link the PR.

## Web-UI safety checklist (Global Constraint)

- [ ] `loadTrip` return shape unchanged (only `loadApiTrip` added).
- [ ] `seedTripDays` output unchanged (Task 1 equality test green).
- [ ] No edits to server actions, components, or web render paths.
- [ ] `git diff --stat` on merge touches only `app/src/lib/{seed-days,trip-queries,api/*,services/import-service}.ts`, `app/src/app/api/v1/trips/**`, docs, and tests.
