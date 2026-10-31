import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Mobile layout invariants for the trip hub (TP-0119,
// docs/superpowers/plans/2026-10-30-mobile-map-overflow-fix.md §5).
//
// The bug this guards against: content that widens the document makes mobile
// Chrome grow the *layout* viewport, so `position: fixed; bottom: …` chrome
// (bottom nav, List/Map button) renders below the visible screen. Desktop
// Chromium resized to phone size cannot show it; these projects run with
// isMobile + touch.
//
// Selectors avoid translated text (runs in en and th).

const LANGS = ['en', 'th'] as const;

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

async function rect(page: Page, selector: string): Promise<Rect | null> {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return null;
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, cx: r.left + r.width / 2 };
  });
}

async function findTrip(page: Page): Promise<string> {
  await page.goto('/');
  const hrefs = await page.locator('a[href^="/trip/"]').evaluateAll((as) =>
    [...new Set(as.map((a) => a.getAttribute('href') ?? ''))].filter((h) => /^\/trip\/[0-9a-f-]{36}$/.test(h)),
  );
  expect(hrefs.length, 'the AUTH_BYPASS dev user needs a seeded trip').toBeGreaterThan(0);
  return hrefs[0];
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

/** TP-0120: pre-existing overflow, unrelated to the map. */
function knownOverflow(sub: string, lang: string, info: TestInfo): boolean {
  if (!isPhone(info)) return false;
  const width = info.project.use.viewport!.width;
  if (sub === '/budget') return width <= 390;
  if (sub === '/bookings') return width <= 360;
  if (sub === '/notes') return width <= 360 && lang === 'en';
  return false;
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
  // Nearly the screen's width: one card's pitch is, and no fling follows these raw events.
  const from = startX ?? Math.round(to === 'left' ? box.x + box.width - 24 : box.x + 24);
  const end = to === 'left' ? box.x + 24 : box.x + box.width - 24;
  const step = to === 'left' ? -20 : 20;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
  for (let x = from; to === 'left' ? x > end : x < end; x += step) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** A list row that has a leg rail (the rail of the row before it runs into this row's number). */
async function railRow(page: Page, nth: number) {
  const rails = page.locator('[data-leg-slot]');
  const n = await rails.count();
  test.skip(n === 0, 'the seeded trip needs a day with a drawn leg');
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

/** Walks the map's days (from the current one) to the first where `ok()` holds; false if none does. */
async function toDayWhere(page: Page, ok: () => Promise<boolean>) {
  for (;;) {
    if (await ok()) return true;
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
// known long days. Token and trip are created through the app and removed in afterAll. ──

const FIXTURE_TOKEN = 'tp0127-e2e';
const stopsAt = (lat: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ kind: 'sight', name: `Stop ${lat}-${i + 1}`, lat: lat + i * 0.01, lng: 135.7 + i * 0.01 }));

type Fixture = { trip: string; token: string; days: { id: string; places: { id: string; name: string }[] }[] };

/** REST call for the fixture. Playwright's failure log prints request headers: keep the token out of it. */
async function api(page: Page, method: 'post' | 'delete', url: string, token: string, data?: unknown) {
  try {
    return await page.request[method](url, {
      timeout: 60_000,
      headers: { Authorization: `Bearer ${token}`, ...(method === 'post' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },
      data,
    });
  } catch (e) {
    throw new Error(`${method} ${url} failed: ${String(e).split('\n')[0].replace(/tp_[\w-]+/g, 'tp_***')}`);
  }
}

const SYNC_DAYS = [{ places: stopsAt(35, 12) }, { places: stopsAt(36, 12) }, { places: stopsAt(37, 3) }];

async function createFixture(page: Page, baseURL: string, days: { places: unknown[] }[] = SYNC_DAYS): Promise<Fixture> {
  await page.goto('/settings?s=tokens');
  const row = page.locator('[class*="tokenCreateRow"]');
  await row.locator('input').fill(FIXTURE_TOKEN);
  await row.locator('button').click();
  const plain = page.getByText(/^tp_/).first();
  await expect(plain).toBeVisible();
  const token = (await plain.textContent())!.trim();
  const res = await api(page, 'post', `${baseURL}/api/v1/trips/import`, token, {
    trip: { title: 'TP-0127 e2e fixture', startDate: '2030-01-01', endDate: '2030-01-03' },
    days,
  });
  expect(res.status(), 'fixture import').toBe(201);
  const { trip } = await res.json();
  return { trip: `/trip/${trip.id}`, token, days: trip.days };
}

async function removeFixture(page: Page, baseURL: string, f: Fixture) {
  const res = await api(page, 'delete', `${baseURL}/api/v1${f.trip.replace('/trip/', '/trips/')}`, f.token);
  expect(res.ok(), 'fixture trip removed').toBe(true);
  await page.goto('/settings?s=tokens');
  const rows = page.locator('[class*="tokenRow"]').filter({ hasText: FIXTURE_TOKEN });
  // The list loads after mount, and this fixture's own token is always in it.
  await expect(rows.first()).toBeVisible();
  for (let n = await rows.count(); n > 0; n--) {
    await rows.first().locator('button').click();
    await expect(rows).toHaveCount(n - 1);
  }
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
  await page.locator(SEL.cards).nth(i).locator('button').first().tap();
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

    test('leg bands run between stop numbers, in a different colour per leg', async ({ page }) => {
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
      test.skip(rails.length === 0, 'the seeded trip needs a day with a drawn leg');
      for (const [i, r] of rails.entries()) {
        expect(Math.abs(r.cx - r.numCx), 'band centred on the number').toBeLessThanOrEqual(1);
        expect(Math.abs(r.top - r.numCy), 'band starts at this number').toBeLessThanOrEqual(1);
        if (r.nextCy != null) expect(Math.abs(r.bottom - r.nextCy), 'band ends at the next number').toBeLessThanOrEqual(1);
        const prev = rails[i - 1];
        if (prev && prev.list === r.list && prev.bottom === r.top) expect(r.slot).not.toBe(prev.slot);
      }
    });

    test('flow 1: list → map → every day → back to day 1', async ({ page }, info) => {
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

    test('flow 2: reload on the map reopens it with chrome on screen', async ({ page }, info) => {
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

    test('flow 3: map → Calendar → Back (map) → Back (list) → Back (home)', async ({ page }, info) => {
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

    test('flow 4: tap a pin, then the active Itinerary tab closes the map', async ({ page }, info) => {
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

    test('flow 5: scroll the list, open the map at once: nav still shown', async ({ page }, info) => {
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

    test('flow 9: map stack invariants', async ({ page }, info) => {
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
      expectStackHeight(info, card.top, 192, 'map');
      // The toggle closes the map from the same spot.
      await page.locator(SEL.toggle).tap();
      await expect(page.locator('body')).not.toHaveAttribute('data-fullmap', '1');
    });

    test('flow 8: a day with no stops keeps the stack in place', async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      await page.goto('/');
      const trips = await page.locator('a[href^="/trip/"]').evaluateAll((as) =>
        [...new Set(as.map((a) => a.getAttribute('href') ?? ''))].filter((h) => /^\/trip\/[0-9a-f-]{36}$/.test(h)),
      );
      for (const trip of trips) {
        await page.goto(trip);
        await expect(page.locator(SEL.aside)).toBeVisible();
        await openMap(page);
        for (;;) {
          if ((await page.locator(SEL.cards).count()) === 0) {
            await expect(page.locator(`${SEL.carousel} p`)).toBeVisible();
            const note = (await rect(page, `${SEL.carousel} p`))!;
            await expectMapStack(page, 'empty day', note);
            // The note is one line wider than the card at 320 (en), so it wraps once more.
            expectStackHeight(info, note.top, info.project.use.viewport!.width < 360 ? 204 : 190, 'empty day');
            await expectPhoneChrome(page, info, 'empty day', 'map');
            return;
          }
          const next = page.locator(SEL.nextDay);
          if (await next.isDisabled()) break;
          const url = page.url();
          await next.tap();
          await waitDay(page, url);
        }
      }
      test.skip(true, 'no seeded trip has a day without located stops');
    });

    for (const sub of ['', '/calendar', '/bookings', '/budget', '/notes', '/settings']) {
      test(`flow 6: page ${sub || '/ (itinerary)'} has no overflow`, async ({ page }, info) => {
        // Exactly what fails today on the fixture trip (measured): an unexpected
        // pass is reported, so these flip loudly when TP-0120 lands.
        test.fail(knownOverflow(sub, lang, info), 'TP-0120: page overflows at this width');
        const trip = await findTrip(page);
        await page.goto(trip + sub);
        await settle(page);
        await expectPhoneChrome(page, info, `page ${sub || 'itinerary'}`, sub ? 'page' : 'list');
      });
    }

    test('flow 6: home has no overflow', async ({ page }, info) => {
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

    test('T2: the selected card surface starts right of the rail (this row and the previous)', async ({ page }, info) => {
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

    test('T3: toggle geometry at the project viewport', async ({ page }, info) => {
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

    test('T4: the active card ring sits inside the strip', async ({ page }, info) => {
      test.skip(!isPhone(info), 'phone flow');
      const trip = await findTrip(page);
      await page.goto(`${trip}?day=1`);
      await expect(page.locator(SEL.aside)).toBeVisible();
      await openMap(page);
      expect(await toDayWithCards(page, 2), 'fixture trip needs a day with ≥ 2 located stops').toBe(true);
      // Select through a card (pins can be covered by neighbouring markers).
      await page.locator(SEL.cards).nth(1).locator('button').first().tap();
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
      let fx: Fixture;
      const LOCATED = stopsAt(38, 4);
      const located = (x: { lat: number; lng: number }) => `${x.lat},${x.lng}`;
      test.beforeAll(async ({ browser, baseURL }) => {
        const ctx = await browser.newContext({ baseURL });
        fx = await createFixture(await ctx.newPage(), baseURL!, [
          { places: LOCATED },
          { places: [...stopsAt(39, 1), { kind: 'sight', name: 'Nowhere', lat: null, lng: null }, ...stopsAt(39.5, 2)] },
          { places: stopsAt(40, 1) },
        ]);
        await ctx.close();
      });
      test.afterAll(async ({ browser, baseURL }) => {
        if (!fx) return;
        const ctx = await browser.newContext({ baseURL });
        await removeFixture(await ctx.newPage(), baseURL!, fx);
        await ctx.close();
      });
      test.beforeEach(async ({}, info) => {
        test.skip(!isPhone(info), 'phone flow');
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
          expect(label).toMatch(lang === 'th' ? /^เส้นทางจาก \d+ .+ ไป / : /^Directions from \d+ .+ to /);
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
          expect(await here.getAttribute('aria-label')).toMatch(lang === 'th' ? /^เส้นทางจากตำแหน่งของฉันไป / : /^Directions from my location to /);
          expect(await bg(here), 'N4 brand fill, light in both themes').toBe(await tokenRgb(page, '--brand-700'));
          expect((await here.innerText()).trim()).toBe(lang === 'th' ? 'นำทาง' : 'Go');
        }
      });

      test('N4: a mid-day card with no incoming leg gets a plain gap, not a button', async ({ page }) => {
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

      for (const w of [320, 360, 476]) {
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
                nameW: r(card.querySelector('button .truncate')!).width,
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
            expect.soft(near(m.cardH, 54, 1), `N5 card height ${where}: ${m.cardH}`).toBe(true);
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
          expect.soft(near(sw.left, 16, 0.5), `N5 switcher left 16 @ ${w}: ${sw.left}`).toBe(true);
          expect.soft(near(toggle.left - sw.right, 8, 0.5), `N5 switcher ends 8 before the toggle @ ${w}: ${toggle.left - sw.right}`).toBe(true);
          await expectNoPageOverflow(page, { project: { use: { viewport: { width: w } } } } as TestInfo, `${w}`);
        });
      }

      test('N6: a swipe that starts on a button scrolls the strip, opens nothing, and lands on a card', async ({ page, context }) => {
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
        const expectInSync = () =>
          expect
            .poll(async () => {
              const i = await snappedIdx(page);
              return i >= 0 && query(page).placeId === ids[i];
            }, { message: 'N7 placeId is the snapped card' })
            .toBe(true);
        for (let n = 0; (await snappedIdx(page)) !== ids.length - 1; n++) {
          expect(n, 'N7 reaches the last card').toBeLessThan(ids.length + 2);
          await swipeStrip(page);
          await expectInSync();
        }
        expect(query(page).placeId, 'N7 last card selected').toBe(ids.at(-1));
        for (let n = 0; (await snappedIdx(page)) !== 0; n++) {
          expect(n, 'N7 reaches the first card').toBeLessThan(ids.length + 2);
          await swipeStrip(page, undefined, 'right');
          await expectInSync();
        }
        expect(query(page).placeId, 'N7 first card selected').toBe(ids[0]);
      });

      test('N7: reopening the map on a selected stop right-aligns its card', async ({ page }) => {
        await openDay(page, 0);
        await selectCard(page, 2);
        await expectSnapped(page, 2, 'selected');
        await page.reload();
        await expect(page.locator(SEL.carousel)).toBeVisible();
        await expectSnapped(page, 2, 'after reload');
      });
    });

    test('T5: swipe guide shows before the first swipe, goes for good after it', async ({ page }, info) => {
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
      test.skip(seen.single === 0, 'no seeded day has exactly one located stop');
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

    test('T6b: the selected row keeps a visible drag handle on touch; others stay hidden', async ({ page }, info) => {
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

      // Touch, select, then focus moves away: only "selected" can keep the handle showing.
      await selectRow(rowA);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.waitForTimeout(500); // the handle's opacity transition (it fades out when focus leaves)
      await expect
        .poll(() => handleOf(rowA).evaluate((el) => parseFloat(getComputedStyle(el).opacity)), { message: 'T6b selected row shows its drag handle under touch' })
        .toBeGreaterThan(0);
      expect(await handleOf(rowB).evaluate((el) => parseFloat(getComputedStyle(el).opacity)), 'T6b other rows keep their handle hidden').toBe(0);

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
        const remove = day.locator('form button[aria-label*="Stop to remove"]');
        await remove.scrollIntoViewIfNeeded();
        await remove.tap();
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
        await page.locator(SEL.cards).nth(1).locator('button').first().tap();
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
        // Only an appended stop gets a segment row, and with it the picker.
        const name = `Seg ${crypto.randomUUID().slice(0, 8)}`;
        const added = await api(page, 'post', `${baseURL}/api/v1/days/${fx.days[2].id}/places`, fx.token, { kind: 'sight', name, lat: 37.7, lng: 135.95 });
        expect(added.status()).toBe(201);
        const { place } = await added.json();
        await openTrip(page, '?day=2');
        await markPage(page);
        const day = page.locator(`${SEL.aside} [data-day-id="${fx.days[2].id}"]`);
        // The day's own picker comes first, then the leg into the new stop.
        const modes = day.locator('[role="group"]:has(button[aria-pressed])').last().locator('button[aria-pressed]');
        await modes.first().scrollIntoViewIfNeeded();
        await openMap(page);
        const leg = page.locator(`li:has(> [data-nav-leg]):has(+ ${SEL.cards}:has-text("${name}")) [data-nav-leg]`);
        const before = travelMode(await leg.getAttribute('href'));
        await page.goBack();
        await closed(page);
        const pressed = await modes.evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
        const mode = modes.nth(pressed.lastIndexOf('false'));
        await mode.tap();
        await expect(mode, 'the list shows the new mode').toHaveAttribute('aria-pressed', 'true');
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

      // Known issue, TP-0127: reloaded 40/40 runs (owner's decision pending). The discarded save's refresh runs on the
      // stale tree, the second selection replaces the tree, and two mismatches in a row make Next hard-navigate.
      // The selection and the save survive; the other open days collapse. Marked below, past the preconditions,
      // so a test that no longer reaches this race fails loudly instead of passing as "expected".
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
        test.fail(true, 'TP-0127: hard reload when a selection lands during the refresh after a discarded save');
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
          await expect(page.locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"] form button`).nth(i), 'T7 row actions stay, no spinner in their place').toBeVisible();
        }
        expect(query(page).placeId).toBe(fx.days[0].places[2].id);
        // Tap the selected row: off again, at once.
        await tapRow(page, 0, 2);
        await expect(rowButton(page, 0, 2)).not.toHaveAttribute('aria-current', 'true', { timeout: 700 });
        expect(query(page).placeId).toBeNull();
        expect(await page.evaluate(() => (window as unknown as { __maxActive: number }).__maxActive), 'T7 never two rows active').toBe(1);
      });

      test('T8: back from the map on a new stop: its collapsed day opens, the row scrolls up, the nav stays', async ({ page }) => {
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

      test('T8: a day the user collapsed reopens for a stop picked on the map', async ({ page }) => {
        await openTrip(page);
        await page.locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"] button[aria-expanded="true"]`).first().tap();
        await expect(page.locator(`${SEL.aside} [data-day-id="${fx.days[0].id}"]`)).toHaveCount(0);
        await openMap(page);
        await selectCard(page, 9);
        await page.goBack();
        await closed(page);
        await expect.poll(async () => (await page.locator(rowOf(0, 9)).count()) > 0 && (await inAside(page, rowOf(0, 9))).visible, { message: 'T8 row in view' }).toBe(true);
      });

      test('T8: back on another day with no stop: that day opens and its head scrolls up', async ({ page }) => {
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

      test('T10: opening the map shows the day taking most of the list, with no stop picked', async ({ page }) => {
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

      test('T10: the day under the screen centre loses to the one covering more', async ({ page }) => {
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

      test('T10: with a stop selected the map keeps it, whatever is on screen', async ({ page }) => {
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

      test('opening the map on a selected stop right-aligns its card and keeps the selection', async ({ page }) => {
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

      test('T14: map → Calendar → Back → Back: the selected row is in view', async ({ page }) => {
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

      test("T6: the nudge pulls the next leg's button on screen, off it at rest", async ({ page }) => {
        await freshStorage(page, `${fx.trip}?day=0`);
        await settle(page);
        await page.locator(SEL.toggle).tap();
        await expect(page.locator(SEL.carousel)).toBeVisible();
        const m = await peekDuringNudge(page, 'next');
        expect(m.played, 'T6 nudge played').toBe(true);
        expect(m.rest, `T6 button off screen at rest: ${m.rest}`).toBeLessThanOrEqual(0);
        expect(m.peak, `T6 button on screen during the nudge: ${m.peak}`).toBeGreaterThan(15);
      });

      test('T6: with the last card active the nudge goes the other way and reveals the previous card', async ({ page }) => {
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

    test('flow 7: desktop itinerary — no List/Map button, map shown', async ({ page }, info) => {
      test.skip(isPhone(info), 'desktop only');
      const trip = await findTrip(page);
      await page.goto(trip);
      await expectNoPageOverflow(page, info, 'desktop itinerary');
      await expect(page.locator(SEL.toggle)).toBeHidden();
      await expect(page.locator(SEL.section)).toBeVisible();
    });
  });
}
