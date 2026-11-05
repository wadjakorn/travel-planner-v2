# /scrutinize — แผนลงมือ แผ่นช่วงเดินทาง (TP-0152)

ตรวจ: `docs/superpowers/plans/2026-11-05-leg-detail-sheet.md` เทียบกับ spec (`2026-11-05-leg-detail-sheet-design.md`, §7 เป็นข้อบังคับ) และโค้ดจริงใน worktree บน `88f0e31` · ไม่ได้ตรวจการตัดสินใจของ spec ซ้ำ

**Verdict: fix-then-ship** — โครงของแผนถูกต้องและทำตามได้ แต่ข้อ "จุดปลายทางถูกลบ = แผนเปลี่ยน" (Review Focus #1) ไม่เป็นจริงในโค้ดตอนนี้ และ test 3 ตัว (integration ของโรงแรม, e2e แผ่นค้าง, e2e คนดูอย่างเดียว) เขียนตามที่แผนบอกไม่ได้

---

## 1. เป้าหมายและทางที่ง่ายกว่า

เป้าหมาย: ตัวระบุช่วง (`LegInfo`) สร้างที่ server ครั้งเดียว ส่งให้ทั้งรายการและแผนที่ แล้วมีแผ่นตัวเดียวที่บันทึกผ่าน service เดียวกับ API

ทางที่ง่ายกว่าที่พิจารณาแล้ว:
- **สร้าง `LegInfo` ที่ client** จาก places/segments (รายการ) และ pins/legs (แผนที่): ไม่ดีกว่า เพราะแผนที่ไม่มีจุดที่ไม่มีพิกัด และต้องเขียนตรรกะของ `dayLegs` ซ้ำสองที่ ทำที่ server ครั้งเดียวถูกแล้ว
- **Task 2 สร้างตัวตรวจ mode ใหม่:** มีอยู่แล้ว — `parseHotelFields` (`lib/api/hotel-input.ts:27,68–75`) ตรวจ `arrivalMode`/`departureMode` ให้ POST/import ควรแยกเป็น helper (เช่น `readHotelMode(body, key)`) แล้วใช้ใน `patchHotel` ข้อความ error จะได้ตรงกับของ POST (แผนเติม ", or null" ทำให้สองข้อความไม่ตรงกัน)

นอกจากนี้ไม่มีทางที่เล็กกว่าที่ยังได้ทุกอย่างตาม spec

---

## 2. Findings

### Major

**M1. จุดปลายทางที่ถูกลบได้ `forbidden` ไม่ใช่ `not_found`/`conflict` → test ของ Task 1 ล้ม และแผ่นแสดงคำว่า "Forbidden"**
- *หลักฐาน:* `removePlace` **ลบแถวจริง** (`place-service.ts:298` `tx.delete(places)`) ไม่ได้ soft-delete จากนั้น `setPlaceArrive` → `resolvePlaceWrite` (`access.ts:80–91`) join `places`/`days` ไม่เจอแถว → `throw new ServiceError('forbidden', 'Forbidden')` **ก่อน** ไปถึง `placeDay`/precondition
- *ผล:* test `'precondition: a removed destination counts as changed'` (assert `['conflict','not_found']`) ล้ม · ใน Task 4 action ไม่ได้แปลง `forbidden` → `toActionResult` คืน `actionError('Forbidden')` (ภาษาอังกฤษดิบ เพราะ `AUTH_MESSAGES` ใช้กับ `Error` ธรรมดาเท่านั้น ไม่ใช้กับ `ServiceError`) จึงขัดกับ §7.3 ที่บอกว่า "จุดปลายทางถูกลบไปแล้วก็นับเป็นแผนเปลี่ยน"
- *แก้:* ให้ precondition มี `dayId` ด้วย (`LegInfo.dayId` มีอยู่แล้ว): `{ dayId, at:'start' } | { dayId, after }` เมื่อส่ง `expect` มา `setPlaceArrive` ตรวจสิทธิ์ด้วย `resolveDayWrite(userId, expect.dayId, tx)` (วันยังอยู่แม้จุดถูกลบ) แล้ว `lockDay(dayId)` + `liveOrder(dayId).indexOf(placeId)`; ถ้าได้ `-1` หรือคู่ไม่ติดกัน → `conflict/leg_changed` วิธีนี้ไม่บอกใครว่าจุดนี้มีอยู่หรือไม่ (ตรวจสิทธิ์ที่วันก่อนเสมอ) แล้วเปลี่ยน test เป็น `toMatchObject({code:'conflict'})` อย่างเดียว ส่วน API ที่ไม่ส่ง precondition ยังทำงานแบบเดิม

**M2. e2e "แผ่นค้าง" ใช้ API ที่ไม่มี: REST ไม่มี reorder**
- *หลักฐาน:* `API.md:402` "place/day reordering is not exposed"; `api/v1/places/[placeId]/route.ts` มีแค่ PATCH (ฟิลด์ของจุด) และ DELETE; `days/[dayId]/places` มีแค่ POST
- *ผล:* ขั้น "ย้ายจุดผ่าน API (`PATCH` reorder)" ใน Task 8 ทำไม่ได้ ถ้าคนลงมือเปลี่ยนไปใช้ DELETE ก็จะเจอ M1 พอดี
- *แก้:* (ก) เปิด page ที่สองใน context เดียวกัน แล้วย้ายจุดด้วย `moveDown` ที่มีอยู่แล้ว (`mobile-layout.spec.ts:1904`) หรือ (ข) ลบจุดด้วย `DELETE /places/:id` หลังแก้ M1 แล้ว — ทำทั้งสองแบบได้ยิ่งดี เพราะจะครอบทั้ง "คู่ไม่ติดกัน" และ "จุดถูกลบ"

**M3. integration test ขาโรงแรมของ Task 4 รันไม่ได้: `setHotelLegMode` ใช้ client ของ neon โดยตรง**
- *หลักฐาน:* `segment-service.ts:62–90` ใช้ `db` (neon-http, `db/index.ts:23`) และ `getTripRole`/`touchTrip` ที่ใช้ค่าเริ่มต้นเป็น `db` ส่ง client อื่นเข้าไปไม่ได้ ส่วน suite integration ใช้ postgres-js กับ docker ที่เครื่อง (`TEST_DATABASE_URL`) ซึ่ง neon-http (fetch ผ่าน HTTPS) ต่อไม่ได้ · `saveLeg(userId, input, txDb?)` ส่ง `txDb` ต่อให้ `setHotelLegMode` ไม่ได้
- *แก้:* เพิ่ม `exec: IdemExecutor = db` ให้ `setHotelLegMode` (ใช้กับ `getTripRoleWith(…, exec)`, `touchTrip(…, exec)` และ update) ตามแบบ `createHotel(…, exec = db)` แล้วให้ `saveLeg` ส่ง `txDb` ต่อ ใส่ไฟล์นี้ในรายการ Files ของ Task 4

**M4. e2e คนดูอย่างเดียว (§7.12) ไม่มี fixture และวิธีสำรองที่แผนเขียนไว้ทำไม่ได้**
- *หลักฐาน:* e2e รันด้วย `AUTH_BYPASS` เป็นผู้ใช้คนเดียว (`playwright.config.ts:3–7`) · test ของคนดูที่มีอยู่ (`C3 viewer`, l.2851) แค่ `test.skip` เมื่อผู้ใช้แก้ได้ · `API.md` "Invites/memberships are not writable via the API" → "เพิ่มสมาชิก viewer ผ่าน API" ทำไม่ได้
- *แก้:* เลือกทางหนึ่งแล้วเขียนลงแผน: (ก) ทำให้ readOnly ตัดสินใจด้วยฟังก์ชัน pure (`legSheetMode(canEdit, kind)` → ฟิลด์ที่แสดง) แล้วเขียน unit test ให้ฟังก์ชันนั้น + e2e ที่ skip แบบ C3 หรือ (ข) e2e seed membership ด้วย SQL ตรง (ต้องมี DB URL ใน e2e ซึ่งตอนนี้ไม่มี) อย่าปล่อยไว้ว่า "ถ้าไม่มี…"

**M5. Task 3 ลบ `setModeAction` ออกจาก `AugmentedSeg` แต่ตัวเลือกบนแถบยังทำงานจนถึง Task 6 → commit ระหว่างนั้นเขียนแถวผิด**
- *หลักฐาน:* `sortable-place-item.tsx:318–321` ใช้ `idx={segment.idx ?? segmentIdx}` และ `setModeAction={segment.setModeAction ?? setSegmentModeAction}` · ขา start/hotel สังเคราะห์มี `idx: i` เป็น **ตำแหน่งที่แสดง (นับรวมโรงแรมด้วย)** (`page.tsx:189–209`) ถ้าไม่มี `setModeAction` ก็จะตกไปใช้ `setSegmentModeAction(dayId, i)` → `upsertSegment` เขียนแถว `segments.idx = i` ซึ่งเป็นคนละขา และช่วง gap สังเคราะห์ที่เพิ่งไม่เป็น null ก็จะมีตัวเลือกด้วย
- *แก้:* ย้าย "ฟิลด์ `setModeAction` ถูกลบ" ไปอยู่ใน Task 6 (ที่แถบเลิกใช้ตัวเลือกแล้ว) หรือรวม Task 3 กับ Task 6 สำหรับ `page.tsx` · ทุก commit ต้องทำงานได้จริง (bisect, รัน e2e ระหว่าง task)

### Minor

**m1. แผ่นจะไม่ซ่อนปุ่มนำทางเลย:** `gmapsDirectionsUrl` คืน `string` เสมอ (`gmaps.ts:41–45` อย่างน้อยก็ `'#'`) ไม่เคยคืน null แต่ §7.4 บอกให้ซ่อนนำทางเมื่อไม่มีตำแหน่ง → ใช้ `missingLocation(info.from, info.to, null)` (`segment-fix.ts:18`) เป็นเงื่อนไขซ่อน เหมือนที่แถบทำ

**m2. `LegInfo` ตามตำแหน่งกับลำดับในเครื่องไม่ตรงกันได้:** `sortable-place-list.tsx:223/261` ส่ง `segments[i]` (ลำดับของ server) คู่กับ `places[i]` (state ที่จัดลำดับไว้ก่อนในเครื่อง) ถ้า reorder ล้มเหลว (toast l.205) `places` จะค้างอยู่ในลำดับที่จัดไว้ แต่ `segments` กลับเป็นของ server → แถบระหว่าง X–Y จะเปิดแผ่น "A → B" ข้อมูลไม่เสีย (precondition กันไว้) แต่ผู้ใช้จะงง · *แก้:* เปิดแผ่นได้เฉพาะเมื่อ `leg.fromId === place.id && leg.toId === nextPlace?.id` ไม่ตรงก็ `disabled` แค่บรรทัดเดียว และครอบช่วงที่ `pendingMoveId` เป็น null ไปแล้วแต่ props ยังไม่มาด้วย

**m3. ไม่มี e2e ที่บันทึกจากแผ่นบนแผนที่เต็มจอ:** ตอนบันทึก router ของ Next จะ refresh (navigation ที่ `preserveCustomHistoryState:false`, `segment-cache/navigation.js:382`) ซึ่งเขียน state ของ entry ปัจจุบันใหม่โดยไม่มี tag ของเรา แล้วแผ่นก็ `history.back()` ทันที ลำดับว่า commit ของ router จะลงที่ entry ไหน (entry ของแผ่น หรือ entry ของแผนที่ที่จะเสีย `tpFullMap`) ขึ้นอยู่กับเวลา · *แก้:* เพิ่ม e2e (phone): แตะเส้น → เปลี่ยนโหมด → บันทึก → แผ่นปิด แผนที่ยังเปิด ป้ายเปลี่ยน แล้ว Back ครั้งเดียวปิดแผนที่ (และ reload แล้วแผนที่ยังเปิดอยู่)

**m4. tsc จะพังใน test ที่สร้าง `MapLeg` เอง:** `map-carousel.test.ts:39,62`, `day-augment.test.ts:198–199,233`, `map-route.test.ts` สร้าง `MapLeg` โดยไม่มี `info` แต่ `tsc --noEmit` ตรวจไฟล์ test ด้วย → ใส่ไฟล์เหล่านี้ใน Files ของ Task 3 (หรือทำให้ `info` เป็น optional บน `MapLeg` แล้วให้ `routeArcs` ข้าม arc ที่ไม่มี info)

**m5. ค่าที่ e2e คาดผิด:** `formatDurationMin(40)` = `"40m"` (`units.ts:37`) ดังนั้นแถบจะแสดง `"~40m"` ไม่ใช่ `"~40 min"`

**m6. คำสั่งเปิด server ใน Task 8 ขาด `AUTH_BYPASS=true`** (`playwright.config.ts:5`) ถ้าไม่ใส่ ทุก test จะล้มตั้งแต่ขั้น sign-in

**m7. ข้อความ error ภาษาอังกฤษดิบในแผ่นภาษาไทย:** `bad_request` จาก `parseArrive` (`'"arrive.durationMin" must be…'`) ผ่าน `toActionResult` ไปตรง ๆ ส่วนคีย์ `leg_sheet_save_error` ประกาศไว้แต่แผนไม่ได้ใช้ที่ไหน · *แก้:* ให้แผ่นตรวจที่ client (จำนวนเต็ม 0–2880 แปลง string ของ `<input type=number>` เป็น number/null ก่อนส่ง) และ action แปลง `bad_request`/`forbidden` → `leg_sheet_save_error`/`err_forbidden_change` ส่วนแผ่นต้อง `try/catch` กรณีที่ action throw (เครือข่าย) เหมือน `place-note-modal.tsx:45–51`

**m8. ข้อห้าม inline style ขัดกับ `legStyle(slot)`:** `legStyle` คืน `CSSProperties` (`map-route.ts:48`) ซึ่งต้องใช้ผ่าน `style=` ทางเดียว · *แก้:* เขียนในแผนให้ชัดว่า `style={legStyle(slot)}` (ตั้งแค่ custom property) ใช้ได้ ที่ห้ามคือ style ของ layout/สี แบบ `place-note-modal`

**m9. MapLibre ไม่มี e2e:** e2e รันด้วย `MAPS_PROVIDER=google` ส่วนที่หา arc ด้วย `properties.key` ใน `real-map-canvas-maplibre.tsx:142–145` จึงมีแค่ typecheck ตรวจ → แยกเป็นฟังก์ชัน pure `arcByKey(arcs, key)` แล้วเขียน unit test ใน `map-route.test.ts`

### Nit

- **n1.** Task 5 Step 1: test `closeAction(... tpFullMap ...)` → `{close:false}` ผ่านอยู่แล้วตอนนี้ จึงไม่ใช่ test ที่ "ล้มก่อน" (มีแค่ `isLegSheetEntry` ที่ล้ม) — ถือเป็น test กันถดถอยก็ได้ แต่อย่าเขียนว่าเป็น RED
- **n2.** `aria-label={leg_open_aria}` ทับข้อความที่มองเห็น ("Walk · ~40m") — WCAG 2.5.3 (label-in-name) ให้ใช้ `aria-describedby` หรือใส่ชื่อโหมดไว้ใน label ด้วย
- **n3.** แถบในแผนมี "ระยะ" แต่ §3.1 ไม่ได้ระบุ (ถ้าจะเก็บไว้ให้เขียนว่าตั้งใจ)
- **n4.** L2 ที่ปรับใหม่: แตะครั้งที่สองจะเปิดแผ่นอีก (มี scrim) test ต้องคาดไว้และปิดก่อนจบ
- **n5.** test "hotel leg … every night" ตรวจแค่คอลัมน์เดียว ซึ่งจริงอยู่แล้วตามนิยาม ควรตรวจ `dayLegs` ของทั้งสองคืนว่าได้ `walk`
- **n6.** ขาโรงแรม/ขาเช้า: กดบันทึกโดยไม่แก้อะไร ค่าก็จะถูกตรึง (`arrivalMode` หรือ `start_mode`) ซึ่ง spec ยอมรับไว้แล้ว แต่ปิดปุ่มบันทึกเมื่อไม่มีอะไรแก้ทำได้ง่ายและลดผลข้างเคียงนี้
- **n7.** `LegEnd` (ชื่อ/ที่อยู่/พิกัด) ถูกส่งซ้ำทั้งใน payload ของ page และ layout ประมาณ 2 × (จำนวนขา) object — ยังรับได้ ควรเก็บเท่าที่แผ่นใช้

---

## 3. สิ่งที่ตรวจแล้วและถูกต้อง (เพื่อให้รู้ขอบเขตของการตรวจ)

- **Back บนแผนที่เต็มจอ กับ history ที่ Next patch ไว้:** `selectStop(..., 'replace')` ลบ `__NA` ออก แต่ `replaceState` ที่ Next patch ไว้จะคัดลอก `__NA`/tree กลับมาจาก state ปัจจุบัน (`app-router.js:84–95,271–277`) entry ของแผนที่จึงยังมี `__NA` แล้วแผ่นจึง push ทันที (`{...history.state, tpLegSheet:1}` มี `__NA` → ผ่านไปตรง ๆ) commit ของ ACTION_RESTORE ที่ตามมาเป็น traverse ที่ `preserveCustomHistoryState:true` (`navigation.js:413`) จึงไม่ลบ tag ออก · Back จาก entry ของแผ่นลงที่ entry ของแผนที่ซึ่งมี `tpFullMap` → `closeAction` = ไม่ปิด (`full-map-history.ts:44`) ไม่มีการ reload (`onPopState` reload เฉพาะเมื่อไม่มี `__NA`) — ลำดับ "activate แล้ว push" ในแผนปลอดภัย
- entry ของแผ่นมี `tpFullMap:1` ติดมาด้วย (เพราะ spread) ทำให้ `retag` ไม่ทำงานผิด และ Back ครั้งที่สองปิดแผนที่ได้ตามที่ e2e คาด
- `Modal` วาด portal ที่ `z-index: var(--z-modal)` อยู่เหนือแผนที่เต็มจอ และ Esc ไปถึง overlay บนสุดก่อน (`modal.tsx`) · `dialog-guard` ไม่โดน เพราะใช้ `Modal`
- `onLegSelect` ทุกจุดที่เรียกใช้: `real-map-canvas-{google,maplibre}.tsx`, `map-route-{google,maplibre}.tsx`, `map-renderer-props.ts`, `persistent-map.tsx:108,190` — ตรงกับรายการไฟล์ใน Task 7 (pin picker ไม่ได้ใช้ legs)
- `SegmentModePicker` และ action ของ mode ทั้งสามตัว ไม่มีที่ใช้อื่นนอกจากเส้นทางที่แผนลบ (`setDayDefaultModeAction` อยู่ใน `day-header`) และ `days-accordion.tsx:48` มี `SegmentData` ของตัวเองซ้ำอีกชุด ซึ่งต้องแก้ด้วย (อยู่ในรายการไฟล์แล้ว)
- ตาราง e2e ของ Task 8: เลขบรรทัดตรงกับ `88f0e31` · test C0/fresh/two-days ใช้ `[role=group]…first()` = ตัวเลือกโหมดของวันจริง (l.2185, 2238, 2368, 2493, 2538) · `Segmented` ในแผ่นอยู่ใน portal นอก `[data-day-id]` จึงไม่ไปชนกับ selector เหล่านี้ · ลบ `segNote[aria-expanded]` แล้ว selector `button[aria-expanded="false"]` (หัววันที่ปิดอยู่) ยิ่งตรงขึ้น
- `writeArrive` สร้างแถวให้ช่วง gap และ `parseArrive` ใช้ขีดจำกัด 500/2880 ตรงกับแผน · `durationMin:null, note:null` ใน PUT ไม่แตะ `start_mode` (`leg-service.ts:209–217`)
- `dayLegs` → `LegInfo` (start/segment/gap/hotel, วันที่ไม่มีจุดได้ departure ตัวเดียว) ตรงกับ `day-augment.ts:127–169` · `revalidatePath('/trip/…')` ทำให้ทั้งรายการและแผนที่สดตามแบบเดียวกับ action ที่มีอยู่

---

## รอบ 2

ตรวจเฉพาะส่วน: (ก) finding ของรอบ 1 แก้แล้วจริงไหม (ข) ข้อความที่แก้ทำให้ task ขัดกันเองหรือเปล่า (signature, ลำดับ task, ทุก commit ยังใช้งานได้) ข้อไหนที่การแก้อ้างเรื่องใหม่เกี่ยวกับโค้ด ตรวจกับโค้ดจริงแล้ว

**Verdict: ship** — finding ของรอบ 1 แก้ครบทุกข้อ (n7 ไม่แก้ตามที่ให้เหตุผลไว้ ซึ่งรับได้) ข้อที่เหลือข้างล่างเป็น nit ระดับ typecheck/ตำแหน่งไฟล์ ผู้ลงมือแก้ได้ระหว่างทำ ไม่ต้องรอตรวจอีกรอบ

### (ก) ผลของแต่ละข้อ

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| M1 | แก้แล้ว | `resolveDayWrite(userId, dayId, exec)` มีอยู่จริง (`access.ts:58–72`): select `days` แล้ว `requireTripAccess(..., 'write', exec)` → viewer ได้ `forbidden` ส่วนจุดที่ถูกลบได้ `indexOf = -1` → `conflict` เพราะวันยังอยู่ จุดของทริปอื่นก็ได้ `-1` เหมือนกัน (เขียนข้ามทริปไม่ได้) · test viewer อ้าง l.333 ซึ่งมีอยู่จริง · `seedDay()` คืน `dayId` (l.98) |
| M2 | แก้แล้ว | `DELETE /api/v1/places/:id` มีจริง (`places/[placeId]/route.ts:36` → `removePlace`) · `moveDown(page, dayId, placeId, over)` (l.1904) เป็นฟังก์ชันที่อยู่ใน describe เดียวกับ test ใหม่ และ page ที่สองใน context เดียวกันใช้ cookie เดียวกัน · หน้าแรกไม่ได้ข้อมูลใหม่จึงยังถือ snapshot เก่า → เกิด conflict ตามที่ต้องการ |
| M3 | แก้แล้ว | `getTripRoleWith(tripId, userId, exec)` (`trip-access.ts:17`) และ `touchTrip(tripId, exec)` (`touch-trip.ts:10`) มีอยู่จริง · `writeAudit` ยังใช้ `db` แต่กลืน error เอง (แบบเดียวกับ `setPlaceArrive`) — ดู n2 เรื่อง type |
| M4 | แก้แล้ว (เท่าที่ทำได้) | C3 skip เมื่อมีปุ่ม `handle` บน `findTrip(page)` (l.2851–2855) · test ใหม่ต้องใช้ `findTrip` แบบเดียวกัน ไม่ใช่ `legsTrip` (`legsTrip` เป็นของผู้ใช้เอง จึง skip ทุกครั้ง) · ความครอบคลุมจริงมาจาก unit `legSheetFields` |
| M5 | แก้แล้ว | Task 3 คง `setModeAction` และช่วง null ไว้ · Task 6 ลบ/สังเคราะห์พร้อมกับตอนที่แถบเลิกใช้ตัวเลือก → ทุก commit ใช้งานได้ |
| m1 | แก้แล้ว | `showNavigate` มาจาก `missingLocation` — ดู n1 |
| m2 | แก้แล้ว | `matches` ใช้ display id ของ `from`/`to` ซึ่งตรงกับ `LegInfo.fromId/toId` (โรงแรม = `hotel-<id>-begin/end` ทั้งสองที่) |
| m3–m6, m8, m9 | แก้แล้ว | e2e บันทึกบนแผนที่, `fakeLegInfo` สำหรับ test ที่สร้าง `MapLeg`, `~40m`, `AUTH_BYPASS`, ข้อยกเว้น `legStyle`, `arcByKey` |
| m7 | แก้แล้ว | แปลง error เป็นข้อความภาษาผู้ใช้ทุก code + `parseDurationField` + try/catch |
| Task 2 (`parseHotelModes`) | แก้แล้ว | loop `MODE_FIELDS` อยู่ที่ `hotel-input.ts:68–75` ข้อความเดิมถูก assert ที่ `hotel-input.test.ts:36–38` · `patchHotel` spread `body` ไปที่ `patch` อยู่แล้ว ค่า `null` จึงไปถึง `update` · ใช้ `SegmentMode` จาก `services/access.ts:14` ได้ |
| n1–n6 | แก้แล้ว | — |

### (ข) ข้อขัดแย้ง/ข้อใหม่ (nit ทั้งหมด)

- **n1. `missingLocation` ต้องการ `id`:** `LocPlace` มี `id: string` เป็นฟิลด์บังคับ (`segment-fix.ts:3–10`) แต่ `LegEnd` ไม่มี → ต้องเรียก `missingLocation({ ...info.from, id: info.fromId }, { ...info.to, id: info.toId }, null)` ไม่งั้น tsc ไม่ผ่าน
- **n2. type ของ `exec` ใน `setHotelLegMode`:** `saveLeg` ถือ `txDb?: typeof dbNode` แต่ `setHotelLegMode` รับ `IdemExecutor` (`typeof db | NodeTx`, `idempotency.ts:23`) ซึ่ง `typeof dbNode` ใส่แทนกันไม่ได้ ใช้ `txDb ? afterCommit(txDb) : undefined` (`leg-service.ts:35`) แบบที่ `setPlaceArrive` ทำ
- **n3. ฟังก์ชัน pure ควรอยู่ใน `lib/`:** `legSheetFields`/`parseDurationField` อยู่ใน `leg-sheet.tsx` ซึ่ง import `saveLegAction` → `next/cache` + service + `Modal` ทำให้ `leg-sheet.test.ts` ต้องโหลดทั้งกราฟนี้ (ตอนนี้ยังโหลดได้เพราะ vitest ใส่ `DATABASE_URL` สำรองไว้และ CSS module import ได้ แต่เปราะ) ย้ายไป `lib/leg-sheet-fields.ts` + test ใน `lib/` แบบเดียวกับ `segment-label.ts`
- **n4. ช่วง gap สังเคราะห์ใน Task 6 ไม่มี `dayId`/`idx`:** แต่ `AugmentedSeg` (`page.tsx:154`) และ `SegmentData` ของ `days-accordion.tsx:48` ยังบังคับ `idx: number` → ตอนลบ `setModeAction` ให้ทำ `idx` เป็น optional หรือใส่ `idx: i`
- **n5. วันที่ถูกลบได้ข้อความผิด:** `deleteDay` ลบแถวจริง (`day-service.ts:154`) ถ้าแผ่นเปิดค้างอยู่บนวันที่ถูกลบ `resolveDayWrite` จะได้ `forbidden` → แผ่นแสดง `err_forbidden_change` ("ไม่มีสิทธิ์") แทน `leg_sheet_changed` เกิดได้ยาก ถ้าจะแก้: ในทางที่มี `expect` ให้ select วันก่อน ไม่มีวัน → `conflict/leg_changed`
- **n6. ปุ่มบันทึกที่ปิดไว้ กับช่วง gap:** §5 บอกว่าบันทึกช่วง null แล้วจะสร้างแถว แต่เมื่อปุ่มบันทึกปิดจนกว่าจะแก้ ผู้ใช้จะยืนยันโหมดเริ่มต้นตามที่แสดงโดยไม่แก้อะไรไม่ได้ ผลเสียคือไม่มีแถวเกิดขึ้น ซึ่งไม่มีผลต่อการแสดงผล (รับได้ แค่บันทึกไว้ให้รู้ว่าตั้งใจ)
