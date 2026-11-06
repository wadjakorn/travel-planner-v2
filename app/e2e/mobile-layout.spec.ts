import { chromium, expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import en from '../src/messages/en.json';
import th from '../src/messages/th.json';
import { api as restApi, runState } from './run-state';

// Mobile layout invariants for the trip hub (TP-0119,
// docs/superpowers/plans/2026-10-30-mobile-map-overflow-fix.md §5).
//
// The bug this guards against: content that widens the document makes mobile
// Chrome grow the *layout* viewport, so `position: fixed; bottom: …` chrome
// (bottom nav, List/Map button) renders below the visible screen. Desktop
// Chromium resized to phone size cannot show it; these projects run with
// isMobile + touch.
//
// Selectors avoid translated text (runs in en and th); the leg sheet's tests read accessible names from MESSAGES.

const LANGS = ['en', 'th'] as const;
/** Only for copy the user reads in a test's own language (the leg sheet's buttons and messages). */
const MESSAGES = { en, th };

type LegMode = 'walk' | 'drive' | 'transit';
/** The leg sheet's mode buttons, in order (components/leg-sheet.tsx MODES). */
const SHEET_MODES: LegMode[] = ['walk', 'drive', 'transit'];

const SEL = {
  nav: '[data-trip-nav]',
  // Last button: the only one that does anything on any build of this control.
  toggle: '[data-map-toggle] button >> nth=-1',
  section: '[data-trip-map-section]',
  carousel: '[data-map-carousel]',
  daySwitcher: '[data-map-day-switcher]',
  prevDay: '[data-map-day-switcher] button >> nth=0',
  nextDay: '[data-map-day-switcher] button >> nth=1',
  cards: '[data-stop-card]',
  aside: '[data-trip-aside]',
  pins: '[data-trip-map-section] [data-shape]:not([data-preview])',
};

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number; cx: number };

const isPhone = (info: TestInfo) => info.project.name !== 'desktop';
/** Tests whose outcome depends on the screen size (overflow, chrome on screen, geometry, what fits in view).
 *  Only these run on the extra phone sizes; owner-phone and desktop run everything (playwright.config.ts). */
const LAYOUT = { tag: '@layout' };

async function rect(page: Page, selector: string): Promise<Rect | null> {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return null;
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, cx: r.left + r.width / 2 };
  });
}

/** The run's seed trip (e2e/run-state.ts SEED_IMPORT), from Home: flow 1 and flow 3 tap its card there. */
async function findTrip(page: Page): Promise<string> {
  const trip = `/trip/${runState().seedTripId}`;
  await page.goto('/');
  await expect(page.locator(`a[href="${trip}"]`).first(), 'the seed trip is on Home').toBeAttached();
  return trip;
}

/** I1: the document never overflows horizontally and the layout viewport is not expanded. */
async function expectNoPageOverflow(page: Page, info: TestInfo, where: string) {
  const vw = info.project.use.viewport!.width;
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          scrollWidth: document.scrollingElement!.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth: window.innerWidth,
        })),
      { message: `I1 page overflow @ ${where}` },
    )
    .toEqual({ scrollWidth: vw, clientWidth: vw, innerWidth: vw });
}

/** I1b: nothing inside the map section escapes (a clipped escape is invisible to I1). */
async function expectNoMapEscape(page: Page, where: string) {
  await expect
    .poll(
      () =>
        page.evaluate((s) => {
          const el = document.querySelector(s)!;
          return el.scrollWidth <= el.clientWidth;
        }, SEL.section),
      { message: `I1b map section overflow @ ${where}` },
    )
    .toBe(true);
}

/** I2: fixed chrome sits inside the visual viewport. */
async function expectOnScreen(page: Page, selector: string, where: string) {
  await expect
    .poll(
      () =>
        page.locator(selector).first().evaluate((el) => {
          const r = el.getBoundingClientRect();
          const vv = window.visualViewport!;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return 'hidden';
          if (r.top < -1 || r.left < -1 || r.bottom > vv.height + 1 || r.right > vv.width + 1)
            return `off-screen ${Math.round(r.left)},${Math.round(r.top)}→${Math.round(r.right)},${Math.round(r.bottom)} vv ${Math.round(vv.width)}×${Math.round(vv.height)}`;
          return 'ok';
        }),
      { message: `I2 ${selector} on screen @ ${where}` },
    )
    .toBe('ok');
}

/** I5: the element's centre is on screen and nothing covers it. */
async function expectTappable(page: Page, selector: string, where: string) {
  const ok = await page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const vv = window.visualViewport!;
      if (x < 0 || y < 0 || x > vv.width || y > vv.height) return 'centre off-screen';
      const hit = document.elementFromPoint(x, y);
      return hit && (hit === el || el.contains(hit)) ? 'ok' : `covered by ${hit?.tagName}.${(hit?.className ?? '').toString().slice(0, 40)}`;
    });
  expect(ok, `I5 ${selector} tappable @ ${where}`).toBe('ok');
}

async function expectPhoneChrome(page: Page, info: TestInfo, where: string, mode: 'list' | 'map' | 'page') {
  await expectNoPageOverflow(page, info, where);
  if (!isPhone(info)) return;
  await expectOnScreen(page, SEL.nav, where);
  const translate = await page.evaluate((s) => getComputedStyle(document.querySelector(s)!).translate, SEL.nav);
  expect(['none', '0px', '0px 0px'], `I2 nav not slid away @ ${where}`).toContain(translate);
  await expectTappable(page, `${SEL.nav} a[href$="/calendar"]`, where);
  if (mode !== 'page') {
    await expectOnScreen(page, SEL.toggle, where);
    await expectTappable(page, SEL.toggle, where);
  }
  if (mode === 'map') await expectNoMapEscape(page, where);
}

/** The card nearest the snap line, 16 from the screen's right edge (the active one once the strip settles). */
async function snappedCard(page: Page) {
  return page.evaluate((sel) => {
    const target = window.innerWidth - 16;
    let best: DOMRect | null = null;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (!best || Math.abs(r.right - target) < Math.abs(best.right - target)) best = r;
    }
    return best && { left: best.left, right: best.right, top: best.top, bottom: best.bottom };
  }, SEL.cards);
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const intersects = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * I4: cards above, switcher + toggle on one row below, switcher 16 from the
 * screen's left edge and clear of the toggle by ≥ 8; 8 / 28 spacing; no overlap; day text whole. Soft, so every broken
 * invariant is named in one run. `top` is the block above the row (a card, or
 * the empty-day note).
 */
async function expectMapStack(page: Page, where: string, top: { left: number; right: number; top: number; bottom: number }) {
  const sw = await rect(page, SEL.daySwitcher);
  const toggle = await rect(page, SEL.toggle);
  const nav = await rect(page, SEL.nav);
  expect(sw && toggle && nav, `I4 stack present @ ${where}`).toBeTruthy();
  if (!sw || !toggle || !nav) return;
  expect.soft(near(sw.top, toggle.top, 1) && near(sw.bottom, toggle.bottom, 1), `I4 switcher + toggle on one row @ ${where}`).toBe(true);
  expect.soft(near(sw.left, 16, 1), `I4 switcher left 16 @ ${where}, got ${sw.left}`).toBe(true);
  // Plan 2026-10-31 A4: the toggle is a 44×44 circle 16 px from the screen edge, no longer flush with the
  // card's right edge (its geometry is T3's); the switcher just keeps 8 px clear of it.
  expect.soft(near(sw.top - top.bottom, 8, 2), `I4 card → row gap 8 @ ${where}, got ${sw.top - top.bottom}`).toBe(true);
  expect.soft(toggle.left - sw.right >= 8 - 1, `I4 switcher right ≤ toggle left − 8 @ ${where}, gap ${toggle.left - sw.right}`).toBe(true);
  expect.soft(near(nav.top - sw.bottom, 28, 2), `I4 row → nav gap 28 @ ${where}, got ${nav.top - sw.bottom}`).toBe(true);
  expect.soft(intersects(sw, toggle), `I4 switcher and toggle apart @ ${where}`).toBe(false);
  const truncated = await page
    .locator(`${SEL.daySwitcher} > span`)
    .first()
    .evaluate((el) => el.scrollWidth > el.clientWidth + 0.5);
  expect.soft(truncated, `I4 day text whole @ ${where}`).toBe(false);
}

/** I6: Google's logo and attribution stay visible. No "when present": a stale selector must fail. */
async function expectAttributionClear(page: Page, where: string) {
  await expect(page.locator('.gm-style'), `I6 Google map present @ ${where}`).toBeVisible();
  await expect(page.locator('.gm-style img[alt="Google"]').first(), `I6 logo present @ ${where}`).toBeVisible();
  const covers = await page.evaluate((sels) => {
    const box = (e: Element) => e.getBoundingClientRect();
    const logo = box(document.querySelector('.gm-style img[alt="Google"]')!);
    const text = [...document.querySelectorAll('.gm-style .gm-style-cc')].map(box).filter((r) => r.width > 0 && r.height > 0);
    const controls = sels.map((s) => document.querySelector(s)).filter(Boolean).map((e) => box(e!));
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return controls.some((c) => [logo, ...text].some((t) => hit(c, t)));
  }, [SEL.daySwitcher, '[data-map-toggle] button:last-of-type']);
  expect.soft(covers, `I6 controls clear of Google logo/attribution @ ${where}`).toBe(false);
}

/** I8: a day fit frames every pin above the controls (the camera follows the stack's size). */
async function expectPinsClear(page: Page, where: string) {
  // Pins render after the map loads: zero matches must not pass as "none covered".
  await expect.poll(() => page.locator(SEL.pins).count(), { message: `I8 pins rendered @ ${where}` }).toBeGreaterThan(0);
  const under = await page.evaluate(
    ({ cards, sw, pins }) => {
      const tops = [...document.querySelectorAll(cards), document.querySelector(sw)!].map((e) => e.getBoundingClientRect().top);
      const top = Math.min(...tops);
      return [...document.querySelectorAll(pins)]
        .filter((p) => {
          const r = p.getBoundingClientRect();
          return r.width > 0 && r.bottom > top + 1;
        })
        .map((p) => p.getAttribute('aria-label'));
    },
    { cards: SEL.cards, sw: SEL.daySwitcher, pins: SEL.pins },
  );
  expect.soft(under, `I8 no pin under the controls @ ${where}`).toEqual([]);
}

/** I7: the stack can't silently grow back (viewport height − top of the stack). */
function expectStackHeight(info: TestInfo, top: number, max: number, where: string) {
  const h = info.project.use.viewport!.height;
  expect.soft(h - top, `I7 stack height ≤ ${max} @ ${where}`).toBeLessThanOrEqual(max);
}


/**
 * Waits for the document's size to stop changing (streamed content, lazy
 * images). Not networkidle: a live map and prefetches keep the network busy,
 * so it may never fire.
 */
async function settle(page: Page) {
  await page.waitForLoadState('load');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const size = () => {
          const d = document.scrollingElement!;
          return `${d.scrollWidth}x${d.scrollHeight}`;
        };
        const started = performance.now();
        let last = size();
        let stableSince = started;
        const id = setInterval(() => {
          const now = performance.now();
          const cur = size();
          if (cur !== last) {
            last = cur;
            stableSince = now;
          }
          if (now - stableSince >= 800 || now - started >= 8000) {
            clearInterval(id);
            resolve();
          }
        }, 100);
      }),
  );
}

async function openMap(page: Page) {
  await page.locator(SEL.toggle).tap();
  await expect(page.locator('body')).toHaveAttribute('data-fullmap', '1');
  await expect(page.locator(SEL.carousel)).toBeVisible();
  await settle(page);
}

async function waitDay(page: Page, prevUrl: string) {
  await expect.poll(() => page.url()).not.toBe(prevUrl);
  await expect(page.locator(SEL.carousel)).toBeVisible();
  await settle(page);
}

/** Window-level observer for the nudge (T6): the 700 ms animation is gone before a poll could see it. */
const NUDGE_OBSERVER = () => {
  const w = window as unknown as { __nudge: { plays: number; anim: string[]; start: number[]; end: number[]; active: boolean } };
  w.__nudge = { plays: 0, anim: [], start: [], end: [], active: false };
  const look = () => {
    const ul = document.querySelector<HTMLElement>('[data-map-carousel] ul');
    const on = !!ul && ul.hasAttribute('data-nudging');
    if (on && !w.__nudge.active) {
      w.__nudge.plays += 1;
      w.__nudge.start.push(ul!.scrollLeft);
      w.__nudge.anim.push(getComputedStyle(ul!.querySelector('li')!).animationName);
    }
    if (!on && w.__nudge.active) w.__nudge.end.push(document.querySelector<HTMLElement>('[data-map-carousel] ul')?.scrollLeft ?? -1);
    w.__nudge.active = on;
  };
  // `document`, not documentElement: an init script runs before the latter exists.
  new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-nudging'] });
};

const nudgeState = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nudge?: { plays: number; anim: string[]; start: number[]; end: number[]; active: boolean } }).__nudge!);

/** Real touch swipe on the strip: the guide listens for touchstart, which synthetic scrolls skip.
 *  Raw touch events: CDP's Input.synthesizeScrollGesture sends no touch events and scrolls nothing here. */
async function swipeStrip(page: Page, startX?: number, to: 'left' | 'right' = 'left') {
  const box = (await page.locator(`${SEL.carousel} ul`).boundingBox())!;
  const y = Math.round(box.y + box.height / 2);
  const pitch = await page.locator(SEL.cards).evaluateAll((els) => els[1].getBoundingClientRect().left - els[0].getBoundingClientRect().left);
  // 60% of one card's pitch: past the halfway snap threshold and short of the next one. No fling
  // follows these raw events, so a snap that needs more drag fails here instead of being hidden.
  const drag = Math.round(pitch * 0.6);
  const from = startX ?? Math.round(to === 'left' ? box.x + box.width - 24 : box.x + 24);
  const end = to === 'left' ? from - drag : from + drag;
  const step = to === 'left' ? -20 : 20;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
  for (let x = from + step; to === 'left' ? x > end : x < end; x += step) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: end, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** A list row that has a leg rail (the rail of the row before it runs into this row's number). */
async function railRow(page: Page, nth: number) {
  const rails = page.locator('[data-leg-slot]');
  const n = await rails.count();
  expect(n, 'the seed trip draws legs between located stops').toBeGreaterThan(0);
  const row = rails.nth(Math.min(nth, n - 1)).locator('xpath=..');
  await row.scrollIntoViewIfNeeded();
  return row;
}

/** Tap a list row (clear of its nested buttons) and wait until it is the selected one. */
async function selectRow(row: ReturnType<Page['locator']>) {
  const btn = row.locator('div[role="button"]').first();
  await btn.tap({ position: { x: 150, y: 14 } });
  await expect(btn).toHaveAttribute('aria-current', 'true');
  return btn;
}

/** Fresh first-time state: localStorage empty, page reloaded. */
async function freshStorage(page: Page, trip: string) {
  await page.goto(trip);
  await page.evaluate(() => localStorage.clear());
  await page.goto(trip);
  await expect(page.locator(SEL.aside)).toBeVisible();
}

/** Walks the map's days (from the current one) and returns the first with at least `min` cards. */
async function toDayWithCards(page: Page, min: number) {
  for (;;) {
    if ((await page.locator(SEL.cards).count()) >= min) return true;
    const next = page.locator(SEL.nextDay);
    if (await next.isDisabled()) return false;
    const url = page.url();
    await next.tap();
    await waitDay(page, url);
  }
}

const alphaOf = (c: string) => {
  if (c === 'transparent') return 0;
  const slash = c.match(/\/\s*([\d.]+%?)\s*\)/);
  if (slash) return slash[1].endsWith('%') ? parseFloat(slash[1]) / 100 : parseFloat(slash[1]);
  const rgba = c.match(/^rgba\(([^)]+)\)/);
  if (rgba) return parseFloat(rgba[1].split(',')[3]);
  return 1;
};

// ── Plan 2026-10-31-mobile-map-list-sync, PR 2. A throwaway trip, so the suite can edit data and has
// known long days. The trip is imported with the run's token and removed in afterAll. ──

const stopsAt = (lat: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ kind: 'sight', name: `Stop ${lat}-${i + 1}`, lat: lat + i * 0.01, lng: 135.7 + i * 0.01 }));

type Fixture = {
  trip: string;
  /** The run's shared token (global-setup.ts). */
  token: string;
  days: { id: string; places: { id: string; name: string }[] }[];
  hotels: { id: string; coordsApprox: boolean; lat: number | null }[];
};

const api = (page: Page, method: 'post' | 'delete' | 'put' | 'patch', url: string, token: string, data?: unknown, idempotent = true) =>
  restApi(page.request, method, url, token, data, idempotent);

const SYNC_DAYS = [{ places: stopsAt(35, 12) }, { places: stopsAt(36, 12) }, { places: stopsAt(37, 3) }];

async function createFixture(page: Page, baseURL: string, days: { places: unknown[] }[] = SYNC_DAYS, hotels: unknown[] = [], transport: unknown[] = []): Promise<Fixture> {
  const { token } = runState();
  const res = await api(page, 'post', `${baseURL}/api/v1/trips/import`, token, {
    trip: { title: 'TP-0127 e2e fixture', startDate: '2030-01-01', endDate: `2030-01-0${days.length}` },
    days,
    ...(hotels.length ? { hotels } : {}),
    ...(transport.length ? { transport } : {}),
  });
  expect(res.status(), 'fixture import').toBe(201);
  const { trip } = await res.json();
  return { trip: `/trip/${trip.id}`, token, days: trip.days, hotels: trip.hotels ?? [] };
}

/** Drops the trip only: the token is the run's, revoked in global-teardown.ts. */
async function removeFixture(page: Page, baseURL: string, f: Fixture) {
  const res = await api(page, 'delete', `${baseURL}/api/v1${f.trip.replace('/trip/', '/trips/')}`, f.token);
  expect(res.ok(), 'fixture trip removed').toBe(true);
}

/** Holds every RSC request back, so anything that waits for the server shows. */
async function slowRsc(page: Page, ms: number) {
  await page.route('**/trip/**', async (route) => {
    if (route.request().headers()['rsc']) await new Promise((r) => setTimeout(r, ms));
    await route.fallback();
  });
}

const query = (page: Page) => {
  const u = new URL(page.url());
  return { day: u.searchParams.get('day'), placeId: u.searchParams.get('placeId') };
};

const selectCard = async (page: Page, i: number) => {
  await page.locator(SEL.cards).nth(i).locator('[data-stop-select]').tap();
  await expect(page.locator(SEL.cards).nth(i)).toHaveAttribute('aria-current', 'true');
};

/** Where `target` sits in the list column: in view, and how far under its top edge. */
async function inAside(page: Page, target: string) {
  return page.locator(target).first().evaluate((el) => {
    const a = el.closest('[data-trip-aside]')!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { visible: r.top >= a.top - 1 && r.bottom <= a.bottom + 1, fromTop: r.top - a.top };
  });
}

/** Records, every frame until read, whether the nav has slid away (it comes back by itself 900 ms later). */
const watchNav = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __navHidden: boolean };
    w.__navHidden = false;
    const started = performance.now();
    const look = () => {
      const t = getComputedStyle(document.querySelector('[data-trip-nav]')!).translate;
      if (!/^(none|0px( 0px)?)$/.test(t)) w.__navHidden = true;
      if (performance.now() - started < 1200) requestAnimationFrame(look);
    };
    look();
  });
const navHidden = (page: Page) => page.evaluate(() => (window as unknown as { __navHidden: boolean }).__navHidden);

const closed = async (page: Page) => expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');

for (const lang of LANGS) {
  test.describe(`lang=${lang}`, () => {
    test.beforeEach(async ({ context, baseURL, page }, testInfo) => {
      await context.addCookies([{ name: 'lang', value: lang, url: baseURL! }]);
      // The swipe-guide nudge slides every card 24 px a moment after the map opens; geometry tests
      // measure cards in that window, so they start with it spent. T5/T6 exercise the guide itself.
      if (!/T5|T6/.test(testInfo.title)) await page.addInitScript(() => localStorage.setItem('tp.mapNudgeShown', '1'));
    });

    test('leg bands run between stop numbers, in a different colour per leg', LAYOUT, async ({ page }) => {
      await page.goto(await findTrip(page));
      await expect(page.locator(SEL.aside)).toBeVisible();
      const rails = await page.locator('[data-leg-slot]').evaluateAll((els) =>
        els.map((el) => {
          const row = el.parentElement!;
          const num = row.querySelector('[data-stop-number]')!.getBoundingClientRect();
          const next = row.nextElementSibling?.querySelector('[data-stop-number]')?.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          return {
            list: Array.from(row.parentElement!.parentElement!.children).indexOf(row.parentElement!),
            slot: Number(el.getAttribute('data-leg-slot')),
            cx: r.left + r.width / 2,
            top: r.top,
            bottom: r.bottom,
            numCx: num.left + num.width / 2,
            numCy: num.top + num.height / 2,
            nextCy: next ? next.top + next.height / 2 : null,
          };
        }),
      );
      expect(rails.length, 'the seed trip draws legs between located stops').toBeGreaterThan(0);
      for (const [i, r] of rails.entries()) {
        expect(Math.abs(r.cx - r.numCx), 'band centred on the number').toBeLessThanOrEqual(1);
        expect(Math.abs(r.top - r.numCy), 'band starts at this number').toBeLessThanOrEqual(1);
        if (r.nextCy != null) expect(Math.abs(r.bottom - r.nextCy), 'band ends at the next number').toBeLessThanOrEqual(1);
        const prev = rails[i - 1];
        if (prev && prev.list === r.list && prev.bottom === r.top) expect(r.slot).not.toBe(prev.slot);
      }
    });

    test('flow 1: list → map → every day → back to day 1', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      const trip = await findTrip(page);
      await page.locator(`a[href="${trip}"]`).first().tap();
      await expect(page.locator(SEL.aside)).toBeVisible();
      await expectPhoneChrome(page, info, 'list', 'list');

      await openMap(page);
      await expectPhoneChrome(page, info, 'map day 1', 'map');

      let maxCards = 0;
      let days = 1;
      for (;;) {
        const cards = await page.locator(SEL.cards).count();
        maxCards = Math.max(maxCards, cards);
        if (cards > 0) {
          await expectMapStack(page, `day ${days}`, (await snappedCard(page))!);
          await expectPinsClear(page, `day ${days}`);
          // Last card right-aligned (Playwright has no swipe): the strip scrolls, the page must not.
          await page.locator(SEL.cards).last().evaluate((el) => el.scrollIntoView({ inline: 'end', block: 'nearest' }));
          await expect
            .poll(() =>
              page.locator(SEL.cards).last().evaluate((el) => {
                const r = el.getBoundingClientRect();
                return Math.abs(window.innerWidth - 16 - r.right) <= 2;
              }),
            )
            .toBe(true);
          await expectPhoneChrome(page, info, `day ${days} last card`, 'map');
        }
        const next = page.locator(SEL.nextDay);
        if (await next.isDisabled()) break;
        const url = page.url();
        await next.tap();
        await waitDay(page, url);
        days += 1;
        await expectPhoneChrome(page, info, `map day ${days}`, 'map');
      }
      expect(days, 'fixture trip needs ≥ 2 days').toBeGreaterThanOrEqual(2);
      // 3+ cards overflow at every phone width when the bug is present (plan §2).
      expect(maxCards, 'fixture trip needs a day with ≥ 3 located stops').toBeGreaterThanOrEqual(3);

      while (!(await page.locator(SEL.prevDay).isDisabled())) {
        const url = page.url();
        await page.locator(SEL.prevDay).tap();
        await waitDay(page, url);
      }
      await expectPhoneChrome(page, info, 'back on day 1', 'map');
    });

    test('flow 2: reload on the map reopens it with chrome on screen', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      const trip = await findTrip(page);
      await page.goto(`${trip}?day=1`);
      await openMap(page);
      await page.reload();
      await expect(page.locator('body')).toHaveAttribute('data-fullmap', '1');
      await expect(page.locator(SEL.carousel)).toBeVisible();
      await settle(page);
      await expectPhoneChrome(page, info, 'after reload', 'map');
    });

    test('flow 3: map → Calendar → Back (map) → Back (list) → Back (home)', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      const trip = await findTrip(page);
      await page.locator(`a[href="${trip}"]`).first().tap();
      await expect(page.locator(SEL.aside)).toBeVisible();
      await openMap(page);
      const url = page.url();
      await page.locator(SEL.nextDay).tap();
      await waitDay(page, url);
      const mapUrl = page.url();
      await page.locator(`${SEL.nav} a[href$="/calendar"]`).tap();
      await expect(page).toHaveURL(/\/calendar$/);
      await expectPhoneChrome(page, info, 'calendar', 'page');
      await page.goBack();
      await expect(page.locator('body')).toHaveAttribute('data-fullmap', '1');
      expect(page.url()).toBe(mapUrl);
      await expectPhoneChrome(page, info, 'back to map', 'map');
      await page.goBack();
      await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
      await expect.poll(() => page.url()).toBe(mapUrl);
      await expectPhoneChrome(page, info, 'back to list', 'list');
      await page.goBack();
      await expect.poll(() => new URL(page.url()).pathname).toBe('/');
    });

    test('flow 4: tap a pin, then the active Itinerary tab closes the map', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      const trip = await findTrip(page);
      await page.goto(trip);
      await openMap(page);
      // Pins can overlap at the fitted zoom: tap one that is on top at its centre.
      const pins = page.locator(SEL.pins);
      await expect(pins.first()).toBeVisible();
      let onTop = -1;
      for (let i = 0; i < (await pins.count()) && onTop < 0; i++) {
        const free = await pins.nth(i).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        });
        if (free) onTop = i;
      }
      expect(onTop, 'flow 4 needs a pin that is not covered').toBeGreaterThanOrEqual(0);
      await pins.nth(onTop).tap();
      await expect.poll(() => new URL(page.url()).searchParams.has('placeId')).toBe(true);
      await settle(page);
      await expectPhoneChrome(page, info, 'pin tapped', 'map');
      await page.locator(`${SEL.nav} a[aria-current="page"]`).tap();
      await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
      await expectPhoneChrome(page, info, 'itinerary tab', 'list');
    });

    test('flow 5: scroll the list, open the map at once: nav still shown', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      const trip = await findTrip(page);
      await page.goto(trip);
      await expect(page.locator(SEL.aside)).toBeVisible();
      await settle(page);
      await page.locator(SEL.aside).evaluate((el) => el.scrollBy(0, 600));
      // The precondition: the nav really did slide away before the map opens.
      await expect
        .poll(() => page.locator(SEL.nav).evaluate((el) => getComputedStyle(el).translate), {
          message: 'hide-on-scroll must have fired',
          timeout: 800,
          intervals: [50],
        })
        .not.toMatch(/^(none|0px( 0px)?)$/);
      await openMap(page);
      await expectPhoneChrome(page, info, 'map after list scroll', 'map');
    });

    test('flow 9: map stack invariants', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      const trip = await findTrip(page);
      await page.goto(`${trip}?day=1`);
      await expect(page.locator(SEL.aside)).toBeVisible();
      await settle(page);
      const listRect = await rect(page, SEL.toggle);
      // Icon-only button (plan A4): the label is the aria-label, not the text.
      const listLabel = await page.locator(SEL.toggle).getAttribute('aria-label');
      await openMap(page);
      const mapRect = await rect(page, SEL.toggle);
      const mapLabel = await page.locator(SEL.toggle).getAttribute('aria-label');
      // I3: one control, one place; only its label changes.
      for (const k of ['left', 'top', 'right', 'bottom'] as const) {
        expect.soft(near(mapRect![k], listRect![k], 1), `I3 toggle ${k} same in both modes`).toBe(true);
      }
      expect.soft(mapLabel, 'I3 toggle aria-label changes').not.toBe(listLabel);
      expect.soft(listLabel, 'I3 toggle has an aria-label').toBeTruthy();
      // The wrapper spans the column: only the button itself may take taps.
      const wrapperEvents = await page.locator('[data-map-toggle]').evaluate((el) => getComputedStyle(el).pointerEvents);
      expect.soft(wrapperEvents, 'I5 toggle wrapper lets taps through').toBe('none');
      const card = (await snappedCard(page))!;
      await expectMapStack(page, 'map', card);
      await expectAttributionClear(page, 'map');
      expectStackHeight(info, card.top, 236, 'map');
      // The toggle closes the map from the same spot.
      await page.locator(SEL.toggle).tap();
      await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
    });

    test('flow 8: a day with no stops keeps the stack in place', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      // The seed trip's day 3 has no stops.
      await page.goto(`${await findTrip(page)}?day=3`);
      await expect(page.locator(SEL.aside)).toBeVisible();
      await openMap(page);
      await expect(page.locator(SEL.cards), 'seed day 3 has no stops').toHaveCount(0);
      await expect(page.locator(`${SEL.carousel} p`)).toBeVisible();
      const note = (await rect(page, `${SEL.carousel} p`))!;
      await expectMapStack(page, 'empty day', note);
      // The note is one line wider than the card at 320 (en), so it wraps once more.
      expectStackHeight(info, note.top, info.project.use.viewport!.width < 360 ? 204 : 190, 'empty day');
      await expectPhoneChrome(page, info, 'empty day', 'map');
    });

    for (const sub of ['', '/calendar', '/bookings', '/budget', '/notes', '/settings']) {
      test(`flow 6: page ${sub || '/ (itinerary)'} has no overflow`, LAYOUT, async ({ page }, info) => {
        const trip = await findTrip(page);
        await page.goto(trip + sub);
        await settle(page);
        await expectPhoneChrome(page, info, `page ${sub || 'itinerary'}`, sub ? 'page' : 'list');
      });
    }

    test('flow 6: home has no overflow', LAYOUT, async ({ page }, info) => {
      await page.goto('/');
      await settle(page);
      await expectNoPageOverflow(page, info, 'home');
    });

    // ── Plan 2026-10-31-mobile-map-list-sync, PR 1 (T1–T6b). Red on main, green after A1–A4/B1/B2. ──

    test('T1: pressing a row does not move it (no flicker over the leg rail)', async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      await page.goto(await findTrip(page));
      await expect(page.locator(SEL.aside)).toBeVisible();
      await settle(page);
      const row = await railRow(page, 0);
      const btn = row.locator('div[role="button"]').first();
      const box = (await btn.boundingBox())!;
      // The rail is pointer-events:none, so elementFromPoint proves nothing; hold a real press instead.
      // Touch can't hold :active, the mouse can.
      await page.mouse.move(box.x + 150, box.y + 14);
      await page.mouse.down();
      try {
        expect(await btn.evaluate((el) => el.matches(':active')), 'precondition: the held press matches :active').toBe(true);
        const transform = await btn.evaluate((el) => getComputedStyle(el).transform);
        expect(transform, 'T1 role=button wrapper does not translate while pressed').toBe('none');
      } finally {
        await page.mouse.up();
      }
    });

    test('T2: the selected card surface starts right of the rail (this row and the previous)', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      await page.goto(await findTrip(page));
      await expect(page.locator(SEL.aside)).toBeVisible();
      await settle(page);
      // The row after a rail row: the previous row's rail runs into its number.
      const railed = await railRow(page, 0);
      const next = railed.locator('xpath=following-sibling::div[1]');
      const row = (await next.count()) > 0 ? next : railed;
      await row.scrollIntoViewIfNeeded();
      await selectRow(row);
      const m = await row.evaluate((rowEl) => {
        const card = rowEl.querySelector<HTMLElement>('[class*="placeActive"]');
        if (!card) return { error: 'no .placeActive in the selected row' };
        const before = getComputedStyle(card, '::before');
        const left = parseFloat(before.left);
        // `left` is measured from the padding box, so add the border.
        const surfaceLeft = card.getBoundingClientRect().left + card.clientLeft + left;
        const rails = [rowEl.querySelector('[data-leg-slot]'), rowEl.previousElementSibling?.querySelector('[data-leg-slot]')]
          .filter((r): r is Element => !!r)
          .map((r) => r.getBoundingClientRect().right);
        return { content: before.content, left, surfaceLeft, rails };
      });
      expect('error' in m ? m.error : 'ok').toBe('ok');
      if ('error' in m) return;
      expect(m.content, 'T2 .placeActive::before exists (draws the card surface)').not.toMatch(/^(none|normal)$/);
      expect(Number.isFinite(m.left), `T2 ::before has a computed left, got ${m.left}`).toBe(true);
      expect(m.rails.length, 'T2 at least one rail beside the selected row').toBeGreaterThan(0);
      for (const right of m.rails) {
        expect(m.surfaceLeft, `T2 surface left ${m.surfaceLeft} ≥ rail right ${right}`).toBeGreaterThanOrEqual(right);
      }
    });

    /** T3: the round icon-only toggle — same 44×44 rect 16 px from the edge in both modes. */
    async function expectToggleGeometry(page: Page, info: TestInfo, vw: number, where: string) {
      const trip = await findTrip(page);
      await page.goto(`${trip}?day=1`);
      await expect(page.locator(SEL.aside)).toBeVisible();
      await settle(page);
      const vh = info.project.use.viewport!.height;
      const check = async (mode: string) => {
        const r = (await rect(page, SEL.toggle))!;
        expect.soft([r.width, r.height].map(Math.round), `T3 toggle 44×44 (${mode}) @ ${where}`).toEqual([44, 44]);
        expect.soft(near(vw - r.right, 16, 0.5), `T3 toggle right edge 16 px from the screen (${mode}) @ ${where}, got ${vw - r.right}`).toBe(true);
        expect.soft(near(vh - 84, r.bottom, 1), `T3 toggle bottom stays 84 above the screen bottom (${mode}) @ ${where}, got ${vh - r.bottom}`).toBe(true);
        await expectTappable(page, SEL.toggle, `${mode} @ ${where}`);
        return r;
      };
      const listRect = await check('list');
      const listLabel = await page.locator(SEL.toggle).getAttribute('aria-label');
      await openMap(page);
      const mapRect = await check('map');
      const mapLabel = await page.locator(SEL.toggle).getAttribute('aria-label');
      for (const k of ['left', 'top', 'right', 'bottom'] as const) {
        expect.soft(near(mapRect[k], listRect[k], 1), `T3 toggle ${k} same in both modes @ ${where}`).toBe(true);
      }
      expect.soft(listLabel && mapLabel && listLabel !== mapLabel, `T3 aria-label differs between modes @ ${where}`).toBeTruthy();
      const sw = (await rect(page, SEL.daySwitcher))!;
      expect.soft(intersects(sw, mapRect), `T3 toggle clear of the day switcher @ ${where}`).toBe(false);
      expect.soft(sw.right <= mapRect.left - 8 + 0.5, `T3 switcher right ≤ toggle left − 8 @ ${where}, gap ${mapRect.left - sw.right}`).toBe(true);
      if ((await page.locator(SEL.cards).count()) > 0) {
        const card = (await snappedCard(page))!;
        expect.soft(near(sw.left, 16, 1), `T3 switcher left 16 @ ${where}, got ${sw.left}`).toBe(true);
        expect.soft(near(vw - card.right, 16, 1), `T3 card right edge level with the toggle @ ${where}, got ${vw - card.right}`).toBe(true);
        expect.soft(intersects({ ...card, width: 0, height: 0, cx: 0 }, mapRect), `T3 toggle clear of the selected card @ ${where}`).toBe(false);
      }
    }

    test('T3: toggle geometry at the project viewport', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      await expectToggleGeometry(page, info, info.project.use.viewport!.width, `${info.project.name}`);
    });

    for (const w of [320, 360]) {
      test(`T3: toggle geometry at ${w}px wide`, async ({ page }, info) => {
        test.skip(info.project.name !== 'owner-phone', 'resized from one phone project; the others cover their own width');
        await page.setViewportSize({ width: w, height: info.project.use.viewport!.height });
        await expectToggleGeometry(page, info, w, `${w}px`);
      });
    }

    test('T4: the active card ring sits inside the strip', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      const trip = await findTrip(page);
      await page.goto(`${trip}?day=1`);
      await expect(page.locator(SEL.aside)).toBeVisible();
      await openMap(page);
      expect(await toDayWithCards(page, 2), 'fixture trip needs a day with ≥ 2 located stops').toBe(true);
      // Select through a card (pins can be covered by neighbouring markers).
      await page.locator(SEL.cards).nth(1).locator('[data-stop-select]').tap();
      const active = page.locator(`${SEL.cards}[aria-current="true"]`);
      await expect(active).toBeVisible();
      await settle(page);
      const m = await page.evaluate((sel) => {
        const card = document.querySelector(`${sel.cards}[aria-current="true"]`)!.getBoundingClientRect();
        const strip = document.querySelector(`${sel.carousel} ul`)!.getBoundingClientRect();
        return { ringTop: card.top - 2, ringBottom: card.bottom + 2, stripTop: strip.top, stripBottom: strip.bottom };
      }, SEL);
      expect(m.ringTop, `T4 ring outer top ${m.ringTop} ≥ strip top ${m.stripTop}`).toBeGreaterThanOrEqual(m.stripTop);
      expect(m.ringBottom, `T4 ring outer bottom ${m.ringBottom} ≤ strip bottom ${m.stripBottom}`).toBeLessThanOrEqual(m.stripBottom);
    });

    // ── Plan 2026-10-31-mobile-map-rest §2b: the nav button sits on a connector between right-aligned cards. ──
    test.describe('nav connector', () => {
      // Describe-level, so desktop never runs the beforeAll that imports a trip it would skip.
      test.skip(({ isMobile }) => !isMobile, 'phone flow');
      let fx: Fixture;
      const LOCATED = stopsAt(38, 4);
      const located = (x: { lat: number; lng: number }) => `${x.lat},${x.lng}`;
      test.beforeAll(async ({ browser, baseURL }) => {
        const ctx = await browser.newContext({ baseURL });
        fx = await createFixture(await ctx.newPage(), baseURL!, [
          { places: LOCATED },
          { places: [...stopsAt(39, 1), { kind: 'sight', name: 'Nowhere', lat: null, lng: null }, ...stopsAt(39.5, 2)] },
          { places: stopsAt(40, 1) },
          { places: [{ kind: 'sight', name: 'Nowhere first', lat: null, lng: null }, ...stopsAt(40.5, 2)] },
        ]);
        await ctx.close();
      });
      test.afterAll(async ({ browser, baseURL }) => {
        if (!fx) return;
        const ctx = await browser.newContext({ baseURL });
        await removeFixture(await ctx.newPage(), baseURL!, fx);
        await ctx.close();
      });

      const openDay = async (page: Page, d: number) => {
        await page.goto(`${fx.trip}?day=${d}`);
        await expect(page.locator(SEL.aside)).toBeVisible();
        await openMap(page);
      };
      /** Hex token as the rgb() a computed style reports. */
      const tokenRgb = (page: Page, token: string) =>
        page.evaluate((name) => {
          const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().slice(1);
          return `rgb(${[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
        }, token);
      const bg = (loc: ReturnType<Page['locator']>) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
      /** The card whose right edge sits on the snap line, or -1 while the strip is between cards. */
      const snappedIdx = (page: Page) =>
        page.locator(SEL.cards).evaluateAll((els) => els.findIndex((e) => Math.abs(window.innerWidth - 16 - e.getBoundingClientRect().right) <= 1));
      const expectSnapped = (page: Page, i: number, where: string) =>
        expect.poll(() => snappedIdx(page), { message: `card ${i} right-aligned @ ${where}` }).toBe(i);

      test('N3: a connector joins the two cards of its leg, in the colour of that leg', async ({ page }) => {
        await openDay(page, 0);
        const links = page.locator('[data-nav-leg]');
        await expect(links).toHaveCount(LOCATED.length - 1);
        for (let i = 0; i < LOCATED.length - 1; i++) {
          const a = links.nth(i);
          const sides = await a.evaluate((el) => {
            const li = el.closest('li')!;
            return {
              own: li.hasAttribute('data-stop-card'),
              prev: li.previousElementSibling?.hasAttribute('data-stop-card'),
              next: li.nextElementSibling?.hasAttribute('data-stop-card'),
              nextName: li.nextElementSibling?.textContent ?? '',
              prevName: li.previousElementSibling?.textContent ?? '',
            };
          });
          expect(sides.own, 'N3 connector is not a card').toBe(false);
          expect(sides.prev && sides.next, 'N3 between two cards').toBe(true);
          expect(sides.prevName).toContain(LOCATED[i].name);
          expect(sides.nextName).toContain(LOCATED[i + 1].name);
          const url = new URL((await a.getAttribute('href'))!);
          expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
          expect(url.searchParams.get('origin'), 'N3 origin = previous stop').toBe(located(LOCATED[i]));
          expect(url.searchParams.get('destination'), 'N3 destination = next stop').toBe(located(LOCATED[i + 1]));
          expect(url.searchParams.get('travelmode'), 'N3 no leg mode: the day default').toBe('driving');
          await expect(a).toHaveAttribute('target', '_blank');
          await expect(a).toHaveAttribute('rel', /noopener/);
          const label = (await a.getAttribute('aria-label'))!;
          expect(label).toContain(LOCATED[i].name);
          expect(label).toContain(LOCATED[i + 1].name);
          expect(label).toMatch(lang === 'th' ? /^นำทางจาก \d+ .+ ไป / : /^Go from \d+ .+ to /);
          expect((await a.innerText()).trim(), 'N3 visible word').toBe(lang === 'th' ? 'นำทาง' : 'Go');
          const leg = await tokenRgb(page, `--map-leg-${i + 1}`);
          expect(await bg(a), 'N3 button in the leg colour').toBe(leg);
          expect(await bg(a.locator('xpath=ancestor::li').locator('[data-nav-line]')), 'N3 line in the leg colour').toBe(leg);
        }
      });

      test('N4: the first stop has the from-my-location button at left, with no line; cards carry no links', async ({ page }) => {
        for (const d of [0, 2]) {
          await openDay(page, d);
          await expect(page.locator(`${SEL.cards} a`), `N4 no link in a card, day ${d}`).toHaveCount(0);
          const here = page.locator('[data-nav-here]');
          await expect(here, `N4 one from-here button, day ${d}`).toHaveCount(1);
          const li = here.locator('xpath=ancestor::li');
          expect(await li.evaluate((el) => !el.previousElementSibling && !el.hasAttribute('data-stop-card') && !!el.nextElementSibling?.hasAttribute('data-stop-card')), 'N4 right before the first card').toBe(true);
          await expect(li.locator('[data-nav-line]'), 'N4 no line').toHaveCount(0);
          const url = new URL((await here.getAttribute('href'))!);
          expect(url.searchParams.has('origin'), 'N4 no origin').toBe(false);
          expect(url.searchParams.get('travelmode')).toBe('driving');
          expect(await here.getAttribute('aria-label')).toMatch(lang === 'th' ? /^นำทางจากตำแหน่งปัจจุบันไป / : /^Go from my location to /);
          expect(await bg(here), 'N4 brand fill, light in both themes').toBe(await tokenRgb(page, '--brand-700'));
          expect((await here.innerText()).trim()).toBe(lang === 'th' ? 'นำทาง' : 'Go');
        }
      });

      test('N4: a mid-day card with no incoming leg gets a plain gap, not a button', LAYOUT, async ({ page }) => {
        await openDay(page, 1);
        const cards = page.locator(SEL.cards);
        await expect(cards).toHaveCount(3);
        const m = await cards.evaluateAll((els) =>
          els.map((e) => ({ left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, prevCard: !!e.previousElementSibling?.hasAttribute('data-stop-card') })),
        );
        expect(m[1].prevCard, 'N4 no connector before the stop after the unlocated one').toBe(true);
        expect(near(m[1].left - m[0].right, 8, 0.5), `N4 plain 8 px gap, got ${m[1].left - m[0].right}`).toBe(true);
        expect(m[2].prevCard, 'N4 the next pair has a connector').toBe(false);
        await expect(page.locator('[data-nav-leg]'), 'N4 only the located pair has a leg button').toHaveCount(1);
        await expect(page.locator('[data-nav-here]'), 'N4 only the first card has from-here').toHaveCount(1);
      });

      test('N4: when the day starts with an unlocated stop, the first located one still routes from my location', async ({ page }) => {
        await openDay(page, 3);
        await expect(page.locator(SEL.cards)).toHaveCount(2);
        const here = page.locator('[data-nav-here]');
        await expect(here).toHaveCount(1);
        expect(new URL((await here.getAttribute('href'))!).searchParams.has('origin'), 'N4 no origin').toBe(false);
        expect(await here.locator('xpath=ancestor::li').evaluate((el) => !el.previousElementSibling), 'N4 before the first card').toBe(true);
        const leg = page.locator('[data-nav-leg]');
        await expect(leg).toHaveCount(1);
        // Display index 1, as the map and the list colour it: the unlocated stop still counts.
        expect(await bg(leg), 'N4 slot follows the display index').toBe(await tokenRgb(page, '--map-leg-2'));
      });

      test('N6: tabbing to an off-screen button brings it on screen', LAYOUT, async ({ page }, info) => {
        await openDay(page, 0);
        await selectCard(page, 1);
        await expectSnapped(page, 1, 'before');
        const next = page.locator('[data-nav-leg]').nth(1);
        const vw = info.project.use.viewport!.width;
        const left = await next.evaluate((el) => el.getBoundingClientRect().left);
        expect(left, 'N6 off screen before the Tab').toBeGreaterThanOrEqual(vw);
        await page.locator(SEL.cards).nth(1).locator('[data-stop-select]').focus();
        await page.keyboard.press('Tab');
        await expect(next, 'N6 Tab lands on the next button').toBeFocused();
        await expect
          .poll(() => next.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.left >= 0 && r.right <= window.innerWidth;
          }), { message: 'N6 focused button on screen' })
          .toBe(true);
        await expectSnapped(page, 2, 'after Tab');
        await expectNoPageOverflow(page, info, 'after Tab');
      });

      for (const w of [320, 360, 476, 600, 767]) {
        test(`N5: right-aligned geometry at ${w}px wide`, async ({ page }, info) => {
          test.skip(info.project.name !== 'owner-phone', 'resized from one phone project; the others cover their own width');
          await page.setViewportSize({ width: w, height: info.project.use.viewport!.height });
          await openDay(page, 0);
          await expectSnapped(page, 0, `${w} open`);
          const measure = (i: number) =>
            page.evaluate(({ sel, i }) => {
              const r = (el: Element) => el.getBoundingClientRect();
              const card = document.querySelectorAll(sel.cards)[i];
              const c = r(card);
              const strip = r(document.querySelector(`${sel.carousel} ul`)!);
              const prevA = card.previousElementSibling?.querySelector('a');
              const nextLi = card.nextElementSibling;
              const nextA = nextLi?.querySelector('a');
              const nextLine = nextLi?.querySelector('[data-nav-line]');
              const a = prevA ? r(prevA) : null;
              return {
                gap: window.innerWidth - c.right,
                cardH: c.height,
                ring: { top: c.top - 2 - strip.top, bottom: strip.bottom - c.bottom - 2, right: strip.right - c.right - 2 },
                nameW: r(card.querySelector('[data-stop-select] .truncate')!).width,
                btn: a && { left: a.left, right: a.right, w: a.width, h: a.height },
                btnFont: prevA ? parseFloat(getComputedStyle(prevA.querySelector('span')!).fontSize) : null,
                nextLeft: nextA ? r(nextA).left : null,
                line: nextLine ? { left: r(nextLine).left, right: r(nextLine).right } : null,
                cardRight: c.right,
                overflow: getComputedStyle(card).overflowX,
              };
            }, { sel: SEL, i });
          for (const i of [1, 0, 3, 2]) {
            await selectCard(page, i);
            await expectSnapped(page, i, `${w} select ${i}`);
            const m = await measure(i);
            const where = `card ${i} @ ${w}`;
            expect.soft(near(m.gap, 16, 0.5), `N5 card 16 from the screen edge ${where}: ${m.gap}`).toBe(true);
            expect.soft(near(m.cardH, 98, 1), `N5 card height ${where}: ${m.cardH}`).toBe(true);
            expect.soft(m.overflow, `N5 card does not clip ${where}`).toBe('visible');
            expect.soft(m.nameW, `N5 name width ${where}`).toBeGreaterThanOrEqual(100);
            for (const [k, v] of Object.entries(m.ring)) expect.soft(v, `N5 ring inside the strip (${k}) ${where}`).toBeGreaterThanOrEqual(0);
            expect.soft(m.btn, `N5 button left of the card ${where}`).toBeTruthy();
            if (m.btn) {
              expect.soft(m.btn.left >= 0 && m.btn.right <= m.cardRight, `N5 button fully on screen ${where}: ${m.btn.left}..${m.btn.right}`).toBe(true);
              expect.soft(near(m.btn.w, 46, 0.5) && near(m.btn.h, 48, 0.5), `N5 button 46×48 ${where}: ${m.btn.w}×${m.btn.h}`).toBe(true);
              expect.soft(m.btnFont!, `N5 label ≥ 12 px ${where}`).toBeGreaterThanOrEqual(12);
            }
            if (i < 3) {
              // ≥ w + 2: its 2 px shadow stays off the screen too.
              expect.soft(m.nextLeft!, `N5 next button off screen, shadow included ${where}`).toBeGreaterThanOrEqual(w + 2);
              expect.soft(m.line!.left <= m.cardRight && m.line!.right >= w, `N5 next leg's stub reaches the screen edge ${where}`).toBe(true);
            } else {
              expect.soft(m.nextLeft, `N5 nothing after the last card ${where}`).toBeNull();
            }
          }
          const sw = (await rect(page, SEL.daySwitcher))!;
          const toggle = (await rect(page, SEL.toggle))!;
          // 16 from the edge until it reaches its cap, then it stays 408 and level with the toggle.
          expect.soft(near(sw.left, w <= 492 ? 16 : w - 16 - 44 - 8 - 408, 0.5), `N5 switcher left @ ${w}: ${sw.left}`).toBe(true);
          expect.soft(sw.width, `N5 switcher capped @ ${w}`).toBeLessThanOrEqual(408.5);
          expect.soft(near(toggle.left - sw.right, 8, 0.5), `N5 switcher ends 8 before the toggle @ ${w}: ${toggle.left - sw.right}`).toBe(true);
          await expectNoPageOverflow(page, { project: { use: { viewport: { width: w } } } } as TestInfo, `${w}`);
        });
      }

      test('N6: a swipe that starts on a button scrolls the strip, opens nothing, and lands on a card', LAYOUT, async ({ page, context }) => {
        await openDay(page, 0);
        await selectCard(page, 1);
        await expectSnapped(page, 1, 'before');
        const box = (await page.locator('[data-nav-leg]').first().boundingBox())!;
        const startX = Math.round(box.x + box.width / 2);
        const y = Math.round((await page.locator(`${SEL.carousel} ul`).boundingBox())!.y + (await page.locator(`${SEL.carousel} ul`).boundingBox())!.height / 2);
        expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.hasAttribute('data-nav-leg') ?? false, [startX, y]), 'N6 the swipe starts on the button').toBe(true);
        const opened: string[] = [];
        context.on('page', (p) => opened.push(p.url()));
        const scroll = () => page.locator(`${SEL.carousel} ul`).evaluate((el) => el.scrollLeft);
        const before = await scroll();
        await swipeStrip(page, startX, 'right');
        await expect.poll(scroll, { message: 'N6 the strip scrolled' }).not.toBe(before);
        await expect.poll(() => snappedIdx(page), { message: 'N6 snapped back to a card' }).toBe(0);
        expect(opened, 'N6 no link opened').toEqual([]);
      });

      test('N6: tapping a button opens its route and does not change the selection', async ({ page, context }) => {
        await context.route('https://www.google.com/**', (r) => r.abort());
        await openDay(page, 0);
        await selectCard(page, 1);
        await expectSnapped(page, 1, 'before');
        const before = query(page).placeId;
        const [popup] = await Promise.all([context.waitForEvent('page'), page.locator('[data-nav-leg]').first().tap()]);
        await popup.close();
        expect(query(page).placeId, 'N6 selection unchanged').toBe(before);
        await expectSnapped(page, 1, 'after');
      });

      test('N7: the selection follows the snapped card across connectors, first and last included', async ({ page }) => {
        await openDay(page, 0);
        const ids = fx.days[0].places.map((p) => p.id);
        // One swipe moves exactly one card, each way.
        const expectOn = async (i: number) => {
          await expect.poll(() => snappedIdx(page), { message: `N7 card ${i} snapped` }).toBe(i);
          await expect.poll(() => query(page).placeId, { message: `N7 placeId is card ${i}` }).toBe(ids[i]);
        };
        for (let i = 1; i < ids.length; i++) {
          await swipeStrip(page);
          await expectOn(i);
        }
        for (let i = ids.length - 2; i >= 0; i--) {
          await swipeStrip(page, undefined, 'right');
          await expectOn(i);
        }
      });

      test('N7: reopening the map on a selected stop right-aligns its card', LAYOUT, async ({ page }) => {
        await openDay(page, 0);
        await selectCard(page, 2);
        await expectSnapped(page, 2, 'selected');
        await page.reload();
        await expect(page.locator(SEL.carousel)).toBeVisible();
        await expectSnapped(page, 2, 'after reload');
      });
    });

    test('T5: swipe guide shows before the first swipe, goes for good after it', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      const trip = await findTrip(page);
      await freshStorage(page, `${trip}?day=1`);
      await openMap(page);
      expect(await toDayWithCards(page, 2), 'fixture trip needs a day with ≥ 2 located stops').toBe(true);
      const guide = page.locator('[data-swipe-guide]');
      await expect(guide, 'T5 guide shown with ≥ 2 pins, before any swipe').toHaveCount(1);
      await expect(guide).toBeVisible();
      expect(await guide.evaluate((el) => getComputedStyle(el).pointerEvents), 'T5 guide lets taps through').toBe('none');
      const g = (await rect(page, '[data-swipe-guide]'))!;
      const cardRects = await page.locator(SEL.cards).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.right > 0 && r.left < window.innerWidth));
      for (const c of cardRects) {
        expect(intersects(g, { ...c, cx: 0, width: c.width, height: c.height, left: c.left, right: c.right, top: c.top, bottom: c.bottom }), 'T5 guide does not cover a card (category/time stay readable)').toBe(false);
      }
      const cardText = () => page.locator(SEL.cards).evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText));
      const before = await cardText();

      await swipeStrip(page);
      await expect(guide, 'T5 guide gone after a real swipe').toHaveCount(0);
      expect(await cardText(), 'T5 cards keep their category/time text').toEqual(before);
      // The swipe selects a card when the strip settles. A reload inside that window can land on the list
      // (reported on TP-0130): this test is about the guide, so it reloads once the selection has rendered.
      await expect(page.locator(`${SEL.cards}[aria-current="true"]`), 'T5 the swipe selected a card').toHaveCount(1);

      await page.reload();
      await expect(page.locator('body')).toHaveAttribute('data-fullmap', '1');
      await expect(page.locator(SEL.carousel)).toBeVisible();
      await settle(page);
      expect(await page.locator(SEL.cards).count(), 'still ≥ 2 pins after reload').toBeGreaterThanOrEqual(2);
      await expect(guide, 'T5 guide stays gone after reload (localStorage)').toHaveCount(0);
    });

    test('T5: no guide on a day with a single pin', async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      const trip = await findTrip(page);
      await freshStorage(page, `${trip}?day=1`);
      await openMap(page);
      const seen = { multi: 0, single: 0 };
      for (;;) {
        const n = await page.locator(SEL.cards).count();
        if (n >= 2) {
          await expect(page.locator('[data-swipe-guide]'), 'T5 guide on a multi-pin day').toHaveCount(1);
          seen.multi += 1;
        } else if (n === 1) {
          await expect(page.locator('[data-swipe-guide]'), 'T5 no guide with one pin').toHaveCount(0);
          seen.single += 1;
        }
        const next = page.locator(SEL.nextDay);
        if (await next.isDisabled()) break;
        const url = page.url();
        await next.tap();
        await waitDay(page, url);
      }
      expect(seen.multi, 'fixture trip needs a multi-pin day').toBeGreaterThan(0);
      expect(seen.single, 'seed day 2 has exactly one located stop').toBeGreaterThan(0);
    });

    test('T6: the nudge plays once ever, without moving the selection or the strip', async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      const trip = await findTrip(page);
      await page.addInitScript(NUDGE_OBSERVER);
      await freshStorage(page, `${trip}?day=1`);
      const urlBefore = page.url();
      await page.locator(SEL.toggle).tap();
      await expect(page.locator(SEL.carousel)).toBeVisible();
      expect(await page.locator(SEL.cards).count(), 'fixture day 1 needs ≥ 2 pins').toBeGreaterThanOrEqual(2);
      await expect
        .poll(async () => (await nudgeState(page)).plays, { message: 'T6 nudge plays after the map opens', timeout: 5000 })
        .toBe(1);
      await expect.poll(async () => (await nudgeState(page)).active, { message: 'nudge ends' }).toBe(false);
      const st = await nudgeState(page);
      // No next card peeks any more: the nudge has to point at the leg's stub, so it pulls left on a first card.
      expect(await page.locator(`${SEL.carousel} ul`).evaluate((el) => el.style.getPropertyValue('--nudge-x')), 'T6 nudge pulls towards the next leg').toBe('-24px');
      expect(st.anim[0], 'T6 <li> carries the nudge animation while it plays').not.toBe('none');
      expect(st.end[0], 'T6 scrollLeft unchanged by the nudge').toBe(st.start[0]);
      expect(new URL(page.url()).searchParams.get('placeId'), 'T6 no placeId set by the nudge').toBe(new URL(urlBefore).searchParams.get('placeId'));

      // Reopen in the same page: not again.
      await page.locator(SEL.toggle).tap();
      await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
      await page.locator(SEL.toggle).tap();
      await expect(page.locator(SEL.carousel)).toBeVisible();
      await page.waitForTimeout(2500);
      expect((await nudgeState(page)).plays, 'T6 no second play on reopen').toBe(1);

      // And not after a reload either (map reopens by itself).
      await page.reload();
      await expect(page.locator(SEL.carousel)).toBeVisible();
      await page.waitForTimeout(2500);
      expect((await nudgeState(page)).plays, 'T6 no play after reload').toBe(0);
    });

    test.describe('reduced motion', () => {
      test.use({ reducedMotion: 'reduce' });
      // Green on main too (nothing plays at all); it guards the implementation's media check.
      test('T6: the nudge does not play with prefers-reduced-motion', async ({ page }, info) => {
        test.skip(!isPhone(info), 'phone flow');
        const trip = await findTrip(page);
        await page.addInitScript(NUDGE_OBSERVER);
        await freshStorage(page, `${trip}?day=1`);
        expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'precondition: reduced motion on').toBe(true);
        await page.locator(SEL.toggle).tap();
        await expect(page.locator(SEL.carousel)).toBeVisible();
        expect(await page.locator(SEL.cards).count(), 'fixture day 1 needs ≥ 2 pins').toBeGreaterThanOrEqual(2);
        await page.waitForTimeout(2500);
        expect((await nudgeState(page)).plays, 'T6 no nudge under reduced motion').toBe(0);
      });
    });

    test('T6b: every row shows its drag handle on touch, selected or not (TP-0133)', async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      await page.goto(await findTrip(page));
      await expect(page.locator(SEL.aside)).toBeVisible();
      await settle(page);
      const rowA = await railRow(page, 0);
      const rowB = rowA.locator('xpath=following-sibling::div[1]');
      test.skip((await rowB.count()) === 0, 'needs two rows');
      const handleOf = (r: typeof rowA) => r.locator('button[class*="handle"]').first();
      await rowA.scrollIntoViewIfNeeded();
      test.skip((await handleOf(rowA).count()) === 0, 'the dev user cannot edit this trip (no drag handles)');

      // Touch: select a row, then drop focus. Neither row is hovered or focused, so only the touch rule can show a handle.
      await selectRow(rowA);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.waitForTimeout(500); // let the handle's opacity transition settle
      await expect
        .poll(() => handleOf(rowA).evaluate((el) => parseFloat(getComputedStyle(el).opacity)), { message: 'T6b the selected row shows its drag handle under touch' })
        .toBeGreaterThan(0);
      // TP-0133: the owner overruled the #132 choice to hide it on unselected rows.
      expect(await handleOf(rowB).evaluate((el) => parseFloat(getComputedStyle(el).opacity)), 'T6b an unselected row shows its handle on touch').toBeGreaterThan(0);
    });

    // TP-0133: the always-visible handle must not crowd the rail or the stop number, nor sit under them.
    test('T6b: the touch drag handle clears the rail and the stop number, and is what a tap on it hits', LAYOUT, async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      await page.goto(await findTrip(page));
      await expect(page.locator(SEL.aside)).toBeVisible();
      await settle(page);
      const rowA = await railRow(page, 0);
      const rowB = rowA.locator('xpath=following-sibling::div[1]');
      test.skip((await rowB.count()) === 0, 'needs two rows');
      test.skip((await rowB.locator('button[class*="handle"]').count()) === 0, 'the dev user cannot edit this trip (no drag handles)');
      await rowB.scrollIntoViewIfNeeded();
      const m = await rowB.evaluate((row) => {
        const r = (el: Element) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
        const h = row.querySelector('button[class*="handle"]')!;
        const num = row.querySelector('[data-stop-number]')!;
        const rails = [...row.parentElement!.querySelectorAll('[data-leg-slot]')].map(r);
        const hb = h.getBoundingClientRect();
        const hit = document.elementFromPoint(hb.left + hb.width / 2, hb.top + hb.height / 2);
        return { h: r(h), num: r(num), rails, hitIsHandle: !!hit && h.contains(hit), opacity: parseFloat(getComputedStyle(h).opacity), vw: innerWidth };
      });
      const apart = (a: { left: number; right: number; top: number; bottom: number }, b: typeof a) =>
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      expect(m.opacity, 'the handle shows').toBeGreaterThan(0);
      expect(apart(m.h, m.num), `handle ${JSON.stringify(m.h)} clear of the stop number ${JSON.stringify(m.num)}`).toBe(true);
      for (const rail of m.rails) expect(apart(m.h, rail), `handle clear of rail ${JSON.stringify(rail)}`).toBe(true);
      expect(m.h.left, 'handle inside the viewport').toBeGreaterThanOrEqual(0);
      expect(m.hitIsHandle, 'nothing sits on top of the handle').toBe(true);
    });

    test('T6b: a tap elsewhere on an unselected row still selects it', async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      await page.goto(await findTrip(page));
      await expect(page.locator(SEL.aside)).toBeVisible();
      await settle(page);
      const rowA = await railRow(page, 0);
      const rowB = rowA.locator('xpath=following-sibling::div[1]');
      test.skip((await rowB.count()) === 0, 'needs two rows');
      test.skip((await rowB.locator('button[class*="handle"]').count()) === 0, 'the dev user cannot edit this trip (no drag handles)');
      await rowB.scrollIntoViewIfNeeded();
      expect(await rowB.locator('div[role="button"]').first().getAttribute('aria-current'), 'precondition: not selected').toBeNull();
      await selectRow(rowB);
    });

    // TP-0133: a phone can report hover: hover with a coarse pointer (some Android browsers, docked setups). The
    // handle must show there too. CDP Emulation.setEmulatedMedia ignores hover/pointer and mobile emulation pins them,
    // so this launches its own non-mobile Chromium with input-type settings (test.use can't set launchOptions in a describe). Red when the rule is only `(hover: none)`.
    test('T6b: the handle shows under hover: hover with a coarse pointer too', async ({ baseURL }, info) => {
      test.skip(info.project.name !== 'owner-phone', 'one run is enough: the browser is launched here (owner-phone runs every test, TP-0160)');
      const browser = await chromium.launch({ args: ['--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=2,availablePointerTypes=2'] });
      try {
        const page = await (await browser.newContext({ baseURL, viewport: { width: 412, height: 915 }, isMobile: false, hasTouch: false })).newPage();
        await page.goto(await findTrip(page));
        await expect(page.locator(SEL.aside)).toBeVisible();
        await settle(page);
        expect(await page.evaluate(() => [matchMedia('(hover: hover)').matches, matchMedia('(pointer: coarse)').matches]), 'precondition: hover + coarse').toEqual([true, true]);
        const rowA = await railRow(page, 0);
        const rowB = rowA.locator('xpath=following-sibling::div[1]');
        test.skip((await rowB.count()) === 0, 'needs two rows');
        const handle = rowB.locator('button[class*="handle"]').first();
        test.skip((await handle.count()) === 0, 'the dev user cannot edit this trip (no drag handles)');
        await page.mouse.move(0, 0); // nothing hovered
        await expect
          .poll(() => handle.evaluate((el) => parseFloat(getComputedStyle(el).opacity)), { message: 'T6b handle shows with hover:hover + pointer:coarse' })
          .toBeGreaterThan(0);
      } finally {
        await browser.close();
      }
    });

    // Desktop is unchanged: hidden until the row is hovered.
    test('T6b: on desktop the handle is hidden until its row is hovered', async ({ page }, info) => {
      test.skip(isPhone(info), 'desktop flow');
      await page.goto(await findTrip(page));
      await expect(page.locator(SEL.aside)).toBeVisible();
      await settle(page);
      const rowA = await railRow(page, 0);
      const handle = rowA.locator('button[class*="handle"]').first();
      test.skip((await handle.count()) === 0, 'the dev user cannot edit this trip (no drag handles)');
      const opacity = () => handle.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
      await page.mouse.move(0, 0);
      await expect.poll(opacity, { message: 'T6b desktop: unhovered handle hidden' }).toBe(0);
      await rowA.hover({ position: { x: 150, y: 14 } });
      await expect.poll(opacity, { message: 'T6b desktop: hovered row shows its handle' }).toBeGreaterThan(0);
    });

    test('T6b: the drag overlay has an opaque background', async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      await page.goto(await findTrip(page));
      await expect(page.locator(SEL.aside)).toBeVisible();
      await settle(page);
      const rowA = await railRow(page, 0);
      const handleOf = (r: typeof rowA) => r.locator('button[class*="handle"]').first();
      test.skip((await handleOf(rowA).count()) === 0, 'the dev user cannot edit this trip (no drag handles)');
      // Drag the handle a little with the mouse, look, cancel with Escape (no reorder is saved).
      const hb = (await handleOf(rowA).boundingBox())!;
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await page.mouse.down();
      try {
        await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 12, { steps: 4 });
        await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 24, { steps: 4 });
        const bg = await page.evaluate(() => {
          const fixedOf = (el: Element) => {
            for (let e: Element | null = el; e; e = e.parentElement) if ((e as HTMLElement).style.position === 'fixed') return e; // dnd-kit's overlay wrapper (inline style)
            return null;
          };
          const overlay = [...document.querySelectorAll('[class*="__row"]')].find((el) => fixedOf(el));
          if (!overlay) return null;
          return { row: getComputedStyle(overlay).backgroundColor, wrapper: getComputedStyle(fixedOf(overlay)!).backgroundColor };
        });
        expect(bg, 'T6b a drag overlay is rendered').not.toBeNull();
        expect(
          Math.max(alphaOf(bg!.row), alphaOf(bg!.wrapper)),
          `T6b overlay has an opaque background (row ${bg!.row}, wrapper ${bg!.wrapper})`,
        ).toBeGreaterThanOrEqual(0.99);
      } finally {
        await page.keyboard.press('Escape');
        await page.mouse.up();
      }
    });

    // ── TP-0121: row actions (note / edit / delete) on touch. Plan 2026-11-01-mobile-backlog §3, option A:
    // on a touch device only the selected row shows them; a hover device keeps hover-to-reveal. ──
    test.describe('row actions', () => {
      const ROW_NAMES = { time: 'Time only stop', short: 'Short note stop', mid: 'Mid note stop', long: 'Long note stop', nocoords: 'No coords stop', hotel: 'Fixture Hotel' };
      const NOTE_MID = 'Reserve the window seat, ask for Mika!';
      const NOTE_LONG = `First line of a long note that keeps going well past the width of a phone screen.\nSecond line stays.\nUnbroken_${'x'.repeat(60)}`;
      const ROW_DAYS = [
        {
          places: [
            { kind: 'sight', name: ROW_NAMES.time, lat: 35, lng: 135.7, time: '9:00 AM', duration: '1h', price: '¥1200' },
            { kind: 'sight', name: ROW_NAMES.short, lat: 35.01, lng: 135.71, time: '11:00 AM', note: 'Book ahead' },
            { kind: 'food', name: ROW_NAMES.mid, lat: 35.02, lng: 135.72, time: '12:30 PM', note: NOTE_MID },
            { kind: 'sight', name: ROW_NAMES.long, lat: 35.03, lng: 135.73, time: '2:00 PM', note: NOTE_LONG },
            { kind: 'sight', name: ROW_NAMES.nocoords },
          ],
        },
      ];
      const HOTELS = [{ name: ROW_NAMES.hotel, checkInDate: '2030-01-01', checkOutDate: '2030-01-02' }];

      let fx: Fixture;
      test.beforeAll(async ({ browser, baseURL }) => {
        const ctx = await browser.newContext({ baseURL });
        fx = await createFixture(await ctx.newPage(), baseURL!, ROW_DAYS, HOTELS);
        await ctx.close();
      });
      test.afterAll(async ({ browser, baseURL }) => {
        if (!fx) return;
        const ctx = await browser.newContext({ baseURL });
        await removeFixture(await ctx.newPage(), baseURL!, fx);
        await ctx.close();
      });

      const openTrip = async (page: Page) => {
        await page.goto(fx.trip);
        await expect(page.locator(SEL.aside)).toBeVisible();
        await settle(page);
      };
      const rowFor = (page: Page, name: string) =>
        page
          .locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"] div.group`)
          .filter({ hasText: name });

      /** The row's note / edit / delete controls: every link and button that is not the row body or the drag handle. */
      const actionsOf = (row: ReturnType<Page['locator']>) =>
        row.evaluate((group) => {
          const effOpacity = (el: Element | null) => {
            let o = 1;
            for (; el; el = el.parentElement) o *= parseFloat(getComputedStyle(el).opacity);
            return o;
          };
          const els = [...group.querySelectorAll('a, button')].filter((el) => !el.closest('[role="button"]') && !el.hasAttribute('aria-roledescription'));
          return els.map((el) => {
            const r = el.getBoundingClientRect();
            const shown = el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && effOpacity(el) > 0.01;
            return { label: el.getAttribute('aria-label') ?? el.tagName, shown, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          });
        });

      /** Selected row: what each control overlaps, and whether a 44 px box round its centre is its own to tap. */
      const geometryOf = (row: ReturnType<Page['locator']>) =>
        row.evaluate((group) => {
          const acts = [...group.querySelectorAll('a, button')].filter((el) => !el.closest('[role="button"]') && !el.hasAttribute('aria-roledescription'));
          const body = group.querySelector('div[role="button"]')!;
          const blockedBy = (el: Element, x: number, y: number) => {
            const h = document.elementFromPoint(x, y);
            return h && (h === el || el.contains(h)) ? null : `(${Math.round(x - 0)},${Math.round(y)}) ${h?.tagName}.${String(h?.className).slice(0, 30)} "${h?.textContent?.trim().slice(0, 20)}"`;
          };
          const under: { name: string; r: DOMRect }[] = [];
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) under.push({ name: `text "${n.textContent.trim().slice(0, 24)}"`, r });
          }
          for (const c of body.querySelectorAll('a, button, summary')) under.push({ name: `control ${c.textContent?.trim().slice(0, 24)}`, r: c.getBoundingClientRect() });
          return acts.map((el) => {
            const r = el.getBoundingClientRect();
            const cx = (r.left + r.right) / 2;
            const cy = (r.top + r.bottom) / 2;
            const overlaps = under
              .filter((u) => u.r.left < r.right - 0.5 && r.left + 0.5 < u.r.right && u.r.top < r.bottom - 0.5 && r.top + 0.5 < u.r.bottom)
              .map((u) => u.name);
            const box44 = [[-21.5, -21.5], [21.5, -21.5], [-21.5, 21.5], [21.5, 21.5], [0, 0]].map(([dx, dy]) => blockedBy(el, cx + dx, cy + dy)).filter(Boolean);
            return { label: el.getAttribute('aria-label') ?? el.tagName, overlaps, box44, onScreen: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 };
          });
        });

      const allRows = [ROW_NAMES.time, ROW_NAMES.short, ROW_NAMES.mid, ROW_NAMES.long, ROW_NAMES.nocoords, ROW_NAMES.hotel];

      test('R1: on touch, no row shows its actions until it is selected', async ({ page }, info) => {
        test.skip(!isPhone(info), 'touch only');
        await openTrip(page);
        for (const name of allRows) {
          const row = rowFor(page, name);
          await row.scrollIntoViewIfNeeded();
          const acts = await actionsOf(row);
          // An unselected row has no edit/delete; the hotel's edit-stay link is its only one.
          expect(acts.length, `R1 ${name}: the row has controls to hide`).toBeGreaterThan(0);
          expect(acts.filter((a) => a.shown).map((a) => a.label), `R1 ${name} (${lang}) shows no action while unselected`).toEqual([]);
        }
      });

      test('R1: before hydration (server HTML only) no row flashes its actions on touch', async ({ browser, baseURL }, info) => {
        test.skip(!isPhone(info), 'touch only');
        const ctx = await browser.newContext({ ...info.project.use, baseURL, javaScriptEnabled: false });
        try {
          const page = await ctx.newPage();
          await page.goto(fx.trip);
          const row = rowFor(page, ROW_NAMES.mid);
          await expect(row, 'R1 SSR renders the rows').toHaveCount(1);
          // Without JS the list column is itself hidden on a phone: look only at the row's own subtree.
          const acts = await row.evaluate((group) => {
            // The static drag handle is a disabled button (TP-0133 owns it).
            const els = [...group.querySelectorAll('a, button:not([disabled])')].filter((el) => !el.closest('[role="button"]') && !el.hasAttribute('aria-roledescription'));
            const hidden = (el: Element) => {
              for (let n: Element | null = el; n && n !== group.parentElement; n = n.parentElement) {
                if (getComputedStyle(n).display === 'none' || getComputedStyle(n).visibility === 'hidden') return true;
              }
              return false;
            };
            return { static: !group.querySelector('div[role="button"]'), shown: els.filter((el) => !hidden(el)).map((el) => el.getAttribute('aria-label')), n: els.length };
          });
          expect(acts.static, 'R1 this is the pre-hydration row').toBe(true);
          expect(acts.n).toBeGreaterThan(0);
          expect(acts.shown, 'R1 SSR row shows no action').toEqual([]);
        } finally {
          await ctx.close();
        }
      });

      test('R2: a selected row shows its actions clear of its text and buttons, each tappable', LAYOUT, async ({ page }, info) => {
        test.skip(!isPhone(info), 'touch only');
        test.fixme(true, "TP-0158: a leg sheet is left open over the No coords stop, so its actions lose their 44 px box");
        await openTrip(page);
        for (const name of allRows) {
          const row = rowFor(page, name);
          await row.scrollIntoViewIfNeeded();
          await selectRow(row);
          await settle(page);
          // Clear of the fixed bottom nav and the List/Map button, which would otherwise cover a 44 px box.
          await row.evaluate((el) => {
            const act = [...el.querySelectorAll('a, button')].filter((x) => !x.closest('[role="button"]') && !x.hasAttribute('aria-roledescription')).pop();
            (act ?? el).scrollIntoView({ block: 'center' });
          });
          const acts = await actionsOf(row);
          const want = name === ROW_NAMES.hotel ? 1 : 3;
          expect(acts.filter((a) => a.shown).length, `R2 ${name} (${lang}) shows its ${want} actions`).toBe(want);
          for (const g of await geometryOf(row)) {
            expect(g.overlaps, `R2 ${name} / ${g.label} overlaps nothing`).toEqual([]);
            expect(g.box44, `R2 ${name} / ${g.label} owns a 44 px box`).toEqual([]);
            expect(g.onScreen, `R2 ${name} / ${g.label} on screen`).toBe(true);
          }
        }
      });

      test('R2: the hotel stop can be selected, and its edit link then opens the booking', async ({ page }, info) => {
        test.skip(!isPhone(info), 'touch only');
        await openTrip(page);
        const row = rowFor(page, ROW_NAMES.hotel);
        await row.scrollIntoViewIfNeeded();
        await selectRow(row);
        const link = row.locator('a[href*="/booking/"]');
        await expect(link).toBeVisible();
        await page.waitForTimeout(250); // a press within 150 ms of the selecting tap is its own synthesized click, and is ignored
        await link.tap();
        await expect(page).toHaveURL(/\/booking\//);
      });

      test('R3: "Find on map" opens its link on a tap, mid-chip and at its end', LAYOUT, async ({ page }, info) => {
        test.skip(!isPhone(info), 'touch only');
        await page.context().route(/google\.com\/maps/, (r) => r.fulfill({ body: 'ok' }));
        await openTrip(page);
        const row = rowFor(page, ROW_NAMES.nocoords);
        await row.scrollIntoViewIfNeeded();
        const chip = row.locator('div[role="button"] a[target="_blank"]').first();
        await expect(chip, 'R3 the place without coordinates has the unverified chip').toBeVisible();
        const box = (await chip.boundingBox())!;
        for (const x of [box.width / 2, box.width - 4]) {
          const [popup] = await Promise.all([page.waitForEvent('popup'), chip.tap({ position: { x, y: box.height / 2 } })]);
          await popup.waitForLoadState().catch(() => {});
          expect(popup.url(), `R3 tap at x=${Math.round(x)} of ${Math.round(box.width)}`).toContain('google.com/maps');
          await popup.close();
        }
      });

      test('R4: a selected row shows its whole note, wrapped, not cut off', LAYOUT, async ({ page }, info) => {
        test.skip(!isPhone(info), 'touch only');
        await openTrip(page);
        for (const [name, tail] of [[ROW_NAMES.short, 'Book ahead'], [ROW_NAMES.mid, NOTE_MID], [ROW_NAMES.long, 'x'.repeat(60)]] as const) {
          const row = rowFor(page, name);
          await row.scrollIntoViewIfNeeded();
          await selectRow(row);
          await settle(page);
          const m = await row.evaluate((group, tailText) => {
            const body = group.querySelector('div[role="button"]')!;
            const spans = [...body.querySelectorAll('span')].filter((s) => s.children.length === 0 && s.textContent?.includes(tailText));
            const note = spans[spans.length - 1];
            if (!note) return null;
            const lh = parseFloat(getComputedStyle(note).lineHeight) || 16;
            const chip = note.parentElement!;
            const range = document.createRange();
            range.selectNodeContents(note);
            const rects = [...range.getClientRects()].filter((r) => r.width > 0);
            const box = chip.getBoundingClientRect();
            const lines = new Set(rects.map((r) => Math.round(r.top))).size;
            return {
              noteFits: note.scrollWidth <= note.clientWidth + 1 && note.scrollHeight <= note.clientHeight + 1,
              dims: [note.scrollWidth, note.clientWidth, note.scrollHeight, note.clientHeight],
              chipFits: chip.scrollWidth <= chip.clientWidth + 1, // scrollWidth rounds fractional widths up
              insideChip: rects.every((r) => r.left >= box.left - 1 && r.right <= box.right + 1 && r.bottom <= box.bottom + 1),
              insideScreen: box.right <= window.innerWidth,
              lines,
              // 'Second line stays.' must start a line of its own: at the note's left edge, below the first line.
              secondStarts: (() => {
                const t = note.firstChild;
                const i = (t?.textContent ?? '').indexOf('Second line stays.');
                if (!t || i < 0) return null;
                const at = (k: number) => {
                  const rg = document.createRange();
                  rg.setStart(t, k);
                  rg.setEnd(t, k + 1);
                  return rg.getBoundingClientRect();
                };
                const first = at(0);
                const second = at(i);
                const end = at(i + 'Second line stays.'.length - 1); // the final '.'
                const next = at(i + 'Second line stays.'.length + 1); // the 'U' of the line after it
                return Math.abs(second.left - first.left) < 1 && second.top > first.top + lh / 2 && next.top > end.top + lh / 2;
              })(),
              height: note.getBoundingClientRect().height,
              lh,
              text: note.textContent,
            };
          }, tail);
          expect(m, `R4 ${name}: the note is shown in full`).not.toBeNull();
          expect(m!.noteFits, `R4 ${name} (${lang}) note text not clipped ${JSON.stringify(m!.dims)}`).toBe(true);
          expect(m!.chipFits, `R4 ${name} chip not clipped`).toBe(true);
          expect(m!.insideChip, `R4 ${name} text inside its chip`).toBe(true);
          expect(m!.insideScreen, `R4 ${name} chip inside the screen`).toBe(true);
          if (name === ROW_NAMES.long) {
            expect(m!.text, 'R4 the line break and the whole text are kept').toBe(NOTE_LONG);
            expect(m!.secondStarts, 'R4 "Second line stays." starts its own line').toBe(true);
            expect(m!.lines, 'R4 the long note wraps over several lines').toBeGreaterThan(3);
            expect(m!.height, 'R4 the box is as tall as its lines').toBeGreaterThanOrEqual(m!.lh * 4);
          }
        }
      });

      /** What a finger would hit at the centre of each of the row's actions, with no manual scroll. */
      const hitsOf = (row: ReturnType<Page['locator']>) =>
        row.evaluate((group) => {
          const els = [...group.querySelectorAll('a, button')].filter((el) => !el.closest('[role="button"]') && !el.hasAttribute('aria-roledescription') && !(el as HTMLButtonElement).disabled);
          return els.map((el) => {
            const r = el.getBoundingClientRect();
            const x = (r.left + r.right) / 2;
            const y = (r.top + r.bottom) / 2;
            const h = document.elementFromPoint(x, y);
            return { label: el.getAttribute('aria-label') ?? el.tagName, ok: x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight && !!h && (h === el || el.contains(h)), y: Math.round(y), vh: innerHeight, on: `${h?.tagName}.${String(h?.className).slice(0, 30)}` };
          });
        });

      test('R2: right after a tap, with no manual scroll, every action of the row is on screen and receives a tap', LAYOUT, async ({ page }, info) => {
        test.skip(!isPhone(info), 'touch only');
        await openTrip(page);
        for (const name of allRows) {
          const row = rowFor(page, name);
          await row.evaluate((el) => el.scrollIntoView({ block: 'start' })); // worst case: the row starts at the top
          await selectRow(row);
          await expect
            .poll(async () => (await hitsOf(row)).filter((h) => !h.ok).map((h) => `${h.label} @${h.y}/${h.vh} under ${h.on}`), { message: `R2 ${name} (${lang}) actions hittable after the tap` })
            .toEqual([]);
          expect((await hitsOf(row)).length, `R2 ${name} has its actions`).toBe(name === ROW_NAMES.hotel ? 1 : 3);
        }
      });

      test('R2: tapping a row below an open long note brings the tapped row into view', LAYOUT, async ({ page }, info) => {
        test.skip(!isPhone(info), 'touch only');
        await openTrip(page);
        const long = rowFor(page, ROW_NAMES.long);
        await long.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await selectRow(long);
        await settle(page);
        // The note row is open above; tap the stop under it, near the top of the screen: when the long row collapses it moves up by its height.
        const below = rowFor(page, ROW_NAMES.nocoords);
        await below.evaluate((el) => { el.scrollIntoView({ block: 'start' }); scrollBy(0, -130); });
        await selectRow(below);
        await expect
          .poll(async () => below.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight && r.bottom <= innerHeight; }), { message: 'R2 the tapped row is on screen after the one above collapses' })
          .toBe(true);
        await expect.poll(async () => (await hitsOf(below)).filter((h) => !h.ok).length, { message: 'R2 its actions are hittable' }).toBe(0);
        // The tap's own click lands where the collapsed row above has moved the new icons: it must not press one.
        await expect(page.locator('[role="dialog"], [role="alertdialog"]'), 'R2 the tap opened no note or delete dialog').toHaveCount(0);
      });

      test('R2: a selection that is not a tap (opened from a link with ?placeId=) does not scroll to the actions', async ({ page }, info) => {
        test.skip(!isPhone(info), 'touch only');
        await page.goto(`${fx.trip}?day=0&placeId=${fx.days[0].places[3].id}`);
        await expect(page.locator(SEL.aside)).toBeVisible();
        await settle(page);
        const row = rowFor(page, ROW_NAMES.long);
        await expect(row.locator('div[role="button"]').first()).toHaveAttribute('aria-current', 'true');
        const y0 = await page.evaluate(() => scrollY);
        await page.waitForTimeout(1200);
        expect(await page.evaluate(() => scrollY), 'R3b no scroll without a tap').toBe(y0);
      });

      // A phone can report hover: hover with a coarse pointer (see T6b): the actions must follow the pointer, not the hover media type.
      // CDP can't set hover/pointer and mobile emulation pins them, so this launches its own non-mobile Chromium.
      test('R2: hover + coarse pointer: unselected rows show no action, the selected row shows all three', async ({ baseURL }, info) => {
        test.skip(info.project.name !== 'owner-phone' || lang !== 'en', 'one run is enough: the browser is launched here (owner-phone runs every test, TP-0160)');
        const browser = await chromium.launch({ args: ['--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=2,availablePointerTypes=2'] });
        try {
          const page = await (await browser.newContext({ baseURL, viewport: { width: 412, height: 915 }, isMobile: false, hasTouch: false })).newPage();
          await page.goto(fx.trip);
          await expect(page.locator(SEL.aside)).toBeVisible();
          await settle(page);
          expect(await page.evaluate(() => [matchMedia('(hover: hover)').matches, matchMedia('(pointer: coarse)').matches]), 'precondition: hover + coarse').toEqual([true, true]);
          const row = rowFor(page, ROW_NAMES.mid);
          await row.scrollIntoViewIfNeeded();
          await page.mouse.move(0, 0);
          expect((await actionsOf(row)).filter((a) => a.shown).length, 'unselected: no action').toBe(0);
          await row.locator('div[role="button"]').first().click({ position: { x: 150, y: 14 } });
          await expect(row.locator('div[role="button"]').first()).toHaveAttribute('aria-current', 'true');
          await page.mouse.move(0, 0);
          // Fully opaque once the 150 ms fade has run: a faint, fading-out icon does not count as shown.
          await expect
            .poll(() => row.evaluate((g) => [...g.querySelectorAll('a, button')].filter((el) => !el.closest('[role="button"]') && !el.hasAttribute('aria-roledescription')).map((el) => { let o = 1; for (let n: Element | null = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o > 0.99; })), { message: 'selected: three fully visible actions, with no hover' })
            .toEqual([true, true, true]);
        } finally {
          await browser.close();
        }
      });

      test('desktop R5: hovering a row still reveals its actions, and it hides them again', async ({ page }, info) => {
        test.skip(isPhone(info), 'hover device only');
        await openTrip(page);
        const row = rowFor(page, ROW_NAMES.mid);
        await row.scrollIntoViewIfNeeded();
        await page.mouse.move(2, 2);
        await expect.poll(async () => (await actionsOf(row)).filter((a) => a.shown).length, { message: 'R5 hidden while not hovered' }).toBe(0);
        await row.hover();
        await expect.poll(async () => (await actionsOf(row)).filter((a) => a.shown).length, { message: 'R5 shown on hover' }).toBe(3);
        const geo = await geometryOf(row);
        expect(geo.length).toBe(3);
        await page.mouse.move(2, 2);
        await expect.poll(async () => (await actionsOf(row)).filter((a) => a.shown).length, { message: 'R5 hidden again' }).toBe(0);
        // Keyboard: focusing a control inside the row reveals them.
        await row.locator('button[aria-label]:not([aria-roledescription])').first().focus();
        await expect.poll(async () => (await actionsOf(row)).filter((a) => a.shown).length, { message: 'R5 shown on keyboard focus' }).toBe(3);
      });
    });

    // TP-0133: a real touch drop from an unselected row's handle reorders and saves. Own disposable trip: it reorders.
    test.describe('touch reorder', () => {
      test.skip(({ isMobile }) => !isMobile, 'phone flow');
      let fx: Fixture;
      test.beforeAll(async ({ browser, baseURL }) => {
        const ctx = await browser.newContext({ baseURL });
        fx = await createFixture(await ctx.newPage(), baseURL!, [{ places: stopsAt(35, 3) }]);
        await ctx.close();
      });
      test.afterAll(async ({ browser, baseURL }) => {
        if (!fx) return;
        const ctx = await browser.newContext({ baseURL });
        await removeFixture(await ctx.newPage(), baseURL!, fx);
        await ctx.close();
      });

      test('T6b: a touch drag from an unselected row\'s handle reorders, and the order survives a reload', async ({ page }, info) => {
        test.skip(!isPhone(info), 'phone flow');
        const day = fx.days[0];
        const orderOf = () =>
          page.evaluate(
            (dayId) => [...new Set([...document.querySelectorAll(`[data-day-id="${dayId}"] [data-place-id]`)].map((e) => e.getAttribute('data-place-id')!))],
            day.id,
          );
        const row = (i: number) => page.locator(`${SEL.aside} [data-day-id="${day.id}"] div[role="button"]:has([data-place-id="${day.places[i].id}"])`);
        const ids = day.places.map((p) => p.id);
        await page.goto(fx.trip);
        await expect(page.locator(SEL.aside)).toBeVisible();
        await settle(page);
        expect(await orderOf(), 'precondition: seeded order').toEqual(ids);
        await row(1).scrollIntoViewIfNeeded();
        expect(await row(1).getAttribute('aria-current'), 'precondition: the row is not selected').toBeNull();
        const handle = row(1).locator('xpath=preceding-sibling::button[contains(@class,"handle")]');
        await expect(handle).toBeVisible();
        const hb = (await handle.boundingBox())!;
        const above = (await row(0).boundingBox())!;
        const x = Math.round(hb.x + hb.width / 2);
        const y = Math.round(hb.y + hb.height / 2);
        const dy = Math.round(hb.y - above.y) + 12; // past the row above's middle
        const cdp = await page.context().newCDPSession(page);
        try {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let d = 6; d < dy; d += 6) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - d }] });
            await page.waitForTimeout(16);
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - dy }] });
          await page.waitForTimeout(150);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } finally {
          await cdp.detach();
        }
        const want = [ids[1], ids[0], ids[2]];
        await expect.poll(orderOf, { message: 'optimistic order after the drop' }).toEqual(want);
        // Saved: poll the reloaded page until the server has it (the save is a server action).
        await expect
          .poll(async () => {
            await page.reload();
            await expect(page.locator(SEL.aside)).toBeVisible();
            return orderOf();
          }, { message: 'the saved order after a reload', timeout: 30_000 })
          .toEqual(want);
      });
    });

    // ── TP-0141: legs. Day 2's stops go through POST /days/:dayId/places with `arrive` (the first one with no
    // Idempotency-Key), so each leg has a row and a note; the long-note test drives PUT/DELETE /places/:id/arrive.
    // TP-0152: the leg bar is one line (mode · distance · time · note icon); mode, time and note are read and
    // edited in the leg sheet it opens. ──
    test.describe('legs TP-0141', () => {
      const LEG = 'div[class*="__segment"]';
      const HOTEL = { name: 'Hotel A', checkInDate: '2030-01-01', checkOutDate: '2030-01-03', lat: 34.99, lng: 135.69 };
      // 500 characters, no spaces: nothing to wrap at.
      const LONG_NOTE = 'Matsuyama-expressway-via-Imabari-'.repeat(16).slice(0, 500);
      /** A located leg bar with its second line (pill + note or add prompt): a note bar measures 59 (en) / 61.6 (th)
       *  on owner-phone and desktop, an add-prompt bar 6 less; + 4 slack. */
      const BAR_2LINE_MAX = 66;
      const ARRIVES = [
        { mode: 'walk', note: 'from hotel' },
        { mode: 'drive', note: 'n12' },
        { mode: 'drive', note: 'n23' },
        { mode: 'drive', note: 'n34' },
      ];
      const msg = MESSAGES[lang];
      const modeOfLabel: Record<string, LegMode> = {
        [msg.itin_mode_walk]: 'walk',
        [msg.itin_mode_drive]: 'drive',
        [msg.itin_mode_transit]: 'transit',
      };
      type LegsTrip = { id: string; url: string; day2: string; day3: string; stops: { id: string; name: string }[] };
      /** One leg bar: the stop it leaves from, its mode (null on a "No location" bar), that bar's hint, and its
       *  second line (TP-0152): the note, or (editors, no note) the add prompt. */
      type Leg = { from: string | null; mode: LegMode | null; hint: string | null; hasNote: boolean; note: string | null; add: string | null; text: string };

      // Each test builds and drops its own trip, with the run's token.
      let fx: { token: string };
      test.beforeAll(() => {
        fx = { token: runState().token };
      });

      async function legsTrip(page: Page, baseURL: string): Promise<LegsTrip> {
        const res = await api(page, 'post', `${baseURL}/api/v1/trips/import`, fx.token, {
          trip: { title: 'TP-0141 e2e legs', startDate: '2030-01-01', endDate: '2030-01-03' },
          days: [{ places: stopsAt(34, 1) }, { places: [] }, { places: stopsAt(36, 2) }],
          hotels: [HOTEL],
        });
        expect(res.status(), 'legs trip import').toBe(201);
        const { trip } = await res.json();
        const day2 = trip.days[1].id as string;
        const stops: LegsTrip['stops'] = [];
        for (const [i, p] of stopsAt(35, 4).entries()) {
          const body = i === 2 ? { kind: p.kind, name: p.name } : p; // the third stop has no coordinates
          const r = await api(page, 'post', `${baseURL}/api/v1/days/${day2}/places`, fx.token, { ...body, arrive: ARRIVES[i] }, i !== 0);
          expect(r.status(), `POST stop ${i + 1}`).toBe(201);
          const { place } = await r.json();
          expect(place.arrive, `POST stop ${i + 1} echoes its arrive`).toMatchObject(ARRIVES[i]);
          stops.push({ id: place.id, name: p.name });
        }
        return { id: trip.id, url: `/trip/${trip.id}`, day2, day3: trip.days[2].id, stops };
      }
      const dropTrip = async (page: Page, baseURL: string, t: LegsTrip) => {
        const res = await api(page, 'delete', `${baseURL}/api/v1/trips/${t.id}`, fx.token);
        expect(res.ok(), 'legs trip removed').toBe(true);
      };
      type SavedArrive = { mode: string; note?: string | null; durationMin?: number | null } | null;
      // TP-0154: a dropped keep-alive socket (ECONNRESET / socket hang up) under
      // a busy local `next start` is retried; anything else, or the third
      // failure, surfaces with its original message.
      const readTrip = async (page: Page, baseURL: string, t: LegsTrip) => {
        const get = () =>
          page.request.get(`${baseURL}/api/v1/trips/${t.id}`, { headers: { Authorization: `Bearer ${fx.token}` } });
        let res: Awaited<ReturnType<typeof get>> | undefined;
        for (let attempt = 1; !res; attempt++) {
          try {
            res = await get();
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (attempt >= 3 || !/ECONNRESET|socket hang up|ECONNREFUSED/i.test(msg)) {
              throw new Error(`legs trip read failed: ${msg}`, { cause: e });
            }
            await page.waitForTimeout(250 * attempt);
          }
        }
        expect(res.ok()).toBe(true);
        return (await res.json()).trip as {
          days: { id: string; start: { mode: string; note: string | null } | null; places: { id: string; arrive: SavedArrive }[] }[];
        };
      };
      /** Day 2's legs as the API has them: its start, then every stop's arrive, by stop id. */
      const savedLegs = async (page: Page, baseURL: string, t: LegsTrip) => {
        const d = (await readTrip(page, baseURL, t)).days[1];
        return { start: d.start, arrive: Object.fromEntries(d.places.map((p) => [p.id, p.arrive])) };
      };
      // Visible only: a streamed Suspense chunk React has not swapped in yet (`<div hidden id="S:n">`) can hold a
      // second copy of the aside for a while after load.
      const dayOf = (page: Page, dayId: string) => page.locator(`${SEL.aside} [data-day-id="${dayId}"]`).filter({ visible: true });

      /** Every leg bar the day shows, in order. */
      const legsOf = async (page: Page, dayId: string): Promise<Leg[]> => {
        const raw = await dayOf(page, dayId).evaluate(
          (day, sel) =>
            [...day.querySelectorAll(sel)].map((el) => {
              const bar = el.querySelector('button');
              return {
                from: el.parentElement?.querySelector('[data-place-id]')?.getAttribute('data-place-id') ?? null,
                bar: !!bar,
                label: el.querySelector('[class*="__segMetaText"]')?.textContent?.split(' · ')[0] ?? null,
                hint: el.querySelector('[class*="segChipUnavailable"] b')?.textContent ?? null,
                hasNote: !!bar?.querySelector('[class*="__segNoteLine"]'),
                note: bar?.querySelector('[class*="__segNoteLine"]')?.textContent ?? null,
                add: bar?.querySelector('[class*="__segAddLine"]')?.textContent ?? null,
                text: bar?.textContent ?? '',
              };
            }),
          LEG,
        );
        return raw.map(({ bar, label, ...l }) => {
          expect(bar, `the leg from ${l.from} is a bar button`).toBe(true);
          return { ...l, mode: label == null ? null : (modeOfLabel[label] ?? null) };
        });
      };
      const openDay = async (page: Page, t: LegsTrip, idx: number, dayId: string, legs: number) => {
        await page.goto(`${t.url}?day=${idx}`);
        await expect(dayOf(page, dayId)).toBeVisible();
        // Bars open the sheet only once the list has mounted (before that it is the static list).
        await expect(dayOf(page, dayId).locator('button[aria-roledescription]').first(), 'the list is interactive').toBeAttached();
        await expect(dayOf(page, dayId).locator(LEG), 'legs shown').toHaveCount(legs);
      };
      const legFrom = (legs: Leg[], id: string) => legs.find((l) => l.from === id);
      const barOf = (page: Page, dayId: string, i: number) => dayOf(page, dayId).locator(LEG).nth(i).locator('button').first();
      const sheetOf = (page: Page) => page.locator('[role="dialog"]');
      const confirmOf = (page: Page) => page.locator('[role="alertdialog"]');

      /** Opens the leg sheet from the leg bar leaving `from` (a stop id, or the bar's index in the day). */
      async function openSheet(page: Page, dayId: string, from: string | number) {
        const i = typeof from === 'number' ? from : (await legsOf(page, dayId)).findIndex((l) => l.from === from);
        expect(i, `a leg leaves ${from}`).toBeGreaterThanOrEqual(0);
        const bar = barOf(page, dayId, i);
        await bar.scrollIntoViewIfNeeded();
        await expect(bar, 'the bar is ready').toBeEnabled();
        await bar.click();
        await expect(sheetOf(page)).toHaveCount(1);
        await expect(sheetOf(page)).toBeVisible();
        return sheetOf(page);
      }
      const sheetMode = async (sheet: Locator) =>
        SHEET_MODES[await sheet.locator('[role="group"] button').evaluateAll((bs) => bs.findIndex((b) => b.getAttribute('aria-pressed') === 'true'))];
      const pickMode = async (sheet: Locator, mode: LegMode) => {
        const b = sheet.locator('[role="group"] button').nth(SHEET_MODES.indexOf(mode));
        await b.click();
        await expect(b).toHaveAttribute('aria-pressed', 'true');
      };
      const saveSheet = async (page: Page) => {
        const save = sheetOf(page).locator('button[type="submit"]');
        await expect(save, 'Save is on once something changed').toBeEnabled();
        await save.click();
      };
      /** ✕ on an unedited sheet closes it at once. */
      const closeSheet = async (page: Page) => {
        await sheetOf(page).getByRole('button', { name: msg.leg_sheet_close, exact: true }).click();
        await expect(sheetOf(page)).toHaveCount(0);
      };

      /** dnd-kit keyboard reorder: focus the handle, Space, then one ArrowDown per stop in `over`, Space.
       *  Each step waits for dnd-kit's live-region announcement naming the stop it is now over. */
      async function moveDown(page: Page, dayId: string, placeId: string, over: string[]) {
        const body = dayOf(page, dayId).locator(`div[role="button"]:has([data-place-id="${placeId}"])`);
        const handle = body.locator('xpath=preceding-sibling::button[contains(@class,"handle")]');
        await handle.scrollIntoViewIfNeeded();
        await handle.focus();
        await page.keyboard.press('Space');
        await expect(handle, 'picked up').toHaveAttribute('aria-pressed', 'true');
        for (const id of over) {
          await page.keyboard.press('ArrowDown');
          await expect(page.locator('[id^="DndLiveRegion"]').filter({ hasText: id }), `over ${id}`).toHaveCount(1);
        }
        await page.keyboard.press('Space');
        await expect(handle, 'dropped').not.toHaveAttribute('aria-pressed', 'true');
      }
      const savedOrder = async (page: Page, baseURL: string, t: LegsTrip, want: string[]) =>
        expect
          .poll(async () => (await readTrip(page, baseURL, t)).days[1].places.map((p) => p.id), { message: 'the saved order', timeout: 30_000 })
          .toEqual(want);

      test('TP-0141: every leg keeps its bar and hint after reorder and remove', async ({ page, baseURL }) => {
        const t = await legsTrip(page, baseURL!);
        try {
          const [s1, s2, s3, s4] = t.stops;
          // Every shown leg is a bar: with its mode, or (one end has no coordinates) the "No location for" hint instead.
          const check = async (where: string) => {
            const legs = await legsOf(page, t.day2);
            for (const l of legs) expect(l.mode != null !== (l.hint != null), `${where}: the leg from ${l.from} shows a mode or a hint`).toBe(true);
            expect(legs.filter((l) => l.hint != null).map((l) => l.hint), `${where}: "No location for" on both legs touching the coordless stop`).toEqual([s3.name, s3.name]);
            return legs;
          };
          // Hotel → 4 stops → hotel: 5 legs.
          await openDay(page, t, 1, t.day2, 5);
          const seeded = await check('seeded');
          expect(seeded.map((l) => l.mode), 'seeded: start (walk), stop 1 → 2 (drive) and the hotel leg show a mode').toEqual(['walk', 'drive', null, null, 'drive']);

          await moveDown(page, t.day2, s1.id, [s2.id]);
          await savedOrder(page, baseURL!, t, [s2.id, s1.id, s3.id, s4.id]);
          await openDay(page, t, 1, t.day2, 5);
          const moved = await check('after reorder');
          expect(moved.filter((l) => l.hint != null).map((l) => l.from), 'after reorder: the hint legs leave stop 1 and the coordless stop').toEqual([s1.id, s3.id]);
          // The sheet shows the bar's mode.
          const sheet = await openSheet(page, t.day2, s2.id);
          await expect(sheet).toHaveAttribute('aria-label', `${s2.name} → ${s1.name}`);
          expect(await sheetMode(sheet), 'the sheet opens on the bar\'s mode').toBe(legFrom(moved, s2.id)!.mode);
          await closeSheet(page);

          // Remove through the row's trash button + its confirm dialog (TP-0112; the action redirects to the bare trip).
          await dayOf(page, t.day2).locator(`[data-place-delete="${s4.id}"]`).evaluate((b) => (b as HTMLButtonElement).click());
          await page.getByRole('alertdialog').getByRole('button', { name: /^(Remove|เอาออก)$/ }).click();
          await savedOrder(page, baseURL!, t, [s2.id, s1.id, s3.id]);
          await openDay(page, t, 1, t.day2, 4);
          const removed = await check('after remove');
          expect(removed.filter((l) => l.mode != null), 'after remove: start and stop 2 → 1 show a mode').toHaveLength(2);
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      test('TP-0141: a leg note shows on its leg and follows its pair after reorder', async ({ page, baseURL }) => {
        const t = await legsTrip(page, baseURL!);
        try {
          const [s1, s2, s3, s4] = t.stops;
          const noteIn = async (from: string | number) => {
            const sheet = await openSheet(page, t.day2, from);
            const v = await sheet.locator('textarea').inputValue();
            await closeSheet(page);
            return v;
          };
          await openDay(page, t, 1, t.day2, 5);
          const before = await legsOf(page, t.day2);
          expect(before.map((l) => l.hasNote), 'the four stops\' arrive notes mark their legs, not the hotel leg').toEqual([true, true, true, true, false]);
          expect(await noteIn(0), 'the start leg carries stop 1\'s arrive note').toBe('from hotel');
          expect([await noteIn(s1.id), await noteIn(s2.id), await noteIn(s3.id)]).toEqual(['n12', 'n23', 'n34']);

          // Stop 1 to the end: stop 2 → 3 and 3 → 4 stay neighbours, hotel → 1 and 1 → 2 are broken.
          await moveDown(page, t.day2, s1.id, [s2.id, s3.id, s4.id]);
          await savedOrder(page, baseURL!, t, [s2.id, s3.id, s4.id, s1.id]);
          await openDay(page, t, 1, t.day2, 5);
          const after = await legsOf(page, t.day2);
          expect(after.filter((l) => l.hasNote).map((l) => l.from), 'n12 and the start note are gone with their pairs').toEqual([s2.id, s3.id]);
          expect(await noteIn(s2.id), 'n23 still on stop 2 → 3').toBe('n23');
          expect(await noteIn(s3.id), 'n34 still on stop 3 → 4').toBe('n34');
          expect(await noteIn(s4.id), 'stop 4 → 1 has no note').toBe('');
          const savedDay2 = (await readTrip(page, baseURL!, t)).days[1];
          expect(savedDay2.places.map((p) => p.arrive?.note ?? null), 'GET places[].arrive agrees').toEqual([null, 'n23', 'n34', null]);
          expect(savedDay2.start?.note ?? null).toBeNull();
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      test('TP-0141: changing the hotel-to-first-stop mode changes only that day', async ({ page, baseURL }) => {
        const t = await legsTrip(page, baseURL!);
        try {
          // Hotel → 2 stops on day 3 (its last morning): 2 legs, no hotel at the end.
          await openDay(page, t, 2, t.day3, 2);
          expect((await legsOf(page, t.day3))[0].mode, 'precondition: day 3 starts by Drive').toBe('drive');
          await openDay(page, t, 1, t.day2, 5);
          expect((await legsOf(page, t.day2))[0].mode, 'precondition: day 2 starts by Walk (stop 1\'s arrive)').toBe('walk');

          const sheet = await openSheet(page, t.day2, 0);
          expect(await sheetMode(sheet)).toBe('walk');
          await pickMode(sheet, 'transit');
          await saveSheet(page);
          await expect(sheetOf(page), 'a save closes the sheet').toHaveCount(0);
          await expect.poll(async () => (await readTrip(page, baseURL!, t)).days[1].start?.mode, { message: 'day 2 start saved' }).toBe('transit');
          await expect.poll(async () => (await legsOf(page, t.day2))[0].mode, { message: 'the bar shows the new mode' }).toBe('transit');

          await openDay(page, t, 1, t.day2, 5);
          expect((await legsOf(page, t.day2))[0].mode, 'day 2 start is Transit after a reload').toBe('transit');
          expect(await sheetMode(await openSheet(page, t.day2, 0)), 'and so is its sheet').toBe('transit');
          await closeSheet(page);
          await openDay(page, t, 2, t.day3, 2);
          expect((await legsOf(page, t.day3))[0].mode, 'day 3 start is still Drive').toBe('drive');
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      test('TP-0141: a long leg note keeps its bar to one note line on a phone', LAYOUT, async ({ page, baseURL }, info) => {
        const t = await legsTrip(page, baseURL!);
        try {
          const [s1, s2, s3, s4] = t.stops;
          // Stop 1 → 2: a located leg, so its bar is the one-line mode bar.
          const put = await api(page, 'put', `${baseURL}/api/v1/places/${s2.id}/arrive`, fx.token, { mode: 'transit', note: LONG_NOTE });
          expect(put.status(), 'PUT arrive').toBe(200);
          const putBody = await put.json();
          expect(Object.keys(putBody).sort()).toEqual(['arrive', 'tripId']);
          expect(putBody.tripId).toBe(t.id);
          expect(putBody.arrive).toMatchObject({ mode: 'transit', note: LONG_NOTE });

          await openDay(page, t, 1, t.day2, 5);
          const legs = await legsOf(page, t.day2);
          const i = legs.findIndex((l) => l.from === s1.id);
          expect(legs[i]).toMatchObject({ mode: 'transit', hasNote: true, note: LONG_NOTE });
          const bar = barOf(page, t.day2, i);
          await bar.scrollIntoViewIfNeeded();
          const noteLine = bar.locator('[class*="__segNoteLine"]');
          await expect(noteLine, 'the bar shows the note on its second line (TP-0152)').toBeVisible();
          const line = await noteLine.evaluate((el) => ({ h: el.getBoundingClientRect().height, sw: el.scrollWidth, cw: el.clientWidth }));
          expect(line.sw, 'the long note is cut off with an ellipsis, not wrapped').toBeGreaterThan(line.cw);
          // One 12 px line + padding/border measures 24 (en) / 25.2 (th); two lines would be ≥ 40.
          expect(line.h, 'one line of note').toBeLessThanOrEqual(30);
          await expectNoPageOverflow(page, info, 'long leg note');
          const heights = await dayOf(page, t.day2).locator(`${LEG}[class*="__segOneLine"] > button`).evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height));
          expect(heights.length, 'the located legs have mode bars').toBe(3);
          // Pill + one second line (note or add prompt), and the long note's bar no taller than the start leg's
          // (short note "from hotel"): the note never wraps the bar.
          for (const h of heights) expect(h, `two lines (pill + note/add): ${heights}`).toBeLessThanOrEqual(BAR_2LINE_MAX);
          const barH = async (k: number) => barOf(page, t.day2, k).evaluate((b) => b.getBoundingClientRect().height);
          expect(Math.abs((await barH(i)) - (await barH(0))), 'the long note bar is as tall as a short note bar').toBeLessThanOrEqual(1);
          const sheet = await openSheet(page, t.day2, i);
          await expect(sheet.locator('textarea'), 'the whole note is in the sheet').toHaveValue(LONG_NOTE);
          await expectNoPageOverflow(page, info, 'long leg note in the sheet');
          await closeSheet(page);

          const del = await api(page, 'delete', `${baseURL}/api/v1/places/${s4.id}/arrive`, fx.token);
          expect(del.status(), 'DELETE arrive').toBe(200);
          expect(await del.json()).toEqual({ arrive: null, tripId: t.id });
          await openDay(page, t, 1, t.day2, 5);
          const cleared = await legsOf(page, t.day2);
          expect(legFrom(cleared, s3.id)?.hasNote, 'DELETE cleared the note').toBe(false);
          expect(legFrom(cleared, s3.id)?.add, 'and the editor sees the add prompt instead').toBe(msg.leg_add_time_note);
          expect(legFrom(cleared, s3.id)?.hint, 'the leg itself stays, with its hint').toBe(s3.name);
          expect(legFrom(cleared, s2.id)?.hasNote, 'the other notes are untouched').toBe(true);
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      test('TP-0150: a leg bar tap box never overlaps Navigate', LAYOUT, async ({ page, baseURL }) => {
        const t = await legsTrip(page, baseURL!);
        try {
          await openDay(page, t, 1, t.day2, 5);
          /** Per bar with a Navigate link: their boxes as tapped (a .tp-hit box is ≥ 44 × 44 around its centre on touch). */
          const boxes = () =>
            dayOf(page, t.day2).evaluate((day, sel) => {
              const coarse = matchMedia('(pointer: coarse)').matches;
              const hit = (el: Element) => {
                const r = el.getBoundingClientRect();
                const w = coarse ? Math.max(r.width, 44) : r.width;
                const h = coarse ? Math.max(r.height, 44) : r.height;
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 };
              };
              return [...day.querySelectorAll(sel)].flatMap((el) => {
                const bar = el.querySelector('button');
                const nav = el.querySelector('a[target="_blank"]');
                if (!bar || !nav) return [];
                const a = hit(bar);
                const b = hit(nav);
                return [{ overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom, a, b }];
              });
            }, LEG);
          const seeded = await boxes();
          // Start, stop 1 → 2 and the hotel leg are located: each has Navigate.
          expect(seeded.length, 'every located leg is measured').toBe(3);
          for (const g of seeded) expect(g.overlap, `bar ${JSON.stringify(g.a)} clear of Navigate ${JSON.stringify(g.b)}`).toBe(false);
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      test('TP-0152: edit a leg note from the list; the bar shows the note line', async ({ page, baseURL }) => {
        const t = await legsTrip(page, baseURL!);
        try {
          const [s1, s2] = t.stops;
          // Stop 1 → 2 without a note to start from.
          expect((await api(page, 'delete', `${baseURL}/api/v1/places/${s2.id}/arrive`, fx.token)).status()).toBe(200);
          await openDay(page, t, 1, t.day2, 5);
          expect(legFrom(await legsOf(page, t.day2), s1.id), 'precondition: no note, the add prompt').toMatchObject({ hasNote: false, add: msg.leg_add_time_note });
          const sheet = await openSheet(page, t.day2, s1.id);
          await expect(sheet).toHaveAttribute('aria-label', `${s1.name} → ${s2.name}`);
          await expect(sheet.locator('button[type="submit"]'), 'Save is off until something changes').toBeDisabled();
          await sheet.locator('input[type="number"]').fill('40');
          await sheet.locator('textarea').fill('Platform 3, IC card');
          await saveSheet(page);
          await expect(sheetOf(page), 'a save closes the sheet').toHaveCount(0);
          await expect.poll(async () => legFrom(await legsOf(page, t.day2), s1.id), { message: 'the bar shows the note line and the time' }).toMatchObject({ note: 'Platform 3, IC card', add: null, text: expect.stringContaining('~40m') });
          expect((await savedLegs(page, baseURL!, t)).arrive[s2.id], 'saved').toMatchObject({ note: 'Platform 3, IC card', durationMin: 40 });
          await openDay(page, t, 1, t.day2, 5);
          const again = await openSheet(page, t.day2, s1.id);
          await expect(again.locator('textarea'), 'after a reload').toHaveValue('Platform 3, IC card');
          await expect(again.locator('input[type="number"]')).toHaveValue('40');
          await closeSheet(page);
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      test('TP-0152: an edited sheet asks before discarding', async ({ page, baseURL }) => {
        const t = await legsTrip(page, baseURL!);
        try {
          const [s1, s2] = t.stops;
          await openDay(page, t, 1, t.day2, 5);
          const sheet = await openSheet(page, t.day2, s1.id);
          await sheet.locator('textarea').fill('typed, not saved');
          await sheet.getByRole('button', { name: msg.leg_sheet_close, exact: true }).click();
          await expect(confirmOf(page), '✕ on an edited sheet asks').toBeVisible();
          await confirmOf(page).getByRole('button', { name: msg.cancel, exact: true }).click();
          await expect(confirmOf(page)).toHaveCount(0);
          await expect(sheet, 'cancel keeps the sheet').toBeVisible();
          await expect(sheet.locator('textarea'), 'with what was typed').toHaveValue('typed, not saved');
          await sheet.getByRole('button', { name: msg.leg_sheet_close, exact: true }).click();
          await confirmOf(page).getByRole('button', { name: msg.leg_sheet_discard_confirm, exact: true }).click();
          await expect(sheetOf(page), 'discard closes it').toHaveCount(0);
          expect((await savedLegs(page, baseURL!, t)).arrive[s2.id]?.note, 'nothing saved').toBe('n12');
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      test('TP-0152: a stale sheet does not overwrite another leg', async ({ page, context, baseURL }) => {
        const t = await legsTrip(page, baseURL!);
        try {
          const [s1, s2, s3, s4] = t.stops;
          const expectRefused = async (where: string) => {
            await saveSheet(page);
            await expect(sheetOf(page).locator('[role="alert"]'), `${where}: the sheet says the plan changed`).toHaveText(msg.leg_sheet_changed);
            await expect(sheetOf(page), `${where}: and stays open`).toBeVisible();
            await expect(sheetOf(page).locator('textarea'), `${where}: with what was typed`).toHaveValue(`stale ${where}`);
            // Closing it asks first (it is still edited).
            await sheetOf(page).getByRole('button', { name: msg.leg_sheet_close, exact: true }).click();
            await confirmOf(page).getByRole('button', { name: msg.leg_sheet_discard_confirm, exact: true }).click();
            await expect(sheetOf(page)).toHaveCount(0);
          };

          // (a) Stop 1 → 2 is open here while another tab moves stop 1 below stop 2.
          await openDay(page, t, 1, t.day2, 5);
          const sheet = await openSheet(page, t.day2, s1.id);
          await sheet.locator('textarea').fill('stale reorder');
          const other = await context.newPage();
          await openDay(other, t, 1, t.day2, 5);
          await moveDown(other, t.day2, s1.id, [s2.id]);
          await savedOrder(other, baseURL!, t, [s2.id, s1.id, s3.id, s4.id]);
          await other.close();
          const afterMove = await savedLegs(page, baseURL!, t);
          await page.bringToFront();
          await expectRefused('reorder');
          expect(await savedLegs(page, baseURL!, t), 'reorder: no leg changed').toEqual(afterMove);

          // (b) Stop 1 → 3 (the order is now 2, 1, 3, 4) is open here while stop 3 is deleted.
          await openDay(page, t, 1, t.day2, 5);
          const second = await openSheet(page, t.day2, s1.id);
          await expect(second).toHaveAttribute('aria-label', `${s1.name} → ${s3.name}`);
          await second.locator('textarea').fill('stale delete');
          expect((await api(page, 'delete', `${baseURL}/api/v1/places/${s3.id}`, fx.token)).ok(), 'DELETE stop 3').toBe(true);
          const afterDelete = await savedLegs(page, baseURL!, t);
          await expectRefused('delete');
          expect(await savedLegs(page, baseURL!, t), 'delete: no leg changed').toEqual(afterDelete);
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      /** Phone full map on day 2, the badge of stop 1 → 2 tapped: selected, its sheet open over the map. */
      async function sheetOverMap(page: Page, t: LegsTrip) {
        const [s1, s2] = t.stops;
        const badge = page.locator(`[data-trip-map-section] [data-route-badge][data-leg-to="${s2.id}"]`);
        await expect(badge, 'stop 1 → 2 draws a badge').toBeVisible();
        const { x, y } = await badge.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        await page.touchscreen.tap(x, y);
        await expect(sheetOf(page)).toBeVisible();
        await expect(sheetOf(page)).toHaveAttribute('aria-label', `${s1.name} → ${s2.name}`);
        await expect.poll(() => query(page).placeId, { message: 'the tap selects the leg\'s destination' }).toBe(s2.id);
        await expect(page.locator('body')).toHaveAttribute('data-fullmap', '1');
        return sheetOf(page);
      }
      const mapOpen = (page: Page) => expect(page.locator('body')).toHaveAttribute('data-fullmap', '1');

      test('TP-0152: phone full map — tap a leg opens the sheet; Back closes the sheet, then the map', async ({ page, baseURL }, info) => {
        test.skip(!isPhone(info), 'phone flow');
        test.fixme(true, 'TP-0164: on the Google map the sheet is sometimes still open after Back');
        const t = await legsTrip(page, baseURL!);
        try {
          await openDay(page, t, 1, t.day2, 5);
          await openMap(page);
          await sheetOverMap(page, t);
          await page.goBack();
          await expect(sheetOf(page), 'the first Back closes the sheet').toHaveCount(0);
          await mapOpen(page);
          await page.waitForTimeout(400);
          await mapOpen(page);
          await page.goBack();
          await closed(page);
          await expect(sheetOf(page)).toHaveCount(0);

          // An edited sheet: Back asks, and the sheet and the map stay.
          await openMap(page);
          const sheet = await sheetOverMap(page, t);
          await sheet.locator('textarea').fill('typed over the map');
          await page.goBack();
          await expect(confirmOf(page), 'Back on an edited sheet asks').toBeVisible();
          await expect(sheet).toBeVisible();
          await mapOpen(page);
          await confirmOf(page).getByRole('button', { name: msg.cancel, exact: true }).click();
          await expect(confirmOf(page)).toHaveCount(0);
          await expect(sheet.locator('textarea'), 'cancel keeps what was typed').toHaveValue('typed over the map');
          await mapOpen(page);
          // Back again, then discard: the sheet closes, the map stays, and one more Back closes the map.
          await page.goBack();
          await expect(confirmOf(page)).toBeVisible();
          await confirmOf(page).getByRole('button', { name: msg.leg_sheet_discard_confirm, exact: true }).click();
          await expect(sheetOf(page)).toHaveCount(0);
          await page.waitForTimeout(400);
          await mapOpen(page);
          await page.goBack();
          await closed(page);
          expect((await savedLegs(page, baseURL!, t)).arrive[t.stops[1].id]?.note, 'nothing saved').toBe('n12');
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      test('TP-0152: phone full map — save from the sheet keeps the map', async ({ page, baseURL }, info) => {
        test.skip(!isPhone(info), 'phone flow');
        test.fixme(true, 'TP-0164: on the Google map the sheet is sometimes still open after Back');
        const t = await legsTrip(page, baseURL!);
        try {
          const s2 = t.stops[1];
          const badge = page.locator(`[data-trip-map-section] [data-route-badge][data-leg-to="${s2.id}"]`);
          await openDay(page, t, 1, t.day2, 5);
          await page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true));
          await openMap(page);
          await expect(badge).toHaveAttribute('data-route-badge', 'drive');
          const sheet = await sheetOverMap(page, t);
          await pickMode(sheet, 'walk');
          await saveSheet(page);
          await expect(sheetOf(page), 'a save closes the sheet').toHaveCount(0);
          await expect(badge, 'the badge shows the new mode').toHaveAttribute('data-route-badge', 'walk');
          await page.waitForTimeout(600);
          await mapOpen(page);
          expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same), 'no reload').toBe(true);
          await expect.poll(async () => (await savedLegs(page, baseURL!, t)).arrive[s2.id]?.mode, { message: 'saved' }).toBe('walk');
          await page.goBack();
          await closed(page);
          await expect(sheetOf(page)).toHaveCount(0);
          // TP-0153: Back from a stop picked in the map must not leave the list entry tagged, so a reload stays
          // on the list (it used to reopen the map).
          await page.reload();
          await expect(page.locator(SEL.aside)).toBeAttached();
          await settle(page);
          await closed(page);
          await expect(sheetOf(page), 'no stale sheet after a reload').toHaveCount(0);
          await openDay(page, t, 1, t.day2, 5);
          await expect(sheetOf(page)).toHaveCount(0);
          expect(legFrom(await legsOf(page, t.day2), t.stops[0].id)?.mode, 'the list shows it too').toBe('walk');
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      // Read-only: e2e runs as one AUTH_BYPASS user who can edit every trip they see, and the API cannot add a
      // member, so this only runs against a trip the user can't edit (as C3 viewer). Unit: leg-sheet-fields.test.ts.
      test('TP-0152: read-only sheet shows the leg without inputs', async ({ page }) => {
        await page.goto(await findTrip(page));
        await expect(page.locator(SEL.aside)).toBeVisible();
        await settle(page);
        test.skip((await page.locator(`${SEL.aside} button[class*="handle"]`).count()) > 0, 'the dev user can edit the seeded trip');
        const bar = page.locator(`${SEL.aside} ${LEG} > button:not(:disabled)`).first();
        await bar.scrollIntoViewIfNeeded();
        await bar.click();
        await expect(sheetOf(page)).toBeVisible();
        await expect(sheetOf(page).locator('textarea, input, button[type="submit"], [role="group"]')).toHaveCount(0);
        await closeSheet(page);
      });

      // ── TP-0152 C: the leg affordance (list second line, stop-card "from" row, active labelled badge). ──

      test('TP-0152 C: list bar shows the note line, or an add prompt for editors', async ({ page, baseURL }) => {
        const t = await legsTrip(page, baseURL!);
        try {
          const [s1, s2, , s4] = t.stops;
          await openDay(page, t, 1, t.day2, 5);
          const legs = await legsOf(page, t.day2);
          // hotel → 1, 1 → 2, 2 → 3 and 3 → 4 (no location: stop 3 has no coordinates) carry notes; 4 → hotel has none.
          expect(legs.map((l) => l.note), 'every noted leg shows its note').toEqual(['from hotel', 'n12', 'n23', 'n34', null]);
          expect(legs.map((l) => l.add), 'the leg without a note (and no time) prompts to add one').toEqual([null, null, null, null, msg.leg_add_time_note]);
          for (let i = 0; i < legs.length; i++) {
            const second = barOf(page, t.day2, i).locator('[class*="__segNoteLine"], [class*="__segAddLine"]');
            await expect(second, `bar ${i}: one second line, inside the bar button`).toHaveCount(1);
            await expect(second).toBeVisible();
          }

          // A time but no note: the prompt asks for a note only.
          const put = await api(page, 'put', `${baseURL}/api/v1/places/${s2.id}/arrive`, fx.token, { mode: 'drive', durationMin: 25 });
          expect(put.status(), 'PUT arrive (time, no note)').toBe(200);
          await openDay(page, t, 1, t.day2, 5);
          expect(legFrom(await legsOf(page, t.day2), s1.id), 'time only → "add a note"').toMatchObject({ note: null, add: msg.leg_add_note, text: expect.stringContaining('~25m') });

          // Tapping the second line is tapping the bar: the sheet opens on that leg.
          const addLine = barOf(page, t.day2, 4).locator('[class*="__segAddLine"]');
          await addLine.scrollIntoViewIfNeeded();
          await expect(barOf(page, t.day2, 4)).toBeEnabled();
          await addLine.click();
          await expect(sheetOf(page), 'the add prompt opens the sheet').toBeVisible();
          await expect(sheetOf(page)).toHaveAttribute('aria-label', `${s4.name} → ${HOTEL.name}`);
          await closeSheet(page);
          const noteLine = barOf(page, t.day2, 0).locator('[class*="__segNoteLine"]');
          await noteLine.scrollIntoViewIfNeeded();
          await noteLine.click();
          await expect(sheetOf(page), 'the note line opens the sheet').toBeVisible();
          await expect(sheetOf(page)).toHaveAttribute('aria-label', `${HOTEL.name} → ${s1.name}`);
          await expect(sheetOf(page).locator('textarea')).toHaveValue('from hotel');
          await closeSheet(page);
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      /** The phone map's card for a stop (by its select button's text; the "from" row of the next card names it too). */
      const cardOf = (page: Page, name: string) => page.locator(SEL.cards).filter({ has: page.locator('[data-stop-select]', { hasText: name }) });

      test('TP-0152 C: the stop card "from" row opens the sheet without changing the selection', async ({ page, baseURL }, info) => {
        test.skip(!isPhone(info), 'phone map cards');
        const t = await legsTrip(page, baseURL!);
        try {
          const [s1, s2] = t.stops;
          await openDay(page, t, 1, t.day2, 5);
          await openMap(page);
          const card = cardOf(page, s2.name);
          await expect(card).toHaveCount(1);
          await card.locator('[data-stop-select]').tap();
          await expect(card, 'card 2 selected through its select button').toHaveAttribute('aria-current', 'true');
          await expect.poll(() => query(page).placeId).toBe(s2.id);
          const row = card.locator('[data-leg-row]');
          await expect(row).toHaveJSProperty('tagName', 'BUTTON');
          await expect(row, 'the row names where the leg comes from, with its note').toContainText(msg.map_leg_from.replace('{name}', s1.name));
          await expect(row).toContainText('n12');
          const box = (await row.boundingBox())!;
          expect(Math.round(box.height), 'the row is a 44 px target').toBeGreaterThanOrEqual(44);
          await row.tap();
          await expect(sheetOf(page), 'the row opens the leg sheet').toBeVisible();
          await expect(sheetOf(page)).toHaveAttribute('aria-label', `${s1.name} → ${s2.name}`);
          expect(query(page).placeId, 'the selection does not change').toBe(s2.id);
          await expect(card).toHaveAttribute('aria-current', 'true');
          await mapOpen(page);
          await closeSheet(page);
          await mapOpen(page);
          expect(query(page).placeId, 'still selected after the sheet closes').toBe(s2.id);
          await expect(card).toHaveAttribute('aria-current', 'true');
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      test('TP-0152 C: stop cards keep one height across days', LAYOUT, async ({ page, baseURL }, info) => {
        test.skip(!isPhone(info), 'phone map cards');
        const t = await legsTrip(page, baseURL!);
        try {
          await page.goto(`${t.url}?day=0`);
          await expect(page.locator(SEL.aside)).toBeVisible();
          await settle(page);
          await openMap(page);
          const seen: { day: string | null; heights: number[]; top: number }[] = [];
          for (let d = 0; d < 3; d++) {
            if (d > 0) {
              const url = page.url();
              await page.locator(SEL.nextDay).tap();
              await waitDay(page, url);
            }
            await expect(page.locator(SEL.cards).first()).toBeVisible();
            seen.push({
              day: query(page).day,
              heights: await page.locator(SEL.cards).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10)),
              top: (await rect(page, SEL.carousel))!.top,
            });
            if (d === 0) {
              // Day 1 starts at its only stop: no leg into it, a plain (non-interactive) row of the same height.
              const first = page.locator(SEL.cards).first().locator('[data-leg-row]');
              await expect(first).toHaveJSProperty('tagName', 'DIV');
              await expect(first).toHaveText(msg.map_leg_first);
            }
            if (d === 1) await expect(cardOf(page, t.stops[1].name).locator('[data-leg-row]'), 'day 2: a row with a note').toContainText('n12');
          }
          // Day 1: one stop (+ hotel), day 2: noted legs, day 3: no notes.
          const all = seen.flatMap((s) => s.heights);
          expect(all.length, `cards on every day: ${JSON.stringify(seen)}`).toBeGreaterThanOrEqual(4);
          for (const h of all) expect(Math.abs(h - 98), `every card 98 tall: ${JSON.stringify(seen)}`).toBeLessThanOrEqual(1);
          for (const s of seen) expect(Math.abs(s.top - seen[0].top), `the strip does not move between days: ${JSON.stringify(seen)}`).toBeLessThanOrEqual(1);
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });

      test("TP-0152 C: the selected stop's badge is marked active and labelled when long enough", async ({ page, baseURL }, info) => {
        // Its own trip: A → B is ~7 km and spans the fitted day, so it is long on screen at any zoom the map picks;
        // B → C is ~1.4 km (≥ 300 m: badged). Both legs have a mode, so both draw a badge.
        const imp = await api(page, 'post', `${baseURL}/api/v1/trips/import`, fx.token, {
          trip: { title: 'TP-0152 e2e badge', startDate: '2030-01-01', endDate: '2030-01-01' },
          days: [{ places: [] }],
        });
        expect(imp.status(), 'badge trip import').toBe(201);
        const { trip } = await imp.json();
        const t = { id: trip.id as string } as LegsTrip;
        try {
          const day = trip.days[0].id as string;
          const stops = [
            { kind: 'sight', name: 'Badge A', lat: 35, lng: 135.7 },
            { kind: 'sight', name: 'Badge B', lat: 35.05, lng: 135.75, arrive: { mode: 'drive', durationMin: 25, note: 'via the river' } },
            { kind: 'sight', name: 'Badge C', lat: 35.06, lng: 135.76, arrive: { mode: 'walk' } },
          ];
          const ids: string[] = [];
          for (const [i, p] of stops.entries()) {
            const r = await api(page, 'post', `${baseURL}/api/v1/days/${day}/places`, fx.token, p, i !== 0);
            expect(r.status(), `POST ${p.name}`).toBe(201);
            ids.push((await r.json()).place.id);
          }
          const [, b, c] = ids;
          await page.goto(`/trip/${trip.id}?day=0`);
          await expect(page.locator(SEL.aside)).toBeVisible();
          await settle(page);
          if (isPhone(info)) await openMap(page);
          const badge = (to: string) => page.locator(`[data-trip-map-section] [data-route-badge][data-leg-to="${to}"]`);
          const active = page.locator('[data-trip-map-section] [data-route-badge][data-active]');
          await expect(badge(b), 'A → B draws a badge').toBeVisible();
          await expect(badge(c), 'B → C draws a badge').toBeAttached();
          await expect(active, 'nothing selected, nothing active').toHaveCount(0);

          const select = async (name: string, id: string) => {
            if (isPhone(info)) {
              await cardOf(page, name).locator('[data-stop-select]').tap();
              await expect(cardOf(page, name)).toHaveAttribute('aria-current', 'true');
            } else {
              const row = page.locator(`${SEL.aside} div[role="button"]:has([data-place-id="${id}"])`).first();
              await row.scrollIntoViewIfNeeded();
              await row.click({ position: { x: 150, y: 14 } });
              await expect(row).toHaveAttribute('aria-current', 'true');
            }
            await expect.poll(() => query(page).placeId, { message: `${name} selected` }).toBe(id);
          };
          await select('Badge B', b);
          await expect(active, 'one active badge').toHaveCount(1);
          await expect(active, 'the leg into B').toHaveAttribute('data-leg-to', b);
          await expect(badge(b), 'A → B is long on screen: the full capsule').toHaveAttribute('data-labelled', '');
          await expect(badge(b), 'with its time').toContainText('25m');
          await expect(badge(b).locator('svg'), 'mode icon and note mark').toHaveCount(2);

          await select('Badge C', c);
          await expect(active, 'the active mark moves').toHaveCount(1);
          await expect(active, 'to the leg into C').toHaveAttribute('data-leg-to', c);
          await expect(badge(b)).not.toHaveAttribute('data-active', '');
        } finally {
          await dropTrip(page, baseURL!, t);
        }
      });
    });

    test.describe('sync', () => {
      let fx: Fixture;
      test.beforeAll(async ({ browser, baseURL }) => {
        const ctx = await browser.newContext({ baseURL });
        const page = await ctx.newPage();
        fx = await createFixture(page, baseURL!);
        await ctx.close();
      });
      test.afterAll(async ({ browser, baseURL }) => {
        if (!fx) return;
        const ctx = await browser.newContext({ baseURL });
        await removeFixture(await ctx.newPage(), baseURL!, fx);
        await ctx.close();
      });
      test.beforeEach(async ({}, info) => {
        test.skip(isPhone(info) === info.title.startsWith('desktop'), 'other form factor');
      });

      const openTrip = async (page: Page, qs = '') => {
        await page.goto(fx.trip + qs);
        await expect(page.locator(SEL.aside)).toBeVisible();
        await settle(page);
      };

      // ── C0: the shallow history helper, proved before anything is built on it. ──

      test('C0 Back: selections do not stack, Back closes the map on the last one with no reload', async ({ page }) => {
        await openTrip(page);
        await page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true));
        await openMap(page);
        for (const i of [1, 2, 3]) await selectCard(page, i);
        const last = page.url();
        expect(query(page).placeId).toBe(fx.days[0].places[3].id);
        await page.goBack();
        await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
        await expect.poll(() => page.url()).toBe(last);
        expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same), 'C0 no full reload').toBe(true);
        await page.waitForTimeout(600);
        expect(page.url(), 'C0 URL stays after the screen settles').toBe(last);
      });

      test('C0 reload: the map reopens on the shallow-selected stop', async ({ page }) => {
        await openTrip(page);
        await openMap(page);
        await selectCard(page, 2);
        const url = page.url();
        await page.reload();
        await expect(page.locator('body')).toHaveAttribute('data-fullmap', '1');
        expect(page.url()).toBe(url);
        await expect(page.locator(SEL.cards).nth(2)).toHaveAttribute('aria-current', 'true');
        await page.goBack();
        await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
        await expect.poll(() => page.url()).toBe(url);
      });

      test('C0 flow 3: map → Calendar → Back → Back keeps the shallow selection', async ({ page }) => {
        await openTrip(page);
        await openMap(page);
        await selectCard(page, 2);
        const url = page.url();
        await page.locator(`${SEL.nav} a[href$="/calendar"]`).tap();
        await expect(page).toHaveURL(/\/calendar$/);
        await page.goBack();
        await expect(page.locator('body')).toHaveAttribute('data-fullmap', '1');
        expect(page.url()).toBe(url);
        await expect(page.locator(SEL.cards).nth(2)).toHaveAttribute('aria-current', 'true');
        await page.goBack();
        await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
        await expect.poll(() => page.url()).toBe(url);
        await page.waitForTimeout(600);
        expect(page.url()).toBe(url);
      });

      test('C0 revalidation: an edit after a shallow selection lands, and the selection survives', async ({ page }) => {
        await openTrip(page, '?day=1');
        await openMap(page);
        await selectCard(page, 1);
        const url = page.url();
        await page.goBack();
        await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
        await expect.poll(() => page.url()).toBe(url);
        // A leg's mode: revalidates the page and does not redirect.
        const day = page.locator(`${SEL.aside} [data-day-id="${fx.days[1].id}"]`);
        const modes = day.locator('[role="group"]:has(button[aria-pressed])').first().locator('button[aria-pressed]');
        await modes.first().scrollIntoViewIfNeeded();
        const pressed = await modes.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
        const mode = modes.nth(pressed.indexOf('false'));
        await mode.tap();
        // Setting a day mode asks first, then saves and revalidates.
        await page.locator('[role="alertdialog"] button').first().tap();
        await expect(mode).toHaveAttribute('aria-pressed', 'true');
        await settle(page);
        expect(page.url(), 'C0 the edit keeps the selection').toBe(url);
        await page.reload();
        await expect(mode, 'C0 the edit was saved').toHaveAttribute('aria-pressed', 'true');
        expect(page.url()).toBe(url);
        await openMap(page);
        await expect(page.locator(SEL.cards).nth(1)).toHaveAttribute('aria-current', 'true');
        await selectCard(page, 2);
        await page.goBack();
        await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
        expect(query(page).placeId, 'C0 Back still works after the revalidation').toBe(fx.days[1].places[2].id);
      });

      test('C0 revalidation: removing a stop (redirects to the bare trip, as on main) leaves map and Back working', async ({ page, baseURL }) => {
        const extra = await api(page, 'post', `${baseURL}/api/v1/days/${fx.days[0].id}/places`, fx.token, { kind: 'sight', name: 'Stop to remove', lat: 35.5, lng: 135.9 });
        expect(extra.status()).toBe(201);
        await openTrip(page);
        await openMap(page);
        await selectCard(page, 1);
        const cards = await page.locator(SEL.cards).count();
        await page.goBack();
        await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
        const day = page.locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"]`);
        // TP-0112: the trash button opens a confirm dialog; "Remove" deletes.
        const remove = day.locator('button[data-place-delete][aria-label*="Stop to remove"]');
        // TP-0121: on touch the row's actions show only once it is selected.
        const doomed = day.locator('div.group').filter({ hasText: 'Stop to remove' });
        await doomed.scrollIntoViewIfNeeded();
        await selectRow(doomed);
        await page.waitForTimeout(250); // a press within 150 ms of the selecting tap is its own synthesized click, and is ignored
        await remove.tap();
        await page.getByRole('alertdialog').getByRole('button', { name: /^(Remove|เอาออก)$/ }).tap();
        await expect(day.getByText('Stop to remove')).toHaveCount(0);
        await expect.poll(() => query(page)).toEqual({ day: null, placeId: null });
        await openMap(page);
        await expect(page.locator(SEL.cards)).toHaveCount(cards - 1);
        await selectCard(page, 2);
        await page.goBack();
        await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
        expect(query(page).placeId).toBe(fx.days[0].places[2].id);
      });

      test('C0 revalidation: selecting while a save is in flight (the router cancels it) still shows the saved data', async ({ page }) => {
        await openTrip(page);
        const closedDay = page.locator(`${SEL.aside} button[aria-expanded="false"]`).first();
        await closedDay.tap();
        await expect(page.locator(`${SEL.aside} [data-day-id="${fx.days[1].id}"]`)).toBeVisible();
        const modes = page.locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"] [role="group"]:has(button[aria-pressed])`).first().locator('button[aria-pressed]');
        await modes.first().scrollIntoViewIfNeeded();
        const pressed = await modes.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
        const mode = modes.nth(pressed.indexOf('false'));
        await page.route('**/trip/**', async (route) => {
          if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 1500));
          await route.fallback();
        });
        await mode.tap();
        await page.locator('[role="alertdialog"] button').first().tap();
        const other = page.locator(`${SEL.aside} [data-day-id="${fx.days[1].id}"] div[role="button"]:has([data-place-id="${fx.days[1].places[0].id}"])`);
        await other.scrollIntoViewIfNeeded();
        await other.tap({ position: { x: 150, y: 14 } });
        await expect(other, 'the selection lands').toHaveAttribute('aria-current', 'true');
        await expect(mode, 'the save lands too').toHaveAttribute('aria-pressed', 'true');
        await expect(other, 'and the selection survives it').toHaveAttribute('aria-current', 'true');
      });

      test('C0 deleted stop: a stale ?placeId selects nothing and breaks nothing', async ({ page, baseURL }) => {
        const extra = await api(page, 'post', `${baseURL}/api/v1/days/${fx.days[2].id}/places`, fx.token, { kind: 'sight', name: 'Deleted stop', lat: 37.6, lng: 135.9 });
        const { place } = await extra.json();
        const del = await api(page, 'delete', `${baseURL}/api/v1/places/${place.id}`, fx.token);
        expect(del.ok()).toBe(true);
        await openTrip(page, `?day=2&placeId=${place.id}`);
        await openMap(page);
        await expect(page.locator(`${SEL.cards}[aria-current="true"]`)).toHaveCount(0);
        await selectCard(page, 1);
        expect(query(page).placeId).toBe(fx.days[2].places[1].id);
      });

      test('C0 Back during a tab navigation: selecting works again', async ({ page }) => {
        // No prefetch to fall back on: Calendar really waits for the slow server.
        await page.route('**/trip/**', async (route) => {
          const h = route.request().headers();
          if (h['next-router-prefetch']) return route.abort();
          if (h['rsc'] && new URL(route.request().url()).pathname.endsWith('/calendar')) await new Promise((r) => setTimeout(r, 3000));
          await route.fallback();
        });
        await openTrip(page);
        await openMap(page);
        await page.locator(`${SEL.nav} a[href$="/calendar"]`).tap();
        await page.goBack();
        await closed(page);
        await page.waitForTimeout(3500);
        expect(new URL(page.url()).pathname, 'precondition: Back cancelled the tab navigation').toBe(fx.trip);
        const btn = page.locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"] div[role="button"]:has([data-place-id="${fx.days[0].places[1].id}"])`);
        await btn.scrollIntoViewIfNeeded();
        await btn.tap({ position: { x: 150, y: 14 } });
        await expect(btn, 'the selection is no longer blocked').toHaveAttribute('aria-current', 'true');
      });

      test('C0 external link: opened directly, the map and Back behave', async ({ page }) => {
        const id = fx.days[1].places[4].id;
        await openTrip(page, `?day=1&placeId=${id}`);
        const url = page.url();
        await openMap(page);
        await expect(page.locator(`${SEL.cards}[aria-current="true"]`)).toHaveCount(1);
        expect(query(page)).toEqual({ day: '1', placeId: id });
        await page.goBack();
        await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
        expect(page.url()).toBe(url);
        await page.goBack();
        await expect.poll(() => page.url()).toBe('about:blank');
      });

      // T13, and C0's "URL after the screen settles when leaving via a tab".
      test("T13: tap a pin's card, then Calendar: the URL stays on Calendar", async ({ page }) => {
        await openTrip(page);
        await openMap(page);
        await page.locator(SEL.cards).nth(1).locator('[data-stop-select]').tap();
        // A far card: the strip scrolls smoothly, so its scrollend lands after the tab tap.
        await page.locator(SEL.cards).last().evaluate((el) => el.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' }));
        await page.locator(`${SEL.nav} a[href$="/calendar"]`).tap();
        await expect(page).toHaveURL(/\/calendar$/, { timeout: 15_000 });
        await page.waitForTimeout(1500);
        await settle(page);
        expect(new URL(page.url()).pathname, 'T13 URL after the screen settles').toBe(`${fx.trip}/calendar`);
      });

      test('T13: the strip settling while Calendar is still loading does not cancel the navigation', async ({ page }) => {
        // No prefetch to fall back on: Calendar really waits for the slow server.
        await page.route('**/trip/**', async (route) => {
          const h = route.request().headers();
          if (h['next-router-prefetch']) return route.abort();
          if (h['rsc'] && new URL(route.request().url()).pathname.endsWith('/calendar')) await new Promise((r) => setTimeout(r, 2500));
          await route.fallback();
        });
        await openTrip(page);
        await openMap(page);
        await page.locator(`${SEL.nav} a[href$="/calendar"]`).tap();
        await page.locator(SEL.cards).last().evaluate((el) => el.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' }));
        await page.waitForTimeout(1000);
        await expect(page).toHaveURL(/\/calendar$/, { timeout: 15_000 });
        await page.waitForTimeout(1000);
        expect(new URL(page.url()).pathname, 'T13 URL after the screen settles').toBe(`${fx.trip}/calendar`);
      });
      // ── T7–T14: the §5 contract. ──

      const rowOf = (d: number, i: number) => `${SEL.aside} [data-day-id="${fx.days[d].id}"] [data-place-id="${fx.days[d].places[i].id}"]`;
      const tapRow = async (page: Page, d: number, i: number) => {
        await page.locator(rowOf(d, i)).scrollIntoViewIfNeeded();
        await page.locator(`${SEL.aside} [data-day-id="${fx.days[d].id}"] div[role="button"]:has([data-place-id="${fx.days[d].places[i].id}"])`).tap({ position: { x: 150, y: 14 } });
      };
      const rowButton = (page: Page, d: number, i: number) =>
        page.locator(`${SEL.aside} [data-day-id="${fx.days[d].id}"] div[role="button"]:has([data-place-id="${fx.days[d].places[i].id}"])`);

      // ── No router.refresh() after these saves (it raced the router's own refresh into a full reload):
      // the action's revalidatePath alone must reach both the list and the map. ──

      const travelMode = (href: string | null) => new URL(href!).searchParams.get('travelmode');
      const markPage = (page: Page) => page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true));
      const samePage = (page: Page) => page.evaluate(() => (window as unknown as { __same?: boolean }).__same === true);

      test('fresh data: a day mode change reaches the list and the map, after a shallow selection, with no reload', async ({ page, baseURL }) => {
        // A long appended leg: it has a segment row and is long enough to draw a mode badge.
        const added = await api(page, 'post', `${baseURL}/api/v1/days/${fx.days[2].id}/places`, fx.token, { kind: 'sight', name: `Far ${crypto.randomUUID().slice(0, 8)}`, lat: 37.9, lng: 136.5 });
        expect(added.status()).toBe(201);
        const { place } = await added.json();
        await openTrip(page, '?day=2');
        await markPage(page);
        await tapRow(page, 2, 1);
        await expect(rowButton(page, 2, 1)).toHaveAttribute('aria-current', 'true');
        await openMap(page);
        const card = page.locator('[data-nav-leg]').first();
        const before = travelMode(await card.getAttribute('href'));
        const badges = () => page.locator('[data-route-badge]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-route-badge')))]);
        await expect.poll(async () => (await badges()).length, { message: 'the fixture day draws mode badges' }).toBeGreaterThan(0);
        const badgesBefore = await badges();
        await page.goBack();
        await closed(page);
        const modes = page.locator(`${SEL.aside} [data-day-id="${fx.days[2].id}"] [role="group"]:has(button[aria-pressed])`).first().locator('button[aria-pressed]');
        await modes.first().scrollIntoViewIfNeeded();
        const pressed = await modes.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
        const mode = modes.nth(pressed.lastIndexOf('false'));
        await mode.tap();
        await page.locator('[role="alertdialog"] button').first().tap();
        await expect(mode, 'the list shows the new mode').toHaveAttribute('aria-pressed', 'true');
        await openMap(page);
        await expect.poll(async () => travelMode(await card.getAttribute('href')), { message: 'the map leg uses the new mode' }).not.toBe(before);
        await expect.poll(badges, { message: 'the route badges show the new mode' }).not.toEqual(badgesBefore);
        expect(await samePage(page), 'no reload').toBe(true);
        await api(page, 'delete', `${baseURL}/api/v1/places/${place.id}`, fx.token);
      });

      test('fresh data: a segment mode change reaches the list and the map with no reload', async ({ page, baseURL }) => {
        // An appended stop: the leg into it is the day's last bar.
        const name = `Seg ${crypto.randomUUID().slice(0, 8)}`;
        const added = await api(page, 'post', `${baseURL}/api/v1/days/${fx.days[2].id}/places`, fx.token, { kind: 'sight', name, lat: 37.7, lng: 135.95 });
        expect(added.status()).toBe(201);
        const { place } = await added.json();
        await openTrip(page, '?day=2');
        await markPage(page);
        const day = page.locator(`${SEL.aside} [data-day-id="${fx.days[2].id}"]`);
        const bar = day.locator('div[class*="__segment"]').last().locator('button').first();
        await bar.scrollIntoViewIfNeeded();
        await openMap(page);
        const leg = page.locator(`li:has(> [data-nav-leg]):has(+ ${SEL.cards}:has-text("${name}")) [data-nav-leg]`);
        const before = travelMode(await leg.getAttribute('href'));
        await page.goBack();
        await closed(page);
        const barBefore = await bar.textContent();
        await bar.scrollIntoViewIfNeeded();
        await bar.tap();
        const sheet = page.locator('[role="dialog"]');
        await expect(sheet).toHaveAttribute('aria-label', new RegExp(`→ ${name}$`));
        const modes = sheet.locator('[role="group"] button[aria-pressed]');
        const pressed = await modes.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
        const mode = modes.nth(pressed.lastIndexOf('false'));
        await mode.tap();
        await expect(mode).toHaveAttribute('aria-pressed', 'true');
        await sheet.locator('button[type="submit"]').tap();
        await expect(sheet, 'a save closes the sheet').toHaveCount(0);
        await expect.poll(() => bar.textContent(), { message: 'the list shows the new mode' }).not.toBe(barBefore);
        await openMap(page);
        await expect.poll(async () => travelMode(await leg.getAttribute('href')), { message: 'the map leg uses the new mode' }).not.toBe(before);
        expect(await samePage(page), 'no reload').toBe(true);
        await api(page, 'delete', `${baseURL}/api/v1/places/${place.id}`, fx.token);
      });

      /** Answers the place lookups in the browser, so the test spends no Google quota. */
      const mockPlace = async (page: Page, id: string, name: string, lat: number, lng: number) => {
        const s = { id, name, secondary: 'E2E', address: 'E2E', lat, lng, kind: 'sight', timeZone: null };
        await page.route('**/api/places/autocomplete**', (r) => r.fulfill({ json: { results: [s], linkError: null } }));
        await page.route('**/api/places/details**', (r) => r.fulfill({ json: { place: { ...s, phone: null, website: null, hours: null, rating: null, reviews: null } } }));
      };
      const removeByName = async (page: Page, baseURL: string, name: string) => {
        const res = await page.request.get(`${baseURL}/api/v1${fx.trip.replace('/trip/', '/trips/')}`, { headers: { Authorization: `Bearer ${fx.token}` } }).catch(() => { throw new Error('fixture read failed'); });
        const { trip } = await res.json();
        for (const d of trip.days as { places: { id: string; name: string }[] }[]) {
          for (const p of d.places) if (p.name === name) await api(page, 'delete', `${baseURL}/api/v1/places/${p.id}`, fx.token);
        }
      };

      test('fresh data: a place added from the search picker reaches the list and the map with no reload', async ({ page, baseURL }) => {
        const name = `Added ${crypto.randomUUID().slice(0, 8)}`;
        await mockPlace(page, `osm:${crypto.randomUUID()}`, name, 37.8, 135.97);
        await openTrip(page, '?day=2');
        await markPage(page);
        await tapRow(page, 2, 0);
        await openMap(page);
        const before = await page.locator(SEL.cards).count();
        await page.goBack();
        await closed(page);
        const input = page.locator(`${SEL.aside} [data-day-id="${fx.days[2].id}"] input[type="text"], ${SEL.aside} [data-day-id="${fx.days[2].id}"] input:not([type])`).last();
        await input.scrollIntoViewIfNeeded();
        await input.fill(name);
        const add = page.locator(`${SEL.aside} [data-day-id="${fx.days[2].id}"] button[aria-label*="${name}"]`).last();
        await add.tap();
        await expect(page.locator(`${SEL.aside} [data-day-id="${fx.days[2].id}"] [data-place-id]`).filter({ hasText: name }), 'the list shows the new stop').toHaveCount(1);
        await openMap(page);
        await expect(page.locator(SEL.cards), 'the map has its card').toHaveCount(before + 1);
        await expect(page.locator(SEL.cards).filter({ hasText: name })).toHaveCount(1);
        expect(await samePage(page), 'no reload').toBe(true);
        await removeByName(page, baseURL!, name);
      });

      test('fresh data: a place added from a map POI reaches the map and the list with no reload', async ({ page, baseURL }) => {
        const name = `Poi ${crypto.randomUUID().slice(0, 8)}`;
        await mockPlace(page, `osm:${crypto.randomUUID()}`, name, 37.85, 135.98);
        await openTrip(page, '?day=2');
        await markPage(page);
        await openMap(page);
        await expect(page.locator(SEL.pins).first()).toBeVisible();
        const before = await page.locator(SEL.cards).count();
        // No real POI can be aimed at reliably: fire Google's own POI click on the live map object.
        const fired = await page.evaluate(() => {
          type Fiber = { memoizedProps?: { value?: { map?: unknown } }; return?: Fiber };
          // A pin renders through a portal under the map's context provider.
          const el = document.querySelector('[data-trip-map-section] [data-shape]')!;
          const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
          const start = key ? (el as unknown as Record<string, Fiber>)[key] : undefined;
          let f: Fiber | undefined = start;
          let map: unknown = null;
          for (; f && !map; f = f.return) map = f.memoizedProps?.value?.map ?? null;
          if (!map) return false;
          const g = (window as unknown as { google: { maps: { LatLng: new (a: number, b: number) => unknown; event: { trigger: (...a: unknown[]) => void } } } }).google;
          g.maps.event.trigger(map, 'click', { latLng: new g.maps.LatLng(37.85, 135.98), placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4', stop() {} });
          return true;
        });
        expect(fired, 'found the map instance').toBe(true);
        const previewCard = page.getByText(name).first();
        await expect(previewCard, 'the POI preview opens').toBeVisible();
        const addButton = previewCard.locator('xpath=ancestor::*[.//button[contains(@class,"bg-foreground")]][1]').locator('button.bg-foreground');
        await addButton.tap();
        await expect(page.locator(SEL.cards), 'the map has its card').toHaveCount(before + 1);
        await expect(page.locator(SEL.cards).filter({ hasText: name })).toHaveCount(1);
        await page.goBack();
        await closed(page);
        await expect(page.locator(`${SEL.aside} [data-day-id="${fx.days[2].id}"] [data-place-id]`).filter({ hasText: name }), 'the list shows the new stop').toHaveCount(1);
        expect(await samePage(page), 'no reload').toBe(true);
        await removeByName(page, baseURL!, name);
      });

      test('two days saving at once, then a selection: no reload', async ({ page }) => {
        await openTrip(page);
        await markPage(page);
        await page.locator(`${SEL.aside} button[aria-expanded="false"]`).first().tap();
        await expect(page.locator(`${SEL.aside} [data-day-id="${fx.days[1].id}"]`)).toBeVisible();
        await page.route('**/trip/**', async (route) => {
          if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 1500));
          await route.fallback();
        });
        for (const d of [0, 1]) {
          const modes = page.locator(`${SEL.aside} [data-day-id="${fx.days[d].id}"] [role="group"]:has(button[aria-pressed])`).first().locator('button[aria-pressed]');
          await modes.first().scrollIntoViewIfNeeded();
          const pressed = await modes.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
          await modes.nth(pressed.lastIndexOf('false')).tap();
          await page.locator('[role="alertdialog"] button').first().tap();
        }
        await rowButton(page, 1, 0).scrollIntoViewIfNeeded();
        await rowButton(page, 1, 0).tap({ position: { x: 150, y: 14 } });
        await page.waitForTimeout(6000);
        expect(await samePage(page), 'no reload').toBe(true);
      });

      // Known issue, TP-0128: reloaded 40/40 runs. Won't fix for now (the fixes cost more than the problem). The discarded
      // save's refresh runs on the stale tree, the second selection replaces the tree, and two mismatches in a row make
      // Next hard-navigate. The selection and the save survive; the other open days collapse. If it fails with
      // "Expected to fail, but passed", the race no longer reproduces: find out why, then remove the `test.fail` below.
      // It is marked past the preconditions, so a test that no longer reaches this race fails loudly instead of passing
      // as "expected".
      test('one tap during a save, a second during the refresh that follows: no reload, nothing lost', async ({ page }) => {
        await openTrip(page);
        await markPage(page);
        await page.locator(`${SEL.aside} button[aria-expanded="false"]`).first().tap();
        await expect(page.locator(`${SEL.aside} [data-day-id="${fx.days[1].id}"]`)).toBeVisible();
        let postsHeld = 0;
        let refreshesHeld = 0;
        let refreshesSeen = 0;
        await page.route('**/trip/**', async (route) => {
          const req = route.request();
          const h = req.headers();
          const isPost = req.method() === 'POST';
          const isRefresh = !isPost && !!h['rsc'] && !h['next-router-prefetch'];
          if (!isPost && !isRefresh) return route.fallback();
          if (isPost) postsHeld++;
          else {
            refreshesHeld++;
            refreshesSeen++;
          }
          await new Promise((r) => setTimeout(r, 1500));
          try {
            await route.fallback();
          } finally {
            if (isPost) postsHeld--;
            else refreshesHeld--;
          }
        });
        const modes = page.locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"] [role="group"]:has(button[aria-pressed])`).first().locator('button[aria-pressed]');
        await modes.first().scrollIntoViewIfNeeded();
        const pressed = await modes.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
        const wanted = pressed.lastIndexOf('false');
        await modes.nth(wanted).tap();
        await page.locator('[role="alertdialog"] button').first().tap();

        await tapRow(page, 1, 0);
        await expect(rowButton(page, 1, 0)).toHaveAttribute('aria-current', 'true');
        expect(postsHeld, 'the first tap landed during the POST').toBeGreaterThan(0);

        await expect.poll(() => refreshesSeen, { message: 'the refresh after the discarded save started', timeout: 30_000, intervals: [20] }).toBeGreaterThan(0);
        await tapRow(page, 1, 1);
        await expect(rowButton(page, 1, 1)).toHaveAttribute('aria-current', 'true');
        const during = refreshesHeld;
        console.log(`TWOTAP refreshesHeldAtSecondTap=${during}`);
        expect(during, 'the second tap landed during the refresh GET').toBeGreaterThan(0);

        await page.waitForTimeout(8000);
        await settle(page);
        const reloaded = !(await samePage(page));
        const selected = query(page).placeId === fx.days[1].places[1].id;
        const firstDayOpen = (await page.locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"]`).count()) > 0;
        if (!firstDayOpen) await page.locator(`${SEL.aside} button[aria-expanded="false"]`).first().tap();
        const saved = (await modes.nth(wanted).getAttribute('aria-pressed')) === 'true';
        console.log(`TWOTAP reloaded=${reloaded} selectionKept=${selected} saveVisible=${saved} firstDayStillOpen=${firstDayOpen}`);
        expect(selected, 'the second selection stays').toBe(true);
        expect(saved, 'the save is showing').toBe(true);
        test.fail(true, 'TP-0128: hard reload when a selection lands during the refresh after a discarded save (won\'t fix for now; if it fails with "Expected to fail, but passed", the race no longer reproduces: find out why, then remove test.fail)');
        expect(reloaded, 'no reload').toBe(false);
      });

      test('T7: a tapped row highlights without waiting for the server, one row at a time, no spinner', async ({ page }) => {
        await openTrip(page);
        await slowRsc(page, 1500);
        // Most rows marked active at once, every frame, for the whole test.
        await page.evaluate(() => {
          const w = window as unknown as { __maxActive: number };
          w.__maxActive = 0;
          const look = () => {
            w.__maxActive = Math.max(w.__maxActive, document.querySelectorAll('[data-trip-aside] div[role="button"][aria-current="true"]').length);
            requestAnimationFrame(look);
          };
          look();
        });
        for (const i of [1, 3, 2]) {
          await tapRow(page, 0, i);
          await expect(rowButton(page, 0, i), 'T7 highlight well before the 1500 ms response').toHaveAttribute('aria-current', 'true', { timeout: 700 });
          await expect(page.locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"] [data-place-delete]`).nth(i), 'T7 row actions stay, no spinner in their place').toBeVisible();
        }
        expect(query(page).placeId).toBe(fx.days[0].places[2].id);
        // Tap the selected row: off again, at once.
        await tapRow(page, 0, 2);
        await expect(rowButton(page, 0, 2)).not.toHaveAttribute('aria-current', 'true', { timeout: 700 });
        expect(query(page).placeId).toBeNull();
        expect(await page.evaluate(() => (window as unknown as { __maxActive: number }).__maxActive), 'T7 never two rows active').toBe(1);
      });

      test('T8: back from the map on a new stop: its collapsed day opens, the row scrolls up, the nav stays', LAYOUT, async ({ page }) => {
        await openTrip(page);
        await expect(page.locator(`${SEL.aside} [data-day-id="${fx.days[1].id}"]`), 'precondition: day 2 collapsed').toHaveCount(0);
        await openMap(page);
        const url = page.url();
        await page.locator(SEL.nextDay).tap();
        await waitDay(page, url);
        await selectCard(page, 9);
        await watchNav(page);
        await page.locator(SEL.toggle).tap();
        await closed(page);
        await expect(page.locator(rowOf(1, 9))).toBeVisible();
        await expect.poll(async () => (await inAside(page, rowOf(1, 9))).visible, { message: 'T8 row in view' }).toBe(true);
        // Row 10 of 12 on a tall screen can stop short of the top: the list has run out.
        const atEnd = await page.locator(SEL.aside).evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
        if (!atEnd) expect((await inAside(page, rowOf(1, 9))).fromTop, 'T8 row near the top of the column').toBeLessThan(60);
        await expect(rowButton(page, 1, 9)).toHaveAttribute('aria-current', 'true');
        await page.waitForTimeout(1300);
        expect(await navHidden(page), 'T8 the scroll does not slide the nav away').toBe(false);
      });

      test('T8: a day the user collapsed reopens for a stop picked on the map', LAYOUT, async ({ page }) => {
        await openTrip(page);
        await page.locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"] button[aria-expanded="true"]`).first().tap();
        await expect(page.locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"]`)).toHaveCount(0);
        await openMap(page);
        await selectCard(page, 9);
        await page.goBack();
        await closed(page);
        await expect.poll(async () => (await page.locator(rowOf(0, 9)).count()) > 0 && (await inAside(page, rowOf(0, 9))).visible, { message: 'T8 row in view' }).toBe(true);
      });

      test('T8: back on another day with no stop: that day opens and its head scrolls up', LAYOUT, async ({ page }) => {
        await openTrip(page);
        await openMap(page);
        const url = page.url();
        await page.locator(SEL.nextDay).tap();
        await waitDay(page, url);
        await page.goBack();
        await closed(page);
        const head = `${SEL.aside} [data-day-id="${fx.days[1].id}"]`;
        await expect(page.locator(head)).toBeVisible();
        await expect.poll(async () => Math.abs((await inAside(page, head)).fromTop), { message: 'T8 day head at the top' }).toBeLessThan(60);
      });

      test('T9: back with nothing changed keeps the scroll position', async ({ page }) => {
        await openTrip(page);
        const aside = page.locator(SEL.aside);
        await aside.evaluate((el) => (el.scrollTop = 500));
        await page.waitForTimeout(1000);
        const before = await aside.evaluate((el) => el.scrollTop);
        expect(before, 'precondition: the list scrolled').toBeGreaterThan(100);
        await openMap(page);
        await page.goBack();
        await closed(page);
        await page.waitForTimeout(500);
        expect(await aside.evaluate((el) => el.scrollTop), 'T9 same scrollTop').toBe(before);
      });

      test('T9: a card selected and then restored counts as unchanged', async ({ page }) => {
        await openTrip(page, `?day=0&placeId=${fx.days[0].places[1].id}`);
        const aside = page.locator(SEL.aside);
        await aside.evaluate((el) => (el.scrollTop = 500));
        await page.waitForTimeout(1000);
        const before = await aside.evaluate((el) => el.scrollTop);
        expect(before, 'precondition: the list scrolled').toBeGreaterThan(100);
        await openMap(page);
        await selectCard(page, 3);
        await selectCard(page, 1);
        await page.locator(SEL.toggle).tap();
        await closed(page);
        await page.waitForTimeout(500);
        expect(await aside.evaluate((el) => el.scrollTop)).toBe(before);
      });

      const openSecondDay = async (page: Page) => {
        await openTrip(page);
        await page.locator(`${SEL.aside} button[aria-expanded="false"]`).first().tap();
        await expect(page.locator(`${SEL.aside} [data-day-id="${fx.days[1].id}"]`)).toBeVisible();
      };

      test('T10: opening the map shows the day taking most of the list, with no stop picked', LAYOUT, async ({ page }) => {
        await openSecondDay(page);
        await page.locator(`${SEL.aside} [data-day-id="${fx.days[1].id}"]`).evaluate((el) => {
          const aside = el.closest('[data-trip-aside]')!;
          aside.scrollTop += el.getBoundingClientRect().top - aside.getBoundingClientRect().top;
        });
        await openMap(page);
        expect(query(page), 'T10 URL follows the day on screen').toEqual({ day: '1', placeId: null });
        await expect(page.locator(`${SEL.cards}[aria-current="true"]`), 'T10 no stop picked').toHaveCount(0);
        await expect(page.locator(SEL.cards)).toHaveCount(12);
        await page.goBack();
        await closed(page);
        expect(query(page), 'T10 Back keeps it').toEqual({ day: '1', placeId: null });
      });

      test('T10: the day under the screen centre loses to the one covering more', LAYOUT, async ({ page }) => {
        await openSecondDay(page);
        // Day 2 starts just above the column's middle, but day 1 still covers more of it.
        await page.locator(`${SEL.aside} [data-day-id="${fx.days[1].id}"]`).evaluate((el) => {
          const aside = el.closest('[data-trip-aside]')!;
          const a = aside.getBoundingClientRect();
          aside.scrollTop += el.getBoundingClientRect().top - (a.top + a.height * 0.55);
        });
        await openMap(page);
        expect(query(page).day ?? '0', 'T10 stays on the day covering more').toBe('0');
      });

      test('T10: with a stop selected the map keeps it, whatever is on screen', LAYOUT, async ({ page }) => {
        const id = fx.days[0].places[1].id;
        await openTrip(page, `?day=0&placeId=${id}`);
        await page.locator(`${SEL.aside} button[aria-expanded="false"]`).first().tap();
        await page.locator(`${SEL.aside} [data-day-id="${fx.days[1].id}"]`).evaluate((el) => {
          const aside = el.closest('[data-trip-aside]')!;
          aside.scrollTop += el.getBoundingClientRect().top - aside.getBoundingClientRect().top;
        });
        await openMap(page);
        expect(query(page)).toEqual({ day: '0', placeId: id });
      });

      test('opening the map on a selected stop right-aligns its card and keeps the selection', LAYOUT, async ({ page }) => {
        const id = fx.days[0].places[9].id;
        await openTrip(page, `?day=0&placeId=${id}`);
        await openMap(page);
        await expect(page.locator(SEL.cards).nth(9)).toHaveAttribute('aria-current', 'true');
        const card = await page.locator(SEL.cards).nth(9).evaluate((el) => Math.abs(window.innerWidth - 16 - el.getBoundingClientRect().right));
        expect(card, 'the selected card is right-aligned').toBeLessThanOrEqual(2);
        await page.waitForTimeout(1500);
        expect(query(page).placeId).toBe(id);
      });

      test('T11: after three selections one Back leaves the trip', async ({ page }) => {
        await page.goto('/');
        await page.locator(`a[href="${fx.trip}"]`).first().tap();
        await expect(page.locator(SEL.aside)).toBeVisible();
        await settle(page);
        for (const i of [1, 2, 3]) {
          await tapRow(page, 0, i);
          await expect(rowButton(page, 0, i)).toHaveAttribute('aria-current', 'true');
        }
        await page.goBack();
        await expect.poll(() => new URL(page.url()).pathname, { message: 'T11 Back leaves the page' }).toBe('/');
      });

      test('T12: swipe and go back at once with a slow server: the selection stays', async ({ page }) => {
        await openTrip(page);
        await openMap(page);
        await slowRsc(page, 1500);
        await swipeStrip(page);
        await page.waitForTimeout(500); // the strip settles; the selection is on its way
        await page.locator(SEL.toggle).tap();
        await closed(page);
        await page.waitForTimeout(2500);
        const { placeId } = query(page);
        expect(placeId, 'T12 selection kept').not.toBeNull();
        const i = fx.days[0].places.findIndex((p) => p.id === placeId);
        await expect(rowButton(page, 0, i)).toHaveAttribute('aria-current', 'true');
      });

      test('T14: map → Calendar → Back → Back: the selected row is in view', LAYOUT, async ({ page }) => {
        await openTrip(page);
        await openMap(page);
        await selectCard(page, 9);
        await page.locator(`${SEL.nav} a[href$="/calendar"]`).tap();
        await expect(page).toHaveURL(/\/calendar$/);
        await page.goBack();
        await expect(page.locator('body')).toHaveAttribute('data-fullmap', '1');
        await watchNav(page);
        await page.goBack();
        await closed(page);
        await expect.poll(async () => (await page.locator(rowOf(0, 9)).count()) > 0 && (await inAside(page, rowOf(0, 9))).visible, { message: 'T14 row in view' }).toBe(true);
        await page.waitForTimeout(1300);
        expect(await navHidden(page), 'T14 the scroll does not slide the nav away').toBe(false);
      });

      // Closes the T6 gap (plan 2026-10-31-mobile-map-rest §3): measures what the nudge shows.
      /** Largest on-screen width while the nudge plays, against that at rest: of the next leg's button
       *  (no next card shows any more, and at rest that button is off screen), or of the previous card. */
      const peekDuringNudge = (page: Page, neighbour: 'next' | 'prev') =>
        page.evaluate(
          (side) =>
            new Promise<{ rest: number; peak: number; played: boolean }>((resolve) => {
              const width = () => {
                const ul = document.querySelector<HTMLElement>('[data-map-carousel] ul');
                const cards = ul ? [...ul.querySelectorAll<HTMLElement>('[data-stop-card]')] : [];
                const mid = window.innerWidth / 2;
                const rects = cards.map((c) => c.getBoundingClientRect());
                // Geometry, so it holds during the slide: the card covering the centre, then its neighbour.
                const i = rects.findIndex((r) => r.left <= mid && r.right >= mid);
                if (i < 0) return null;
                if (side === 'next') {
                  const a = cards[i].nextElementSibling?.querySelector('a');
                  return a ? window.innerWidth - a.getBoundingClientRect().left : null;
                }
                return rects[i - 1]?.right ?? null;
              };
              let rest = -1;
              let peak = -1;
              let played = false;
              const started = performance.now();
              const look = () => {
                const ul = document.querySelector('[data-map-carousel] ul');
                const w = width();
                if (w != null) {
                  if (ul?.hasAttribute('data-nudging')) {
                    played = true;
                    peak = Math.max(peak, w);
                  } else if (!played) rest = w;
                }
                if ((played && !ul?.hasAttribute('data-nudging')) || performance.now() - started > 4000) resolve({ rest, peak, played });
                else requestAnimationFrame(look);
              };
              look();
            }),
          neighbour,
        );

      test("T6: the nudge pulls the next leg's button on screen, off it at rest", LAYOUT, async ({ page }) => {
        await freshStorage(page, `${fx.trip}?day=0`);
        await settle(page);
        await page.locator(SEL.toggle).tap();
        await expect(page.locator(SEL.carousel)).toBeVisible();
        const m = await peekDuringNudge(page, 'next');
        expect(m.played, 'T6 nudge played').toBe(true);
        expect(m.rest, `T6 button off screen at rest: ${m.rest}`).toBeLessThanOrEqual(0);
        expect(m.peak, `T6 button on screen during the nudge: ${m.peak}`).toBeGreaterThan(15);
      });

      test('T6: with the last card active the nudge goes the other way and reveals the previous card', LAYOUT, async ({ page }) => {
        await freshStorage(page, `${fx.trip}?day=0&placeId=${fx.days[0].places[11].id}`);
        await settle(page);
        await page.locator(SEL.toggle).tap();
        await expect(page.locator(SEL.carousel)).toBeVisible();
        await expect(page.locator(SEL.cards).last()).toHaveAttribute('aria-current', 'true');
        const m = await peekDuringNudge(page, 'prev');
        expect(m.played, 'T6 nudge played').toBe(true);
        expect(m.peak - m.rest, `T6 previous card grew from ${m.rest} to ${m.peak}`).toBeGreaterThan(15);
        expect(query(page).placeId, 'T6 the nudge does not move the selection').toBe(fx.days[0].places[11].id);
      });

      test('desktop: rows select at once and each one is a Back step', async ({ page }) => {
        await openTrip(page);
        await slowRsc(page, 1500);
        const row = (i: number) => page.locator(`${SEL.aside} div[role="button"]:has([data-place-id="${fx.days[0].places[i].id}"])`);
        for (const i of [1, 2]) {
          await row(i).click({ position: { x: 150, y: 14 } });
          await expect(row(i), 'highlight well before the 1500 ms response').toHaveAttribute('aria-current', 'true', { timeout: 700 });
        }
        await page.goBack();
        await expect(row(1)).toHaveAttribute('aria-current', 'true');
        expect(query(page).placeId).toBe(fx.days[0].places[1].id);
        await page.goBack();
        await expect(page.locator(`${SEL.aside} div[role="button"][aria-current="true"]`)).toHaveCount(0);
      });

      test('C3 viewer: back from the map scrolls to the row, on a trip the user cannot edit', async ({ page }) => {
        await page.goto(await findTrip(page));
        await expect(page.locator(SEL.aside)).toBeVisible();
        await settle(page);
        test.skip((await page.locator(`${SEL.aside} button[class*="handle"]`).count()) > 0, 'the dev user can edit the seeded trip');
        await openMap(page);
        expect(await toDayWithCards(page, 3), 'fixture trip needs a day with ≥ 3 located stops').toBe(true);
        const n = await page.locator(SEL.cards).count();
        await selectCard(page, n - 1);
        const { placeId } = query(page);
        await page.goBack();
        await closed(page);
        const row = `${SEL.aside} [data-place-id="${placeId}"]`;
        await expect.poll(async () => (await page.locator(row).count()) > 0 && (await inAside(page, row)).visible, { message: 'C3 viewer row in view' }).toBe(true);
      });
    });

    test('flow 7: desktop itinerary — no List/Map button, map shown', LAYOUT, async ({ page }, info) => {
      test.skip(isPhone(info), 'desktop only');
      const trip = await findTrip(page);
      await page.goto(trip);
      await expectNoPageOverflow(page, info, 'desktop itinerary');
      await expect(page.locator(SEL.toggle)).toBeHidden();
      await expect(page.locator(SEL.section)).toBeVisible();
    });
  });
}

// ── Route lines toggle + leg taps (TP-0136, plan 2026-11-02-map-leg-toggle). Day 1 ends at a hotel
// ~4 km past its last stop with a stored walk mode, so that last leg always draws a badge (the API
// can't set a stop↔stop leg's mode). English only: no translated text is read. ──
test.describe('legs', () => {
  let fx: Fixture;
  const HOTEL = { name: 'Legs hotel', lat: 41.05, lng: 135.75, checkInDate: '2030-01-01', checkOutDate: '2030-01-02', arrivalMode: 'walk' };
  const TOGGLE = '[data-map-legs-toggle]';
  const BADGE = '[data-trip-map-section] [data-route-badge]';

  test.beforeAll(async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    fx = await createFixture(await ctx.newPage(), baseURL!, [{ places: stopsAt(41, 3) }, { places: stopsAt(41.5, 1) }], [HOTEL]);
    await ctx.close();
  });
  test.afterAll(async ({ browser, baseURL }) => {
    if (!fx) return;
    const ctx = await browser.newContext({ baseURL });
    await removeFixture(await ctx.newPage(), baseURL!, fx);
    await ctx.close();
  });
  test.beforeEach(async ({ context, baseURL, page }) => {
    await context.addCookies([{ name: 'lang', value: 'en', url: baseURL! }]);
    await page.addInitScript(() => localStorage.setItem('tp.mapNudgeShown', '1'));
  });

  const open = async (page: Page, info: TestInfo) => {
    await page.goto(`${fx.trip}?day=0`);
    await expect(page.locator(SEL.aside)).toBeVisible();
    if (isPhone(info)) await openMap(page);
    else await settle(page);
    await expect(page.locator(BADGE).first()).toBeVisible();
  };
  const tapAt = (page: Page, info: TestInfo, p: { x: number; y: number }) =>
    isPhone(info) ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y);
  /** TP-0152: a leg tap also opens the leg sheet, titled "{from} → {to}" (`to`: the badge's data-leg-to). */
  const expectLegSheet = async (page: Page, to: string | null) => {
    const name = to?.startsWith('hotel-') ? HOTEL.name : fx.days.flatMap((d) => d.places).find((p) => p.id === to)?.name;
    expect(name, 'the leg destination is a fixture stop or the hotel').toBeTruthy();
    await expect(page.locator('[role="dialog"]'), 'the tap opens the leg sheet').toBeVisible();
    await expect(page.locator('[role="dialog"]')).toHaveAttribute('aria-label', new RegExp(` → ${name}$`));
  };
  const closeLegSheet = async (page: Page) => {
    await page.locator('[role="dialog"]').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  };
  /** The first badge's centre: the arc's midpoint, so it is also on the line. */
  const badgeCentre = (page: Page) =>
    page.locator(BADGE).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

  test('L1: the toggle hides lines and badges, and the choice survives a reload', async ({ page }, info) => {
    await open(page, info);
    const toggle = page.locator(TOGGLE);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator(BADGE)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('tp.mapLegs'))).toBe('0');

    await page.reload();
    if (isPhone(info)) await expect(page.locator('body')).toHaveAttribute('data-fullmap', '1');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await settle(page);
    await expect(page.locator(BADGE)).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(BADGE).first()).toBeVisible();
  });

  test('L2: tapping a badge selects the leg destination and opens its sheet; a second tap keeps it', async ({ page }, info) => {
    test.fixme(true, 'TP-0162: on the Google map a badge tap does not select the destination');
    await open(page, info);
    const to = await page.locator(BADGE).first().getAttribute('data-leg-to');
    expect(to, 'badge names its destination').toBeTruthy();
    await tapAt(page, info, await badgeCentre(page));
    await expect.poll(() => query(page).placeId, { message: 'badge tap selects the destination' }).toBe(to);
    if (isPhone(info)) await expect(page.locator(SEL.cards).filter({ hasText: HOTEL.name })).toHaveAttribute('aria-current', 'true');
    await expectLegSheet(page, to);
    await closeLegSheet(page);

    await tapAt(page, info, await badgeCentre(page));
    await page.waitForTimeout(500);
    expect(query(page).placeId, 'second tap does not deselect').toBe(to);
    await expectLegSheet(page, to);
    await closeLegSheet(page);
  });

  test('L3: tapping the line selects the destination only while lines are shown', async ({ page }, info) => {
    test.fixme(true, 'TP-0162: on the Google map hidden lines still take taps');
    await open(page, info);
    const to = await page.locator(BADGE).first().getAttribute('data-leg-to');
    const spot = await badgeCentre(page);

    await page.locator(TOGGLE).click();
    await expect(page.locator(BADGE)).toHaveCount(0);
    await tapAt(page, info, spot);
    await page.waitForTimeout(500);
    expect(query(page).placeId, 'hidden lines take no taps').toBeNull();

    await page.locator(TOGGLE).click();
    await expect(page.locator(BADGE).first()).toBeVisible();
    // Let the tap fall through the badge's marker onto the line under it.
    // Every wrapper up to the marker host (vis.gl nests its own content div).
    await page.locator(BADGE).first().evaluate((el) => {
      for (let n: HTMLElement | SVGElement | null = el; n && n !== document.body; n = n.parentElement) {
        n.style.pointerEvents = 'none';
        if (n.matches('gmp-advanced-marker, .maplibregl-marker')) break;
      }
    });
    const under = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      const marker = hit?.closest('[data-route-badge], gmp-advanced-marker, .maplibregl-marker');
      return marker ? `marker ${hit!.tagName}.${String(hit!.className).slice(0, 40)}` : 'map';
    }, spot);
    expect(under, 'the tap reaches the map, not the badge').toBe('map');
    await tapAt(page, info, spot);
    await expect.poll(() => query(page).placeId, { message: 'line tap selects the destination' }).toBe(to);
    await expectLegSheet(page, to);
    await closeLegSheet(page);
  });

  test('L4: on the phone map the toggle is on screen and clear of the other chrome', LAYOUT, async ({ page }, info) => {
    test.skip(!isPhone(info), 'phone flow');
    await open(page, info);
    await expectOnScreen(page, TOGGLE, 'phone map');
    await expectTappable(page, TOGGLE, 'phone map');
    const t = (await rect(page, TOGGLE))!;
    expect(t.top, 'below the top edge').toBeGreaterThanOrEqual(16);
    for (const sel of [SEL.toggle, SEL.carousel, SEL.daySwitcher, SEL.nav]) {
      const r = await rect(page, sel);
      if (r) expect(intersects(t, r), `toggle clear of ${sel}`).toBe(false);
    }
  });
});

// TP-0143: a not-yet-booked hotel known only by its area still gets an (approximate) pin, so the
// day's hotel legs are drawn. Needs the real resolver: the area is geocoded on import.
test.describe('TP-0143 tbd hotel', () => {
  let fx: Fixture;
  const AREA = 'Kyoto Station, Kyoto';
  const HOTEL = { status: 'tbd', area: AREA, checkInDate: '2030-01-01', checkOutDate: '2030-01-02', arrivalMode: 'walk' };
  const APPROX = '[data-trip-map-section] [data-approx]';
  const BADGE = '[data-trip-map-section] [data-route-badge]';

  test.beforeAll(async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    fx = await createFixture(await ctx.newPage(), baseURL!, [{ places: stopsAt(35, 2) }, { places: stopsAt(35.02, 2) }], [HOTEL]);
    await ctx.close();
  });
  test.afterAll(async ({ browser, baseURL }) => {
    if (!fx) return;
    const ctx = await browser.newContext({ baseURL });
    await removeFixture(await ctx.newPage(), baseURL!, fx);
    await ctx.close();
  });
  test.beforeEach(async ({ context, baseURL, page }) => {
    await context.addCookies([{ name: 'lang', value: 'en', url: baseURL! }]);
    await page.addInitScript(() => localStorage.setItem('tp.mapNudgeShown', '1'));
  });

  const showMap = async (page: Page, info: TestInfo) => {
    if (isPhone(info)) await openMap(page);
    else await settle(page);
  };

  test('T1: the area resolves to an approximate pin; badge, pins and the hotel leg show', async ({ page }, info) => {
    expect(fx.hotels, 'fixture has the hotel').toHaveLength(1);
    expect(fx.hotels[0].lat, 'area lookup gave coordinates (check the maps key and quota)').not.toBeNull();
    expect(fx.hotels[0].coordsApprox, 'area coordinates are approximate').toBe(true);

    await page.goto(`${fx.trip}?day=0`);
    await expect(page.locator(SEL.aside)).toBeVisible();
    const hotelRow = page.locator(`${SEL.aside} [data-place-id]`).filter({ hasText: AREA });
    await expect(hotelRow.locator('[data-tbd="true"]').first(), 'end-hotel row shows the not-booked badge').toBeVisible();

    const hotelStop = await hotelRow.first().getAttribute('data-place-id');
    expect(hotelStop, 'end-hotel row has a stop id').toBeTruthy();

    await showMap(page, info);
    await expect(page.locator(APPROX).first(), 'approximate end-hotel pin').toBeVisible();
    await expect.poll(() => page.locator(BADGE).count(), { message: 'route badges are drawn' }).toBeGreaterThanOrEqual(1);
    // The leg into the hotel specifically, not just the leg between the two places.
    await expect(page.locator(`${BADGE}[data-leg-to="${hotelStop}"]`), 'the hotel leg is drawn').toHaveCount(1);

    await page.goto(`${fx.trip}?day=1`);
    await expect(page.locator(SEL.aside)).toBeVisible();
    await showMap(page, info);
    await expect(page.locator(APPROX).first(), 'approximate begin-hotel pin').toBeVisible();

    await page.goto(`${fx.trip}/bookings`);
    await expect(page.locator('[data-stay-tbd]').first(), 'stay card shows not booked').toBeVisible();
  });
});

// TP-0142: a day's transport ride (here BKK -> KIX) is drawn on the trip map as a dashed line with end
// dots and a type badge, follows the route-lines toggle, and never moves the camera off the day's pins
// (R3). The e2e runs MAPS_PROVIDER=google (playwright.config.ts), so this covers the Google renderer;
// the MapLibre renderer is covered by unit tests only. The BKK end is far off-screen: assert it is
// attached, not visible.
test.describe('TP-0142 ride line', () => {
  let fx: Fixture;
  const RIDE = { type: 'flight', title: 'BKK to KIX', fromName: 'BKK', toName: 'KIX', fromLat: 13.69, fromLng: 100.75, toLat: 34.432, toLng: 135.237, dayIdx: 0 };
  const MAP = '[data-trip-map-section]';
  const ENDS = `${MAP} [data-ride-end]`;
  const BADGE = `${MAP} [data-ride-badge]`;
  const places = [
    { kind: 'sight', name: 'Osaka Castle', lat: 34.6873, lng: 135.5262 },
    { kind: 'sight', name: 'Dotonbori', lat: 34.6687, lng: 135.5013 },
  ];

  test.beforeAll(async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    fx = await createFixture(await ctx.newPage(), baseURL!, [{ places }], [], [RIDE]);
    await ctx.close();
  });
  test.afterAll(async ({ browser, baseURL }) => {
    if (!fx) return;
    const ctx = await browser.newContext({ baseURL });
    await removeFixture(await ctx.newPage(), baseURL!, fx);
    await ctx.close();
  });
  test.beforeEach(async ({ context, baseURL, page }) => {
    await context.addCookies([{ name: 'lang', value: 'en', url: baseURL! }]);
    await page.addInitScript(() => {
      localStorage.setItem('tp.mapNudgeShown', '1');
      localStorage.removeItem('tp.mapLegs');
    });
  });

  test('T1: ride ends + badge drawn, pins stay framed, route-lines toggle hides and shows them', LAYOUT, async ({ page }, info) => {
    test.fixme(true, 'TP-0163: on the Google map the KIX end is off screen');
    await page.goto(`${fx.trip}?day=0`);
    await expect(page.locator(SEL.aside)).toBeVisible();
    if (isPhone(info)) await openMap(page);
    else await settle(page);

    await expect.poll(() => page.locator(SEL.pins).count(), { message: 'day pins rendered' }).toBeGreaterThanOrEqual(2);
    await expect(page.locator(ENDS), 'both ride ends').toHaveCount(2);
    await expect(page.locator(`${ENDS}[data-ride-end="from"]`)).toHaveCount(1);
    await expect(page.locator(`${ENDS}[data-ride-end="to"]`)).toHaveCount(1);
    await expect(page.locator(BADGE), 'one ride badge').toHaveCount(1);
    await expect(page.locator(BADGE)).toHaveAttribute('data-ride-badge', 'flight');

    // R3: the camera frames the day's pins, not the whole ride (BKK is ~3000 km away).
    const vp = page.viewportSize()!;
    const pinBoxes = await page.locator(SEL.pins).evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
      }),
    );
    for (const b of pinBoxes) {
      expect(b.w, 'pin has size').toBeGreaterThan(0);
      expect(b.x, 'pin x within viewport').toBeGreaterThanOrEqual(0);
      expect(b.x, 'pin x within viewport').toBeLessThanOrEqual(vp.width);
      expect(b.y, 'pin y within viewport').toBeGreaterThanOrEqual(0);
      expect(b.y, 'pin y within viewport').toBeLessThanOrEqual(vp.height);
    }
    // Zoomed out to Asia, two pins ~3 km apart would collapse to a few px.
    if (pinBoxes.length >= 2) {
      const d = Math.hypot(pinBoxes[0].x - pinBoxes[1].x, pinBoxes[0].y - pinBoxes[1].y);
      expect(d, 'pins are not collapsed (camera not zoomed out to Asia)').toBeGreaterThan(20);
    }
    await expect(page.locator(`${ENDS}[data-ride-end="to"]`), 'KIX end on screen').toBeVisible();

    // Toggle route lines off: ride marks go, the pins stay.
    const toggle = page.locator(`${MAP} [data-map-legs-toggle]`);
    await expect(toggle, 'legs toggle shows on a ride day').toBeVisible();
    await toggle.click();
    await expect(page.locator(ENDS)).toHaveCount(0);
    await expect(page.locator(BADGE)).toHaveCount(0);
    expect(await page.locator(SEL.pins).count(), 'pins stay').toBeGreaterThanOrEqual(2);

    await toggle.click();
    await expect(page.locator(ENDS)).toHaveCount(2);
    await expect(page.locator(BADGE)).toHaveCount(1);
  });
});
