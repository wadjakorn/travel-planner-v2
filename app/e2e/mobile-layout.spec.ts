import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Mobile layout invariants for the trip hub (TP-0119,
// docs/superpowers/plans/2026-10-30-mobile-map-overflow-fix.md §5).
//
// The bug this guards against: content that widens the document makes mobile
// Chrome grow the *layout* viewport, so `position: fixed; bottom: …` chrome
// (bottom nav, List/Map pill) renders below the visible screen. Desktop
// Chromium resized to phone size cannot show it; these projects run with
// isMobile + touch.
//
// Selectors avoid translated text (runs in en and th).

const LANGS = ['en', 'th'] as const;

const SEL = {
  nav: '[data-trip-nav]',
  pill: '[data-map-toggle] [role=group]',
  pillList: '[data-map-toggle] button >> nth=0',
  pillMap: '[data-map-toggle] button >> nth=1',
  section: '[data-trip-map-section]',
  carousel: '[data-map-carousel]',
  daySwitcher: '[data-map-carousel] > div:first-child > div',
  prevDay: '[data-map-carousel] > div:first-child button >> nth=0',
  nextDay: '[data-map-carousel] > div:first-child button >> nth=1',
  cards: '[data-stop-card]',
  aside: '[data-trip-aside]',
  pins: '[data-trip-map-section] [data-shape]:not([data-preview])',
};

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number; cx: number };

const isPhone = (info: TestInfo) => info.project.name !== 'desktop';

async function rect(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, cx: r.left + r.width / 2 };
  }, selector.replace(/ >> nth=\d+$/, ''));
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
        page.evaluate((s) => {
          const el = document.querySelector(s);
          if (!el) return 'missing';
          const r = el.getBoundingClientRect();
          const vv = window.visualViewport!;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return 'hidden';
          if (r.top < -1 || r.left < -1 || r.bottom > vv.height + 1 || r.right > vv.width + 1)
            return `off-screen ${Math.round(r.left)},${Math.round(r.top)}→${Math.round(r.right)},${Math.round(r.bottom)} vv ${Math.round(vv.width)}×${Math.round(vv.height)}`;
          return 'ok';
        }, selector),
      { message: `I2 ${selector} on screen @ ${where}` },
    )
    .toBe('ok');
}

/** I5: the element's centre is on screen and nothing covers it. */
async function expectTappable(page: Page, selector: string, where: string) {
  const ok = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return 'missing';
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const vv = window.visualViewport!;
    if (x < 0 || y < 0 || x > vv.width || y > vv.height) return 'centre off-screen';
    const hit = document.elementFromPoint(x, y);
    return hit && (hit === el || el.contains(hit)) ? 'ok' : `covered by ${hit?.tagName}.${(hit?.className ?? '').toString().slice(0, 40)}`;
  }, selector.replace(/ >> nth=\d+$/, ''));
  expect(ok, `I5 ${selector} tappable @ ${where}`).toBe('ok');
}

async function expectPhoneChrome(page: Page, info: TestInfo, where: string, mode: 'list' | 'map' | 'page') {
  await expectNoPageOverflow(page, info, where);
  if (!isPhone(info)) return;
  await expectOnScreen(page, SEL.nav, where);
  const translate = await page.evaluate((s) => getComputedStyle(document.querySelector(s)!).translate, SEL.nav);
  expect(['none', '0px', '0px 0px'], `I2 nav not slid away @ ${where}`).toContain(translate);
  if (mode !== 'page') {
    await expectOnScreen(page, SEL.pill, where);
    await expectTappable(page, `${SEL.nav} a[href$="/calendar"]`, where);
  }
  if (mode === 'map') await expectNoMapEscape(page, where);
}

/** I4: switcher, centred card and pill share one axis; 8 / 12 / 24 spacing; no overlap. */
async function expectMapStack(page: Page, where: string) {
  const sw = await rect(page, SEL.daySwitcher);
  const pill = await rect(page, SEL.pill);
  const nav = await rect(page, SEL.nav);
  const card = await page.evaluate((s) => {
    const mid = window.innerWidth / 2;
    let best: DOMRect | null = null;
    for (const el of document.querySelectorAll(s)) {
      const r = el.getBoundingClientRect();
      if (!best || Math.abs(r.left + r.width / 2 - mid) < Math.abs(best.left + best.width / 2 - mid)) best = r;
    }
    return best && { top: best.top, bottom: best.bottom, cx: best.left + best.width / 2 };
  }, SEL.cards);
  expect(sw && pill && nav && card, `I4 stack present @ ${where}`).toBeTruthy();
  expect(Math.abs(sw!.cx - pill!.cx), `I4 switcher/pill axis @ ${where}`).toBeLessThanOrEqual(1);
  expect(Math.abs(card!.cx - pill!.cx), `I4 card/pill axis @ ${where}`).toBeLessThanOrEqual(1);
  expect(card!.top - sw!.bottom, `I4 switcher→card gap @ ${where}`).toBeGreaterThanOrEqual(6);
  expect(card!.top - sw!.bottom).toBeLessThanOrEqual(10);
  expect(pill!.top - card!.bottom, `I4 card→pill gap @ ${where}`).toBeGreaterThanOrEqual(10);
  expect(pill!.top - card!.bottom).toBeLessThanOrEqual(14);
  expect(nav!.top - pill!.bottom, `I4 pill→nav gap @ ${where}`).toBeGreaterThanOrEqual(22);
  expect(nav!.top - pill!.bottom).toBeLessThanOrEqual(26);
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
  await page.locator(SEL.pillMap).tap();
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
      const pillInList = await rect(page, SEL.pill);

      await openMap(page);
      await expectPhoneChrome(page, info, 'map day 1', 'map');
      const pillInMap = await rect(page, SEL.pill);
      // I3: the pill does not move between modes.
      expect(Math.abs(pillInMap!.top - pillInList!.top), 'I3 pill top').toBeLessThanOrEqual(1);
      expect(Math.abs(pillInMap!.cx - pillInList!.cx), 'I3 pill x').toBeLessThanOrEqual(1);

      let maxCards = 0;
      let days = 1;
      for (;;) {
        const cards = await page.locator(SEL.cards).count();
        maxCards = Math.max(maxCards, cards);
        if (cards > 0) {
          await expectMapStack(page, `day ${days}`);
          // Last card centred (Playwright has no swipe): the strip scrolls, the page must not.
          await page.locator(SEL.cards).last().evaluate((el) => el.scrollIntoView({ inline: 'center', block: 'nearest' }));
          await page.waitForTimeout(400);
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
      await page.locator(SEL.aside).evaluate((el) => el.scrollBy(0, 600));
      await page.waitForTimeout(100);
      await openMap(page);
      await expectPhoneChrome(page, info, 'map after list scroll', 'map');
    });

    for (const sub of ['', '/calendar', '/bookings', '/budget', '/notes', '/settings']) {
      test(`flow 6: page ${sub || '/ (itinerary)'} has no overflow`, async ({ page }, info) => {
        if (sub === '/budget' || sub === '/bookings') {
          test.fixme(isPhone(info), 'TP-0120: Budget/Bookings overflow on narrow phones (known, next PR)');
        }
        if (sub === '/notes') {
          test.fixme(info.project.name === 'small-android', 'TP-0120: Notes overflows 4px at 360 in en (known, next PR)');
        }
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
      await expect(page.locator(SEL.pill)).toBeHidden();
      await expect(page.locator(SEL.section)).toBeVisible();
    });
  });
}
