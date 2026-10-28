# Scrutiny: tablet map viewport height plan

แผน: [2026-10-28-tablet-map-viewport-height.md](2026-10-28-tablet-map-viewport-height.md)

## 1. Intent

เป้าหมายคือทำให้ layout ของ trip บน md+ สูงไม่เกิน viewport ที่มองเห็นจริง เพื่อให้ map (และปุ่ม zoom/attribution) อยู่ในจอโดยไม่ต้องเลื่อน body

ทางเลือกที่ง่ายกว่า: ไม่มี การแก้ 2 class ถือว่าเล็กที่สุดแล้ว และตรงกับ pattern ที่ breakpoint มือถือในบรรทัดเดียวกันใช้อยู่ (`100dvh`)
ส่วนการ refactor เป็น `h-dvh flex-col` ที่แผนตัดออกไป ตัดสินใจถูกแล้ว เพราะต้องไปแตะ `globals.css` full-map selectors (`body[data-fullmap] > div …`) ที่พึ่งโครงสร้าง DOM ตรง ๆ

## 2. Trace (สิ่งที่ตรวจแล้ว)

- `app/layout.tsx:67` body = `min-h-full flex flex-col` และไม่มี footer หรือ element อื่นต่อท้าย → ความสูง document = header + trip row
- `trip/[id]/layout.tsx` row = `flex pb-14 md:pb-0` ไม่มี height และใช้ align-items stretch → สูงเท่าลูกที่สูงสุด
- ลูกของ row: `TripRail` (nav, `md:h-[calc(100vh-57px)]`), `MapPanelToggle` (`fixed … md:hidden` ไม่กินพื้นที่), `aside` (`md:h-[calc(100vh-57px)]`), `PersistentMap` section (`flex-1 min-h-0` ไม่มี height เอง) → แผนแก้ครบทั้งสองตัวที่กำหนดความสูง ✔
- Header: padding 12+12 + border 1 + avatar 30px (`account-menu.module.css:32`) ≈ 57 ✔ (แต่เป็นค่าประมาณ ดู finding 2)
- Screenshot: header 112px ในภาพ ⇒ scale ≈ 1.96; ระยะเลื่อน 202px ในภาพ ≈ 103 CSS px ≈ แถบแท็บ + แถบ URL ของ Chrome tablet ✔ สอดคล้องกับสมมติฐาน vh/large-viewport

## 3. Findings

### Major: การทดสอบด้วย DevTools device mode จะผ่านทั้งก่อนและหลังแก้ (แก้ไขในแผนแล้ว)
- **Why**: emulator ไม่มีแถบเครื่องมือของเบราว์เซอร์ จึงได้ `100vh == 100dvh` เสมอ ถ้าใช้วิธีนี้จะได้ false-green
- **Evidence**: บั๊กเกิดได้ก็ต่อเมื่อ large viewport ≠ visible viewport ซึ่งเกิดได้บนเบราว์เซอร์มือถือหรือแท็บเล็ตจริงเท่านั้น
- **Change**: ยืนยันสาเหตุก่อนแก้ผ่าน `chrome://inspect` บนเครื่องจริง และทดสอบหลังแก้บน preview deploy ← ได้อัปเดตในส่วน "การทดสอบ" ของแผนแล้ว

### Minor: magic number `57px` ไม่ได้ผูกกับความสูงจริงของ header
- **Why**: ถ้า header จริงสูง 58–60px (เช่น `<img>` inline ใน `<button>` แล้วเกิด baseline gap) จะยังเหลือ scroll อีก 1–3px ปุ่ม zoom ไม่หายจากจอ แต่ body ยังเลื่อนได้นิดหน่อย
- **Evidence**: `header.module.css` ไม่ได้ fix ความสูงไว้ ความสูงจึงขึ้นกับเนื้อหาข้างใน (`account-menu` trigger เป็น button ที่ไม่ได้กำหนด height)
- **Change**: ให้ใช้ค่า `offsetHeight` ที่วัดได้ในขั้นยืนยันสาเหตุ ถ้าไม่ใช่ 57 ให้เพิ่ม `height: 57px` / `box-sizing` ให้ `.header` (แก้แค่ 1 บรรทัด) แทนการไล่แก้ calc

### Nit: `dvh` กับ `svh` สำหรับ rail บนหน้าย่อยที่ body เลื่อนได้
- บนมือถือแนวนอนที่กว้าง ≥768 (toolbar ซ่อนได้) rail ที่ใช้ `dvh` จะ resize ตามตอน toolbar ยุบ/ขยาย เป็น layout ราคาถูก ไม่มี map จึงไม่น่ากังวล
  ใช้ `dvh` ต่อไปเพื่อให้สอดคล้องกับโค้ดเดิม ไม่ต้องเปลี่ยน

### Gap: ไม่มี automated regression guard
- Playwright หรือ emulator จำลองบั๊กนี้ไม่ได้ (เหตุผลเดียวกับ finding แรก) ยอมรับได้สำหรับบั๊กขนาดนี้ ถ้าอยากได้ guard ราคาถูก
  ให้เพิ่มความเห็นสั้น ๆ ข้าง class ว่า "dvh, not vh — tablet toolbars" เพื่อกันไม่ให้มีคนเปลี่ยนกลับ

## Verdict

**fix-then-ship**: วิธีแก้ถูกต้องและเล็กที่สุดแล้ว เหลือแค่ต้องยืนยันบนเครื่องจริง (DevTools emulation พิสูจน์อะไรไม่ได้) และเช็คว่า header สูง 57px จริง
