# TP-0147: batch places search

**ที่มา:** คุณสั่งในเป้าหมายรอบ 2026-11-06 ให้ทำใบนี้ตามลำดับ ซึ่งแทนมติเดิมเมื่อ 2026-11-04 ที่บอกว่ายังไม่ทำ ส่วน `near` ที่รับได้ทั้งสองรูปแบบทำเสร็จไปแล้วใน TP-0140

## API
- **Endpoint:** `POST /api/v1/places/search/batch`
- **Request body:** `{ queries: [{ q, near?, radius?, key? }] }`
  - มีได้ 1–25 รายการ
  - `near` รับทั้ง `"lat,lng"` และ `{lat,lng}`
  - `key` ไม่ส่งก็ได้ ถ้าไม่ส่งจะใช้ index ของรายการเป็น key แทน
- **Response:** `200 { results: [{ key, results: [...] } | { key, error: { status, message } }] }`
  - ลำดับของผลลัพธ์ตรงกับลำดับของ `queries`
- **การทำงาน:**
  - แต่ละรายการเรียก `searchPlacesForApi` ตัวเดียวกับที่ GET ใช้ ดึงตัวนี้ออกมาเป็น helper กลางใน PR #164 แล้ว (ไฟล์เหมือนกันทุกตัวอักษร จึงไม่ชนกันตอน merge)
  - quota รายวันจึงนับ 1 ต่อรายการ ใน bucket `places:search` เดิม
  - รันพร้อมกันได้ทีละ 5 รายการ
- **นับ limit ต่อ token:** ทั้ง request นับเป็น 1 ครั้ง (ผ่าน `withUser`)
- **Error แยกต่อรายการ:**
  - Google ล่มบางรายการ หรือ quota หมดกลางชุด จะได้ error เฉพาะรายการนั้น ทั้ง request ยังได้ 200
  - ถ้า body ผิดรูปแบบ (ไม่ใช่ array, เกิน 25 รายการ, ไม่มี `q`, `near` หรือ `radius` ผิด) จะได้ 400 ทั้ง request โดยระบุ index ที่ผิด

## Docs
- SKILL.md §6a
- `docs/ops/maps-cost-guardrails.md`: batch ไม่ได้ลดค่าใช้จ่ายต่อ query และยังนับ quota รายวันตามปกติ

## Tests
Route test (mock `searchPlacesByText` และ rate limit):
- ผลลัพธ์เรียงตามลำดับ และใช้ key ที่ส่งมา
- รายการที่ล้มไม่ทำให้รายการอื่นล้ม
- quota หมดกลางชุด: รายการที่เกินได้ error 429
- จำนวนรายการเกิน cap: 400
- `near` รับได้ทั้งสองรูปแบบ
- ทั้ง request ใช้ limit ต่อ token แค่ 1 ครั้ง
