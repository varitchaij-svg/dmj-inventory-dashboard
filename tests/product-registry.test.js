// tests/product-registry.test.js — Phase 3 · Product Domain Registry Foundation (D06–D09)
// ─────────────────────────────────────────────────────────────────────────────
// eval ฟังก์ชัน "จริง" จาก appsscript_complete.gs ไม่ copy (เหมือน auth.test.js)
// คุม pure helpers ของทั้ง 4 registry: Prefix (D06) · Family (D07) · Form (D08) · Variant (D09)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

// ── ดึงทั้ง section registry (ตั้งแต่ marker D06 ถึงท้ายไฟล์) มา eval แล้วส่งฟังก์ชันออกมา ──
// ฟังก์ชัน handler อ้าง GAS globals แต่ไม่ถูก "เรียก" ตอน eval (แค่ประกาศ) จึงปลอดภัย
function loadRegistry() {
  const start = SRC.indexOf('// ── D06 · Prefix Registry');
  if (start < 0) throw new Error('หา section registry ในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?)');
  const block = SRC.slice(start);
  const ret = `; return {
    prefixRegNormalize_, prefixRegValidate_, prefixRegStatusValid_, prefixRegCanBeActive_,
    prefixRegListFromRows_, prefixRegFindRow_, PREFIX_REG_COL, PREFIX_REG_STATUSES,
    familyRegNormName_, familyRegValidate_, familyRegListFromRows_, familyRegFindByName_,
    familyRegNextId_, FAMILY_REG_COL, FAMILY_ID_PREFIX,
    formRegAxisValid_, formRegListFromRows_, formRegNextId_, formRegFindByPrefixModel_,
    FORM_REG_COL, FORM_ID_PREFIX, FORM_VARIANT_AXES,
    variantRegAxisValid_, variantRegMapFromRows_, variantRegValidate_, VARIANT_REG_COL
  };`;
  // eslint-disable-next-line no-new-func
  return new Function(block + ret)();
}
const R = loadRegistry();

// helper: สร้างแถว prefix registry (8 คอลัมน์) จาก {prefix,status,label}
function prefixRow({ prefix = '', status = 'ACTIVE', label = '' } = {}) {
  return [prefix, status, label, '', '', '', '', ''];
}
function familyRow({ id = '', name = '', status = 'ACTIVE' } = {}) {
  return [id, name, status, '', '', '', '', ''];
}
function formRow({ id = '', baseName = '', category = '', family = '', prefix = '', model = '', axis = 'NONE', status = 'ACTIVE' } = {}) {
  return [id, baseName, category, family, prefix, model, axis, status, '', '', '', '', ''];
}
function variantRow({ axis = '', code = '', label = '', status = 'ACTIVE' } = {}) {
  return [axis, code, label, status, '', '', ''];
}

// ═══════════════════ D06 · Prefix Registry ═══════════════════
describe('D06 Prefix Registry — pure helpers', () => {
  it('normalize: uppercases + strips non A-Z', () => {
    expect(R.prefixRegNormalize_(' ol ')).toBe('OL');
    expect(R.prefixRegNormalize_('r1')).toBe('R');       // ตัดเลขทิ้ง
    expect(R.prefixRegNormalize_('l')).toBe('L');
    expect(R.prefixRegNormalize_('')).toBe('');
    expect(R.prefixRegNormalize_(null)).toBe('');
  });

  it('validate: A-Z 1-3 ตัวเท่านั้น', () => {
    expect(R.prefixRegValidate_('OL')).toEqual({ ok: true, prefix: 'OL' });
    expect(R.prefixRegValidate_('ORL')).toEqual({ ok: true, prefix: 'ORL' });
    expect(R.prefixRegValidate_('').ok).toBe(false);
    expect(R.prefixRegValidate_('ABCD').ok).toBe(false); // 4 ตัว
    expect(R.prefixRegValidate_('123').ok).toBe(false);  // ไม่มีตัวอักษรเลย
  });

  it('status valid: ACTIVE/FROZEN (case-insensitive)', () => {
    expect(R.prefixRegStatusValid_('ACTIVE')).toBe(true);
    expect(R.prefixRegStatusValid_('frozen')).toBe(true);
    expect(R.prefixRegStatusValid_('OPEN')).toBe(false);
    expect(R.prefixRegStatusValid_('')).toBe(false);
  });

  it('🔒 L ห้ามเป็น ACTIVE (D05/D06 FREEZE)', () => {
    expect(R.prefixRegCanBeActive_('L')).toBe(false);
    expect(R.prefixRegCanBeActive_('l')).toBe(false);   // normalized
    expect(R.prefixRegCanBeActive_(' L ')).toBe(false);
    expect(R.prefixRegCanBeActive_('OL')).toBe(true);
    expect(R.prefixRegCanBeActive_('R')).toBe(true);
  });

  it('listFromRows: dedup latest per prefix · unknown status → FROZEN', () => {
    const rows = [
      prefixRow({ prefix: 'R', status: 'ACTIVE', label: 'กุหลาบ' }),
      prefixRow({ prefix: 'OL', status: 'ACTIVE' }),
      prefixRow({ prefix: 'R', status: 'FROZEN', label: 'กุหลาบใหม่' }), // เขียนทับ R
      prefixRow({ prefix: 'X', status: 'weird' }),                       // ไม่รู้จัก → FROZEN
    ];
    const list = R.prefixRegListFromRows_(rows);
    const byPfx = Object.fromEntries(list.map(x => [x.prefix, x]));
    expect(list.length).toBe(3);                       // R,OL,X (R เขียนทับไม่เพิ่มแถว)
    expect(byPfx.R.status).toBe('FROZEN');
    expect(byPfx.R.label).toBe('กุหลาบใหม่');
    expect(byPfx.X.status).toBe('FROZEN');
  });

  it('findRow: คืน index (0-based) หรือ -1', () => {
    const rows = [prefixRow({ prefix: 'R' }), prefixRow({ prefix: 'OL' })];
    expect(R.prefixRegFindRow_(rows, 'ol')).toBe(1);
    expect(R.prefixRegFindRow_(rows, 'ZZ')).toBe(-1);
  });
});

// ═══════════════════ D07 · Business Family Registry ═══════════════════
describe('D07 Business Family Registry — pure helpers', () => {
  it('normName: ตัดช่องว่าง/ตัวพิมพ์ (กัน duplicate ที่สะกดต่างช่องว่าง)', () => {
    expect(R.familyRegNormName_('Ya Ya')).toBe(R.familyRegNormName_('YaYa'));
    expect(R.familyRegNormName_(' ไฮเดรนเยีย ')).toBe(R.familyRegNormName_('ไฮเดรนเยีย'));
  });

  it('validate: ต้องมีชื่อ · ไม่ยาวเกิน', () => {
    expect(R.familyRegValidate_('ไฮเดรนเยีย').ok).toBe(true);
    expect(R.familyRegValidate_('   ').ok).toBe(false);
    expect(R.familyRegValidate_('x'.repeat(121)).ok).toBe(false);
  });

  it('findByName: จับคู่แบบ normalized คืน family_id', () => {
    const rows = [
      familyRow({ id: 'FAM00001', name: 'ไฮเดรนเยีย' }),
      familyRow({ id: 'FAM00002', name: 'กุหลาบ' }),
    ];
    expect(R.familyRegFindByName_(rows, ' ไฮเดรนเยีย ')).toBe('FAM00001');
    expect(R.familyRegFindByName_(rows, 'ทานตะวัน')).toBe(null);
  });

  it('nextId: FAM00001 จากว่าง · +1 จาก max', () => {
    expect(R.familyRegNextId_([])).toBe('FAM00001');
    const rows = [familyRow({ id: 'FAM00001' }), familyRow({ id: 'FAM00005' })];
    expect(R.familyRegNextId_(rows)).toBe('FAM00006');   // อิง max ไม่ใช่จำนวนแถว
  });

  it('list: คืน familyId/name/status', () => {
    const rows = [familyRow({ id: 'FAM00001', name: 'ก', status: 'ACTIVE' })];
    expect(R.familyRegListFromRows_(rows)).toEqual([{ familyId: 'FAM00001', name: 'ก', status: 'ACTIVE' }]);
  });
});

// ═══════════════════ D08 · Product Type/Form Registry ═══════════════════
describe('D08 Product Type/Form Registry — pure helpers', () => {
  it('axis valid: COLOR/SIZE/MATERIAL/STYLE/NONE', () => {
    ['COLOR', 'SIZE', 'MATERIAL', 'STYLE', 'NONE', 'color'].forEach(a =>
      expect(R.formRegAxisValid_(a)).toBe(true));
    expect(R.formRegAxisValid_('FOO')).toBe(false);
  });

  it('nextId: FRM00001 · +1 จาก max', () => {
    expect(R.formRegNextId_([])).toBe('FRM00001');
    expect(R.formRegNextId_([formRow({ id: 'FRM00009' })])).toBe('FRM00010');
  });

  it('findByPrefixModel: เจอ form_id ที่ prefix+model ตรง (กัน Form ซ้ำ)', () => {
    const rows = [
      formRow({ id: 'FRM00001', prefix: 'R', model: '025' }),
      formRow({ id: 'FRM00002', prefix: 'OL', model: '001' }),
    ];
    expect(R.formRegFindByPrefixModel_(rows, 'r', '025')).toBe('FRM00001');
    expect(R.formRegFindByPrefixModel_(rows, 'R', '999')).toBe(null);
    expect(R.formRegFindByPrefixModel_(rows, '', '025')).toBe(null); // prefix ว่าง → ไม่จับ
  });

  it('list: nullable family_id → null เมื่อว่าง (D07 optional per Form)', () => {
    const rows = [
      formRow({ id: 'FRM00001', baseName: 'กุหลาบดอกเดี่ยว', prefix: 'R', model: '025', axis: 'COLOR', family: '' }),
      formRow({ id: 'FRM00002', baseName: 'ไฮเดรนเยีย', prefix: 'H', model: '041', axis: 'COLOR', family: 'FAM00001' }),
    ];
    const list = R.formRegListFromRows_(rows);
    expect(list[0].familyId).toBe(null);          // ไม่มี family → null
    expect(list[1].familyId).toBe('FAM00001');
    expect(list[0].axis).toBe('COLOR');
    expect(list[0].prefix).toBe('R');
  });
});

// ═══════════════════ D09 · Variant Value Registry ═══════════════════
describe('D09 Variant Value Registry — pure helpers', () => {
  it('axis valid', () => {
    expect(R.variantRegAxisValid_('SIZE')).toBe(true);
    expect(R.variantRegAxisValid_('bogus')).toBe(false);
  });

  it('validate: axis ถูก + code 2 หลัก + มี label', () => {
    expect(R.variantRegValidate_('COLOR', '01', 'ชมพู')).toEqual({ ok: true, axis: 'COLOR', code: '01', label: 'ชมพู' });
    expect(R.variantRegValidate_('SIZE', '1', 'S').ok).toBe(false);   // code ไม่ใช่ 2 หลัก
    expect(R.variantRegValidate_('COLOR', '01', '').ok).toBe(false);  // ไม่มี label
    expect(R.variantRegValidate_('FOO', '01', 'x').ok).toBe(false);   // axis ผิด
  });

  it('🔑 axis-scoped: code เดียวกันต่าง axis คือคนละความหมาย (D09 · KB096 lesson)', () => {
    const rows = [
      variantRow({ axis: 'COLOR', code: '01', label: 'แดง' }),
      variantRow({ axis: 'SIZE', code: '01', label: 'S' }),   // "01" ใน SIZE = S ไม่ใช่แดง
      variantRow({ axis: 'SIZE', code: '02', label: 'M' }),
    ];
    const map = R.variantRegMapFromRows_(rows);
    expect(map.COLOR.find(x => x.code === '01').label).toBe('แดง');
    expect(map.SIZE.find(x => x.code === '01').label).toBe('S');   // คนละความหมายกับ COLOR 01
    expect(map.SIZE.length).toBe(2);
  });

  it('axis-scoped uniqueness: code ซ้ำใน axis เดียว → เขียนทับ (แถวหลังชนะ)', () => {
    const rows = [
      variantRow({ axis: 'COLOR', code: '01', label: 'แดง' }),
      variantRow({ axis: 'COLOR', code: '01', label: 'แดงสด' }),   // เขียนทับ
    ];
    const map = R.variantRegMapFromRows_(rows);
    expect(map.COLOR.length).toBe(1);
    expect(map.COLOR[0].label).toBe('แดงสด');
  });
});

// ═══════════════════ Meta: wiring / safety guards ═══════════════════
describe('Phase A wiring + safety (scan ต้นทางจริง)', () => {
  it('dispatch: ทุก list/save action ถูก route ใน doPost', () => {
    ['listPrefixRegistry', 'savePrefixRegistry', 'listFamilyRegistry', 'saveFamilyRegistry',
     'listFormRegistry', 'listVariantRegistry', 'saveVariantRegistry'].forEach(a => {
      expect(SRC).toContain(`data.action === '${a}'`);
    });
  });

  it('list actions อยู่ใน COMMON_ACTIONS_ (อ่านได้ทุก role เมื่อเปิด REQUIRE_LOGIN)', () => {
    const common = SRC.match(/var COMMON_ACTIONS_ = \[[\s\S]*?\];/)[0];
    ['listPrefixRegistry', 'listFamilyRegistry', 'listFormRegistry', 'listVariantRegistry']
      .forEach(a => expect(common).toContain(a));
    // ⚠️ save* ต้องไม่อยู่ใน COMMON (admin-only) — กันเผลอเปิดสิทธิ์เขียนให้ทุก role
    ['savePrefixRegistry', 'saveFamilyRegistry', 'saveVariantRegistry']
      .forEach(a => expect(common).not.toContain(a));
  });

  it('save handlers hard-gate isAdminRole_ (deny-by-default เขียน)', () => {
    ['savePrefixRegistryHandler_', 'saveFamilyRegistryHandler_', 'saveVariantRegistryHandler_'].forEach(fn => {
      const body = SRC.match(new RegExp('function ' + fn + '\\([\\s\\S]*?\\n\\}\\n'));
      expect(body, fn + ' ไม่พบ').toBeTruthy();
      expect(body[0], fn + ' ต้องเช็ค isAdminRole_').toContain('isAdminRole_');
      expect(body[0], fn + ' ต้องจับ LockService').toContain('LockService.getScriptLock');
    });
  });

  it('list handlers gate ด้วย *_ENABLED (SAFE ROLLOUT — คืน off:true)', () => {
    ['listPrefixRegistryHandler_', 'listFamilyRegistryHandler_', 'listFormRegistryHandler_', 'listVariantRegistryHandler_']
      .forEach(fn => {
        const body = SRC.match(new RegExp('function ' + fn + '\\([\\s\\S]*?\\n\\}\\n'))[0];
        expect(body, fn + ' ต้องเช็ค *Enabled_').toMatch(/RegistryEnabled_\(\)/);
        expect(body, fn + ' ต้องคืน off:true เมื่อปิด').toContain('off:true');
      });
  });

  it('setup เปิดครบ 4 flag + seed Color · disable ปิดครบ 4', () => {
    const setup = SRC.match(/function setupProductRegistry\(\)[\s\S]*?\n\}/)[0];
    ['PREFIX_REGISTRY_ENABLED', 'FAMILY_REGISTRY_ENABLED', 'FORM_REGISTRY_ENABLED', 'VARIANT_REGISTRY_ENABLED']
      .forEach(f => expect(setup).toContain(f));
    expect(setup).toContain('VARIANT_COLOR_CODES_SEED_');
    const disable = SRC.match(/function disableProductRegistry\(\)[\s\S]*?\n\}/)[0];
    ['PREFIX_REGISTRY_ENABLED', 'FAMILY_REGISTRY_ENABLED', 'FORM_REGISTRY_ENABLED', 'VARIANT_REGISTRY_ENABLED']
      .forEach(f => expect(disable).toContain(f));
  });

  it('seed Color ครบ 99 รหัส ตรงกับ VARIANT_COLOR_CODES ใน views-main.jsx', () => {
    const seed = SRC.match(/function VARIANT_COLOR_CODES_SEED_\(\)[\s\S]*?\n\}/)[0];
    const codes = [...seed.matchAll(/code:"(\d{2})"/g)].map(m => m[1]);
    expect(codes.length).toBe(99);
    expect(codes[0]).toBe('01');
    expect(codes[98]).toBe('99');
    const jsx = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
    const jsxCodes = [...jsx.matchAll(/code:"(\d{2})",name:/g)].map(m => m[1]);
    expect(codes).toEqual(jsxCodes);   // seed ตรงกับตารางสีจริงเป๊ะ
  });
});
