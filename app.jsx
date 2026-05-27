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
  { id: "upload",        label: "⬆️ อัปโหลด Zort",          icon: I.upload },
  { id: "connect",       label: "🔗 Google Sheet",          icon: I.sheets },
  { id: "labels",        label: "🖨️ พิมพ์ Label",            icon: I.print },
];

// Role config
const ROLE_PASSWORDS = {
  "DMJ":   "owner",
  "1234":  "employee",     // backward-compat (legacy พนักงาน)
  "WH":    "warehouse",    // คลังสินค้า
  "FS":    "frontstore",   // หน้าร้าน
  "SALE":  "saler",        // พนักงานขาย
};
const ROLE_TABS = {
  owner:      ["overview","categories","trends","stock","storage","stockcount","frontstore","transfers","orders","ordersummary","upload","connect","labels"],
  employee:   ["categories","trends","stock","storage","frontstore","transfers","orders","ordersummary","labels"],
  warehouse:  ["categories","stock","storage","stockcount","orders","ordersummary","labels"],
  frontstore: ["categories","stock","frontstore","orders","labels"],
  saler:      ["categories","stock","orders","labels"],
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

  const profiles = [
    { role: "owner",      label: "เจ้าของ",   emoji: "👑", color: "#1f7f44", needPin: true  },
    { role: "frontstore", label: "หน้าร้าน",  emoji: "🌸", color: "#1f6f8b", needPin: false },
    { role: "warehouse",  label: "คลังสินค้า", emoji: "🏭", color: "#8a6a2f", needPin: false },
    { role: "saler",      label: "Sale",       emoji: "💼", color: "#705d96", needPin: false },
  ];

  const handleSelect = (p) => {
    if (p.needPin) {
      setPinTarget(p);
      setPin("");
      setErr(false);
    } else {
      onLogin(p.role);
    }
  };

  const handlePin = () => {
    if (pin.toUpperCase() === "DMJ") {
      onLogin(pinTarget.role);
    } else {
      setErr(true);
      setPin("");
    }
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
             onError={e => e.target.style.display='none'}/>
      </div>
      <div style={{fontSize:22, fontWeight:700, color:"var(--g-700)",
                   marginBottom:4, letterSpacing:"-.01em"}}>Doomuenjing</div>
      <div style={{fontSize:13, color:"var(--muted)", marginBottom:36}}>
        เลือกบัญชีเพื่อเข้าใช้งาน
      </div>

      {/* Profile cards */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(2, 1fr)",
        gap:16, width:"100%", maxWidth:480,
      }}>
        {profiles.map(p => (
          <button key={p.role} onClick={() => handleSelect(p)}
            style={{
              display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center",
              gap:12, padding:"28px 16px",
              background:"var(--paper)",
              border:`2px solid var(--bdr)`,
              borderRadius:20,
              cursor:"pointer", fontFamily:"inherit",
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
              border: `2px solid ${p.color}40`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:36,
            }}>{p.emoji}</div>
            <div style={{fontSize:14, fontWeight:700, color:"var(--text)"}}>
              {p.label}
            </div>
            {p.needPin && (
              <div style={{fontSize:11, color:"var(--muted)", display:"flex", alignItems:"center", gap:4}}>
                <span>🔒</span> ต้องใส่รหัส
              </div>
            )}
          </button>
        ))}
      </div>

      {/* PIN modal overlay */}
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
              <div style={{fontSize:17, fontWeight:700, color:"var(--text)"}}>
                {pinTarget.label}
              </div>
              <div style={{fontSize:12, color:"var(--muted)", marginTop:4}}>
                ใส่รหัสเพื่อเข้าใช้งาน
              </div>
            </div>
            <input
              autoFocus
              type="password"
              value={pin}
              onChange={e => { setPin(e.target.value); setErr(false); }}
              onKeyDown={e => e.key === "Enter" && handlePin()}
              placeholder="รหัสผ่าน"
              style={{
                width:"100%", padding:"12px 16px", borderRadius:12,
                border: err ? "2px solid var(--dang)" : "1.5px solid var(--bdr)",
                fontSize:16, fontFamily:"inherit", boxSizing:"border-box",
                textAlign:"center", letterSpacing:"0.2em",
                background: err ? "var(--dang-t)" : "var(--g-50)",
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
  const [tab, setTab] = usS("overview");
  const [range, setRange] = usS("year");
  const [source, setSource] = usS(localStorage.getItem(LS_SRC_KEY) || "sheet");
  const [syncing, setSyncing] = usS(false);
  const [lastSync, setLastSync] = usS(localStorage.getItem("dmj_last_sync") || null);
  const [labelInitItems, setLabelInitItems] = usS(null); // for auto-populate from order summary
  const [isOnline, setIsOnline] = usS(() => navigator.onLine);
  const [lastSaved, setLastSaved] = usS(null); // auto-save timestamp
  const [confirmAction, setConfirmAction] = usS(null); // { type:"clearLocal"|"logout" }
  const tabHistoryRef = React.useRef([]); // track tab navigation for Android back

  const sheetUrl = (typeof GOOGLE_SHEET_URL !== 'undefined') ? GOOGLE_SHEET_URL : "data.json";
  const sheetViewUrl = "https://docs.google.com/spreadsheets/d/11yL4u-XLUTCBObMppAj12nnmG0YlDZWsDn2XPCneoHQ/edit";

  const fetchFromSheet = usC(() => {
    setSyncing(true);
    setError(null);
    fetch(sheetUrl)
      .then(r => r.json())
      .then(d => {
        const enriched = enrichData(d);
        setData(enriched);
        saveToStorage(enriched, "sheet");
        setSource("sheet");
        const now = new Date().toISOString();
        localStorage.setItem("dmj_last_sync", now);
        setLastSync(now);
      })
      .catch(e => setError(e.message))
      .finally(() => setSyncing(false));
  }, [sheetUrl]);

  usE(() => {
    if (!role) return;
    const cached = loadFromStorage();
    if (cached && Array.isArray(cached.products)) {
      setData(enrichData(cached)); // แสดง cache ทันที
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

  // ── Auto-sync when on orders tab ──
  // Fetch immediately when entering orders/ordersummary, then poll every 60 s
  usE(() => {
    if (!role) return;
    const ORDER_TABS = ["orders", "ordersummary"];
    if (!ORDER_TABS.includes(tab)) return;
    if (navigator.onLine) fetchFromSheet();
    const id = setInterval(() => { if (navigator.onLine) fetchFromSheet(); }, 60000);
    return () => clearInterval(id);
  }, [tab, role]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDataLoaded = usC((newData) => {
    const enriched = enrichData(newData);
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

  if (error) {
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
        <div className="spin"></div>
        <div style={{fontSize:13,color:"var(--muted)"}}>กำลังโหลดข้อมูล Dashboard…</div>
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
            {visibleTabs.map(t => (
              <button key={t.id} role="tab"
                      className={`navtab${activeTab===t.id?' active':''}`}
                      onClick={() => handleSetTab(t.id)}>
                {t.icon}<span>{t.label}</span>
              </button>
            ))}
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

      {/* ─── Zort staleness banner ─── */}
      <ZortBanner data={data}/>

      {/* ─── Main ─── */}
      <main className="main" data-screen-label={activeTab}>
        {activeTab === "overview"     && <OverviewView data={data} range={range} setRange={setRange} role={role}/>}
        {activeTab === "categories"   && <CategoryView data={data} role={role}/>}
        {activeTab === "trends"       && <TrendsView data={data} role={role}/>}
        {activeTab === "stock"        && <StockView data={data} role={role}/>}
        {activeTab === "storage"      && <StorageView data={data}/>}
        {activeTab === "stockcount"   && <StockCountView data={data}/>}
        {activeTab === "frontstore"   && <FrontStoreView data={data} role={role}/>}
        {activeTab === "transfers"    && <TransferView data={data}/>}
        {activeTab === "orders"       && <OrderListView data={data} role={role}/>}
        {activeTab === "ordersummary" && <OrderSummaryView data={data} onPrintRequest={handleOrderPrint}/>}
        {activeTab === "upload"       && <UploadView currentData={data} onDataLoaded={handleDataLoaded}/>}
        {activeTab === "labels"       && <LabelPrintView data={data}
                                            initItems={labelInitItems}
                                            onInitConsumed={() => setLabelInitItems(null)}/>}
        {activeTab === "connect"    && <ConnectView
                                    sheetUrl={sheetUrl}
                                    sheetViewUrl={sheetViewUrl}
                                    syncing={syncing}
                                    lastSync={lastSync}
                                    source={source}
                                    onSync={fetchFromSheet}
                                    onClearLocal={handleClearLocal}/>}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
