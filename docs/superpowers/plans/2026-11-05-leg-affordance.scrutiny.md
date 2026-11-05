# Scrutiny — แผน 2026-11-05-leg-affordance (TP-0152 รอบ 2)

ตรวจ: แผน `2026-11-05-leg-affordance.md` เทียบกับ spec §9, mockup `both.html` และโค้ดจริงใน branch `feat/tp-0152-leg-sheet` (worktree `travel-planner-v2-leg-sheet/app`) ไม่แตะการเลือก "รายการ C + แผนที่ C" ตรวจแค่ว่าแผนทำออกมาอย่างไร และรายละเอียดที่ผู้ออกแบบเพิ่มเข้ามา

**Verdict: fix-then-ship** — แนวทางถูก แต่ Task 3/4 ไม่ได้นับว่าการ์ดที่สูงขึ้นจะทำ helper/งบเรขาคณิตใน e2e พังกี่จุด และ threshold 1000 m กับเป้ากดของแถว "ทางมา" ขัดกับข้อ "ห้ามเกิด" ใน §9.3 เอง

## 1. เจตนา และทางที่ง่ายกว่า

เป้าหมาย: ทำให้ leg ดูกดได้ ทั้งในรายการ (แถบเป็นปุ่ม + บรรทัดโน้ต/ชวนเพิ่ม) และบนแผนที่ (ป้ายแคปซูลบนเส้น + แถว "ทางมา" บนการ์ด + halo เน้นเส้น) โดยใช้ `LegInfo`/`openLeg` ที่มีอยู่แล้ว

- รายการ C: แผนตรงกับ spec และเปลี่ยนน้อย (ไฟล์เดียว + pure fn) ไม่มีทางที่ง่ายกว่านี้
- แถว "ทางมา" ซ้อนความหมายกับ connector ที่อยู่ระหว่างการ์ด (`map-stop-carousel.tsx` เส้นสีของช่วง + ปุ่มนำทาง) แต่ connector ส่วนใหญ่อยู่นอกจอโดยตั้งใจ (`CONNECTOR_WIDTH` เผยให้เห็นแค่ปลาย) เลยใช้เป็นทางเข้าแผ่นไม่ได้ แถวบนการ์ดจึงสมเหตุสมผล
- ฝั่งแผนที่ทำให้ง่ายลงได้: `RouteArc` มี `info: LegInfo` อยู่แล้ว (`lib/map-route.ts` type `RouteArc`) ไม่ต้องเพิ่ม `durationMin`/`hasNote` และ `activePlaceId` ส่งถึง canvas ทั้งสองตัวอยู่แล้ว (`real-map-canvas-google.tsx:117`, `real-map-canvas-maplibre.tsx:90`) จึงไม่ต้องแก้ `persistent-map.tsx`/`map-renderer-props.ts` (ดูข้อ 11)

## 2. ข้อค้นพบ (เรียงตามความรุนแรง)

### B1 [Blocker] แถว "ทางมา" ที่เป็น `<button>` ตัวแรกในการ์ด ทำ helper `selectCard` และ e2e ของแถบการ์ดพังทั้งชุด
- **ข้อค้นพบ:** `e2e/mobile-layout.spec.ts:451` `selectCard` = `cards.nth(i).locator('button').first().tap()` และมีแบบเดียวกันที่ l.843, l.2546 · l.990 ใช้ `.locator('button').focus()` (strict mode → error เมื่อมี 2 ปุ่ม) · N5 วัด `card.querySelector('button .truncate')` (l.1024) ซึ่งจะไปจับแถว "ทางมา" ถ้าแถวนั้นใช้ `truncate`
- **ผลกระทบ:** เมื่อแถวบนอยู่ก่อนใน DOM การ "เลือกการ์ด" ทุกครั้งจะไปเปิดแผ่นแทน (ไม่ select ตาม design) test ที่ใช้ `selectCard` (T4, N5×5 ความกว้าง, T13, flow ต่าง ๆ) จะล้มหรือ timeout ที่ `aria-current`
- **หลักฐาน:** แผน Task 3 บอกแค่ "ตรวจ e2e เดิมที่วัดเรขาคณิต…ว่ายังผ่าน" และ Task 4 ไม่มีรายการนี้
- **แก้:** ใส่ `data-stop-select` บนปุ่มเลือกจุดเดิม (และ `data-stop-leg` บนแถวบน) แล้วเปลี่ยนตัวเลือกทั้ง 4 จุด + N5 `nameW` ให้ชี้ `[data-stop-select]` เขียนรายการนี้ลงใน Task 4

### M1 [Major] การ์ดสูงขึ้นประมาณ 32px กินงบความสูงที่ test ล็อกไว้โดยตั้งใจ ต้องให้ผู้ใช้ตัดสิน ไม่ใช่ให้ผู้ลงมือ "grep หาเอง"
- **ข้อค้นพบ:** ตอนนี้การ์ดสูง 54 (N5 `near(m.cardH, 54, 1)` l.1039) · งบความสูงของ stack I7 `expectStackHeight(info, card.top, 192, 'map')` l.677 ("the stack can't silently grow back") · ระยะ fit `MOBILE_FIT_BOTTOM = 162` (`lib/map-helpers.ts:136` คอมเมนต์ "134 tall") · `previewPadding` คาด bottom 162 (`lib/map-camera.test.ts:96`) · I8 "no pin under the controls"
- **ผลกระทบ:** การ์ด 54 → ~86 ทำให้ stack เกิน 192 แน่นอน ถ้าไม่ขยับ `MOBILE_FIT_BOTTOM` หมุดจะไปจมอยู่ใต้การ์ด (I8) พื้นที่แผนที่บนมือถือลดลงประมาณ 32px (stack ใหญ่ขึ้นราว 17%) ซึ่งเป็น trade-off เชิงผลิตภัณฑ์ ไม่ใช่เรื่องเทคนิคล้วน ๆ
- **แก้:** ระบุในแผนว่าจะแก้ค่าคงที่อะไรเป็นเท่าไร: `MOBILE_FIT_BOTTOM` 162→162+Δ, คอมเมนต์ 134→134+Δ, `map-camera.test.ts` 162→…, N5 cardH 54→54+Δ, I7 192→192+Δ (และ empty-day 190/204 ถ้ากระทบ) โดยที่ Δ = ความสูงจริงของแถว (ดู M2) แล้วขอผู้ใช้อนุมัติว่าพื้นที่แผนที่ที่เสียไป Δ px รับได้

### M2 [Major] แถว 32px + `tp-hit` จะแย่งการแตะส่วนบนของปุ่มเลือกจุด ซึ่ง §9.3 ห้ามไว้
- **ข้อค้นพบ:** `.tp-hit::after` ขยายเป็น 44×44 แบบกึ่งกลาง (`app/globals.css:453`) แถว 32px จึงยื่นลง 6px ไปทับปุ่มเลือกจุด และยื่นขึ้น 6px ซึ่งถูก `overflow-x:auto` ของ strip ตัดทิ้ง (strip มี `pt-2` อยู่แค่ 8px) ปุ่มเลือกจุดไม่ได้ positioned ส่วน `::after` positioned จึงวาดทับปุ่มเลือกจุดและชนะการแตะ
- **ผลกระทบ:** แตะขอบบนของส่วนชื่อจุดแล้วจะเปิดแผ่นแทนที่จะเลือก ตรงกับข้อ "ห้ามเกิด" ข้อ 2 ของ §9.3
- **แก้:** เลือกอย่างใดอย่างหนึ่งแล้วเขียนลงแผน: (ก) ให้แถวสูงจริง 44px ไม่ใช้ `tp-hit` (Δ ใน M1 = 44) หรือ (ข) แถว 36–40px ไม่ขยายเป้ากด และบันทึกข้อยกเว้นไว้ (การ์ดทั้งใบยังกดได้ 52px) · ไม่ว่าทางไหน ให้เพิ่ม e2e ที่แตะ `[data-stop-select]` ที่ y = top+4 แล้วต้องได้การ select ไม่ใช่ dialog

### M3 [Major] e2e "การ์ดสูงเท่ากันทุกใบ ±1px" ผ่านเสมอ เลยจับปัญหาที่ตั้งใจจับไม่ได้
- **ข้อค้นพบ:** `<ul>` ของ strip เป็น `flex` ที่มี `align-items: stretch` เป็นค่าเริ่มต้น (`map-stop-carousel.tsx` className ของ `ul`) การ์ดในวันเดียวกันจึงสูงเท่าใบที่สูงสุดอยู่แล้ว
- **ผลกระทบ:** ความเสี่ยงจริงคือความสูงเปลี่ยนไปตามวัน หรือตามว่ามีโน้ต/meta หรือไม่ (stack กระโดดตอนเปลี่ยนวัน, fit insets ไม่ตรง) แต่ test นี้ไม่ได้วัดเรื่องนั้น
- **แก้:** ให้ assert ความสูงสัมบูรณ์ของการ์ด = ค่าคงที่ (ค่าเดียวกับ N5) ในวันที่มีโน้ต วันที่ไม่มีโน้ต และวันที่มีจุดเดียว ("จุดแรกของวัน" อย่างเดียว) และวัด `strip.top` ว่าไม่ขยับหลังเปลี่ยนวัน

### M4 [Major] threshold 1000 m วัดเป็นเมตร แต่การทับกันเกิดในหน่วย pixel
- **ข้อค้นพบ:** แคปซูลเต็ม ("🚗 1h 20m ✎ ›") กว้างราว 80–95px ที่ day-fit ในเมือง (zoom 13–14, `FIT_MAX_ZOOM = 14`) ซึ่ง 1 km ≈ 65–130px บนจอ แคปซูลจึงคลุมเกือบทั้ง arc และฐานหมุดทั้งสองข้าง ในทางกลับกัน ตอนซูมเข้า ช่วง 600 m มีที่ว่างพอ แต่ยังได้แค่ไอคอน
- **ผลกระทบ:** ข้อ "ป้ายแคปซูลบังหมุด" ใน §9.3 ป้องกันได้แค่ด้วย z-order (หมุดอยู่บน) แต่ตัวเส้นกับป้ายของช่วงข้างเคียงยังทับกัน เหตุผลที่ว่า "ทดสอบได้" ใช้กับแบบที่วัดเป็น pixel ได้เหมือนกัน
- **แก้:** ทำ pure fn `badgeLabelled(chordMeters, zoom, lat, capsulePx)` (m/px = 156543·cos(lat)/2^zoom) ให้ unit test ได้ ส่ง zoom ที่ปัดเป็นจำนวนเต็มจาก `onZoomEnd`/`idle` (arc ต่อวันมีไม่กี่เส้น re-render จึงถูก) ถ้าไม่อยากทำ อย่างน้อยให้คำนวณ threshold จาก px ที่ `FIT_MAX_ZOOM` และเขียนเหตุผลของตัวเลขไว้ (ปัญหาเดียวกันมีอยู่แล้วกับ `ARC_BADGE_MIN_M = 300`)

### M5 [Major] "ปุ่ม disabled ไม่แสดง ＋ เพิ่ม…" ทำให้รายการของคนแก้ได้กระโดดตอน hydrate และตอนย้ายจุด
- **ข้อค้นพบ:** `StaticItem` ส่ง `disabled={canEdit}` (`sortable-place-item.tsx` ราว l.428: "An editor's static list is the pre-hydration paint") และ `Segment` ตั้ง disabled เมื่อ `!matches` ระหว่าง reorder แบบ optimistic (`segment.tsx`)
- **ผลกระทบ:** ทุกแถบของคนแก้ได้จะ paint ครั้งแรกโดยไม่มีบรรทัดที่สอง แล้วโตขึ้นหนึ่งบรรทัดหลัง hydrate (CLS, leg rail ขยับ, scroll jump) และกะพริบทุกครั้งที่ลากย้ายจุด
- **แก้:** ให้บรรทัดสองขึ้นกับ `canEdit` อย่างเดียว ตอน disabled ให้แสดงแบบจางหรือกดไม่ได้ ไม่ใช่ซ่อน · ปรับข้อความใน Task 1 Step 3 และ Review Focus ข้อ 4

### M6 [Major] รายการ e2e ฝั่งรายการที่ต้องแก้ยังไม่ครบ
- **ข้อค้นพบ:** นอกจาก `hasNote` (l.1888 ซึ่งใช้ที่ l.2012/2021/2076/2094/2096/2143/2151) ยังมี: l.2077 `expect(legs[i].text, 'the bar shows no note text').not.toContain(LONG_NOTE…)` ซึ่ง `text = bar.textContent` และตอนนี้รวมบรรทัดโน้ตแล้ว จึงขัดกับ design ใหม่ตรง ๆ · l.2081–2083 "one line ≤ 56" ของ `segOneLine > button` ซึ่งตอนนี้สูงสองบรรทัด · กรอบแตะ TP-0150 ราว l.2100–2120 (เรขาคณิต `tp-hit` ของปุ่มที่สูงขึ้น)
- **แก้:** Task 4 ต้องมีตาราง test ที่ต้องแก้: (ก) `hasNote` → มี `[data-leg-note]` (ใส่ data attr แทนการจับ class hash) (ข) l.2077 → กลับด้าน: บรรทัดโน้ตแสดงบรรทัดแรกและตัด … (ค) l.2083 → ความสูงของแถวแรกในปุ่มยังเป็นบรรทัดเดียว (ง) TP-0150 กรอบแตะยังไม่ทับแถวจุดถัดไป

### M7 [Major] `--grep` ที่ใช้รันไม่ครอบคลุม test ที่จะพัง
- **ข้อค้นพบ:** pattern `"TP-0152|TP-0141|TP-0150|L1:|L2:|L3:|L4:|carousel|T13|C0"` ไม่จับ N5, N6, T4, T6, I7/I8 (flow 7/8) ซึ่งเป็นตัวที่วัดการ์ดและ stack
- **แก้:** เพิ่ม `N4|N5|N6|T3|T4|T5|T6|flow 7|flow 8` (หรือ describe ของ full-map carousel ทั้งก้อน) เข้าไปใน grep

### M8 [Major] สีใน dark theme: ✎ บนแคปซูลกับสีของแถว "ทางมา" ใช้ token ผิดชุด
- **ข้อค้นพบ:** แคปซูลเป็นพื้นขาวแบบ light-locked (`--map-route-casing`) แต่แผนให้ ✎ ใช้ `--note-*` ซึ่งเปลี่ยนตามธีม (dark: `--note-fg #d4b44a`, `--note-soft` alpha 8%, `globals.css:188–189`) ผลคือเหลืองอ่อนบนขาว contrast ประมาณ 2:1 · กลับกัน การ์ดในแถบเป็น `bg-surface` (เปลี่ยนตามธีม) ถ้าแถว "ทางมา" ใช้ `mapLegStyle` (light-locked สีเข้ม เช่น `#1e40af`) บนพื้นมืด จะอ่านยาก
- **แก้:** เพิ่ม `--map-note-fg/soft/border` ที่ light-locked สำหรับแคปซูล (ให้ `map-tokens.test` ครอบด้วยถ้า mirror) · แถวบนการ์ดใช้ `legStyle(slot)` (เปลี่ยนตามธีม)

### m1 [Minor] รายละเอียด halo: z-order และวิธี filter
- Google: zIndex 3/4/5 ใช้กับ casing/line/hit ไปแล้ว ส่วน rides ใช้ 1–2 (`map-route-google.tsx`, `map-rides-google.tsx`) halo ต้องอยู่**ใต้ casing** (ถ้าอยู่บน casing จะกลืนขอบขาว) จึงต้องเลื่อนเลขเป็น halo 3 / casing 4 / line 5 / hit 6 และเขียนให้ชัด เพราะคำว่า "ใต้เส้นหลัก" ในแผนอ่านได้สองแบบ · `clickable={false}`
- MapLibre: feature มี `properties.to` อยู่แล้ว (`legsGeoJSON`) ให้ filter `['==', ['get','to'], activeToId ?? '']` แทนการใช้ `key` วาง `<Layer>` ก่อน `tp-route-casing` ใน Source เดียวกัน ใช้ `layout` (visibility) ตัวเดียวกัน และห้ามใส่ใน `interactiveLayerIds`

### m2 [Minor] "ตรวจ halo ผ่าน unit แทน" แต่ไม่มีอะไรให้ unit test
- halo ไม่มี pure function รองรับ ให้แยก `activeArcKey(arcs, activeToId)` ออกมา และใส่ `data-active` บน `RouteBadge` ของ arc ที่เลือก (badge เป็น DOM ในทั้งสอง renderer) แล้ว e2e บน Google ตรวจ attr นั้นได้จริง

### m3 [Minor] เพิ่ม field และแก้ไฟล์เกินจำเป็น
- `RouteArc.durationMin/hasNote` ซ้ำกับ `arc.info` ให้คำนวณ `labelled` อย่างเดียว · ไม่ต้องแก้ `persistent-map.tsx`/`map-renderer-props.ts` เพราะ canvas มี `activeId` อยู่แล้ว แค่ส่ง `activeToId={activeId}` ให้ `RouteLines*`

### m4 [Minor] payload RSC ของ `MapDay.legInfos`
- `MapLeg.info` (`day-augment.ts:186`) ซ้ำกับ `legInfos` ให้เรียก `buildLegInfos` **ครั้งเดียว** ต่อวัน แล้วใช้ instance เดียวกันทั้งสองที่ (Flight ของ React 19 dedupe แค่ object ที่อ้าง instance เดียวกัน ไม่ dedupe สำเนาที่ค่าเท่ากัน) หรือดีกว่านั้นคือเก็บไว้ที่เดียว (ลบ `MapLeg.info` แล้วเก็บ index ของช่วงแทน) · ตรวจขนาด payload ของหน้า trip ก่อน/หลัง

### m5 [Minor] copy และ i18n
- "＋" (full-width) ฝังอยู่ในข้อความแปล screen reader จะอ่านว่า "full-width plus sign" ให้ใช้ไอคอน `Plus aria-hidden` + ข้อความแทน
- `map_leg_from` = "From stop {n}": ถ้าต้นทางเป็นโรงแรม จะอ่านแปลก ๆ ว่า "From stop 1" และถ้าต้นทางไม่มีพิกัด จะไม่มีการ์ด/หมุดที่มีเลขนั้นในแถบ ลองพิจารณา "จาก {name}" (truncate) หรือใช้ `StopNumber` เล็กแทนเลขเปล่า
- mockup วางไอคอนโหมดไว้หน้าข้อความ ("🚗 ทางมาจาก 1 · 40น.") แต่แผนวางไว้หลัง ควรให้ตรงกัน · ลบ `leg_has_note` ออกจากทั้ง `en.json`/`th.json` พร้อมกัน (parity)

### m6 [Minor] เป้ากด ≥44px ของแคปซูลด้วย `::after`
- capsule ~26px ที่ขยายเป็น 44 ทุกแกนบนหลายป้าย จะกินพื้นที่แตะ POI/การลากแผนที่มากขึ้น ให้ขยายเฉพาะแนวตั้ง (ความกว้างของ capsule เกิน 44 อยู่แล้ว) และใช้ `pointer-events:none` ตอนไม่ interactive เหมือนเดิม

### n1 [Nit]
- Task 1 **Files** เขียนว่า "Create `segment-label.ts` (เพิ่มฟังก์ชันในไฟล์เดิม)" ที่ถูกคือ Modify

## 3. สิ่งที่ trace แล้วไม่พบปัญหา
- `legIntoCard` จับคู่ด้วย `toId` ได้ถูกต้อง: pin id ของโรงแรม (`hotel-<id>-begin|end`) ตรงกับ `LegInfo.toId` และช่วงที่ต้นทางไม่มีพิกัดยังอยู่ใน `buildLegInfos` (ส่วน `buildMapLegs` ทิ้งช่วงนั้นไป) จึงต้องใช้ `legInfos` จริง ข้อนี้แผนคิดถูกแล้ว
- `openLeg(info,'map')` จากการ์ด push history entry ของแผ่นตอนอยู่ใน full map (`leg-sheet-context.tsx:43`) ทำให้ Back ยังทำงานตาม §7 ข้อ 7
- การแตะเส้นหรือป้ายบนแผนที่ select ปลายทางก่อนเปิดแผ่น (`persistent-map.tsx:114`) halo จึงย้ายตามช่วงที่แตะ ส่วนแถวบนการ์ด (ซึ่งไม่ select) เป็นช่วงของจุดที่เลือกอยู่แล้ว ทั้งสองทางจึงสอดคล้องกัน

## รอบ 2 (re-review แผนฉบับแก้)

ขอบเขต: ดูว่า 16 ข้อเดิมแก้แล้วหรือยัง และการแก้สร้างข้อขัดแย้งหรือข้ออ้างผิดใหม่หรือไม่ (ตรวจกับโค้ดจริง) · M1 (แถวสูง 44px, แผนที่เสียราว 44px) ผู้ใช้ตัดสินแล้ว ไม่เปิดประเด็นนี้อีก

**Verdict: ship (หลังแก้ 3 จุดเล็กด้านล่าง)** — แก้ครบ 14 จาก 16 ข้อ ที่เหลือเป็นการชี้ตำแหน่งไม่ครบ ไม่มีปัญหาเชิงโครงสร้าง

### สถานะของข้อเดิม
| ข้อ | สถานะ | หมายเหตุ |
|---|---|---|
| B1 helper `button.first()` | แก้แล้ว | ตรวจบรรทัดแล้ว: l.451/843/990/2546 และ N5 `button .truncate` l.1024 ถูกต้อง |
| M1 งบความสูง | แก้แล้ว แต่ไม่ครบ | `MOBILE_FIT_BOTTOM` ถูก (`map-helpers.ts:136`, คอมเมนต์ "134 tall" l.132) · N5 l.1039 = 54 → 98 ถูก (border 1 + 44 + 52 + 1) · I7 l.677 = 192 → 236 ถูก · **`map-camera.test.ts` มีค่า 162 สองจุด** (ดู R1) · `previewPadding` 390×844: 370+206+120 = 696 ≤ 844 ยังไม่เป็น null, test l.98 (สูง 600 → null) ยังผ่าน |
| M2 `tp-hit` ทับปุ่ม | แก้แล้ว | สูงจริง 44px ไม่ขยาย hit area |
| M3 test ความสูงไม่มีความหมาย | แก้แล้ว | วัดค่าสัมบูรณ์ข้ามวัน + ตำแหน่ง top ของ carousel (อย่าใช้วันที่ไม่มีจุด เพราะตอนนั้นเป็น `<p>` ไม่ใช่การ์ด) |
| M4 threshold เป็นเมตร | แก้แล้ว | ตัวเลขใน test ตรวจแล้วถูก: 156543·cos35°/2¹³ ≈ 15.65 m/px → 1 km ≈ 64px (false), zoom 15 ≈ 256px (true) · วิธีอ่าน zoom ใช้ได้: Google มี `onIdle={(e)=>…e.map}` อยู่แล้ว (`real-map-canvas-google.tsx:165`, ระวัง `if (degraded) return` ข้างหน้า), MapLibre มี `report` บน `onLoad`/`onMoveEnd` (l.134–135) |
| M5 disabled → CLS | แก้แล้ว | |
| M6 รายการ e2e ฝั่งรายการ | แก้แล้ว | |
| M7 grep | **ยังไม่แก้** | ดู R2 |
| M8 token สี | แก้แล้ว | `legStyle` → `--leg-n` มีค่าของ dark (`globals.css:154–163`) · `--map-note-*` วางใน `:root` ข้าง `--map-pin-*` (l.116–135) ถูก และ dark block ไม่ redefine · ค่าสว่างที่จะคัดลอก: `--note-soft #fffbea`, `--note-fg #6b5400`, `--note-border #f6e7a8` (l.57–59) |
| m1 z-order halo | แก้แล้ว | ค่าตอนนี้ยืนยันแล้ว: casing 3 / line 4 / hit 5 (`map-route-google.tsx`), rides 1/2 · เลื่อนเป็น halo 3 / 4 / 5 / 6 ได้ ไม่ชนกับใคร (marker zIndex อยู่คนละ pane) · อย่าลืมแก้คอมเมนต์ "zIndex 3-5" ใน `map-route-google.tsx` ด้วย |
| m2 test ของ halo | แก้แล้ว | `activeArcKey` + `data-active` |
| m3 field ซ้ำ | แก้แล้ว | |
| m4 RSC | แก้แล้ว | `buildMapLegs` ใช้ `infos[i]` อยู่แล้ว instance จึงเดียวกันอัตโนมัติ ถ้าเรียก `buildLegInfos` ครั้งเดียว |
| m5 copy | แก้แล้ว เหลือนิดเดียว | มี `Plus` ใน `components/icons` (l.26) · ลำดับยังเป็นข้อความก่อนไอคอน (ดู R3) |
| m6 hit area ของแคปซูล | แก้แล้ว | |
| n1 | แก้แล้ว | |

### ข้อใหม่ / ข้อที่ยังไม่แก้

**R1 [Minor] `map-camera.test.ts` มี 162 สองจุด ไม่ใช่จุดเดียว** — นอกจาก l.96 (`previewPadding`) ยังมี l.82 `previewSafeArea(fitPadding(true))` → `{ …, bottom: 162 }` ต้องเปลี่ยนเป็น 206 ทั้งคู่ (test "POI mid-screen y=500 ไม่ขยับ" l.86 ยังผ่าน เพราะ 844−206 = 638 > 500)

**R2 [Major] pattern `--grep` ยังพลาด test ที่วัด stack** — I7/I8 เป็นแค่ข้อความใน assertion ไม่ใช่ชื่อ test จึงไม่จับอะไรเลย ตัวที่เรียก `expectStackHeight`/`expectMapStack` คือ **`flow 9: map stack invariants`** (l.675–677) และ **`flow 1`** (l.537) ส่วน `flow 7` (desktop itinerary) ไม่เกี่ยว · แก้เป็น `…|flow 1:|flow 8:|flow 9:|T3:|T4:|T5:|T6:|N5:|N6:|…` และตัด `I7|I8|flow 7` ออก ("carousel" ก็ไม่ตรงกับชื่อ test หรือ describe ใดเลย)

**R3 [Minor] แถว "ทางมาจาก {name}" ที่เป็นบรรทัดเดียว truncate จะตัดเวลาและโน้ตทิ้งเมื่อชื่อยาว** — ชื่อ (ซึ่งอาจยาวมาก) มาก่อน เวลาและโน้ตจึงหายเป็นอันดับแรก ให้ไอคอน + เวลาเป็น `shrink-0` และให้เฉพาะชื่อกับโน้ต truncate (เช่น `min-w-0` + `max-width` ของชื่อ) · ลำดับตาม mockup คือไอคอนโหมดก่อน: "🚗 ทางมาจาก … · 40น. ✎ … ›"

**R4 [Minor] state ของ zoom ใน canvas ทำให้ทั้ง canvas re-render ทุกครั้งที่ zoom ข้ามจำนวนเต็ม** — ไม่ผิด แต่เก็บ state ไว้ใน `RouteLines*` แทนได้ (Google: `useMap()` + `map.addListener('idle')`; MapLibre: `useMap()` + `map.on('zoomend')`) และกำหนดค่าเริ่มต้นเป็น `map.getZoom()` ตอน mount ไม่ใช่ `undefined` (ถ้าไม่กำหนด แคปซูลจะเป็นแบบย่อทั้งหมดจนกว่าจะเกิด event แรก) ทางใดก็ได้ แต่ต้องมีค่าเริ่มต้น

**R5 [Minor] e2e `data-active` ต้องใช้ fixture ที่ช่วงเข้าจุดที่เลือกมี badge จริง** (มี mode และยาว ≥ `ARC_BADGE_MIN_M` 300 m) ไม่งั้น `[data-active]` จะไม่มีอยู่ ไม่ใช่เพราะโค้ดผิด · และควรเพิ่ม test ใน `map-tokens.test.ts`: `--map-note-fg` บน `--map-note-soft` ≥ 4.5:1 และ `dark['--map-note-fg']` เป็น undefined (light-locked) ตามแบบของ `--map-route-ride`
