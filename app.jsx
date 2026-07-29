// Main App — routing + data load
const { useState: usS, useEffect: usE, useCallback: usC } = React;

const TABS = [
  { id: "overview",      label: "📊 ภาพรวม",               icon: I.dashboard },
  { id: "whhome",        label: "🏭 งานคลัง",              icon: I.dashboard },
  { id: "categories",    label: "🛍️ สินค้า & สั่ง",         icon: I.layers },
  { id: "trends",        label: "📈 เทรนด์",               icon: I.flame },
  { id: "stock",         label: "⚠️ สต๊อก & แจ้งเตือน",    icon: I.alert },
  { id: "storage",       label: "🗺️ ตำแหน่งคลัง",           icon: I.warehouse },
  { id: "stockcount",    label: "📊 นับ stock คลัง",         icon: I.alert },
  { id: "newproduct",    label: "➕ เพิ่มสินค้าใหม่",         icon: I.plus },
  { id: "frontstore",    label: "🏪 เช็คหน้าร้าน",           icon: I.store },
  { id: "transfers",     label: "🔄 โอน/ปรับ/ยกมา",        icon: I.arrowR },
  { id: "orders",        label: "📋 รายการสั่งของ",         icon: I.cart },
  { id: "tracking",      label: "📡 ติดตามสถานะ",           icon: I.arrowR },
  { id: "ordersummary",  label: "📦 สรุปสินค้าออกจากคลัง",  icon: I.store },
  { id: "mtojobs",       label: "🎁 งานจัดพิเศษ",            icon: I.package },
  { id: "upload",        label: "⬆️ อัปโหลด Zort",          icon: I.upload },
  { id: "connect",       label: "🔗 Google Sheet",          icon: I.sheets },
  { id: "labels",        label: "🖨️ พิมพ์ Label",            icon: I.print },
  { id: "auditlog",      label: "📋 Audit Log",             icon: I.layers },
  { id: "staff",         label: "👥 พนักงาน",               icon: I.layers },
  { id: "attendance",    label: "⏱️ ลงเวลา",                icon: I.layers },
  { id: "atttoday",      label: "🕐 ใครเข้างานวันนี้",       icon: I.layers },
  { id: "deadstock",     label: "📦 สินค้าจม",              icon: I.alert },
  { id: "quotefollowup", label: "📄 ใบเสนอราคา",             icon: I.cart },
  { id: "pos",           label: "🧾 ขาย/ออกบิล",             icon: I.cart },
  { id: "customers",     label: "👥 ลูกค้า & ยอดซื้อ",        icon: I.store },
  { id: "margin",        label: "💰 กำไรขั้นต้น",             icon: I.flame },
  { id: "season",        label: "🌸 ช่วงขายดี",              icon: I.flame },
];

// Role config
const ROLE_TABS = {
  // dev = ตำแหน่งสำหรับผู้ดูแลระบบ/คนพัฒนา — เห็นทุกแท็บที่มีในระบบ รวมแท็บที่ยังซ่อนจาก owner
  // ("margin" ยังไม่มีต้นทุนซื้อจริง จึงไม่โชว์ให้ owner แต่ dev ต้องเข้าไปดู/ทดสอบได้)
  // สิทธิ์ฝั่ง GAS เทียบเท่า owner (ดู isAdminRole_ ใน appsscript_complete.gs)
  dev:        ["attendance","overview","customers","pos","quotefollowup","categories","stock","orders","tracking","frontstore","ordersummary","transfers","storage","stockcount","newproduct","deadstock","trends","season","margin","mtojobs","labels","upload","connect","auditlog","staff","atttoday","whhome"],
  // เรียงตามที่ owner ใช้บ่อย: ภาพรวม/ลูกค้า → งานประจำวัน (สั่ง/สต๊อก/ออเดอร์/หน้าร้าน) → คลัง → วิเคราะห์ → เครื่องมือ/ตั้งค่าท้ายสุด
  // ("margin" ซ่อนไว้ก่อน — ยังไม่มีต้นทุนซื้อจริง · โค้ด MarginView คงไว้ ค่อยเพิ่ม id กลับเมื่อพร้อม)
  owner:      ["attendance","overview","customers","pos","quotefollowup","categories","stock","orders","tracking","frontstore","ordersummary","transfers","storage","stockcount","newproduct","deadstock","trends","season","mtojobs","labels","upload","connect","auditlog","staff","atttoday"],
  employee:   ["attendance","categories","trends","stock","storage","frontstore","transfers","orders","tracking","ordersummary","mtojobs","labels"],
  // 5 ตัวแรก = แถบหลัก (>9 แท็บ → ที่เหลือเข้า "เพิ่มเติม") จัดให้เป็นงานคลังที่ใช้บ่อยสุด
  warehouse:  ["attendance","whhome","orders","stock","stockcount","storage","categories","newproduct","ordersummary","tracking","mtojobs","labels"],
  frontstore: ["attendance","categories","stock","frontstore","orders","tracking","mtojobs","labels"],
  saler:      ["attendance","pos","categories","stock","orders","tracking","quotefollowup","mtojobs","labels"],
};
// หมวดหลักของ owner (nav 2 ชั้น) — กดหมวด → เห็นเมนูย่อยของหมวดนั้น
// เรียงตามความสำคัญ/ที่ใช้บ่อย: ภาพรวม → การขาย → สต็อก → วิเคราะห์ → เครื่องมือ
// tab ที่ไม่อยู่ในกลุ่มไหน จะถูกดันเข้ากลุ่ม "อื่นๆ" อัตโนมัติ (กัน tab หาย)
const OWNER_GROUPS = [
  { id: "g_overview", gi: "📊", name: "ภาพรวม",       tabs: ["overview", "whhome"] },
  { id: "g_sales",    gi: "💰", name: "การขาย",       tabs: ["pos", "orders", "tracking", "quotefollowup", "customers", "frontstore", "mtojobs"] },
  { id: "g_stock",    gi: "📦", name: "สต็อก & คลัง",  tabs: ["stock", "categories", "storage", "stockcount", "transfers", "ordersummary", "newproduct", "deadstock", "labels"] },
  { id: "g_insight",  gi: "📈", name: "วิเคราะห์",      tabs: ["trends", "season", "margin"] },
  { id: "g_people",   gi: "👥", name: "พนักงาน",       tabs: ["attendance", "atttoday", "staff"] },
  { id: "g_tools",    gi: "⚙️", name: "เครื่องมือ",     tabs: ["upload", "connect", "auditlog"] },
];
// "โหมดง่าย" — เมนูที่ใช้ประจำวัน (เหลือไว้บนแถบหลัก) ที่เหลือดันเข้า "เพิ่มเติม"
const SIMPLE_PRIMARY = ["categories", "stock", "frontstore", "orders"];

const ROLE_LABELS = {
  owner:      "👑 เจ้าของ",
  employee:   "👤 พนักงาน",
  warehouse:  "🏭 คลังสินค้า",
  frontstore: "🏪 หน้าร้าน",
  saler:      "💼 พนักงานขาย",
  dev:        "🛠️ DEV",
};

// หน้าล็อกอินหลัก — ปุ่ม LINE ใหญ่ (ไม่ต้องพิมพ์อะไร) + ลิงก์เล็ก "รหัสสำรอง" สำหรับช่วงเปลี่ยนผ่าน
function LoginScreen({ onLineLogin, onLegacyLogin, lineError, lineChannelId }) {
  const [showLegacy, setShowLegacy] = usS(false);
  const [showDiag, setShowDiag] = usS(false);

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
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  }, [lineChannelId]);

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
      ua: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 90),
    };
  })();

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
        เข้าสู่ระบบเพื่อใช้งาน
      </div>

      {authBase ? (
        // ลิงก์จริง — แตะแล้วเบราว์เซอร์ navigate ทันทีในจังหวะเดียวกับการแตะ
        // จึงเปิดแอป LINE ได้ (universal link ต้องการ user gesture ที่ยังไม่ขาดตอน)
        <a href={authBase.url}
           onClick={() => saveLineHandshake(authBase.state, authBase.redirectUri)}
           style={{
             display:"flex", alignItems:"center", justifyContent:"center", gap:10,
             width:"100%", maxWidth:320, padding:"16px 20px", boxSizing:"border-box",
             background:"#06C755", color:"#fff", border:"none", borderRadius:14,
             fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
             textDecoration:"none",
             boxShadow:"0 6px 18px rgba(6,199,85,.3)",
           }}>
          <span style={{fontSize:20}}>💬</span> เข้าสู่ระบบด้วย LINE
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
          <span style={{fontSize:20}}>💬</span> เข้าสู่ระบบด้วย LINE
        </button>
      )}

      {lineError && (
        <div style={{color:"var(--dang)", fontSize:12, marginTop:12, textAlign:"center", maxWidth:300}}>
          ⚠️ {lineError}
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
           onClick={() => saveLineHandshake(authBase.state, authBase.redirectUri)}
           style={{
             marginTop:14, display:"block", width:"100%", maxWidth:320, padding:"11px 16px",
             boxSizing:"border-box", textAlign:"center", textDecoration:"none",
             background:"var(--paper)", color:"var(--g-700)", border:"1.5px solid var(--g-300)",
             borderRadius:12, fontSize:13.5, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
           }}>🌐 เข้าสู่ระบบโดยไม่เปิดแอป LINE</a>
      ) : (
        <button onClick={() => onLineLogin(true)} style={{
          marginTop:14, width:"100%", maxWidth:320, padding:"11px 16px",
          background:"var(--paper)", color:"var(--g-700)", border:"1.5px solid var(--g-300)",
          borderRadius:12, fontSize:13.5, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
        }}>🌐 เข้าสู่ระบบโดยไม่เปิดแอป LINE</button>
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
          <div>ปุ่ม LINE พร้อม (channelId): {lineChannelId ? "ใช่ ✅" : "ยังไม่โหลด ⏳"}</div>
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
    // ยิงขอข้อมูลตั้งแต่กดเลือกตำแหน่ง (ไม่ต้องรอ PIN/onLogin) — payload ไม่ผูกกับ role
    // ให้เวลา GAS ซ้อนทับกับเวลาที่ผู้ใช้พิมพ์/ยืนยัน PIN แทนที่จะเริ่มนับหลัง login เสร็จ
    try { if (typeof window !== 'undefined' && window._prefetchData) window._prefetchData(); } catch (e) {}
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
  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function App() {
  // ── ALL hooks first (no early returns before this block) ──
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
  const [authRefreshing, setAuthRefreshing] = usS(false);
  const [data, setData] = usS(null);
  const [error, setError] = usS(null);
  const [navLogoOk, setNavLogoOk] = usS(true);
  const [tab, setTab] = usS(() => ssGet("dmj_role") === "owner" ? "categories" : "overview");
  const [range, setRange] = usS("year");
  const [source, setSource] = usS(lsGet(LS_SRC_KEY) || "sheet");
  const [syncing, setSyncing] = usS(false);
  const [zortSyncing, setZortSyncing] = usS(false);
  const [zortSalesSyncing, setZortSalesSyncing] = usS(false);
  const [retryMsg, setRetryMsg] = usS("");
  const [lastSync, setLastSync] = usS(lsGet("dmj_last_sync") || null);
  const [labelInitItems, setLabelInitItems] = usS(null); // for auto-populate from order summary
  const [isOnline, setIsOnline] = usS(() => navigator.onLine);
  const [lastSaved, setLastSaved] = usS(null); // auto-save timestamp
  const [confirmAction, setConfirmAction] = usS(null); // { type:"clearLocal"|"logout" }
  const [moreOpen, setMoreOpen] = usS(false); // dropdown "เพิ่มเติม" บน navtabs (owner)
  const [ownerGroup, setOwnerGroup] = usS(null); // หมวดหลักที่ owner "แตะดู" อยู่ (null = ตามหมวดของ tab ปัจจุบัน)
  const [simpleMode, setSimpleMode] = usS(() => lsGet("dmj_simple_mode") === "1"); // โหมดง่าย: ลดเมนู
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
  const fetchFromSheet = usC((retryLeft) => {
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
    const bustUrl = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + '_t=' + Date.now() + '&fresh=1';
    // ใช้ผลที่เริ่มโหลดไว้ตั้งแต่ต้นหน้า (script ใน <head> ของ HTML) — ตัดเวลา GAS
    // ออกจากคิว เพราะมันเดินขนานไปกับการ compile JSX แล้ว · ใช้ได้ครั้งเดียว
    // (เฉพาะ attempt แรก) การ refetch/retry ทุกครั้งหลังจากนี้ยิงใหม่เสมอ = ได้ข้อมูลสด
    let prefetched = null;
    if (retryLeft === 3 && typeof window !== 'undefined' && window._dataPrefetch) {
      prefetched = window._dataPrefetch;
      window._dataPrefetch = null;
    }
    (prefetched
      ? prefetched.then(d => d || fetch(bustUrl, { signal: controller.signal }).then(r => r.json()))
      : fetch(bustUrl, { signal: controller.signal }).then(r => r.json()))
      .then(d => {
        if (d && d.lastModified) window._dataLoadedAt = d.lastModified;
        if (typeof resetCatColorMap === 'function') resetCatColorMap();
        let enriched;
        try { enriched = enrichData(d); } catch (e) {
          console.warn("enrichData failed during fetchFromSheet:", e);
          enriched = d;
        }
        setRetryMsg("");
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
          const delay = retryLeft === 3 ? 800 : retryLeft === 2 ? 2000 : 4000;
          const attempt = 4 - retryLeft; // 1, 2, 3
          setRetryMsg(`เชื่อมต่อช้า กำลังลองใหม่ครั้งที่ ${attempt}…`);
          setTimeout(() => fetchFromSheet(retryLeft - 1), delay);
          return;
        }
        setRetryMsg("");
        if (e.name === "AbortError") setError("เซิร์ฟเวอร์ตอบช้า — กรุณาลองใหม่อีกครั้ง [timeout]");
        else setError(`${e.name}: ${e.message}`);
        setSyncing(false);
      })
      .finally(() => { fetchingRef.current = false; clearTimeout(timeout); if (!controller.signal.aborted) setSyncing(false); });
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

  // expose refetch ให้ child component เรียกได้เมื่อเจอ conflict (จะอัปเดต window._dataLoadedAt ให้สด)
  usE(() => { window._dmjRefetch = fetchFromSheet; return () => { delete window._dmjRefetch; }; }, [fetchFromSheet]);

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
  // ดึง payload ทั้งก้อนทุก 30 วิ (อัปเดตเลขคลังอ้างอิง) — จำนวนที่ผู้ใช้พิมพ์เก็บใน local state
  // (checkedQtys) แยกต่างหาก จึงไม่ถูกทับ ส่วน window._dataLoadedAt จะอัปเดตให้สด กัน false conflict
  usE(() => {
    if (!role) return;
    const LIVE_TABS = ["stockcount", "frontstore"];
    if (!LIVE_TABS.includes(tab)) return;
    const id = setInterval(() => { if (navigator.onLine) fetchFromSheet(); }, 30000);
    return () => clearInterval(id);
  }, [tab, role, fetchFromSheet]);

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

  // ตั้ง state+session จาก staff object ที่ได้จาก authLine/me — ใช้ร่วมกันทั้ง 2 flow
  const applyStaffSession = usC((s) => {
    setStaff(s);
    if (typeof window !== 'undefined') {
      window._currentUser = (s.name || "ไม่ระบุ") + " (" + (ROLE_TH_PLAIN[s.role] || s.role || "รอตำแหน่ง") + ")";
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
  }, []);

  // เช็คสถานะ session ปัจจุบัน (ใช้ทั้งตอนเปิดแอปครั้งแรก และปุ่ม "เช็คอีกครั้ง" ในหน้ารออนุมัติ)
  const checkMe = usC(async () => {
    const tok = lsGet(SESSION_TOKEN_KEY);
    if (!tok) { setAuthPhase("needLogin"); return; }
    setAuthRefreshing(true);
    try {
      const d = await postAuthAction({ action: "me", sessionToken: tok });
      if (d && d.ok) applyStaffSession(d.staff);
      else { lsDel(SESSION_TOKEN_KEY); setAuthPhase("needLogin"); }
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
      const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const redirectUri = lineRedirectUri();
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
  }, []);

  const logoutClearSession = usC(() => {
    const tok = lsGet(SESSION_TOKEN_KEY);
    if (tok) { postAuthAction({ action: "logout", sessionToken: tok }).catch(() => {}); }
    lsDel(SESSION_TOKEN_KEY);
    clearLineHandshake();
    ssDel("dmj_role");
    if (typeof window !== 'undefined') window._currentUser = null;
    setStaff(null);
    setRole(null);
    setAuthPhase("needLogin");
  }, []);

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
          const d = await postAuthAction({ action: "authLine", code, redirectUri });
          if (cancelled) return;
          if (d && d.ok) {
            // localStorage เขียนไม่ได้ (iOS Private Browsing / บล็อกที่เก็บข้อมูล) → session token หาย
            // ทันทีที่รีเฟรช · ยังให้ใช้งานรอบนี้ต่อได้ แต่ต้องบอกผู้ใช้ว่าทำไมต้องล็อกอินใหม่
            if (!lsSet(SESSION_TOKEN_KEY, d.sessionToken)) {
              setLineError("เข้าสู่ระบบได้ แต่เครื่องนี้บันทึกข้อมูลไม่ได้ (โหมดไม่ระบุตัวตน?) — เปิดใหม่ต้องล็อกอินอีกครั้ง");
            }
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
        else { lsDel(SESSION_TOKEN_KEY); setAuthPhase(role ? "ready" : "needLogin"); }
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

  if (authPhase === "pending") {
    return <PendingScreen staff={staff} onRefresh={checkMe} refreshing={authRefreshing} onSwitchAccount={logoutClearSession}/>;
  }

  if (authPhase === "disabled") {
    return <DisabledScreen onSwitchAccount={logoutClearSession}/>;
  }

  if (!role) {
    return <LoginScreen
      onLineLogin={startLineLogin}
      lineChannelId={lineChannelId}
      lineError={lineError}
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
  const activeTab = allowedTabIds.includes(tab) ? tab : (allowedTabIds[0] || "categories");

  const toggleSimpleMode = () => setSimpleMode(v => {
    const next = !v;
    try { localStorage.setItem("dmj_simple_mode", next ? "1" : "0"); } catch (e) {}
    return next;
  });

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
            <div style={{fontSize:14,color:"#c62828",marginBottom:12,textAlign:"center",padding:"0 24px"}}>{error}</div>
            {error.includes("timeout") && (
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:16,textAlign:"center",padding:"0 28px",lineHeight:1.6}}>
                ลอง: ปิด VPN · ปิด Content Blocker ใน Safari · ปิด iCloud Private Relay · หรือเปลี่ยนมาใช้ 4G/5G
              </div>
            )}
            <button className="btn" onClick={()=>fetchFromSheet()} style={{minHeight:44,padding:"0 24px"}}>🔄 ลองใหม่</button>
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
  }

  const syncLabel = (() => {
    if (!lastSync) return "ยังไม่ sync";
    const dt = new Date(lastSync);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  })();

  // ── ตัวเลขเตือนบนหมวด owner (จาก payload ที่เชื่อถือได้) ──
  const pendingOrders = (data.orders || []).filter(o => o.status === "รอ").length;    // ออเดอร์ค้าง (status "รอ")
  const pendingRecv   = (data.shipments || []).filter(s => !s.receivedAt).length;      // ของโอนแล้วรอรับ

  // จัดกลุ่ม owner: map tab id → {label, icon} จริง + ดัน tab ที่ไม่เข้ากลุ่มไหนเข้า "อื่นๆ"
  const ownerNav = (() => {
    if (!isAdminRole(role)) return null;
    const allowed = new Set(allowedTabIds);
    const groups = OWNER_GROUPS
      .map(g => ({ ...g, items: g.tabs.filter(id => allowed.has(id)).map(id => TABS.find(t => t.id === id)).filter(Boolean) }))
      .filter(g => g.items.length > 0);
    const grouped = new Set(groups.flatMap(g => g.items.map(t => t.id)));
    const leftover = allowedTabIds.filter(id => !grouped.has(id)).map(id => TABS.find(t => t.id === id)).filter(Boolean);
    if (leftover.length) groups.push({ id: "g_other", gi: "🗂️", name: "อื่นๆ", items: leftover });
    // หมวดที่กำลังแสดง: ที่ "แตะดู" ไว้ ▸ ไม่งั้นหมวดที่มี tab ปัจจุบัน ▸ ไม่งั้นหมวดแรก
    const groupOfTab = groups.find(g => g.items.some(t => t.id === activeTab));
    const displayId  = (ownerGroup && groups.some(g => g.id === ownerGroup)) ? ownerGroup
                     : (groupOfTab ? groupOfTab.id : groups[0].id);
    const badgeFor = id => id === "g_sales" ? pendingOrders : id === "g_stock" ? pendingRecv : 0;
    const subBadgeFor = id => id === "orders" ? pendingOrders : id === "transfers" ? pendingRecv : 0;
    return { groups, displayId, badgeFor, subBadgeFor };
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
                            {t.icon}<span>{t.label}</span>
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
                        {t.icon}<span>{t.label}</span>
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
                        <span>เพิ่มเติม</span>
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
                            <div style={{fontSize:13,fontWeight:700,color:"var(--muted)"}}>เมนูเพิ่มเติม</div>
                          </div>
                          {/* โหมดง่าย toggle — อยู่บนสุดให้เจอง่าย */}
                          <div style={{padding:"0 12px 8px", flexShrink:0}}>
                            <button onClick={toggleSimpleMode}
                                    style={{
                                      width:"100%", minHeight:52,
                                      display:"flex", alignItems:"center", gap:12,
                                      padding:"10px 14px", borderRadius:14, cursor:"pointer",
                                      fontFamily:"inherit", textAlign:"left",
                                      border: simpleMode ? "2px solid var(--g-500)" : "1.5px solid var(--bdr)",
                                      background: simpleMode ? "var(--g-50)" : "var(--paper)",
                                    }}>
                              <span style={{fontSize:22,lineHeight:1}}>{simpleMode ? "😊" : "🧩"}</span>
                              <span style={{flex:1, minWidth:0}}>
                                <span style={{display:"block", fontSize:14, fontWeight:700,
                                              color: simpleMode ? "var(--g-700)" : "var(--text)"}}>
                                  โหมดง่าย {simpleMode ? "(เปิดอยู่ — กดเพื่อปิด)" : "(ปิดอยู่ — กดเพื่อเปิด)"}
                                </span>
                                <span style={{display:"block", fontSize:11, color:"var(--muted)", lineHeight:1.4}}>
                                  แสดงเฉพาะเมนูที่ใช้บ่อย กดง่ายขึ้น
                                </span>
                              </span>
                              <span style={{
                                width:46, height:28, borderRadius:14, flexShrink:0, position:"relative",
                                background: simpleMode ? "var(--g-500)" : "var(--bdr)",
                                transition:"background .15s",
                              }}>
                                <span style={{
                                  position:"absolute", top:3, left: simpleMode ? 21 : 3,
                                  width:22, height:22, borderRadius:"50%", background:"#fff",
                                  transition:"left .15s", boxShadow:"0 1px 3px rgba(0,0,0,.2)",
                                }}/>
                              </span>
                            </button>
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
                                  <span style={{lineHeight:1.3}}>{t.label}</span>
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
                  {t.icon}<span>{t.label}</span>
                </button>
              ));
            })()}
          </div>

          <div className="nav-right">
            {/* ปุ่มปิดโหมดง่าย — โชว์เฉพาะตอน simpleMode เปิดอยู่ กดปิดได้ตลอดไม่ต้องเข้า bottom sheet */}
            {simpleMode && (
              <button onClick={toggleSimpleMode} title="ปิดโหมดง่าย"
                style={{
                  display:"flex", alignItems:"center", gap:4,
                  padding:"4px 10px", borderRadius:20, border:"1.5px solid var(--g-400)",
                  background:"var(--g-50)", color:"var(--g-700)",
                  fontFamily:"inherit", fontSize:12, fontWeight:700, cursor:"pointer",
                  minHeight:32,
                }}>
                😊 <span style={{lineHeight:1}}>ปิดโหมดง่าย</span>
              </button>
            )}
            <span className="nav-status" title={source==="upload" ? "ใช้ข้อมูลจากไฟล์ที่อัปโหลด" : "ใช้ข้อมูลจาก Google Sheet"}>
              <span className="nav-dot" style={{background: source==="upload" ? "#a07417" : "var(--g-500)"}}></span>
              {source==="upload" ? "ไฟล์อัปโหลด" : "Sheet"} · {syncLabel}
            </span>
            <button className="btn ghost" title={syncing ? "กำลัง sync..." : "Sync ใหม่"}
                    disabled={syncing}
                    onClick={fetchFromSheet}>
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

      {/* ─── Sync error banner (non-blocking, only when data already loaded) ─── */}
      {error && data && (
        <div className="no-print" style={{
          background:"#fff3cd", color:"#856404", padding:"6px 16px",
          fontSize:12, display:"flex", alignItems:"center", justifyContent:"space-between",
          gap:8, borderBottom:"1px solid #ffc107",
        }}>
          <span>⚠️ Sync ล้มเหลว: {error}</span>
          <button className="btn ghost" style={{fontSize:12,padding:"2px 8px"}}
                  onClick={fetchFromSheet}>ลองใหม่</button>
        </div>
      )}


      {/* ─── Main ─── */}
      <main className="main" data-screen-label={activeTab}>
        {activeTab === "overview"     && <ErrorBoundary key="overview"><OverviewView data={data} range={range} setRange={setRange} role={viewRole}/></ErrorBoundary>}
        {activeTab === "whhome"       && <ErrorBoundary key="whhome"><WarehouseHomeView data={data} onNav={handleSetTab}/></ErrorBoundary>}
        {activeTab === "categories"   && <ErrorBoundary key="categories"><CategoryView data={data} role={viewRole}/></ErrorBoundary>}
        {activeTab === "trends"       && <ErrorBoundary key="trends"><TrendsView data={data} role={viewRole}/></ErrorBoundary>}
        {activeTab === "stock"        && <ErrorBoundary key="stock"><StockView data={data} role={viewRole}/></ErrorBoundary>}
        {activeTab === "newproduct"   && <ErrorBoundary key="newproduct"><AddProductView data={data} role={viewRole} onAdded={fetchFromSheet}/></ErrorBoundary>}
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
        {activeTab === "attendance"   && <ErrorBoundary key="attendance"><AttendanceView role={viewRole}/></ErrorBoundary>}
        {activeTab === "atttoday"     && <ErrorBoundary key="atttoday"><AttendanceTodayView/></ErrorBoundary>}
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
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
