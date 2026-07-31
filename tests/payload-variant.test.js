// tests/payload-variant.test.js — payload ต่อ role + การย่อ/กางยอดรายเดือน (ฝั่ง GAS)
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน auth.test.js: **ไม่ copy โค้ดเข้า helpers.js** แต่ eval ฟังก์ชันจริงจาก .gs
// เพราะตรรกะนี้ตัดสินว่า "role ไหนได้ข้อมูลอะไร" — ถ้าสำเนา drift เทสต์จะเขียวทั้งที่
// ของจริงส่งข้อมูลขาดจนหน้าพัง (หรือส่งเกินจนไม่ได้ประโยชน์ด้านความเร็ว)
//
// สิ่งที่คุมไว้:
//   1. role → variant ถูกต้อง และ role แปลก ๆ ต้องได้ payload เต็ม (ไม่ใช่ขาด)
//   2. คีย์ที่ตัดต้องตรงกับที่ mirror ไว้ใน tests/browser/harness.html
//   3. เส้นทาง legacy (client เก่าไม่ส่ง pv) ต้องกางกลับได้ผลเท่ากับที่ client ใหม่กางเอง
//      — ถ้าสองฝั่งไม่ตรงกัน เครื่องที่ยังรันโค้ดเก่าจะได้ตัวเลขคนละชุดแบบไม่มี error
//   4. คีย์ cache ของแต่ละ variant/encoding ต้องไม่ชนกัน (ชนกัน = role หนึ่งเห็นข้อมูลของอีก role)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { expandMonthlyCompact } from './helpers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const HARNESS = readFileSync(join(ROOT, 'tests/browser/harness.html'), 'utf8');

function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

const P = (() => {
  const code = [
    grab(/const PAYLOAD_VARIANT_DROPS_ = \{[\s\S]*?\n\};/),
    grab(/const PAYLOAD_ROLE_VARIANT_ = \{[\s\S]*?\n\};/),
    grab(/const PAYLOAD_VARIANTS_ = \[[\s\S]*?\];/),
    grab(/const _CACHE_KEY_COUNT = '[^']*';/),
    grab(/const _CACHE_KEY_PART {2}= '[^']*';/),
    grab(/function _cacheKeyCount_\(variant\) \{[\s\S]*?\n\}/),
    grab(/function _cacheKeyPart_\(variant\) \{[\s\S]*?\n\}/),
    grab(/function payloadVariantForRole_\(role\) \{[\s\S]*?\n\}/),
    grab(/function payloadEncodingForRequest_\(e\) \{[\s\S]*?\n\}/),
    grab(/function payloadCacheVariant_\(variant, enc\) \{[\s\S]*?\n\}/),
    grab(/function expandMonthlyForLegacy_\(data\) \{[\s\S]*?\n\}/),
    grab(/function shapePayloadForVariant_\(data, variant\) \{[\s\S]*?\n\}/),
    `return { PAYLOAD_VARIANT_DROPS_, PAYLOAD_ROLE_VARIANT_, PAYLOAD_VARIANTS_,
              payloadVariantForRole_, payloadEncodingForRequest_, payloadCacheVariant_,
              expandMonthlyForLegacy_, shapePayloadForVariant_,
              _cacheKeyCount_, _cacheKeyPart_ };`,
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(code)();
})();

const LABELS = ['01/2026', '02/2026', '03/2026'];
const samplePayload = () => ({
  monthLabels: LABELS,
  products: [
    { sku: 'A', mo: [[1, 5, 500]] },
    { sku: 'B', mo: [] },
    { sku: 'C' },                     // ไม่มีข้อมูลขายเลย
  ],
  orders: [], shipments: [], storage: {}, mtoJobs: [],
  monthlyByCat: {}, dailyByCat: {}, dayLabels: [], purchases: [],
  transfers: [], transferStats: {},
});

describe('role → payload variant', () => {
  it('owner/dev ได้ payload เต็ม', () => {
    expect(P.payloadVariantForRole_('owner')).toBe('full');
    expect(P.payloadVariantForRole_('dev')).toBe('full');
  });
  it('employee ได้ ops (ยังมีประวัติโอน เพราะมีแท็บ "โอน/ปรับ/ยกมา")', () => {
    expect(P.payloadVariantForRole_('employee')).toBe('ops');
    expect(P.PAYLOAD_VARIANT_DROPS_.ops).not.toContain('transfers');
  });
  it('role หน้างานที่ไม่มีแท็บวิเคราะห์/โอน ได้ lite', () => {
    ['warehouse', 'frontstore', 'saler', 'storedevice'].forEach(r => {
      expect(P.payloadVariantForRole_(r)).toBe('lite');
    });
  });
  it('role ที่ไม่รู้จัก/ว่าง → full เสมอ (ส่งเกินดีกว่าส่งขาดจนหน้าพัง)', () => {
    [undefined, null, '', 'ไม่มีตำแหน่งนี้', 'OWNER '].forEach(r => {
      expect(P.payloadVariantForRole_(r)).toBe('full');
    });
  });
  it('ทุก variant ที่ map ไว้ ต้องมีนิยามใน PAYLOAD_VARIANT_DROPS_ และอยู่ใน PAYLOAD_VARIANTS_', () => {
    Object.values(P.PAYLOAD_ROLE_VARIANT_).forEach(v => {
      expect(P.PAYLOAD_VARIANT_DROPS_[v]).toBeDefined();
      expect(P.PAYLOAD_VARIANTS_).toContain(v);
    });
  });
});

describe('shapePayloadForVariant_ — ตัดเฉพาะคีย์ที่ตั้งใจ', () => {
  it('full ไม่ตัดอะไรเลย (คืน object เดิม)', () => {
    const d = samplePayload();
    expect(P.shapePayloadForVariant_(d, 'full')).toBe(d);
  });
  it('lite ตัดกราฟ/ซื้อ/โอน แต่ยังเก็บของที่ทุกหน้าต้องใช้', () => {
    const out = P.shapePayloadForVariant_(samplePayload(), 'lite');
    ['monthlyByCat', 'dailyByCat', 'dayLabels', 'purchases', 'transfers', 'transferStats']
      .forEach(k => expect(out[k]).toBeUndefined());
    // ⚠️ ห้ามตัด: CategoryView/StockView ของทุก role ใช้ยอดรายเดือน + monthLabels เป็นฐานดัชนี
    expect(out.products).toBeDefined();
    expect(out.monthLabels).toEqual(LABELS);
    expect(out.products[0].mo).toEqual([[1, 5, 500]]);
    ['orders', 'shipments', 'storage', 'mtoJobs'].forEach(k => expect(out[k]).toBeDefined());
  });
  it('ไม่แก้ object เดิม (ผู้เรียกยังใช้ full ต่อได้ — doGet แตกหลาย variant จากก้อนเดียว)', () => {
    const d = samplePayload();
    P.shapePayloadForVariant_(d, 'lite');
    expect(d.purchases).toBeDefined();
    expect(d.transfers).toBeDefined();
  });
});

describe('payload version (pv) — ช่วงเปลี่ยนผ่านตอน deploy', () => {
  it('ไม่ส่ง pv = client เก่า → encoding 1 (รูปแบบเดิม)', () => {
    expect(P.payloadEncodingForRequest_(undefined)).toBe(1);
    expect(P.payloadEncodingForRequest_({ parameter: {} })).toBe(1);
    expect(P.payloadEncodingForRequest_({ parameter: { pv: '1' } })).toBe(1);
  });
  it('pv=2 → encoding 2 (ยอดรายเดือนแบบย่อ)', () => {
    expect(P.payloadEncodingForRequest_({ parameter: { pv: '2' } })).toBe(2);
    expect(P.payloadEncodingForRequest_({ parameter: { pv: 2 } })).toBe(2);
  });

  it('client เก่าได้ผลเท่ากับที่ client ใหม่กางเอง (สองฝั่งต้องตรงกันเป๊ะ)', () => {
    const legacy = P.expandMonthlyForLegacy_(samplePayload());
    const modern = expandMonthlyCompact(samplePayload());
    expect(legacy.products.map(p => p.monthly)).toEqual(modern.products.map(p => p.monthly));
  });
  it('legacy: สินค้าที่ไม่มีข้อมูลขาย ต้องไม่มี monthly โผล่ขึ้นมา', () => {
    const legacy = P.expandMonthlyForLegacy_(samplePayload());
    expect(legacy.products[2].monthly).toBeUndefined();
  });
  it('legacy: `mo` ว่าง → monthly ยาวเท่าจำนวนเดือน (ใช้แยก "ไม่มีข้อมูล" ออกจาก "ไม่ขาย")', () => {
    const legacy = P.expandMonthlyForLegacy_(samplePayload());
    expect(legacy.products[1].monthly).toHaveLength(LABELS.length);
  });
  it('legacy: ไม่ทิ้งคีย์อื่นของ payload', () => {
    const legacy = P.expandMonthlyForLegacy_(samplePayload());
    expect(legacy.purchases).toBeDefined();
    expect(legacy.monthLabels).toEqual(LABELS);
  });
});

describe('คีย์ cache — ห้ามชนกันข้าม role/encoding', () => {
  it('ทุก variant × ทุก encoding ได้คีย์ไม่ซ้ำกัน', () => {
    const keys = new Set();
    P.PAYLOAD_VARIANTS_.forEach(v => {
      [1, 2].forEach(enc => {
        const cv = P.payloadCacheVariant_(v, enc);
        keys.add(P._cacheKeyCount_(cv));
        keys.add(P._cacheKeyPart_(cv));
      });
    });
    expect(keys.size).toBe(P.PAYLOAD_VARIANTS_.length * 2 * 2);
  });
  // หมายเหตุ: prefix ของ variant 'full' ('dmj_payload_') เป็นคำนำหน้าของ variant อื่น
  // ('dmj_payload_ops_') โดยตั้งใจ — คงคีย์เดิมไว้ให้ cache ที่อุ่นอยู่ก่อน deploy ยังใช้ได้
  // ไม่ชนกันจริงเพราะคีย์เต็มลงท้ายด้วย "เลข chunk" เสมอ ('dmj_payload_0' ≠ 'dmj_payload_ops_0')
  // เทสต์นี้จึงตรวจ "คีย์เต็มไม่ซ้ำ" ซึ่งเป็นเงื่อนไขจริง แทนการห้าม prefix ซ้อนกัน
  it('คีย์ chunk เต็ม ๆ ของทุก variant × ทุก index ต้องไม่ซ้ำกัน', () => {
    const seen = new Set();
    let total = 0;
    P.PAYLOAD_VARIANTS_.forEach(v => [1, 2].forEach(enc => {
      const prefix = P._cacheKeyPart_(P.payloadCacheVariant_(v, enc));
      for (let i = 0; i < 200; i++) { seen.add(prefix + i); total++; }
    }));
    expect(seen.size).toBe(total);
  });
});

describe('harness ของ browser test ต้อง mirror ตารางฝั่ง GAS ให้ตรง', () => {
  // ถ้าไม่ตรง เทสต์ browser จะรันด้วย payload ผิดชุด แล้วเคลมว่าผ่านทั้งที่ของจริงพัง
  it('รายการคีย์ที่ตัดของแต่ละ variant ตรงกัน', () => {
    Object.keys(P.PAYLOAD_VARIANT_DROPS_).forEach(v => {
      const drops = P.PAYLOAD_VARIANT_DROPS_[v];
      if (!drops.length) return;
      const m = HARNESS.match(new RegExp(`${v}:\\s*\\[([^\\]]*)\\]`));
      expect(m, `harness.html ไม่มี variant "${v}"`).toBeTruthy();
      const inHarness = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      expect(inHarness.sort()).toEqual([...drops].sort());
    });
  });
  it('role → variant ตรงกัน', () => {
    Object.keys(P.PAYLOAD_ROLE_VARIANT_).forEach(r => {
      expect(HARNESS).toMatch(new RegExp(`${r}:\\s*'${P.PAYLOAD_ROLE_VARIANT_[r]}'`));
    });
  });
});
