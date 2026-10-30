# Scrutiny — สี leg บนแผนที่ (3 รอบ, 2026-10-30)

แผน: [2026-10-30-map-leg-colors.md](2026-10-30-map-leg-colors.md) รีวิวจาก source บน `origin/main` ยังไม่ได้ render จริง

| รอบ | ระดับ | ข้อค้นพบ | ผล |
|---|---|---|---|
| 1 | Major | `.row`/`.legRail` อยู่ผิด CSS module: rail ไม่แสดง และเส้นประหาย | แก้แล้ว |
| 1 | Major | `.legActive` fallback `--brand` เท่ากับ slot 1 ขัด D4 | แก้แล้ว: ใช้ค่ากลาง |
| 1 | Major | ไม่มี test ยืนยันแผนที่ = รายการ, e2e ไม่ scope ราย list | แก้แล้ว: parity test วันโรงแรม |
| 1 | Minor | fixture และ signature `legSlot` ไม่ตรงโค้ด | แก้แล้ว |
| 2 | Major | `segment.tsx:104` ยังอ้าง `segMode_*` ที่ถูกลบ | แก้แล้ว |
| 2 | Major | rail เพี้ยนระหว่างลาก (stacking context) | แก้แล้ว: ซ่อนตอน `isSorting` |
| 2 | Minor | หัวแถวสูงทำ rail ขาด/โผล่เหนือ pin | แก้แล้ว: ตรึง pin ที่ 35px |
| 2 | Minor | `style` ต้อง cast และ merge กับ transform ของ dnd | แก้แล้ว |
| 3 | Major | มือถือเห็นแผนที่กับรายการพร้อมกันไม่ได้ เป้า "ทันที" ไม่จริง | ปรับ Goal; carousel เป็น out of scope รอดูเครื่องจริง |
| 3 | Major | ไม่ระบุไฟล์ของ `.pin` ใน Task 3 | แก้แล้ว |
| 3 | Major | สี leg ชนสี pin ขัดกับ D6 | รับความเสี่ยงเป็น D7 + ตรวจตา |
| 3 | Minor | ΔE ใช้กับชุดแผนที่เท่านั้น, docs ไม่ครบ, fixture, test ซ้ำ | แก้แล้ว |
| 4 | Major | tile สีส้มของโรงแรมขัดกับเลข navy ใหม่ | แก้แล้ว: tile เป็นสีกลาง |
| 4 | Minor | ขอบ 2px ทำวงสีเหลือ 24px | แก้แล้ว: ใช้ box-shadow |
| 4 | Minor | `aria-hidden`, claim 3:1, docs, `data-sorting` | แก้แล้ว |

**ตรวจแล้วไม่พบปัญหา:** `legSlot` ตรงกันทั้งสองฝั่ง, ตำแหน่ง rail 55/35px, ไม่ทับเนื้อหาแถว, stacking ตอนปกติ, Segmented override, `['get','color']` ผ่าน `tsc`, `Polyline` อัปเดตสีเมื่อ reorder (อ่านโค้ด), ตัวเลขในตารางสี
