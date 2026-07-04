// tests/drift-guard.test.js
// ─────────────────────────────────────────────────────────────────────────────
// ปัญหาเชิงโครงสร้าง: tests/helpers.js เก็บ "สำเนา" ของฟังก์ชันที่ copy มาด้วยมือ
// จากไฟล์ต้นทางจริง (appsscript_complete.gs / ui.jsx / views-*.jsx / app.jsx)
// ถ้ามีคนแก้โค้ดต้นทางแต่ลืมแก้สำเนาใน helpers.js → test ทั้งชุดยังเขียว
// แต่ production พังเงียบ ๆ (test ยืนยันแค่ว่า "สำเนาถูก" ไม่ใช่ "โค้ดจริงถูก")
//
// drift-guard นี้ดึง "landmark" (บรรทัด/นิพจน์ตรรกะธุรกิจที่ต้องตรงกันจริง)
// มาเทียบว่ามีอยู่ทั้งใน (1) ไฟล์ต้นทาง และ (2) helpers.js
// ถ้าฝั่งใดฝั่งหนึ่งถูกแก้จน landmark หาย → test แดง = สัญญาณว่า helpers.js drift แล้ว
//
// หมายเหตุการออกแบบ:
// - เทียบแบบ "ลบ whitespace + comment ทิ้งทั้งหมด" (squash) เพื่อไม่ false-fail
//   จากการจัดบรรทัด/เว้นวรรค/คอมเมนต์ที่ต่างกัน — สนใจแค่ "ตรรกะ" ที่เหมือนกัน
// - landmark = เฉพาะ "ตรรกะธุรกิจที่ต้องตรงกัน" เท่านั้น ส่วนที่ helpers.js
//   ดัดแปลงโดยตั้งใจ (null-guard เพิ่ม, ตัด Sheet I/O / cache / localStorage ออก)
//   จะไม่ถูก landmark — เพราะนั่นคือ "การ extract pure logic" ที่ตั้งใจไว้
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as helpers from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

// ลบ block comment, line comment (เก็บ :// ของ URL ไว้), แล้วลบ whitespace ทั้งหมด
function squash(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')        // block comments
    .replace(/([^:])\/\/[^\n]*/g, '$1')       // line comments (ไม่แตะ ://)
    .replace(/^[ \t]*\/\/[^\n]*/gm, '')       // line comments ที่ขึ้นต้นบรรทัด
    .replace(/\s+/g, '');                     // whitespace ทั้งหมด
}

const HELPERS = squash(read('tests/helpers.js'));
const SRC = {
  'appsscript_complete.gs': squash(read('appsscript_complete.gs')),
  'ui.jsx':                 squash(read('ui.jsx')),
  'views-main.jsx':         squash(read('views-main.jsx')),
  'views-analytics.jsx':    squash(read('views-analytics.jsx')),
  'app.jsx':                squash(read('app.jsx')),
};

// แต่ละ entry = ฟังก์ชัน/ค่าคงที่ที่ helpers.js copy มา
//   names     = ชื่อ export ใน helpers.js ที่ entry นี้ครอบคลุม (สำหรับ coverage meta-test)
//   sourceFile= ไฟล์ต้นทางที่ landmark ต้องมีอยู่
//   landmarks = นิพจน์ตรรกะที่ต้องตรงกันทั้งต้นทาง + helpers.js
const TRACKED = [
  // ── appsscript_complete.gs ──────────────────────────────────────────────
  { names: ['shouldRejectConflict'], sourceFile: 'appsscript_complete.gs', landmarks: [
    `if (!clientLoadedAt || !sheetLastModified) return false;`,
    `return sheetLastModified > Number(clientLoadedAt) + (slopMs || 5000);`,
  ]},
  { names: ['parseQty_'], sourceFile: 'appsscript_complete.gs', landmarks: [
    `if (s.includes('out of stock full')) return { num: 0, status: 'oosfull' };`,
    `const n = parseInt(String(val).replace(/[,\\s]/g, ''));`,
    `return { num: n, status: n < 0 ? 'negative' : 'ok' };`,
  ]},
  { names: ['parseNum_'], sourceFile: 'appsscript_complete.gs', landmarks: [
    `const n = parseFloat(String(val).replace(/[,\\s฿]/g, ''));`,
    `return isNaN(n) ? 0 : n;`,
  ]},
  { names: ['parseLocation_'], sourceFile: 'appsscript_complete.gs', landmarks: [
    `const m = String(loc).trim().match(/^([AB])(\\d+)\\/(\\d+)$/i);`,
    `side: m[1].toUpperCase(), shelf: +m[2], lock: +m[3]`,
  ]},
  { names: ['monthKey_'], sourceFile: 'appsscript_complete.gs', landmarks: [
    `let m = s.match(/^(\\d{1,2})\\/(\\d{4})$/);`,
    `m = s.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/);`,
  ]},
  { names: ['dayKey_'], sourceFile: 'appsscript_complete.gs', landmarks: [
    `const m = s.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/);`,
  ]},
  { names: ['deductStockCore'], sourceFile: 'appsscript_complete.gs', landmarks: [
    `let deductWH = Math.min(qty, whQty);`,
    `let deductFS = qty - deductWH;`,
    `if (deductFS > fsQty) deductFS = fsQty;`,
    `const shortfall = qty - (deductWH + deductFS);`,
  ]},
  // transferBatchCore: idempotency ต่างกันโดยตั้งใจ (helper=Set, ต้นทาง=CacheService)
  // จึงไม่ landmark บรรทัด cache — guard เฉพาะตรรกะ clamp/โอน/shortfall
  { names: ['transferBatchCore'], sourceFile: 'appsscript_complete.gs', landmarks: [
    `const actual = Math.min(qty, whQty);`,
    `const newWH  = whQty - actual;`,
    `const newFS  = fsQty + actual;`,
    `if (actual < qty) shortfalls.push({ sku, name, requested: qty, transferred: actual });`,
  ]},
  { names: ['netOf'], sourceFile: 'appsscript_complete.gs', landmarks: [
    `const ret = Math.max(0, Math.min(Number(item.returnedQty) || 0, qty));`,
  ]},
  { names: ['COL_PROD_SKU', 'COL_PROD_QTYFS', 'COL_PROD_QTYWH'], sourceFile: 'appsscript_complete.gs', landmarks: [
    `const COL_PROD_SKU    = 2;`,
    `const COL_PROD_QTYFS  = 7;`,
    `const COL_PROD_QTYWH  = 8;`,
  ]},

  // ── ui.jsx ──────────────────────────────────────────────────────────────
  { names: ['fmtN'], sourceFile: 'ui.jsx', landmarks: [
    `(n == null || isNaN(n)) ? "0" : Math.round(n).toLocaleString()`,
  ]},
  { names: ['fmtB'], sourceFile: 'ui.jsx', landmarks: [
    `if (a >= 1e6) return \`฿\${(n/1e6).toFixed(2)}M\`;`,
    `if (a >= 1e3) return \`฿\${(n/1e3).toFixed(1)}K\`;`,
  ]},
  { names: ['fmtPct'], sourceFile: 'ui.jsx', landmarks: [
    `n == null ? "—" : \`\${(n*100).toFixed(decimals)}%\``,
  ]},
  { names: ['monthLabel'], sourceFile: 'ui.jsx', landmarks: [
    `["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]`,
    `return \`\${names[parseInt(m,10)-1] || m} \${y ? y.slice(-2) : ""}\`;`,
  ]},

  // ── views-main.jsx ──────────────────────────────────────────────────────
  { names: ['stockQty'], sourceFile: 'views-main.jsx', landmarks: [
    `(p.qtyStore > 0 || p.qtyWH > 0)`,
    `? (p.qtyStore || 0) + (p.qtyWH || 0)`,
  ]},
  { names: ['whQty'], sourceFile: 'views-main.jsx', landmarks: [
    `if (p.warehouseQty != null) return p.warehouseQty;`,
    `return p.qty != null ? p.qty : 0;`,
  ]},
  { names: ['mtoBase'], sourceFile: 'views-main.jsx', landmarks: [
    `.replace(/\\s*#\\s*\\d+.*$/, '')`,
    `.replace(/\\s+\\d+\\s*$/, '')`,
  ]},
  { names: ['compareSku'], sourceFile: 'views-main.jsx', landmarks: [
    `const m = String(sku).match(/^([A-Za-z]+)(\\d{2})(\\d+)$/);`,
    `return pa.localeCompare(pb) || ca - cb || sa - sb;`,
  ]},
  { names: ['detectColor'], sourceFile: 'views-main.jsx', landmarks: [
    `for (const k of COLOR_KEYS) if (s.indexOf(k) >= 0) return COLOR_MAP[k];`,
  ]},
  { names: ['COLOR_MAP', 'COLOR_KEYS'], sourceFile: 'views-main.jsx', landmarks: [
    `"เขียวเข้ม":  { name:"เขียวเข้ม",  hex:"#1e5c1e", en:"GreenDark" }`,
    // compound-first ordering — สำคัญ: "น้ำเงิน" ต้องมาก่อน "เงิน", "เขียวเข้ม" ก่อน "เขียว"
    `"น้ำเงินเข้ม","น้ำเงินอ่อน","น้ำเงิน",`,
  ]},

  // ── views-analytics.jsx ─────────────────────────────────────────────────
  { names: ['orderSig'], sourceFile: 'views-analytics.jsx', landmarks: [
    `return \`\${(o.sku||'').trim().toUpperCase()}|\${String(o.date||'').replace(/\\D/g,'')}|\${o.orderQty||0}\`;`,
  ]},
  { names: ['stableOrderId'], sourceFile: 'views-analytics.jsx', landmarks: [
    `const parts = [o.sku || '', String(o.date || '').replace(/\\D/g, ''), String(o.orderQty || 0)];`,
  ]},
  { names: ['reconcileOrderState'], sourceFile: 'views-analytics.jsx', landmarks: [
    `const SIX_H = 6 * 60 * 60 * 1000;`,
    `if (local.sig && local.sig !== sig) return {};`,
    `const isRecent = !isNaN(markedMs) && (now - markedMs) < SIX_H;`,
  ]},
  { names: ['patchOrderStateCore'], sourceFile: 'views-analytics.jsx', landmarks: [
    `const prev = (sig != null && s[id] && s[id].sig && s[id].sig !== sig) ? {} : (s[id] || {});`,
    `if (sig != null) s[id].sig = sig;`,
  ]},
  { names: ['cleanupOrdersStateCore'], sourceFile: 'views-analytics.jsx', landmarks: [
    `if (e.sig && !sigs.has(e.sig) && !ids.has(id))`,
  ]},

  // ── app.jsx ─────────────────────────────────────────────────────────────
  { names: ['monthsSince'], sourceFile: 'app.jsx', landmarks: [
    `if (/^\\d{4}-\\d{2}-\\d{2}/.test(d)) {`,
    `let mo = (now.getFullYear() - ref.getFullYear()) * 12 + (now.getMonth() - ref.getMonth());`,
    `if (now.getDate() < ref.getDate()) mo -= 1;`,
    `return mo < 0 ? 0 : mo;`,
  ]},
  { names: ['enrichDataCore'], sourceFile: 'app.jsx', landmarks: [
    `const THAI_RE = /[฀-๿]/;`,
    `p.supplierTags = rawTags.filter(t => !THAI_RE.test(t));`,
    `if (p.supplierTags.length) p.vendor = p.supplierTags[0];`,
  ]},

  // ── analytics (Sprint: YoY + ABC + thresholds ถาวร) ─────────────────────
  { names: ['buildYoYSeries'], sourceFile: 'views-main.jsx', landmarks: [
    `.map(m => String(m).split("/")[1])`,
    `const cats = (monthlyByCat || {})[mm + "/" + y];`,
    `row["y" + y] = rev;`,
  ]},
  { names: ['abcClassify'], sourceFile: 'views-analytics.jsx', landmarks: [
    `if (total <= 0 || p.rev <= 0) { map[p.sku] = "C"; return; }`,
    `map[p.sku] = before < 0.8 ? "A" : before < 0.95 ? "B" : "C";`,
  ]},
  // sanitizeThresholds: ชื่อในต้นทางเป็น sanitizeThresholds_ (GAS convention)
  // landmark เลี่ยงชื่อ THRESHOLDS_DEFAULT เพราะต้นทางใช้ THRESHOLDS_DEFAULT_ (underscore)
  { names: ['sanitizeThresholds', 'THRESHOLDS_DEFAULT'], sourceFile: 'appsscript_complete.gs', landmarks: [
    `overrides: { "แจกันแก้ว": 3, "เรซิ่นและอื่นๆ": 3 },`,
    `var def = parseInt(t.default, 10);`,
    `coverMonths: (isNaN(cover) || cover < 1 || cover > 24) ?`,
    `if (!isNaN(v) && v >= 0 && v <= 100000) out.overrides[String(cat).slice(0, 100)] = v;`,
  ]},
];

// ฟังก์ชันใน helpers.js ที่เป็น "behavioral model" (จำลองพฤติกรรม ไม่ใช่ copy บรรทัดตรง ๆ)
// → ไม่มี landmark เทียบบรรทัดได้ ครอบคลุมด้วย behavior test แทน (mto.test.js, schema.test.js)
const BEHAVIORAL_MODELS = new Set([
  'writeMtoItemsCore',  // จำลอง ลบ draft rows + append (closeMtoJob/saveMtoJobItems) — ดู mto.test.js
  'mapProductRow',      // mapper สำหรับเทสต์ ใช้ COL_PROD_* (ซึ่ง guard อยู่แล้ว) — ดู schema.test.js
]);

describe('drift-guard: landmark ตรงกันทั้งต้นทาง + helpers.js', () => {
  for (const t of TRACKED) {
    describe(`${t.names.join(', ')} ← ${t.sourceFile}`, () => {
      for (const lm of t.landmarks) {
        const needle = squash(lm);
        it(`มีในต้นทาง (${t.sourceFile}): ${lm.slice(0, 60)}`, () => {
          if (!SRC[t.sourceFile].includes(needle))
            throw new Error(`DRIFT: ไม่พบ landmark ในต้นทาง ${t.sourceFile}\n  → "${lm}"\n  อาจมีคนแก้ต้นทางแล้วบรรทัดนี้เปลี่ยนไป — อัปเดต landmark หรือ helpers.js`);
          expect(true).toBe(true);
        });
        it(`มีใน helpers.js: ${lm.slice(0, 60)}`, () => {
          if (!HELPERS.includes(needle))
            throw new Error(`DRIFT: ไม่พบ landmark ใน tests/helpers.js\n  → "${lm}"\n  helpers.js drift จากต้นทาง ${t.sourceFile} แล้ว — sync สำเนาให้ตรง`);
          expect(true).toBe(true);
        });
      }
    });
  }
});

// meta-test: export ใหม่ทุกตัวใน helpers.js ต้องถูก track หรือขึ้นบัญชี behavioral model
// → บังคับให้คนที่ copy ฟังก์ชันใหม่เข้า helpers.js มาเพิ่ม drift-guard ด้วยเสมอ
describe('drift-guard: ทุก export ใน helpers.js ถูกเฝ้าครบ', () => {
  const trackedNames = new Set(TRACKED.flatMap(t => t.names));
  // 'default' = key ที่ ESM interop ใส่มาให้ตอน import CJS module (module.exports) — ข้าม
  const exported = Object.keys(helpers).filter(k => k !== 'default');

  for (const name of exported) {
    it(`"${name}" ถูก track หรือเป็น behavioral model`, () => {
      const covered = trackedNames.has(name) || BEHAVIORAL_MODELS.has(name);
      if (!covered)
        throw new Error(`export "${name}" ใน helpers.js ยังไม่มี drift-guard\n  ถ้าเป็นสำเนาจากต้นทาง: เพิ่ม entry ใน TRACKED พร้อม landmark\n  ถ้าเป็น behavioral model: เพิ่มชื่อใน BEHAVIORAL_MODELS`);
      expect(covered).toBe(true);
    });
  }
});
