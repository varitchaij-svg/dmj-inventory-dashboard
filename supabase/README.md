# สำรองข้อมูลขึ้น Supabase (Backup Strategy)

สำเนาข้อมูลอิสระนอก Google Sheets/ZORT — เป็นทั้ง **ประกันข้อมูล** วันนี้ และ
**เมล็ดพันธุ์ DB** ถ้าวันหน้าอยากทำเว็บของตัวเองเลิกพึ่ง ZORT

## หลักการ

- **ทางเดียว (one-way mirror)** — GAS สำรองข้อมูลขึ้น Supabase วันละครั้ง
  เว็บหลัก **ไม่พึ่ง Supabase เลย** ยังทำงานกับ Google Sheets เหมือนเดิมทุกอย่าง
  → ไม่มี failure point ใหม่ ถ้า backup พังก็ไม่กระทบเว็บ
- เก็บ 2 รูปแบบ:
  1. **`daily_snapshots`** — payload เต็ม (เหมือนที่เว็บได้รับ) เป็น JSONB 1 แถว/วัน
     = ตัว restore จริง กู้ข้อมูลย้อนหลังได้ทุกวันที่สำรองไว้
  2. **ตารางแยก** `products`/`orders`/`shipments`/`transfers`/`purchases`/`storage`
     (replace-all ทุกครั้ง) = query ด้วย SQL ได้ + เป็น schema ตั้งต้น DB อนาคต

## ติดตั้งครั้งแรก (ทำครั้งเดียว)

### 1. สร้าง schema ใน Supabase

เปิด Supabase project → **SQL Editor** → วางเนื้อหาไฟล์
[`backup_schema.sql`](./backup_schema.sql) ทั้งหมด → **Run**
(รันซ้ำได้ ไม่พัง — `create table if not exists` + `create or replace function`)

### 2. หา service key

Supabase → **Project Settings → API** →
- `Project URL` (เช่น `https://xxxx.supabase.co`)
- `service_role` key (อยู่ใต้ **Project API keys** — **เป็นความลับ ห้าม commit ลงโค้ด**)

### 3. ตั้ง Script Properties ใน GAS

GAS editor → **Project Settings (เฟือง) → Script Properties** → เพิ่ม:

| Property | ค่า |
|---|---|
| `SUPABASE_URL` | Project URL จากข้อ 2 |
| `SUPABASE_SERVICE_KEY` | service_role key จากข้อ 2 |

> `SUPABASE_BACKUP_ENABLED` ไม่ต้องตั้งเอง — `setupSupabaseBackup()` จะเปิดให้

### 4. เปิดใช้งาน + ทดสอบ

ใน GAS editor เลือกฟังก์ชันจาก dropdown แล้ว Run:

1. **`setupSupabaseBackup()`** — ตั้ง trigger สำรองรายวัน ~03:00 + เปิด flag (รัน 1 ครั้ง)
2. **`runSupabaseBackupNow()`** — สำรองทันทีเพื่อทดสอบ แล้วดู **Execution log**
   ควรเห็น `[supabaseBackup] สำเร็จ YYYY-MM-DD → {...}`
3. เช็กที่ Supabase → **Table Editor** → ตาราง `daily_snapshots` / `products` ควรมีข้อมูล

## ตรวจสอบว่า backup ยังเดินอยู่

```sql
-- ดูการสำรองล่าสุด
select ran_at, snapshot_date, products_count, orders_count, ok
from backup_runs order by ran_at desc limit 10;

-- ดู snapshot ที่เก็บไว้
select snapshot_date, products_count, orders_count, updated_at
from daily_snapshots order by snapshot_date desc limit 30;
```

## กู้ข้อมูล (restore)

payload เต็มของแต่ละวันอยู่ใน `daily_snapshots.payload` (JSONB) — ดึงกลับมาได้ทั้งก้อน:

```sql
select payload from daily_snapshots where snapshot_date = '2026-07-24';
```

หรือดึงเฉพาะส่วน เช่น products ของวันนั้น:

```sql
select e->>'sku' as sku, e->>'name' as name, (e->>'qty')::numeric as qty
from daily_snapshots,
     lateral jsonb_array_elements(payload->'products') as e
where snapshot_date = '2026-07-24';
```

## ปิด / rollback

รัน **`disableSupabaseBackup()`** ใน GAS — ลบ trigger + ปิด flag
(กลับไปสภาพเดิม เว็บไม่เคยพึ่ง Supabase อยู่แล้ว จึงไม่มีอะไรต้องแก้เพิ่ม)

## หมายเหตุ

- ฟังก์ชันสำรองห่อ `try/catch` ทั้งหมด + gate ด้วย `SUPABASE_BACKUP_ENABLED` —
  ถ้ายังไม่ตั้งค่า/ปิดอยู่ = no-op ไม่กระทบระบบ
- ข้อมูลใน payload มาจาก `buildFullData_()` = **ชุดเดียวกับที่เว็บได้รับเป๊ะ**
  (แยกออกมาจาก `doGet` เพื่อ reuse ไม่เขียน enrich ซ้ำ)
- service key อยู่ใน Script Property เท่านั้น ไม่เคยอยู่ในโค้ดที่ push
