# TP-0120: หน้าย่อยบนมือถือล้นจอแนวนอน (ทำให้แถบ nav ด้านล่างหลุดออกนอกจอ)

## วัดจริงบน branch รวม `test/batch-2026-11-06`
- **วิธีวัด:** สคริปต์ Playwright อยู่ที่ `_scratch/tp0120/measure.mjs`
  - ขนาดจอ 320, 360 และ 390
  - ภาษา en และ th
  - 5 ทริป
  - หน้า /budget, /bookings, /notes และ /calendar
- **ผล:** เหลือหน้าที่ล้นแค่ **/notes ภาษา en ที่ 320 และ 360** โดย `scrollWidth` = 364
  - budget, bookings และ calendar ไม่ล้นแล้ว (มีงานอื่นแก้ไปก่อนหน้า)
- **ต้นเหตุ:**
  - หัวหน้าเป็น `flex justify-between` ที่ไม่ wrap ข้อความหัวและปุ่ม "New checklist" กับ "New doc" จึงต้องอยู่บรรทัดเดียว min-content ของแถวนี้เท่ากับ 316
  - grid ใช้ `grid-cols-1` ซึ่งเท่ากับ `minmax(auto, 1fr)` คอลัมน์จึงหดไม่ได้ต่ำกว่า min-content ของลูก
  - รวม padding `px-6` (48) แล้วได้ 364 ซึ่งดัน `div.flex-1` ของหน้าย่อยให้กว้างตาม เพราะ flex item มี `min-width: auto`

## แก้
- `notes-view.tsx`:
  - padding `px-4 sm:px-6`
  - หัวหน้าเป็น `flex-wrap gap-3`
  - กลุ่มปุ่มเป็น `flex-wrap`
  - grid เปลี่ยนเป็น `grid-cols-[minmax(0,1fr)]` และ `lg:grid-cols-[300px_minmax(0,1fr)]`
- wrapper `flex-1` ของ 4 หน้าย่อย (bookings, notes, budget, calendar) ใส่ `min-w-0` กันกรณีเดียวกันในอนาคต
- e2e:
  - เอา `knownOverflow()` และ `test.fail` ออก ให้ flow 6 ตรวจว่าทุกหน้าไม่ล้นจริง
  - tiny-320 ไม่ข้าม flow 3 และ flow 6 อีกต่อไป

## ตรวจสอบ
รัน e2e ตอนท้ายรอบ ได้แก่ flow 3 และ flow 6 ในทุก project ของมือถือ
