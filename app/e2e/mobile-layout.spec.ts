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
 * I4: cards above, switcher + toggle on one row below, flush with the card's
 * edges; 8 / 28 spacing; no overlap; day text whole. Soft, so every broken
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
  expect.soft(near(toggle.right, top.right, 1), `I4 toggle right = card right @ ${where}`).toBe(true);
  expect.soft(near(sw.top - top.bottom, 8, 2), `I4 card → row gap 8 @ ${where}, got ${sw.top - top.bottom}`).toBe(true);
  expect.soft(near(toggle.left - sw.right, 8, 1), `I4 switcher → toggle gap 8 @ ${where}, got ${toggle.left - sw.right}`).toBe(true);
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

for (const lang of LANGS) {
  test.describe(`lang=${lang}`, () => {
    test.beforeEach(async ({ context, baseURL }) => {
      await context.addCookies([{ name: 'lang', value: lang, url: baseURL! }]);
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
      const listLabel = await page.locator(SEL.toggle).innerText();
      await openMap(page);
      const mapRect = await rect(page, SEL.toggle);
      const mapLabel = await page.locator(SEL.toggle).innerText();
      // I3: one control, one place; only its label changes.
      for (const k of ['left', 'top', 'right', 'bottom'] as const) {
        expect.soft(near(mapRect![k], listRect![k], 1), `I3 toggle ${k} same in both modes`).toBe(true);
      }
      expect.soft(mapLabel, 'I3 toggle label changes').not.toBe(listLabel);
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

    test('flow 7: desktop itinerary — no pill, day bar shown', async ({ page }, info) => {
      test.skip(isPhone(info), 'desktop only');
      const trip = await findTrip(page);
      await page.goto(trip);
      await expectNoPageOverflow(page, info, 'desktop itinerary');
      await expect(page.locator(SEL.toggle)).toBeHidden();
      await expect(page.locator(SEL.section)).toBeVisible();
    });
  });
}
