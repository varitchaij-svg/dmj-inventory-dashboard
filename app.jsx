// Main App — routing + data load
const { useState: usS, useEffect: usE, useCallback: usC } = React;

const TABS = [
  { id: "overview",      label: "📊 ภาพรวม",               icon: I.dashboard },
  { id: "categories",    label: "🛍️ สินค้า & สั่ง",         icon: I.layers },
  { id: "trends",        label: "📈 เทรนด์",               icon: I.flame },
  { id: "stock",         label: "⚠️ สต๊อก & แจ้งเตือน",    icon: I.alert },
  { id: "storage",       label: "🗺️ ตำแหน่งคลัง",           icon: I.warehouse },
  { id: "stockcount",    label: "📊 นับ stock คลัง",         icon: I.alert },
  { id: "frontstore",    label: "🏪 เช็คหน้าร้าน",           icon: I.store },
  { id: "transfers",     label: "🔄 โอน/ปรับ/ยกมา",        icon: I.arrowR },
  { id: "orders",        label: "📋 รายการสั่งของ",         icon: I.cart },
  { id: "ordersummary",  label: "📦 สรุปสินค้าออกจากคลัง",  icon: I.store },
  { id: "mtojobs",       label: "🎁 งานจัดพิเศษ",            icon: I.package },
  { id: "upload",        label: "⬆️ อัปโหลด Zort",          icon: I.upload },
  { id: "connect",       label: "🔗 Google Sheet",          icon: I.sheets },
  { id: "labels",        label: "🖨️ พิมพ์ Label",            icon: I.print },
  { id: "auditlog",      label: "📋 Audit Log",             icon: I.layers },
  { id: "deadstock",     label: "📦 สินค้าจม",              icon: I.alert },
];

// Role config
const ROLE_TABS = {
  owner:      ["overview","categories","trends","stock","storage","stockcount","frontstore","transfers","orders","ordersummary","mtojobs","upload","connect","labels","auditlog","deadstock"],
  employee:   ["categories","trends","stock","storage","frontstore","transfers","orders","ordersummary","mtojobs","labels"],
  warehouse:  ["categories","stock","storage","stockcount","orders","ordersummary","mtojobs","labels"],
  frontstore: ["categories","stock","frontstore","orders","mtojobs","labels"],
  saler:      ["categories","stock","orders","mtojobs","labels"],
};
const ROLE_LABELS = {
  owner:      "👑 เจ้าของ",
  employee:   "👤 พนักงาน",
  warehouse:  "🏭 คลังสินค้า",
  frontstore: "🏪 หน้าร้าน",
  saler:      "💼 พนักงานขาย",
};

function LoginScreen({ onLogin }) {
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
        // ส่ง PIN ผ่าน POST body เพื่อไม่ให้ PIN ปรากฏใน URL / server access log
        // หมายเหตุ: GAS ต้องจัดการ action=verifyPin ใน doPost ด้วย (ปัจจุบันอาจอยู่ใน doGet)
        const res = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verifyPin', pin }),
        });
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
      background:"var(--bg)", padding:"24px 16px",
    }}>
      <div style={{marginBottom:8}}>
        <img src="logo.png" alt="Doomuenjing"
             style={{height:56, objectFit:"contain"}}
             onError={e => e.target.style.display="none"}/>
      </div>
      <div style={{fontSize:22, fontWeight:700, color:"var(--g-700)",
                   marginBottom:4, letterSpacing:"-.01em"}}>Doomuenjing</div>
      <div style={{fontSize:13, color:"var(--muted)", marginBottom:36}}>
        เลือกบัญชีเพื่อเข้าใช้งาน
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

function enrichData(d) {
  if (!d || !Array.isArray(d.products)) return d;
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
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function saveToStorage(d, source) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(d));
    localStorage.setItem(LS_SRC_KEY, source || "upload");
  } catch (e) {
    console.warn("Could not persist data:", e.message);
  }
}

function App() {
  // ── ALL hooks first (no early returns before this block) ──
  const [role, setRole] = usS(() => sessionStorage.getItem("dmj_role") || null);
  const [data, setData] = usS(null);
  const [error, setError] = usS(null);
  const [navLogoOk, setNavLogoOk] = usS(true);
  const [tab, setTab] = usS(() => sessionStorage.getItem("dmj_role") === "owner" ? "categories" : "overview");
  const [range, setRange] = usS("year");
  const [source, setSource] = usS(localStorage.getItem(LS_SRC_KEY) || "sheet");
  const [syncing, setSyncing] = usS(false);
  const [zortSyncing, setZortSyncing] = usS(false);
  const [lastSync, setLastSync] = usS(localStorage.getItem("dmj_last_sync") || null);
  const [labelInitItems, setLabelInitItems] = usS(null); // for auto-populate from order summary
  const [isOnline, setIsOnline] = usS(() => navigator.onLine);
  const [lastSaved, setLastSaved] = usS(null); // auto-save timestamp
  const [confirmAction, setConfirmAction] = usS(null); // { type:"clearLocal"|"logout" }
  const [moreOpen, setMoreOpen] = usS(false); // dropdown "เพิ่มเติม" บน navtabs (owner)
  const [installPrompt, setInstallPrompt] = usS(null);
  const [installDismissed, setInstallDismissed] = usS(() => !!sessionStorage.getItem("dmj_install_dismissed"));
  const [activeCheckRequest, setActiveCheckRequest] = usS(null); // check request ที่ fs/wh กำลังทำ
  const [navToast, showNavToast, hideNavToast] = useToast(); // toast สำหรับ nav-level errors
  const tabHistoryRef = React.useRef([]); // track tab navigation for Android back

  const sheetUrl = (typeof GOOGLE_SHEET_URL !== 'undefined') ? GOOGLE_SHEET_URL : "data.json";
  const sheetViewUrl = "https://docs.google.com/spreadsheets/d/11yL4u-XLUTCBObMppAj12nnmG0YlDZWsDn2XPCneoHQ/edit";

  // Full payload fetch (หนัก — ใช้ตอนโหลดครั้งแรก/กด Sync)
  // retryLeft: จำนวนครั้งที่เหลือ (3→2→1→0) กัน GAS cold start หลายชั้น
  const fetchFromSheet = usC((retryLeft) => {
    retryLeft = (typeof retryLeft === 'number' && retryLeft >= 0) ? retryLeft : 3;
    setSyncing(true);
    setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45s timeout
    const bustUrl = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
    fetch(bustUrl, { signal: controller.signal, cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d && d.lastModified) window._dataLoadedAt = d.lastModified;
        // รีเซ็ต catColorMap ก่อน enrich เพื่อให้ assign สีถูก category เสมอ
        if (typeof resetCatColorMap === 'function') resetCatColorMap();
        let enriched;
        try { enriched = enrichData(d); } catch (e) {
          console.warn("enrichData failed during fetchFromSheet:", e);
          enriched = d;
        }
        setData(enriched);
        saveToStorage(enriched, "sheet");
        setSource("sheet");
        const now = new Date().toISOString();
        localStorage.setItem("dmj_last_sync", now);
        setLastSync(now);
        setError(null);
      })
      .catch(e => {
        clearTimeout(timeout);
        if (retryLeft > 0) {
          // Cold-start: รอสั้น ๆ แล้วลองใหม่ (GAS อุ่นเครื่องแล้วจะเร็วกว่า)
          const delay = retryLeft === 3 ? 800 : retryLeft === 2 ? 2000 : 4000;
          setTimeout(() => fetchFromSheet(retryLeft - 1), delay);
          return;
        }
        if (e.name === "AbortError") setError("เซิร์ฟเวอร์ตอบช้า — กรุณาลองใหม่อีกครั้ง");
        else setError(e.message);
        setSyncing(false);
      })
      .finally(() => { clearTimeout(timeout); if (!controller.signal.aborted) setSyncing(false); });
  }, [sheetUrl]);

  // Lightweight fetch: ดึงเฉพาะรายการสั่งของ (เบา/เร็ว) — ใช้ polling หน้า orders จะได้ไม่โหลดทั้งก้อน
  const fetchOrdersOnly = usC(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const sep = sheetUrl.includes('?') ? '&' : '?';
    const url = `${sheetUrl}${sep}action=orders&_t=${Date.now()}`;
    fetch(url, { signal: controller.signal, cache: 'no-store' })
      .then(r => r.json())
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
          return { ...prev, orders: d.orders };
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

  // ── Offline / online detection ──
  usE(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

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

  const handleDataLoaded = usC((newData) => {
    if (typeof resetCatColorMap === 'function') resetCatColorMap();
    let enriched;
    try { enriched = enrichData(newData); } catch (e) {
      console.warn("enrichData failed on uploaded data:", e);
      enriched = newData;
    }
    setData(enriched);
    saveToStorage(enriched, "upload");
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

  const doConfirmedAction = usC(() => {
    if (!confirmAction) return;
    if (confirmAction.type === "clearLocal") {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_SRC_KEY);
      fetchFromSheet();
    } else if (confirmAction.type === "logout") {
      sessionStorage.removeItem("dmj_role");
      setRole(null);
    }
    setConfirmAction(null);
  }, [confirmAction, fetchFromSheet]);

  // ── Conditional renders AFTER all hooks ──
  if (!role) {
    return <LoginScreen onLogin={r => { sessionStorage.setItem("dmj_role", r); setRole(r); }}/>;
  }

  const allowedTabIds = ROLE_TABS[role] || ROLE_TABS.employee;
  const visibleTabs = TABS.filter(t => allowedTabIds.includes(t.id));
  const activeTab = allowedTabIds.includes(tab) ? tab : (allowedTabIds[0] || "categories");

  if (error && !data) {
    return (
      <div className="loading-screen">
        <div style={{color:"var(--dang)",fontWeight:600}}>โหลดข้อมูลไม่สำเร็จ</div>
        <div style={{color:"var(--muted)",fontSize:12}}>{error}</div>
        <button className="btn primary" onClick={fetchFromSheet} style={{marginTop:12}}>
          {I.refresh}<span>ลองใหม่</span>
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loading-screen">
        {error ? (
          <>
            <div style={{fontSize:32,marginBottom:8}}>⚠️</div>
            <div style={{fontSize:14,color:"#c62828",marginBottom:16,textAlign:"center",padding:"0 24px"}}>{error}</div>
            <button className="btn" onClick={()=>fetchFromSheet()} style={{minHeight:44,padding:"0 24px"}}>🔄 ลองใหม่</button>
          </>
        ) : (
          <>
            <div className="spin"></div>
            <div style={{fontSize:13,color:"var(--muted)"}}>กำลังโหลดข้อมูล Dashboard…</div>
          </>
        )}
      </div>
    );
  }

  const syncLabel = (() => {
    if (!lastSync) return "ยังไม่ sync";
    const dt = new Date(lastSync);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  })();

  return (
    <div style={{maxWidth:"100vw", overflowX:"hidden", position:"relative"}}>
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
          <div className="brand">
            {navLogoOk ? (
              <img src="logo.png" alt="Doomuenjing"
                   style={{height:38, width:"auto", objectFit:"contain"}}
                   onError={() => setNavLogoOk(false)}/>
            ) : (
              <div className="brand-mark">ด</div>
            )}
            <div className="brand-text">
              <div className="brand-name">Doomuenjing</div>
              <div className="brand-sub">Inventory & Sales Dashboard</div>
            </div>
          </div>

          <div className="navtabs" role="tablist">
            {(() => {
              // ถ้า tabs มากกว่า 6 ตัว → แสดง 5 ตัวแรก + ปุ่ม "เพิ่มเติม" dropdown
              // (ใช้กับทุก role เช่น owner, employee ที่มี 10+ tabs)
              if (visibleTabs.length > 6) {
                const primaryTabs   = visibleTabs.slice(0, 5);
                const secondaryTabs = visibleTabs.slice(5);
                return (
                  <>
                    {primaryTabs.map(t => (
                      <button key={t.id} role="tab"
                              className={`navtab${activeTab===t.id?' active':''}`}
                              onClick={() => { handleSetTab(t.id); setMoreOpen(false); }}>
                        {t.icon}<span>{t.label}</span>
                      </button>
                    ))}
                    <div style={{position:"relative"}}>
                      <button role="tab"
                              className={`navtab${secondaryTabs.some(t=>t.id===activeTab)||moreOpen?' active':''}`}
                              onClick={() => setMoreOpen(v => !v)}>
                        <span style={{fontSize:18,lineHeight:1}}>⋯</span>
                        <span>เพิ่มเติม</span>
                      </button>
                      {moreOpen && (
                        <div onClick={() => setMoreOpen(false)}
                             style={{position:"fixed",inset:0,zIndex:199}}/>
                      )}
                      {moreOpen && (
                        <div style={{
                          position:"absolute", top:"calc(100% + 4px)", right:0,
                          background:"var(--paper)", border:"1px solid var(--bdr)",
                          borderRadius:12, padding:"6px 4px", zIndex:200,
                          minWidth:200, boxShadow:"0 8px 24px rgba(0,0,0,.15)",
                          maxHeight:"80vh", overflowY:"auto",
                        }}>
                          {secondaryTabs.map(t => (
                            <button key={t.id}
                                    onClick={() => { handleSetTab(t.id); setMoreOpen(false); }}
                                    style={{
                                      display:"flex", alignItems:"center", gap:10,
                                      width:"100%", padding:"10px 14px",
                                      border:"none", borderRadius:8, cursor:"pointer",
                                      fontFamily:"inherit", fontSize:13, textAlign:"left",
                                      background: activeTab===t.id ? "var(--g-50)" : "transparent",
                                      color: activeTab===t.id ? "var(--g-800)" : "var(--text)",
                                      fontWeight: activeTab===t.id ? 700 : 400,
                                    }}>
                              {t.icon}
                              <span>{t.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              }
              // tabs น้อย (≤ 6) → แสดงทั้งหมดในแถบปกติ
              return visibleTabs.map(t => (
                <button key={t.id} role="tab"
                        className={`navtab${activeTab===t.id?' active':''}`}
                        onClick={() => handleSetTab(t.id)}>
                  {t.icon}<span>{t.label}</span>
                </button>
              ));
            })()}
          </div>

          <div className="nav-right">
            <span className="nav-status" title={source==="upload" ? "ใช้ข้อมูลจากไฟล์ที่อัปโหลด" : "ใช้ข้อมูลจาก Google Sheet"}>
              <span className="nav-dot" style={{background: source==="upload" ? "#a07417" : "var(--g-500)"}}></span>
              {source==="upload" ? "ไฟล์อัปโหลด" : "Sheet"} · {syncLabel}
            </span>
            <button className="btn ghost" title={syncing ? "กำลัง sync..." : "Sync ใหม่"}
                    disabled={syncing}
                    onClick={fetchFromSheet}>
              {syncing ? <span className="spin" style={{width:14,height:14,borderWidth:2}}/> : I.refresh}
            </button>
            {role === "owner" && (
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
            <div title={`${ROLE_LABELS[role]} · คลิกเพื่อออกจากระบบ`}
                 onClick={() => setConfirmAction({ type: "logout" })}
                 style={{width:32,height:32,borderRadius:"50%",
                         background:
                           role==="owner"      ? "var(--g-700)" :
                           role==="warehouse"  ? "#8a6a2f" :
                           role==="frontstore" ? "#1f6f8b" :
                           role==="saler"      ? "#705d96" :
                           "var(--g-300)",
                         color:"#fff", cursor:"pointer",
                         display:"flex",alignItems:"center",justifyContent:"center",
                         fontWeight:700,fontSize:13}}>
              {role==="owner"      ? "ด" :
               role==="warehouse"  ? "ค" :
               role==="frontstore" ? "ร" :
               role==="saler"      ? "S" : "พ"}
            </div>
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
        <div style={{background:"#fffbeb",borderBottom:"1px solid #fcd34d",
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
            handleSetTab("stockcount");
          }}
            style={{background:"#f59e0b",color:"#fff",border:"none",borderRadius:8,
                    padding:"8px 12px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
            ดูรายการ
          </button>
        </div>
      )}

      {/* ─── Sync error banner (non-blocking, only when data already loaded) ─── */}
      {error && data && (
        <div style={{
          background:"#fff3cd", color:"#856404", padding:"6px 16px",
          fontSize:12, display:"flex", alignItems:"center", justifyContent:"space-between",
          gap:8, borderBottom:"1px solid #ffc107",
        }}>
          <span>⚠️ Sync ล้มเหลว: {error}</span>
          <button className="btn ghost" style={{fontSize:12,padding:"2px 8px"}}
                  onClick={fetchFromSheet}>ลองใหม่</button>
        </div>
      )}

      {/* ─── Zort staleness banner ─── */}
      <ZortBanner data={data}/>

      {/* ─── Main ─── */}
      <main className="main" data-screen-label={activeTab}>
        {activeTab === "overview"     && <ErrorBoundary key="overview"><OverviewView data={data} range={range} setRange={setRange} role={role}/></ErrorBoundary>}
        {activeTab === "categories"   && <ErrorBoundary key="categories"><CategoryView data={data} role={role}/></ErrorBoundary>}
        {activeTab === "trends"       && <ErrorBoundary key="trends"><TrendsView data={data} role={role}/></ErrorBoundary>}
        {activeTab === "stock"        && <ErrorBoundary key="stock"><StockView data={data} role={role}/></ErrorBoundary>}
        {activeTab === "storage"      && <ErrorBoundary key="storage"><StorageView data={data}/></ErrorBoundary>}
        {activeTab === "stockcount"   && <ErrorBoundary key="stockcount"><StockCountView data={data}
                                            checkRequest={activeCheckRequest}
                                            onCheckComplete={async function(reqId){
                                              try {
                                                await fetch(SHEET_DEPLOY_URL, {method:"POST",
                                                  headers:{"Content-Type":"text/plain;charset=utf-8"},
                                                  body: JSON.stringify({completeStockCheck:true, reqId:reqId, actor:role})});
                                                setActiveCheckRequest(null);
                                                fetchFromSheet();
                                              } catch(e){ console.error("completeStockCheck:", e); }
                                            }}/></ErrorBoundary>}
        {activeTab === "frontstore"   && <ErrorBoundary key="frontstore"><FrontStoreView data={data} role={role}/></ErrorBoundary>}
        {activeTab === "transfers"    && <ErrorBoundary key="transfers"><TransferView data={data}/></ErrorBoundary>}
        {activeTab === "orders"       && <ErrorBoundary key="orders"><OrderListView data={data} role={role}/></ErrorBoundary>}
        {activeTab === "ordersummary" && <ErrorBoundary key="ordersummary"><OrderSummaryView data={data} onPrintRequest={handleOrderPrint}/></ErrorBoundary>}
        {activeTab === "mtojobs"      && <ErrorBoundary key="mtojobs"><MtoJobView data={data} /></ErrorBoundary>}
        {activeTab === "upload"       && <ErrorBoundary key="upload"><UploadView currentData={data} onDataLoaded={handleDataLoaded}/></ErrorBoundary>}
        {activeTab === "labels"       && <ErrorBoundary key="labels"><LabelPrintView data={data}
                                            initItems={labelInitItems}
                                            onInitConsumed={() => setLabelInitItems(null)}/></ErrorBoundary>}
        {activeTab === "auditlog"     && <ErrorBoundary key="auditlog"><AuditLogView/></ErrorBoundary>}
        {activeTab === "deadstock"    && <ErrorBoundary key="deadstock"><DeadStockView/></ErrorBoundary>}
        {activeTab === "connect"      && <ErrorBoundary key="connect"><ConnectView
                                    sheetUrl={sheetUrl}
                                    sheetViewUrl={sheetViewUrl}
                                    syncing={syncing}
                                    lastSync={lastSync}
                                    source={source}
                                    onSync={fetchFromSheet}
                                    onClearLocal={handleClearLocal}/></ErrorBoundary>}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
