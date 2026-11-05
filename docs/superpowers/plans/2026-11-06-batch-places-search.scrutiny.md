# Scrutiny: TP-0147

- **Intent:** ค้นหลายชื่อได้ใน request เดียว โดยไม่ต้องรอระหว่างคำขอ และไม่ข้าม quota รายวัน
- **ทางที่ง่ายกว่า:** ให้ agent ยิง GET แบบขนานเอง
  - ติด limit ต่อ token ที่ 60/นาที
  - batch แก้ตรงนี้ได้ โดยยังคงนับ quota รายวันตามจำนวนรายการ
- **Trace:**
  - `searchPlacesForApi` เรียก `consumeRateLimitKey` ต่อรายการ ถ้า limiter ล่มจะปล่อยผ่าน (fail open) เหมือน GET
  - `searchPlacesByText` รับ `{ near, radius }`
  - `PlacesSearchUnavailableError` และ `GoogleHttpError` แปลงเป็น Response ที่มี status ซึ่ง map ลงเป็น error ของรายการนั้นได้
  - error ที่ไม่ได้คาดไว้จะถูก catch แยกต่อรายการ และตอบเป็น 500 ของรายการนั้น ไม่ทำให้ทั้ง request ล้ม
- **ความเสี่ยง:**
  - batch ขนาด 25 ด้วย concurrency 5 อยู่ใน deadline ของ function ได้ เพราะ text search แต่ละครั้งไม่เกินประมาณ 3 วินาที (มี timeout อยู่แล้ว)
  - ตั้ง `maxDuration` ไว้ที่ 60 วินาที
- **Verdict:** ship
