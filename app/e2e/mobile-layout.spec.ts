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

/** The card nearest the screen's centre (the active one once the strip settles). */
async function centredCard(page: Page) {
  return page.evaluate((sel) => {
    const mid = window.innerWidth / 2;
    let best: DOMRect | null = null;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (!best || Math.abs(r.left + r.width / 2 - mid) < Math.abs(best.left + best.width / 2 - mid)) best = r;
    }
    return best && { left: best.left, right: best.right, top: best.top, bottom: best.bottom };
  }, SEL.cards);
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const intersects = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * I4: cards above, switcher + toggle on one row below, switcher flush with the
 * card's left edge and clear of the toggle by ≥ 8; 8 / 28 spacing; no overlap; day text whole. Soft, so every broken
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
  expect.soft(near(sw.left, top.left, 1), `I4 switcher left = card left @ ${where}`).toBe(true);
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
async function swipeStrip(page: Page) {
  const box = (await page.locator(`${SEL.carousel} ul`).boundingBox())!;
  const y = Math.round(box.y + box.height / 2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(box.x + box.width - 76), y }] });
  for (let x = Math.round(box.x + box.width - 76); x > box.x + 120; x -= 20) {
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

const alphaOf = (c: string) => {
  if (c === 'transparent') return 0;
  const slash = c.match(/\/\s*([\d.]+%?)\s*\)/);
  if (slash) return slash[1].endsWith('%') ? parseFloat(slash[1]) / 100 : parseFloat(slash[1]);
  const rgba = c.match(/^rgba\(([^)]+)\)/);
  if (rgba) return parseFloat(rgba[1].split(',')[3]);
  return 1;
};

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
          await expectMapStack(page, `day ${days}`, (await centredCard(page))!);
          await expectPinsClear(page, `day ${days}`);
          // Last card centred (Playwright has no swipe): the strip scrolls, the page must not.
          await page.locator(SEL.cards).last().evaluate((el) => el.scrollIntoView({ inline: 'center', block: 'nearest' }));
          await expect
            .poll(() =>
              page.locator(SEL.cards).last().evaluate((el) => {
                const r = el.getBoundingClientRect();
                return Math.abs(r.left + r.width / 2 - window.innerWidth / 2) <= 2;
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
      await page.locator(SEL.pins).first().tap();
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
      const card = (await centredCard(page))!;
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
        const card = (await centredCard(page))!;
        expect.soft(near(sw.left, card.left, 1), `T3 switcher left = card left @ ${where}`).toBe(true);
        expect.soft(intersects({ ...card, width: 0, height: 0, cx: 0 }, mapRect), `T3 toggle clear of the centred card @ ${where}`).toBe(false);
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
