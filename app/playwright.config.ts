import { defineConfig, devices } from '@playwright/test';

// Mobile layout e2e (TP-0119). Not run in CI: it needs the database, a Google
// browser key that allows the origin, and AUTH_BYPASS. Start a production
// build first:
//   pnpm build && MAPS_PROVIDER=google AUTH_BYPASS=true pnpm start -p 3210
//   pnpm e2e:mobile
// Required before merging any change to mobile layout or map chrome.
//
// Chromium only: @playwright/test is pinned (exactly) to the version whose
// Chromium is in ~/.cache/ms-playwright; WebKit does not launch on the dev
// host. iOS Safari stays a real-device check.

const mobile = { isMobile: true, hasTouch: true, browserName: 'chromium' as const };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3210',
    trace: 'retain-on-failure',
    // Fail fast when something can't be tapped (the nav off-screen).
    actionTimeout: 20_000,
  },
  projects: [
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    // The owner's phone: every space number in the compact-controls plan is at this size.
    {
      name: 'owner-phone',
      use: { ...mobile, viewport: { width: 476, height: 638 }, deviceScaleFactor: 2.625, userAgent: devices['Pixel 7'].userAgent },
    },
    {
      name: 'iphone-13-size',
      use: { ...mobile, viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, userAgent: devices['Pixel 7'].userAgent },
    },
    {
      name: 'small-android',
      use: { ...mobile, viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, userAgent: devices['Pixel 7'].userAgent },
    },
    // Calendar, Bookings, Budget and Notes overflow at 320 (TP-0120), and flow 3 passes through Calendar.
    {
      name: 'tiny-320',
      grepInvert: /flow 3|flow 6/,
      use: { ...mobile, viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, userAgent: devices['Pixel 7'].userAgent },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
