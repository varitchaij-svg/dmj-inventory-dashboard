// Main App — routing + data load
const { useState: usS, useEffect: usE, useCallback: usC } = React;

// `desc` = คำอธิบาย 1 บรรทัดที่โชว์บนการ์ดใน "หน้าหลัก" (HomeMenuView) เท่านั้น
// ผู้ใช้หลักคือพนักงานที่ไม่ได้เปิดทุกเมนูทุกวัน — ชื่อเมนูอย่างเดียวเดาไม่ออกว่าข้างในทำอะไรได้
// ⚠️ เพิ่มแท็บใหม่ต้องใส่ `desc` ด้วยเสมอ (มีเทสต์บังคับ) ไม่งั้นการ์ดนั้นจะว่างครึ่งใบ
const TABS = [
  { id: "overview",      label: "📊 ภาพรวม",               icon: I.dashboard, desc: "ยอดขาย/มูลค่าสต๊อกทั้งร้าน · กราฟเทียบเดือน-ปี" },
  { id: "whhome",        label: "🏭 งานคลัง",              icon: I.dashboard, desc: "งานคลังวันนี้ · ของต้องจัด/จัดเก็บ/รอรับ" },
  { id: "categories",    label: "🛍️ สินค้า & สั่ง",         icon: I.layers,    desc: "ดูสินค้าตามหมวด · กดสั่งของเข้าหน้าร้าน" },
  { id: "trends",        label: "📈 เทรนด์",               icon: I.flame,     desc: "สินค้ากำลังมาแรง / ยอดตกช่วงล่าสุด" },
  { id: "stock",         label: "⚠️ สต๊อก & แจ้งเตือน",    icon: I.alert,     desc: "ของใกล้หมด · ควรสั่งเพิ่มกี่ชิ้น" },
  { id: "storage",       label: "🗺️ ตำแหน่งคลัง",           icon: I.warehouse, desc: "แผนผังชั้น/ล็อค · ของตัวนี้อยู่ตรงไหน" },
  { id: "stockcount",    label: "📊 นับ stock คลัง",         icon: I.alert,     desc: "นับของจริงในคลังทีละล็อค · คิวควรนับก่อน" },
  { id: "newproduct",    label: "➕ เพิ่มสินค้าใหม่",         icon: I.plus,      desc: "สร้างรหัสสินค้าใหม่เข้าระบบ + ZORT" },
  { id: "frontstore",    label: "🏪 เช็คหน้าร้าน",           icon: I.store,     desc: "นับของหน้าร้าน · คิวควรเช็คก่อน" },
  { id: "transfers",     label: "🔄 โอน/ปรับ/ยกมา",        icon: I.arrowR,    desc: "โอนของคลัง ↔ หน้าร้าน · ปรับยอดคงเหลือ" },
  { id: "orders",        label: "📋 รายการสั่งของ",         icon: I.cart,      desc: "ใบสั่งที่ต้องจัด · กรอกจำนวนที่จัดได้" },
  { id: "tracking",      label: "📡 ติดตามสถานะ",           icon: I.arrowR,    desc: "ของส่งไปถึงไหน · ใบไหนยังไม่มีคนรับ" },
  { id: "ordersummary",  label: "📦 สรุปสินค้าออกจากคลัง",  icon: I.store,     desc: "ของจัดเสร็จแล้ว รอกดส่งออกจากคลัง" },
  { id: "mtojobs",       label: "🎁 งานจัดพิเศษ",            icon: I.package,   desc: "งานจัดช่อ/กระเช้าตามที่ลูกค้าสั่ง" },
  { id: "upload",        label: "⬆️ อัปโหลด Zort",          icon: I.upload,    desc: "อัปโหลดไฟล์จาก ZORT เข้าระบบเอง" },
  { id: "connect",       label: "🔗 Google Sheet",          icon: I.sheets,    desc: "สถานะการเชื่อมต่อข้อมูล · สั่ง sync เอง" },
  { id: "labels",        label: "🖨️ พิมพ์ Label",            icon: I.print,     desc: "พิมพ์ป้ายชื่อ/บาร์โค้ดสินค้า" },
  { id: "auditlog",      label: "📋 Audit Log",             icon: I.layers,    desc: "ประวัติว่าใครแก้อะไร เมื่อไหร่" },
  { id: "staff",         label: "👥 พนักงาน",               icon: I.layers,    desc: "รายชื่อพนักงาน · ตั้งตำแหน่ง/สิทธิ์" },
  { id: "staffperf",     label: "🏅 ผลงานพนักงาน",           icon: I.flame,     desc: "สรุปงานที่แต่ละคนทำในเดือนนี้" },
  { id: "attendance",    label: "⏱️ ลงเวลา",                icon: I.layers,    desc: "กดเข้า-ออกงาน/พัก · ดูเวลาของฉัน" },
  { id: "atttoday",      label: "🕐 ใครเข้างานวันนี้",       icon: I.layers,    desc: "ใครเข้างาน/พัก/ออกแล้ว ตอนนี้" },
  { id: "attreport",     label: "📅 รายงานการเข้างาน",       icon: I.dashboard, desc: "สรุปเข้า-ออกงานทั้งเดือน รายคน/รายวัน" },
  { id: "deadstock",     label: "📦 สินค้าจม",              icon: I.alert,     desc: "ของค้างคลังไม่ขยับ · เงินจมอยู่เท่าไหร่" },
  { id: "quotefollowup", label: "📄 ใบเสนอราคา",             icon: I.cart,      desc: "สร้าง/ตามใบเสนอราคาของลูกค้า" },
  { id: "pos",           label: "🧾 ขาย/ออกบิล",             icon: I.cart,      desc: "ขายออนไลน์/หน้าร้าน ออกบิล+ใบกำกับภาษี" },
  { id: "customers",     label: "👥 ลูกค้า & ยอดซื้อ",        icon: I.store,     desc: "ลูกค้าแต่ละเจ้าซื้อเท่าไหร่ · ใหม่/เก่า" },
  { id: "margin",        label: "💰 กำไรขั้นต้น",             icon: I.flame,     desc: "กำไรรายสินค้าจากราคาป้าย" },
  { id: "season",        label: "🌸 ช่วงขายดี",              icon: I.flame,     desc: "ช่วงไหนของปีที่ของแต่ละแบบขายดี" },
];
// id ของ "หน้าหลัก" — ตั้งใจ **ไม่ใส่ใน ROLE_TABS** เพราะไม่ใช่แท็บบนแถบเมนู แต่เป็นหน้ารวมเมนู
// ที่เข้าได้จากการแตะโลโก้เท่านั้น · ใส่ใน ROLE_TABS เมื่อไหร่ = โผล่เป็นปุ่มเกินบนแถบทุก role
// และของ owner จะตกไปกอง "อื่นๆ" (มีเทสต์กันไว้)
const HOME_TAB = "home";

// Role config
const ROLE_TABS = {
  // dev = ตำแหน่งสำหรับผู้ดูแลระบบ/คนพัฒนา — เห็นทุกแท็บที่มีในระบบ รวมแท็บที่ยังซ่อนจาก owner
  // ("margin" ยังไม่มีต้นทุนซื้อจริง จึงไม่โชว์ให้ owner แต่ dev ต้องเข้าไปดู/ทดสอบได้)
  // สิทธิ์ฝั่ง GAS เทียบเท่า owner (ดู isAdminRole_ ใน appsscript_complete.gs)
  dev:        ["attendance","overview","customers","pos","quotefollowup","categories","stock","orders","tracking","frontstore","ordersummary","transfers","storage","stockcount","newproduct","deadstock","trends","season","margin","mtojobs","labels","upload","connect","auditlog","staff","staffperf","atttoday","attreport","whhome"],
  // เรียงตามที่ owner ใช้บ่อย: ภาพรวม/ลูกค้า → งานประจำวัน (สั่ง/สต๊อก/ออเดอร์/หน้าร้าน) → คลัง → วิเคราะห์ → เครื่องมือ/ตั้งค่าท้ายสุด
  // ("margin" ซ่อนไว้ก่อน — ยังไม่มีต้นทุนซื้อจริง · โค้ด MarginView คงไว้ ค่อยเพิ่ม id กลับเมื่อพร้อม)
  owner:      ["attendance","overview","customers","pos","quotefollowup","categories","stock","orders","tracking","frontstore","ordersummary","transfers","storage","stockcount","newproduct","deadstock","trends","season","mtojobs","labels","upload","connect","auditlog","staff","staffperf","atttoday","attreport"],
  employee:   ["attendance","categories","trends","stock","storage","frontstore","transfers","orders","tracking","ordersummary","mtojobs","labels"],
  // role อื่น (employee/warehouse/frontstore/saler) ไม่มี "เพิ่มเติม" — โชว์ทุกแท็บบนแถบเลื่อนแนวนอน
  // (ต่างจาก owner/dev) ดังนั้นลำดับที่นี่แค่กำหนดว่าอันไหนอยู่ซ้ายสุด/เจอก่อนโดยไม่ต้องเลื่อน
  // whhome เป็นหน้า dashboard งานคลังวันนี้อยู่แล้ว (2nd) — พนักงานคลังกด whhome ก่อนแล้ว nav ต่อผ่าน tile ในนั้น
  warehouse:  ["attendance","whhome","orders","stock","stockcount","storage","categories","newproduct","ordersummary","tracking","mtojobs","labels"],
  // frontstore ดันขึ้นเป็นตัวที่ 2 — งานหลักของ role นี้คือ "เช็คหน้าร้าน" ไม่ใช่ "สินค้า & สั่ง"
  frontstore: ["attendance","frontstore","categories","stock","orders","tracking","mtojobs","labels"],
  // quotefollowup ดันขึ้นมาติด pos — เป็นงานขายหลักคู่กับ pos แต่เดิมอยู่ตัวที่ 7 ต้องเลื่อนหา
  saler:      ["attendance","pos","quotefollowup","categories","stock","tracking","orders","mtojobs","labels"],
  // storedevice = บัญชี LINE กลางที่ใช้ร่วมกันหลายคน (ติดไว้ที่เครื่อง/แท็บเล็ตประจำร้าน ไม่ผูกกับ
  // พนักงานคนใดคนหนึ่ง) — สิทธิ์เท่า saler ทุกอย่าง + เพิ่ม "atttoday" ให้เปิดดูว่าใครเข้างาน/พัก/
  // เข้าห้องน้ำอยู่ได้ (ดูอย่างเดียว ไม่ใช่แก้เวลาย้อนหลัง — ดู isAdminRole_ ฝั่ง GAS + canEdit ฝั่ง UI)
  storedevice: ["attendance","pos","quotefollowup","categories","stock","tracking","orders","mtojobs","labels","atttoday"],
};
// หมวดหลักของ owner (nav 2 ชั้น) — กดหมวด → เห็นเมนูย่อยของหมวดนั้น
// เรียงตามความสำคัญ/ที่ใช้บ่อย: ภาพรวม → การขาย → สต็อก → พนักงาน → เครื่องมือ
// tab ที่ไม่อยู่ในกลุ่มไหน จะถูกดันเข้ากลุ่ม "อื่นๆ" อัตโนมัติ (กัน tab หาย)
//
// "ภาพรวม" = ทุกอย่างที่เจ้าของเปิดดูเพื่อ **ตัดสินใจ** (ไม่ใช่ลงมือทำงาน) — เจ้าของสั่งไว้ ส.ค. 2026
//   ให้รวม: ภาพรวมร้าน · งานของแต่ละฝ่าย (คลัง/หน้าร้าน/ขาย) · ลูกค้า · ติดตามสถานะ ·
//   ใบเสนอราคา · เทรนด์/ช่วงขายดี  ไว้ที่เดียว จะได้ไม่ต้องไล่เปิดข้ามหมวด
//   ⚠️ ต่างจากหมวดอื่นที่แบ่งตาม "ประเภทงาน" — หมวดนี้แบ่งตาม "คนดู" (เจ้าของ) โดยตั้งใจ
//   ผลข้างเคียง: g_insight เหลือแค่ margin ซึ่ง owner ไม่มีสิทธิ์ → หมวดหายไปเองสำหรับ owner
//   (ตัวกรอง .filter(g => g.items.length > 0) ด้านล่างจัดการให้) แต่ dev ยังเห็น
const OWNER_GROUPS = [
  // "attreport" (รายงานการเข้างาน) อยู่หมวดนี้ ไม่ใช่ "พนักงาน" — เจ้าของสั่งเอง ส.ค. 2026
  // เพราะเป็นของที่เปิดดูเพื่อ **ตัดสินใจ** (ใครต้องคุยด้วย/คิดชั่วโมง) ไม่ใช่งานประจำวันแบบ
  // ลงเวลา/ใครเข้างานวันนี้ ซึ่งเป็นการลงมือทำจริงและยังอยู่หมวด "พนักงาน" ตามเดิม
  { id: "g_overview", gi: "📊", name: "ภาพรวม",       tabs: ["overview", "whhome", "attreport", "customers", "tracking", "quotefollowup", "trends", "season"] },
  { id: "g_sales",    gi: "💰", name: "การขาย",       tabs: ["pos", "orders", "frontstore", "mtojobs"] },
  { id: "g_stock",    gi: "📦", name: "สต็อก & คลัง",  tabs: ["stock", "categories", "storage", "stockcount", "transfers", "ordersummary", "newproduct", "deadstock", "labels"] },
  { id: "g_insight",  gi: "📈", name: "วิเคราะห์",      tabs: ["margin"] },
  { id: "g_people",   gi: "👥", name: "พนักงาน",       tabs: ["attendance", "atttoday", "staff", "staffperf"] },
  { id: "g_tools",    gi: "⚙️", name: "เครื่องมือ",     tabs: ["upload", "connect", "auditlog"] },
];
// จัดกลุ่มแท็บของ role หนึ่ง ๆ ตาม OWNER_GROUPS — **ใช้ร่วมกัน 2 ที่**: nav 2 ชั้นของ owner/dev
// และ "หน้าหลัก" (HomeMenuView) ของทุก role · ต้องเป็นตัวเดียวกันเสมอ ห้ามแยกเป็น 2 ชุด
// (ตารางซ้ำ = drift แล้วเมนูสองที่ไม่ตรงกัน โดยไม่มี error ให้เห็น)
// แท็บที่ไม่เข้ากลุ่มไหนเลยถูกดันเข้า "อื่นๆ" เสมอ — กันแท็บหายจากเมนูทั้งอัน
function groupTabsFor(allowedTabIds) {
  const allowed = new Set(allowedTabIds);
  const groups = OWNER_GROUPS
    .map(g => ({ ...g, items: g.tabs.filter(id => allowed.has(id)).map(id => TABS.find(t => t.id === id)).filter(Boolean) }))
    .filter(g => g.items.length > 0);
  const grouped = new Set(groups.flatMap(g => g.items.map(t => t.id)));
  const leftover = allowedTabIds.filter(id => !grouped.has(id)).map(id => TABS.find(t => t.id === id)).filter(Boolean);
  if (leftover.length) groups.push({ id: "g_other", gi: "🗂️", name: "อื่นๆ", items: leftover });
  return groups;
}

// ป้ายใน TABS เก็บเป็น "อีโมจิ + เว้นวรรค + ชื่อ" ("📊 ภาพรวม") → แยกเพื่อวางอีโมจิใหญ่บนการ์ด
// ⚠️ ตัดที่ "ช่องว่างแรก" เสมอ ห้ามตัดตามจำนวนตัวอักษร — อีโมจิหลายตัวมี variation selector
//    (U+FE0F) ต่อท้าย ทำให้ความยาวไม่เท่ากัน ("⏱️" = 2 code unit, "📊" = 2 แต่ "🛍️" = 3)
function splitTabLabel(label) {
  const s = label || "";
  const i = s.indexOf(" ");
  return i > 0 ? { emoji: s.slice(0, i), name: s.slice(i + 1) } : { emoji: "📄", name: s };
}
// แปลชื่อเมนู (i18n) — รับ tab object เข้ามา จึงเรียก t() ข้างในได้โดยไม่ชนตัวแปรลูป `t` (=แท็บ)
// tabName = เฉพาะชื่อ (ใช้ในหน้าหลักที่โชว์อีโมจิแยก) · tabText = อีโมจิ + ชื่อ (ใช้บนแถบ nav)
function tabName(tab) { return t(splitTabLabel(tab.label).name); }
function tabText(tab) { const { emoji, name } = splitTabLabel(tab.label); return emoji + " " + t(name); }

// ── หน้าหลัก / เมนูทั้งหมด ─────────────────────────────────────────────────────
// เข้าได้จากการแตะโลโก้มุมซ้ายบน · โชว์ทุกเมนูที่ "ตำแหน่งนี้" มีสิทธิ์เปิด จัดกลุ่มเหมือน nav
// ของเจ้าของ พร้อมคำอธิบายสั้น ๆ ให้คนที่ไม่ได้เปิดเมนูนั้นทุกวันรู้ว่าข้างในทำอะไรได้
//
// ⚠️ **ห้ามรับ prop ชื่อ `data`** — หน้านี้อยู่ในรายชื่อแท็บที่เรนเดอร์ได้ทั้งที่ข้อมูลก้อนใหญ่
//    ยังโหลดไม่เสร็จ (NO_DATA_TABS) เพื่อให้กดเข้า "ลงเวลา" ได้ทันทีเหมือน Phase 7.7
//    รับ `data` เมื่อไหร่ = อ่าน property ของ null → จอขาวโดยไม่มี error ให้ผู้ใช้เห็น
//    (ตัวเลขงานค้างรับมาเป็น "ตัวเลขสำเร็จรูป" จาก App ซึ่งกัน null ไว้แล้ว)
function HomeMenuView({ groups, roleLabel, staffName, tabBadge, onNav }) {
  const allIds = new Set(groups.flatMap(g => g.items.map(t => t.id)));
  // ชิปงานค้างด้านบน — โชว์เฉพาะเมนูที่ role นี้เปิดได้จริง (กดแล้วต้องไปถึงเสมอ)
  //
  // ⚠️ **"เลขมาจากไหน" (`badge`) กับ "กดแล้วไปไหน" (`to`) เป็นคนละอย่าง ห้ามยุบเป็นคีย์เดียว**
  //    "ของรอรับ" นับจาก data.shipments ที่ยังไม่มีใครกดรับ (สูตรเดียวกับ badge ของแท็บ
  //    transfers) แต่ **หน้าที่ทำงานกับของกองนั้นจริง ๆ คือแท็บ "รายการสั่งของ" ตัวกรอง
  //    "🚚 ส่งแล้ว"** — เดิมพาไปแท็บ transfers ซึ่งกดตามเลขไปแล้วไม่เจอสิ่งที่เลขนั้นพูดถึง
  // ⚠️ เงื่อนไข `allIds.has` ต้องเช็คที่ **ปลายทาง (`to`)** ไม่ใช่ที่มาของเลข —
  //    เช็คผิดฝั่ง = ชิปโผล่ให้ role ที่กดแล้วไปไม่ถึง (หรือซ่อนจาก role ที่ไปถึงได้จริง
  //    อย่างหน้าร้าน ซึ่งการรับของคืองานหลักของเขาเลย)
  const quick = [
    { badge: "orders",    to: "orders", emoji: "📋", label: "ออเดอร์ต้องจัด" },
    { badge: "transfers", to: "orders", view: "shipped", emoji: "🚚", label: "ของรอรับ" },
  ].filter(q => allIds.has(q.to) && tabBadge(q.badge) > 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">🏠 หน้าหลัก</h1>
          <div className="page-sub">
            เมนูทั้งหมดของ {roleLabel}{staffName ? ` · ${staffName}` : ""} — แตะการ์ดเพื่อเข้าใช้งาน
          </div>
        </div>
      </div>

      {quick.length > 0 && (
        <div className="home-quick">
          {quick.map(q => (
            <button key={q.badge} className="home-quick-chip" onClick={() => onNav(q.to, q.view)}>
              <span style={{fontSize:18,lineHeight:1}}>{q.emoji}</span>
              <span>{q.label}</span>
              <span className="home-quick-n">{tabBadge(q.badge)}</span>
            </button>
          ))}
        </div>
      )}

      {groups.map(g => (
        <section key={g.id} className="home-grp">
          <div className="home-grp-head">
            <span style={{fontSize:18,lineHeight:1}}>{g.gi}</span>
            <span>{g.name}</span>
            <span className="home-grp-n">{g.items.length} เมนู</span>
          </div>
          <div className="home-grid">
            {g.items.map(t => {
              const { emoji, name } = splitTabLabel(t.label);
              const badge = tabBadge(t.id);
              return (
                <button key={t.id} className="home-card" onClick={() => onNav(t.id)}>
                  <span className="home-card-emoji">{emoji}</span>
                  <span className="home-card-body">
                    <span className="home-card-name">{tabName(t)}</span>
                    <span className="home-card-desc">{t.desc || ""}</span>
                  </span>
                  {badge > 0 && <span className="home-card-badge">{badge}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const ROLE_LABELS = {
  owner:      "👑 เจ้าของ",
  employee:   "👤 พนักงาน",
  warehouse:  "🏭 คลังสินค้า",
  frontstore: "🏪 หน้าร้าน",
  saler:      "💼 พนักงานขาย",
  dev:        "🛠️ DEV",
  storedevice: "🖥️ เครื่องร้าน",
};

// ป้ายแจ้ง "ล็อกอินสำเร็จ แต่คุณเริ่มมาจากแอปหน้าโฮม" — ขึ้นเฉพาะเบราว์เซอร์ที่รับ callback มาแทน
// (iPhone: กดในแอปหน้าโฮม แล้ว iOS เด้งออกมาจบใน Safari) · เตือนให้กลับไปเปิดแอปนั้น ไม่ต้องล็อกอินซ้ำ
function CrossContextNote({ onClose }) {
  return (
    <div style={{
      position:"fixed", left:12, right:12, bottom:12, zIndex:9999,
      background:"var(--paper)", border:"1.5px solid var(--g-300)", borderRadius:14,
      boxShadow:"0 10px 30px rgba(0,0,0,.18)", padding:"12px 14px",
      display:"flex", alignItems:"flex-start", gap:10, maxWidth:420, margin:"0 auto",
    }}>
      <span style={{fontSize:20, lineHeight:1.2}}>📱</span>
      <div style={{flex:1, minWidth:0, fontSize:12.5, lineHeight:1.6, color:"var(--text)"}}>
        เข้าสู่ระบบสำเร็จแล้วในเบราว์เซอร์นี้ — ถ้าคุณเริ่มกดจาก
        <b> ไอคอนแอปหน้าโฮม </b> ให้กลับไปเปิดไอคอนนั้นได้เลย ระบบจะพาเข้าให้เอง (ไม่ต้องล็อกอินซ้ำ)
      </div>
      <button onClick={onClose} style={{
        background:"transparent", border:"none", color:"var(--muted)",
        fontSize:18, cursor:"pointer", fontFamily:"inherit", padding:"0 2px",
      }}>✕</button>
    </div>
  );
}

// หน้าล็อกอินหลัก — ปุ่ม LINE ใหญ่ (ไม่ต้องพิมพ์อะไร) + ลิงก์เล็ก "รหัสสำรอง" สำหรับช่วงเปลี่ยนผ่าน
function LoginScreen({ onLineLogin, onLegacyLogin, lineError, lineChannelId,
                       handoffState, handoffWaiting, onClaimNow, onCancelWaiting, onStartWaiting }) {
  const [showLegacy, setShowLegacy] = usS(false);
  const [showDiag, setShowDiag] = usS(false);
  const inLineBrowser = React.useMemo(() => isLineInAppBrowser(), []);

  // ── ทำไมปุ่ม LINE ต้องเป็น <a href> ไม่ใช่ <button onClick> ──────────────────
  // การล็อกอินผ่าน "แอป LINE" (app-to-app) ทำงานด้วย universal link (iOS) /
  // app link (Android) ซึ่งเบราว์เซอร์จะยอมเปิดแอปให้ก็ต่อเมื่อการ navigate นั้น
  // "ผูกกับการแตะของผู้ใช้โดยตรง" เท่านั้น
  // ของเดิม: แตะปุ่ม → await fetch(lineLoginMeta) → ค่อย window.location.href = …
  // ระหว่าง await คือ async gap → user gesture หมดอายุ → iOS/Android ปฏิเสธการเปิดแอป
  // → iOS ค้าง/เด้งกลับ, Android ขึ้น "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
  // (ตรงกับที่เจอ: โหมด "ไม่เปิดแอป LINE" ผ่าน เพราะเป็น navigate https ธรรมดา ไม่ต้องเปิดแอป)
  // → ดึง channelId มาเตรียมไว้ล่วงหน้า แล้วให้ปุ่มเป็นลิงก์จริง: แตะ = navigate ทันที
  //   ไม่มี async คั่น · onClick แค่บันทึก state ลง storage (ทำงาน sync ก่อน navigate)
  const authBase = React.useMemo(() => {
    if (!lineChannelId) return null;
    // state = แฮชของรหัสลับรับช่วงล็อกอิน (ถ้าเตรียมทัน) — ทำให้กู้ล็อกอินที่ไปจบในเบราว์เซอร์อื่นได้
    // เครื่องที่ไม่มี crypto.subtle (http/เบราว์เซอร์เก่า) ตกมาที่ค่าสุ่มธรรมดาเหมือนเดิม
    const state = handoffState || (Math.random().toString(36).slice(2) + Date.now().toString(36));
    const redirectUri = lineRedirectUri();
    return {
      state, redirectUri,
      url: "https://access.line.me/oauth2/v2.1/authorize"
        + "?response_type=code"
        + "&client_id=" + encodeURIComponent(lineChannelId)
        + "&redirect_uri=" + encodeURIComponent(redirectUri)
        + "&state=" + encodeURIComponent(state)
        + "&scope=" + encodeURIComponent("profile openid"),
    };
  }, [lineChannelId, handoffState]);

  if (showLegacy) {
    return <LegacyLoginScreen onLogin={onLegacyLogin} onBack={() => setShowLegacy(false)}/>;
  }

  // ข้อมูลไล่ปัญหาล็อกอิน (โดยเฉพาะ iOS ที่ debug ยากเพราะไม่มี console ให้ดู)
  // ผู้ใช้กด "ℹ️ ข้อมูลเครื่อง" แล้วส่งภาพหน้าจอมาให้ได้เลย
  const diag = (() => {
    const canLs = lsSet("dmj_diag", "1"); if (canLs) lsDel("dmj_diag");
    const canSs = ssSet("dmj_diag", "1"); if (canSs) ssDel("dmj_diag");
    return {
      origin: (typeof window !== "undefined" && window.location.origin) || "?",
      path: (typeof window !== "undefined" && window.location.pathname) || "?",
      redirect: lineRedirectUri(),
      standalone: !!(typeof navigator !== "undefined" && navigator.standalone) ||
                  !!(typeof window !== "undefined" && window.matchMedia &&
                     window.matchMedia("(display-mode: standalone)").matches),
      localStorage: canLs, sessionStorage: canSs,
      inLineApp: isLineInAppBrowser(),
      ua: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 140),
    };
  })();

  return (
    <div style={{
      minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      background:"var(--bg)", padding:"24px 16px", position:"relative",
    }}>
      {/* เปลี่ยนภาษาได้ตั้งแต่หน้าล็อกอิน — คนพม่าต้องอ่านหน้านี้ออกก่อนถึงจะเข้าได้ */}
      <div style={{position:"absolute", top:12, right:12}}>
        <LangSwitcher/>
      </div>
      <div style={{marginBottom:8}}>
        <img src="logo.png" alt="Doomuenjing"
             style={{height:56, objectFit:"contain"}}
             onError={e => e.target.style.display="none"}/>
      </div>
      <div style={{fontSize:22, fontWeight:700, color:"var(--g-700)",
                   marginBottom:4, letterSpacing:"-.01em"}}>Doomuenjing</div>
      <div style={{fontSize:13, color:"var(--muted)", marginBottom:36}}>
        {t("เข้าสู่ระบบเพื่อใช้งาน")}
      </div>

      {/* เปิดลิงก์นี้มาจากในแชท/ประกาศ LINE โดยตรง = ติดอยู่ในเว็บวิวของ LINE เอง —
          ล็อกอินผ่านปุ่มด้านล่างจะเจอ error แปลกๆ ตอนแลก token เกือบทุกครั้ง (ข้อจำกัดของ
          เว็บวิว LINE ไม่เกี่ยวกับเว็บเรา) ต้องกดออกไปเบราว์เซอร์จริงก่อนถึงจะล็อกอินได้ */}
      {inLineBrowser && (
        <div style={{
          marginBottom:16, maxWidth:320, width:"100%", boxSizing:"border-box",
          background:"var(--warn-t)", border:"1.5px solid var(--warn)", borderRadius:12,
          padding:"14px 16px", fontSize:13, lineHeight:1.7, color:"var(--text)", textAlign:"center",
        }}>
          <div style={{fontWeight:800, marginBottom:4}}>⚠️ กำลังเปิดในแอป LINE</div>
          เข้าสู่ระบบตรงนี้มักจะล็อกอินไม่ผ่าน — กด <b>"···"</b> มุมขวาบน แล้วเลือก
          <b> "เปิดด้วยเบราว์เซอร์อื่น"</b> (Open in Browser) ก่อน แล้วค่อยกดปุ่มด้านล่างในนั้น
        </div>
      )}

      {authBase ? (
        // ลิงก์จริง — แตะแล้วเบราว์เซอร์ navigate ทันทีในจังหวะเดียวกับการแตะ
        // จึงเปิดแอป LINE ได้ (universal link ต้องการ user gesture ที่ยังไม่ขาดตอน)
        <a href={authBase.url}
           onClick={e => { lineLoginNavigate(e, authBase); onStartWaiting && onStartWaiting(); }}
           style={{
             display:"flex", alignItems:"center", justifyContent:"center", gap:10,
             width:"100%", maxWidth:320, padding:"16px 20px", boxSizing:"border-box",
             background:"#06C755", color:"#fff", border:"none", borderRadius:14,
             fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
             textDecoration:"none",
             boxShadow:"0 6px 18px rgba(6,199,85,.3)",
           }}>
          <span style={{fontSize:20}}>💬</span> {t("เข้าสู่ระบบด้วย LINE")}
        </a>
      ) : (
        // ยังดึง channelId ไม่เสร็จ (เข้าครั้งแรก/เน็ตช้า) — ใช้ทางเดิมไปก่อน
        // อาจเปิดแอป LINE ไม่ได้เพราะมี async คั่น แต่ดีกว่าปุ่มกดไม่ได้เลย
        <button onClick={() => onLineLogin(false)} style={{
          display:"flex", alignItems:"center", justifyContent:"center", gap:10,
          width:"100%", maxWidth:320, padding:"16px 20px",
          background:"#06C755", color:"#fff", border:"none", borderRadius:14,
          fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:.75,
          boxShadow:"0 6px 18px rgba(6,199,85,.3)",
        }}>
          <span style={{fontSize:20}}>💬</span> {t("เข้าสู่ระบบด้วย LINE")}
        </button>
      )}

      {lineError && (
        <div style={{color:"var(--dang)", fontSize:12, marginTop:12, textAlign:"center", maxWidth:300}}>
          ⚠️ {lineError}
        </div>
      )}

      {/* กดล็อกอินไปแล้วแต่ยังอยู่หน้านี้ = iOS เด้งไปทำต่อในเบราว์เซอร์อื่น (Safari)
          → หน้านี้จะไปตามผลมาให้เองทุก 4 วินาที ผู้ใช้แค่กลับมาที่แอป ไม่ต้องล็อกอินซ้ำ */}
      {handoffWaiting && (
        <div style={{
          marginTop:14, maxWidth:320, width:"100%", boxSizing:"border-box",
          background:"var(--paper)", border:"1.5px solid var(--g-300)", borderRadius:12,
          padding:"12px 14px", fontSize:12.5, lineHeight:1.65, color:"var(--text)",
        }}>
          <div style={{display:"flex", alignItems:"center", gap:8, fontWeight:700, color:"var(--g-700)"}}>
            <span className="spin" style={{width:13, height:13, borderWidth:2}}/>
            {t("กำลังรอผลการเข้าสู่ระบบ…")}
          </div>
          <div style={{marginTop:6, color:"var(--muted)"}}>
            ถ้าเครื่องเด้งไปล็อกอินในเบราว์เซอร์อื่นแล้ว ให้ทำจนเสร็จ แล้ว
            <b> กลับมาที่หน้านี้ </b> ระบบจะพาเข้าให้เอง ไม่ต้องล็อกอินซ้ำ
          </div>
          <div style={{display:"flex", gap:8, marginTop:10}}>
            <button onClick={() => onClaimNow && onClaimNow()} style={{
              flex:1, padding:"9px 10px", background:"var(--g-700)", color:"#fff",
              border:"none", borderRadius:9, fontSize:12.5, fontWeight:700,
              cursor:"pointer", fontFamily:"inherit",
            }}>🔄 เช็คเดี๋ยวนี้</button>
            <button onClick={() => onCancelWaiting && onCancelWaiting()} style={{
              padding:"9px 12px", background:"transparent", color:"var(--muted)",
              border:"1px solid var(--bdr)", borderRadius:9, fontSize:12.5,
              cursor:"pointer", fontFamily:"inherit",
            }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* เครื่องบล็อกที่เก็บข้อมูล = ล็อกอินค้างแน่นอน — เตือนก่อนกด ไม่ต้องรอให้พัง */}
      {!diag.localStorage && (
        <div style={{
          marginTop:12, maxWidth:320, fontSize:12, lineHeight:1.6, textAlign:"center",
          color:"var(--warn)", background:"var(--warn-t)", border:"1px solid var(--warn)",
          borderRadius:10, padding:"10px 12px",
        }}>
          ⚠️ เครื่องนี้บล็อกการบันทึกข้อมูลเว็บ — ต้องปิด "โหมดไม่ระบุตัวตน / Private Browsing"
          แล้วเปิดใหม่ ถึงจะล็อกอินค้างไว้ได้
        </div>
      )}

      {/* ทางเลี่ยงสำหรับมือถือ: ล็อกอินในเบราว์เซอร์ ไม่สลับไปแอป LINE
          (การสลับไปแอปคือต้นเหตุที่ iOS กลับมาแล้ว "เซสชันไม่ตรงกัน" และ Android เด้ง error) */}
      {authBase ? (
        <a href={authBase.url + "&disable_auto_login=true&disable_ios_auto_login=true"}
           onClick={e => { lineLoginNavigate(e, authBase, "&disable_auto_login=true&disable_ios_auto_login=true"); onStartWaiting && onStartWaiting(); }}
           style={{
             marginTop:14, display:"block", width:"100%", maxWidth:320, padding:"11px 16px",
             boxSizing:"border-box", textAlign:"center", textDecoration:"none",
             background:"var(--paper)", color:"var(--g-700)", border:"1.5px solid var(--g-300)",
             borderRadius:12, fontSize:13.5, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
           }}>🌐 {t("เข้าสู่ระบบโดยไม่เปิดแอป LINE")}</a>
      ) : (
        <button onClick={() => onLineLogin(true)} style={{
          marginTop:14, width:"100%", maxWidth:320, padding:"11px 16px",
          background:"var(--paper)", color:"var(--g-700)", border:"1.5px solid var(--g-300)",
          borderRadius:12, fontSize:13.5, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
        }}>🌐 {t("เข้าสู่ระบบโดยไม่เปิดแอป LINE")}</button>
      )}
      <div style={{fontSize:11, color:"var(--light)", marginTop:6, textAlign:"center", maxWidth:300}}>
        ใช้ปุ่มนี้ถ้ากดปุ่มเขียวแล้วเด้งออกไปแอป LINE แล้วเข้าไม่ได้
      </div>

      <button onClick={() => setShowLegacy(true)} style={{
        marginTop:20, background:"transparent", border:"none",
        color:"var(--muted)", fontSize:13, textDecoration:"underline",
        cursor:"pointer", fontFamily:"inherit",
      }}>เข้าด้วยรหัสสำรอง</button>

      <button onClick={() => setShowDiag(v => !v)} style={{
        marginTop:10, background:"transparent", border:"none",
        color:"var(--light)", fontSize:11, cursor:"pointer", fontFamily:"inherit",
      }}>ℹ️ ข้อมูลเครื่อง (ไว้แจ้งปัญหา)</button>

      {showDiag && (
        <div style={{
          marginTop:8, maxWidth:340, width:"100%", fontSize:10.5, lineHeight:1.7,
          color:"var(--muted)", background:"var(--paper)", border:"1px solid var(--bdr)",
          borderRadius:10, padding:"10px 12px", wordBreak:"break-all",
        }}>
          <div>origin: {diag.origin}</div>
          <div>path: {diag.path}</div>
          <div>redirect_uri: {diag.redirect}</div>
          <div>โหมดแอป (standalone): {diag.standalone ? "ใช่ ✅" : "ไม่ (เบราว์เซอร์)"}</div>
          <div>เปิดในแอป LINE (in-app browser): {diag.inLineApp ? "ใช่ ⚠️" : "ไม่ใช่ ✅"}</div>
          <div>ปุ่ม LINE พร้อม (channelId): {lineChannelId ? "ใช่ ✅" : "ยังไม่โหลด ⏳"}</div>
          <div>รับช่วงล็อกอินข้ามเบราว์เซอร์: {handoffState ? "พร้อม ✅" : "ไม่รองรับ (เครื่องเก่า/ไม่ใช่ https)"}{handoffWaiting ? " · กำลังรอผล ⏳" : ""}</div>
          <div>localStorage: {diag.localStorage ? "ok ✅" : "บล็อก ❌"} · sessionStorage: {diag.sessionStorage ? "ok ✅" : "บล็อก ❌"}</div>
          <div>UA: {diag.ua}</div>
        </div>
      )}
    </div>
  );
}

// หน้า "รออนุมัติ" — โชว์หลังล็อกอิน LINE สำเร็จครั้งแรก แต่เจ้าของยังไม่กดอนุมัติ
function PendingScreen({ staff, onRefresh, refreshing, onSwitchAccount }) {
  return (
    <div style={{
      minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      background:"var(--bg)", padding:"24px 16px", textAlign:"center",
    }}>
      {staff && staff.pictureUrl && (
        <img src={staff.pictureUrl} alt="" style={{
          width:72, height:72, borderRadius:"50%", objectFit:"cover", marginBottom:16,
          border:"3px solid var(--g-300)",
        }}/>
      )}
      <div style={{fontSize:18, fontWeight:700, color:"var(--text)", marginBottom:4}}>
        {(staff && staff.name) || "สวัสดีครับ"}
      </div>
      <div style={{fontSize:44, marginBottom:8}}>⏳</div>
      <div style={{fontSize:16, fontWeight:700, color:"var(--g-700)", marginBottom:6}}>
        รอเจ้าของอนุมัติ
      </div>
      <div style={{fontSize:13, color:"var(--muted)", maxWidth:280, marginBottom:24}}>
        แจ้งเจ้าของแล้วว่ามีคนขอเข้าใช้งานใหม่ — พอเจ้าของกดอนุมัติ + ตั้งตำแหน่งให้แล้ว
        กดปุ่มด้านล่างอีกครั้ง
      </div>
      <button className="btn primary" onClick={onRefresh} disabled={refreshing}
              style={{padding:"12px 24px", fontSize:14}}>
        {refreshing ? <span className="spin" style={{width:14,height:14,borderWidth:2}}/> : "🔄"}
        <span style={{marginLeft:6}}>เช็คอีกครั้ง</span>
      </button>
      <button onClick={onSwitchAccount} style={{
        marginTop:16, background:"transparent", border:"none",
        color:"var(--muted)", fontSize:13, textDecoration:"underline",
        cursor:"pointer", fontFamily:"inherit",
      }}>ออกจากระบบ / สลับบัญชี</button>
    </div>
  );
}

// หน้าถูกระงับ — owner กด "ระงับ" ในแท็บพนักงาน
function DisabledScreen({ onSwitchAccount }) {
  return (
    <div style={{
      minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      background:"var(--bg)", padding:"24px 16px", textAlign:"center",
    }}>
      <div style={{fontSize:44, marginBottom:8}}>🚫</div>
      <div style={{fontSize:16, fontWeight:700, color:"var(--dang)", marginBottom:6}}>
        บัญชีนี้ถูกระงับการใช้งาน
      </div>
      <div style={{fontSize:13, color:"var(--muted)", maxWidth:280, marginBottom:24}}>
        ติดต่อเจ้าของร้านถ้าคิดว่าไม่ถูกต้อง
      </div>
      <button onClick={onSwitchAccount} style={{
        background:"transparent", border:"1px solid var(--bdr)", borderRadius:10,
        padding:"10px 20px", color:"var(--muted)", fontSize:13,
        cursor:"pointer", fontFamily:"inherit",
      }}>ออกจากระบบ / สลับบัญชี</button>
    </div>
  );
}

// เดิม: หน้าเลือกตำแหน่ง + PIN — เก็บไว้เป็น "รหัสสำรอง" ระหว่างเปลี่ยนผ่านไปใช้ LINE Login
function LegacyLoginScreen({ onLogin, onBack }) {
  const [pinTarget, setPinTarget] = usS(null);
  const [pin, setPin] = usS("");
  const [err, setErr] = usS(false);
  const [checking, setChecking] = usS(false);

  const profiles = [
    { role: "owner",      label: "เจ้าของ",    emoji: "👑", color: "#1f7f44", needPin: true  },
    { role: "frontstore", label: "หน้าร้าน",   emoji: "🌸", color: "#1f6f8b", needPin: false },
    { role: "warehouse",  label: "คลังสินค้า", emoji: "🏭", color: "#8a6a2f", needPin: false },
    { role: "saler",      label: "Sale",        emoji: "💼", color: "#705d96", needPin: false },
  ];

  const handleSelect = (p) => {
    // ยิงขอข้อมูลตั้งแต่กดเลือกตำแหน่ง (ไม่ต้องรอ PIN/onLogin) — ให้เวลา GAS ซ้อนทับกับเวลา
    // ที่ผู้ใช้พิมพ์/ยืนยัน PIN แทนที่จะเริ่มนับหลัง login เสร็จ
    // ส่ง role ที่เพิ่งกดเข้าไปด้วย (sessionStorage ยังไม่ถูกตั้งตอนนี้) — GAS จะได้ตัดก้อนที่
    // role นี้ไม่ได้ใช้ออกตั้งแต่ request แรก ไม่ต้องรอ fetch รอบสองหลัง login
    try { if (typeof window !== 'undefined' && window._prefetchData) window._prefetchData(p.role); } catch (e) {}
    if (p.needPin) { setPinTarget(p); setPin(""); setErr(false); }
    else { onLogin(p.role); }
  };

  const handlePin = async () => {
    if (checking) return;
    const base = (typeof GOOGLE_SHEET_URL !== 'undefined') ? GOOGLE_SHEET_URL : null;
    // ตรวจ PIN ฝั่ง server (รหัสไม่อยู่ใน source); ถ้าต่อเน็ตไม่ได้ fallback เป็นรหัส default เดิม
    if (base) {
      setChecking(true); setErr(false);
      try {
        const url = new URL(base);
        url.searchParams.set('action', 'verifyPin');
        url.searchParams.set('pin', pin);
        const res = await fetch(url.toString());
        const d = await res.json();
        setChecking(false);
        if (!d || typeof d.ok !== 'boolean') { setErr(true); setPin(""); return; }
        if (d.ok) { onLogin(pinTarget.role); return; }
        setErr(true); setPin(""); return;
      } catch (e) {
        setChecking(false);
        setErr(true); setPin(""); return;
      }
    }
    setErr(true); setPin("");
  };

  return (
    <div style={{
      minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      background:"var(--bg)", padding:"24px 16px", position:"relative",
    }}>
      {onBack && (
        <button onClick={onBack} style={{
          position:"absolute", top:16, left:16, background:"transparent",
          border:"none", color:"var(--muted)", fontSize:13, cursor:"pointer",
          fontFamily:"inherit", display:"flex", alignItems:"center", gap:4,
          padding:"8px 10px",
        }}>← กลับ</button>
      )}
      <div style={{marginBottom:8}}>
        <img src="logo.png" alt="Doomuenjing"
             style={{height:56, objectFit:"contain"}}
             onError={e => e.target.style.display="none"}/>
      </div>
      <div style={{fontSize:22, fontWeight:700, color:"var(--g-700)",
                   marginBottom:4, letterSpacing:"-.01em"}}>Doomuenjing</div>
      <div style={{fontSize:13, color:"var(--muted)", marginBottom:36}}>
        เลือกบัญชีเพื่อเข้าใช้งาน (รหัสสำรอง)
      </div>

      <div style={{
        display:"grid", gridTemplateColumns:"repeat(2,1fr)",
        gap:16, width:"100%", maxWidth:480,
      }}>
        {profiles.map(p => (
          <button key={p.role} onClick={() => handleSelect(p)}
            style={{
              display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center",
              gap:12, padding:"28px 16px",
              background:"var(--paper)",
              border:"2px solid var(--bdr)",
              borderRadius:20, cursor:"pointer", fontFamily:"inherit",
              transition:"all .15s",
              boxShadow:"0 2px 8px rgba(0,0,0,.06)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = p.color;
              e.currentTarget.style.transform = "translateY(-3px)";
              e.currentTarget.style.boxShadow = `0 8px 24px ${p.color}30`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "var(--bdr)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.06)";
            }}>
            <div style={{
              width:72, height:72, borderRadius:18,
              background: p.color + "18",
              border:`2px solid ${p.color}40`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:36,
            }}>{p.emoji}</div>
            <div style={{fontSize:14, fontWeight:700, color:"var(--text)"}}>{p.label}</div>
            {p.needPin && (
              <div style={{fontSize:11, color:"var(--muted)", display:"flex", alignItems:"center", gap:4}}>
                <span>🔒</span> ต้องใส่รหัส
              </div>
            )}
          </button>
        ))}
      </div>

      {pinTarget && (
        <div onClick={() => setPinTarget(null)} style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,.5)",
          display:"flex", alignItems:"center", justifyContent:"center",
          zIndex:1000, padding:16, backdropFilter:"blur(4px)",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:"var(--paper)", borderRadius:20, padding:"32px 28px",
            width:"100%", maxWidth:320, boxShadow:"0 20px 60px rgba(0,0,0,.25)",
          }}>
            <div style={{textAlign:"center", marginBottom:20}}>
              <div style={{fontSize:44, marginBottom:8}}>{pinTarget.emoji}</div>
              <div style={{fontSize:17, fontWeight:700, color:"var(--text)"}}>{pinTarget.label}</div>
              <div style={{fontSize:12, color:"var(--muted)", marginTop:4}}>ใส่รหัสเพื่อเข้าใช้งาน</div>
            </div>
            <input
              autoFocus type="password" value={pin}
              onChange={e => { setPin(e.target.value); setErr(false); }}
              onKeyDown={e => e.key === "Enter" && handlePin()}
              placeholder="รหัสผ่าน"
              style={{
                width:"100%", padding:"12px 16px", borderRadius:12,
                border: err ? "2px solid var(--dang)" : "1.5px solid var(--bdr)",
                fontSize:16, fontFamily:"inherit", boxSizing:"border-box",
                textAlign:"center", letterSpacing:"0.2em",
                background: err ? "var(--dang-t,#fff0f0)" : "var(--g-50)",
                outline:"none", marginBottom: err ? 6 : 16,
              }}/>
            {err && (
              <div style={{color:"var(--dang)", fontSize:12, textAlign:"center", marginBottom:12}}>
                รหัสไม่ถูกต้อง
              </div>
            )}
            <button onClick={handlePin} style={{
              width:"100%", padding:"12px", borderRadius:12,
              background:"var(--g-600)", color:"#fff", border:"none",
              fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
            }}>เข้าสู่ระบบ</button>
            <button onClick={() => setPinTarget(null)} style={{
              width:"100%", padding:"10px", borderRadius:12, marginTop:8,
              background:"transparent", color:"var(--muted)",
              border:"1px solid var(--bdr)", fontSize:13,
              cursor:"pointer", fontFamily:"inherit",
            }}>ยกเลิก</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────── Zort staleness banner ──────────────
const ZORT_THRESHOLDS = {
  product:           { days: 7,  label: "ข้อมูลสินค้า" },
  dailysales:        { days: 7,  label: "ยอดขายรายวัน" },
  transferDetail:    { days: 7,  label: "การโอน/ปรับ" },
  monthlysales:      { days: 30, label: "ยอดขายรายเดือน" },
  transactionDetail: { days: 30, label: "รายการธุรกรรม" },
};

function ZortBanner({ data }) {
  if (!data || !data.updatedAt) return null;
  const today = new Date();
  const stale = Object.entries(ZORT_THRESHOLDS).filter(([key, cfg]) => {
    const val = data.updatedAt[key];
    if (!val) return true;
    const diff = (today - new Date(val)) / (1000 * 60 * 60 * 24);
    return diff > cfg.days;
  }).map(([, cfg]) => cfg.label);

  if (stale.length === 0) return null;
  return (
    <div className="no-print" style={{
      background:"#fff8e1", borderBottom:"1.5px solid #f59e0b",
      padding:"9px 20px", display:"flex", alignItems:"center", gap:8, fontSize:13
    }}>
      <span style={{color:"#a07417", fontWeight:700}}>⚠️ ข้อมูลเก่า:</span>
      <span style={{color:"#92400e"}}>{stale.join(", ")} — ควรอัปโหลดข้อมูลใหม่จาก Zort</span>
    </div>
  );
}

const LS_KEY      = "dmj_dashboard_data_v1";
const LS_SRC_KEY  = "dmj_dashboard_source_v1"; // "upload" | "sheet"

// กาง `p.mo` (รูปแบบย่อจาก GAS) กลับเป็น `p.monthly` เต็มรูปแบบเดิม
// ทำไมต้องกางเป็น array เต็มทุกเดือน ไม่ใช่เก็บแบบย่อไว้ใช้เลย:
// view หลายจุดตีความ p.monthly ตาม **ตำแหน่ง** ไม่ใช่ตามชื่อเดือน — StockView ใช้ `m.slice(-3)`
// = "3 เดือนหลังสุด", TrendsView ใช้ `m.slice(0, half)` = "ครึ่งแรกของช่วงเวลา" ถ้าเก็บเฉพาะเดือน
// ที่มียอด `slice(-3)` จะกลายเป็น "3 เดือนหลังสุดที่ขายได้" ซึ่งคนละความหมาย → ตัวเลข "ควรสั่ง"
// และ "สินค้าจม" เพี้ยนแบบไม่มี error ให้เห็น · การย่อจึงทำแค่ตอนส่งผ่านเน็ต ไม่ใช่ตอนใช้งาน
// (payload เก่าที่ไม่มี `mo` — เช่นข้อมูลค้างใน localStorage ก่อนอัปเดต — ปล่อยผ่านตามเดิม)
function expandMonthlyCompact(d) {
  if (!d || !Array.isArray(d.products)) return d;
  const labels = d.monthLabels || [];
  d.products.forEach(p => {
    if (!p || !p.mo) return;
    const dense = labels.map(ml => ({ month: ml, qty: 0, sales: 0 }));
    p.mo.forEach(row => {
      const cell = dense[row[0]];
      if (cell) { cell.qty = row[1]; cell.sales = row[2]; }
    });
    p.monthly = dense;
    delete p.mo;   // ไม่เก็บซ้ำสองรูปแบบ — localStorage จะบวมโดยไม่จำเป็น
  });
  return d;
}

function enrichData(d) {
  if (!d || !Array.isArray(d.products)) return d;
  expandMonthlyCompact(d);
  // Normalize field names from Google Sheets (category → cat, etc.)
  d.products.forEach(p => {
    if (!p.cat && p.category) p.cat = p.category;
    // ── Parse ZORT tags (col G) → supplier codes vs สถานะ (Thai) ──
    // กติกา: รหัส supplier เป็นภาษาอังกฤษ/ตัวเลข (ไม่มีอักษรไทย),
    //        ส่วน tag สถานะ (เช่น "สินค้าจมเกิน2เดือน", "ขายหน้าร้าน") มีอักษรไทย
    const THAI_RE = /[฀-๿]/;
    const rawTags = String(p.tag || "").split(",").map(t => t.trim()).filter(Boolean);
    p.supplierTags = rawTags.filter(t => !THAI_RE.test(t));
    p.statusTags   = rawTags.filter(t =>  THAI_RE.test(t));
    // ── จำนวนเดือนที่สินค้าจม = นานแค่ไหนแล้วที่ไม่ถูกโอนสาย5→หน้าร้าน ──
    // ใช้ lastTransferDate (วันโอนออกหน้าร้านล่าสุด) เป็นหลัก
    //   ถ้าไม่เคยโอนเลย → fallback วันเข้าคลังล่าสุด (lastStockInDate)
    // นับเฉพาะสินค้าที่ยังมีสต็อกในคลังสาย5 (qtyWH > 0) — ของหมดคลัง = ไม่จม
    // null = ไม่ทราบ (ไม่มีข้อมูลวันที่เลย), 0 = โอน/เข้าคลังวันนี้/เร็วๆ นี้
    let dm = null;
    const whOnHand = (p.warehouseQty != null) ? p.warehouseQty
                   : (p.qtyWH != null) ? p.qtyWH
                   : (p.qty || 0);
    const monthsSince = (d) => {
      if (!d) return null;
      const now = new Date();
      let ref = null;
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) {              // yyyy-MM-dd (lastTransferDate / ISO lastStockInDate)
        const [y, m, day] = d.substring(0,10).split("-").map(Number);
        ref = new Date(y, m - 1, day);
      } else {                                          // DD/MM/YYYY (legacy lastStockInDate)
        const parts = String(d).split("/");
        if (parts.length === 3) ref = new Date(+parts[2], +parts[1] - 1, +parts[0]);
      }
      if (!ref || isNaN(ref)) return null;
      let mo = (now.getFullYear() - ref.getFullYear()) * 12 + (now.getMonth() - ref.getMonth());
      if (now.getDate() < ref.getDate()) mo -= 1;       // ยังไม่ครบเดือนเต็ม
      return mo < 0 ? 0 : mo;
    };
    if (whOnHand > 0) {
      dm = monthsSince(p.lastTransferDate) ?? monthsSince(p.lastStockInDate) ?? null;
    }
    p.deadMonths = dm;
    // supplier จาก tag เป็นแหล่งหลัก (เลิกพึ่งสูตร col H) — fallback col H ถ้าไม่มี tag
    if (p.supplierTags.length) p.vendor = p.supplierTags[0];
  });
  try {
    if (typeof detectColor === 'function') {
      d.products.forEach(p => { if (!p.color) p.color = detectColor(p.name); });
    }
    if (typeof mtoBase === 'function') {
      const map = {};
      d.products.filter(p => p.isMTO).forEach(p => {
        const k = mtoBase(p.name);
        if (!map[k]) map[k] = { base: k, variants: [], totalRev: 0, totalQty: 0 };
        map[k].variants.push(p);
        map[k].totalRev += (p.soldRev || 0);
        map[k].totalQty += (p.soldQty || 0);
      });
      d.mtoGroups = Object.values(map).sort((a,b) => b.totalRev - a.totalRev);
    }
  } catch (e) {
    // ป้องกัน white screen เมื่อสินค้าไม่มี name หรือ detectColor/mtoBase throw
    console.warn("enrichData: error during color/mto enrichment", e);
  }
  return d;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    // ปกติของที่เซฟไว้ถูกกางแล้ว (saveToStorage เรียกหลัง enrichData) — กางซ้ำที่นี่เป็นตาข่ายกันพลาด
    // เผื่อมีเส้นทางไหนเซฟข้อมูลดิบลงไป จะได้ไม่กลายเป็น "กราฟว่างเงียบ ๆ" ที่ไล่หาสาเหตุยาก
    // (ไม่มีคีย์ `mo` = ไม่ทำอะไรเลย จึงไม่มีต้นทุนกับข้อมูลที่กางแล้ว)
    return expandMonthlyCompact(JSON.parse(raw));
  } catch (e) { return null; }
}

// ── Phase 7.4: "ใบรับรองว่าข้อมูลชุดที่เราถืออยู่ยังตรงกับ server" ─────────────────
// payload หนัก ~4.2MB · วัดจริง 5 ส.ค. 2026: 15 เครื่องโหลดพร้อมกัน = 63MB ผ่านท่อเดียว
// ที่ ~2.3MB/วิ → 27 วิ ซึ่งนานเกินอายุลิงก์ดาวน์โหลดของ Google → พังเป็น HTTP 404 กลางคัน
// ถามก่อนด้วยคำตอบ ~40 ไบต์ว่า "เปลี่ยนหรือยัง" ถ้ายัง = ไม่ต้องโหลดซ้ำเลยสักไบต์
const VER_KEY = "dmj_data_ver";
// ⚠️ เพดานอายุ **จำเป็น ห้ามถอด** — `dmj_last_write_ts` ขยับเมื่อแก้ข้อมูลผ่านแอป และตอน
// syncZortBoth (ทุก 2 ชม.) เท่านั้น · **แก้ชีตด้วยมือใน Google Sheets ไม่ขยับ** (ข้อจำกัดเดิม
// ของระบบ ไม่ใช่ของใหม่) ถ้าเชื่อ ts ได้ตลอดไป คนที่แก้ชีตเองจะไม่เห็นผลจนกว่าจะกดปุ่ม Sync
// ซึ่งเป็นการ "ไม่เห็นข้อมูลใหม่โดยไม่มีอะไรบอก" — แย่กว่าโหลดช้าเสมอ
const VER_MAX_SKIP_MS = 30 * 60 * 1000;

function readVerStamp() {
  try { return JSON.parse(localStorage.getItem(VER_KEY) || "null"); } catch (e) { return null; }
}
// ทิ้งใบรับรอง — ใช้เมื่อข้อมูลในมือ "ไม่ได้มาจากชีตแล้ว" (เช่นผู้ใช้อัปโหลดไฟล์ทับ)
// ถ้าไม่ทิ้ง: ts ยังตรงกับ server → รอบถัดไปจะข้ามการโหลด แล้วข้อมูลจากไฟล์ค้างอยู่
// พร้อมป้าย "ซิงค์แล้ว" ทั้งที่ไม่เคยดึงจากชีตเลย
function clearVerStamp() {
  try { localStorage.removeItem(VER_KEY); } catch (e) { /* ignore */ }
}
function writeVerStamp(ts, role) {
  try {
    localStorage.setItem(VER_KEY, JSON.stringify({ ts: ts || 0, at: Date.now(), role: role || "" }));
  } catch (e) { /* localStorage เต็ม/ปิดอยู่ → แค่ไม่ได้ประหยัดรอบหน้า ไม่กระทบการทำงาน */ }
}
// คืน true = "server ยังเป็นข้อมูลชุดเดียวกับที่เราถืออยู่" → ข้ามการโหลด payload ได้
// **ตอบไม่ได้/ไม่แน่ใจ → false เสมอ** (ไปโหลดจริง) — เดาผิดทางนี้แค่ช้าลง
// เดาผิดอีกทางคือผู้ใช้เห็นตัวเลขสต็อกเก่าโดยไม่รู้ตัว ซึ่งใช้ตัดสินใจสั่งของจริง
// GAS ที่ยังเป็นโค้ดเก่าจะไม่รู้จัก `action=ver` แล้ว **คืน payload เต็มก้อนแทน** (action ที่ไม่รู้จัก
// ตกลงเส้นทางปกติ) = จ่ายไบต์ฟรี 4.2MB แล้วยังต้องโหลดซ้ำอีกรอบ — เสียเป็นสองเท่าพอดี
// เกิดได้จริงเพราะ Cloudflare (เว็บ) กับ GitHub Actions (GAS) deploy คนละจังหวะ และถ้า
// Actions พัง จะค้างสถานะนี้ยาว → จำไว้ 1 ชม. แล้วเลิกถาม (กลับมาถามเองเมื่อครบเวลา)
const VER_UNSUPPORTED_KEY = "dmj_ver_unsupported";
const VER_UNSUPPORTED_MS  = 60 * 60 * 1000;

function checkDataUnchanged(sheetUrl, role) {
  const stamp = readVerStamp();
  if (!stamp || !stamp.ts) return Promise.resolve(false);
  try {
    const off = parseInt(localStorage.getItem(VER_UNSUPPORTED_KEY) || "0", 10);
    if (off && Date.now() - off < VER_UNSUPPORTED_MS) return Promise.resolve(false);
  } catch (e) { /* อ่านไม่ได้ก็ถามตามปกติ */ }
  // payload ผูกกับ role (GAS ตัดก้อนที่ role นั้นไม่มีแท็บให้เปิดออก) — คนละ role = คนละรูปร่าง
  // ts ตรงกันไม่ได้แปลว่าใช้แทนกันได้ ถ้าไม่เช็คตรงนี้ owner ที่เพิ่งสลับมาจะได้ก้อนที่ขาดกราฟ
  if ((stamp.role || "") !== (role || "")) return Promise.resolve(false);
  if (Date.now() - (stamp.at || 0) > VER_MAX_SKIP_MS) return Promise.resolve(false);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const sep = sheetUrl.includes("?") ? "&" : "?";
  return fetch(`${sheetUrl}${sep}action=ver&_t=${Date.now()}`, { signal: controller.signal, cache: "no-store" })
    .then(r => r.json())
    .then(v => {
      // ตอบมาแต่ไม่ใช่รูปแบบของ `ver` = GAS ยังไม่รู้จัก action นี้ → เลิกถามไปสักพัก
      // (ต่างจาก .catch ข้างล่างซึ่งคือ "เน็ตพัง/ตอบไม่ได้" — อันนั้นไม่ใช่เรื่องเวอร์ชัน ห้ามตีตรา)
      if (!v || !v.ok) {
        try { localStorage.setItem(VER_UNSUPPORTED_KEY, String(Date.now())); } catch (e) {}
        return false;
      }
      return !!(v.ts && v.ts === stamp.ts);
    })
    .catch(() => false)
    .finally(() => clearTimeout(timeout));
}

function saveToStorage(d, source) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(d));
    localStorage.setItem(LS_SRC_KEY, source || "upload");
  } catch (e) {
    console.warn("Could not persist data:", e.message);
  }
}

// ROLE_LABELS มี emoji นำหน้า — ใช้ตัวนี้แทนตอนต้องการข้อความล้วน (เช่น window._currentUser ที่โชว์ใน Audit Log)
const ROLE_TH_PLAIN = { owner: "เจ้าของ", saler: "Sale", warehouse: "คลังสินค้า", frontstore: "หน้าร้าน", employee: "พนักงาน", dev: "DEV" };

// role ที่ใช้ nav แบบ owner (2 ชั้น + "เพิ่มเติม") และมีสิทธิ์ระดับผู้ดูแล
function isAdminRole(r) { return r === "owner" || r === "dev"; }
const SESSION_TOKEN_KEY = "dmj_session_token";
const LINE_STATE_KEY = "dmj_line_state";
const LINE_REDIRECT_KEY = "dmj_line_redirect_uri";
const LINE_STATE_AT_KEY = "dmj_line_state_at";
const LINE_CHANNEL_KEY = "dmj_line_channel"; // cache channelId — ให้ปุ่มเป็นลิงก์พร้อมกดตั้งแต่ render แรก
const LINE_STATE_TTL_MS = 30 * 60 * 1000; // ครึ่งชั่วโมง — พอสำหรับล็อกอิน LINE ที่ต้องสลับไปแอป LINE
// รับช่วงล็อกอินข้ามเบราว์เซอร์ (iOS PWA เด้งไปจบใน Safari) — ดูคำอธิบายเต็มที่ makeHandoffPair()
const LINE_HANDOFF_SECRET_KEY = "dmj_line_handoff_secret";
const LINE_HANDOFF_STATE_KEY = "dmj_line_handoff_state";
const LINE_HANDOFF_AT_KEY = "dmj_line_handoff_at";
const LINE_HANDOFF_TTL_MS = 15 * 60 * 1000; // ต้องไม่เกิน LOGIN_HANDOFF_TTL_SEC ฝั่ง GAS

// ── Safe storage ──────────────────────────────────────────────────────────
// iOS Safari โยน exception ตอนแตะ localStorage/sessionStorage ได้จริงหลายกรณี
// (Private Browsing, "ป้องกันการติดตาม" บล็อกที่เก็บข้อมูล, พื้นที่เต็ม) — เดิมเรียกตรง ๆ
// ใน useState initializer ทำให้ App โยน error ตั้งแต่ render แรก = จอขาว เข้าไม่ได้เลย
// ทุกจุดของ flow ล็อกอินต้องผ่าน 4 ฟังก์ชันนี้เท่านั้น (function declaration → hoist ใช้ได้ทั้งไฟล์)
function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function ssSet(k, v) { try { sessionStorage.setItem(k, v); return true; } catch (e) { return false; } }
function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

// state/redirect_uri ของ LINE Login เก็บใน localStorage (ไม่ใช่ sessionStorage) — สำคัญมากกับ iOS
// เพราะการล็อกอินบนมือถือเด้งออกไปแอป LINE แล้วกลับมาที่ "แท็บใหม่" หรือคนละ browsing context
// (โดยเฉพาะตอนเปิดจาก PWA หน้าโฮม) · sessionStorage ผูกกับแท็บ → หายเกลี้ยง → state ไม่ตรง
// → ค้างที่ "เซสชันล็อกอินไม่ตรงกัน" ตลอด · localStorage แชร์ข้ามแท็บใน browser เดียวกัน
// มี TTL กันค่าค้างข้ามวัน · เขียนทั้ง 2 ที่ (session ด้วย) เผื่อ localStorage ถูกบล็อก
function saveLineHandshake(state, redirectUri) {
  ssSet(LINE_STATE_KEY, state); ssSet(LINE_REDIRECT_KEY, redirectUri);
  lsSet(LINE_STATE_KEY, state); lsSet(LINE_REDIRECT_KEY, redirectUri);
  lsSet(LINE_STATE_AT_KEY, String(Date.now()));
}
function readLineHandshake() {
  const at = parseInt(lsGet(LINE_STATE_AT_KEY) || "0", 10);
  const fresh = at > 0 && (Date.now() - at) < LINE_STATE_TTL_MS;
  return {
    state: ssGet(LINE_STATE_KEY) || (fresh ? lsGet(LINE_STATE_KEY) : null),
    redirectUri: ssGet(LINE_REDIRECT_KEY) || (fresh ? lsGet(LINE_REDIRECT_KEY) : null),
  };
}
// เปิดหน้า authorize ของ LINE — ต้องแยกพฤติกรรม 2 แบบ ห้ามใช้แบบเดียวทั้งหมด
//
// ① เบราว์เซอร์ปกติ (Safari/Chrome) → ปล่อยให้ <a href> navigate เอง
//    การแตะลิงก์จริงคือ user gesture เต็ม ๆ เบราว์เซอร์จึงยอมเปิดแอป LINE (universal/app link)
//
// ② PWA ที่เปิดจากไอคอนหน้าโฮม (standalone) → ต้อง preventDefault แล้ว set location เอง
//    บน iOS การ "แตะลิงก์ข้าม origin" ในโหมด standalone จะเด้งออกไปเปิด Safari
//    → ล็อกอินสำเร็จใน Safari แต่ token ไปอยู่ใน storage ของ Safari ซึ่งแยกจาก PWA คนละใบ
//    → กลับมาเปิดไอคอนหน้าโฮมก็ยังไม่ได้ล็อกอิน (ตรงกับอาการที่เจอ)
//    การ assign window.location.href แทน จะ navigate อยู่ใน webview ของ PWA เอง
//    ทำใน onClick จึงยังอยู่ในจังหวะ gesture เดียวกัน ไม่เสียสิทธิ์เปิดแอป LINE
function isStandaloneApp() {
  try {
    return !!navigator.standalone ||
           !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  } catch (e) { return false; }
}
// เปิดลิงก์จากในแชท/ประกาศ LINE โดยตรง = อยู่ใน "เบราว์เซอร์ในแอป LINE" เอง (คนละอย่างกับ
// สลับไปเปิดแอป LINE จาก Safari) — เว็บวิวของ LINE เอง (ไม่ใช่ Safari/Chrome) มักบล็อก/ทำให้
// fetch() ไปเซิร์ฟเวอร์นอกโดเมนพังกลางทางในหลายเวอร์ชัน (มือถือ) → ล็อกอินเสร็จ (ได้ code จาก LINE)
// แต่ตอนแลก code เป็น token ผ่าน fetch() กลับ error แปลกๆ (เจอจริง: "The string did not match
// the expected pattern.") ทั้งที่ localStorage/handoff ทุกอย่างพร้อมหมด — ไม่มีทางแก้ฝั่งเว็บเรา
// เพราะเป็นข้อจำกัดของเว็บวิว LINE เอง ทางออกเดียวคือให้ผู้ใช้ "เปิดด้วยเบราว์เซอร์อื่น" ก่อน
// (LINE เองก็มีเมนูนี้ให้อยู่แล้วที่ "•••" มุมขวาบน)
function isLineInAppBrowser() {
  try { return /\bLine\//i.test(navigator.userAgent || ""); } catch (e) { return false; }
}
function lineLoginNavigate(e, authBase, extra) {
  saveLineHandshake(authBase.state, authBase.redirectUri);
  markHandoffPending(authBase.state);
  if (isStandaloneApp()) {
    e.preventDefault();
    window.location.href = authBase.url + (extra || "");
  }
}

// ── รับช่วงล็อกอินข้ามเบราว์เซอร์ (login handoff) ────────────────────────────
// ปัญหาที่แก้: iPhone ที่เปิดแอปจากไอคอนหน้าโฮม (standalone) พอกดล็อกอิน iOS มักเด้ง
// ออกไปเปิด Safari → ล็อกอินสำเร็จ "ใน Safari" แต่ token ไปอยู่ localStorage ของ Safari
// ซึ่งคนละใบกับของแอปหน้าโฮม → กลับมาเปิดไอคอนก็ยังไม่ได้ล็อกอิน วนแบบนี้ตลอด
// (การบังคับ navigate ในหน้าต่างของ PWA เองช่วยได้บาง iOS แต่ไม่ทุกรุ่น — ต้องมีทางกู้)
//
// วิธี: สุ่ม "รหัสลับ" เก็บไว้ในเครื่องฝั่งที่ "เริ่ม" ล็อกอิน แล้วส่ง SHA-256 ของมันไปเป็น
// `state` ของ LINE · ฝั่งไหนก็ตามที่รับ callback จะฝากผลล็อกอินไว้ที่เซิร์ฟเวอร์ใต้คีย์ = state
// · แอปหน้าโฮมกลับมาเปิดเมื่อไหร่ก็ยื่นรหัสลับแลก token คืนได้เอง ไม่ต้องแชร์ storage กัน
//
// ที่โผล่ใน URL/ประวัติเบราว์เซอร์คือ "แฮช" ไม่ใช่รหัสลับ — ย้อนกลับไม่ได้ · แลกได้ครั้งเดียว
// · หมดอายุ 15 นาที (เท่ากับฝั่ง GAS)
function hex_(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
async function makeHandoffPair() {
  try {
    const c = window.crypto;
    if (!c || !c.getRandomValues || !c.subtle || !c.subtle.digest) return null; // เครื่องเก่า/ไม่ใช่ https
    const rnd = new Uint8Array(32); c.getRandomValues(rnd);
    const secret = hex_(rnd);
    const digest = await c.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    return { secret, state: hex_(new Uint8Array(digest)) };
  } catch (e) { return null; }
}
function saveHandoffPair(pair) {
  if (!pair) return;
  lsSet(LINE_HANDOFF_SECRET_KEY, pair.secret);
  lsSet(LINE_HANDOFF_STATE_KEY, pair.state);
}
// ตีตราว่า "กำลังรอผลล็อกอินอยู่" — ตั้งตอนแตะปุ่มเท่านั้น เพื่อให้รู้ว่าควรไปตามผลมารึยัง
// ตั้งให้ก็ต่อเมื่อ state ที่ส่งให้ LINE เป็นแฮชของรหัสลับที่เก็บไว้จริง ๆ เท่านั้น — ไม่งั้น
// (เช่นแตะปุ่มก่อนสุ่มรหัสเสร็จ แล้วตกไปใช้ state สุ่มธรรมดา) จะรอผลที่ไม่มีวันมา
function markHandoffPending(state) {
  if (!state || lsGet(LINE_HANDOFF_STATE_KEY) !== state) return false;
  return lsSet(LINE_HANDOFF_AT_KEY, String(Date.now()));
}
// คืนคู่รหัสที่ยังรอผลอยู่ (ยังไม่หมดอายุ) หรือ null
function readPendingHandoff() {
  const at = parseInt(lsGet(LINE_HANDOFF_AT_KEY) || "0", 10);
  if (!at || (Date.now() - at) >= LINE_HANDOFF_TTL_MS) return null;
  const secret = lsGet(LINE_HANDOFF_SECRET_KEY);
  const state = lsGet(LINE_HANDOFF_STATE_KEY);
  return secret ? { secret, state, at } : null;
}
function clearHandoff() {
  lsDel(LINE_HANDOFF_SECRET_KEY); lsDel(LINE_HANDOFF_STATE_KEY); lsDel(LINE_HANDOFF_AT_KEY);
}

function clearLineHandshake() {
  ssDel(LINE_STATE_KEY); ssDel(LINE_REDIRECT_KEY);
  lsDel(LINE_STATE_KEY); lsDel(LINE_REDIRECT_KEY); lsDel(LINE_STATE_AT_KEY);
}

// redirect_uri ต้อง "ตรงเป๊ะ" ทั้งตอนขอ authorize และตอนแลก token ไม่งั้น LINE ปฏิเสธ
// → คำนวณที่เดียวเสมอ ห้าม inline ซ้ำ · normalize ไฟล์ .html เป็น "/" ด้วย เพราะ _redirects
// ทำให้ "/" กับ "/Doomuenjing%20Dashboard.html" เป็นหน้าเดียวกัน แต่ LINE ลงทะเบียนไว้แค่ "/"
function lineRedirectUri() {
  // เดิมเคย derive จาก window.location.pathname แล้วพยายาม normalize เอง — พังจริงเพราะ
  // path ที่เห็นจริงในมือถือ (PWA / index.html meta-refresh / _redirects rewrite) ไม่แน่นอน
  // เช่นเจอ "/Doomuenjing%20Dashboard/" ทั้งที่ Callback URL ที่ตั้งไว้ใน LINE คือแค่ origin+"/"
  // → ไม่เดาอีกต่อไป ใช้ origin + "/" ตรง ๆ เสมอ ต้องตรงกับ Callback URL ที่ตั้งไว้ใน LINE Login เป๊ะ
  return window.location.origin + "/";
}

// POST action ไปยัง GAS (ใช้กับ authLine/me/logout/listStaff/saveStaff) — SHEET_DEPLOY_URL มี ?token= ติดอยู่แล้ว
async function postAuthAction(body) {
  const base = (typeof SHEET_DEPLOY_URL !== 'undefined') ? SHEET_DEPLOY_URL
             : ((typeof GOOGLE_SHEET_URL !== 'undefined') ? GOOGLE_SHEET_URL : null);
  if (!base) throw new Error("ยังไม่ได้ตั้งค่า Google Sheet URL");
  // วัดเวลาต่อ action แยกกัน — `me` (กลับเข้าแอปด้วย session เดิม) คือตัวที่อยู่บนเส้นทาง
  // "พนักงานมาสแกนเข้างาน" จริง ๆ ส่วน authLine/claimLoginHandoff เกิดเฉพาะตอนล็อกอินใหม่
  // ถ้าไม่แยก จะเห็นแค่ "auth ช้า" แล้วไปเร่งผิดตัว
  // ⚠️ รอบนี้ **แตะแค่การวัด ไม่แตะพฤติกรรม** — การเปลี่ยนมาใช้ dmjFetch/dmjJson + เพดานเวลา
  //    เป็นงาน Phase 7.6 ที่ถูกถอยออกไป ยังไม่เอากลับเข้ามาปนกับรอบนี้ (จะได้แยกออกว่าอะไรพัง)
  const _act = (body && body.action) || 'auth';
  window.dmjMark('auth:' + _act);
  try {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e) {
    // เน็ตมือถือในร้าน/คลังหลุดเป็นช่วง ๆ — คำขอที่ reject กลางทางคือสาเหตุหนึ่ง
    // ที่พนักงานต้องกดล็อกอินซ้ำหลายรอบ · ลองใหม่ให้เอง 2 ครั้ง (เว้น 1.5 / 3 วิ)
    // ⚠️ จงใจ "ไม่ใส่ timeout/เพดานเวลา" — Phase 7.6 ที่ตัดคำขอช้าทิ้งถูก revert
    //    ไปแล้วเพราะทำให้เข้าแอปไม่ได้ · ตรงนี้ retry เฉพาะตอน fetch reject จริงเท่านั้น
    //    ยิง authLine ซ้ำปลอดภัย เพราะ GAS cache ผลต่อ code ไว้ 10 นาที (authCodeCacheKey_)
    const tries = (arguments.length > 1 && arguments[1]) || 0;
    if (tries < 2) {
      await new Promise(r => setTimeout(r, 1500 * (tries + 1)));
      return postAuthAction(body, tries + 1);
    }
    throw e;
  } finally {
    // ต้องอยู่ใน finally — เวลาที่ "ล้มเหลว" มีค่าพอ ๆ กับเวลาที่สำเร็จ
    // (เคสที่เจ็บที่สุดคือรอนานแล้วค่อยพัง ซึ่งจะหายไปเลยถ้าวัดแต่ทางสำเร็จ)
    window.dmjMark('auth-done:' + _act);
  }
}

function App() {
  // ── ALL hooks first (no early returns before this block) ──
  // ภาษาปัจจุบัน — subscribe ที่ App ตัวเดียว เปลี่ยนภาษาแล้ว re-render ทั้งต้นไม้
  // → ทุก t() ทั้งแอปอ่านค่าใหม่ (ไม่ต้องเพิ่ม useLang ในทุก component)
  const _lang = useLang();
  const [role, setRole] = usS(() => ssGet("dmj_role") || null);
  const [staff, setStaff] = usS(null);       // {staffId,name,role,status,pictureUrl} — เมื่อล็อกอินผ่าน LINE
  // checking | needLogin | pending | disabled | ready
  // เริ่มที่ "ready" ทันทีถ้ามี role ค้างอยู่แล้ว (optimistic) — พนักงานเปิดแอปแล้วใช้งานได้เลย
  // ไม่ต้องรอ GAS ตอบ (cold start หลายวินาทีบนเน็ตมือถือ) · bootstrap ยังยิง me ตามไปเงียบ ๆ
  // แล้วค่อยเด้งเป็น pending/disabled/needLogin ถ้าสิทธิ์เปลี่ยน · ยกเว้นตอนมี ?code= (กำลังล็อกอิน) ต้องรอจริง
  const [authPhase, setAuthPhase] = usS(() => {
    try {
      if (new URLSearchParams(window.location.search).get("code")) return "checking";
      return ssGet("dmj_role") ? "ready" : "checking";
    } catch (e) { return "checking"; }
  });
  const [lineError, setLineError] = usS(null);
  // channelId ของ LINE Login — cache ไว้เพื่อให้ปุ่มล็อกอินเป็น <a href> ที่กดได้ทันที
  // (ห้ามมี await คั่นระหว่าง "แตะปุ่ม" กับ "navigate" ไม่งั้นเปิดแอป LINE ไม่ได้)
  const [lineChannelId, setLineChannelId] = usS(() => lsGet(LINE_CHANNEL_KEY) || null);
  // คู่รหัสรับช่วงล็อกอิน — `state` ที่ส่งให้ LINE คือ SHA-256 ของรหัสลับที่เก็บไว้ในเครื่องนี้
  // ถ้ามีคู่ที่ "ยังรอผลอยู่" ต้องใช้ตัวเดิม ห้ามสุ่มใหม่ทับ ไม่งั้นแลก token ที่ฝากไว้คืนไม่ได้
  const [handoffState, setHandoffState] = usS(() => { const p = readPendingHandoff(); return (p && p.state) || null; });
  const [handoffWaiting, setHandoffWaiting] = usS(() => !!readPendingHandoff());
  const [crossContextNote, setCrossContextNote] = usS(false); // ล็อกอินนี้เริ่มมาจากอีกที่ (แอปหน้าโฮม)
  const [authRefreshing, setAuthRefreshing] = usS(false);
  // "ตอนนี้เรามีข้อมูลอยู่ในมือหรือยัง" — ใช้ตัดสินว่าจะถาม `action=ver` ก่อนโหลดได้ไหม
  // ต้องเป็น ref ไม่ใช่อ่าน `data` ตรง ๆ เพราะ fetchFromSheet เป็น useCallback ที่ไม่มี `data`
  // ใน deps (ใส่ไม่ได้ — จะสร้างใหม่ทุกครั้งที่ข้อมูลเปลี่ยน แล้ว effect ที่ผูกกับมันจะยิงรัว)
  const hasDataRef = React.useRef(false);
  // "ตอนนี้เราถือ *ของสำรอง* (Phase 7.3) อยู่หรือเปล่า" — ต้องเป็น ref ด้วยเหตุผลเดียวกับ hasDataRef
  const staleRef = React.useRef(0);
  const [data, setData] = usS(null);
  usE(() => { hasDataRef.current = !!(data && Array.isArray(data.products) && data.products.length); }, [data]);
  const [error, setError] = usS(null);
  const [navLogoOk, setNavLogoOk] = usS(true);
  const [tab, setTab] = usS(() => ssGet("dmj_role") === "owner" ? "categories" : "overview");
  const [range, setRange] = usS("year");
  const [source, setSource] = usS(lsGet(LS_SRC_KEY) || "sheet");
  const [syncing, setSyncing] = usS(false);
  const [zortSyncing, setZortSyncing] = usS(false);
  const [zortSalesSyncing, setZortSalesSyncing] = usS(false);
  const [retryMsg, setRetryMsg] = usS("");
  // Phase 7.3: >0 = ข้อมูลชุดนี้เป็น "ของสำรอง" ที่ server ส่งมาระหว่างมีคนอื่นกำลังสร้างชุดใหม่
  // (ค่า = เวลาที่ข้อมูลชุดนั้นถูกสร้าง) · 0 = ข้อมูลสด
  const [staleAt, setStaleAt] = usS(0);
  usE(() => { staleRef.current = staleAt; }, [staleAt]);
  const [lastSync, setLastSync] = usS(lsGet("dmj_last_sync") || null);
  const [labelInitItems, setLabelInitItems] = usS(null); // for auto-populate from order summary
  const [isOnline, setIsOnline] = usS(() => navigator.onLine);
  const [lastSaved, setLastSaved] = usS(null); // auto-save timestamp
  const [confirmAction, setConfirmAction] = usS(null); // { type:"clearLocal"|"logout" }
  const [moreOpen, setMoreOpen] = usS(false); // dropdown "เพิ่มเติม" บน navtabs (owner)
  const [ownerGroup, setOwnerGroup] = usS(null); // หมวดหลักที่ owner "แตะดู" อยู่ (null = ตามหมวดของ tab ปัจจุบัน)
  const [moreRect, setMoreRect] = usS(null);  // position ของปุ่มเพิ่มเติม (fixed dropdown)
  const moreButtonRef = React.useRef(null);
  const [installPrompt, setInstallPrompt] = usS(null);
  const [installDismissed, setInstallDismissed] = usS(() => !!ssGet("dmj_install_dismissed"));
  const [activeCheckRequest, setActiveCheckRequest] = usS(null); // check request ที่ fs/wh กำลังทำ
  const [navToast, showNavToast, hideNavToast] = useToast(); // toast สำหรับ nav-level errors
  const tabHistoryRef = React.useRef([]); // track tab navigation for Android back
  const fetchingRef = React.useRef(false); // guard against concurrent fetchFromSheet calls
  // เมื่อ tab เปลี่ยน (กด subtab / นำทางจากการ์ดภาพรวม) → ล้าง "แตะดู" ให้หมวดหลักวิ่งตาม tab
  uE(() => { setOwnerGroup(null); }, [tab]);

  const sheetUrl = (typeof GOOGLE_SHEET_URL !== 'undefined') ? GOOGLE_SHEET_URL : "data.json";
  const sheetViewUrl = "https://docs.google.com/spreadsheets/d/11yL4u-XLUTCBObMppAj12nnmG0YlDZWsDn2XPCneoHQ/edit";

  // Full payload fetch (หนัก — ใช้ตอนโหลดครั้งแรก/กด Sync)
  // retryLeft: จำนวนครั้งที่เหลือ (3→2→1→0) กัน GAS cold start หลายชั้น
  // force=true → ใส่ `fresh=1` บังคับให้ GAS สร้าง payload ใหม่ ข้าม cache ฝั่ง server
  // ใช้เฉพาะตอนผู้ใช้ "กดสั่งเอง" (ปุ่ม Sync / ลองใหม่) เท่านั้น
  // ปกติ (โหลดแอป/poll/refetch หลังบันทึก) ปล่อยให้ใช้ cache ได้ — doPost เรียก invalidateCache_
  // ทุกครั้งที่มีการแก้ข้อมูล ดังนั้น "เครื่องอื่นบันทึกแล้วเราต้องเห็น" ยังทำงานเหมือนเดิม
  const fetchFromSheet = usC((retryLeft, force) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    retryLeft = (typeof retryLeft === 'number' && retryLeft >= 0) ? retryLeft : 3;
    setSyncing(true);
    setError(null);
    const controller = new AbortController();
    // attempt แรก (retryLeft=3): 35s รอ GAS cold start (script ใหญ่ cold start ได้ถึง 25-30s)
    // retry ถัดไป: 20s (GAS warm แล้ว ควรตอบ < 5s)
    const timeoutMs = retryLeft === 3 ? 35000 : 20000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    // role → GAS ตัดก้อนข้อมูลที่ role นี้ไม่มีแท็บให้เปิดดูออก (ประวัติซื้อ/โอน/กราฟยอดขาย)
    // pv=2 → บอกว่าเว็บเวอร์ชันนี้อ่านยอดรายเดือนแบบย่อ (`mo`) เป็น · ไม่ส่ง = ได้รูปแบบเดิม
    const bustUrl = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + '_t=' + Date.now()
                  + (force ? '&fresh=1' : '')
                  + '&pv=2&role=' + encodeURIComponent(role || '');
    // ใช้ผลที่เริ่มโหลดไว้ตั้งแต่ต้นหน้า (script ใน <head> ของ HTML) — ตัดเวลา GAS
    // ออกจากคิว เพราะมันเดินขนานไปกับการ compile JSX แล้ว · ใช้ได้ครั้งเดียว
    // (เฉพาะ attempt แรก) การ refetch/retry ทุกครั้งหลังจากนี้ยิงใหม่เสมอ = ได้ข้อมูลสด
    let prefetched = null;
    if (retryLeft === 3 && typeof window !== 'undefined' && window._dataPrefetch) {
      // ใช้ผล prefetch ได้เฉพาะเมื่อยิงด้วย role เดียวกับที่ล็อกอินจริง — payload ผูกกับ role แล้ว
      // ถ้า role ไม่ตรง ก้อนที่ prefetch มาอาจขาดข้อมูลที่ role นี้ต้องใช้ (เช่น owner ได้ก้อนของ
      // saler มาแล้วหน้าภาพรวมไม่มีกราฟ) → ทิ้งแล้วยิงใหม่ ช้ากว่านิดเดียวแต่ข้อมูลไม่ขาด
      if ((window._dataPrefetchRole || '') === (role || '')) prefetched = window._dataPrefetch;
      // ⚠️ role ไม่ตรง = ทิ้งผล **แต่ต้องยกเลิกของจริงด้วย** ไม่ใช่แค่ปล่อยตัวแปรเป็น null
      // ก้อน prefetch หนักหลายเมกะ ถ้าปล่อยไหลต่อจะกินท่อเดียวกับก้อนใหม่ที่กำลังจะยิง
      // → โหลดหน้าเดียวจ่ายสองเท่า ซึ่งเป็นตัวเร่งให้ลิงก์ดาวน์โหลดของ Google หมดอายุ (404)
      else { try { if (window._dataPrefetchAbort) window._dataPrefetchAbort(); } catch (e) {} }
      window._dataPrefetch = null;
    }
    // ── Phase 7.4: ถามก่อนโหลด — "ข้อมูลเปลี่ยนหรือยัง" (คำตอบ ~40 ไบต์) ──
    // ไม่เปลี่ยน = ข้ามการโหลด 4.2MB ไปเลย · **ข้ามการถาม** ใน 4 กรณีที่ถามแล้วได้ผลผิด/ไม่ได้อะไร:
    //   · force (ผู้ใช้กด Sync/ลองใหม่เอง) — อาจเพิ่งแก้ชีตด้วยมือ ซึ่ง ts ไม่ขยับ ต้องดึงจริงเสมอ
    //   · ยังไม่มีข้อมูลในมือ — ไม่มีอะไรให้เทียบ ถามไปก็เสียเวลาเปล่าหนึ่งรอบ
    //   · มีผล prefetch อยู่แล้ว — ไบต์ถูกโหลดไปตั้งแต่ต้นหน้าแล้ว ถามตอนนี้ไม่ประหยัดอะไร
    //   · **กำลังถือของสำรองอยู่ (staleRef)** — ของสำรองถูกเสิร์ฟตอน TTL หมดได้ด้วย ซึ่งกรณีนั้น
    //     `lastModified` ของมันเท่ากับ ts ปัจจุบันพอดี → ver จะตอบ "ไม่เปลี่ยน" → ข้ามการโหลด →
    //     `setStaleAt(0)` ไม่ถูกเรียก → **แถบเหลือง "กำลังอัปเดตข้อมูล" ค้างถาวรจนกว่าจะกด Sync**
    const verGate = (!force && !prefetched && !staleRef.current && hasDataRef.current)
      ? checkDataUnchanged(sheetUrl, role)
      : Promise.resolve(false);
    verGate.then(unchanged => {
      if (unchanged) {
        // ข้อมูลชุดเดิมยังถูกต้อง — ถือว่า "ซิงค์สำเร็จ" จริง ๆ (เราเพิ่งยืนยันกับ server มา)
        // ต้องอัปเดต lastSync ด้วย ไม่งั้นผู้ใช้จะเห็นเวลาซิงค์ค้างแล้วนึกว่าแอปแขวน
        clearTimeout(timeout);
        fetchingRef.current = false;
        setSyncing(false);
        setError(null);
        setRetryMsg("");
        const now = new Date().toISOString();
        try { localStorage.setItem("dmj_last_sync", now); } catch (e) {}
        setLastSync(now);
        return;
      }
      // ห้าม `r.json()` ตรง ๆ — GAS ตอบหน้า HTML ได้ (ลิงก์หมดอายุ/กำลัง deploy/quota เต็ม)
      // แล้วผู้ใช้จะเห็น `SyntaxError: Unexpected token '<'` ซึ่งอ่านไม่รู้เรื่อง (บทเรียนข้อ 13)
      // ✅ `payload:ไบต์แรก` มาจากไบต์จริงแล้ว — `dmjJsonProgress` (ก้อนแรกของ Phase 7.6
      //    ที่เอากลับมา เฉพาะส่วนวัดผล) อ่านคำตอบแบบสตรีมแล้ว mark ตอนได้ไบต์แรก →
      //    แยก "รอ GAS คิด" (เริ่ม→ไบต์แรก) ออกจาก "ดาวน์โหลด" (ไบต์แรก→ครบ) ได้จริง
      // Phase 7.6 (เอากลับทีละก้อน — เริ่มจาก "การวัด" ก่อน ไม่แตะ logic อื่น):
      // อ่านคำตอบแบบสตรีมเพื่อ mark `payload:ไบต์แรก` = จังหวะที่ GAS เริ่มตอบจริง
      // → BootTrace แยกได้ว่า "รอ GAS คิด" (เริ่ม→ไบต์แรก) กับ "ดาวน์โหลด" (ไบต์แรก→ครบ)
      // อันไหนคือคอขวด · เบราว์เซอร์ไม่รองรับสตรีม → dmjJsonProgress fallback ไป dmjJson เอง
      let _firstByte = false, _gotBytes = 0;
      const onBytes = n => {
        _gotBytes = n;
        if (!_firstByte) { _firstByte = true; try { window.dmjMark('payload:ไบต์แรก'); } catch (e) {} }
      };
      const getJson = r => (typeof dmjJsonProgress === 'function' ? dmjJsonProgress(r, onBytes)
                          : typeof dmjJson === 'function' ? dmjJson(r) : r.json());
      window.dmjMark(prefetched ? 'payload:เริ่ม(prefetch)' : 'payload:เริ่ม');
      return (prefetched
      ? prefetched.then(d => d || fetch(bustUrl, { signal: controller.signal }).then(getJson))
      : fetch(bustUrl, { signal: controller.signal }).then(getJson))
      .then(d => {
        // แนบขนาดที่ดาวน์โหลดจริง (หลังคลาย gzip) ให้เห็นในไทม์ไลน์ด้วย — ช่วยดูแนวโน้มว่า
        // ก้อนโตขึ้นไหม · หมายเหตุ: นี่คือไบต์หลังคลายบีบอัด ไม่ใช่ไบต์บนสาย (ดู Finding 3)
        window.dmjMark('payload:ครบ' + (_gotBytes ? ' (' + Math.round(_gotBytes / 1024) + 'KB)' : ''));
        if (d && d.lastModified) window._dataLoadedAt = d.lastModified;
        if (typeof resetCatColorMap === 'function') resetCatColorMap();
        // Phase 7.3: server ติดธง `stale` มาเมื่อมีคนอื่นกำลังสร้างข้อมูลชุดใหม่อยู่
        // แล้วเราได้ "ชุดสำรอง" (ก่อนการบันทึกล่าสุด) กลับมาทันทีแทนการต่อคิวรอ ~10 วิ
        // → ต้องบอกผู้ใช้ให้รู้ตัว **ห้ามโชว์เงียบ ๆ** เพราะตัวเลขสต็อกใช้ตัดสินใจสั่งของจริง
        // เก็บเป็น state แยก ไม่ยัดเข้า `data` เพราะ `data` ถูก save ลง localStorage —
        // ธงจะติดค้างข้ามการเปิดแอปครั้งถัดไปทั้งที่ตอนนั้นข้อมูลสดแล้ว
        setStaleAt((d && d.stale) ? (d.staleAt || Date.now()) : 0);
        let enriched;
        try { enriched = enrichData(d); } catch (e) {
          console.warn("enrichData failed during fetchFromSheet:", e);
          enriched = d;
        }
        setRetryMsg("");
        // ordersFetchedAt = "ข้อมูลออเดอร์ชุดนี้ดึงมาเมื่อไหร่" — ฝั่ง view ใช้ตัดสินว่า
        // optimistic entry ที่เพิ่งสั่งไป ถูกชุดจากชีตครอบคลุมแล้วหรือยัง (กันนับซ้ำ 2 เด้ง)
        enriched = Object.assign({}, enriched, { ordersFetchedAt: Date.now() });
        setData(enriched);
        saveToStorage(enriched, "sheet");
        setSource("sheet");
        // Phase 7.4: จำไว้ว่า "ก้อนที่ถืออยู่ตอนนี้คือเวอร์ชันไหน ของ role ไหน ตอนกี่โมง"
        // ครั้งหน้าที่ต้อง refresh จะถาม `action=ver` เทียบกับค่านี้ก่อน แล้วข้ามการโหลดได้ถ้ายังตรง
        writeVerStamp(d && d.lastModified, role);
        const now = new Date().toISOString();
        localStorage.setItem("dmj_last_sync", now);
        setLastSync(now);
        setError(null);
        // จบเส้นทางเปิดแอปแล้ว — บันทึกไว้ให้เปิดดูย้อนหลังได้ (พนักงานเปิด DevTools ไม่ได้)
        window.dmjMark('พร้อมใช้งาน');
        window.dmjSaveTrace();
      })
      .catch(e => {
        clearTimeout(timeout);
        // "ตอบมาเป็น HTML" (dmjKind==='badjson') ต่างจาก "เน็ตพัง" อย่างสำคัญ:
        // มันแปลว่า **คำขอเดินทางไปถึง Google แล้ว แต่ก้อนข้อมูลถูกตัดกลางคัน** — สาเหตุที่วัดได้
        // คือท่อเต็ม (ทุกคนเปิดแอปพร้อมกันตอนเช้า) จนดาวน์โหลดนานเกินอายุลิงก์ googleusercontent
        // → **ยิงซ้ำทันทีคือการเติมเชื้อ**: อีก 4 เมกะเข้าไปในท่อที่เต็มอยู่แล้ว มีแต่จะโดนตัดซ้ำ
        // จึงถอยนานกว่า + สุ่มเวลา (ทุกเครื่องพังพร้อมกัน ถ้าถอยเท่ากันก็กลับมาชนกันอีก
        // — หลักเดียวกับการดึงซ้ำตอนได้ของสำรองใน Phase 7.3) + ลดจำนวนครั้งลง
        // เพราะแต่ละครั้งมีราคา 4 เมกะจริง ๆ ไม่ใช่การ ping เบา ๆ
        const isBadJson = e && e.dmjKind === "badjson";
        // รอบที่ "พัง" คือรอบที่ต้องรู้เวลามากที่สุด — ถ้าบันทึกเฉพาะตอนสำเร็จ
        // เคสที่เจ็บที่สุด (รอ 30 วิแล้วค่อยล้ม) จะไม่เหลือร่องรอยให้ดูเลยสักครั้ง
        window.dmjMark('payload:ล้มเหลว' + (isBadJson ? '(ตอบไม่ครบ)' : ''));
        window.dmjSaveTrace();
        const nextLeft  = isBadJson ? Math.max(0, retryLeft - 2) : retryLeft - 1;
        if (retryLeft > 0) {
          const base  = isBadJson ? 3000 : (retryLeft === 3 ? 800 : retryLeft === 2 ? 2000 : 4000);
          const delay = base + Math.random() * base;   // สุ่มกระจาย 1–2 เท่าของฐาน
          const attempt = 4 - retryLeft; // 1, 2, 3
          setRetryMsg(isBadJson
            ? `ระบบหลังบ้านตอบไม่ครบ (อาจมีคนใช้พร้อมกันเยอะ) กำลังลองใหม่ครั้งที่ ${attempt}…`
            : `เชื่อมต่อช้า กำลังลองใหม่ครั้งที่ ${attempt}…`);
          setTimeout(() => fetchFromSheet(nextLeft, force), delay); // คง force ไว้ตอน retry
          return;
        }
        setRetryMsg("");
        // ข้อความสุดท้ายที่ผู้ใช้เห็นต้องเป็นภาษาไทยที่พนักงานหน้าร้านอ่านรู้เรื่อง
        // ไม่ใช่ `SyntaxError: Unexpected token '<'` (ต้นฉบับเก็บไว้ใน dmj_last_backend_error แล้ว)
        if (e && e.name === "AbortError") setError("เซิร์ฟเวอร์ตอบช้า — กรุณาลองใหม่อีกครั้ง [timeout]");
        else setError(typeof dmjErrText === 'function' ? dmjErrText(e) : `${e.name}: ${e.message}`);
        setSyncing(false);
      })
      .finally(() => { fetchingRef.current = false; clearTimeout(timeout); if (!controller.signal.aborted) setSyncing(false); });
    // ตาข่ายกันแอปค้าง: ถ้ามีอะไรหลุดออกมาถึงตรงนี้ `fetchingRef` จะค้าง true ตลอดกาล
    // แล้วแอปจะ "ดึงข้อมูลไม่ได้อีกเลยทั้ง session" โดยไม่มี error ให้เห็น (guard ที่ต้นฟังก์ชัน
    // return เงียบ ๆ) — ปลดล็อกไว้เสมอ ราคาถูกกว่าการต้องปิดแอปเปิดใหม่มาก
    }).catch(() => { fetchingRef.current = false; setSyncing(false); });
    // role อยู่ใน deps เพราะถูกใช้ประกอบ URL แล้ว — ถ้าไม่ใส่ จะค้าง role ตอน mount (null)
    // แล้วยิงขอ payload ผิด variant ตลอดทั้ง session หลังผู้ใช้ล็อกอิน
  }, [sheetUrl, role]);

  // ── Phase 7.4: ดึงเฉพาะ "เลขสต็อกอ้างอิง" สำหรับแท็บนับสต็อก/เช็คหน้าร้าน ──
  // เดิมสองแท็บนี้ poll payload **ทั้งก้อน (~4.2MB) ทุก 30 วิ** ทั้งที่ต้องการแค่ตัวเลขสต็อก
  // → เครื่องที่จอดหน้าร้านทั้งวันกินราว 500MB/ชม. และ 15 เครื่องพร้อมกัน = 63MB ผ่านท่อเดียว
  // ซึ่งวัดได้ว่าทำให้ลิงก์ดาวน์โหลดของ Google หมดอายุกลางคัน (HTTP 404 — ดู PHASE0-RESULTS.md)
  // ก้อนใหม่เล็กกว่าราว 50 เท่า และอ่านแค่ 2 ชีตแทน 9
  //
  // ⚠️ **ต้องคำนวณ qty/isOOS ใหม่ทุกครั้งที่แตะ qtyStore/qtyWH** — เขียนทับแค่สองตัวแล้วปล่อย
  // qty เดิมไว้คือบั๊กเดียวกับเคส WL (ก.ค. 2026) ที่สินค้ามีของจริงแต่โชว์ "หมด" ทั้งระบบ
  // โดยไม่มี error ให้เห็น · สูตรตรงนี้ต้องตรงกับ `applyQtyLocToProduct_` ฝั่ง GAS เสมอ
  const fetchStockLite = usC(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const sep = sheetUrl.includes('?') ? '&' : '?';
    const url = `${sheetUrl}${sep}action=stocklite&_t=${Date.now()}`;
    return fetch(url, { signal: controller.signal, cache: 'no-store' })
      .then(r => (typeof dmjJson === 'function' ? dmjJson(r) : r.json()))
      .then(d => {
        // GAS ยังเป็นโค้ดเก่า (ไม่รู้จัก action นี้) → คืน payload เต็ม/HTML → ไม่มี items
        // ไม่ทำอะไรเลยดีกว่าเดา — poll รอบหน้าค่อยว่ากัน (แท็บพวกนี้ยังใช้งานได้ปกติ)
        if (!d || !Array.isArray(d.items)) return;
        const m = {};
        d.items.forEach(row => { if (row && row[0]) m[row[0]] = row; });
        setData(prev => {
          if (!prev || !Array.isArray(prev.products)) return prev;
          // อัตราขายส่งมาจาก payload เดิม (ไม่ได้ส่งมากับก้อนเบา) — ค่า default ตรงกับฝั่ง GAS
          const whR = (prev.totals && prev.totals.wholesaleRatio) || 0.8;
          let changed = false;
          const products = prev.products.map(p => {
            const row = m[String(p.sku || '').toUpperCase()];
            if (!row) return p;
            const qtyStore = Number(row[1]) || 0;
            const qtyWH    = Number(row[2]) || 0;
            const fsQty    = row[3] == null ? null : Number(row[3]);
            const fsAt     = row[4] || null;
            if (p.qtyStore === qtyStore && p.qtyWH === qtyWH
                && p.frontStoreCheckedQty === fsQty && p.frontStoreCheckedAt === fsAt) return p;
            changed = true;
            const total = qtyStore + qtyWH;
            const price = p.price || 0;
            return Object.assign({}, p, {
              qtyStore, qtyWH, warehouseQty: qtyWH,
              qty:        total,
              qtyStatus:  total < 0 ? 'negative' : 'ok',
              isOversold: total < 0,
              isOOS:      total <= 0,
              stockValue:      total    * price * whR,
              stockValueWH:    qtyWH    * price * whR,
              stockValueStore: qtyStore * price * whR,
              frontStoreCheckedQty: fsQty,
              frontStoreCheckedAt:  fsAt,
            });
          });
          if (!changed) return prev;   // ไม่มีอะไรเปลี่ยน → ไม่ re-render ทั้งหน้า
          return Object.assign({}, prev, { products });
        });
        // **ไม่ saveToStorage โดยตั้งใจ** — เขียน JSON หลายเมกะไบต์ลง localStorage ทุก 30 วิ
        // ทำให้เครื่องมือถือกระตุกทั้งที่ไม่จำเป็น · ถ้าปิดแล้วเปิดใหม่ ตัวเลขจะถูกดึงสดอยู่แล้ว
        // ⚠️ ยอดรวมใน `data.totals` (totalStockValue ฯลฯ) **ไม่ถูกคำนวณใหม่** ที่นี่ —
        // จะไม่ตรงกับผลรวมของ products ชั่วคราวจนกว่าจะโหลดเต็มรอบถัดไป · ยอมรับได้เพราะสองแท็บ
        // ที่ใช้ poll ตัวนี้ไม่ได้แสดงยอดรวมพวกนั้น · **ถ้าจะเอา poll นี้ไปใช้กับแท็บที่โชว์ยอดรวม
        // ต้องคำนวณ totals ใหม่ด้วย** ไม่งั้นตัวเลขบนจอจะขัดกันเองโดยไม่มีอะไรบอก
        //
        // เดินเวลา "ข้อมูลที่เราถือ" ให้สด — poll ตัวเดิมก็ทำแบบนี้ทุก 30 วิ ถ้าไม่ทำ คนที่นับสต็อก
        // อยู่นาน ๆ จะโดน conflict ปฏิเสธการบันทึกทุกครั้งที่มีใครบันทึกอะไรที่อื่น (งานหายทั้งรอบนับ)
        // ⚠️ ต่างจาก poll เดิมตรงที่ก้อนนี้รีเฟรช **เฉพาะจำนวนสต็อก** — ล็อค/ออเดอร์/โอน ยังเป็น
        // ชุดจากการโหลดเต็มครั้งล่าสุด · ยอมรับได้เพราะสองแท็บนี้เขียนงานที่อิงจำนวนสต็อกเป็นหลัก
        // แต่ถ้าวันหนึ่งมีแท็บอื่นมาใช้ poll ตัวนี้ ต้องทบทวนข้อนี้ก่อนเสมอ
        if (d.ts) window._dataLoadedAt = d.ts;
      })
      .catch(() => {})   // เงียบ — เป็น background polling ไม่ต้องรบกวนผู้ใช้
      .finally(() => clearTimeout(timeout));
  }, [sheetUrl]);

  // Lightweight fetch: ดึงเฉพาะรายการสั่งของ (เบา/เร็ว) — ใช้ polling หน้า orders จะได้ไม่โหลดทั้งก้อน
  // คืน promise ด้วย — ตัวเรียก (เช่นหลังสั่งของสำเร็จ) จะได้รู้ว่าดึงเสร็จเมื่อไหร่
  const fetchOrdersOnly = usC(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const sep = sheetUrl.includes('?') ? '&' : '?';
    const url = `${sheetUrl}${sep}action=orders&_t=${Date.now()}`;
    return fetch(url, { signal: controller.signal, cache: 'no-store' })
      .then(r => (typeof dmjJson === 'function' ? dmjJson(r) : r.json()))
      .then(d => {
        if (!d || d.error || !Array.isArray(d.orders)) return; // d.error = sheet_not_found → skip
        // ถ้า GAS คืน date เป็น Date object string ("Thu Jun 06 2026...") แทน "dd/mm/yyyy"
        // (เกิดเมื่อ GAS ยังไม่ได้ redeploy) → normalize ให้เป็น dd/mm/yyyy ก่อนอัปเดต state
        d.orders = d.orders.map(function(o) {
          if (o.date && typeof o.date === 'string') {
            var ds = o.date.trim();
            // Date object string มักขึ้นต้นด้วย weekday หรือมี GMT/UTC/T ตามด้วย timezone
            if (/GMT|^\w{3}\s\w{3}\s\d|T\d{2}:\d{2}:\d{2}/.test(ds)) {
              var p = new Date(ds);
              if (!isNaN(p.getTime())) {
                var dd = String(p.getDate()).padStart(2,'0');
                var mm = String(p.getMonth()+1).padStart(2,'0');
                o = Object.assign({}, o, { date: dd + '/' + mm + '/' + p.getFullYear() });
              }
            }
          }
          return o;
        });
        setData(prev => {
          if (!prev) return prev;
          // ไม่มี guard 0-orders แล้ว: ถ้า orders ถูกลบจริงๆ ควร clear ได้
          // GAS มี retry อยู่แล้ว ถ้า response ว่างเพราะ error จะถูก retry รอบถัดไป
          return { ...prev, orders: d.orders, ordersFetchedAt: Date.now() };
        });
        const now = new Date().toISOString();
        localStorage.setItem("dmj_last_sync", now);
        setLastSync(now);
      })
      .catch(() => {}) // เงียบ — เป็น background polling ไม่ต้องรบกวนผู้ใช้
      .finally(() => clearTimeout(timeout));
  }, [sheetUrl]);

  usE(() => {
    if (!role) return;
    const cached = loadFromStorage();
    if (cached && Array.isArray(cached.products)) {
      // รีเซ็ต catColorMap ก่อน enrich จาก cache เพื่อกัน assign สีผิด
      if (typeof resetCatColorMap === 'function') resetCatColorMap();
      try { setData(enrichData(cached)); } catch (e) { // แสดง cache ทันที
        console.warn("enrichData failed on cached data:", e);
        setData(cached);
      }
    }
    fetchFromSheet(); // refresh ใน background เสมอ
  }, [role, fetchFromSheet]);

  // Phase 7.3: ได้ของสำรองมา → คนที่กำลัง build อยู่จะเสร็จในไม่กี่วินาที ดึงซ้ำอีกรอบให้เอง
  // ไม่ต้องรอผู้ใช้กด Sync หรือรอ poll 30 วิ (ซึ่งมีเฉพาะบางแท็บ) · ยิงครั้งเดียวต่อ 1 ครั้งที่ได้ของสำรอง
  // **สุ่มหน่วง 5-9 วิ** เพราะทุกเครื่องได้ของสำรองพร้อมกัน — ถ้าตั้งเวลาตายตัวจะกลับมายิงพร้อมกันอีก
  usE(() => {
    if (!staleAt) return;
    const id = setTimeout(() => { if (navigator.onLine) fetchFromSheet(); }, 5000 + Math.random() * 4000);
    return () => clearTimeout(id);
  }, [staleAt, fetchFromSheet]);

  // expose refetch ให้ child component เรียกได้เมื่อเจอ conflict (จะอัปเดต window._dataLoadedAt ให้สด)
  usE(() => { window._dmjRefetch = fetchFromSheet; return () => { delete window._dmjRefetch; }; }, [fetchFromSheet]);
  // ตัวเบา: ดึงเฉพาะรายการสั่งของ (action=orders อ่านชีตตรง ไม่ผ่าน cache) — ใช้หลังสั่งของสำเร็จ
  // เพื่อให้ป้าย "สั่งแล้ว" มาจากข้อมูลจริง ไม่ใช่ค้างอยู่แค่ state ในหน้าเดียว
  usE(() => { window._dmjRefetchOrders = fetchOrdersOnly; return () => { delete window._dmjRefetchOrders; }; }, [fetchOrdersOnly]);

  // ── Offline / online detection ──
  usE(() => {
    const goOnline  = () => { setIsOnline(true); fetchFromSheet(); }; // refetch ทันทีเมื่อกลับมา online
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [fetchFromSheet]);

  // ── PWA install prompt ──
  usE(() => {
    var h = function(e) { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return function() { window.removeEventListener("beforeinstallprompt", h); };
  }, []);

  // ── Auto-sync when on orders tab ──
  // Poll เฉพาะรายการสั่งของ (เบา) ทุก 15 วิ — ไม่ดึง payload ทั้งก้อนซ้ำๆ จะได้ไม่ทำให้ GAS ช้า/timeout
  usE(() => {
    if (!role) return;
    const ORDER_TABS = ["orders", "ordersummary"];
    if (!ORDER_TABS.includes(tab)) return;
    if (navigator.onLine) fetchOrdersOnly();
    const id = setInterval(() => { if (navigator.onLine) fetchOrdersOnly(); }, 15000);
    return () => clearInterval(id);
  }, [tab, role]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-sync เมื่ออยู่หน้านับสต็อก/เช็คหน้าร้าน — ให้หลายเครื่องเห็นข้อมูลของกันและกัน ──
  // ดึงเฉพาะเลขสต็อกอ้างอิงทุก 30 วิ (Phase 7.4 — เดิมดึง payload ทั้งก้อน ~4.2MB ทุกรอบ)
  // จำนวนที่ผู้ใช้พิมพ์เก็บใน local state (checkedQtys) แยกต่างหาก จึงไม่ถูกทับ
  // ส่วน window._dataLoadedAt จะอัปเดตให้สด กัน false conflict ตอนบันทึกจากแท็บนี้
  usE(() => {
    if (!role) return;
    const LIVE_TABS = ["stockcount", "frontstore"];
    if (!LIVE_TABS.includes(tab)) return;
    const id = setInterval(() => { if (navigator.onLine) fetchStockLite(); }, 30000);
    return () => clearInterval(id);
  }, [tab, role, fetchStockLite]);

  const handleDataLoaded = usC((newData) => {
    if (typeof resetCatColorMap === 'function') resetCatColorMap();
    let enriched;
    try { enriched = enrichData(newData); } catch (e) {
      console.warn("enrichData failed on uploaded data:", e);
      enriched = newData;
    }
    setData(enriched);
    saveToStorage(enriched, "upload");
    // ข้อมูลในมือไม่ได้มาจากชีตแล้ว — ใบรับรอง ver ใช้ไม่ได้ ต้องทิ้ง (ดูคำอธิบายที่ clearVerStamp)
    clearVerStamp();
    setSource("upload");
    const now = new Date().toISOString();
    localStorage.setItem("dmj_last_sync", now);
    setLastSync(now);
    setTab("overview");
  }, []);

  const handleOrderPrint = usC((items) => {
    setLabelInitItems(items);
    setTab("labels");
  }, []);

  const pendingChecks = (data && data.stockCheckRequests) ? data.stockCheckRequests : [];

  // Tab navigation with Android back-button support
  const handleSetTab = usC((newId) => {
    setTab(prev => {
      if (newId === prev) return prev;
      if (window.__dmjBackStack) {
        const from = prev;
        tabHistoryRef.current.push(newId);
        window.__dmjBackStack.push(function() {
          tabHistoryRef.current.pop();
          setTab(from);
        });
        history.pushState({ _dmj: 1 }, '');
      }
      return newId;
    });
  }, []);

  const handleClearLocal = usC(() => {
    setConfirmAction({ type: "clearLocal" });
  }, []);

  // ล้างคู่รหัสรับช่วงล็อกอิน แล้วให้ effect สุ่มคู่ใหม่ให้ (ใช้ตอนล็อกอินจบแล้ว/ยกเลิก/ออกจากระบบ)
  const resetHandoff = usC(() => {
    clearHandoff();
    setHandoffState(null);
    setHandoffWaiting(false);
  }, []);

  // ตั้ง state+session จาก staff object ที่ได้จาก authLine/me — ใช้ร่วมกันทั้ง 2 flow
  const applyStaffSession = usC((s) => {
    resetHandoff(); // ล็อกอินจบแล้ว ไม่ต้องรอผลจากเครื่อง/เบราว์เซอร์อื่นอีก
    setStaff(s);
    if (typeof window !== 'undefined') {
      window._currentUser = (s.name || "ไม่ระบุ") + " (" + (ROLE_TH_PLAIN[s.role] || s.role || "รอตำแหน่ง") + ")";
      // ชื่อล้วน (ไม่มี "(ตำแหน่ง)" ต่อท้าย) + staffId — ใช้ตอนต้องโชว์/ผูกชื่อคนเข้าระบบตรงๆ
      // เช่น ช่อง "ผู้ทำใบเสนอราคา" (views-quote.jsx) และผู้รับผิดชอบงาน MTO (views-analytics.jsx)
      // ไม่ให้พิมพ์เอง — กันพิมพ์ชื่อคนอื่นผิดคน (เจ้าของขอ 2026-07-30)
      window._currentUserName = s.name || "ไม่ระบุ";
      window._currentStaffId = s.staffId || null;
    }
    if (s.status === "active" && s.role) {
      ssSet("dmj_role", s.role);
      setRole(s.role);
      setAuthPhase("ready");
      return;
    }
    // ยังไม่อนุมัติ/ถูกระงับ → ต้องล้าง role ที่ค้างอยู่ด้วย ไม่งั้นพอ reload ค่า optimistic
    // จะหยิบ role เก่า (เช่นเคยเข้าด้วยรหัสสำรอง) มาโชว์ UI ผิดสิทธิ์ชั่วครู่ก่อน me จะตอบกลับ
    ssDel("dmj_role");
    setRole(null);
    setAuthPhase((s.status === "pending" || (s.status === "active" && !s.role)) ? "pending" : "disabled");
  }, [resetHandoff]);

  // เช็คสถานะ session ปัจจุบัน (ใช้ทั้งตอนเปิดแอปครั้งแรก และปุ่ม "เช็คอีกครั้ง" ในหน้ารออนุมัติ)
  const checkMe = usC(async () => {
    const tok = lsGet(SESSION_TOKEN_KEY);
    if (!tok) { setAuthPhase("needLogin"); return; }
    setAuthRefreshing(true);
    try {
      const d = await postAuthAction({ action: "me", sessionToken: tok });
      if (d && d.ok) applyStaffSession(d.staff);
      // ลบ token ทิ้งเฉพาะตอน server ยืนยันว่า session ตายจริง (invalid:true)
      // error อื่นคือปัญหาชั่วคราว (doPost catch ตอบ {success:false} ซึ่งก็ "ไม่มี ok")
      // ถ้าลบตามนั้นด้วย = เตะพนักงานออกทั้งที่ session ยังดี แล้วต้องล็อกอินใหม่ฟรี ๆ
      else if (d && d.invalid) { lsDel(SESSION_TOKEN_KEY); setAuthPhase("needLogin"); }
      else setAuthPhase(role ? "ready" : "needLogin");
    } catch (e) {
      // ต่อเน็ตไม่ได้ — ถ้ามี role ค้างจาก session ก่อนหน้าอยู่แล้ว ให้ทำงานต่อได้ (offline-friendly)
      setAuthPhase(role ? "ready" : "needLogin");
    } finally {
      setAuthRefreshing(false);
    }
  }, [applyStaffSession, role]);

  // noApp = ล็อกอินในเบราว์เซอร์ล้วน ไม่สลับไปแอป LINE (disable_auto_login)
  // ใช้เฉพาะตอนผู้ใช้กดปุ่ม "ไม่เปิดแอป LINE" เอง — ไม่บังคับอัตโนมัติ เพราะการล็อกอิน
  // ผ่านแอป LINE (แตะเดียวจบ) คือทางที่พนักงานใช้จริง ห้ามถูกสลับทิ้งเงียบ ๆ
  const startLineLogin = usC(async (noApp) => {
    setLineError(null);
    const useNoApp = (noApp === true);
    try {
      const base = (typeof GOOGLE_SHEET_URL !== 'undefined') ? GOOGLE_SHEET_URL : null;
      if (!base) { setLineError("ยังไม่ได้เชื่อมต่อ Sheet"); return; }
      const url = new URL(base);
      url.searchParams.set("action", "lineLoginMeta");
      const res = await fetch(url.toString());
      const d = await res.json();
      if (!d || !d.channelId) { setLineError("ยังไม่ได้ตั้งค่า LINE Login — ติดต่อเจ้าของร้าน"); return; }
      // ใช้ state จากคู่รหัสรับช่วง (ถ้าเตรียมทัน) เพื่อให้กู้ล็อกอินข้ามเบราว์เซอร์ได้เหมือนปุ่มหลัก
      const state = handoffState || (Math.random().toString(36).slice(2) + Date.now().toString(36));
      const redirectUri = lineRedirectUri();
      markHandoffPending(state); setHandoffWaiting(!!readPendingHandoff());
      // เก็บค่าที่ "ใช้จริง" ไว้ แล้วตอนแลก token ให้อ่านค่านี้แทนการเรียก lineRedirectUri() ซ้ำ —
      // กัน mismatch กรณี deploy คาบเกี่ยว (หน้าที่กด login โหลดจาก build เก่า แต่หน้าที่รับ
      // code กลับมาโหลด build ใหม่ที่คำนวณค่าไม่เหมือนเดิม) LINE เช็คว่า 2 ค่านี้ต้องตรงกันเป๊ะ
      saveLineHandshake(state, redirectUri);
      let authUrl = "https://access.line.me/oauth2/v2.1/authorize"
        + "?response_type=code"
        + "&client_id=" + encodeURIComponent(d.channelId)
        + "&redirect_uri=" + encodeURIComponent(redirectUri)
        + "&state=" + encodeURIComponent(state)
        + "&scope=" + encodeURIComponent("profile openid");
      // อยู่ในเบราว์เซอร์ตลอด ไม่เด้งเข้าแอป LINE — ตัดต้นเหตุที่ทำให้มือถือเข้าไม่ได้ทั้ง 2 ค่าย
      // (iOS: กลับมาคนละแท็บ → state หาย · Android: แอป LINE เด้ง "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ")
      if (useNoApp) authUrl += "&disable_auto_login=true&disable_ios_auto_login=true";
      window.location.href = authUrl;
    } catch (e) {
      setLineError("เชื่อมต่อ LINE ไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }, [handoffState]);

  const logoutClearSession = usC(() => {
    const tok = lsGet(SESSION_TOKEN_KEY);
    if (tok) { postAuthAction({ action: "logout", sessionToken: tok }).catch(() => {}); }
    lsDel(SESSION_TOKEN_KEY);
    clearLineHandshake();
    resetHandoff();
    ssDel("dmj_role");
    if (typeof window !== 'undefined') { window._currentUser = null; window._currentUserName = null; window._currentStaffId = null; }
    setStaff(null);
    setRole(null);
    setAuthPhase("needLogin");
  }, [resetHandoff]);

  // ── เตรียมคู่รหัสรับช่วงล็อกอินไว้ล่วงหน้า ──
  // ต้องพร้อมก่อนผู้ใช้แตะปุ่ม เพราะ state ที่ส่งให้ LINE ต้องเป็นแฮชของรหัสลับตัวนี้
  // (การคำนวณ SHA-256 เป็น async — ทำตอนแตะปุ่มไม่ได้ จะทำให้ user gesture ขาด เปิดแอป LINE ไม่ได้)
  usE(() => {
    if (handoffState) return; // มีคู่ที่ยังรอผลอยู่/สุ่มไว้แล้ว — ห้ามทับ ไม่งั้นแลก token คืนไม่ได้
    let cancelled = false;
    (async () => {
      const pair = await makeHandoffPair();
      if (cancelled || !pair) return;
      saveHandoffPair(pair);
      setHandoffState(pair.state);
    })();
    return () => { cancelled = true; };
  }, [handoffState]);

  // ── ไปรับผลล็อกอินที่ฝากไว้ (กรณีล็อกอินไปจบในเบราว์เซอร์อื่น) ──
  // คืน true เมื่อได้ session แล้ว · เงียบเสมอเมื่อยังไม่มีผล (ยังล็อกอินไม่เสร็จ = ไม่ใช่ error)
  const claimHandoff = usC(async () => {
    const p = readPendingHandoff();
    if (!p) return false;
    try {
      const d = await postAuthAction({ action: "claimLoginHandoff", handoffSecret: p.secret });
      if (!d || !d.ok || !d.sessionToken) return false;
      setLineError(null);
      if (!lsSet(SESSION_TOKEN_KEY, d.sessionToken)) {
        setLineError("เข้าสู่ระบบได้ แต่เครื่องนี้บันทึกข้อมูลไม่ได้ (โหมดไม่ระบุตัวตน?) — เปิดใหม่ต้องล็อกอินอีกครั้ง");
      }
      applyStaffSession(d.staff);   // ล้าง handoff ให้เองแล้ว
      return true;
    } catch (e) { return false; }
  }, [applyStaffSession]);

  // ── ตามผลล็อกอินให้อัตโนมัติระหว่างที่ยังค้างอยู่หน้าล็อกอิน ──
  // iOS แช่แข็ง timer ตอนแอปอยู่เบื้องหลัง → ต้องเช็คตอน "กลับมาที่แอป" ด้วย ไม่ใช่พึ่ง interval อย่างเดียว
  usE(() => {
    if (authPhase !== "needLogin" || !handoffWaiting) return;
    let stop = false;
    // ⚠️ กันยิงซ้อน: claimLoginHandoff แต่ละครั้งเป็น GAS call (1-4 วิบน cold start) แต่ interval
    // 4 วิ + onWake (visibilitychange/focus) ยิงตามเวลาไม่รอผลตัวก่อน → มี claim ค้างพร้อมกัน
    // หลายตัว · GAS deploy แบบ executeAs USER_DEPLOYING จัดคิว execution ของ user เดียวกัน
    // → 14 claim ต่อคิวกัน + เบียด me/payload ให้ช้าลงไปอีก (เห็นจริงใน BootTrace: claim รัว ~15 ครั้ง
    // ระหว่างล็อกอิน) · มี claim ค้างอยู่ = ข้ามรอบนี้ไป รอผลตัวเดิมก่อน (ไม่เสียการตอบสนอง —
    // claim ที่ค้างอาจสำเร็จเองอยู่แล้ว)
    let inFlight = false;
    const tick = async () => {
      if (stop || inFlight) return;
      if (!readPendingHandoff()) { setHandoffWaiting(false); return; } // หมดอายุแล้ว
      inFlight = true;
      try { await claimHandoff(); } finally { inFlight = false; }
    };
    const id = setInterval(tick, 4000);
    const onWake = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    tick();
    return () => {
      stop = true; clearInterval(id);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [authPhase, handoffWaiting, claimHandoff]);

  // ── ดึง channelId ของ LINE Login มาเตรียมไว้ตั้งแต่เปิดแอป ──
  // ต้องมีค่าพร้อม "ก่อน" ผู้ใช้แตะปุ่ม เพื่อให้ปุ่มเป็นลิงก์ที่ navigate ได้ทันทีในจังหวะแตะ
  // (ถ้ารอ fetch หลังแตะ = user gesture ขาด → เบราว์เซอร์ไม่ยอมเปิดแอป LINE)
  usE(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = (typeof GOOGLE_SHEET_URL !== 'undefined') ? GOOGLE_SHEET_URL : null;
        if (!base) return;
        const url = new URL(base);
        url.searchParams.set("action", "lineLoginMeta");
        const d = await (await fetch(url.toString())).json();
        if (cancelled || !d || !d.channelId) return;
        lsSet(LINE_CHANNEL_KEY, d.channelId);
        setLineChannelId(d.channelId);
      } catch (e) { /* เงียบไว้ — ปุ่มจะ fallback ไปทางเดิม */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Bootstrap: เช็ค code/state จาก LINE redirect กลับมา, หรือ session token ที่เก็บไว้ ──
  usE(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const stateParam = params.get("state");

      if (code) {
        window.history.replaceState({}, "", window.location.pathname); // ล้าง query กันรีเฟรชแล้วยิงซ้ำ
        const hs = readLineHandshake();
        const savedState = hs.state;
        const savedRedirectUri = hs.redirectUri;
        clearLineHandshake();
        // เจอ state ที่เก็บไว้ "แต่ไม่ตรง" = ของปลอม/คนละรอบ → ปฏิเสธ
        // แต่ถ้า "ไม่มีเลย" (iOS: กลับมาคนละแท็บ/คนละ context, storage โดนบล็อก) ห้ามปฏิเสธ
        // ไม่งั้นพนักงาน iOS ล็อกอินไม่ได้ตลอดกาล — code จาก LINE ใช้ได้ครั้งเดียวและผูกกับ
        // redirect_uri + channel secret ฝั่ง server อยู่แล้ว จึงไปต่อได้โดยความเสี่ยงต่ำ
        if (savedState && stateParam !== savedState) {
          if (!cancelled) { setLineError("เซสชันล็อกอินไม่ตรงกัน กรุณาลองใหม่ (หรือใช้ปุ่ม \"ไม่เปิดแอป LINE\")"); setAuthPhase("needLogin"); }
          return;
        }
        try {
          // ใช้ค่าที่บันทึกไว้ตอนกดล็อกอิน (ไม่คำนวณใหม่) — ต้องเป็นค่าเดียวกับที่ส่งให้ LINE ตอน
          // authorize เป๊ะ ๆ ไม่งั้น LINE ตอบ "redirect_uri does not match" · savedRedirectUri||
          // lineRedirectUri() กันไว้เผื่อ sessionStorage หาย (เช่นเปิดจากแท็บ/เบราว์เซอร์อื่น)
          const redirectUri = savedRedirectUri || lineRedirectUri();
          // handoffId = state ที่ LINE ส่งกลับมา — ฝากผลล็อกอินไว้ที่เซิร์ฟเวอร์ใต้คีย์นี้เสมอ
          // เผื่อว่าที่นี่ "ไม่ใช่" ที่ที่ผู้ใช้เริ่มกดล็อกอิน (iOS เด้งจากแอปหน้าโฮมมาจบใน Safari)
          // ฝั่งที่เริ่มจะยื่นรหัสลับมาแลกคืนเอง — ที่นี่ไม่รู้จักรหัสลับนั้น ฝากได้อย่างเดียว
          const d = await postAuthAction({ action: "authLine", code, redirectUri, handoffId: stateParam || "" });
          if (cancelled) return;
          if (d && d.ok) {
            // localStorage เขียนไม่ได้ (iOS Private Browsing / บล็อกที่เก็บข้อมูล) → session token หาย
            // ทันทีที่รีเฟรช · ยังให้ใช้งานรอบนี้ต่อได้ แต่ต้องบอกผู้ใช้ว่าทำไมต้องล็อกอินใหม่
            if (!lsSet(SESSION_TOKEN_KEY, d.sessionToken)) {
              setLineError("เข้าสู่ระบบได้ แต่เครื่องนี้บันทึกข้อมูลไม่ได้ (โหมดไม่ระบุตัวตน?) — เปิดใหม่ต้องล็อกอินอีกครั้ง");
            }
            // ไม่มี state เก็บไว้ที่นี่เลย = การล็อกอินนี้ "เริ่มจากที่อื่น" (เช่นแอปหน้าโฮมของ iPhone
            // ที่ถูกเด้งออกมาจบใน Safari) → บอกผู้ใช้ให้กลับไปเปิดแอปนั้น ไม่ต้องล็อกอินซ้ำ
            if (!savedState && stateParam) setCrossContextNote(true);
            applyStaffSession(d.staff);
          } else {
            setLineError((d && d.error) || "ล็อกอินด้วย LINE ไม่สำเร็จ");
            setAuthPhase("needLogin");
          }
        } catch (e) {
          if (!cancelled) {
            setLineError("ล็อกอินด้วย LINE ไม่สำเร็จ ลองใหม่อีกครั้ง (" + ((e && e.message) || "network") + ")");
            setAuthPhase("needLogin");
          }
        }
        return;
      }

      const tok = lsGet(SESSION_TOKEN_KEY);
      if (!tok) {
        if (!cancelled) setAuthPhase(role ? "ready" : "needLogin"); // role เก่าจาก sessionStorage (รหัสสำรอง) ยังใช้ได้
        return;
      }
      try {
        const d = await postAuthAction({ action: "me", sessionToken: tok });
        if (cancelled) return;
        if (d && d.ok) applyStaffSession(d.staff);
        // เช่นเดียวกับ checkMe — ลบ token เฉพาะตอน server ยืนยันว่า session ตายจริง
        else if (d && d.invalid) { lsDel(SESSION_TOKEN_KEY); setAuthPhase(role ? "ready" : "needLogin"); }
        else setAuthPhase(role ? "ready" : "needLogin");
      } catch (e) {
        if (!cancelled) setAuthPhase(role ? "ready" : "needLogin"); // ต่อเน็ตไม่ได้ — ทำงานต่อด้วย role เดิมถ้ามี
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doConfirmedAction = usC(() => {
    if (!confirmAction) return;
    if (confirmAction.type === "clearLocal") {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_SRC_KEY);
      fetchFromSheet();
    } else if (confirmAction.type === "logout") {
      logoutClearSession();
    }
    setConfirmAction(null);
  }, [confirmAction, fetchFromSheet, logoutClearSession]);

  // ── Conditional renders AFTER all hooks ──
  if (authPhase === "checking") {
    return (
      <div className="loading-screen">
        <span className="spin" style={{width:28,height:28,borderWidth:3}}/>
      </div>
    );
  }

  // ป้ายบอกว่า "ล็อกอินนี้เริ่มมาจากแอปหน้าโฮม แต่มาจบที่เบราว์เซอร์นี้" — ให้กลับไปเปิดแอปนั้นได้เลย
  const crossNoteEl = crossContextNote
    ? <CrossContextNote onClose={() => setCrossContextNote(false)}/>
    : null;

  if (authPhase === "pending") {
    return <>{crossNoteEl}<PendingScreen staff={staff} onRefresh={checkMe} refreshing={authRefreshing} onSwitchAccount={logoutClearSession}/></>;
  }

  if (authPhase === "disabled") {
    return <DisabledScreen onSwitchAccount={logoutClearSession}/>;
  }

  if (!role) {
    return <LoginScreen
      onLineLogin={startLineLogin}
      lineChannelId={lineChannelId}
      lineError={lineError}
      handoffState={handoffState}
      handoffWaiting={handoffWaiting}
      onClaimNow={claimHandoff}
      onCancelWaiting={resetHandoff}
      onStartWaiting={() => setHandoffWaiting(!!readPendingHandoff())}
      onLegacyLogin={r => { sessionStorage.setItem("dmj_role", r); setRole(r); setAuthPhase("ready"); }}
    />;
  }

  // View ทุกตัวเช็คสิทธิ์ด้วย role === "owner" อยู่หลายสิบจุด (โชว์ยอดเงิน/ต้นทุน/ปุ่มพิเศษ)
  // dev ต้องเห็นทุกอย่างเท่า owner → ส่ง "owner" เข้าไปแทน แทนที่จะไล่แก้ทุกจุด
  // (ตัวแปร role ของจริงยังเป็น "dev" อยู่ ใช้กับ nav/ป้ายชื่อ/audit log ตามปกติ)
  const viewRole = isAdminRole(role) ? "owner" : role;
  const allowedTabIds = ROLE_TABS[role] || ROLE_TABS.employee;
  // เรียงตามลำดับใน ROLE_TABS (ไม่ใช่ลำดับใน TABS) → จัดลำดับความสำคัญต่อ role ได้ (owner เรียงตามที่ใช้บ่อย)
  const visibleTabs = allowedTabIds.map(id => TABS.find(t => t.id === id)).filter(Boolean);
  // "home" ไม่ได้อยู่ใน ROLE_TABS โดยเจตนา (ดูหมายเหตุที่ HOME_TAB) — ปล่อยผ่านที่นี่ที่เดียว
  // ทุก role เข้าหน้าหลักได้เท่ากัน เพราะหน้านี้โชว์แค่เมนูที่ role นั้นมีสิทธิ์อยู่แล้ว
  const activeTab = (tab === HOME_TAB || allowedTabIds.includes(tab)) ? tab : (allowedTabIds[0] || "categories");

  // แบ่งเมนูเป็น primary (บนแถบ) / secondary (ใน "เพิ่มเติม")
  // owner: 5 ตัวแรก + "เพิ่มเติม" สำหรับที่เหลือ (แท็บเยอะ 17 แท็บ)
  // role อื่น: โชว์ทุกแท็บบนแถบ ไม่มี "เพิ่มเติม" (แถบเลื่อนแนวนอนได้)
  let primaryTabs, secondaryTabs;
  if (isAdminRole(role)) {
    // owner/dev: แสดง 5 ตัวแรก + เพิ่มเติม สำหรับที่เหลือ
    primaryTabs   = visibleTabs.slice(0, 5);
    secondaryTabs = visibleTabs.slice(5);
  } else {
    // role อื่น (employee/warehouse/frontstore/saler): โชว์ทุกแท็บ ไม่มี "เพิ่มเติม"
    primaryTabs   = visibleTabs;
    secondaryTabs = [];
  }

  // ── ทางด่วนลงเวลา ────────────────────────────────────────────────────────
  // AttendanceView / AttendanceTodayView **ไม่ได้ใช้ `data` เลยแม้แต่ฟิลด์เดียว**
  // (views-attendance.jsx — รับแค่ role/canEdit แล้วยิง endpoint ของตัวเองผ่าน attPost
  //  ซึ่งแนบ sessionToken เอง ไม่พึ่ง payload หลัก)
  // แต่เดิมทั้งคู่ถูกกั้นหลัง `if (!data)` ข้างล่าง = พนักงานที่มาสแกนเข้า-ออกงาน
  // ต้องรอ payload หลายเมกะที่ตัวเองไม่ได้ใช้ ก่อนจะเห็นปุ่มลงเวลา
  // → ปล่อยให้ 2 แท็บนี้เรนเดอร์ได้ทันทีที่รู้ว่าเป็นใคร ส่วนข้อมูลก้อนใหญ่โหลดอยู่เบื้องหลัง
  //
  // ⚠️ **ห้ามขยายรายชื่อนี้โดยไม่เปิดดู view จริงก่อน** — แท็บอื่นทุกตัวอ่าน `data` จริง
  //    ปล่อยผ่านมาที่นี่ = จอขาว (อ่าน property ของ null) ซึ่งไม่มี error ให้ผู้ใช้เห็นเลย
  // ⚠️ ตั้งใจ**ไม่**ทำเป็นจอแยก/early-return — ถ้าแยกจอ พอข้อมูลมาถึงแล้วสลับกลับเข้า shell
  //    ปกติ ตำแหน่งของ <AttendanceView> ในต้นไม้จะเปลี่ยน → React unmount แล้ว mount ใหม่
  //    = state ข้างในหายกลางคัน (คนที่กำลังถ่ายรูป/รอ GPS อยู่ต้องเริ่มใหม่โดยไม่รู้สาเหตุ)
  //    การใช้ shell เดียวกันทำให้ตำแหน่งคงที่ ข้อมูลมาถึงแล้วหน้าที่เปิดอยู่ไม่สะดุด
  // "home" อยู่ในรายชื่อนี้ด้วยเพราะ HomeMenuView ไม่แตะ `data` เลย (รับแค่รายการเมนู + ตัวเลข
  // สำเร็จรูปที่กัน null แล้ว) — และเป็นทางเข้าหลักของแท็บลงเวลา ถ้าหน้าหลักติดจอโหลดไปด้วย
  // ทางด่วนลงเวลาก็เสียความหมายไปครึ่งหนึ่ง (กดโลโก้แล้วเจอสปินเนอร์ กดต่อไปไหนไม่ได้)
  const NO_DATA_TABS = ["attendance", "atttoday", HOME_TAB];
  const attFastPath = !data && NO_DATA_TABS.includes(activeTab);

  // จอ "ยังไม่มีข้อมูลก้อนใหญ่" — เดิมเป็น early return ทั้งหน้า **แถบเมนูจึงหายไปด้วย**
  // พอมีทางด่วนลงเวลาแล้ว อันนั้นกลายเป็นกับดัก: ลงเวลาเสร็จ กดแท็บอื่นดูสักที
  // แล้วกลับมาแท็บลงเวลาไม่ได้อีกเลยจนกว่าข้อมูลจะมาครบ (ไม่มีปุ่มอะไรให้กดเลย)
  // → ย้ายมาเรนเดอร์ "ข้างใน <main>" แทน แถบเมนูอยู่ครบเสมอ เดินกลับได้ตลอด
  const dataPane = (
    <div className="loading-screen">
      {error ? (
        <>
          <div style={{fontSize:32,marginBottom:8}}>⚠️</div>
          <div style={{fontSize:14,color:"#c62828",marginBottom:12,textAlign:"center",padding:"0 24px"}}>{error}</div>
          {error.includes("timeout") && (
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:16,textAlign:"center",padding:"0 28px",lineHeight:1.6}}>
              ลอง: ปิด VPN · ปิด Content Blocker ใน Safari · ปิด iCloud Private Relay · หรือเปลี่ยนมาใช้ 4G/5G
            </div>
          )}
          <button className="btn" onClick={()=>fetchFromSheet(3,true)} style={{minHeight:44,padding:"0 24px"}}>🔄 ลองใหม่</button>
          {/* ตอนพังคือตอนที่ต้องการเลขที่สุด — ให้ดูได้ตรงนี้เลย ไม่ต้องรอเข้าแอปสำเร็จก่อน
              (ซึ่งเป็นข้อที่ทำให้รอบก่อนไล่สาเหตุไม่ได้: แอปเข้าไม่ได้ = เครื่องมือวัดก็เข้าไม่ถึง) */}
          <details style={{marginTop:18,width:"100%",maxWidth:420,padding:"0 16px"}}>
            <summary style={{fontSize:12,color:"var(--muted)",cursor:"pointer"}}>⏱️ ดูเวลาแต่ละขั้น</summary>
            <div style={{marginTop:10}}><BootTrace/></div>
          </details>
        </>
      ) : (
        <>
          <div className="spin"></div>
          <div style={{fontSize:13,color:"var(--muted)"}}>กำลังโหลดข้อมูล Dashboard…</div>
          {retryMsg && <div style={{fontSize:12,color:"var(--muted)",marginTop:6}}>{retryMsg}</div>}
        </>
      )}
    </div>
  );

  const syncLabel = (() => {
    if (!lastSync) return "ยังไม่ sync";
    const dt = new Date(lastSync);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  })();

  // ── ตัวเลขเตือนบนหมวด owner (จาก payload ที่เชื่อถือได้) ──
  // `data` เป็น null ได้เมื่ออยู่บนทางด่วนลงเวลา (ข้อมูลก้อนใหญ่ยังโหลดไม่เสร็จ) —
  // ตัวเลขบนป้ายเตือนยังไม่รู้ ก็แค่ไม่ต้องโชว์ ห้ามอ่าน property ของ null (จอขาวทั้งแอป)
  const pendingOrders = ((data && data.orders) || []).filter(o => o.status === "รอ").length;    // ออเดอร์ค้าง (status "รอ")
  const pendingRecv   = ((data && data.shipments) || []).filter(s => !s.receivedAt).length;      // ของโอนแล้วรอรับ

  // เลขเตือนระดับ "เมนู" — ใช้ทั้งเมนูย่อยของ owner และการ์ดในหน้าหลักของทุก role
  // (ตัวเดียวกันเสมอ ไม่งั้นเลขบนสองที่ไม่ตรงกันแล้วไม่มีใครรู้ว่าอันไหนถูก)
  const tabBadge = id => id === "orders" ? pendingOrders : id === "transfers" ? pendingRecv : 0;

  // เมนูของ role นี้ จัดกลุ่มแล้ว (ใช้ตัวเดียวกับหน้าหลัก — ดู groupTabsFor)
  const navGroups = groupTabsFor(allowedTabIds);

  // จัดกลุ่ม owner: map tab id → {label, icon} จริง + ดัน tab ที่ไม่เข้ากลุ่มไหนเข้า "อื่นๆ"
  const ownerNav = (() => {
    if (!isAdminRole(role)) return null;
    const groups = navGroups;
    // หมวดที่กำลังแสดง: ที่ "แตะดู" ไว้ ▸ ไม่งั้นหมวดที่มี tab ปัจจุบัน ▸ ไม่งั้นหมวดแรก
    const groupOfTab = groups.find(g => g.items.some(t => t.id === activeTab));
    const displayId  = (ownerGroup && groups.some(g => g.id === ownerGroup)) ? ownerGroup
                     : (groupOfTab ? groupOfTab.id : groups[0].id);
    const badgeFor = id => id === "g_sales" ? pendingOrders : id === "g_stock" ? pendingRecv : 0;
    const subBadgeFor = tabBadge;
    return { groups, displayId, badgeFor, subBadgeFor };
  })();

  return (
    <div style={{maxWidth:"100vw", overflowX:"hidden", position:"relative"}}>
      {crossNoteEl}
      {/* ─── Confirm modals ─── */}
      <ConfirmModal
        open={confirmAction?.type === "clearLocal"}
        type="warn" emoji="🔄"
        title="ล้างไฟล์อัปโหลด?"
        detail={"ลบข้อมูลที่อัปโหลดออกทั้งหมด\nและโหลดข้อมูลจาก Google Sheet ใหม่"}
        confirmLabel="ล้างและ Sync"
        onConfirm={doConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        open={confirmAction?.type === "logout"}
        type="warn" emoji="🚪"
        title="ออกจากระบบ?"
        detail="กลับไปหน้าเลือกสิทธิ์"
        confirmLabel="ออกจากระบบ"
        onConfirm={doConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />

      {/* ─── Top Nav ─── */}
      <nav className="topnav">
        <div className="topnav-inner">
          {/* โลโก้ = ปุ่มกลับ "หน้าหลัก" (เมนูทั้งหมดของตำแหน่งนี้) — ต้องเป็น <button> จริง
              ไม่ใช่ div ที่มี onClick เพื่อให้กดด้วยคีย์บอร์ด/โปรแกรมอ่านหน้าจอได้ตามปกติ
              บรรทัดใต้ชื่อเขียนบอกตรง ๆ ว่า "แตะเพื่อดูเมนูทั้งหมด" — ไม่งั้นไม่มีอะไรบอกว่ากดได้ */}
          <button className={`brand${activeTab === HOME_TAB ? " active" : ""}`}
                  aria-label="หน้าหลัก — เมนูทั้งหมด"
                  aria-current={activeTab === HOME_TAB ? "page" : undefined}
                  onClick={() => { setMoreOpen(false); handleSetTab(HOME_TAB); }}>
            {navLogoOk ? (
              <img src="logo.png" alt="Doomuenjing"
                   style={{height:38, width:"auto", objectFit:"contain"}}
                   onError={() => setNavLogoOk(false)}/>
            ) : (
              <div className="brand-mark">ด</div>
            )}
            <div className="brand-text">
              <div className="brand-name">Doomuenjing</div>
              <div className="brand-sub">🏠 แตะเพื่อดูเมนูทั้งหมด</div>
            </div>
          </button>

          <div className={isAdminRole(role) ? "owner-nav" : "navtabs"} role="tablist">
            {isAdminRole(role) && ownerNav ? (() => {
              const dg = ownerNav.groups.find(g => g.id === ownerNav.displayId) || ownerNav.groups[0];
              return (
                <>
                  {/* ชั้น 1: หมวดหลัก */}
                  <div className="owner-l1" role="tablist" aria-label="หมวดหลัก">
                    {ownerNav.groups.map(g => {
                      const badge = ownerNav.badgeFor(g.id);
                      return (
                        <button key={g.id} role="tab"
                                aria-selected={g.id === dg.id}
                                className={`owner-grp${g.id === dg.id ? " active" : ""}`}
                                onClick={() => {
                                  // หมวดที่มีเมนูเดียว → เข้าเลย · หลายเมนู → แค่เปิดดูเมนูย่อย
                                  if (g.items.length === 1) handleSetTab(g.items[0].id);
                                  else setOwnerGroup(g.id);
                                }}>
                          <span className="gi">{g.gi}</span>
                          <span>{g.name}</span>
                          {badge > 0 && <span className="gc">{badge}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {/* ชั้น 2: เมนูย่อยของหมวดที่เลือก (ซ่อนเมื่อหมวดมีเมนูเดียว) */}
                  {dg.items.length > 1 && (
                    <div className="owner-l2" role="tablist" aria-label={`เมนูย่อย ${dg.name}`}>
                      {dg.items.map(t => {
                        const sb = ownerNav.subBadgeFor(t.id);
                        return (
                          <button key={t.id} role="tab"
                                  aria-selected={activeTab === t.id}
                                  className={`owner-sub${activeTab === t.id ? " active" : ""}`}
                                  onClick={() => handleSetTab(t.id)}>
                            {t.icon}<span>{tabText(t)}</span>
                            {sb > 0 && <span className="sb">{sb}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })() : (() => {
              // primaryTabs / secondaryTabs คำนวณไว้ด้านบน (รวมโหมดง่าย)
              // แสดงปุ่ม "เพิ่มเติม" เมื่อมี secondaryTabs
              if (secondaryTabs.length > 0) {
                return (
                  <>
                    {primaryTabs.map(t => (
                      <button key={t.id} role="tab"
                              className={`navtab${activeTab===t.id?' active':''}`}
                              onClick={() => { handleSetTab(t.id); setMoreOpen(false); }}>
                        {t.icon}<span>{tabText(t)}</span>
                      </button>
                    ))}
                    <div style={{position:"relative"}}>
                      <button ref={moreButtonRef} role="tab"
                              className={`navtab${secondaryTabs.some(t=>t.id===activeTab)||moreOpen?' active':''}`}
                              onClick={() => {
                                if (!moreOpen && moreButtonRef.current) {
                                  setMoreRect(moreButtonRef.current.getBoundingClientRect());
                                }
                                setMoreOpen(v => !v);
                              }}>
                        <span style={{fontSize:18,lineHeight:1}}>⋯</span>
                        <span>{t("เพิ่มเติม")}</span>
                      </button>
                    </div>
                    {moreOpen && (
                      <>
                        {/* backdrop */}
                        <div onClick={() => setMoreOpen(false)}
                             style={{position:"fixed",inset:0,zIndex:399,background:"rgba(0,0,0,.35)",backdropFilter:"blur(2px)"}}/>
                        {/* bottom sheet */}
                        <div style={{
                          position:"fixed", left:0, right:0, bottom:0, zIndex:400,
                          background:"var(--paper)",
                          borderRadius:"20px 20px 0 0",
                          boxShadow:"0 -8px 40px rgba(0,0,0,.18)",
                          padding:"0 0 env(safe-area-inset-bottom,12px)",
                          maxHeight:"75vh", display:"flex", flexDirection:"column",
                        }}>
                          {/* handle + title */}
                          <div style={{textAlign:"center",padding:"10px 20px 4px",flexShrink:0}}>
                            <div style={{width:40,height:4,borderRadius:2,background:"var(--bdr)",margin:"0 auto 10px"}}/>
                            <div style={{fontSize:13,fontWeight:700,color:"var(--muted)"}}>{t("เมนูเพิ่มเติม")}</div>
                          </div>
                          {/* tab list */}
                          <div style={{overflowY:"auto",padding:"4px 12px 16px"}}>
                            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8}}>
                              {secondaryTabs.map(t => (
                                <button key={t.id}
                                        onClick={() => { handleSetTab(t.id); setMoreOpen(false); }}
                                        style={{
                                          display:"flex", flexDirection:"column", alignItems:"center",
                                          gap:6, padding:"16px 8px",
                                          border: activeTab===t.id ? "2px solid var(--g-500)" : "1.5px solid var(--bdr)",
                                          borderRadius:14, cursor:"pointer",
                                          fontFamily:"inherit", fontSize:13, textAlign:"center",
                                          background: activeTab===t.id ? "var(--g-50)" : "var(--paper)",
                                          color: activeTab===t.id ? "var(--g-700)" : "var(--text)",
                                          fontWeight: activeTab===t.id ? 700 : 500,
                                        }}>
                                  <span style={{fontSize:24,lineHeight:1}}>{t.icon}</span>
                                  <span style={{lineHeight:1.3}}>{tabText(t)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                );
              }
              // ไม่มี secondaryTabs → แสดง primary ทั้งหมดในแถบปกติ
              return primaryTabs.map(t => (
                <button key={t.id} role="tab"
                        className={`navtab${activeTab===t.id?' active':''}`}
                        onClick={() => handleSetTab(t.id)}>
                  {t.icon}<span>{tabText(t)}</span>
                </button>
              ));
            })()}
          </div>

          <div className="nav-right">
            <span className="nav-status" title={source==="upload" ? "ใช้ข้อมูลจากไฟล์ที่อัปโหลด" : "ใช้ข้อมูลจาก Google Sheet"}>
              <span className="nav-dot" style={{background: source==="upload" ? "#a07417" : "var(--g-500)"}}></span>
              {source==="upload" ? "ไฟล์อัปโหลด" : "Sheet"} · {syncLabel}
            </span>
            <button className="btn ghost" title={syncing ? t("กำลัง sync...") : t("Sync ใหม่")}
                    disabled={syncing}
                    onClick={()=>fetchFromSheet(3,true)}>
              {syncing ? <span className="spin" style={{width:14,height:14,borderWidth:2}}/> : I.refresh}
            </button>
            {isAdminRole(role) && (
              <button className="btn ghost"
                      title={zortSyncing ? "กำลังดึงสต็อกจาก ZORT..." : "ดึงสต็อกจาก ZORT เดี๋ยวนี้"}
                      disabled={zortSyncing}
                      onClick={async () => {
                        setZortSyncing(true);
                        const r = await syncZortNow();
                        setZortSyncing(false);
                        if (r && r.success !== false) fetchFromSheet();
                        else showNavToast("error", "Sync ZORT ไม่สำเร็จ: " + ((r && r.error) || "unknown"));
                      }}>
                {zortSyncing ? <span className="spin" style={{width:14,height:14,borderWidth:2}}/> : "⬇️"}
              </button>
            )}
            {/* กระดิ่งแจ้งเตือนในแอป — แจ้งได้ไม่จำกัดเพราะไม่กิน quota LINE
                แท็บปลายทางที่ role นี้ไม่มีสิทธิ์เปิด → ไม่ nav (แต่ยังกดอ่านได้ตามปกติ)
                focus = SKU ที่ต้องพาไปดูต่อ · view = ตัวกรองที่ต้องตั้งให้ตอนเปิดแท็บ
                (เช่นของโอนมาหน้าร้าน → "รายการสั่งของ" ตัวกรอง "ส่งแล้ว" ที่กดรับของได้จริง)
                ⚠️ ตั้งคำขอทั้งสองก่อน handleSetTab เสมอ — view ปลายทางเพิ่งเกิดหลังสลับแท็บ
                จึงต้องอ่านคำขอที่ค้างไว้เอง ไม่ใช่รอรับ event ที่ยิงผ่านไปแล้ว
                ส่งค่าว่างมาก็ต้องเรียก — ตัวช่วยทั้งคู่ล้างคำขอค้างของการกดครั้งก่อนให้ด้วย */}
            {/* ปุ่มเปลี่ยนภาษา — ซ้ายมือกระดิ่ง · อยู่ทุกแท็บ (แรงงานพม่ากดเปลี่ยนได้จากทุกหน้า) */}
            <LangSwitcher/>
            <NotiBell onNavigate={(t, focus, view) => {
              if (!allowedTabIds.includes(t)) return;
              dmjRequestFocus(t, focus);
              dmjRequestView(t, view);
              handleSetTab(t);
            }}/>
            <button title={`${staff ? staff.name + " · " : ""}${ROLE_LABELS[role]} · ออกจากระบบ`}
                 onClick={() => setConfirmAction({ type: "logout" })}
                 style={{minHeight:44,minWidth:44,padding:"3px 8px",border:"none",
                         background:"transparent",cursor:"pointer",fontFamily:"inherit",
                         display:"flex",flexDirection:"column",alignItems:"center",
                         justifyContent:"center",gap:2}}>
              {staff && staff.pictureUrl ? (
                <img src={staff.pictureUrl} alt="" style={{
                  width:30,height:30,borderRadius:"50%",objectFit:"cover",
                  border:"1.5px solid var(--bdr)",
                }}/>
              ) : (
                <span style={{width:30,height:30,borderRadius:"50%",
                           background:
                             role==="dev"        ? "#4a4a6a" :
                             role==="owner"      ? "var(--g-700)" :
                             role==="warehouse"  ? "#8a6a2f" :
                             role==="frontstore" ? "#1f6f8b" :
                             role==="saler"      ? "#705d96" :
                             "var(--g-300)",
                           color:"#fff",
                           display:"flex",alignItems:"center",justifyContent:"center",
                           fontWeight:700,fontSize:13}}>
                  {role==="dev"        ? "D" :
                   role==="owner"      ? "ด" :
                   role==="warehouse"  ? "ค" :
                   role==="frontstore" ? "ร" :
                   role==="saler"      ? "S" : "พ"}
                </span>
              )}
              <span style={{fontSize:10,fontWeight:700,color:"var(--muted)",lineHeight:1,maxWidth:56,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {staff ? staff.name : "🚪 ออก"}
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* ─── Offline banner ─── */}
      {!isOnline && (
        <div style={{
          background:"#1a1a1a", color:"#fff", padding:"8px 20px",
          textAlign:"center", fontSize:13, fontWeight:600,
          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          position:"sticky", top:0, zIndex:900,
        }}>
          <span style={{fontSize:18}}>📵</span>
          <span>ไม่มีอินเทอร์เน็ต — ข้อมูลอาจไม่ใช่ล่าสุด</span>
          <span style={{fontSize:11,fontWeight:400,opacity:.7}}>No connection · cached data</span>
        </div>
      )}

      {/* ─── Phase 7.3: กำลังดูข้อมูลสำรองระหว่างระบบสร้างชุดใหม่ ─── */}
      {/* เจตนา: ไม่ให้ผู้ใช้ตัดสินใจสั่งของจากตัวเลขเก่าโดยไม่รู้ตัว · ไม่ต้องกดอะไร
          เดี๋ยวระบบดึงชุดใหม่ให้เองใน 5-9 วิ (ดู effect ด้านบน) — บอกไว้เพื่อไม่ให้กด Sync รัว */}
      {staleAt > 0 && isOnline && (
        <div style={{
          background:"#fffbeb", borderBottom:"1px solid #fcd34d", color:"#78350f",
          padding:"8px 16px", fontSize:13, display:"flex", alignItems:"center", gap:8,
        }}>
          <span style={{fontSize:16}}>⏳</span>
          <div style={{flex:1,minWidth:0}}>
            <b>กำลังอัปเดตข้อมูล</b> — ที่เห็นตอนนี้คือข้อมูล ณ{" "}
            {new Date(staleAt).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}
            <span style={{opacity:.8}}> · เดี๋ยวขึ้นเองอัตโนมัติ</span>
          </div>
          <button className="btn ghost" style={{padding:"4px 10px",fontSize:12}}
                  disabled={syncing} onClick={()=>fetchFromSheet(3,true)}>ดึงเดี๋ยวนี้</button>
        </div>
      )}

      {/* ─── PWA install prompt ─── */}
      {installPrompt && !installDismissed && (
        <div style={{background:"#ecfdf5",borderBottom:"1px solid #6ee7b7",
                     padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>📱</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,fontSize:14}}>ติดตั้งแอปได้เลย</div>
            <div style={{fontSize:12,color:"#065f46"}}>เพิ่มไปหน้าจอหลัก ใช้งานได้แบบแอปจริง</div>
          </div>
          <button onClick={function() {
            installPrompt.prompt();
            installPrompt.userChoice.then(function() { setInstallPrompt(null); });
          }} style={{background:"#059669",color:"#fff",border:"none",borderRadius:8,
                     padding:"8px 14px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
            ติดตั้ง
          </button>
          <button onClick={function() {
            sessionStorage.setItem("dmj_install_dismissed","1");
            setInstallDismissed(true);
          }} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#6b7280",padding:"4px 6px"}}>
            ✕
          </button>
        </div>
      )}

      {/* ─── Stock check request banner (fs/wh) ─── */}
      {(role === "frontstore" || role === "warehouse") && pendingChecks.length > 0 && (
        <div className="no-print" style={{background:"#fffbeb",borderBottom:"1px solid #fcd34d",
                     padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>📋</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,fontSize:14}}>มีคำขอเช็คสต็อก · {pendingChecks[0].skus.length} รายการ</div>
            <div style={{fontSize:12,color:"#92400e"}}>
              {pendingChecks[0].names.slice(0,3).join(", ")}{pendingChecks[0].names.length > 3 ? "..." : ""}
            </div>
          </div>
          <button onClick={function() {
            setActiveCheckRequest(pendingChecks[0]);
            handleSetTab(role === "frontstore" ? "frontstore" : "stockcount");
          }}
            style={{background:"#f59e0b",color:"#fff",border:"none",borderRadius:8,
                    padding:"8px 12px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
            ดูรายการ
          </button>
        </div>
      )}

      {/* ─── ทางด่วนลงเวลา: บอกว่าหน้านี้ใช้ได้แล้ว ส่วนที่เหลือยังตามมา ───
           ต้องมี ไม่งั้นพนักงานกดแท็บอื่นแล้วเจอจอโหลดจะนึกว่าแอปพัง/ค้าง
           ทั้งที่ตั้งใจให้ลงเวลาได้ก่อน · โชว์ไบต์ที่โหลดมาแล้วด้วยเพื่อให้เห็นว่ามันเดินอยู่จริง */}
      {attFastPath && !error && (
        <div className="no-print" style={{
          background:"#e8f5e9", color:"#1b5e20", padding:"6px 16px",
          fontSize:12, display:"flex", alignItems:"center", gap:8,
          borderBottom:"1px solid #a5d6a7",
        }}>
          <span className="spin" style={{width:12,height:12,borderWidth:2,flexShrink:0}}></span>
          <span>{activeTab === HOME_TAB ? "เลือกเมนูได้เลย" : "ลงเวลาได้เลย"} — ข้อมูลสินค้ากำลังโหลดอยู่เบื้องหลัง</span>
        </div>
      )}
      {attFastPath && error && (
        <div className="no-print" style={{
          background:"#fff3cd", color:"#856404", padding:"6px 16px",
          fontSize:12, display:"flex", alignItems:"center", justifyContent:"space-between",
          gap:8, borderBottom:"1px solid #ffc107",
        }}>
          <span>⚠️ โหลดข้อมูลสินค้าไม่สำเร็จ — แต่{activeTab === HOME_TAB ? "เมนูลงเวลายัง" : "ลงเวลา"}ใช้ได้ตามปกติ</span>
          <button className="btn ghost" style={{fontSize:12,padding:"2px 8px"}}
                  onClick={()=>fetchFromSheet(3,true)}>ลองใหม่</button>
        </div>
      )}

      {/* ─── Sync error banner (non-blocking, only when data already loaded) ─── */}
      {error && data && (
        <div className="no-print" style={{
          background:"#fff3cd", color:"#856404", padding:"6px 16px",
          fontSize:12, display:"flex", alignItems:"center", justifyContent:"space-between",
          gap:8, borderBottom:"1px solid #ffc107",
        }}>
          <span>⚠️ Sync ล้มเหลว: {error}</span>
          <button className="btn ghost" style={{fontSize:12,padding:"2px 8px"}}
                  onClick={()=>fetchFromSheet(3,true)}>ลองใหม่</button>
        </div>
      )}


      {/* ─── Main ─── */}
      <main className="main" data-screen-label={activeTab}>
        {/* ⚠️ ด่านเดียวที่กัน view ที่ต้องใช้ `data` ไม่ให้เจอ null — ทุก view ข้างล่างนี้
            (ยกเว้น 2 แท็บลงเวลา + หน้าหลัก) อ่าน data.products/data.orders ตรง ๆ เจอ null = จอขาว
            เงื่อนไขต้องตรงกับ NO_DATA_TABS ข้างบนเป๊ะ ๆ */}
        {!data && !NO_DATA_TABS.includes(activeTab) ? dataPane : (<>
        {activeTab === HOME_TAB       && <ErrorBoundary key="home"><HomeMenuView
                                            groups={navGroups}
                                            roleLabel={ROLE_LABELS[role] || role}
                                            staffName={staff ? staff.name : ""}
                                            tabBadge={tabBadge}
                                            /* ⚠️ ตั้งคำขอ "เปิดมุมมองไหน" **ก่อน** สลับแท็บเสมอ —
                                               สลับก่อน = view ปลายทาง mount ไปแล้วตอนที่ยังไม่มี
                                               คำขอให้อ่าน แล้วไม่มีใครยิงซ้ำให้อีก (หลักเดียวกับ
                                               dmjRequestFocus ของกระดิ่งแจ้งเตือน)
                                               การ์ดธรรมดาส่ง view = undefined → ล้างคำขอค้างทิ้ง */
                                            onNav={(t, view) => { dmjRequestView(t, view); handleSetTab(t); }}/></ErrorBoundary>}
        {activeTab === "overview"     && <ErrorBoundary key="overview"><OverviewView data={data} range={range} setRange={setRange} role={viewRole}/></ErrorBoundary>}
        {activeTab === "whhome"       && <ErrorBoundary key="whhome"><WarehouseHomeView data={data} onNav={handleSetTab}/></ErrorBoundary>}
        {activeTab === "categories"   && <ErrorBoundary key="categories"><CategoryView data={data} role={viewRole} onNav={handleSetTab}/></ErrorBoundary>}
        {activeTab === "trends"       && <ErrorBoundary key="trends"><TrendsView data={data} role={viewRole}/></ErrorBoundary>}
        {activeTab === "stock"        && <ErrorBoundary key="stock"><StockView data={data} role={viewRole}/></ErrorBoundary>}
        {activeTab === "newproduct"   && <ErrorBoundary key="newproduct"><AddProductView data={data} role={viewRole} onAdded={fetchFromSheet}/></ErrorBoundary>}
        {activeTab === "storage"      && <ErrorBoundary key="storage"><StorageView data={data}/></ErrorBoundary>}
        {activeTab === "stockcount"   && <ErrorBoundary key="stockcount"><StockCountView data={data}
                                            checkRequest={activeCheckRequest}
                                            onCheckComplete={async function(reqId){
                                              try {
                                                await dmjFetch(SHEET_DEPLOY_URL, {method:"POST",
                                                  headers:{"Content-Type":"text/plain;charset=utf-8"},
                                                  body: JSON.stringify({completeStockCheck:true, reqId:reqId, actor:role})});
                                                setActiveCheckRequest(null);
                                                fetchFromSheet();
                                              } catch(e){ console.error("completeStockCheck:", e); }
                                            }}/></ErrorBoundary>}
        {activeTab === "frontstore"   && <ErrorBoundary key="frontstore"><FrontStoreView data={data} role={viewRole} checkRequest={activeCheckRequest}/></ErrorBoundary>}
        {activeTab === "transfers"    && <ErrorBoundary key="transfers"><TransferView data={data}/></ErrorBoundary>}
        {activeTab === "orders"       && <ErrorBoundary key="orders"><OrderListView data={data} role={viewRole}/></ErrorBoundary>}
        {activeTab === "tracking"     && <ErrorBoundary key="tracking"><TrackingView data={data} role={viewRole}/></ErrorBoundary>}
        {activeTab === "ordersummary" && <ErrorBoundary key="ordersummary"><OrderSummaryView data={data} onPrintRequest={handleOrderPrint}/></ErrorBoundary>}
        {activeTab === "mtojobs"      && <ErrorBoundary key="mtojobs"><MtoJobView data={data} /></ErrorBoundary>}
        {activeTab === "upload"       && <ErrorBoundary key="upload"><UploadView currentData={data} onDataLoaded={handleDataLoaded}/></ErrorBoundary>}
        {activeTab === "labels"       && <ErrorBoundary key="labels"><LabelPrintView data={data}
                                            initItems={labelInitItems}
                                            onInitConsumed={() => setLabelInitItems(null)}/></ErrorBoundary>}
        {activeTab === "auditlog"     && <ErrorBoundary key="auditlog"><AuditLogView/></ErrorBoundary>}
        {activeTab === "staff"        && <ErrorBoundary key="staff"><StaffView/></ErrorBoundary>}
        {activeTab === "staffperf"    && <ErrorBoundary key="staffperf"><StaffPerformanceView/></ErrorBoundary>}
        {activeTab === "attendance"   && <ErrorBoundary key="attendance"><AttendanceView role={viewRole}/></ErrorBoundary>}
        {activeTab === "atttoday"     && <ErrorBoundary key="atttoday"><AttendanceTodayView canEdit={isAdminRole(role)} onNav={handleSetTab}/></ErrorBoundary>}
        {activeTab === "attreport"    && <ErrorBoundary key="attreport"><AttendanceReportView/></ErrorBoundary>}
        {activeTab === "deadstock"    && <ErrorBoundary key="deadstock"><DeadStockView/></ErrorBoundary>}
        {activeTab === "quotefollowup" && <ErrorBoundary key="quotefollowup"><QuoteFollowupView data={data} role={viewRole}/></ErrorBoundary>}
        {activeTab === "pos"          && <ErrorBoundary key="pos"><PosView data={data} role={viewRole}/></ErrorBoundary>}
        {activeTab === "customers"    && <ErrorBoundary key="customers"><CustomerView data={data}/></ErrorBoundary>}
        {activeTab === "margin"       && <ErrorBoundary key="margin"><MarginView data={data}/></ErrorBoundary>}
        {activeTab === "season"       && <ErrorBoundary key="season"><SeasonView data={data}/></ErrorBoundary>}
        {activeTab === "connect"      && <ErrorBoundary key="connect"><ConnectView
                                    sheetUrl={sheetUrl}
                                    sheetViewUrl={sheetViewUrl}
                                    syncing={syncing}
                                    lastSync={lastSync}
                                    source={source}
                                    onSync={fetchFromSheet}
                                    onClearLocal={handleClearLocal}
                                    syncingZortSales={zortSalesSyncing}
                                    zortSalesLastSync={data && data.updatedAt && data.updatedAt.monthlysales}
                                    onSyncZortSales={async () => {
                                      setZortSalesSyncing(true);
                                      const r = await syncZortSalesNow();
                                      setZortSalesSyncing(false);
                                      if (r && r.success !== false) fetchFromSheet();
                                      else showNavToast("error", "Sync ยอดขาย ZORT ไม่สำเร็จ: " + ((r && r.error) || "timeout"));
                                    }}
                                    /></ErrorBoundary>}
        </>)}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
