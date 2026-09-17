# แผนซ่อมข้อมูล production — invite ที่ค้างอยู่ (ต่อจาก TP-0032)

**สถานะ:** ร่าง รอตัดสินใจข้อ §3
**บริบท:** PR #53 (merged, `19ff017`) แก้ *พฤติกรรม* ให้คนถัดไป แต่ไม่ได้ย้อนซ่อมแถวที่เสียไปแล้ว บัญชีที่ผู้ใช้รายงานยังเข้าทริปไม่ได้

---

## 1. สิ่งที่ยืนยันได้จากโค้ด (ไม่ใช่การเดา)

ทั้งหมดอ้างจาก `main` ที่ `ffb77a8`:

| ข้อเท็จจริง | หลักฐาน |
|---|---|
| invite หมดอายุใน **14 วัน** | `src/app/actions/invites.ts:14` `const INVITE_TTL_DAYS = 14` |
| เก็บเฉพาะ **hash** ของ token ไม่เก็บ plaintext | `invites.tokenHash` (`src/db/schema.ts:512`); `createInviteAction` คำนวณ `hashInviteToken(token)` แล้วเก็บเฉพาะ hash (`invites.ts:36-37`) |
| plaintext token โผล่ **ครั้งเดียว** ตอนสร้าง | `invites.ts:68-70` redirect พร้อม `?invited=<token>` |
| หน้า settings **ไม่แสดงลิงก์ของ invite ที่ค้างอยู่** | `src/app/trip/[id]/settings/page.tsx:238-254` แสดงแค่อีเมล + วันหมดอายุ + ปุ่ม Revoke |
| accept **ไม่เขียน audit log** | `src/lib/services/invite-service.ts` ทั้งไฟล์ ไม่มี `writeAudit` (ต่างจาก `createInviteAction` ที่เขียน) |
| `trip_membership` มี unique `(trip_id, user_id)` | `src/db/schema.ts:544` `uniqueIndex('trip_membership_unique')` |
| `invite` **ไม่มี** unique บน `(trip_id, email)` | `src/db/schema.ts:524-526` มีแค่ `invite_trip_idx` และ `invite_token_unique` |
| เทียบอีเมลแบบเป๊ะแล้ว | `invite-service.ts:62-65` |

### ผลที่ตามมา — สองข้อนี้เปลี่ยนรูปแผน

1. **ลิงก์เดิมกู้คืนไม่ได้** เพราะ DB มีแต่ hash ถ้าผู้ใช้ไม่ได้เก็บลิงก์เดิมไว้ ไม่มีทางสร้างลิงก์เดิมขึ้นมาใหม่ได้ ไม่ว่าจะ query อะไรก็ตาม
2. **ลิงก์เดิมน่าจะหมดอายุแล้ว** PR #52 merge วันที่ 2026-08-23 วันนี้ 2026-09-16 ห่างกัน **24 วัน** เกิน TTL 14 วันไปแล้ว ถ้า invite ถูกสร้างช่วงนั้นจริง ลิงก์เดิมตายไม่ว่าอีเมลจะตรงหรือไม่ — และการกดเปิดจะทำให้ `acceptInvite` **พลิก status เป็น `expired`** (`invite-service.ts:46-52`) ซึ่งเป็น side effect ที่ไม่อยากให้เกิดก่อนเก็บข้อมูล

> ข้อ 2 เป็นการอนุมานจากวันที่ merge ไม่ใช่จากข้อมูลจริง — §2 มีไว้เพื่อยืนยันหรือหักล้าง

---

## 2. ขั้นวินิจฉัย (read-only ต้องทำก่อน)

ผมถูก permission classifier บล็อกไม่ให้อ่าน production (`[Production Reads]`) — สคริปต์นี้จึงต้องให้คุณรันเอง **เป็น SELECT ล้วน ไม่มี write**

```bash
cd ~/development/travel-planner-v2/app
cat > /tmp/inspect-invites.mjs <<'EOF'
import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL_UNPOOLED, { prepare: false, ssl: 'require' });
const rows = await sql`
  SELECT i.id, i.trip_id, i.email AS invited_email, i.role, i.status,
         i.accepted_at, i.expires_at, i.created_at,
         (i.expires_at < now()) AS is_expired,
         t.title AS trip_title, t.deleted_at AS trip_deleted,
         u.id AS matching_user_id, u.email AS user_email,
         u."emailVerified" AS user_email_verified,
         (SELECT count(*) FROM trip_membership m
           WHERE m.trip_id = i.trip_id AND m.user_id = u.id) AS membership_rows
    FROM invite i
    LEFT JOIN trip t ON t.id = i.trip_id
    LEFT JOIN "user" u ON lower(u.email) = lower(i.email)
   ORDER BY i.created_at DESC`;
console.table(rows.map(r => ({
  invite: r.id.slice(0,8), trip: r.trip_title, invited: r.invited_email,
  status: r.status, expired: r.is_expired, accepted_at: r.accepted_at,
  user_exists: !!r.matching_user_id, user_email: r.user_email,
  verified: !!r.user_email_verified, memberships: Number(r.membership_rows),
})));
await sql.end();
EOF
npx tsx /tmp/inspect-invites.mjs
```

**สิ่งที่ต้องอ่านจากผลลัพธ์:**

- `user_exists = true` → อีเมลที่เชิญ **ตรง** กับบัญชีที่เขาสมัครจริง → กรณี A
- `user_exists = false` → เขาสมัครด้วยอีเมลคนละตัวกับที่ถูกเชิญ → กรณี B (ต่างจากที่คิดไว้ ต้องเปลี่ยนวิธี)
- `memberships = 0` → ยืนยันว่ายังไม่มีสิทธิ์จริง
- `expired = true` → ลิงก์เดิมตายแล้ว ตามที่คาดใน §1

---

## 3. ทางเลือกในการซ่อม

### ทางเลือก 1 — ออก invite ใหม่ผ่าน UI (แนะนำ)

ไม่แตะ DB ตรง ๆ เลย ใช้เส้นทางปกติของแอป

1. เจ้าของทริปเปิด `/trip/<id>/settings?s=people`
2. กด **Revoke** ที่ invite เก่า (กัน pending ซ้ำ เพราะ `invite` ไม่มี unique `(trip_id,email)` จึงเกิดแถวค้างสองใบได้)
3. กรอกอีเมล **ตัวเดียวกับที่เขาใช้ล็อกอินจริง** (จากคอลัมน์ `user_email` ใน §2) แล้วสร้างลิงก์ใหม่
4. คัดลอกลิงก์จาก URL หลัง redirect (`?invited=<token>`) ส่งให้เขา — **ต้องคัดลอกตอนนั้นเลย** หน้า settings ไม่แสดงลิงก์ย้อนหลัง (`settings/page.tsx:238-254`)
5. เขาเปิดลิงก์ขณะล็อกอินอยู่ในบัญชีนั้น → `acceptInvite` เขียน membership + พลิก status เอง

**ข้อดี:** เดินผ่านโค้ดที่เพิ่ง merge ไป จึงเป็นการ **ทดสอบ TP-0032 บน production จริง** ไปในตัว ถ้ายังพัง แปลว่า fix ไม่ครบ และได้รู้ทันที
**ข้อเสีย:** ต้องประสานกับผู้ใช้ และลิงก์มีอายุ 14 วัน

### ทางเลือก 2 — INSERT membership ตรง ๆ

ใช้เมื่อกรณี B (อีเมลไม่ตรง) หรือผู้ใช้ติดต่อไม่ได้

```sql
BEGIN;
INSERT INTO trip_membership (id, trip_id, user_id, role)
VALUES (gen_random_uuid()::text, '<trip_id>', '<user_id>', '<role จาก invite>')
ON CONFLICT (trip_id, user_id) DO NOTHING;

UPDATE invite SET status = 'accepted', accepted_at = now()
 WHERE id = '<invite_id>' AND status = 'pending';
COMMIT;
```

- `id` ต้องใส่เอง — column นี้ generate ฝั่งแอป (`$defaultFn`) **ไม่มี DB default** นี่คือสาเหตุที่ integration test พังตอนแรก
- `ON CONFLICT DO NOTHING` ปลอดภัยเพราะมี unique `(trip_id,user_id)` จริง
- เงื่อนไข `AND status = 'pending'` กันไม่ให้เขียนทับ invite ที่ถูก revoke ไปแล้ว
- **ไม่มี audit row หาย** เพราะเส้นทาง accept ปกติก็ไม่เขียน audit อยู่แล้ว (§1)

**ข้อเสียที่ต้องยอมรับ:** ให้สิทธิ์แก่อีเมลที่ *ไม่ใช่* อีเมลที่ถูกเชิญ — ขัดกับกฎ §3.8 ที่เพิ่งบังคับไป ต้องเป็นการตัดสินใจโดยรู้ตัว ไม่ใช่ทำเงียบ ๆ

### ทางเลือก 3 — ยืดอายุ invite เดิม

**ใช้ไม่ได้** ต่อให้ `UPDATE invite SET expires_at = ...` ผู้ใช้ก็ยังเปิดไม่ได้ เพราะไม่มีใครมี plaintext token อีกแล้ว (§1) เขียนไว้เพื่อตัดออกอย่างชัดเจน ไม่ให้ถูกหยิบมาเสนอซ้ำ

---

## 4. เกณฑ์ตัดสิน

```
รันวินิจฉัย §2
        │
        ├── user_exists = true  ──→ ทางเลือก 1 (ออกลิงก์ใหม่)
        │                              └── ยังพังอีก? → TP-0032 ไม่ครบ ต้องสืบใหม่ ไม่ใช่ซ่อมข้อมูล
        │
        └── user_exists = false ──→ อีเมลไม่ตรง ตัดสินใจก่อน:
                                    ├── ให้เขาใช้อีเมลเดิมที่ถูกเชิญ → ทางเลือก 1
                                    └── ยอมรับอีเมลใหม่           → ทางเลือก 2 (โดยรู้ตัว)
```

---

## 5. การยืนยันหลังซ่อม

ไม่ถือว่าเสร็จจนกว่าจะผ่านทั้งสองข้อ:

1. **ระดับข้อมูล** — รัน §2 ซ้ำ ต้องได้ `memberships = 1`, `status = 'accepted'`, `accepted_at` ไม่เป็น null
2. **ระดับผู้ใช้** — ผู้ใช้ล็อกอินแล้ว **เห็นทริปจริงในหน้าแรก** ข้อนี้สำคัญเพราะปัญหาที่รายงานมาคือ "ไม่มีทริปโผล่" ไม่ใช่ "ไม่มีแถวใน DB" การมีแถวถูกต้องแต่ UI ยังว่างแปลว่า `loadTripsForUser` ยังมีปัญหา ซึ่งเป็นคนละบั๊ก

---

## 6. สิ่งที่แผนนี้ไม่ทำ

- ไม่ส่งอีเมล invite อัตโนมัติ (ยัง deferred อยู่ `invites.ts:65`)
- ไม่เพิ่มฟีเจอร์ดูลิงก์ invite ย้อนหลัง — เป็นข้อจำกัดเชิงออกแบบที่ตั้งใจ (เก็บแต่ hash) ถ้าจะแก้ต้องเป็นงานแยกและคิดเรื่องความปลอดภัยใหม่
- ไม่ไล่ซ่อม invite ค้างรายอื่น ถ้า §2 เจอ ให้ตัดสินใจเป็นราย ๆ
