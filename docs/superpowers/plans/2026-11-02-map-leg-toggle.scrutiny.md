# Scrutiny — map leg toggle + แตะ leg เลือกปลายทาง (รอบ 1)

แผน: [2026-11-02-map-leg-toggle.md](2026-11-02-map-leg-toggle.md) · trace บน `origin/main` @ `de97149` + `maplibre-gl@6.14.0`, `@vis.gl/react-google-maps@1.8.3`

## 1. Intent

ให้ผู้ใช้ปิดเส้น leg บนแผนที่ได้ และเมื่อเปิดอยู่ ให้เส้น/badge เป็นทางลัดไปเลือก stop ปลายทาง

ทางเลือกที่ง่ายกว่า:

| ทางเลือก | ผล |
|---------|----|
| ให้แตะได้แค่ badge ไม่ทำ hit บนเส้น | ตกไป: owner ขอ "icon หรือ leg" และ leg < 300 m ไม่มี badge เลย |
| เก็บ show/hide เป็น React state ใน `persistent-map` (หายตอน reload) | ตกไป: ประหยัดแค่ store ~30 บรรทัด แต่ผู้ที่ชอบปิดเส้นต้องปิดใหม่ทุกครั้ง |
| แยก helper localStorage ของ carousel (`map-stop-carousel.tsx:53-85`) ออกมาใช้ร่วม | ตกไป: ต้องแตะ carousel ซึ่งมี e2e ชุดใหญ่ที่ไม่รันในงานนี้; ซ้ำกัน ~20 บรรทัดยอมรับได้ |

ขอบเขตแผนพอดีกับคำขอ ไม่มีทางที่เล็กกว่านี้แล้วยังทำได้ครบ

## 2–3. Trace + Verify

### MAJOR — pin ของ search preview ส่งคลิกทะลุลงไปที่พื้นที่แตะของเส้น (ทั้งสอง renderer)

- **Evidence (MapLibre):** handler ของแผนที่ฟังที่ canvas container (`maplibre-gl-dev.mjs:54249` `this._el = this._map.getCanvasContainer()`) และ `Marker.addTo` ใส่ element ไว้ใน container เดียวกัน (`:60851`) คลิกบน marker จึงกลายเป็น map `click` เว้นแต่จะ `stopPropagation` — pin กับ ghost ทำ (`real-map-canvas-maplibre.tsx` ใน `onClick`) แต่ `Marker` ของ preview ไม่มี `onClick`
- **Evidence (Google):** preview `AdvancedMarker` (`real-map-canvas-google.tsx:217`) ไม่มี `onClick` จึงไม่ clickable คลิกตกลงไปที่ polyline ข้างใต้
- **ผล:** ค้นหาสถานที่ที่อยู่ระหว่าง 2 stop (กรณีปกติ — หาที่แวะตามทาง) แล้วแตะ pin preview → `onLegSelect` → `activate` → `clearPreview()` (`persistent-map.tsx:94`) preview หายไปพร้อมปุ่ม Add
- **แก้:** ระหว่างมี preview ปิดการแตะ leg ทั้งหมด: `legsInteractive = legsShown && !preview` (MapLibre: `interactiveLayerIds` ว่าง + badge ไม่เป็นปุ่ม; Google: ไม่ render hit polyline + badge ไม่ clickable) — เส้นยังแสดงอยู่ เข้ากับกติกาที่ preview ซ่อน pin card อยู่แล้ว (`pinPopups`)

### MAJOR — L3 บน Google ไม่ได้ทดสอบเส้นจริง

- **Evidence:** badge ของ Google อยู่ใน `gmp-advanced-marker` ที่ clickable การตั้ง `pointer-events: none` ที่ `[data-route-badge]` (content) ไม่ปล่อย host ที่รับคลิก test จะไปกด badge แล้วผ่านโดยไม่ได้แตะ polyline
- **แก้:** ตั้ง `pointer-events: none` ที่ `el.closest('gmp-advanced-marker') ?? el` (MapLibre: `.maplibregl-marker`) และให้ L3 assert ว่า `document.elementFromPoint` ที่จุดนั้นไม่ใช่ badge ก่อนกด

### MINOR — `routeArcs` คำนวณซ้ำ

- D5 ต้องรู้ว่ามี arc ใน canvas ขณะที่ route component คำนวณเองอีกรอบ (`map-route-maplibre.tsx:25`, `map-route-google.tsx:17`)
- **แก้:** canvas คำนวณ `arcs` ครั้งเดียว (`useMemo`) ส่ง `arcs` ให้ `RouteLines*` แทน `pins`/`legs`

### MINOR — ชื่อปุ่ม badge ไม่ตรงกันในแผน

- D8 เขียน "Go to stop 3: Wat Arun" แต่ Task 3 เป็น `Go to {name}`
- **แก้:** ใช้ `Go to {name}` / `ไปที่ {name}` โดย `name = stopName(pin, t)` (`lib/map-pin.ts:10`, ได้ `Stop n` เมื่อไม่มีชื่อ)

### MINOR — ขั้นทดสอบ 6 มีเงื่อนไขที่ตรวจได้เลย

- `lib/maps/config.ts:60` อ่าน `env.MAPS_PROVIDER` จาก env ที่ส่งเข้ามาตอนเรียก (ไม่ใช่ inline ตอน build) restart server โดยไม่ build ใหม่จึงสลับเป็น MapLibre ได้ — ยืนยันผู้เรียกส่ง `process.env` ตอน request ก่อนรัน
- **แก้:** ตัดประโยค "ถ้าอ่านตอน build จะข้าม" เป็นขั้นตรวจสั้น ๆ

### NIT — cursor

- `cursor` ของ react-map-gl เมื่อไม่ชี้เส้นควรเป็น `undefined` (ให้ MapLibre ใช้ grab/grabbing ของตัวเอง) ไม่ใช่ `'grab'` ตายตัว ซึ่งจะลบ `grabbing` ตอนลาก

## ตรวจแล้วไม่มีปัญหา

- **pin card / popup:** MapLibre ใส่ popup ใน map container (`maplibre-gl-dev.mjs:62291`) ซึ่งอยู่นอก canvas container ที่ handler ฟัง กด ✕ บนการ์ดที่ทับเส้นจึงไม่เลือก leg; Google `InfoWindow` อยู่ float pane เหนือ polyline
- **pin / ghost:** MapLibre `stopPropagation` อยู่แล้ว; Google clickable marker บังคลิกไม่ให้ลง polyline
- **Guard `activePlaceId !== id`:** จำเป็น เพราะ `activate` toggle ปิดเมื่อ id ตรง (`persistent-map.tsx:97`); `selectStop` เขียน history แบบ sync (`lib/full-map-history.ts:71`) จึงไม่มีช่วง URL เก่าค้าง
- **มือถือ:** carousel ตาม `activePlaceId` ที่มาจากข้างนอก (`map-stop-carousel.tsx:133`) แตะ leg จึงเลื่อนการ์ดเหมือนแตะ pin
- **Hydration:** canvas เป็น `dynamic(..., { ssr: false })` (`persistent-map.tsx`) mount ฝั่ง client เท่านั้น `useSyncExternalStore` ใช้ client snapshot ทันที ไม่มีเส้นกระพริบก่อนซ่อน
- **มุมบนขวา:** ปัจจุบันมีแค่ `MapDegradedChip` (`map-degraded-chip.tsx:31`, render `overlayTr` เอง) ต้องให้ chip render แค่ pill แล้วให้ canvas ถือ container — แผน Task 4 ระบุแล้ว; Google canvas ไม่มี chip

## Verdict

**fix-then-ship** — แก้ preview pass-through (ปิดการแตะ leg ระหว่าง preview) และ L3 บน Google ก่อนเริ่มโค้ด ทั้งหมดแก้เข้าแผนแล้ว
