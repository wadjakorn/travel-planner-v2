import { defineConfig, devices } from '@playwright/test';

// Mobile layout e2e (TP-0119). Not run in CI: it needs the database, a Google
// browser key that allows the origin (http://localhost:3220/*), and AUTH_BYPASS.
// Start a production build first (3210 is taken on the dev host; the rate limit
// is raised because every worker shares the run's API token):
//   pnpm build && API_RATE_LIMIT_MAX=100000 MAPS_PROVIDER=google AUTH_BYPASS=true pnpm start -p 3220
//   pnpm e2e:mobile
// Required before merging any change to mobile layout or map chrome.
//
// Chromium only: @playwright/test is pinned (exactly) to the version whose
// Chromium is in ~/.cache/ms-playwright; WebKit does not launch on the dev
// host. iOS Safari stays a real-device check.

const mobile = { isMobile: true, hasTouch: true, browserName: 'chromium' as const };
// owner-phone and desktop run every test; the other phone sizes run only the tests tagged @layout
// (their outcome depends on the screen size). E2E_ALL=1 runs everything everywhere (TP-0160).
const layoutOnly = process.env.E2E_ALL === '1' ? {} : { grep: /@layout/ };

export default defineConfig({
  testDir: './e2e',
  // Tests in a file run in order on one worker (fixtures are per describe); projects run side by side.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 3),
  // A passing test takes ≤ 40 s; a hung one used to hold the run for 3 min (TP-0159). Slow ones opt in with test.slow().
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  // One API token + the seed trip findTrip() opens, per run; teardown also sweeps earlier runs' leftovers.
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3220',
    trace: 'retain-on-failure',
    // Fail fast when something can't be tapped (the nav off-screen).
    actionTimeout: 10_000,
  },
  projects: [
    { name: 'pixel-7', use: { ...devices['Pixel 7'] }, ...layoutOnly },
    // The owner's phone: every space number in the compact-controls plan is at this size.
    {
      name: 'owner-phone',
      use: { ...mobile, viewport: { width: 476, height: 638 }, deviceScaleFactor: 2.625, userAgent: devices['Pixel 7'].userAgent },
    },
    {
      name: 'iphone-13-size',
      use: { ...mobile, viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, userAgent: devices['Pixel 7'].userAgent },
      ...layoutOnly,
    },
    {
      name: 'small-android',
      use: { ...mobile, viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, userAgent: devices['Pixel 7'].userAgent },
      ...layoutOnly,
    },
    // Calendar, Bookings, Budget and Notes overflow at 320 (TP-0120), and flow 3 passes through Calendar.
    {
      name: 'tiny-320',
      use: { ...mobile, viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, userAgent: devices['Pixel 7'].userAgent },
      ...layoutOnly,
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
