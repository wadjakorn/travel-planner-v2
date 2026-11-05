# ช่วงเดินทางที่ "ดูกดได้" (TP-0152 รอบ 2) — แผนลงมือ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้คนเห็นว่าช่วงเดินทางกดได้ — แถบในรายการเป็นปุ่มพร้อมบรรทัดโน้ต/ชวนเพิ่ม, ป้ายบนเส้นเป็นแคปซูล, การ์ดจุดบนแผนที่มือถือมีแถว "ทางมา" และเส้นของจุดที่เลือกถูกเน้น

**Architecture:** ใช้ `LegInfo` และ `useLegSheet().openLeg` จากรอบแรก (branch `feat/tp-0152-leg-sheet`, PR #155) ไม่แตะ service/action · ตรรกะการแสดงผลแยกเป็นฟังก์ชัน pure ที่ unit-test ได้ · ทำต่อใน branch เดิม

**Tech Stack:** Next.js 16 client components, CSS modules + token, Vitest, Playwright `pnpm e2e:mobile`

**Spec:** `docs/superpowers/specs/2026-11-05-leg-detail-sheet-design.md` §9 (binding) + §4, §7 ข้อ 10–11 · ผลตรวจ: `2026-11-05-leg-affordance.scrutiny.md` (แก้ครบในฉบับนี้)

## Global Constraints

- ข้อความผ่าน `useT()` เพิ่มคีย์ทั้ง `en.json`/`th.json` (parity test) — **ไม่มีเครื่องหมาย "＋" ในข้อความ** (ใช้ไอคอน `Plus` จาก `components/icons` แบบ `aria-hidden` แทน):
  - `leg_add_time_note` = "Add time or note" / "เพิ่มเวลา/โน้ตการเดินทาง"
  - `leg_add_note` = "Add a travel note" / "เพิ่มโน้ตการเดินทาง"
  - `map_leg_from` = "Getting here from {name}" / "ทางมาจาก {name}" (`{name}` = ชื่อจุด/โรงแรมต้นทาง `info.from.name`)
  - `map_leg_first` = "First stop of the day" / "จุดแรกของวัน"
  - ลบ `leg_has_note` ออกจากทั้งสองไฟล์ในคราวเดียว (หลัง Task 1 ไม่มีผู้ใช้)
- ห้ามสี hex ใน component (raw-color guard); ห้าม inline style ยกเว้น `style={legStyle(slot)}` (พื้นที่เปลี่ยนตามธีม) / `mapLegStyle(slot)` (บนแผนที่ที่ล็อกธีมสว่าง) และ `--badge` ของ `RouteBadge` เดิม · Polyline/MapLibre paint ใช้ `LEG_COLORS` เดิม
- บนแผนที่ (ล็อกธีมสว่าง) ห้ามใช้ `--note-*` ที่เปลี่ยนตามธีม: เพิ่ม token `--map-note-soft/--map-note-fg/--map-note-border` ใน `globals.css` ที่ล็อกค่าสว่างแบบเดียวกับ `--map-pin-*` (ค่าเดียวกับ `--note-*` ของธีมสว่าง)
- ห้ามขอบซ้ายหนาแบบ side-tab บนแถว/การ์ดใหม่ (ใช้กรอบบาง + พื้นจางด้วย `color-mix(in srgb, var(--leg) …%, var(--surface))`)
- ตัวหนังสือที่ใช้งานได้ ≥ 11px; เป้ากด ≥ 44px **ด้วยความสูงจริง** (ไม่ขยาย `tp-hit` ไปทับปุ่มข้างเคียง)
- ช่วงไม่มีสี (`slot == null`) → `--border-strong` / `--muted`
- e2e เฉพาะที่เกี่ยวข้อง บน `owner-phone` + `desktop` build ครั้งเดียว port 3211 (`MAPS_PROVIDER=google AUTH_BYPASS=true pnpm start -p 3211`, `E2E_BASE_URL=http://localhost:3211`)
- `pnpm typecheck` + `pnpm lint` หลังแก้ครั้งสุดท้ายของทุก task

## Review Focus

1. **แถว "ทางมา" ชิงการแตะเลือกการ์ด** → แถวสูงจริง 44px ไม่มี hit-area ยื่น; helper e2e ชี้ปุ่มเลือกจุดผ่าน `data-stop-select` — Task 3
2. **ความสูงการ์ดไม่คงที่ข้ามวัน** (มีโน้ต/ไม่มีโน้ต/จุดเดียว/จุดแรกไม่มีช่วงเข้า) → ความสูงสัมบูรณ์เท่ากัน และ `strip.top` ไม่ขยับเมื่อเปลี่ยนวัน — Task 3 + Task 4
3. **หมุดจมใต้แถบการ์ดที่สูงขึ้น** → ค่า fit/งบความสูงขยับ +44 — Task 3
4. **รายการกระโดดตอน hydrate/ย้ายจุด** → บรรทัดสองขึ้นกับ `canEdit` อย่างเดียว ไม่ขึ้นกับ `disabled` — Task 1
5. **ป้ายแคปซูลทับกัน** → ตัดสินจากความยาวบนจอ (pixel) ที่ zoom ปัจจุบัน — Task 2

---

### Task 1: แถบในรายการ (แบบ C)

**Files:** Modify `app/src/components/segment.tsx`, `app/src/components/itinerary-list.module.css`, `app/src/lib/segment-label.ts`, `app/src/lib/segment-label.test.ts`, `app/src/messages/en.json`, `th.json`

**Interfaces:**
- Consumes: `LegInfo`, `useLegSheet()`; prop `canEdit` ที่ `Segment` มีอยู่
- Produces:
  ```ts
  export type LegSecondLine = { kind: 'note'; text: string } | { kind: 'add'; key: 'leg_add_time_note' | 'leg_add_note' } | null;
  export function legSecondLine(note: string | null | undefined, durationMin: number | null | undefined, canEdit: boolean): LegSecondLine;
  ```
  กฎ: มีโน้ต (trim ไม่ว่าง) → `note`; ไม่มีโน้ต + `canEdit` → `add` (`durationMin > 0` → `leg_add_note`, ไม่งั้น `leg_add_time_note`); อื่น ๆ → `null` · **ไม่ขึ้นกับ `disabled`** (กันรายการกระโดดตอน hydrate ที่ StaticItem ส่ง `disabled={canEdit}` และตอนย้ายจุด)

- [ ] **Step 1: test ที่ล้ม** — `it('note wins')` `legSecondLine('rapi:t', 40, true)` → `{kind:'note',text:'rapi:t'}`; `it('editors get an add prompt')` `(null, null, true)` → `leg_add_time_note`, `(null, 40, true)` → `leg_add_note`, `('  ', 0, true)` → `leg_add_time_note`; `it('viewers get nothing without a note')` `(null, 40, false)` → `null`
- [ ] **Step 2: รันให้ล้ม** `cd app && pnpm vitest run src/lib/segment-label.test.ts`
- [ ] **Step 3: implement** — ปุ่มเดียวกันครอบสองบรรทัด: บรรทัดแรก = ป้ายปุ่มตาม §9.1 (ไอคอน+โหมด · ระยะ · เวลา · ›); บรรทัดสอง = `legSecondLine` (โน้ต: บรรทัดเดียว truncate สี `--note-*`; add: ไอคอน `Plus` + ข้อความ สี `--brand`) · ลบไอคอน ✎ และ `leg_has_note` · ชิป "ไม่มีตำแหน่ง" ใช้บรรทัดสองแบบเดียวกัน · ชื่อที่อ่านได้ = ข้อความที่มองเห็น (`aria-describedby` เดิมคงไว้)
- [ ] **Step 4: รัน** `pnpm vitest run` + `pnpm typecheck` + `pnpm lint`
- [ ] **Step 5: Commit** `feat(legs): list leg bar reads as a button with note/add line [TP-0152]`

### Task 2: ป้ายแคปซูลบนเส้น + เน้นช่วงที่เลือก

**Files:** Modify `app/src/lib/map-route.ts`, `map-route.test.ts`, `app/src/components/map-route-badge.tsx` + `.module.css`, `map-route-google.tsx`, `map-route-maplibre.tsx`, `real-map-canvas-google.tsx`, `real-map-canvas-maplibre.tsx`, `app/src/app/globals.css` (`--map-note-*`) — `persistent-map.tsx` / `map-renderer-props.ts` ไม่ต้องแก้ (canvas มี `activePlaceId` อยู่แล้ว)

**Interfaces:**
- ใช้ `arc.info.durationMin` / `arc.info.note` ที่มีอยู่แล้ว (ไม่เพิ่ม field ซ้ำใน `RouteArc`)
- Produces:
  ```ts
  export const CAPSULE_MIN_PX = 120; // ความยาวคอร์ดบนจออย่างน้อยเท่านี้จึงแสดงแคปซูลเต็ม
  /** เมตรต่อ pixel แบบ Web Mercator: 156543.03392 * cos(lat) / 2^zoom */
  export function metersPerPixel(lat: number, zoom: number): number;
  export function badgeLabelled(chordMeters: number, lat: number, zoom: number): boolean; // chordMeters / metersPerPixel >= CAPSULE_MIN_PX
  export function activeArcKey(arcs: RouteArc[], activePlaceId: string | null): string | null; // arc ที่ toId === activePlaceId
  export const ROUTE_HALO_WIDTH = 12;
  ```
  - `RouteArc` เพิ่มแค่ `chordM: number` (= `metersBetween(a,b)`) และ `midLat` ใช้จาก `mid.lat` ที่มีอยู่
  - zoom: canvas ทั้งสองอ่าน zoom ปัจจุบัน (Google `map.getZoom()` ใน listener `zoom_changed`/`idle`; MapLibre `onZoomEnd`/`onMoveEnd`) ปัดเป็นจำนวนเต็ม เก็บใน state แล้วส่งลง route lines → `badgeLabelled(arc.chordM, arc.mid.lat, zoom)`
- แคปซูล (`RouteBadge` props เพิ่ม `durationMin?`, `hasNote?`, `labelled?`, `active?`): labelled → ไอคอน · `formatDurationMin` (> 0) · ✎ (สี `--map-note-*`) · ›; ไม่ labelled → ไอคอน + › · คง `data-route-badge`, `data-leg-to`, `aria-label` (`map_leg_go`) · `data-active` เมื่อ active · ขยายเป้ากดเป็น 44px ด้วย `::after` **แนวตั้งเท่านั้น** (ไม่แย่ง POI/การลากแผนที่ด้านข้าง) · z-order ใต้หมุดเหมือนเดิม
- halo: Google — Polyline halo `zIndex` 3, เลื่อน casing 4 / เส้น 5 / hit 6 (halo อยู่ใต้ casing); MapLibre — layer halo ก่อน casing, `filter: ['==', ['get','to'], activePlaceId ?? '']`

- [ ] **Step 1: test ที่ล้ม** ใน `map-route.test.ts`: `it('metersPerPixel matches Web Mercator')` (lat 0 zoom 0 → 156543.03392 ±0.01; lat 60 zoom 1 → ครึ่งหนึ่งของ lat 0 zoom 1 ±1e-6) · `it('badgeLabelled by on-screen length')` — 1000 m ที่ lat 35 zoom 13 (~15.6 m/px → ~64 px) → false, ที่ zoom 15 → true · `it('activeArcKey picks the leg into the selected stop')` — null เมื่อไม่มี/ไม่ตรง · `it('routeArcs carries chordM')`
- [ ] **Step 2: รันให้ล้ม** `pnpm vitest run src/lib/map-route.test.ts`
- [ ] **Step 3: implement**
- [ ] **Step 4: รัน** `pnpm vitest run` + `pnpm typecheck` + `pnpm lint`
- [ ] **Step 5: Commit** `feat(map): leg badge becomes a labelled capsule; highlight the selected stop's leg [TP-0152]`

### Task 3: แถว "ทางมา" บนการ์ดจุด (มือถือ) + ความสูงใหม่ (ผู้ใช้อนุมัติ: แถวสูง 44px, แผนที่เสีย ~44px)

**Files:** Modify `app/src/lib/day-augment.ts`, `app/src/lib/map-carousel.ts` + test, `app/src/components/map-stop-carousel.tsx` + `.module.css`, `app/src/lib/map-helpers.ts` (`MOBILE_FIT_BOTTOM`), `app/src/lib/map-camera.test.ts`, `app/e2e/mobile-layout.spec.ts` (helper + ค่าคงที่ความสูงเท่านั้น; test ใหม่อยู่ Task 4), i18n

**Interfaces:**
- `MapDay.legInfos: LegInfo[]` — ใน `buildMapDays` เรียก `buildLegInfos` **ครั้งเดียวต่อวัน** และให้ `MapLeg.info` ชี้ object เดียวกับใน `legInfos` (instance เดียวกัน React Flight จึง dedupe ได้) · วัดขนาด RSC payload ของหน้า trip ก่อน/หลัง (`curl -s -H 'RSC: 1' …/trip/<id> | wc -c` บน fixture เดิม) รายงานในรายงานของ task
- Produces:
  ```ts
  export function legIntoCard(legInfos: LegInfo[], pinId: string): LegInfo | null; // toId === pinId รวมช่วงที่ปลายไม่มีพิกัด
  ```
- การ์ด: คอลัมน์ = แถวบนสูง **44px** (ตัวอักษร 12px บรรทัดเดียว truncate) + ปุ่มเลือกจุดเดิม (`min-h-[52px]`) ที่ได้ `data-stop-select` · แถวบน `<button data-leg-row>`: `openLeg(info,'map')` (ไม่เรียก `onSelect`) ข้อความ `map_leg_from` ด้วยสีของช่วง (`legStyle`, เพราะพื้นการ์ดเปลี่ยนตามธีม) · ไอคอนโหมด · เวลา (> 0) · โน้ตบรรทัดแรก (`--note-fg`) · › · ไม่มีช่วงเข้า → `<div data-leg-row>` ข้อความ `map_leg_first` สี `--muted` สูงเท่ากัน
- ค่าที่ต้องเปลี่ยน (Δ = 44): `MOBILE_FIT_BOTTOM` 162 → 206 และคอมเมนต์ "134 tall" → "178 tall" (`map-helpers.ts:136`); `map-camera.test.ts:96` 162 → 206; e2e N5 `near(m.cardH, 54, 1)` (~l.1039) → 98; I7 `expectStackHeight(…, 192, …)` (~l.677) → 236; ตรวจ empty-day 190/204 และ I8 ถ้ากระทบให้ +44 พร้อมคอมเมนต์ · helper e2e ที่ใช้ `button.first()` / `.locator('button')` ในการ์ด (~l.451, 843, 990, 2546) และ N5 `button .truncate` (~l.1024) → ชี้ `[data-stop-select]`

- [ ] **Step 1: test ที่ล้ม** ใน `map-carousel.test.ts`: `it('legIntoCard finds the leg into a stop, located or not')` (ช่วงที่ `from` ไม่มีพิกัดยังคืน; จุดแรกไม่มีโรงแรม → `null`) · ใน `day-augment.test.ts`: `it('MapLeg.info is the same instance as legInfos entry')` (`toBe`)
- [ ] **Step 2: รันให้ล้ม**
- [ ] **Step 3: implement** + เปลี่ยนค่าคงที่/helper ตามรายการ
- [ ] **Step 4: รัน** unit + `pnpm typecheck` + `pnpm lint`
- [ ] **Step 5: Commit** `feat(map): stop cards show the leg into the stop and open its sheet [TP-0152]`

### Task 4: e2e

**Files:** `app/e2e/mobile-layout.spec.ts`

- แก้ test ฝั่งรายการที่ขัดกับแบบใหม่: ~l.2077 "the bar shows no note text" → กลับเป็นต้องเห็นบรรทัดโน้ต; ~l.2083 ปุ่มสูงหนึ่งบรรทัด ≤ 56 → เพดานใหม่สองบรรทัด (วัดจริงแล้วตั้ง ≤ ค่าจริง + 4); test กรอบแตะ TP-0150 ฉบับใหม่ (ปุ่มแถบกับลิงก์นำทางไม่ซ้อนกัน) ต้องยังผ่านกับปุ่มที่สูงขึ้น; helper `legsOf` อ่าน `hasNote` จากบรรทัดโน้ตแทนไอคอน
- test ใหม่:
  - `TP-0152 C: list bar shows the note line, or an add prompt for editors` — มีโน้ต → เห็นโน้ต; ไม่มี → เห็นข้อความ `leg_add_*` ตาม `MESSAGES[lang]`; แตะบรรทัดสอง → แผ่นเปิด
  - `TP-0152 C: the stop card "from" row opens the sheet without changing the selection` (phone) — เลือกการ์ด 2 ผ่าน `[data-stop-select]` → แตะ `[data-leg-row]` → dialog เปิด, `?placeId` ไม่เปลี่ยน, การ์ดยัง `aria-current`
  - `TP-0152 C: stop cards keep one height across days` (phone) — วัดความสูงการ์ดในวันที่มีโน้ต/ไม่มีโน้ต/จุดเดียว เท่ากันแบบสัมบูรณ์ (±1) และ `[data-map-carousel]` top ไม่ขยับเมื่อเปลี่ยนวัน
  - `TP-0152 C: the selected stop's badge is marked active and labelled when long enough` (desktop) — แตะเลือกจุด → `[data-route-badge][data-active]` เป็นของช่วงเข้าจุดนั้น; ป้ายของช่วงยาวมีข้อความเวลา (fixture ตั้ง `durationMin`)
- รัน: build ครั้งเดียว แล้ว `--grep "TP-0152|TP-0141|TP-0150|L1:|L2:|L3:|L4:|N5|N6|T4|T6|I7|I8|flow 7|flow 8|carousel|T13|C0"` บน `owner-phone` + `desktop` (ปรับ pattern ให้ตรงชื่อจริงโดยดูจาก `grep -n "test('" e2e/mobile-layout.spec.ts`) — L2/L3 phone และ "place from map POI" ล้มบน main อยู่แล้ว (รายงานแยก ไม่นับ)
- [ ] Commit `test(e2e): leg affordance — list note line, stop-card leg row, active labelled badge [TP-0152]`

## หลังจบ

push branch เดิม (PR #155 อัปเดตเอง) แนบภาพหน้าจอมือถือก่อน/หลังในคอมเมนต์ PR · รอผู้ใช้อนุมัติ merge

## บันทึกการแก้ตาม /scrutinize รอบ 2 (verdict: ship — ข้อผูกพันของผู้ลงมือ, override ข้อความข้างบน)

1. `map-camera.test.ts` เปลี่ยน 162 → 206 **ทั้งสองจุด** (l.82 `previewSafeArea` และ l.96 `previewPadding`) (Task 3)
2. grep ของ Task 4 ใช้: `"TP-0152|TP-0141|TP-0150|L1:|L2:|L3:|L4:|flow 1:|flow 8:|flow 9:|T3:|T4:|T5:|T6:|T13|N5:|N6:|C0"` (I7/I8 เป็นข้อความใน assertion ของ `flow 9:` ไม่ใช่ชื่อ test)
3. แถว "ทางมา": ไอคอนโหมดอยู่หน้าข้อความ; ไอคอน, เวลา และ › เป็น `shrink-0`; truncate เฉพาะชื่อต้นทางและโน้ต (Task 3)
4. zoom เก็บใน `RouteLinesGoogle`/`RouteLinesMaplibre` เองผ่าน `useMap()` (ไม่ใช่ state ใน canvas) ตั้งค่าเริ่มจาก `getZoom()` ตอน mount แล้วอัปเดตเมื่อจำนวนเต็มของ zoom เปลี่ยน (Task 2)
5. e2e `data-active` ใช้ fixture ที่ช่วงเข้าจุดที่เลือกมี badge จริง (มี mode, ยาว ≥ 300 m) (Task 4) · เพิ่ม test ใน `map-tokens.test.ts`: `--map-note-fg` บน `--map-note-soft` contrast ≥ 4.5:1 และไม่ถูกนิยามใหม่ในธีมมืด (Task 2)
