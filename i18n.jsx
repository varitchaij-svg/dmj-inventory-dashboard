// ────────────────────────────────────────────────────────────────────────
// ระบบหลายภาษา (i18n) — ไทย / English / မြန်မာ
// โหลด **ก่อน** ui.jsx (ดูลำดับ <script> ใน "Doomuenjing Dashboard.html") เพื่อให้
// `t()` / `getLang()` / `setLang()` / `useLang()` เป็น global ที่ทุกไฟล์เรียกได้ทันที
//
// หลักการ (Phase 7 i18n — ส.ค. 2026):
//  • **ใช้ "ข้อความไทย" เป็น key** — `t("ลงเวลาเข้างาน")` · ไม่เจอคำแปล → คืนไทยเหมือนเดิม
//    → ทยอยแปลทีละหน้าได้ **ปลอดภัยบน production** (ขาดคำแปล = เห็นไทย ไม่ใช่จอพัง)
//  • **แปลเฉพาะหน้าพนักงาน + ล็อกอิน** (คนที่ต้องใช้พม่า = แรงงาน role employee/warehouse/
//    frontstore) · หน้าเจ้าของ (analytics/POS/ใบเสนอราคา/ใบกำกับ/ผลงานพนักงาน) คงไทยไว้
//  • **ห้ามแปลค่าจากชีต** (ชื่อสินค้า/หมวด/ลูกค้า) · ตัวเลข/เงิน/วันที่ คงเดิม
//
// ⚠️ กติกาเวลาใช้ `t()` (กันบั๊กเงียบ — บทเรียนเดียวกับ constant/useMemo ค้างค่า):
//  • ข้อความที่ฝังใน **constant ระดับโมดูล / useMemo** (เช่น TABS[].label, ROLE_LABELS)
//    ให้ **เก็บ constant เป็นไทยไว้เหมือนเดิม แล้วครอบ `t()` ตอน render ที่ปลายทาง**
//    (`t(tab.label)`) ไม่ใช่ครอบตอนประกาศ constant — ไม่งั้นเปลี่ยนภาษาแล้วป้ายค้างภาษาเดิม
//  • เปลี่ยนภาษา = App เรียก `useLang()` (subscribe) → re-render ทั้งต้นไม้ → `t()` อ่านค่าใหม่
//
// ⚠️ ฟอนต์พม่า: ใช้ **Myanmar Unicode** (ไม่ใช่ Zawgyi) · font-stack เผื่อไว้ใน CSS ของ HTML แล้ว
// ⚠️ คำแปลพม่าเป็น "ฉบับร่าง" — ต้องให้พนักงานพม่าตัวจริงตรวจก่อนถือว่าถูกต้อง

// รายชื่อภาษาที่รองรับ (ลำดับ = ลำดับปุ่มในเมนูเลือกภาษา)
const DMJ_LANGS = [
  { code: "th", label: "ไทย",     flag: "🇹🇭", native: "ไทย" },
  { code: "en", label: "English", flag: "🇬🇧", native: "English" },
  { code: "my", label: "မြန်မာ",  flag: "🇲🇲", native: "မြန်မာ" },
];
const DMJ_LANG_CODES = DMJ_LANGS.map(l => l.code);
const DMJ_DEFAULT_LANG = "th";

// ── พจนานุกรม: key = ข้อความไทย · ค่า = { en, my } ──
// เริ่มด้วยชุดหน้าล็อกอิน + เมนู/ยูทิลิตี้ (P0) · Phase ถัดไปเติมหน้าลงเวลา/คลัง/หน้าร้าน
const DMJ_I18N = {
  // — เลือกภาษา —
  "ภาษา":              { en: "Language",  my: "ဘာသာစကား" },
  "เลือกภาษา":         { en: "Select language", my: "ဘာသာစကား ရွေးပါ" },

  // — หน้าล็อกอิน —
  "เข้าสู่ระบบเพื่อใช้งาน":       { en: "Sign in to continue",  my: "အသုံးပြုရန် အကောင့်ဝင်ပါ" },
  "เข้าสู่ระบบด้วย LINE":         { en: "Sign in with LINE",    my: "LINE ဖြင့် ဝင်ရန်" },
  "เข้าสู่ระบบโดยไม่เปิดแอป LINE": { en: "Sign in without the LINE app", my: "LINE app မဖွင့်ဘဲ ဝင်ရန်" },
  "กำลังรอผลการเข้าสู่ระบบ…":     { en: "Waiting for sign-in…",  my: "အကောင့်ဝင်ခြင်း စောင့်နေသည်…" },

  // — แถบบน / เมนู / ยูทิลิตี้ —
  "เพิ่มเติม":         { en: "More",          my: "နောက်ထပ်" },
  "เมนูเพิ่มเติม":     { en: "More menu",     my: "နောက်ထပ် မီနူး" },
  "ออกจากระบบ":        { en: "Log out",       my: "ထွက်ရန်" },
  "Sync ใหม่":         { en: "Sync",          my: "ပြန်လည်စင့်ခ်လုပ်ရန်" },
  "กำลัง sync...":     { en: "Syncing…",      my: "စင့်ခ်လုပ်နေသည်…" },
};

// ── ค่าภาษาปัจจุบัน: อ่านจาก localStorage ตอนโหลด (ก่อน React จะ render ครั้งแรก) ──
(function initLang() {
  let l = DMJ_DEFAULT_LANG;
  try { l = localStorage.getItem("dmj_lang") || DMJ_DEFAULT_LANG; } catch (_) {}
  if (DMJ_LANG_CODES.indexOf(l) < 0) l = DMJ_DEFAULT_LANG;
  try { window.dmjLang = l; } catch (_) {}
  try { document.documentElement.setAttribute("lang", l); } catch (_) {}
})();

function getLang() {
  try { return window.dmjLang || DMJ_DEFAULT_LANG; } catch (_) { return DMJ_DEFAULT_LANG; }
}

function setLang(code) {
  if (DMJ_LANG_CODES.indexOf(code) < 0) return;
  try { window.dmjLang = code; } catch (_) {}
  try { localStorage.setItem("dmj_lang", code); } catch (_) {}
  try { document.documentElement.setAttribute("lang", code); } catch (_) {}
  // แจ้งทุก component ที่ subscribe (App + LangSwitcher) ให้ re-render
  try { window.dispatchEvent(new Event("dmj:langchange")); } catch (_) {}
}

// t("ข้อความไทย", { name: "..." }) — แปลถ้ามีคำแปล ไม่งั้นคืนไทย · แทนที่ {var} ด้วย vars[var]
function t(key, vars) {
  let out = key;
  const lang = getLang();
  if (lang !== "th" && key != null) {
    const e = DMJ_I18N[key];
    if (e && e[lang]) out = e[lang];
  }
  if (vars && typeof out === "string") {
    out = out.replace(/\{(\w+)\}/g, function (m, k) {
      return (vars[k] != null) ? String(vars[k]) : m;
    });
  }
  return out;
}

// hook: คืนภาษาปัจจุบัน + subscribe การเปลี่ยนภาษา (ให้ component re-render เอง)
// App เรียกตัวนี้ 1 ครั้ง → เปลี่ยนภาษาแล้ว re-render ทั้งต้นไม้ → ทุก t() อ่านค่าใหม่
function useLang() {
  const [l, setL] = React.useState(getLang());
  React.useEffect(function () {
    const h = function () { setL(getLang()); };
    window.addEventListener("dmj:langchange", h);
    // เผื่อค่าเปลี่ยนระหว่าง first render กับ effect mount
    if (getLang() !== l) setL(getLang());
    return function () { window.removeEventListener("dmj:langchange", h); };
  }, []); // eslint-disable-line
  return l;
}

if (typeof module !== "undefined") {
  module.exports = { DMJ_LANGS, DMJ_LANG_CODES, DMJ_I18N, DMJ_DEFAULT_LANG, getLang, setLang, t };
}
