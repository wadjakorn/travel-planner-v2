# ตรวจสอบ: session, tier และ SKU ของ Google Places — implementation เดิมทำถูกไหม

**วันที่:** 2026-10-23
**แหล่งข้อมูล:**
- หน้าเอกสารของ Google ที่ดึงเป็น HTML ดิบแล้วอ่านเอง ไม่ผ่านตัวสรุป
- โค้ดก่อน #57 (`git show f093d91^`) และ commit #22, #23, #40, #41
- pm ticket Maps #4

---

## 1. สรุป

| เรื่อง | implementation เดิม | ความจริงตาม docs | ผล |
|---|---|---|---|
| **กลไก session token** | สร้าง `AutocompleteSessionToken` ต่อ session, ส่งไปกับทุก autocomplete, ปิด session ด้วย `toPlace().fetchFields()` และสร้าง token ใหม่หลังเลือก | ตรงตามที่ docs แนะนำทุกข้อ | ✅ **ถูก** |
| **ความเชื่อว่า "Place Details ฟรี ($0) เมื่ออยู่ใน session"** (#23, #41, Maps #4, guardrails §1) | ใช้เป็นเหตุผลหลักที่**ไม่ย้าย** Places ไปฝั่ง server | session ทำให้ **autocomplete** ฟรี ส่วน details ที่ปิด session **เสียเงินเสมอ** | ❌ **ผิด** |
| **SKU ของ details ที่ปิด session** | ทุก picker ขอ `name` (= `displayName`, ระดับ Pro) | ถ้าใน mask มี field ระดับ Pro ขึ้นไปแม้ตัวเดียว details ที่ปิด session จะถูกคิดเป็น **Enterprise + Atmosphere ($25/1k, ฟรี 1,000/เดือน)** ไม่ว่าจะขอ field อะไร | ⚠️ **ทุกครั้งที่เลือกสถานที่ถูกคิดราคาแพงสุด** รวมโรงแรมและการเดินทางที่ต้องการแค่พิกัด |
| **free tier ในเอกสาร guardrails เดิม** | Autocomplete 5,000, Place Details 5,000 | Autocomplete Requests 10,000, Details Essentials 10,000, Pro 5,000, Enterprise 1,000, **Enterprise + Atmosphere 1,000** | ❌ ตัวเลขคลาดเคลื่อน |
| **#22: ไม่เรียก details ตอนเปิด preview** | เรียก details เฉพาะตอนกดเพิ่มจริง | ถูกต้อง: ใน 1 session เรียก details ได้ครั้งเดียว และการเปิด preview ไม่ควรเสียเงิน | ✅ ถูก |
| **Maps #4: "ย้าย Places ไป server จะเสียประโยชน์ของ session"** | — | REST มี `sessionToken` ทั้งตอน autocomplete และ details กติกาการคิดเงินเหมือน JS ทุกอย่าง (หน้า session pricing ของ JS กับ web service มีข้อความเหมือนกันทุกบรรทัด) | ❌ **ไม่จริง** แค่ต้องส่ง token ให้ถูก |
| **Maps #4: "ต้องใช้ key ที่ browser เพราะแผนที่"** | — | จริง Maps JavaScript API ต้องใช้ key ที่ browser | ✅ ยังจริง แต่ใช้กับแผนที่เท่านั้น |

**สรุป:** โค้ดจัดการ session ถูกต้องแล้ว แต่เข้าใจราคาผิด ทำให้ (1) ตัดสินใจไม่ย้าย Places ไป server ด้วยเหตุผลที่ไม่จริง และ (2) ทุกครั้งที่เลือกสถานที่ถูกคิดที่ SKU แพงสุด ทั้งที่โรงแรมและการเดินทางจ่ายถูกกว่านี้ได้

---

## 2. หลักฐานจาก Google docs (คัดคำต่อคำ)

### 2.1 Session pricing
[places/web-service/session-pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing) ผม diff กับ [หน้า JavaScript](https://developers.google.com/maps/documentation/javascript/session-pricing) แล้ว **เนื้อหาหลักเหมือนกันทุกบรรทัด** (ส่วนสรุปด้านบนต่างกันนิดหน่อย)

**session ที่ปิดด้วย details ระดับ Essentials**

> "First 12 Autocomplete (New) requests: You are billed for each Autocomplete (New) request, up to a maximum of 12 requests, using the SKU: Autocomplete Requests."
> "For Autocomplete (New) requests 13 and higher in the same session: You are billed at the SKU: Autocomplete Session Usage, meaning there is no charge for those requests."
> "Place Details (New) Essentials: You are also billed for the terminating request at SKU: Places API Place Details Essentials."

**session ที่ปิดด้วย details ระดับ Pro / Enterprise / Enterprise + Atmosphere**

> "All Autocomplete (New) requests are billed at the SKU: Autocomplete Session Usage, meaning there is no charge for those requests."
> "Place Details (New) terminating requests are billed at SKU: Place Details Enterprise + Atmosphere, **regardless of the fields requested.**"

**session ที่ไม่ได้ปิด และ token ที่ใช้ซ้ำ**

> "Incomplete sessions … are billed only for the Autocomplete (New) requests using the SKU: Autocomplete Requests."
> "After the session terminates, any call … that uses the expired session token is billed as if there was no session token."

**ข้อควรระวัง:** ถ้าปิด session ด้วย details ระดับ Essentials (IDs Only) ซึ่งไม่เสียเงิน autocomplete ทุก request ใน session จะถูกคิดเงินแบบรายครั้ง

### 2.2 JS SDK: `toPlace()` ส่ง token ไปเอง แต่ details ยังเสียเงิน
[javascript/place-autocomplete-data](https://developers.google.com/maps/documentation/javascript/place-autocomplete-data)

> "call toPlace(), then call fetchFields() on the resulting Place object (the session ID from the place prediction is automatically included). Calling fetchFields() ends the autocomplete session."
> "If the user selects a place, the search query is available at no charge, and **only the Place data request is charged**."

ประโยคนี้แหละที่น่าจะถูกอ่านผิดเป็น "details ฟรี" ความหมายจริงคือ query (autocomplete) ฟรี ส่วน Place data (details) ยังเสียเงิน

### 2.3 Session token บน REST
[places/web-service/place-session-tokens](https://developers.google.com/maps/documentation/places/web-service/place-session-tokens)

> "Session tokens must be URL- and filename-safe base64 strings … Google recommends using version 4 universally unique identifiers (UUIDs)"
> "The API key(s) used for each request within a session must belong to the same Google Cloud Console project."

### 2.4 Field → SKU
แปลงจากตารางใน [data-fields](https://developers.google.com/maps/documentation/places/web-service/data-fields) โดยตรง

| Field | Place Details SKU |
|---|---|
| `id`, `photos` | Essentials (IDs Only) |
| `formattedAddress`, `location`, `types`, `viewport`, `plusCode`, `shortFormattedAddress` | **Essentials** |
| `displayName`, `utcOffsetMinutes`, `timeZone`, `primaryType`, `googleMapsUri` | **Pro** |
| `nationalPhoneNumber`, `websiteUri`, `regularOpeningHours`, `rating`, `userRatingCount`, `priceLevel` | **Enterprise** |
| `editorialSummary` | Enterprise + Atmosphere |

### 2.5 ราคาและ free cap ต่อเดือน
จาก [pricing](https://developers.google.com/maps/billing-and-pricing/pricing) แถวแรก (0–100k)

| SKU | ฟรี/เดือน | $/1,000 |
|---|---|---|
| Autocomplete Requests | 10,000 | 2.83 |
| Autocomplete Session Usage | Unlimited | — |
| Place Details Essentials (IDs Only) | Unlimited | — |
| Place Details Essentials | 10,000 | 5.00 |
| Place Details Pro | 5,000 | 17.00 |
| Place Details Enterprise | 1,000 | 20.00 |
| **Place Details Enterprise + Atmosphere** | **1,000** | **25.00** |
| Dynamic Maps | 10,000 | 7.00 |
| Static Maps | 10,000 | 2.00 |

### 2.6 IP biasing
[place-autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete)

> "If you omit both locationBias and locationRestriction, Autocomplete (New) uses IP biasing by default." · "uses the IP address of the device"

ถ้าเรียกจาก server IP ที่ Google เห็นคือ IP ของ Vercel ไม่ใช่ของผู้ใช้ ข้อนี้เป็นข้อเสียจริงข้อเดียวของการย้ายไป server แผนจัดการด้วยการส่ง `locationBias` เอง

---

## 3. โค้ดเดิม: แต่ละ picker ถูกคิดเงินที่ SKU ไหน

| Picker (ก่อน #57) | field ที่ขอ | field ที่แพงสุด | SKU ที่ใช้ปิด session |
|---|---|---|---|
| `place-search-picker` | name, address, geometry, place_id, phone, website, opening_hours, rating, user_ratings_total, types | Enterprise | **E+A $25/1k** (จำเป็น เพราะต้องได้ rating และเวลาเปิดปิด) |
| `place-autocomplete` | name, address, geometry, place_id, phone, website, opening_hours | Enterprise | **E+A** (field เบอร์โทร เว็บ และเวลาเปิดปิดถูกทิ้ง เพราะ `place-form` ไม่ได้ใช้) |
| `hotel-search-picker` | name, address, geometry, place_id | Pro (`name`) | **E+A**, แต่ถ้าไม่ขอ `name` จะเป็น Essentials |
| `hotel-place-picker` | name, address, geometry, place_id | Pro | **E+A**, แต่ถ้าไม่ขอ `name` จะเป็น Essentials |
| `transport-place-picker` | name, geometry, place_id, utc_offset_minutes | Pro | **E+A**, แต่ถ้าใช้ tz-lookup แทนจะเป็น Essentials |

ส่วนอื่นของโค้ดเดิมที่ทำถูก: token ต่อ session ✅, สร้าง token ใหม่หลังเลือก ✅, debounce 350 ms ✅ และ hotel picker ใช้ `includedPrimaryTypes: ['lodging']` (~~✅~~ review รอบ 4 พบว่าตัวกรองนี้ตัดโรงแรมที่มี primary type เป็น `hotel` ทิ้ง เลยไม่ทำตาม)

---

## 4. คิดเงินแบบไหนคุ้มกว่าสำหรับ picker ที่ต้องการแค่พิกัด

สมมติ 1 session มี autocomplete ประมาณ 4 request (debounce 350 ms)

| วิธีปิด session | ค่าใช้จ่ายต่อ 1,000 session (หลังหมด free) | ฟรีได้ราว ๆ ต่อเดือน |
|---|---|---|
| **E+A** (แบบเดิม) | autocomplete $0 + details $25 = **$25** | **1,000 session** |
| **Essentials** (แผนใหม่ `basic`) | autocomplete 4 × $2.83 + details $5 = **≈ $16.3** | **≈ 2,500 session** (ติด 10k autocomplete requests ก่อน) |

**จุดคุ้มทุน:** Essentials ถูกกว่าเมื่อ session มี autocomplete **ไม่เกิน 7 request** (7 × 2.83 + 5 ≈ $24.8) ถ้าเกินกว่านั้น E+A จะถูกกว่า ในกรณีแย่สุด Essentials คิด autocomplete ไม่เกิน 12 request ต่อ session ซึ่งเท่ากับ $39 ต่อ 1,000 session แต่สำหรับแอปขนาดนี้ที่ใช้ไม่เกิน free tier ตัวที่ตัดสินจริงคือ**จำนวน session ที่ใช้ฟรีได้** (Essentials ≈ 2,500 เทียบกับ E+A 1,000)

**ข้อควรระวัง:** autocomplete ที่คิดเงินจะไปกินโควตา Autocomplete Requests ซึ่งเป็นโควตาเดียวกับ session ที่ผู้ใช้พิมพ์แล้วไม่ได้เลือกอะไร

---

## 5. ผลกับแผน Stage A

1. **mask `basic` = `id,formattedAddress,location,types` (Essentials)** แก้แล้ว ส่วน `full` คงไว้สำหรับ `place-search-picker` เท่านั้น
2. **daily cap:** `details:full` 30/วัน ≈ 900/เดือน < free 1,000 ✅ · `details:basic` 80/วัน ≈ 2,400 details < free 10k ✅ · `autocomplete` 300/วัน ≈ 9,300/เดือน < free 10k ✅ (ตัวนี้คุม autocomplete ที่ถูกคิดเงินใน session ที่ปิดด้วย Essentials)
   → ตัวที่คุมจริงคือ cap `autocomplete` 300/วัน (≈ 9.3k/เดือน < 10k) ส่วน `details:basic` 80/วัน เป็นแค่ตัวกันชั้นที่สอง
3. ~~ใส่ `includedPrimaryTypes: ['lodging']` กลับมา~~ **ไม่ทำ (review รอบ 4):** ตัวกรองนี้ดูแค่ *primary type* แต่โรงแรมส่วนใหญ่มี primary type เป็น `hotel` หรือ `resort_hotel` ถ้ากรองด้วย `lodging` จะตัดโรงแรมจริงทิ้ง ให้ใช้การจัดอันดับที่ให้ที่พักขึ้นก่อนแบบเดิมแทน
4. **guardrails ใหม่ต้องเขียนตัวเลข free tier ให้ถูก** ตามตารางข้อ 2.5 และต้องไม่เขียนว่า "details ฟรี"
5. **ตรวจหลังเปิดจริง (Stage B):** ใน Cloud Billing → Reports แยกตาม SKU ต้องเห็น
   - `Autocomplete Session Usage`: แปลว่า session ทำงาน
   - `Place Details Essentials`: มาจาก hotel/transport
   - `Enterprise + Atmosphere`: มาจาก place picker เท่านั้น

   ถ้า Autocomplete Requests สูงผิดปกติ แปลว่า token ไม่ถึง details หรือมี session ค้างจำนวนมาก

---

## 6. ToS (เพิ่มจาก review รอบ 4) — ผู้ใช้ต้องตัดสินใจ

- **14.2 ห้ามแสดงเนื้อหา Places บนแผนที่ที่ไม่ใช่ Google:** แผนจึงกำหนดว่า**ห้ามเปิด `MAPS_PROVIDER=google` บน production จนกว่า Stage B จะเสร็จ** แต่ที่ยังเหลือคือ สถานที่ที่บันทึกจาก Google ไว้แล้ว จะไปโผล่บน MapLibre ตอนสลับกลับเป็น `open` หรือตอนแผนที่ Google ล่มแล้วแอปสลับไป MapLibre แทน
- **ห้ามเก็บเนื้อหา Places** (ยกเว้น place_id ส่วน lat/lng cache ได้ 30 วันตามข้อ 14.3): แอปเก็บชื่อ ที่อยู่ พิกัด และ rating ลง DB ถาวร ซึ่ง**เวอร์ชันก่อน #57 ก็ทำแบบเดียวกัน**
