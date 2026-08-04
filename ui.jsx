// Shared UI primitives + helpers
const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ────────────── Formatters ──────────────
const fmtN = n => (n == null || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtB = n => {
  if (n == null || isNaN(n)) return "฿0";
  const a = Math.abs(n);
  if (a >= 1e6) return `฿${(n/1e6).toFixed(2)}M`;
  if (a >= 1e3) return `฿${(n/1e3).toFixed(1)}K`;
  return `฿${Math.round(n).toLocaleString()}`;
};
const fmtBfull = n => `฿${Math.round(n||0).toLocaleString()}`;
const fmtPct = (n, decimals=1) => n == null ? "—" : `${(n*100).toFixed(decimals)}%`;
const monthLabel = (ym) => {
  // ym = "01/2026"
  const [m, y] = ym.split("/");
  const names = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  return `${names[parseInt(m,10)-1] || m} ${y ? y.slice(-2) : ""}`;
};

// ────────────── Category palette ──────────────
// Green-anchored palette varying hue+lightness, low chroma — feels cohesive
const CAT_COLORS = [
  "#1f7f44", // primary green
  "#4fb472",
  "#88d09e",
  "#a07417", // gold
  "#c2570a", // burnt orange
  "#1f6f8b", // teal
  "#5c8a3c", // olive
  "#3a8f6a",
  "#b8341c", // brick
  "#705d96", // muted purple
  "#2a6f6f",
  "#8a6a2f",
  "#4a7f5a",
  "#9a8a4a",
  "#6b8a8a",
  "#a05a3a",
  "#3a6f4a",
  "#7a8a5a",
  "#5a8a7a",
  "#8a5a6f",
  "#6a7a3a",
  "#3a5a7a",
  "#7a3a4a",
];
const catColorMap = new Map();
const catColor = (cat, allCats = []) => {
  if (!catColorMap.has(cat)) {
    const idx = allCats.indexOf(cat);
    catColorMap.set(cat, CAT_COLORS[(idx >= 0 ? idx : catColorMap.size) % CAT_COLORS.length]);
  }
  return catColorMap.get(cat);
};
// รีเซ็ต map เมื่อ data โหลดใหม่ เพื่อให้ assign สีถูก category (กันสีเพี้ยนเมื่อ list เปลี่ยน)
const resetCatColorMap = () => { catColorMap.clear(); };

// ────────────── Icons (lucide-style inline) ──────────────
const Icon = ({ d, size, stroke = 2 }) => (
  // width/height default 18 = กันไอคอนพองยักษ์เมื่อ CSS ยังไม่โหลด (viewBox-only svg default 300x150)
  // CSS (.navtab svg ฯลฯ) ยัง override attribute ได้ปกติ · size prop ยัง override ผ่าน inline style
  <svg viewBox="0 0 24 24" width={size||18} height={size||18} fill="none" stroke="currentColor" strokeWidth={stroke}
       strokeLinecap="round" strokeLinejoin="round" style={size?{width:size,height:size}:undefined}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const I = {
  dashboard: <Icon d="M3 12 L12 3 L21 12 M5 10 V20 H19 V10" />,
  layers:    <Icon d={["M12 2 L2 7 L12 12 L22 7 Z", "M2 17 L12 22 L22 17", "M2 12 L12 17 L22 12"]} />,
  alert:     <Icon d={["M12 9 V13", "M12 17 H12.01", "M10.29 3.86 L1.82 18 a2 2 0 0 0 1.71 3 H20.47 a2 2 0 0 0 1.71-3 L13.71 3.86 a2 2 0 0 0-3.42 0 Z"]} />,
  upload:    <Icon d={["M21 15 V19 a2 2 0 0 1-2 2 H5 a2 2 0 0 1-2-2 V15", "M17 8 L12 3 L7 8", "M12 3 V15"]} />,
  link:      <Icon d={["M10 13 a5 5 0 0 0 7.54 .54 l3-3 a5 5 0 0 0-7.07-7.07 l-1.72 1.71", "M14 11 a5 5 0 0 0-7.54-.54 l-3 3 a5 5 0 0 0 7.07 7.07 l1.71-1.71"]} />,
  sales:     <Icon d={["M2 12 L7 7 L11 11 L17 5 L22 10","M17 5 H22 V10"]} />,
  package:   <Icon d={["M16.5 9.4 L7.55 4.24","M21 16 V8 a2 2 0 0 0-1-1.73 L13 2.27 a2 2 0 0 0-2 0 L4 6.27 A2 2 0 0 0 3 8 v8 a2 2 0 0 0 1 1.73 L11 21.73 a2 2 0 0 0 2 0 L20 17.73 A2 2 0 0 0 21 16 Z","M3.27 6.96 L12 12.01 L20.73 6.96","M12 22.08 V12"]} />,
  cart:      <Icon d={["M9 22 a1 1 0 1 0 0-2 1 1 0 0 0 0 2 Z","M20 22 a1 1 0 1 0 0-2 1 1 0 0 0 0 2 Z","M1 1 H5 L7.68 14.39 a2 2 0 0 0 2 1.61 H19.4 a2 2 0 0 0 2-1.61 L23 6 H6"]} />,
  trend:     <Icon d={["M23 6 L13.5 15.5 L8.5 10.5 L1 18","M17 6 H23 V12"]} />,
  search:    <Icon d={["M11 19 A8 8 0 1 0 11 3 a8 8 0 0 0 0 16 Z","M21 21 L16.65 16.65"]} />,
  filter:    <Icon d="M22 3 H2 L10 12.46 V19 L14 21 V12.46 Z" />,
  download:  <Icon d={["M21 15 V19 a2 2 0 0 1-2 2 H5 a2 2 0 0 1-2-2 V15","M7 10 L12 15 L17 10","M12 15 V3"]} />,
  refresh:   <Icon d={["M1 4 V10 H7","M23 20 V14 H17","M20.49 9 A9 9 0 0 0 5.64 5.64 L1 10","M3.51 15 a9 9 0 0 0 14.85 3.36 L23 14"]} />,
  arrowR:    <Icon d={["M5 12 H19","M12 5 L19 12 L12 19"]} />,
  arrowL:    <Icon d={["M19 12 H5","M12 19 L5 12 L12 5"]} />,
  warning:   <Icon d={["M10.29 3.86 L1.82 18 a2 2 0 0 0 1.71 3 H20.47 a2 2 0 0 0 1.71-3 L13.71 3.86 a2 2 0 0 0-3.42 0 Z","M12 9 V13","M12 17 H12.01"]} />,
  check:     <Icon d="M20 6 L9 17 L4 12" />,
  x:         <Icon d={["M18 6 L6 18","M6 6 L18 18"]} />,
  plus:      <Icon d={["M12 5 V19","M5 12 H19"]} />,
  store:     <Icon d={["M3 9 L4 4 H20 L21 9","M3 9 V20 A1 1 0 0 0 4 21 H20 A1 1 0 0 0 21 20 V9","M3 9 H21","M9 13 H15"]} />,
  user:      <Icon d={["M20 21 V19 a4 4 0 0 0-4-4 H8 a4 4 0 0 0-4 4 V21","M12 11 A4 4 0 1 0 12 3 a4 4 0 0 0 0 8 Z"]} />,
  calendar:  <Icon d={["M19 4 H5 a2 2 0 0 0-2 2 v14 a2 2 0 0 0 2 2 h14 a2 2 0 0 0 2-2 V6 a2 2 0 0 0-2-2 Z","M16 2 V6","M8 2 V6","M3 10 H21"]} />,
  sheets:    <Icon d={["M19 3 H5 a2 2 0 0 0-2 2 v14 a2 2 0 0 0 2 2 h14 a2 2 0 0 0 2-2 V5 a2 2 0 0 0-2-2 Z","M3 9 H21","M3 15 H21","M9 3 V21","M15 3 V21"]} />,
  leaf:      <Icon d={["M11 20 A7 7 0 0 1 9.8 6.1 C15.5 5 17 4.48 19.8 2 c.5 5 .8 8 1.2 12.5 0 0-.7 0-1.5-.4 a8.85 8.85 0 0 1-3.4-3","M2 21 c0-3 1.85-5.36 5.08-6"]} />,
  warehouse: <Icon d={["M3 21 V9 L12 3 L21 9 V21","M3 21 H21","M8 21 V13 H16 V21","M8 17 H16"]} />,
  flame:     <Icon d="M8.5 14.5 A2.5 2.5 0 0 0 11 12 c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5 a7 7 0 1 1-14 0 c0-1.153.433-2.294 1-3 a2.5 2.5 0 0 0 2.5 2.5 Z" />,
  print:     <Icon d={["M6 9 V2 H18 V9","M6 18 H4 a2 2 0 0 1-2-2 v-5 a2 2 0 0 1 2-2 H20 a2 2 0 0 1 2 2 v5 a2 2 0 0 1-2 2 H18","M6 14 H18 V22 H6 Z"]} />,
  scan:      <Icon d={["M4 8 V4 H8","M16 4 H20 V8","M20 16 V20 H16","M8 20 H4 V16","M3 12 H21"]} />,
};

// ────────────── KPI Card ──────────────
function KPI({ label, value, sub, icon, delta, deltaDir, accent }) {
  return (
    <div className="kpi">
      <div className="kpi-deco" style={accent ? {background: accent + "20"} : null}></div>
      <div className="kpi-icon" style={accent ? {color: accent, background: accent + "14"} : null}>
        {icon || I.sales}
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value green" style={accent ? {color: accent} : null}>{value}</div>
      <div className="kpi-foot">
        {delta != null && (
          <span className={`kpi-delta ${deltaDir==='down'?'down':'up'}`}>
            {deltaDir==='down' ? '↓' : '↑'} {delta}
          </span>
        )}
        <span>{sub}</span>
      </div>
    </div>
  );
}

// ────────────── Card ──────────────
function Card({ title, sub, action, children, style, padding=true, hover, className }) {
  return (
    <div className={`card${hover?' hover':''}${className?` ${className}`:''}`} style={{padding: padding?20:0, ...style}}>
      {(title || action) && (
        <div className="card-head" style={padding?null:{padding:"20px 20px 0"}}>
          <div>
            {title && <div className="card-title">{title}</div>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      <div style={padding?null:{padding:"0 20px 20px"}}>{children}</div>
    </div>
  );
}

// ────────────── Segmented control ──────────────
function Seg({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o.value}
                className={`seg-btn${value===o.value?' active':''}`}
                onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ────────────── Sparkline (mini line chart) ──────────────
function Sparkline({ values, color="#1f7f44", height=32 }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = (max - min) || 1;
  const w = 100, h = height;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const area = `M0,${h} L${pts.split(" ").join(" L")} L${w},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
         style={{width:"100%",height,overflow:"visible"}}>
      <path d={area} fill={color} opacity={0.13} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8}
                strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ────────────── Empty ──────────────
function Empty({ icon, title, sub }) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon || I.package}</div>
      <div style={{fontWeight:600, fontSize:14, color:"var(--text)", marginBottom:4}}>{title}</div>
      <div>{sub}</div>
    </div>
  );
}

// ────────────── dmjFetch — แนบ sessionToken ให้ทุก POST ที่ยิงไป GAS ──────────
// เฟส 4 ของระบบล็อกอิน: server ต้องยืนยัน "ใครทำ" เองจาก session ไม่ใช่เชื่อ actor
// ที่ client ส่งมา (ซึ่งปลอมได้) · ทำที่เดียวจบ ไม่ต้องไล่แก้ payload ทีละจุด (39 จุด/4 ไฟล์)
//
// ปลอดภัยแบบ no-op: ถ้าไม่มี token / body ไม่ใช่ JSON object / ไม่ใช่ POST /
// มี sessionToken อยู่แล้ว → ส่งต่อของเดิมไม่แตะเลย
function dmjFetch(url, opts) {
  try {
    if (opts && opts.method === "POST" && typeof opts.body === "string") {
      const tok = localStorage.getItem("dmj_session_token");
      if (tok) {
        const b = JSON.parse(opts.body);
        if (b && typeof b === "object" && !Array.isArray(b) && b.sessionToken == null) {
          b.sessionToken = tok;
          opts = Object.assign({}, opts, { body: JSON.stringify(b) });
        }
      }
    }
  } catch (e) { /* body ไม่ใช่ JSON (เช่น FormData) → ปล่อยผ่านตามเดิม */ }
  return fetch(url, opts);
}

// ────────────── กระดิ่งแจ้งเตือนในแอป 🔔 ──────────────
// ทำไมอยู่ในไฟล์นี้: ui.jsx เป็นไฟล์เล็กสุด (โหลดก่อนใคร) — ยัดลง views-main/analytics ที่
// ใหญ่อยู่แล้วจะยิ่งถ่วง Babel compile time (เหตุผลเดียวกับที่แยกไฟล์ view ไว้แต่แรก)
//
// ขอบเขต: เห็นเฉพาะตอนเปิดแอปอยู่ — ไม่เด้งหน้าจอล็อก (ดู comment ฝั่ง .gs)
// backend gate ด้วย INAPP_NOTI_ENABLED — ยังไม่เปิด → คืน {off:true} กระดิ่งซ่อนตัวเงียบ ๆ

const NOTI_TYPE_META = {
  order:      { emoji: "📦", color: "#1f7f44" },
  shipment:   { emoji: "🚚", color: "#1f6f8b" },
  stock:      { emoji: "🚨", color: "#b8341c" },
  mto:        { emoji: "🎁", color: "#705d96" },
  quote:      { emoji: "📄", color: "#a07417" },
  attendance: { emoji: "⏱️", color: "#5c8a3c" },
  system:     { emoji: "🔔", color: "#6b8a8a" },
};

// "2 นาทีที่แล้ว" — พนักงานอ่านเวลาสัมพัทธ์ง่ายกว่า timestamp เต็ม
const notiAgo = (ts) => {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "เมื่อสักครู่";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
};

// เสียง "ติ๊ง" สั้น ๆ สร้างด้วย WebAudio — ไม่ต้องมีไฟล์เสียง (ไม่มี build step + ไม่เพิ่ม asset)
// เบราว์เซอร์บล็อกเสียงก่อนผู้ใช้แตะจอ → ห่อ try/catch ทั้งหมด ล้มเหลวก็แค่ไม่มีเสียง
function notiPing() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.start(); osc.stop(ctx.currentTime + 0.36);
    setTimeout(() => { try { ctx.close(); } catch (e) {} }, 600);
  } catch (e) { /* เงียบ */ }
  try { if (navigator.vibrate) navigator.vibrate([90, 60, 90]); } catch (e) { /* เงียบ */ }
}

const NOTI_POLL_MS = 25000;

function NotiBell({ onNavigate }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // backend ยังไม่เปิดระบบ (INAPP_NOTI_ENABLED) → ซ่อนกระดิ่งไปเลย
  // เริ่มที่ "ซ่อน" จนกว่าจะรู้ผลจริง แล้วจำไว้ในเครื่อง — ไม่งั้นเครื่องที่ยังไม่เปิดระบบ
  // จะเห็นกระดิ่งโผล่แล้วหายทุกครั้งที่เปิดแอป (กะพริบ) ส่วนเครื่องที่เปิดแล้วก็ต้องรอ
  // โหลดรอบแรกทุกครั้งกว่ากระดิ่งจะขึ้น
  const [off, setOff] = useState(() => {
    try { return localStorage.getItem("dmj_noti_on") !== "1"; } catch (e) { return true; }
  });
  const prevUnread = useRef(null);             // null = ยังไม่เคยโหลด (ห้ามเด้งเสียงรอบแรก)
  const busy = useRef(false);
  const btnRef = useRef(null);
  const [rect, setRect] = useState(null);      // ตำแหน่งปุ่มตอนเปิด — ใช้วาง panel ที่ portal ไป body

  const base = (typeof GOOGLE_SHEET_URL !== 'undefined') ? GOOGLE_SHEET_URL : null;

  const fetchNotis = useCallback(() => {
    if (!base || busy.current || !navigator.onLine) return;
    const tok = localStorage.getItem("dmj_session_token");
    if (!tok) return;                          // ยังไม่ล็อกอิน → ไม่มีอะไรให้ดึง
    busy.current = true;
    const sep = base.includes('?') ? '&' : '?';
    fetch(`${base}${sep}action=inappNoti&sessionToken=${encodeURIComponent(tok)}&_t=${Date.now()}`,
          { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d || d.ok === false) return;
        try { localStorage.setItem("dmj_noti_on", d.off ? "0" : "1"); } catch (e) {}
        if (d.off) { setOff(true); return; }
        setOff(false);
        setItems(Array.isArray(d.items) ? d.items : []);
        const n = Number(d.unread) || 0;
        // เด้งเสียงเฉพาะตอน "เพิ่มขึ้นจริง" หลังโหลดรอบแรกไปแล้ว —
        // ไม่งั้นเปิดแอปมาทีไรก็ติ๊งทุกครั้งทั้งที่ไม่มีอะไรใหม่
        if (prevUnread.current != null && n > prevUnread.current) notiPing();
        prevUnread.current = n;
        setUnread(n);
      })
      .catch(() => {})                          // background poll — ไม่รบกวนผู้ใช้
      .finally(() => { busy.current = false; });
  }, [base]);

  useEffect(() => {
    fetchNotis();
    const id = setInterval(fetchNotis, NOTI_POLL_MS);
    // iOS แช่แข็ง timer ตอนแอปอยู่ background — ต้องดึงซ้ำตอนกลับมาด้วย
    // (บทเรียนเดียวกับ login handoff ใน app.jsx — ห้ามพึ่ง interval อย่างเดียว)
    const wake = () => { if (!document.hidden) fetchNotis(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [fetchNotis]);

  const markRead = useCallback((ids, all) => {
    if (!base) return;
    const body = all ? { action: "markNotiRead", all: true }
                     : { action: "markNotiRead", ids: ids };
    // optimistic: ทำเครื่องหมายในจอทันที ไม่รอ GAS ตอบ (ช้า 1-3 วิ กดแล้วต้องรู้สึกว่าติด)
    setItems(prev => prev.map(it => (all || ids.indexOf(it.id) >= 0) ? { ...it, read: true } : it));
    setUnread(prev => {
      const n = all ? 0 : Math.max(0, prev - ids.length);
      prevUnread.current = n;
      return n;
    });
    dmjFetch(base, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }, [base]);

  const openItem = useCallback((it) => {
    if (!it.read) markRead([it.id], false);
    setOpen(false);
    if (it.tab && typeof onNavigate === 'function') onNavigate(it.tab);
  }, [markRead, onNavigate]);

  if (off) return null;

  // ⚠️ panel ต้อง portal ออกไปที่ body — `.topnav` มี `overflow-x: hidden` (+ backdrop-filter)
  // ซึ่งตัดกล่องที่ยื่นออกนอกแถบ nav ทิ้ง ถ้าวางไว้ในนั้นจะเห็นแค่ขอบบางๆ ไม่เห็นเนื้อหาเลย
  // (เมนู "เพิ่มเติม" ของ owner เลี่ยงปัญหานี้ด้วยการเป็น bottom sheet position:fixed เช่นกัน)
  // ตำแหน่งวัดจากปุ่มจริงตอนเปิด — แถบ nav ของ owner สูง 2 ชั้น ใช้ค่า top ตายตัวไม่ได้
  const openPanel = () => {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(o => !o);
  };
  const narrow = typeof window !== 'undefined' && window.innerWidth <= 480;
  const pos = rect
    ? (narrow
        ? { top: Math.round(rect.bottom + 6), left: 8, right: 8 }
        : { top: Math.round(rect.bottom + 6), right: Math.max(8, Math.round(window.innerWidth - rect.right)) })
    : { top: 64, right: 8 };

  const panel = (
    <>
      <div className="noti-backdrop" onClick={() => setOpen(false)}/>
      <div className="noti-panel" role="dialog" aria-label="การแจ้งเตือน" style={pos}>
            <div className="noti-head">
              <span style={{fontWeight:700,fontSize:15}}>🔔 การแจ้งเตือน</span>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {unread > 0 && (
                  <button className="noti-readall" onClick={() => markRead([], true)}>อ่านทั้งหมด</button>
                )}
                <button className="noti-close" onClick={() => setOpen(false)} aria-label="ปิด">✕</button>
              </div>
            </div>

            <div className="noti-list">
              {items.length === 0 ? (
                <div className="noti-empty">
                  <div style={{fontSize:30,marginBottom:6}}>🔕</div>
                  <div style={{fontWeight:600,marginBottom:2}}>ยังไม่มีการแจ้งเตือน</div>
                  <div style={{fontSize:12,color:"var(--muted)"}}>มีของเข้า/ของโอน จะขึ้นตรงนี้</div>
                </div>
              ) : items.map(it => {
                const meta = NOTI_TYPE_META[it.type] || NOTI_TYPE_META.system;
                return (
                  <button key={it.id} className={`noti-item${it.read ? "" : " unread"}`}
                          onClick={() => openItem(it)}>
                    {it.image && (
                      <img src={it.image} alt="" className="noti-thumb" loading="lazy"
                           onError={(e) => {
                             e.target.style.display = "none";
                             e.target.nextElementSibling.style.display = "flex";
                           }}/>
                    )}
                    <span className="noti-emoji" style={{background: meta.color + "18",
                                                           display: it.image ? "none" : "flex"}}>
                      {meta.emoji}
                    </span>
                    <span className="noti-text">
                      <span className="noti-title">{it.title}</span>
                      {it.body && <span className="noti-body">{it.body}</span>}
                      <span className="noti-time">
                        {notiAgo(it.ts)}{it.by ? ` · ${it.by}` : ""}
                      </span>
                    </span>
                    {!it.read && <span className="noti-dot" aria-label="ยังไม่อ่าน"/>}
                  </button>
                );
              })}
            </div>
      </div>
    </>
  );

  return (
    <div style={{position:"relative"}}>
      <button ref={btnRef} className="noti-btn"
              aria-label={`การแจ้งเตือน${unread ? ` (${unread} ใหม่)` : ""}`}
              onClick={openPanel}>
        <span style={{fontSize:20,lineHeight:1}}>🔔</span>
        {unread > 0 && <span className="noti-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && ReactDOM.createPortal(panel, document.body)}
    </div>
  );
}

// Make available everywhere
Object.assign(window, {
  fmtN, fmtB, fmtBfull, fmtPct, monthLabel,
  CAT_COLORS, catColor, resetCatColorMap,
  I, Icon, KPI, Card, Seg, Sparkline, Empty,
  dmjFetch, NotiBell, notiAgo, NOTI_TYPE_META,
});

if (typeof module !== 'undefined') module.exports = { resetCatColorMap, catColor, CAT_COLORS, notiAgo };
