# ปุ่มเปิด/ปิดเส้น leg บนแผนที่ + แตะ leg เพื่อเลือก spot ปลายทาง — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps ใช้ checkbox (`- [ ]`)

> **Origin:** owner, 2026-11-02: "ทำ toggle display legs (leg ระหว่าง spot บน map view ที่ custom ขึ้นมา) และ เมื่อ show ให้กด icon หรือ leg นั้นเพื่อ focus/active spot ที่ destination เป็น leg นั้น"
>
> **สถานะ:** อนุมัติแผน 2026-11-02 ("go") · implement แล้ว (TP-0136) — ผลทดสอบอยู่ใน PR
>
> **Scrutiny:** [บันทึก](2026-11-02-map-leg-toggle.scrutiny.md) — รอบ 1 แก้เข้าแผนแล้ว (ดู "ประวัติ scrutiny" ท้ายไฟล์)
>
> **Ticket:** สร้าง `pm task` (project `MgX5zmszbzrL`, assignee Claude) หลังอนุมัติ ก่อนแตะโค้ด
>
> **Worktree:** `~/development/travel-planner-v2-leg-toggle` · branch `feat/map-leg-toggle` จาก `origin/main` @ `de97149`

**Goal:** ผู้ใช้ซ่อน/แสดงเส้น leg (arc โค้งสีตาม leg + badge mode) บนแผนที่ trip ด้วยปุ่มเดียว และเมื่อแสดงอยู่ แตะเส้นหรือ badge ของ leg ใด ก็เลือก stop ปลายทางของ leg นั้น

**Architecture:** preference ต่ออุปกรณ์อยู่ใน external store (`lib/maps/legs-store.ts`, localStorage `tp.mapLegs`) อ่านด้วย `useSyncExternalStore` ทั้งสอง renderer. canvas คำนวณ `arcs` ครั้งเดียวแล้วส่งให้ route component. การแตะ leg ส่ง id ของ pin ปลายทางขึ้นไปที่ `persistent-map.tsx` → `activate()` เดิม (ไม่ toggle ปิด). ไม่แตะ DB ไม่เรียก API

**Tech Stack:** Next.js 16 · React 19 · `react-map-gl/maplibre` 8 (`interactiveLayerIds`, `cursor`) · `@vis.gl/react-google-maps` 1.8.3 (`Polyline onClick`, `AdvancedMarker onClick`) · vitest (node env) · Playwright (เฉพาะ test ใหม่)

---

## Decisions (อนุมัติแล้วผ่าน mockup)

| # | Decision |
|---|----------|
| D1 | ค่าเริ่มต้น = **แสดง** · เก็บเฉพาะตอนซ่อน `localStorage['tp.mapLegs'] = '0'` · ต่ออุปกรณ์ ไม่ผูก trip/วัน · ไม่อยู่ใน DB |
| D2 | ซ่อน = เส้นสี + casing ขาว + badge + พื้นที่แตะ หายทั้งหมด · แถบสี leg ในรายการ และปุ่ม Go ระหว่างการ์ดมือถือ **ไม่เปลี่ยน** |
| D3 | ปุ่มกลม 44×44 พื้นขาว (light-locked แบบ zoom stack) · icon เส้นทางระหว่าง 2 จุด (ตาม mockup) · เปิด = สี `--map-leg-1` · ปิด = เทา + ขีดทับ · ชื่อคงที่ "Route lines" / "เส้นทาง" + `aria-pressed` · md+ hover แสดง tooltip ชื่อเดียวกันทางซ้ายของปุ่ม |
| D4 | มุมบนขวาของ canvas (`.overlayTr`): มือถือ `16px + safe-area`, md+ `68px` ใต้ Search places · ทั้งสอง renderer · `.overlayTr` เป็นคอลัมน์ ปุ่มบน chip "Backup map" ล่าง |
| D5 | แสดงปุ่มเมื่อวันนั้นมี arc ≥ 1 เท่านั้น |
| D6 | แตะเส้น (hit 20 px โปร่งใส) หรือ badge → `activate(ปลายทาง)` ถ้ายังไม่ active · active อยู่แล้ว = ไม่ทำอะไร · history ตามการแตะ pin (md+ push, full-map replace) |
| D7 | ลำดับ: pin > badge > เส้น > POI/พื้น · เส้นซ้อน → บนสุดชนะ · **ระหว่างมี search preview ปิดการแตะ leg** (`legsInteractive = legsShown && !preview`) เส้นยังแสดง |
| D8 | badge: MapLibre = `<button tabIndex={-1} aria-label="Go to {name}">` · Google = `AdvancedMarker title` (เหมือน pin) · `name = stopName(pin, t)` · ไม่เพิ่ม Tab stop |
| D9 | md+ ชี้เส้น → cursor `pointer` เท่านั้น (เส้นไม่หนาขึ้น — mockup ระบุไว้แล้ว) |
| D10 | Google: ตอนเส้นแสดง POI ใต้เส้น (±10 px) แตะไม่ได้ — ซ่อนเส้นแล้วกลับมาแตะได้ |

## ไฟล์ที่แตะ

| ไฟล์ | การเปลี่ยน |
|------|-----------|
| `app/src/lib/maps/legs-store.ts` | **ใหม่** — store + hook |
| `app/src/lib/maps/legs-store.test.ts` | **ใหม่** |
| `app/src/lib/map-route.ts` | `RouteArc.toId/toPin`, feature property `to`, `ROUTE_HIT_WIDTH` |
| `app/src/lib/map-route.test.ts` | test เพิ่ม |
| `app/src/components/icons.tsx` | icon `RouteLines` (มีเส้นขีดทับ `data-slash`) |
| `app/src/components/map-legs-toggle.tsx` | **ใหม่** — ปุ่ม |
| `app/src/components/map-canvas.module.css` | `.overlayTr` คอลัมน์, `.legsToggle`, `.legsTip` |
| `app/src/components/map-degraded-chip.tsx` | render แค่ pill (container ย้ายไป canvas) |
| `app/src/components/map-route-badge.tsx` / `.module.css` | `toId` → `data-leg-to`, โหมด interactive |
| `app/src/components/map-route-maplibre.tsx` | รับ `arcs/show/interactive/onSelect`, hit layer, visibility |
| `app/src/components/map-route-google.tsx` | รับ `arcs/show/interactive/onSelect`, hit polyline, badge clickable |
| `app/src/components/real-map-canvas-maplibre.tsx` | store, `arcs`, `interactiveLayerIds`, `onClick`, cursor, `.overlayTr` |
| `app/src/components/real-map-canvas-google.tsx` | store, `arcs`, `.overlayTr` |
| `app/src/components/map-renderer-props.ts` | `onLegSelect` |
| `app/src/components/persistent-map.tsx` | `onLegSelect` |
| `app/src/messages/en.json` / `th.json` | 2 key |
| `app/e2e/mobile-layout.spec.ts` | describe `legs` (L1–L4) |
| `REQUIREMENTS.md`, `AGENTS-INDEX.md` | เอกสาร |

---

## Task 0 — เตรียม (ไม่มีโค้ด)

- [ ] `pm task` ใหม่: "Map: route-lines toggle + tap a leg to select its destination" · priority medium · assignee Claude · description ลิงก์แผน · ย้ายไป `doing`
- [ ] `cd ~/development/travel-planner-v2-leg-toggle/app && pnpm install --frozen-lockfile` (worktree ยังไม่มี `node_modules`)
- [ ] baseline: `pnpm test 2>&1 | tail -3` ต้องเขียวก่อนเริ่ม

## Task 1 — `lib/maps/legs-store.ts` (TDD)

- [ ] **1.1 เขียน test ก่อน** `app/src/lib/maps/legs-store.test.ts` (vitest env = node จึง stub `localStorage` / `window` เอง):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'tp.mapLegs';

function fakeStorage(blocked = false) {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => { if (blocked) throw new Error('blocked'); return m.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (blocked) throw new Error('blocked'); m.set(k, v); },
    removeItem: (k: string) => { if (blocked) throw new Error('blocked'); m.delete(k); },
  };
}

async function load(blocked = false) {
  vi.resetModules();
  vi.stubGlobal('localStorage', fakeStorage(blocked));
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  return import('./legs-store');
}

afterEach(() => vi.unstubAllGlobals());

describe('legs store', () => {
  it('shows by default', async () => {
    const s = await load();
    expect(s.getLegsShown()).toBe(true);
  });

  it('toggle hides, persists "0", notifies; toggling back removes the key', async () => {
    const s = await load();
    const cb = vi.fn();
    s.subscribeLegs(cb);
    s.toggleLegs();
    expect(s.getLegsShown()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('0');
    expect(cb).toHaveBeenCalledTimes(1);
    s.toggleLegs();
    expect(s.getLegsShown()).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('reads a stored "0" as hidden and anything else as shown', async () => {
    let s = await load();
    localStorage.setItem(KEY, '0');
    expect(s.getLegsShown()).toBe(false);
    localStorage.setItem(KEY, 'yes');
    expect(s.getLegsShown()).toBe(true);
  });

  it('blocked storage still toggles for the session', async () => {
    const s = await load(true);
    expect(s.getLegsShown()).toBe(true);
    s.toggleLegs();
    expect(s.getLegsShown()).toBe(false);
  });
});
```

- [ ] **1.2** `pnpm test legs-store 2>&1 | tail -3` → FAIL (ไม่มีโมดูล)
- [ ] **1.3 implement** `app/src/lib/maps/legs-store.ts`:

```ts
import { useSyncExternalStore } from 'react';

// Route lines on the trip map: shown unless the user turned them off on this
// device (map-legs-toggle.tsx). Only "hidden" is stored, so the default needs no
// write. Blocked storage (private mode) keeps the choice for the page session.

const KEY = 'tp.mapLegs';
const listeners = new Set<() => void>();
let memHidden: boolean | null = null;

function read(): boolean {
  if (memHidden != null) return !memHidden;
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export const getLegsShown = read;

export function subscribeLegs(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener('storage', cb); // another tab toggled
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

export function toggleLegs(): void {
  const hide = read();
  try {
    if (hide) localStorage.setItem(KEY, '0');
    else localStorage.removeItem(KEY);
    memHidden = null;
  } catch {
    memHidden = hide;
  }
  listeners.forEach((cb) => cb());
}

/** Server snapshot = shown (the canvases are client-only, so it is never used in practice). */
export function useLegsShown(): boolean {
  return useSyncExternalStore(subscribeLegs, read, () => true);
}
```

- [ ] **1.4** `pnpm test legs-store 2>&1 | tail -3` → PASS (4 tests)

> หมายเหตุ test ข้อ 3: เมื่อ storage ใช้ได้ `memHidden` เป็น `null` เสมอ จึงอ่านค่าจาก storage ตรง ๆ ทุกครั้ง (แท็บอื่นเปลี่ยนแล้ว event `storage` ทำให้ snapshot ใหม่ถูกอ่าน)

## Task 2 — `lib/map-route.ts` (TDD)

- [ ] **2.1 test เพิ่ม** ใน `app/src/lib/map-route.test.ts` (ต่อท้าย `describe('map route arcs')`):

```ts
  it('routeArcs: each arc names its destination pin', () => {
    const pins = [pin('a', 35.68, 139.76), pin('b', 35.71, 139.8), pin('c', 35.73, 139.82)];
    const legs: MapLeg[] = [
      { from: 0, to: 1, mode: 'walk', slot: 0 },
      { from: 1, to: 2, mode: null, slot: 1 },
    ];
    const arcs = routeArcs(pins, legs);
    expect(arcs.map((a) => a.toId)).toEqual(['b', 'c']);
    expect(arcs[1].toPin).toBe(pins[2]);
    expect(legsGeoJSON(arcs).features.map((f) => f.properties.to)).toEqual(['b', 'c']);
  });
```

(ใช้ helper `pin()` และ type `MapLeg` ที่ import ไว้แล้วบนไฟล์; ตรวจรูป `MapLeg` ปัจจุบันว่ามี `slot` — มีตั้งแต่ TP-0123)

- [ ] **2.2** run → FAIL (`toId` undefined)
- [ ] **2.3 implement:**
  - `export const ROUTE_HIT_WIDTH = 20;` (ใต้ `CASING_OPACITY`, comment: "Invisible tap target along each arc: a 3 px line is too thin for a finger.")
  - `RouteArc` เพิ่ม `toId: string; toPin: Pin`
  - ใน `routeArcs` push: `toId: b.id, toPin: b`
  - `RouteFeature.properties` → `{ key: string; color: string; to: string }`; `legsGeoJSON` ใส่ `to: arc.toId`
  - comment หัวไฟล์: แทน "no Routes/Directions call" ต่อท้ายด้วย "A tap on an arc or its badge selects the leg's destination (`toId`)."
- [ ] **2.4** `pnpm test map-route 2>&1 | tail -3` → PASS

## Task 3 — icon, i18n, ปุ่ม, CSS

- [ ] **3.1** `icons.tsx` เพิ่มใต้ `Route`:

```tsx
/** Route-lines toggle (map-legs-toggle.tsx): two stops joined by a winding line; `data-slash` is shown when off. */
export function RouteLines(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="5" r="2.2" />
      <path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8" />
      <path data-slash="" d="M3 3l18 18" strokeWidth={2.2} />
    </svg>
  );
}
```

- [ ] **3.2** messages (วางเรียงใต้ `map_zoom_out`):
  - `en.json`: `"map_legs_toggle": "Route lines"`, `"map_leg_go": "Go to {name}"`
  - `th.json`: `"map_legs_toggle": "เส้นทาง"`, `"map_leg_go": "ไปที่ {name}"`
- [ ] **3.3** `components/map-legs-toggle.tsx`:

```tsx
'use client';

import { RouteLines } from '@/components/icons';
import { toggleLegs, useLegsShown } from '@/lib/maps/legs-store';
import { useT } from './i18n-provider';
import styles from './map-canvas.module.css';

// Top-right of both trip canvases (inside .overlayTr): shows / hides the day's
// route lines and badges. Fixed name + aria-pressed; the choice is per device
// (lib/maps/legs-store). The canvas mounts it only on a day with a drawn leg.
export function MapLegsToggle() {
  const t = useT();
  const shown = useLegsShown();
  return (
    <button
      type="button"
      data-map-legs-toggle
      className={styles.legsToggle}
      aria-pressed={shown}
      aria-label={t('map_legs_toggle')}
      onClick={toggleLegs}
    >
      <RouteLines aria-hidden />
      <span className={styles.legsTip} aria-hidden>
        {t('map_legs_toggle')}
      </span>
    </button>
  );
}
```

- [ ] **3.4** `map-canvas.module.css`:
  - `.overlayTr` เพิ่ม `flex-direction: column; align-items: flex-end;` (ทั้งสองจุดที่ประกาศ top ไม่ต้องแตะ)
  - เพิ่มหลัง `.zoomStack button svg`:

```css
/* ---- Route lines toggle (map-legs-toggle.tsx) ---- */
.legsToggle {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.04);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  color: var(--map-leg-1);
  cursor: pointer;
}

.legsToggle svg {
  width: 20px;
  height: 20px;
}

.legsToggle svg [data-slash] {
  display: none;
}

.legsToggle[aria-pressed='false'] {
  color: #8e8e93; /* hex-ok: light-locked map chrome, same grey family as the chips */
}

.legsToggle[aria-pressed='false'] svg [data-slash] {
  display: inline;
}

.legsTip {
  position: absolute;
  right: 52px;
  top: 50%;
  transform: translateY(-50%);
  padding: 4px 8px;
  border-radius: 6px;
  background: #1d1d1f; /* hex-ok: light-locked */
  color: #fff;
  font-size: 11px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--dur-fast) var(--ease);
}

@media (hover: hover) {
  .legsToggle:hover .legsTip {
    opacity: 1;
  }
}
```

  - **ตรวจ:** `--map-leg-1` มีใน `globals.css :root` (TP-0123); ถ้า lint ของโปรเจกต์มีกฎ `hex-ok` ให้ใช้ comment รูปแบบเดียวกับไฟล์อื่น (`grep -rn "hex-ok" app/src/components/*.css | head -2` ก่อนเขียน)
- [ ] **3.5** `map-degraded-chip.tsx`: เปลี่ยน root เป็น `<div data-map-degraded className={`${styles.mapPill} ${styles.degradedPill}`}>…` (ตัด wrapper `.overlayTr` ออก; `data-map-degraded` ย้ายมาที่ pill — ไม่มี e2e/test ใดอ้าง selector นี้ ตรวจแล้ว)

## Task 4 — `RouteBadge`

- [ ] `map-route-badge.tsx`:

```tsx
type Props = { mode: Mode; color: string; toId: string; /** MapLibre + interactive: a named button. */ name?: string; interactive?: boolean };

export function RouteBadge({ mode, color, toId, name, interactive = false }: Props) {
  const Icon = MODE_ICON[mode];
  const common = {
    'data-route-badge': mode,
    'data-leg-to': toId,
    'data-interactive': interactive ? '' : undefined,
    className: styles.badge,
    style: { '--badge': color } as CSSProperties,
  };
  // MapLibre: the marker element is not focusable, so the badge is the button (out of the Tab
  // order: the destination's pin is). Google: the AdvancedMarker is the button, named by `title`.
  return interactive && name ? (
    <button type="button" tabIndex={-1} aria-label={name} {...common}>
      <Icon strokeWidth={2} />
    </button>
  ) : (
    <div aria-hidden {...common}>
      <Icon strokeWidth={2} />
    </div>
  );
}
```

  - comment หัวไฟล์: "Decorative" → "Decorative unless interactive: a tap selects the leg's destination."
- [ ] `map-route-badge.module.css`: เพิ่ม `padding: 0;` ใน `.badge` (สำหรับ `<button>`) และ

```css
.badge[data-interactive] {
  pointer-events: auto;
  cursor: pointer;
}
```

  และแก้ comment "Never takes taps." → "Takes taps only while the route is interactive."

## Task 5 — MapLibre

- [ ] **5.1** `map-route-maplibre.tsx` — signature + body:

```tsx
type Props = { arcs: RouteArc[]; show: boolean; interactive: boolean; onSelect: (toId: string) => void };

export const ROUTE_HIT_LAYER = 'tp-route-hit';

export function RouteLinesMaplibre({ arcs, show, interactive, onSelect }: Props) {
  const t = useT();
  const data = useMemo(() => legsGeoJSON(arcs), [arcs]);
  const visibility = show ? 'visible' : 'none';
  return (
    <>
      <Source id="tp-route" type="geojson" data={data}>
        {/* Invisible, wide tap target; queried via the Map's interactiveLayerIds. */}
        <Layer id={ROUTE_HIT_LAYER} type="line" layout={{ ...ROUND, visibility }}
          paint={{ 'line-color': '#000', 'line-width': ROUTE_HIT_WIDTH, 'line-opacity': 0 }} />
        <Layer id="tp-route-casing" type="line" layout={{ ...ROUND, visibility }} paint={/* เดิม */} />
        <Layer id="tp-route-line" type="line" layout={{ ...ROUND, visibility }} paint={/* เดิม */} />
      </Source>
      {show &&
        arcs.map((arc) =>
          arc.showBadge && arc.mode ? (
            <Marker
              key={`route:${arc.key}`}
              longitude={arc.mid.lng}
              latitude={arc.mid.lat}
              anchor="center"
              style={{ pointerEvents: interactive ? 'auto' : 'none', zIndex: ROUTE_BADGE_Z_INDEX }}
              onClick={(e) => {
                if (!interactive) return;
                e.originalEvent.stopPropagation(); // else the Map click would select it again
                onSelect(arc.toId);
              }}
            >
              <RouteBadge mode={arc.mode} color={arc.color} toId={arc.toId}
                interactive={interactive} name={t('map_leg_go', { name: stopName(arc.toPin, t) })} />
            </Marker>
          ) : null,
        )}
    </>
  );
}
```

  - import `RouteArc`, `ROUTE_HIT_WIDTH` จาก `@/lib/map-route`, `stopName` จาก `@/lib/map-pin`, `useT` จาก `./i18n-provider`; ลบ import `routeArcs`, `MapLeg`, `Pin` ที่ไม่ใช้
  - `'#000'` บน hit layer: ไม่ถูกวาด (opacity 0) — ถ้า lint hex บ่น ใช้ `ROUTE_CASING_COLOR`
  - comment หัว component: แทน "No interactiveLayerIds, so the lines never take clicks" ด้วยคำอธิบาย hit layer + visibility (ไม่ unmount source เพื่อเลี่ยง layer churn)
- [ ] **5.2** `real-map-canvas-maplibre.tsx`:
  - import `useState`, `useLegsShown`, `routeArcs`, `MapLegsToggle`, `ROUTE_HIT_LAYER`; รับ prop `onLegSelect`
  - หลัง `groups`:

```tsx
  // Day route (lib/map-route): computed once for the lines, the badges and the toggle.
  const arcs = useMemo(() => routeArcs(pins, legs ?? []), [pins, legs]);
  const legsShown = useLegsShown();
  // A search preview pin takes no clicks: with leg taps on, tapping it over a line would select the
  // leg and drop the preview (scrutiny round 1).
  const legsInteractive = legsShown && !preview && !!onLegSelect;
  const [legCursor, setLegCursor] = useState<string | undefined>(undefined);
```

  - `<Map …>` เพิ่ม:

```tsx
          interactiveLayerIds={legsInteractive ? [ROUTE_HIT_LAYER] : undefined}
          cursor={legsInteractive ? legCursor : undefined}
          onMouseEnter={() => setLegCursor('pointer')}
          onMouseLeave={() => setLegCursor(undefined)}
          onClick={(e) => {
            const to = e.features?.[0]?.properties?.to;
            if (typeof to === 'string') onLegSelect?.(to);
          }}
```

  - แทน `<RouteLinesMaplibre pins={pins} legs={legs ?? []} />` ด้วย `<RouteLinesMaplibre arcs={arcs} show={legsShown} interactive={legsInteractive} onSelect={(id) => onLegSelect?.(id)} />`
  - แทน `{/* Top-right … */}<MapDegradedChip />` ด้วย:

```tsx
      {/* Top-right: route lines toggle, then the "Backup map" notice */}
      <div className={styles.overlayTr}>
        {arcs.length > 0 ? <MapLegsToggle /> : null}
        <MapDegradedChip />
      </div>
```

  - **ตรวจตอนทำ (ก่อนไป Task 6):** (a) `cursor={undefined}` ไม่ทับ cursor grab/grabbing ของ MapLibre — ดูใน `node_modules/@vis.gl/react-maplibre` ว่าเซ็ต style เฉพาะเมื่อมีค่า; ถ้าเซ็ต `''` ทุกครั้งก็ยังได้ผลเดียวกัน (CSS class ของ MapLibre ทำงาน) (b) `queryRenderedFeatures` คืน feature ของ layer `line-opacity: 0` — ตรวจใน e2e ขั้น 6; ถ้าไม่คืน เปลี่ยนเป็น `0.01`
  - `onMouseEnter/Leave` ของ react-map-gl ยิงเฉพาะ layer ใน `interactiveLayerIds` จึงไม่ต้องเช็ค layer ซ้ำ

## Task 6 — Google

- [ ] **6.1** `map-route-google.tsx`:

```tsx
type Props = { arcs: RouteArc[]; show: boolean; interactive: boolean; onSelect: (toId: string) => void };

export function RouteLinesGoogle({ arcs, show, interactive, onSelect }: Props) {
  const t = useT();
  if (!show) return null;
  return arcs.map((arc) => (
    <RouteArc key={arc.key} arc={arc} interactive={interactive}
      name={t('map_leg_go', { name: stopName(arc.toPin, t) })} onSelect={onSelect} />
  ));
}

function RouteArc({ arc, interactive, name, onSelect }: { arc: RouteArc; interactive: boolean; name: string; onSelect: (toId: string) => void }) {
  const { path, mid, color, toId } = arc;
  const badge = arc.showBadge ? arc.mode : null;
  return (
    <>
      {/* casing + line: เดิมทุก prop (clickable={false}) */}
      {interactive && (
        // Invisible, wide tap target above the visible pair (polylines stay below every marker).
        <Polyline path={path} geodesic={false} clickable strokeColor={color} strokeOpacity={0}
          strokeWeight={ROUTE_HIT_WIDTH} zIndex={3} onClick={() => onSelect(toId)} />
      )}
      {badge && (
        <AdvancedMarker position={mid} zIndex={ROUTE_BADGE_Z_INDEX} anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
          clickable={interactive} title={interactive ? name : undefined}
          onClick={interactive ? () => onSelect(toId) : undefined}>
          <RouteBadge mode={badge} color={color} toId={toId} interactive={interactive} />
        </AdvancedMarker>
      )}
    </>
  );
}
```

  - ชื่อ type ชนกับ component `RouteArc` → import type เป็น `type RouteArc as Arc` แล้วใช้ `Arc`
  - comment หัวไฟล์: "neither they nor the non-clickable badge take clicks" → อธิบาย hit polyline + clickable badge ขณะ interactive
- [ ] **6.2** `real-map-canvas-google.tsx` (`Inner`):
  - รับ `onLegSelect`; เพิ่ม `arcs` / `legsShown` / `legsInteractive` เหมือน 5.2 (ไม่มี cursor — Google ใช้ pointer เองบน clickable polyline)
  - `{overlays && <RouteLinesGoogle arcs={arcs} show={legsShown} interactive={legsInteractive} onSelect={(id) => onLegSelect?.(id)} />}`
  - ก่อน `data-map-zoom` เพิ่ม `{arcs.length > 0 ? <div className={styles.overlayTr}><MapLegsToggle /></div> : null}` (Google ไม่มี degraded chip)
  - **ตรวจตอนทำ:** (a) polyline `strokeOpacity: 0` ยังรับคลิก — ถ้าไม่ ใช้ `0.01` (b) คลิก polyline ไม่ยิง `Map onClick` (POI handler) — `e.detail.placeId` ว่างอยู่แล้วจึงไม่มีผลแม้ยิง

## Task 7 — wiring

- [ ] `map-renderer-props.ts` ใต้ `onActivate`:

```ts
  /** A tap on a route line or its badge: select that leg's destination (never toggles it off). */
  onLegSelect?: (placeId: string) => void;
```

- [ ] `persistent-map.tsx` ใต้ `select()`:

```ts
  // Route line / badge tap (D6): select the leg's destination like a pin tap, but a
  // second tap keeps it selected instead of closing it.
  function selectLeg(id: string) {
    if (activePlaceId !== id) activate(id);
  }
```

  และส่ง `onLegSelect={selectLeg}` ให้ `<RealMapCanvas>`
- `real-map-canvas.tsx` (selector) ไม่ต้องแก้: ส่ง `{...props}` ต่อทั้งก้อนอยู่แล้ว (`real-map-canvas.tsx:22`)

## Task 8 — static checks

- [ ] `pnpm typecheck 2>&1 | tail -3` → 0 error
- [ ] `pnpm lint 2>&1 | tail -3` → 0 error (i18n guard: ข้อความใหม่ทั้งหมดผ่าน `t()`)
- [ ] `pnpm test 2>&1 | tail -3` → เขียวทั้งหมด (รวม `i18n-messages.test.ts` ที่เทียบ key en/th และ `map-tokens.test.ts`)
- [ ] commit: `feat(map): route lines toggle; tap a leg to select its destination [TP-xxxx]`

## Task 9 — e2e ใหม่ (describe `legs`)

วางนอก loop ภาษา (ท้ายไฟล์), en อย่างเดียว, fixture ของตัวเอง:

```ts
// ── Route lines toggle + leg taps (plan 2026-11-02-map-leg-toggle). Day 1 ends at a hotel 4 km
// away with a stored walk mode, so its last leg always has a badge (stop↔stop legs have no mode). ──
test.describe('legs', () => {
  let fx: Fixture;
  const STOPS = stopsAt(41, 3);
  const HOTEL = { name: 'Legs hotel', lat: 41.05, lng: 135.75, checkInDate: '2030-01-01', checkOutDate: '2030-01-02', arrivalMode: 'walk' };

  test.beforeAll(async ({ browser, baseURL }) => { /* createFixture(..., [{ places: STOPS }, { places: stopsAt(41.5, 1) }], [HOTEL]) */ });
  test.afterAll(async ({ browser, baseURL }) => { /* removeFixture */ });
  test.beforeEach(async ({ context, baseURL, page }) => {
    await context.addCookies([{ name: 'lang', value: 'en', url: baseURL! }]);
    await page.addInitScript(() => localStorage.setItem('tp.mapNudgeShown', '1'));
  });

  const TOGGLE = '[data-map-legs-toggle]';
  const BADGE = '[data-trip-map-section] [data-route-badge]';
  const open = async (page: Page, info: TestInfo) => {
    await page.goto(`${fx.trip}?day=0`);
    await expect(page.locator(SEL.aside)).toBeVisible();
    if (isPhone(info)) await openMap(page);
    await expect(page.locator(BADGE).first()).toBeVisible();
  };
  /** Taps the middle of the first badge; `through` makes the marker ignore the pointer so the tap lands on the line. */
  const tapBadgeSpot = async (page: Page, info: TestInfo, through = false) => { /* … */ };
  const tap = (page: Page, info: TestInfo, x: number, y: number) =>
    isPhone(info) ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
```

- [ ] **L1** toggle ซ่อน/แสดง + จำค่า:
  - `TOGGLE` มี `aria-pressed="true"` → tap → `"false"`, `BADGE` count 0
  - `page.reload()` (มือถือ: map เปิดกลับเองจาก history entry — ตาม flow 2) → `aria-pressed="false"`, badge 0
  - tap อีกครั้ง → `"true"`, badge ≥ 1
- [ ] **L2** แตะ badge เลือกปลายทาง:
  - `to = await page.locator(BADGE).first().getAttribute('data-leg-to')` (คือ hotel)
  - tap กลาง badge → `expect.poll(() => query(page).placeId).toBe(to)`
  - มือถือ: การ์ดที่ `aria-current="true"` คือ hotel (`SEL.cards` ที่มี `data-place-id`/ข้อความชื่อ hotel — ใช้ selector ที่ flow อื่นใช้)
  - tap ซ้ำ → `placeId` ยังเป็น `to` (ไม่ toggle ปิด)
- [ ] **L3** แตะเส้น (ไม่ใช่ badge):
  - เลือก stop 1 ก่อน (tap pin แรก หรือ goto `?day=0&placeId=<stop1>`)
  - `evaluate`: `el.closest('gmp-advanced-marker, .maplibregl-marker') ?? el` → `style.pointerEvents = 'none'` ทั้ง host และ el
  - assert `document.elementFromPoint(cx, cy)` ไม่อยู่ใน `[data-route-badge]` (กันเทสต์กด badge โดยไม่รู้ตัว)
  - tap ที่ `(cx, cy)` (กลาง badge = `arcMid` อยู่บนเส้นพอดี) → `placeId` = `to`
  - ซ่อนเส้น → กลับไป stop 1 → tap จุดเดิม → `placeId` ยังเป็น stop 1
- [ ] **L4** (มือถือเท่านั้น) ปุ่มอยู่ในจอ ไม่ทับ chrome: `expectOnScreen(page, TOGGLE, …)` + bounding box ไม่ `intersects` กับ `SEL.toggle`, `SEL.carousel`, `SEL.daySwitcher`, `SEL.nav`; ขอบบนของปุ่ม ≥ 16

### การรัน (ตั้งงบเวลาไว้ ~8 นาทีรวม build)

| ขั้น | คำสั่ง | งบ |
|------|--------|----|
| 1 | `pnpm build 2>&1 \| tail -3` | ~3 min |
| 2 | `MAPS_PROVIDER=google AUTH_BYPASS=true pnpm start -p 3210` (background) | — |
| 3 | `pnpm e2e:mobile --grep "^legs " --project=pixel-7 --project=desktop` | ~2 min |
| 4 | `pnpm e2e:mobile --grep "flow 9" --project=small-android --project=tiny-320` (`.overlayTr` เปลี่ยน; มี lang loop จึงได้ 4 test) | ~1 min |
| 5 | หยุด server → `AUTH_BYPASS=true pnpm start -p 3210` (ไม่ตั้ง `MAPS_PROVIDER` = MapLibre, **ไม่ build ใหม่**) → `pnpm e2e:mobile --grep "^legs " --project=desktop` | ~1 min |

- **ไม่รันทั้งชุด** (`mobile-layout.spec.ts` ~2,500 บรรทัด × 6 projects × 2 ภาษา): งานนี้ไม่แตะ stack ด้านล่าง, carousel, หรือรายการ
- ถ้า test fail: ดู trace (`retain-on-failure`) แล้วรัน**เฉพาะ test นั้น** ไม่รันขั้นอื่นซ้ำ; ห้าม build ใหม่เพื่อแก้แค่ test (แก้ spec ไม่ต้อง build)
- ไม่ build `main` เพื่อพิสูจน์ red: test ใหม่หา `[data-map-legs-toggle]` / `data-leg-to` ซึ่งไม่มีบน main จึง fail แน่นอน
- **ข้อจำกัดที่จะรายงาน:** ไม่มีอุปกรณ์จริง (iOS Safari ไม่ได้ตรวจ); ขั้น 5 MapLibre ทดสอบเฉพาะ desktop

## Task 10 — เอกสาร + PR

- [ ] `REQUIREMENTS.md:298` แทนประโยค "Lines and badges sit under the pins and never take clicks." ด้วย:
  > Lines and badges sit under the pins. A "Route lines" button (44 px, top right of the map: below Search places on md+, under the status bar on the phone full-map; only on a day with a drawn leg) shows or hides them; hidden is remembered per device (`tp.mapLegs`), the list's leg bands are unaffected. While shown, tapping a line (20 px target) or a badge selects that leg's destination stop, like tapping its pin, but never deselects it; leg taps are off while a search preview is shown.
- [ ] `AGENTS-INDEX.md`: แก้แถว `map-route-google.tsx / map-route-maplibre.tsx` (hit polyline / hit layer `tp-route-hit`, `arcs` จาก canvas), `map-route-badge` (button เมื่อ interactive, `data-leg-to`), `lib/map-route.ts` (`toId`, `toPin`, `ROUTE_HIT_WIDTH`), `map-degraded-chip` (pill เท่านั้น); เพิ่มแถว `map-legs-toggle.tsx`, `lib/maps/legs-store.ts`
- [ ] commit docs → push → PR (body: สรุป, decisions, ผล test จริงพร้อมคำสั่ง, ข้อจำกัด) → link PR กับ thread → ย้าย ticket ไป review

---

## ความเสี่ยง

| ความเสี่ยง | การรับมือ |
|-----------|-----------|
| Hit target โปร่งใสไม่รับคลิก (MapLibre query / Google polyline) | ตรวจใน Task 5/6 + L3 ทั้งสอง renderer; fallback opacity `0.01` |
| พื้นที่แตะ 20 px ทำให้แตะ POI/ลากยากตอนเส้นแสดง | ลากไม่ fire click; D10 + ปุ่มซ่อน |
| leg < 300 m ไม่มี badge และเส้นจมใต้ pin ทั้งสอง | ยอมรับ: แตะ pin ปลายทางตรง ๆ ได้ |
| `.overlayTr` เป็นคอลัมน์ → chip Backup map ลง 52 px ตอนมีปุ่ม | chip เป็นสถานะชั่วคราว ปิดได้; ตรวจด้วยตาบน MapLibre ขั้น 5 |
| L3 บน Google: host ของ marker ไม่ใช่ `gmp-advanced-marker` ใน 1.8.3 | assert `elementFromPoint` จะจับได้ทันที; ถ้าจับได้ หา host จริงจาก DOM ใน trace แล้วแก้ selector |
| e2e fixture: hotel ที่ import ไม่ขึ้นเป็น pin ปลายทางของ leg สุดท้าย | ตรวจ `buildMapDays` + hotel endHotels ตอนเขียน L1; fallback: ใช้ trip ที่ `findTrip()` เจอ + `test.skip` เมื่อไม่มี badge |

## ประวัติ scrutiny

รอบ 1 ([บันทึก](2026-11-02-map-leg-toggle.scrutiny.md)) — fix-then-ship, แก้เข้าแผนแล้ว:

1. **MAJOR** pin ของ search preview ไม่รับคลิก การแตะทะลุลงเส้น → เลือก leg + ล้าง preview → D7 `legsInteractive = legsShown && !preview`
2. **MAJOR** L3 บน Google ต้องปิด pointer-events ที่ host ของ marker + assert `elementFromPoint`
3. `routeArcs` คำนวณครั้งเดียวใน canvas ส่ง `arcs` ลงไป
4. ชื่อปุ่ม badge = `Go to {name}`
5. `MAPS_PROVIDER` อ่านตอน runtime (`lib/maps/config.ts:60`) → ขั้น 5 ไม่ต้อง build ใหม่
6. cursor ปกติ = `undefined`

ตรวจแล้วไม่ใช่ปัญหา: ✕ บน pin card ที่ทับเส้น (MapLibre popup อยู่นอก canvas container ที่ handler ฟัง), pin/ghost (`stopPropagation` อยู่แล้ว), hydration flash (canvas `ssr: false`)

รอบ 2 (แผนละเอียด, self-check): fixture e2e เดิมไม่มี leg ที่มี mode (segment mode เขียนผ่าน API ไม่ได้ — `API.md:287`) จึงใช้ hotel ที่มี `arrivalMode` (import รับ `lat/lng/arrivalMode` — `lib/api/hotel-input.ts:22-26`) ให้ leg สุดท้ายของวันมี badge แน่นอน; MapLibre badge click ต้อง `stopPropagation` (marker อยู่ใน canvas container ที่ handler ฟัง — `maplibre-gl-dev.mjs:60851`)
