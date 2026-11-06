import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect, type FullConfig, type Page } from '@playwright/test';
import { api, mintToken, SEED_IMPORT, STATE_FILE, tokenNameNow, type RunState } from './run-state';

// TP-0159: one token and one seed trip per run, instead of a token per describe × lang × project
// (and again after every worker restart). Written to e2e/.state/run.json for the specs and teardown.
/** The suite asserts Google map chrome (I6, POI, badges). The browser key allows only some origins, and on any
 *  other the app quietly falls back to MapLibre and those tests fail far from the cause (TP-0160). */
async function expectGoogleMap(page: Page, tripId: string) {
  if (process.env.E2E_SKIP_GOOGLE_CHECK === '1') return;
  // Google draws .gm-style before it checks the key, so wait for its logo and then a few seconds more:
  // a rejected origin logs RefererNotAllowedMapError and the app swaps in MapLibre.
  let rejected = '';
  page.on('console', (m) => {
    if (/RefererNotAllowed|Google Maps unavailable/.test(m.text())) rejected ||= m.text().split('\n')[0];
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/trip/${tripId}`);
  await page.locator('.gm-style img[alt="Google"], .maplibregl-map').first().waitFor({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  if (!rejected && (await page.locator('.gm-style').count()) > 0 && (await page.locator('.maplibregl-map').count()) === 0) return;
  throw new Error(
    `e2e global setup: the trip map is not Google (${rejected || 'no .gm-style'}). Start the server with MAPS_PROVIDER=google, ` +
      `and make sure GOOGLE_MAPS_BROWSER_KEY allows ${new URL(page.url()).origin}/* (Google Cloud Console → the key → ` +
      `Website restrictions). E2E_SKIP_GOOGLE_CHECK=1 skips this check.`,
  );
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ baseURL })).newPage();
    const tokenName = tokenNameNow();
    const token = await mintToken(page, tokenName);
    const res = await api(page.request, 'post', `${baseURL}/api/v1/trips/import`, token, SEED_IMPORT);
    expect(res.status(), 'seed trip import').toBe(201);
    const { trip } = await res.json();
    try {
      await expectGoogleMap(page, trip.id);
    } catch (e) {
      // No state file yet, so teardown cannot clean up: drop the seed here (the token is swept by a later run).
      await api(page.request, 'delete', `${baseURL}/api/v1/trips/${trip.id}`, token).catch(() => {});
      throw e;
    }
    const state: RunState = { token, tokenName, seedTripId: trip.id };
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 });
  } finally {
    await browser.close();
  }
}
