import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

// One run's shared state (TP-0159): the API token and the seed trip, made once
// in global-setup.ts and removed in global-teardown.ts. Specs read it lazily:
// Playwright loads spec files to list tests before global setup runs.

export const STATE_FILE = path.join(__dirname, '.state', 'run.json');

export type RunState = { token: string; tokenName: string; seedTripId: string };

let cached: RunState | null = null;
export function runState(): RunState {
  if (!cached) {
    if (!fs.existsSync(STATE_FILE)) throw new Error(`${STATE_FILE} missing: global-setup.ts did not run`);
    cached = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as RunState;
  }
  return cached;
}

// Each run names its own token and revokes only that one: the e2e DB is shared, so a
// fixed name let one run's cleanup revoke another concurrent run's token (TP-0135).
// The name carries its creation time so teardown can tell a stale token from a live run's.
export const FIXTURE_TOKEN_PREFIX = 'tp0127-e2e';
export const tokenNameNow = () => `${FIXTURE_TOKEN_PREFIX}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 4)}`;
const STAMPED = new RegExp(`^${FIXTURE_TOKEN_PREFIX}-([0-9a-z]{8,9})-[0-9a-f]{4}$`);
/** Names from before TP-0159: `tp0127-e2e-` + 8 hex, no timestamp. */
const LEGACY = new RegExp(`^${FIXTURE_TOKEN_PREFIX}-[0-9a-f]{8}$`);

/** Creation time of a stamped token name, null for any other name. */
export function tokenBornAt(name: string): number | null {
  const m = name.match(STAMPED);
  return m ? parseInt(m[1], 36) : null;
}
export const isLegacyTokenName = (name: string) => LEGACY.test(name);

/** Mints a token through Settings → API access (the API cannot mint one). */
export async function mintToken(page: Page, name: string): Promise<string> {
  await page.goto('/settings?s=tokens');
  const row = page.locator('[class*="tokenCreateRow"]');
  await row.locator('input').fill(name);
  await row.locator('button').click();
  const plain = page.getByText(/^tp_/).first();
  await expect(plain).toBeVisible();
  return (await plain.textContent())!.trim();
}

/** REST call with the run's token. Playwright's failure log prints request headers: keep the token out of it. */
export async function api(
  request: APIRequestContext,
  method: 'get' | 'post' | 'delete' | 'put' | 'patch',
  url: string,
  token: string,
  data?: unknown,
  idempotent = true,
) {
  let res;
  try {
    res = await request[method](url, {
      timeout: 60_000,
      headers: { Authorization: `Bearer ${token}`, ...(method === 'post' && idempotent ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },
      data,
    });
  } catch (e) {
    throw new Error(`${method} ${url} failed: ${String(e).split('\n')[0].replace(/tp_[\w-]+/g, 'tp_***')}`);
  }
  // Every worker shares the run's token, and the API allows 60 requests/min per token by default.
  if (res.status() === 429) throw new Error(`${method} ${url}: 429. Start the e2e server with API_RATE_LIMIT_MAX=100000 (AGENTS.md).`);
  return res;
}

// ── The seed trip. findTrip() returns it, so the top-level tests no longer depend on whichever
// trip happens to be newest on Home (TP-0158: a one-day leftover fixture). ?day= is 0-based.
// What each test needs from it:
//   day 0  12 located stops: a list taller than a phone (flow 5 scrolls 600 px), leg rails between
//          rows (leg bands, T1, T2, T6b), a day with ≥ 3 cards (flow 1, C3 viewer)
//   day 1  4 located stops: the tests that open ?day=1 need ≥ 2 pins there (flow 9, T3, T4, T5, T6)
//   day 2  1 located stop: T5 "no guide on a day with a single pin"
//   day 3  no stops: flow 8 "a day with no stops keeps the stack in place"
//   day 4  a stop with no coordinates first, then 2 located: an unlocated row in the list
//   ≥ 2 days in all: flow 1 walks every day, flow 3 taps Next day
//   hotel  located, nights 0 → 1, so day 0 ends at a hotel leg
// Tests on it must not change it: T6b's drag test cancels with Escape, and nothing else writes.
export const SEED_TITLE = 'e2e seed';
const at = (tag: string, lat: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ kind: 'sight', name: `Seed ${tag}-${i + 1}`, lat: lat + i * 0.01, lng: 135.7 + i * 0.01 }));
export const SEED_IMPORT = {
  trip: { title: SEED_TITLE, startDate: '2030-01-01', endDate: '2030-01-05' },
  days: [
    { places: at('a', 35, 12) },
    { places: at('b', 35.2, 4) },
    { places: at('c', 35.3, 1) },
    { places: [] },
    { places: [{ kind: 'sight', name: 'Seed e-nowhere', lat: null, lng: null }, ...at('e', 35.4, 2)] },
  ],
  hotels: [{ name: 'Seed hotel', checkInDate: '2030-01-01', checkOutDate: '2030-01-02', lat: 35.13, lng: 135.83 }],
};

// Trips e2e creates, by title prefix (createFixture, legsTrip, the TP-0152 badge trip, the seed).
// An allowlist on purpose: the dev user also holds the owner's real trips.
export const E2E_TRIP_PREFIXES = ['TP-0127 e2e', 'TP-0141 e2e', 'TP-0152 e2e', SEED_TITLE];
export const isE2eTripTitle = (title: string | null) => !!title && E2E_TRIP_PREFIXES.some((p) => title.startsWith(p));
