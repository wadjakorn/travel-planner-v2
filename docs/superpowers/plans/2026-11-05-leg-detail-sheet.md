# แผ่นช่วงเดินทาง (TP-0152) — แผนลงมือ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แผ่นเดียว (`LegSheet`) สำหรับดูและแก้ วิธีเดินทาง · เวลาโดยประมาณ · โน้ต ของช่วงระหว่างจุด เปิดได้จากแถบในรายการและจากเส้น/ป้ายบนแผนที่ บันทึกผ่าน service ตัวเดียวกับ REST API

**Architecture:** ฝั่ง server สร้าง `LegInfo` (ตัวระบุช่วง + ค่าปัจจุบัน + ชื่อ/พิกัดของสองปลาย) จาก `dayLegs` ครั้งเดียวใน `lib/leg-info.ts` แล้วส่งให้ทั้งรายการ (`AugmentedSeg.leg`) และแผนที่ (`MapLeg.info`) ฝั่ง client มี `LegSheetProvider` ใน trip layout (ครอบทั้ง `children` และ `PersistentMap`) ใครมี `LegInfo` ก็เรียก `openLeg(info, origin)` ได้ การบันทึกผ่าน server action ตัวเดียว `saveLegAction` → `saveLeg` → `setPlaceArrive` (มี precondition) หรือ `setHotelLegMode`

**Tech Stack:** Next.js 16 (App Router, server actions), Drizzle + postgres-js, Vitest (unit + integration ผ่าน `TEST_DATABASE_URL`), Playwright (`pnpm e2e:mobile`)

**Spec:** `docs/superpowers/specs/2026-11-05-leg-detail-sheet-design.md` (+ `.scrutiny.md`) — §7 override ส่วนก่อนหน้า

## Global Constraints

- ข้อความบนจอผ่าน `useT()` / `tServer()` เท่านั้น เพิ่มคีย์ทั้ง `app/src/messages/en.json` และ `th.json` (มี parity test)
- ห้ามสี hex ในไฟล์ component (`raw-color-guard.test.ts`) · ไฟล์ใหม่ห้าม inline style ของ layout/สี (แบบ `place-note-modal.tsx`) ใช้ CSS module + token (`--note-soft/--note-fg/--note-border`, ช่วงไม่มีสี → `--border-strong` / `--muted`) · **ข้อยกเว้นเดียว:** `style={legStyle(slot)}` (`map-route.ts:48`) ซึ่งตั้งแค่ custom property ของสีช่วง
- action คืน `ActionResult` (`lib/action-result.ts`) ห้าม throw ข้อผิดพลาดที่คาดได้
- เขียนข้อมูลผ่าน `setPlaceArrive` (segment/start/gap) หรือ `setHotelLegMode` (ขาโรงแรม) เท่านั้น ห้ามเขียน DB ตรง และห้ามเรียก `setSegmentMode` จากแผ่น
- ขีดจำกัด: โน้ต ≤ `ARRIVE_NOTE_MAX` = 500 ตัวหลัง trim, เวลา integer 0..`ARRIVE_DURATION_MAX` = 2880 (`lib/legs.ts`) — แปลงด้วย `parseArrive` (`lib/api/arrive-input.ts`)
- ล้างโน้ต/เวลา = ส่ง `note:null`/`durationMin:null` ใน PUT เดียวกัน ห้ามส่ง `arrive:null` (จะล้าง `start_mode`)
- พฤติกรรม REST API เดิมไม่เปลี่ยน ยกเว้น `PATCH /hotels/:id` ที่ค่า mode ผิดได้ 400
- โหมดมี 3 ค่า `drive | walk | transit` ไม่มี "ตามค่าเริ่มต้นของวัน" ในแผ่น
- e2e เฉพาะที่เกี่ยวข้อง (`--grep`) บน 1–2 project (`owner-phone` + `desktop`) build ครั้งเดียว ถ้า port 3210 ไม่ว่างใช้ 3211 + `E2E_BASE_URL`
- typecheck (`pnpm tsc --noEmit`) หลังแก้ครั้งสุดท้ายของทุก task

## Review Focus

1. **แผนเปลี่ยนระหว่างแผ่นเปิดอยู่** (อีกแท็บย้าย/ลบจุด) → บันทึกต้องไม่เขียนทับช่วงผิด แผ่นค้างพร้อมข้อความ "แผนของวันนี้เปลี่ยนไปแล้ว…" และข้อความที่พิมพ์ยังอยู่ — Task 1 (integration) + Task 4 (action map)
2. **ช่วง `gap` (ไม่มีแถว segment, เช่น วันที่ import มา)** → เปิดแผ่นได้ ค่าเริ่มต้น `day.defaultMode ?? 'drive'` บันทึกแล้วมีแถว — Task 1 + Task 3
3. **Back บนแผนที่เต็มจอของมือถือขณะแผ่นเปิด** → Back แรกปิดแผ่น (แก้ไว้ → ถามก่อน) Back ที่สองปิดแผนที่ — Task 5 (unit ของ helper) + Task 8 (e2e)
4. **คนดูอย่างเดียว** → เปิดแผ่นได้จากรายการและแผนที่ ไม่มีช่องแก้/ปุ่มบันทึก — Task 5 (unit `legSheetFields`) + Task 8 (e2e ที่ skip เมื่อแก้ได้ เพราะ fixture คนดูไม่มี)
5. **ล้างโน้ตของขาเช้า** → `start_note` เป็น null แต่ `start_mode` ยังอยู่ (ไม่กลับไปตามโรงแรม) — Task 1

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `app/src/lib/services/leg-service.ts` (แก้) | precondition `LegPrecondition` ใน `applyPlaceArrive`/`setPlaceArrive` |
| `app/src/lib/api/hotel-link.ts` (แก้) | validate `arrivalMode`/`departureMode` ใน `patchHotel` |
| `app/src/lib/leg-info.ts` (ใหม่) | `LegInfo` type + `buildLegInfos` (pure) |
| `app/src/lib/day-augment.ts` (แก้) | `buildMapLegs` ใส่ `info`; `MapLeg.info` ใน `map-helpers.ts` |
| `app/src/lib/services/leg-save.ts` (ใหม่) | `saveLeg(userId, input, txDb?)` แกนของ action (ทดสอบ integration ได้) |
| `app/src/app/actions/legs.ts` (ใหม่) | `saveLegAction` → `ActionResult` |
| `app/src/components/leg-sheet.tsx` + `.module.css` (ใหม่) | แผ่น (form/readonly) |
| `app/src/components/leg-sheet-context.tsx` (ใหม่) | `LegSheetProvider`, `useLegSheet()`, host + Back |
| `app/src/lib/full-map-history.ts` (แก้) | `LEG_SHEET_KEY`, `isLegSheetEntry`, `legSheetBackAction` |
| `app/src/components/segment.tsx` + `itinerary-list.module.css` (แก้) | แถบบรรทัดเดียว (ปุ่มเปิดแผ่น + ลิงก์นำทาง) |
| `sortable-place-item.tsx`, `sortable-place-list.tsx`, `days-accordion.tsx`, `app/trip/[id]/page.tsx` (แก้) | ส่ง `leg` ลงไป ตัด plumbing ของ mode picker บนแถบ |
| `lib/map-route.ts`, `map-route-google.tsx`, `map-route-maplibre.tsx`, `real-map-canvas-*.tsx`, `map-renderer-props.ts`, `persistent-map.tsx` (แก้) | ส่ง `LegInfo` จากเส้น/ป้ายไปถึง `openLeg` |
| `app/src/app/trip/[id]/layout.tsx` (แก้) | ครอบด้วย `LegSheetProvider canEdit={canWrite(role)}` |
| `API.md`, `agent-skill/travel-planner-api/SKILL.md` (แก้) | เอกสาร `arrivalMode`/`departureMode` |
| `app/e2e/mobile-layout.spec.ts` (แก้) | ย้าย test เดิม + test ใหม่ |

---

### Task 1: precondition ของ `setPlaceArrive`

**Files:**
- Modify: `app/src/lib/services/leg-service.ts` (`applyPlaceArrive` ~l.258, `setPlaceArrive` ~l.290)
- Test: `app/src/lib/services/leg-service.integration.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type LegPrecondition = { dayId: string; at: 'start' } | { dayId: string; after: string };
  export async function setPlaceArrive(userId: string, placeId: string, arrive: ArriveInput | null, txDb?: typeof dbNode, expect?: LegPrecondition): Promise<{ tripId: string; arrive: ArriveView | null }>;
  ```
  ไม่ผ่าน → `throw new ServiceError('conflict', 'leg_changed')` (ข้อความ `'leg_changed'` เป็น sentinel ที่ Task 4 จับ)
- **ทำไมต้องมี `dayId`:** `removePlace` ลบแถวจริง (`place-service.ts:298`) จุดที่ถูกลบจึงทำให้ `resolvePlaceWrite` โยน `forbidden` ก่อนถึงการตรวจ เมื่อส่ง `expect` มา ให้ตรวจสิทธิ์ที่ **วัน** แทน: `resolveDayWrite(userId, expect.dayId, tx)` → `lockDay(tx, dayId)` → `liveOrder(tx, dayId).indexOf(placeId)`; `-1` (ถูกลบหรือย้ายไปวันอื่น) หรือคู่ไม่ติดกัน → `conflict/leg_changed` แล้วค่อย `writeArrive` · ไม่ส่ง `expect` (API) → ทางเดิมทุกอย่าง (`resolvePlaceWrite` + `applyPlaceArrive`) · `readArriveView` และ audit ใช้เหมือนเดิม

- [ ] **Step 1: เขียน test ที่ล้ม** (ใน suite เดิม ใช้ `seedDay()` / `segRows` / `dayRow` / `txDb()` ที่มีอยู่; `s.a, s.b, s.c` = จุดลำดับ 0,1,2)
  - `it('precondition after: writes when the pair is still adjacent')` — `setPlaceArrive(USER, s.b, {mode:'walk',durationMin:5,note:'n'}, txDb(), { dayId: s.dayId, after: s.a })` สำเร็จ, `segRows[0]` = `{mode:'walk',note:'n',durationMin:5}`
  - `it('precondition after: rejects a non-adjacent pair and writes nothing')` — `{ dayId, after: s.a }` กับ `s.c` → `rejects.toMatchObject({ code: 'conflict', message: 'leg_changed' })` และ `segRows`/`dayRow` เท่าเดิม
  - `it('precondition at start: rejects when the place is no longer first')` — `s.b` + `{ dayId, at: 'start' }` → conflict; `s.a` + `{ dayId, at: 'start' }` สำเร็จ
  - `it('precondition: a removed destination counts as changed')` — `removePlace` ของ `s.b` แล้วบันทึก `s.b` + `{dayId, after: s.a}` → `rejects.toMatchObject({ code: 'conflict', message: 'leg_changed' })`
  - `it('precondition: a viewer is still forbidden')` — viewer (แบบ test เดิม l.333) + `expect` → `code: 'forbidden'`
  - `it('clearing the start leg note keeps start_mode')` — PUT `s.a` `{mode:'transit',durationMin:10,note:'x'}` แล้ว PUT `{mode:'transit',durationMin:null,note:null}` → `dayRow` = `{startMode:'transit', startNote:null, startDurationMin:null}`
  - `it('a gap leg (no segment row) is created on save')` — ลบแถว `segments` idx 1 ด้วย `database.delete` แล้ว `setPlaceArrive(USER, s.c, {mode:'drive',durationMin:null,note:'g'}, txDb(), {dayId, after: s.b})` → มีแถว idx 1 `note:'g'`
- [ ] **Step 2: รัน ให้ล้ม** — `cd app && TEST_DATABASE_URL=postgres://postgres:pw@127.0.0.1:55433/tp_test pnpm vitest run src/lib/services/leg-service.integration.test.ts` → FAIL (precondition ยังไม่มีผล) ถ้า DB ยังไม่ขึ้น: `docker start tp-test-pg` แล้ว `DATABASE_URL_UNPOOLED=postgres://postgres:pw@127.0.0.1:55433/tp_test pnpm db:migrate`
- [ ] **Step 3: implement** — ตามย่อหน้า "ทำไมต้องมี `dayId`": `{at:'start'}` ต้อง `position === 0`; `{after}` ต้อง `position > 0 && order[position-1] === after`; ไม่ผ่าน → throw ก่อน `writeArrive` (ทุกอย่างใน transaction เดียวกัน) · route ของ API ไม่แก้
- [ ] **Step 4: รันให้ผ่าน** ทั้งไฟล์ (test เดิมต้องผ่านด้วย)
- [ ] **Step 5: Commit** `feat(legs): optional adjacency precondition on setPlaceArrive [TP-0152]`

---

### Task 2: `PATCH /hotels/:id` validate mode + เอกสาร

**Files:**
- Modify: `app/src/lib/api/hotel-input.ts` (แยก loop `MODE_FIELDS` ใน `parseHotelFields` ~l.27 ออกเป็น `export function parseHotelModes(body): Partial<Record<'arrivalMode'|'departureMode', SegmentMode | null>>` แล้วให้ `parseHotelFields` เรียกใช้ — ข้อความ error เดิม `'"arrivalMode" must be one of: drive, walk, transit'` ต้องคงไว้, test เดิม `hotel-input.test.ts:36` ต้องผ่าน), `app/src/lib/api/hotel-link.ts` (`patchHotel` ~l.159 เรียก `parseHotelModes(body)` ต้นฟังก์ชัน)
- Test: `app/src/lib/api/hotel-link.test.ts` (`describe('patchHotel')` ~l.146)
- Modify: `API.md`, `agent-skill/travel-planner-api/SKILL.md`

**Interfaces:** ไม่มี (ภายใน)

- [ ] **Step 1: test ที่ล้ม** — ใช้ helper เดิมของ describe (`loadHotel`, `update`, `mkBudget()`, `deps(null)`):
  - `it('rejects an unknown arrivalMode / departureMode with bad_request')` — `{ arrivalMode: 'boat' }` และ `{ departureMode: 5 }` → `rejects.toMatchObject({ code: 'bad_request' })`, `update` ไม่ถูกเรียก
  - `it('accepts a valid mode and null')` — `{ arrivalMode: 'walk' }`, `{ departureMode: null }` → `update` ได้ค่านั้น
- [ ] **Step 2: รันให้ล้ม** — `cd app && pnpm vitest run src/lib/api/hotel-link.test.ts`
- [ ] **Step 3: implement** — `parseHotelModes` ตามที่ระบุใน Files (`null` ผ่าน = ล้างค่า) และเรียกใน `patchHotel`
- [ ] **Step 4: รันให้ผ่าน**
- [ ] **Step 5: เอกสาร** — ใน `API.md` ส่วน hotels และใน SKILL.md ส่วน PATCH hotel: `arrivalMode` = วิธีเดินทางของขาสุดท้ายของวันเข้าโรงแรมนี้, `departureMode` = ขาออกจากโรงแรม (ใช้กับทุกคืนที่พัก), ค่า `drive|walk|transit|null`, null = ใช้ `defaultMode` ของวัน · ใน SKILL.md ส่วน legs/arrive เพิ่มหนึ่งบรรทัด: "ขาเข้า/ออกโรงแรมแก้ที่ `PATCH /hotels/:id` ไม่ใช่ `arrive`"
- [ ] **Step 6: Commit** `fix(api): validate hotel arrival/departure mode; document them [TP-0152]`

---

### Task 3: `LegInfo` ตัวระบุช่วง (ใช้ร่วมรายการ + แผนที่)

**Files:**
- Create: `app/src/lib/leg-info.ts`, `app/src/lib/leg-info.test.ts`
- Modify: `app/src/lib/map-helpers.ts` (`MapLeg` เพิ่ม `info: LegInfo`), `app/src/lib/day-augment.ts` (`buildMapLegs`, `buildMapDays`), `app/src/app/trip/[id]/page.tsx` (`AugmentedSeg` + `augmentDayWithHotels`)
- Modify (test ที่สร้าง `MapLeg` เอง ต้องใส่ `info` ไม่งั้น `tsc` พัง): `app/src/lib/map-carousel.test.ts` (~l.39, 62), `app/src/lib/day-augment.test.ts` (~l.198–199, 233), `app/src/lib/map-route.test.ts` — ใช้ helper `fakeLegInfo(over?)` ใน `app/src/lib/leg-info.test-helpers.ts` (ใหม่)

**Interfaces:**
- Consumes: `dayLegs`, `DayLeg`, `DisplayPlace` (`day-augment.ts`), `legSlot` (`map-route.ts`)
- Produces:
  ```ts
  // เฉพาะที่แผ่นใช้: ชื่อสำหรับหัว + ฟิลด์ที่ gmapsDirectionsUrl / missingLocation อ่าน
  export type LegEnd = { name: string; lat: number | null; lng: number | null; address: string | null; placeIdExternal: string | null };
  export type LegInfo = {
    key: string;               // `${dayId}:${fromId}>${toId}` — unique per trip
    kind: 'segment' | 'start' | 'gap' | 'hotel';
    dayId: string;
    dayNum: number;            // วันที่ที่แสดง (1-based, day.num)
    fromId: string; toId: string;   // display ids (hotel = `hotel-<id>-begin|end`)
    fromNum: number; toNum: number; // ลำดับในรายการ (display position + 1)
    from: LegEnd; to: LegEnd;
    mode: Mode;                // gap → defaultMode ?? 'drive'
    note: string | null;       // hotel → null
    durationMin: number | null;// hotel → null
    slot: number | null;       // legSlot(i, from, to)
    // เป้าหมายการบันทึก
    placeId: string | null;    // segment/start/gap: id ของจุดปลายทางจริง; hotel: null
    after: string | null;      // segment/gap: id จุดต้นทางจริง; start: null (= {at:'start'})
    hotelId: string | null; hotelLeg: 'arrival' | 'departure' | null;
  };
  export function buildLegInfos(
    day: { id: string; num: number; defaultMode: Mode | null },
    places: DisplayPlace[],
    legs: DayLeg[],
  ): LegInfo[]; // length = places.length - 1 (หรือ 0)
  ```
  - `AugmentedSeg` ใน `page.tsx` ได้ฟิลด์ `leg: LegInfo` เพิ่ม (ส่งต่อไปยัง `SegmentData.leg` แบบ optional ใน task นี้) **แต่ใน task นี้ยังไม่เปลี่ยนอย่างอื่น**: ช่วง `null` ยังเป็น null และ `setModeAction` ยังอยู่ เพราะตัวเลือกบนแถบยังใช้จนถึง Task 6 (ถ้าลบตอนนี้ ขาเช้า/โรงแรมจะตกไปเรียก `setSegmentModeAction(dayId, i)` ด้วยตำแหน่งที่นับรวมโรงแรม = เขียนแถวผิด) — ทุก commit ต้องใช้งานได้
  - `MapLeg` = `{ from, to, mode, slot, info: LegInfo }` (ช่วง gap บนแผนที่: `mode` ของ `MapLeg` ยังเป็น `legs[i]?.mode ?? null` เหมือนเดิม — ไม่วาดป้ายสำหรับ gap)

- [ ] **Step 1: test ที่ล้ม** `leg-info.test.ts` — fixture: วันที่มีโรงแรมเริ่มวัน H1, จุด A,B,C, โรงแรมปลายวัน H2, segment idx0 มีแถว (note `'n'`, durationMin 40), idx1 ไม่มีแถว, `defaultMode:'walk'`, `startNote:'s'`
  - `it('maps every dayLegs outcome to a LegInfo')` — kinds = `['start','segment','gap','hotel']`; start: `placeId:A, after:null, hotelId:H1, note:'s'`; segment: `placeId:B, after:A, note:'n', durationMin:40`; gap: `placeId:C, after:B, mode:'walk', note:null`; hotel: `hotelId:H2, hotelLeg:'arrival', placeId:null, note:null`
  - `it('numbers from/to by display position and keys by day + ids')` — `fromNum/toNum` = 1/2, 2/3…; `key` = `${dayId}:${fromId}>${toId}`
  - `it('an empty day with a hotel departure only yields one hotel leg')` — begin H1 + end H2 ไม่มีจุด → `[{kind:'hotel', hotelLeg:'departure'}]`
  - `it('slot is null when legSlot is null')` — ช่วงที่ปลายใดปลายหนึ่งไม่มีพิกัดตามกฎ `legSlot`
- [ ] **Step 2: รันให้ล้ม** — `cd app && pnpm vitest run src/lib/leg-info.test.ts`
- [ ] **Step 3: implement `buildLegInfos`** แล้วต่อ: `buildMapLegs(places, legs, infos)` ใส่ `info: infos[i]`; `buildMapDays` เรียก `buildLegInfos({id:d.id,num:d.num,defaultMode:d.defaultMode}, places, dl)` ครั้งเดียวต่อวัน; `augmentDayWithHotels` ใช้ `buildLegInfos` เดียวกัน (ต้องรับ `num` เพิ่ม) แล้วใส่ `leg` ให้ seg ที่ไม่เป็น null
- [ ] **Step 4: รัน** `pnpm vitest run src/lib` (test เดิมของ `buildMapLegs`/`day-augment` ต้องผ่าน — ปรับ expected ให้มี `info` ด้วย `expect.objectContaining` ถ้าจำเป็น) + `pnpm tsc --noEmit`
- [ ] **Step 5: Commit** `feat(legs): LegInfo descriptor shared by list and map [TP-0152]`

---

### Task 4: `saveLeg` + `saveLegAction`

**Files:**
- Create: `app/src/lib/services/leg-save.ts`, `app/src/lib/services/leg-save.integration.test.ts`, `app/src/app/actions/legs.ts`
- Modify: `app/src/messages/en.json`, `th.json`
- Modify: `app/src/lib/services/segment-service.ts` — `setHotelLegMode(userId, hotelId, leg, mode, exec: IdemExecutor = db)` ใช้ `exec` กับ select/update, `getTripRoleWith(…, exec)` และ `touchTrip(…, exec)` (แบบเดียวกับ `createHotel(…, exec = db)`) เพราะ `db` เป็น neon-http ที่ integration test (postgres-js) ส่งเข้าไปแทนไม่ได้

**Interfaces:**
- Consumes: `setPlaceArrive`, `LegPrecondition` (Task 1); `setHotelLegMode` (`segment-service.ts`); `parseArrive` (`lib/api/arrive-input.ts`)
- Produces:
  ```ts
  // leg-save.ts
  export type LegSaveInput =
    | { target: 'arrive'; dayId: string; placeId: string; after: string | null; mode: unknown; durationMin: unknown; note: unknown }
    | { target: 'hotel'; hotelId: string; leg: 'arrival' | 'departure'; mode: unknown };
  export async function saveLeg(userId: string, input: LegSaveInput, txDb?: typeof dbNode): Promise<{ tripId: string }>;
  // actions/legs.ts ('use server')
  export async function saveLegAction(input: LegSaveInput): Promise<ActionResult>;
  ```
  - arrive: `parseArrive({mode,durationMin,note})` → `setPlaceArrive(userId, placeId, arrive, txDb, after ? {dayId, after} : {dayId, at:'start'})`
  - hotel: mode ผ่าน `parseArrive({mode}).mode` (ให้ข้อความ error เดียวกัน) → `setHotelLegMode(…, txDb)`
  - action: `requireUserId()` → `saveLeg` → `revalidatePath(`/trip/${tripId}`)`; แปลง `ServiceError` เป็นข้อความภาษาผู้ใช้ (ห้ามส่งข้อความอังกฤษดิบของ service ไปที่แผ่น): `conflict`+`leg_changed` หรือ `not_found` → `t('leg_sheet_changed')`; `forbidden` → `t('err_forbidden_change')`; `bad_request` และอื่น ๆ → `t('leg_sheet_save_error')`; error ที่ไม่ใช่ `ServiceError` ผ่าน `toActionResult` (auth) หรือ throw ต่อ
- i18n (คีย์ใหม่ทั้งหมดของงานนี้ — Task 5/6/7 ใช้):
  | key | en | th |
  |---|---|---|
  | `leg_sheet_changed` | This day's plan has changed. Close and open it again. | แผนของวันนี้เปลี่ยนไปแล้ว ปิดแล้วเปิดใหม่ |
  | `leg_sheet_title` | {from} → {to} | {from} → {to} |
  | `leg_sheet_sub` | Stops {from} → {to} · Day {day} | ช่วงที่ {from} → {to} · วันที่ {day} |
  | `leg_sheet_mode` | How you travel | วิธีเดินทาง |
  | `leg_sheet_duration` | Travel time (min) | เวลาเดินทางโดยประมาณ (นาที) |
  | `leg_sheet_note` | Travel note | โน้ตการเดินทาง |
  | `leg_sheet_note_placeholder` | Platform, ticket, where to buy… | ชานชาลา ตั๋ว ที่ซื้อตั๋ว… |
  | `leg_sheet_hotel_hint` | Applies to every night at this hotel | ใช้กับทุกวันที่พักที่นี่ |
  | `leg_sheet_no_note` | No note | ยังไม่มีโน้ต |
  | `leg_sheet_save_error` | Couldn't save this leg | บันทึกช่วงเดินทางไม่สำเร็จ |
  | `leg_sheet_discard_title` / `_body` / `_confirm` | Discard changes? / Your edits to this leg will be lost. / Discard | ทิ้งการแก้ไข? / สิ่งที่แก้ในช่วงนี้จะหายไป / ทิ้ง |
  | `leg_open_aria` | Travel details: {from} to {to} | รายละเอียดการเดินทาง: {from} ไป {to} |
  | `map_leg_go` (แก้ค่าเดิม) | Travel to {name}: details | ทางไป {name}: ดูรายละเอียด |

- [ ] **Step 1: integration test ที่ล้ม** `leg-save.integration.test.ts` (โครง seed แบบ `leg-service.integration.test.ts`)
  - `it('web save and API PUT give the same rows')` — วัน X: `saveLeg(USER,{target:'arrive',placeId:b,after:a,mode:'transit',durationMin:40,note:' rapi:t '})`; วัน Y (seed เหมือนกัน): `setPlaceArrive(USER, b', parseArrive({mode:'transit',durationMin:40,note:' rapi:t '}))` → แถว segment ของสองวันเท่ากัน (`{mode:'transit',note:'rapi:t',durationMin:40}`)
  - `it('hotel leg sets the hotel mode for every night')` — โรงแรม 2 คืน ครอบ 2 วันที่มีจุด → `saveLeg({target:'hotel',hotelId,leg:'arrival',mode:'walk'}, txDb())` → อ่านโรงแรมกลับมาแล้ว `dayLegs` ของทั้งสองวัน: ขา `hotel/arrival` ได้ `mode:'walk'` ทั้งคู่
  - `it('rejects bad input with bad_request')` — `durationMin: 2881`, `note: 'x'.repeat(501)`, `mode: 'boat'`
  - `it('a removed destination is leg_changed, not forbidden')` — ลบจุดปลายทางแล้ว `saveLeg` → `{code:'conflict', message:'leg_changed'}`
- [ ] **Step 2: รันให้ล้ม** (คำสั่งเดียวกับ Task 1 เปลี่ยนไฟล์)
- [ ] **Step 3: implement** `saveLeg`, `saveLegAction`, คีย์ i18n
- [ ] **Step 4: รันให้ผ่าน** + `pnpm vitest run src/messages src/lib/i18n` (parity) + `pnpm tsc --noEmit`
- [ ] **Step 5: Commit** `feat(legs): saveLegAction over the API's leg services [TP-0152]`

---

### Task 5: `LegSheet` + provider/host + Back บนแผนที่เต็มจอ

**Files:**
- Create: `app/src/components/leg-sheet.tsx`, `leg-sheet.module.css`, `leg-sheet-context.tsx`
- Modify: `app/src/lib/full-map-history.ts` (+ test `full-map-history.test.ts`), `app/src/app/trip/[id]/layout.tsx`

**Interfaces:**
- Consumes: `LegInfo` (Task 3), `saveLegAction` (Task 4), `Modal`, `Segmented`, `Button` (`components/ui`), `ConfirmDialog`, `useMapPreview()` (`fullMap`), `useIsWide()`, `gmapsDirectionsUrl`/`travelMode` (`lib/gmaps`), `legStyle(slot)`
- Produces:
  ```ts
  // leg-sheet-context.tsx
  export function LegSheetProvider(props: { canEdit: boolean; children: React.ReactNode }): JSX.Element;
  export function useLegSheet(): { openLeg: (info: LegInfo, origin: 'list' | 'map') => void };
  // full-map-history.ts
  export const LEG_SHEET_KEY = 'tpLegSheet';
  export function isLegSheetEntry(state: unknown): boolean;
  // leg-sheet.tsx — ตัดสินว่าแผ่นแสดงอะไร (pure, unit-test ได้; ใช้แทน e2e คนดูที่ fixture ไม่มี)
  export type LegSheetFields = { editable: boolean; showDuration: boolean; showNote: boolean; showHotelHint: boolean; showNavigate: boolean };
  export function legSheetFields(info: LegInfo, readOnly: boolean): LegSheetFields;
  // readOnly → editable:false; kind 'hotel' → showDuration/showNote:false, showHotelHint:true (เฉพาะ editable);
  // showNavigate = missingLocation(info.from, info.to, null) == null  (gmapsDirectionsUrl ไม่เคยคืน null)
  // ฟอร์ม → payload (pure): durationText '' → null; ไม่ใช่จำนวนเต็ม 0..2880 → error ที่ client (ไม่ส่ง)
  export function parseDurationField(text: string): { ok: true; value: number | null } | { ok: false };
  ```
- พฤติกรรม `LegSheet` (props `{ info: LegInfo; readOnly: boolean; onClose: () => void; registerDirty?: … }` — โครงภายในผู้สร้างเลือก):
  - `Modal size="sm"` title = `leg_sheet_title`; บรรทัดรอง `leg_sheet_sub` (`fromNum/toNum/dayNum`); แถบสี/ไอคอนตาม `legStyle(slot)` หรือสีกลางเมื่อ `slot==null`
  - แก้ได้: `Segmented` 3 โหมด (`ariaLabel` = `leg_sheet_mode`, label จาก `itin_mode_*`), `<input type="number" min=0 max=2880 step=1 inputMode="numeric">` (ว่าง = null), `<textarea maxLength={500}>`; ขา hotel ซ่อนเวลา/โน้ตและแสดง `leg_sheet_hotel_hint`
  - ปุ่ม: ลิงก์ "นำทาง" (`itin_segment_navigate`, `target=_blank`) ใช้ **โหมดที่เลือกอยู่ในแผ่น**; แสดงตาม `showNavigate` · `Button` "บันทึก" (`save`) **ปิดไว้จนกว่าจะมีอะไรเปลี่ยน** (กันการตรึง `start_mode`/`arrivalMode` โดยไม่ตั้งใจ)
  - บันทึก: ตรวจเวลาด้วย `parseDurationField` ก่อน (ไม่ผ่าน → ข้อความใต้ช่อง ไม่ส่ง) → `saveLegAction` ใน `try/catch` (แบบ `place-note-modal.tsx:45–51`: throw → `logActionFailure` + `leg_sheet_save_error`) → `ok` ปิดแผ่น; `!ok` แสดง `message` ในแผ่น ไม่ปิด ค่าในช่องคงอยู่
  - ปิด (✕/Esc/scrim/Back) เมื่อค่าต่างจากตอนเปิด → `ConfirmDialog` (`leg_sheet_discard_*`)
  - อ่านอย่างเดียว: แสดงชื่อโหมด เวลา (`itin_segment_duration_approx` เมื่อ > 0) โน้ต (หรือ `leg_sheet_no_note`) + นำทาง ไม่มี form
- Host/Back:
  - `openLeg(info, 'map')` เมื่อ `fullMap && !isWide` → `history.pushState({ ...history.state, [LEG_SHEET_KEY]: 1 }, '')` (ไม่ส่ง URL — แบบเดียวกับ `map-preview-context.tsx` ~l.108 ที่ spread state เพื่อคง `__NA`) แล้วจำว่า "เป็นเจ้าของ entry"
  - `popstate` ขณะเป็นเจ้าของและแผ่นเปิด: ไม่ dirty → ปิดแผ่น; dirty → push entry กลับแล้วเปิด `ConfirmDialog` (ทิ้ง → ปิด + `history.back()`)
  - ปิดด้วยทางอื่นขณะเป็นเจ้าของ → `history.back()` (pop entry ของตัวเอง; `map-preview-context` จะเห็น landed state ที่มี `FULLMAP_KEY` → ไม่ปิดแผนที่ ตาม `closeAction`)
  - ปิดแผ่นเองเมื่อ `info.key` ไม่อยู่ในข้อมูลใหม่หลัง revalidate **ไม่ทำ** (แผ่นถือ snapshot; การตรวจทำตอนบันทึก)
- layout: `<MapPreviewProvider><LegSheetProvider canEdit={canWrite(role)}> …TripRail, children, PersistentMap… </LegSheetProvider></MapPreviewProvider>`

- [ ] **Step 1: unit test ที่ล้ม**
  - `full-map-history.test.ts`: `it('isLegSheetEntry reads only its own tag')` — `{tpLegSheet:1}` → true; `{tpFullMap:1}` → false; `null` → false
  - `full-map-history.test.ts` (กันถดถอย ผ่านอยู่แล้ว ไม่ใช่ RED): `it('closeAction keeps the map open when Back pops a leg-sheet entry')` — `closeAction({ landedState:{tpFullMap:1}, owns:true, lastMapHref:'/trip/x?day=1', currentHref:'/trip/x?day=1' })` → `{close:false, syncTo:null}`
  - `leg-sheet.test.ts`: `it('read-only shows no editable fields')` — `legSheetFields(segInfo, true).editable === false`; `it('hotel legs edit mode only, with the every-night hint')` — `legSheetFields(hotelInfo, false)` = `{editable:true, showDuration:false, showNote:false, showHotelHint:true, showNavigate:true}`; `it('no navigate when an end has no location')` — `from.lat/lng/address/placeIdExternal` เป็น null → `showNavigate:false`; `it('parseDurationField')` — `''`→`{ok:true,value:null}`, `'40'`→40, `'0'`→0, `'2880'`→2880, `'2881'`/`'-1'`/`'1.5'`/`'abc'`→`{ok:false}`
- [ ] **Step 2: รันให้ล้ม** — `cd app && pnpm vitest run src/lib/full-map-history.test.ts src/components/leg-sheet.test.ts`
- [ ] **Step 3: implement** helper, `LegSheet`, provider/host, layout
- [ ] **Step 4: รัน** unit + `pnpm vitest run src/components` (raw-color guard, dialog-guard) + `pnpm tsc --noEmit`
- [ ] **Step 5: Commit** `feat(legs): LegSheet with list/map host and full-map Back [TP-0152]`

---

### Task 6: แถบในรายการ (แบบ A)

**Files:**
- Modify: `app/src/components/segment.tsx`, `itinerary-list.module.css`, `sortable-place-item.tsx` (`SegmentData`, `SortableItem` ~l.307, `StaticItem` ~l.417), `sortable-place-list.tsx`, `days-accordion.tsx`, `app/src/app/trip/[id]/page.tsx`, `app/src/app/actions/segments.ts`
- Delete (ถ้า grep ยืนยันว่าไม่มีผู้ใช้แล้ว): `components/segment-mode-picker.tsx`, `setSegmentModeAction`, `setHotelLegModeAction`, `setDayStartModeAction` (ไม่ลบ service ที่อยู่ข้างหลัง และไม่แตะ `setDayDefaultModeAction`)
- Test: `app/src/lib/segment-label.test.ts` (ใหม่)

**Interfaces:**
- Consumes: `LegInfo`, `useLegSheet()`
- Produces:
  ```ts
  // lib/segment-label.ts — กฎแสดงเวลา (pure)
  export function segmentTimeText(time: string, durationMin: number | null | undefined, approx: (d: string) => string): string;
  // SegmentData เพิ่ม leg: LegInfo, ลบ setModeAction; Segment props เพิ่ม leg: LegInfo, disabled?: boolean, ลบ dayId/idx/setModeAction
  ```
- กฎ: `durationMin > 0` → `approx(formatDurationMin(durationMin))`; ไม่งั้น `time`; ไม่งั้น `''` (`0` ไม่แสดง)
- โครงแถบ: `<div class=segment>` = `<button type="button" aria-describedby={id ของข้อความซ่อน leg_open_aria} onClick={() => openLeg(leg,'list')} disabled={disabled || !matches}>` (ข้อความที่มองเห็น = ชื่อที่อ่านได้ของปุ่ม ตาม WCAG 2.5.3: ไอคอนโหมด+ชื่อโหมด · ระยะ (คงไว้ตามแถบเดิม) · เวลา · ไอคอนโน้ตเมื่อมี `note` พร้อมข้อความซ่อน "มีโน้ต" — ไอคอนใช้ `--note-*`) + `<a>` นำทางพี่น้องกัน (ไม่ซ้อนใน button) ปุ่ม ≥ 44px (`tp-hit`)
- `matches` = `leg.fromId === from.id && leg.toId === to.id` — ลำดับในเครื่อง (`places` ที่จัดไว้ก่อน) อาจไม่ตรงกับ `segments` ของ server หลัง reorder ล้มเหลวหรือก่อน props ใหม่มา ไม่ตรง → ปิดปุ่ม (ไม่เปิดแผ่นของช่วงอื่น)
- ช่วง `null` เดิมกลายเป็น seg สังเคราะห์ `{ id:`seg-gap-${dayId}-${i}`, mode: leg.mode, distance:'', time:'', leg }` ใน `augmentDayWithHotels` (ตอนนี้แถบไม่มีตัวเลือกแล้ว จึงปลอดภัย) และลบ `setModeAction` ออกจาก `AugmentedSeg`/`SegmentData` พร้อมกันใน task นี้
- ชิป "ไม่มีตำแหน่ง": ตัวชิปเป็นปุ่มเปิดแผ่นแบบเดียวกัน ลิงก์ "แก้ตำแหน่ง" เป็นพี่น้อง ไม่มีนำทาง
- ปุ่มขยายโน้ตในที่ (`segNote`, `aria-expanded`) ถูกลบ
- `disabled`: `SortableItem` ได้ `pendingMoveId !== null` จาก list; `StaticItem` ได้ `canEdit` (คนแก้ได้ก่อน hydrate เปิดไม่ได้; คนดูเปิดได้)
- `readOnly` ของแผ่นมาจาก provider (`!canEdit`) ไม่ใช่จากแถบ

- [ ] **Step 1: test ที่ล้ม** `segment-label.test.ts`:
  - `it('durationMin wins over time')` — `('1 hr', 40, f)` → `f('40 min')` (ใช้ `formatDurationMin(40)` ใน expected)
  - `it('falls back to time, and hides 0')` — `('1 hr', null)` → `'1 hr'`; `('', 0)` → `''`; `('1 hr', 0)` → `'1 hr'`
- [ ] **Step 2: รันให้ล้ม**
- [ ] **Step 3: implement** `segmentTimeText`, แถบใหม่, ส่ง `leg`/`disabled` ลงไป, ลบ plumbing ที่ไม่ใช้, CSS ใช้ token
- [ ] **Step 4: รัน** `pnpm vitest run` (ทั้ง unit) + `pnpm tsc --noEmit` + `pnpm lint`
- [ ] **Step 5: Commit** `feat(legs): one-line leg bar opens the leg sheet [TP-0152]`

---

### Task 7: แตะเส้น/ป้ายบนแผนที่แล้วเปิดแผ่น

**Files:**
- Modify: `app/src/lib/map-route.ts` (`RouteArc` เพิ่ม `info: LegInfo`; `routeArcs` คัดลอกจาก `leg.info`), `components/map-route-google.tsx`, `map-route-maplibre.tsx`, `real-map-canvas-google.tsx`, `real-map-canvas-maplibre.tsx`, `map-renderer-props.ts`, `persistent-map.tsx`
- Test: `app/src/lib/map-route.test.ts` (มีอยู่แล้ว — เพิ่ม case)

**Interfaces:**
- Consumes: `MapLeg.info` (Task 3), `useLegSheet()` (Task 5)
- Produces: `onLegSelect?: (info: LegInfo) => void` (แทน `(placeId: string)`); renderer `onSelect: (arc: RouteArc) => void`; `export function arcByKey(arcs: RouteArc[], key: unknown): RouteArc | null` ใน `map-route.ts` — MapLibre คลิก layer อ่าน `properties.key` แล้วเรียก `arcByKey` (`legsGeoJSON` คง `to` ไว้เพื่อ e2e/`data-leg-to`)
- `persistent-map.tsx` `selectLeg(info)`: `if (activePlaceId !== info.toId) activate(info.toId)` (เหมือนเดิม) **แล้ว** `openLeg(info, 'map')` — ลำดับนี้สำคัญ: `activate` บนแผนที่เต็มจอใช้ `replace` ก่อน แล้ว sheet ค่อย push entry ของตัวเอง

- [ ] **Step 1: test ที่ล้ม** ใน `map-route.test.ts`: `it('routeArcs carries each leg info')` — `routeArcs(pins, legs)[0].info` `toBe` `legs[0].info`; `it('arcByKey finds an arc and ignores junk')` — key ที่มี → arc นั้น; key ที่ไม่มี / `undefined` / `42` → `null` (ทางนี้คือทางเดียวที่ตรวจ MapLibre เพราะ e2e รันกับ Google)
- [ ] **Step 2: รันให้ล้ม** — `pnpm vitest run src/lib/map-route.test.ts`
- [ ] **Step 3: implement** ทั้งสอง renderer + persistent-map
- [ ] **Step 4: รัน** unit + `pnpm tsc --noEmit`
- [ ] **Step 5: Commit** `feat(map): tapping a leg opens its leg sheet [TP-0152]`

---

### Task 8: e2e — ย้าย test เดิม + test ใหม่

**Files:** `app/e2e/mobile-layout.spec.ts`

ตรวจแล้วว่า test ไหนแตะตัวเลือกบนแถบจริง (ตัวเลือกแรก `[role="group"]…first()` ในวันคือ **ตัวเลือกโหมดของวัน** ซึ่งไม่ย้าย):

| test (บรรทัดบน `88f0e31`) | สิ่งที่ใช้ | ทำอะไร |
|---|---|---|
| helper `legsOf` ~1852, `noteGaps` ~1877 | `[role=group]` บนแถบ, `button[aria-expanded]` | `legsOf` อ่านจาก `button[aria-label]` ของแถบ: `mode` (จากข้อความโหมด), `hint`, `hasNote` (มีไอคอนโน้ต) · โน้ต/โหมดเต็มอ่านจากแผ่น (helper ใหม่ `openSheet(page, dayId, fromId)` คืน locator ของ dialog) · `noteGaps` **ลบ** |
| TP-0141 l.1924 "every leg keeps its mode picker and hint" | picker บนแถบ | เขียนใหม่: ทุกช่วงยังมีแถบ (ปุ่ม) และ hint หลัง reorder/remove; เปิดแผ่นช่วงหนึ่งแล้ว `Segmented` มีค่าเดิม |
| TP-0141 l.1957 "a leg note shows on its leg and follows its pair" | `button[aria-expanded]` | เขียนใหม่: ตามด้วย `hasNote` + โน้ตในแผ่นของคู่เดิม |
| TP-0141 l.1982 "hotel-to-first-stop mode changes only that day" | picker บนแถบ (`pressed`) | เขียนใหม่ผ่านแผ่น (เลือกโหมด → บันทึก) |
| TP-0141 l.2005 "a long leg note stays one line" | โน้ตขยายในที่ | **ลบ** (ไม่มีโน้ตบนแถบแล้ว) แทนด้วย: แถบสูงไม่เกิน 1 บรรทัด (`height ≤ 56`) แม้โน้ตยาว |
| TP-0150 l.2061, l.2081 กรอบแตะโน้ตกับนำทาง | `noteGaps` | **ลบ** แทนด้วย: กรอบ `.tp-hit` ของปุ่มแถบกับลิงก์นำทางไม่ซ้อนกัน (`boundingBox` สองตัวไม่ทับ) |
| fresh data l.2382 "a segment mode change reaches the list and the map" | picker `.last()` ของวัน (ช่วง) | เขียนใหม่: เปลี่ยนโหมดผ่านแผ่น เส้น/ลิงก์นำทางบนแผนที่เปลี่ยนตาม ไม่ reload |
| C0 l.2175, l.2233, fresh l.2351, l.2483, l.2511 | ตัวเลือกโหมดของวัน (`.first()` + alertdialog) | **คงไว้** รันยืนยันเท่านั้น (scenario "บันทึกพร้อมกันสองวัน" คงอยู่) |
| map L2 l.2940 "a second tap keeps it" | แตะป้ายสองครั้ง | ปรับ: แตะแรก → เลือกปลายทาง **และ** แผ่นเปิด (`role=dialog` ชื่อ `{from} → {to}`); ปิดแผ่น (✕); แตะที่สอง → ยังเลือกอยู่ และแผ่นเปิดอีกครั้ง (คาดไว้) แล้วปิดก่อนจบ |
| map L3 l.2953 แตะเส้น | แตะเส้น | เพิ่ม assert แผ่นเปิด แล้วปิดก่อนจบ |

test ใหม่ (describe เดียวกับ TP-0141 ใช้ `legsTrip` fixture):
- `TP-0152: edit a leg note from the list; the bar shows the note icon` — เปิดแถบ → พิมพ์โน้ต + เวลา 40 → บันทึก → แถบมีไอคอนโน้ตและ `~40m` (`formatDurationMin(40)` = `"40m"`); อ่านผ่าน API: `arrive.note` ตรง
- `TP-0152: an edited sheet asks before discarding` — แก้แล้วกด ✕ → `alertdialog`; ยกเลิก → ค่ายังอยู่
- `TP-0152: a stale sheet does not overwrite another leg` — REST ไม่มี reorder (`API.md:402`) จึงทำสองกรณี: (ก) เปิดแผ่นช่วง A→B แล้วเปิด page ที่สองใน context เดียวกัน ย้ายจุดด้วย helper `moveDown` (~l.1904) กลับมาหน้าแรกบันทึก; (ข) เปิดแผ่นแล้ว `DELETE /api/v1/places/:B` บันทึก → ทั้งสองกรณี: ข้อความ `leg_sheet_changed`, แผ่นยังเปิด, ข้อความที่พิมพ์ยังอยู่, ข้อมูลใน API ของช่วงอื่นไม่เปลี่ยน
- `TP-0152: phone full map — tap a leg opens the sheet; Back closes the sheet, then the map` (phone เท่านั้น)
- `TP-0152: phone full map — save from the sheet keeps the map` (phone) — แตะเส้น → เปลี่ยนโหมด → บันทึก → แผ่นปิด แผนที่ยังเปิด ป้ายเปลี่ยนโหมด → Back ครั้งเดียวปิดแผนที่ → reload แล้วไม่มีแผ่นค้าง (ครอบจังหวะ router refresh กับ `history.back()`)
- **คนดูอย่างเดียว:** e2e รันด้วย `AUTH_BYPASS` ผู้ใช้คนเดียวและ API เพิ่มสมาชิกไม่ได้ จึงครอบด้วย unit `legSheetFields` (Task 5) + e2e `TP-0152: read-only sheet` ที่ `test.skip` เมื่อผู้ใช้แก้ได้ แบบเดียวกับ `C3 viewer` (~l.2851)

- [ ] **Step 1: เขียน/แก้ test ตามตาราง**
- [ ] **Step 2: build + รันเฉพาะส่วน** — `cd app && pnpm build && AUTH_BYPASS=true MAPS_PROVIDER=google E2E_BASE_URL=http://localhost:3211 pnpm e2e:mobile --project=owner-phone --project=desktop --grep "TP-0141|TP-0150|TP-0152|C0 revalidation|fresh data|two days saving|one tap during a save|L2:|L3:"` → ผ่านทั้งหมด (ถ้าต้อง start server เอง: `AUTH_BYPASS=true MAPS_PROVIDER=google PORT=3211 pnpm start` เบื้องหลัง — ตรวจตัวแปรที่ `playwright.config.ts` ต้องการก่อน)
- [ ] **Step 3: Commit** `test(e2e): leg sheet replaces the bar picker and inline note [TP-0152]`

---

## หลังจบทุก task

- `pnpm tsc --noEmit`, `pnpm lint`, `pnpm vitest run`, integration (leg-service, leg-save) ผ่าน
- push ด้วย `GIT_SSH_COMMAND='ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes'`, เปิด PR (body ลงท้าย `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), link PR ผ่าน t3-code, ย้ายการ์ด TP-0152 ไป review — **merge รอผู้ใช้อนุมัติ**

## บันทึกการแก้ตาม /scrutinize รอบ 1

รายงาน: `2026-11-05-leg-detail-sheet.scrutiny.md` — แก้ครบทุกข้อ: M1 (precondition มี `dayId` ตรวจสิทธิ์ที่วัน จุดที่ถูกลบ = `leg_changed`), M2 (e2e แผ่นค้างใช้ `moveDown` และ `DELETE`), M3 (`setHotelLegMode` รับ `exec`), M4 (`legSheetFields` unit + e2e skip แบบ C3), M5 (ลบ `setModeAction`/เปลี่ยนช่วง null ย้ายไป Task 6), m1 (`showNavigate` จาก `missingLocation`), m2 (`matches`), m3 (e2e บันทึกบนแผนที่เต็มจอ), m4 (test ที่สร้าง `MapLeg`), m5 (`~40m`), m6 (`AUTH_BYPASS`), m7 (แปลง error เป็นข้อความผู้ใช้ + ตรวจที่ client + try/catch), m8 (ข้อยกเว้น `legStyle`), m9 (`arcByKey`), Task 2 ใช้ `parseHotelModes` ร่วมกับ `parseHotelFields`, n1 (ไม่ใช่ RED), n2 (`aria-describedby`), n3 (คงระยะทางตามแถบเดิม), n4 (L2 แผ่นเปิดซ้ำ), n5 (ตรวจ `dayLegs` ทั้งสองคืน), n6 (ปุ่มบันทึกปิดจนกว่าจะแก้) · n7 ไม่แก้ (payload รับได้ `LegEnd` เก็บเท่าที่ใช้แล้ว)

## บันทึกการแก้ตาม /scrutinize รอบ 2 (verdict: ship — ข้อผูกพันของผู้ลงมือ)

1. `missingLocation` ต้องการ `id`: เรียกด้วย `{ ...info.from, id: info.fromId }` / `{ ...info.to, id: info.toId }` (Task 5)
2. `saveLeg` ส่งให้ `setHotelLegMode` เป็น `txDb ? afterCommit(txDb) : undefined` (`afterCommit` จาก `leg-service.ts`) (Task 4)
3. `legSheetFields` + `parseDurationField` อยู่ใน `app/src/lib/leg-sheet-fields.ts` (+ `leg-sheet-fields.test.ts`) ไม่ใช่ใน `leg-sheet.tsx` (Task 5)
4. seg สังเคราะห์ของช่วง gap ใส่ `dayId` และ `idx: i` ให้ตรง type ของ `AugmentedSeg` / `SegmentData` ใน `days-accordion.tsx` (Task 6)
5. วันถูกลบระหว่างแผ่นเปิด → `forbidden` (แสดง `err_forbidden_change`) — รับได้ เกิดยาก ไม่แก้
6. ปุ่มบันทึกปิดจนกว่าจะแก้ ดังนั้นช่วง gap ที่ไม่แก้อะไรจะไม่สร้างแถว — ตั้งใจ (การแสดงผลเท่าเดิม)
