import fs from 'node:fs';
import { chromium, type FullConfig, type Page } from '@playwright/test';
import {
  api,
  FIXTURE_TOKEN_PREFIX,
  isE2eTripTitle,
  isLegacyTokenName,
  SEED_TITLE,
  STATE_FILE,
  tokenBornAt,
  type RunState,
} from './run-state';

// TP-0159: removes this run's seed trip and token, then sweeps what earlier runs left behind
// (an afterAll that never ran, a killed run). Only e2e-named trips and tokens, and only ones old
// enough not to belong to another run still going. A failure here is logged, never fails the run.
const HOUR = 3_600_000;
/** A fixture lives one describe (minutes); a seed trip and a token live a whole run (hours). */
const FIXTURE_STALE = HOUR;
const RUN_STALE = 6 * HOUR;

type TripRow = { id: string; title: string | null; role: string; createdAt: string };

export default async function globalTeardown(config: FullConfig) {
  if (!fs.existsSync(STATE_FILE)) return;
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as RunState;
  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();
  try {
    // UTC both sides: the page prints "Last used" dates in the browser's zone, compared with today below.
    const ctx = await browser.newContext({ baseURL, timezoneId: 'UTC' });
    await ctx.addCookies([{ name: 'lang', value: 'en', url: baseURL }]);
    const page = await ctx.newPage();
    await step('sweep trips', () => sweepTrips(page, baseURL, state));
    await step('revoke tokens', () => revokeTokens(page, state));
    fs.rmSync(STATE_FILE, { force: true });
  } catch (e) {
    console.warn(`[e2e teardown] ${String(e).split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

async function step(what: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.warn(`[e2e teardown] ${what} failed: ${String(e).split('\n')[0].replace(/tp_[\w-]+/g, 'tp_***')}`);
  }
}

async function sweepTrips(page: Page, baseURL: string, state: RunState) {
  const res = await api(page.request, 'get', `${baseURL}/api/v1/trips`, state.token);
  if (!res.ok()) throw new Error(`GET /trips ${res.status()}`);
  const { trips } = (await res.json()) as { trips: TripRow[] };
  const now = Date.now();
  const doomed = trips.filter((t) => {
    if (t.role !== 'owner' || !isE2eTripTitle(t.title)) return false;
    if (t.id === state.seedTripId) return true;
    const age = now - new Date(t.createdAt).getTime();
    return age > (t.title === SEED_TITLE ? RUN_STALE : FIXTURE_STALE);
  });
  let gone = 0;
  for (const t of doomed) {
    const del = await api(page.request, 'delete', `${baseURL}/api/v1/trips/${t.id}`, state.token);
    if (del.ok()) gone += 1;
    else console.warn(`[e2e teardown] DELETE trip ${t.id} (${t.title}): ${del.status()}`);
  }
  if (doomed.length > 1) console.log(`[e2e teardown] removed ${gone} e2e trip(s)`);
}

/** Through Settings → API access: the API has no token endpoints. This run's token goes last. */
async function revokeTokens(page: Page, state: RunState) {
  await page.goto('/settings?s=tokens');
  const rows = page.locator('[class*="tokenRow"]');
  // The list loads after mount, and this run's own token is always in it.
  await rows.filter({ has: page.getByText(state.tokenName, { exact: true }) }).waitFor();
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'UTC' });
  const listed = await rows.evaluateAll((els) =>
    els.map((el) => ({
      name: el.querySelector('[class*="tokenName"]')?.textContent ?? '',
      meta: el.querySelector('[class*="tokenMeta"]')?.textContent ?? '',
    })),
  );
  const now = Date.now();
  const stale = listed
    .filter(({ name, meta }) => {
      if (!name.startsWith(FIXTURE_TOKEN_PREFIX) || name === state.tokenName) return false;
      const born = tokenBornAt(name);
      if (born != null) return now - born > RUN_STALE;
      // Older names carry no time: a run of the old code still going used its token today.
      return isLegacyTokenName(name) && !meta.includes(today);
    })
    .map((t) => t.name);
  for (const name of [...stale, state.tokenName]) {
    const row = rows.filter({ has: page.getByText(name, { exact: true }) });
    await row.locator('button').click();
    await row.waitFor({ state: 'detached' });
  }
  if (stale.length) console.log(`[e2e teardown] revoked ${stale.length} stale e2e token(s)`);
}
