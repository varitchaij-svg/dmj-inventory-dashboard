-- ═══════════════════════════════════════════════════════════════════════════
-- DMJ Inventory — Supabase Backup Schema
-- ═══════════════════════════════════════════════════════════════════════════
--
-- วิธีใช้: เปิด Supabase → SQL Editor → วางไฟล์นี้ทั้งหมด → Run (รันซ้ำได้ idempotent)
--
-- โครงสร้าง:
--   • daily_snapshots — payload เต็ม (เหมือนที่เว็บได้รับ) เป็น JSONB 1 แถว/วัน = ตัว restore จริง
--   • products / orders / shipments / transfers / purchases / storage — ตารางแยก (mirror)
--     replace-all ทุกครั้งที่สำรอง = query ด้วย SQL ได้ + เป็น schema ตั้งต้น DB อนาคต
--   • backup_runs — log การสำรองแต่ละครั้ง (ไว้เช็กว่า backup ยังเดินอยู่)
--   • refresh_backup(payload, snapshot_date, source) — function ที่ GAS เรียกครั้งเดียว
--     ทำ upsert snapshot + truncate/insert ทุกตารางใน transaction เดียว (atomic)
--
-- ความปลอดภัย: เปิด RLS ทุกตารางแบบไม่มี policy → anon/authenticated เข้าไม่ได้เลย
--   มีแต่ service_role (ที่ GAS ใช้ ผ่าน service key ใน Script Property) ที่เขียนได้ (bypass RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── ตาราง snapshot เต็ม (ตัว restore หลัก) ───────────────────────────────
create table if not exists public.daily_snapshots (
  snapshot_date  date primary key,
  payload        jsonb not null,
  products_count integer,
  orders_count   integer,
  generated_at   text,          -- data.generatedAt (ISO) ตอนสร้าง payload
  source         text,          -- 'gas' / 'manual'
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─── ตารางแยกแบบ mirror (replace-all ทุกครั้ง) ────────────────────────────
create table if not exists public.products (
  sku         text,
  name        text,
  image_url   text,
  location_raw text,
  category    text,
  tag         text,
  vendor      text,
  qty_store   numeric,
  qty_wh      numeric,
  qty         numeric,
  price       numeric,
  cost        numeric,
  sold_qty    numeric,
  sold_rev    numeric,
  is_oos      boolean,
  is_oversold boolean,
  is_mto      boolean
);

create table if not exists public.orders (
  order_id     text,
  carry_mode   text,
  order_date   text,
  status       text,
  from_loc     text,
  to_loc       text,
  sku          text,
  name         text,
  order_qty    numeric,
  prepared_qty numeric,
  remaining    numeric,
  print_flag   text
);

create table if not exists public.shipments (
  ship_id         text,
  ref_num         text,
  ship_date       text,
  status          text,
  from_loc        text,
  to_loc          text,
  sku             text,
  name            text,
  qty             numeric,
  received_qty    numeric,
  received_status text,
  received_at     text,
  received_by     text,
  prepared_by     text
);

create table if not exists public.transfers (
  type      text,
  txn_id    text,
  txn_date  text,
  status    text,
  from_loc  text,
  to_loc    text,
  sku       text,
  name      text,
  qty       numeric
);

create table if not exists public.purchases (
  type       text,
  po_num     text,
  supplier   text,
  po_date    text,
  status     text,
  warehouse  text,
  sku        text,
  name       text,
  qty        numeric,
  unit_price numeric
);

create table if not exists public.storage (
  lock_key   text,
  sku        text,
  qty        numeric,
  sys_qty    numeric,
  status     text,
  last_check text
);

-- ─── log การสำรอง ─────────────────────────────────────────────────────────
create table if not exists public.backup_runs (
  id             bigint generated always as identity primary key,
  ran_at         timestamptz not null default now(),
  snapshot_date  date,
  products_count integer,
  orders_count   integer,
  source         text,
  ok             boolean not null default true
);

-- index ช่วย query สินค้า/ออเดอร์ตาม sku (mirror ตารางไม่มี PK เพราะ replace-all)
create index if not exists idx_products_sku on public.products (sku);
create index if not exists idx_orders_sku   on public.orders (sku);
create index if not exists idx_storage_sku  on public.storage (sku);

-- ─── เปิด RLS แบบไม่มี policy (deny anon/authenticated, service_role bypass) ──
alter table public.daily_snapshots enable row level security;
alter table public.products        enable row level security;
alter table public.orders          enable row level security;
alter table public.shipments       enable row level security;
alter table public.transfers       enable row level security;
alter table public.purchases       enable row level security;
alter table public.storage         enable row level security;
alter table public.backup_runs     enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- Function: refresh_backup — GAS เรียกครั้งเดียว ส่ง payload ทั้งก้อน
--   ทำทุกอย่างใน transaction เดียว (atomic) — ถ้าพังกลางทาง rollback ทั้งหมด
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.refresh_backup(
  p_payload       jsonb,
  p_snapshot_date date default (now() at time zone 'Asia/Bangkok')::date,
  p_source        text default 'gas'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_products integer;
  v_orders   integer;
begin
  v_products := coalesce(jsonb_array_length(p_payload->'products'), 0);
  v_orders   := coalesce(jsonb_array_length(p_payload->'orders'), 0);

  -- 1) snapshot เต็ม (upsert ตามวันที่ — สำรองหลายครั้ง/วันทับแถวเดิม)
  insert into daily_snapshots (snapshot_date, payload, products_count, orders_count, generated_at, source)
  values (p_snapshot_date, p_payload, v_products, v_orders, p_payload->>'generatedAt', p_source)
  on conflict (snapshot_date) do update set
    payload        = excluded.payload,
    products_count = excluded.products_count,
    orders_count   = excluded.orders_count,
    generated_at   = excluded.generated_at,
    source         = excluded.source,
    updated_at     = now();

  -- 2) mirror ตารางแยก (replace-all)
  truncate products;
  insert into products (sku, name, image_url, location_raw, category, tag, vendor,
                        qty_store, qty_wh, qty, price, cost, sold_qty, sold_rev,
                        is_oos, is_oversold, is_mto)
  select e->>'sku', e->>'name', e->>'imageUrl', e->>'locationRaw', e->>'category',
         e->>'tag', e->>'vendor',
         (e->>'qtyStore')::numeric, (e->>'qtyWH')::numeric, (e->>'qty')::numeric,
         (e->>'price')::numeric, (e->>'cost')::numeric,
         (e->>'soldQty')::numeric, (e->>'soldRev')::numeric,
         (e->>'isOOS')::boolean, (e->>'isOversold')::boolean, (e->>'isMTO')::boolean
  from jsonb_array_elements(coalesce(p_payload->'products', '[]'::jsonb)) as e;

  truncate orders;
  insert into orders (order_id, carry_mode, order_date, status, from_loc, to_loc,
                      sku, name, order_qty, prepared_qty, remaining, print_flag)
  select e->>'id', e->>'carryMode', e->>'date', e->>'status', e->>'from', e->>'to',
         e->>'sku', e->>'name',
         (e->>'orderQty')::numeric, (e->>'preparedQty')::numeric,
         nullif(e->>'remaining','')::numeric, e->>'printFlag'
  from jsonb_array_elements(coalesce(p_payload->'orders', '[]'::jsonb)) as e;

  truncate shipments;
  insert into shipments (ship_id, ref_num, ship_date, status, from_loc, to_loc,
                         sku, name, qty, received_qty, received_status,
                         received_at, received_by, prepared_by)
  select e->>'id', e->>'refNum', e->>'date', e->>'status', e->>'from', e->>'to',
         e->>'sku', e->>'name', (e->>'qty')::numeric,
         nullif(e->>'receivedQty','')::numeric, e->>'receivedStatus',
         e->>'receivedAt', e->>'receivedBy', e->>'preparedBy'
  from jsonb_array_elements(coalesce(p_payload->'shipments', '[]'::jsonb)) as e;

  truncate transfers;
  insert into transfers (type, txn_id, txn_date, status, from_loc, to_loc, sku, name, qty)
  select e->>'type', e->>'txnId', e->>'date', e->>'status', e->>'from', e->>'to',
         e->>'sku', e->>'name', (e->>'qty')::numeric
  from jsonb_array_elements(coalesce(p_payload->'transfers', '[]'::jsonb)) as e;

  truncate purchases;
  insert into purchases (type, po_num, supplier, po_date, status, warehouse,
                         sku, name, qty, unit_price)
  select e->>'type', e->>'poNum', e->>'supplier', e->>'date', e->>'status',
         e->>'warehouse', e->>'sku', e->>'name',
         (e->>'qty')::numeric, (e->>'unitPrice')::numeric
  from jsonb_array_elements(coalesce(p_payload->'purchases', '[]'::jsonb)) as e;

  -- storage: แผ่ verifiedLockMap (object ของ array) → แถว lock_key + รายการสินค้า
  truncate storage;
  insert into storage (lock_key, sku, qty, sys_qty, status, last_check)
  select kv.key, it->>'sku', (it->>'qty')::numeric, (it->>'sysQty')::numeric,
         it->>'status', it->>'lastCheck'
  from jsonb_each(coalesce(p_payload->'storage'->'verifiedLockMap', '{}'::jsonb)) as kv
  cross join lateral jsonb_array_elements(kv.value) as it;

  -- 3) log
  insert into backup_runs (snapshot_date, products_count, orders_count, source, ok)
  values (p_snapshot_date, v_products, v_orders, p_source, true);

  return jsonb_build_object(
    'ok', true,
    'snapshot_date', p_snapshot_date,
    'products', v_products,
    'orders', v_orders
  );
end;
$$;
