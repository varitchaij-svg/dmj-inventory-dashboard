#!/usr/bin/env node
/* สร้างหน้า "ตรวจคำแปลพม่า" (docs/i18n-review.html) จาก dictionary จริงใน i18n.jsx
   — อ่านจากต้นทางตัวเดียว ไม่ copy → ไม่มีทาง drift · รันใหม่ทุกครั้งที่แก้ dictionary
   รัน: node tests/i18n-review.cjs
   หน้าที่ได้: เปิดบนมือถือได้ · พนักงานพม่าติ๊ก ถูก/ผิด + พิมพ์คำแก้ → กด "คัดลอกคำที่ต้องแก้" */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'i18n.jsx'), 'utf8');

// ── eval i18n.jsx จริง (sandbox window/localStorage/document ปลอม) เพื่อดึง DMJ_I18N ──
function loadDict() {
  const store = {};
  const win = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, Event: class {} };
  const localStorage = { getItem: () => null, setItem() {} };
  const document = { documentElement: { setAttribute() {} } };
  const React = { useState: () => [null, () => {}], useEffect: () => {} };
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', 'localStorage', 'document', 'React', 'module', 'Event', SRC)
    (win, localStorage, document, React, mod, win.Event);
  return mod.exports;
}

const { DMJ_I18N, DMJ_LANGS } = loadDict();

// ── จัดกลุ่มเพื่ออ่านง่าย (ลำดับ + หัวข้อ) · key ที่ไม่อยู่ในกลุ่มไหน → กอง "เพิ่มเติม" ──
const SECTIONS = [
  { title: 'เลือกภาษา', keys: ['ภาษา', 'เลือกภาษา'] },
  { title: 'หน้าล็อกอิน (เข้าสู่ระบบ)', keys: [
    'เข้าสู่ระบบเพื่อใช้งาน', 'เข้าสู่ระบบด้วย LINE', 'เข้าสู่ระบบโดยไม่เปิดแอป LINE', 'กำลังรอผลการเข้าสู่ระบบ…'] },
  { title: 'แถบเมนู / ปุ่มบนสุด', keys: ['เพิ่มเติม', 'เมนูเพิ่มเติม', 'ออกจากระบบ', 'Sync ใหม่', 'กำลัง sync...', 'โหลดใหม่'] },
  { title: 'ชื่อเมนู (แท็บ)', keys: [
    'ลงเวลา', 'ใครเข้างานวันนี้', 'สินค้า & สั่ง', 'สต๊อก & แจ้งเตือน', 'เช็คหน้าร้าน', 'ตำแหน่งคลัง',
    'นับ stock คลัง', 'เพิ่มสินค้าใหม่', 'โอน/ปรับ/ยกมา', 'รายการสั่งของ', 'ติดตามสถานะ',
    'สรุปสินค้าออกจากคลัง', 'งานจัดพิเศษ', 'พิมพ์ Label', 'งานคลัง', 'เทรนด์'] },
  { title: 'ลงเวลาเข้า-ออกงาน', keys: [
    'เข้างาน', 'ออกงาน', 'เริ่มพัก', 'กลับจากพัก', 'ไปห้องน้ำ', 'กลับจากห้องน้ำ', 'ทำงานอยู่', 'พักอยู่',
    'ยังไม่มา', 'สาย', 'มาสาย', 'ขาด', 'วันหยุด', 'ไม่มีกะ', 'ตำแหน่ง', 'ทำงานวันนี้', 'วันนี้',
    'เวลาของฉัน', 'ทั้งหมด', 'ภาพรวม', 'สรุปรายคน', 'รวม/เฉลี่ย', 'เปิดกล้อง', 'ถ่ายใหม่', 'มีรูป', 'ไม่ได้เปิด GPS'] },
  { title: 'ปุ่ม / คำสั่งทั่วไป', keys: ['บันทึก', 'ยกเลิก', 'ปิด', 'ลองใหม่', 'ค้นหา', 'สั่ง', 'ยืนยัน', 'รับของ', 'โอน'] },
  { title: 'ป้ายตำแหน่งงาน', keys: ['เจ้าของ', 'หน้าร้าน', 'คลังสินค้า', 'พนักงาน'] },
];

// เก็บตก: key ใน dict ที่ยังไม่ถูกจัดกลุ่ม → ไม่ให้หาย
const grouped = new Set(SECTIONS.flatMap(s => s.keys));
const leftover = Object.keys(DMJ_I18N).filter(k => !grouped.has(k));
if (leftover.length) SECTIONS.push({ title: 'เพิ่มเติม', keys: leftover });

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const total = Object.keys(DMJ_I18N).length;

let rowsHtml = '';
let idx = 0;
for (const sec of SECTIONS) {
  const keys = sec.keys.filter(k => DMJ_I18N[k]);
  if (!keys.length) continue;
  rowsHtml += `<h2>${esc(sec.title)}</h2><div class="rows">`;
  for (const k of keys) {
    const e = DMJ_I18N[k];
    idx++;
    rowsHtml += `
    <div class="row" data-th="${esc(k)}">
      <div class="cell th"><span class="lbl">ไทย</span><span class="val">${esc(k)}</span></div>
      <div class="cell en"><span class="lbl">English</span><span class="val">${esc(e.en)}</span></div>
      <div class="cell my"><span class="lbl">ภาษาพม่า (ร่าง)</span><span class="val my-text">${esc(e.my)}</span></div>
      <div class="cell act">
        <label class="ok"><input type="radio" name="s${idx}" value="ok"><span>✅ ถูก / မှန်</span></label>
        <label class="no"><input type="radio" name="s${idx}" value="no"><span>✏️ ต้องแก้ / ပြင်ရန်</span></label>
        <input class="fix" type="text" placeholder="พิมพ์คำแปลที่ถูก / မှန်ကန်သောစကားလုံး ရေးပါ">
      </div>
    </div>`;
  }
  rowsHtml += `</div>`;
}

const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=3">
<title>ตรวจคำแปลภาษาพม่า — Doomuenjing</title>
<style>
  :root { --bg:#f6f7f5; --paper:#fff; --bdr:#e3e6e1; --text:#20241f; --muted:#6b7280;
          --g50:#eef6ef; --g500:#3f9d5a; --g700:#256b3a; --warn:#b7791f; --warnbg:#fdf6e3; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font-family:"IBM Plex Sans Thai","Noto Sans Myanmar","Padauk","Myanmar Text","Inter",system-ui,sans-serif;
         font-size:16px; line-height:1.6; padding:0 0 96px; -webkit-text-size-adjust:100%; }
  .wrap { max-width:820px; margin:0 auto; padding:16px; }
  header { background:var(--g700); color:#fff; padding:20px 16px; }
  header .h { max-width:820px; margin:0 auto; }
  header h1 { margin:0 0 6px; font-size:20px; }
  header p { margin:4px 0; font-size:14px; opacity:.95; }
  .note { background:var(--warnbg); border:1px solid var(--warn); border-radius:12px;
          padding:12px 14px; margin:16px 0; font-size:14px; color:#5a4a1a; }
  .note b { color:#7a5a10; }
  h2 { font-size:15px; color:var(--g700); margin:22px 0 8px; padding-bottom:6px;
       border-bottom:2px solid var(--g50); }
  .rows { display:flex; flex-direction:column; gap:10px; }
  .row { background:var(--paper); border:1px solid var(--bdr); border-radius:14px; padding:12px 14px; }
  .row.marked-ok { border-color:var(--g500); background:var(--g50); }
  .row.marked-no { border-color:var(--warn); background:var(--warnbg); }
  .cell { display:flex; align-items:baseline; gap:8px; padding:3px 0; }
  .cell .lbl { flex:0 0 96px; font-size:12px; color:var(--muted); }
  .cell .val { font-weight:600; }
  .cell.my .val { font-size:20px; font-weight:700; color:var(--g700); }
  .my-text { font-family:"Noto Sans Myanmar","Padauk","Myanmar Text",sans-serif; }
  .act { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; margin-top:8px;
         padding-top:10px; border-top:1px dashed var(--bdr); }
  .act label { display:inline-flex; align-items:center; gap:5px; font-size:14px; cursor:pointer;
               padding:4px 8px; border-radius:8px; }
  .act .fix { flex:1 1 100%; min-width:0; margin-top:6px; padding:10px 12px; border:1px solid var(--bdr);
              border-radius:10px; font-family:inherit; font-size:16px; display:none; }
  .row.marked-no .fix { display:block; }
  .bar { position:fixed; left:0; right:0; bottom:0; background:var(--paper);
         border-top:1px solid var(--bdr); padding:10px 14px env(safe-area-inset-bottom,10px);
         display:flex; align-items:center; gap:12px; justify-content:space-between; z-index:10; }
  .bar .prog { font-size:13px; color:var(--muted); }
  .bar button { background:var(--g700); color:#fff; border:none; border-radius:12px;
                padding:12px 18px; font-size:15px; font-weight:700; font-family:inherit; cursor:pointer; }
  .toast { position:fixed; left:50%; bottom:80px; transform:translateX(-50%);
           background:#20241f; color:#fff; padding:10px 16px; border-radius:10px; font-size:14px;
           opacity:0; transition:opacity .2s; pointer-events:none; z-index:20; }
  .toast.show { opacity:1; }
</style>
</head>
<body>
<header><div class="h">
  <h1>🇲🇲 ตรวจคำแปลภาษาพม่า</h1>
  <p>Doomuenjing — ระบบจัดการสต็อก · စာရင်း စီမံခန့်ခွဲမှု စနစ်</p>
  <p>ဘာသာပြန် စစ်ဆေးရန် (${total} စကားလုံး)</p>
</div></header>
<div class="wrap">
  <div class="note">
    <b>วิธีตรวจ:</b> อ่านช่อง <b>"ภาษาพม่า (ร่าง)"</b> ของแต่ละคำ — ถ้าถูกกด <b>✅ ถูก</b> ·
    ถ้าผิดกด <b>✏️ ต้องแก้</b> แล้วพิมพ์คำที่ถูกลงในช่อง · เสร็จแล้วกดปุ่ม
    <b>"📋 คัดลอกคำที่ต้องแก้"</b> ด้านล่าง แล้วส่งกลับมาให้เจ้าของ<br>
    <span style="font-size:13px">အောက်ပါ မြန်မာဘာသာပြန်များကို စစ်ဆေးပါ — မှန်လျှင် ✅ ၊ မှားလျှင် ✏️ နှိပ်ပြီး
    မှန်သောစကားလုံးကို ရေးပါ ။ ပြီးလျှင် "📋 ကူးယူရန်" ကိုနှိပ်၍ ပိုင်ရှင်ထံ ပြန်ပို့ပါ ။</span>
  </div>
  ${rowsHtml}
</div>
<div class="bar">
  <span class="prog" id="prog">ตรวจแล้ว 0 / ${total}</span>
  <button id="copyBtn">📋 คัดลอกคำที่ต้องแก้</button>
</div>
<div class="toast" id="toast"></div>
<script>
(function(){
  var rows = Array.prototype.slice.call(document.querySelectorAll('.row'));
  var prog = document.getElementById('prog');
  function refresh(){
    var done = 0;
    rows.forEach(function(r){
      var ok = r.querySelector('input[value=ok]').checked;
      var no = r.querySelector('input[value=no]').checked;
      r.classList.toggle('marked-ok', ok);
      r.classList.toggle('marked-no', no);
      if (ok || no) done++;
    });
    prog.textContent = 'ตรวจแล้ว ' + done + ' / ' + ${total};
  }
  rows.forEach(function(r){
    r.querySelectorAll('input[type=radio]').forEach(function(inp){ inp.addEventListener('change', refresh); });
  });
  function toast(msg){
    var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
    setTimeout(function(){ t.classList.remove('show'); }, 2200);
  }
  document.getElementById('copyBtn').addEventListener('click', function(){
    var lines = [];
    rows.forEach(function(r){
      var no = r.querySelector('input[value=no]').checked;
      if (!no) return;
      var th = r.getAttribute('data-th');
      var my = r.querySelector('.my-text').textContent;
      var fix = r.querySelector('.fix').value.trim();
      lines.push('• ' + th + '\\n   ร่าง: ' + my + '\\n   แก้เป็น: ' + (fix || '(ยังไม่ได้พิมพ์)'));
    });
    var text = lines.length
      ? ('คำแปลพม่าที่ต้องแก้ (' + lines.length + ' คำ):\\n\\n' + lines.join('\\n\\n'))
      : 'ตรวจครบแล้ว — ไม่มีคำที่ต้องแก้ ✅';
    function done(){ toast(lines.length ? ('คัดลอกแล้ว ' + lines.length + ' คำ — ส่งให้เจ้าของได้เลย') : 'คัดลอกแล้ว'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function(){ fallback(text); done(); });
    } else { fallback(text); done(); }
  });
  function fallback(text){
    var ta = document.createElement('textarea'); ta.value = text;
    ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta);
    ta.focus(); ta.select(); try { document.execCommand('copy'); } catch(e){} document.body.removeChild(ta);
  }
})();
</script>
</body>
</html>`;

const OUT = path.join(ROOT, 'docs', 'i18n-review.html');
fs.writeFileSync(OUT, html, 'utf8');
console.log('เขียน ' + OUT + ' (' + total + ' คำ, ' + SECTIONS.length + ' หมวด)');
