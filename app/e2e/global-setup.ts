import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect, type FullConfig } from '@playwright/test';
import { api, mintToken, SEED_IMPORT, STATE_FILE, tokenNameNow, type RunState } from './run-state';

// TP-0159: one token and one seed trip per run, instead of a token per describe × lang × project
// (and again after every worker restart). Written to e2e/.state/run.json for the specs and teardown.
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
    const state: RunState = { token, tokenName, seedTripId: trip.id };
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 });
  } finally {
    await browser.close();
  }
}
