// views.jsx v20260521-fix4
// Tab views — Overview, Categories, Stock, Upload, Connect
const { useState: uS, useEffect: uE, useMemo: uM, useCallback: uC } = React;

// ─────────────────────────────────────────────────────────────────────
// ERROR BOUNDARY — ป้องกัน white screen เมื่อ View component throw
// ต้องเป็น class component (React error boundary API ไม่รองรับ hooks)
// ─────────────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err) {
    return { error: err };
  }
  componentDidCatch(err, info) {
    console.error('[ErrorBoundary]', err, info && info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:"24px 16px",textAlign:"center",fontFamily:"inherit"}}>
          <div style={{fontSize:48,marginBottom:12}}>😵</div>
          <div style={{fontSize:18,fontWeight:700,color:"#dc2626",marginBottom:8}}>เกิดข้อผิดพลาด</div>
          <div style={{fontSize:14,color:"#6b7280",marginBottom:20,whiteSpace:"pre-wrap",wordBreak:"break-word",maxWidth:320,margin:"0 auto 20px"}}>
            {this.state.error.message || String(this.state.error)}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{padding:"10px 24px",background:"#2563eb",color:"#fff",border:"none",borderRadius:8,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>
            โหลดใหม่
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

async function ensureXlsx() {
  if (window.XLSX) return;
  await new Promise(function (res, rej) {
    var s = document.createElement('script');
    s.src = 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ── Android back-button handler ──────────────────────────────────────────────
// Global LIFO stack — each modal/step pushes a handler on open, pops on close.
// Single popstate listener fires the top handler (most recently opened thing).
(function(){
  if (window.__dmjBackStack) return; // already initialised
  window.__dmjBackStack = [];
  window.addEventListener('popstate', function() {
    var stack = window.__dmjBackStack;
    if (stack.length > 0) {
      stack[stack.length - 1](); // call top handler
      history.pushState({ _dmj: 1 }, ''); // re-push so next back is also caught
    }
  });
})();

// Hook: register a back handler for the lifetime of the component (or while onBack != null).
// Pass null to temporarily deregister (e.g. modal is closed but component stays mounted).
function useBackHandler(onBack) {
  var ref = React.useRef(onBack);
  React.useEffect(function(){ ref.current = onBack; }); // always keep ref fresh
  React.useEffect(function(){
    if (!onBack || !window.__dmjBackStack) return;
    var h = function(){ ref.current && ref.current(); };
    window.__dmjBackStack.push(h);
    history.pushState({ _dmj: 1 }, '');
    return function(){                              // cleanup: pop this handler
      var i = window.__dmjBackStack.lastIndexOf(h);
      if (i >= 0) window.__dmjBackStack.splice(i, 1);
    };
  }, [!!onBack]); // re-run only when active/inactive state changes
}
const { ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
        XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } = window.Recharts;

// ─────────────────────────────────────────────────────────────────────
// ONLINE STATUS HOOK — ติดตาม navigator.onLine แบบ reactive
// คืน true ถ้ามีเน็ต, false ถ้าออฟไลน์
// ─────────────────────────────────────────────────────────────────────
function useOnlineStatus() {
  const [online, setOnline] = uS(() => navigator.onLine);
  uE(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online",  on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

// ─────────────────────────────────────────────────────────────────────
// VISUAL CONFIRM MODAL (replaces native confirm() — readable without Thai)
// ─────────────────────────────────────────────────────────────────────
function ConfirmModal({ open, type="warn", emoji, title, detail, confirmLabel="ยืนยัน", cancelLabel="ยกเลิก", onConfirm, onCancel }) {
  useBackHandler(open ? onCancel : null); // Android back = ยกเลิก
  if (!open) return null;
  const colors = {
    warn:    { bg:"#fff8e1", accent:"#a07417", btn:"#f59e0b", emoji:emoji || "⚠️" },
    danger:  { bg:"#ffebee", accent:"#c62828", btn:"#c62828", emoji:emoji || "🗑️" },
    success: { bg:"#e8f5e9", accent:"#1b5e20", btn:"#1b5e20", emoji:emoji || "✅" },
    ship:    { bg:"#e3f2fd", accent:"#0d47a1", btn:"#1565c0", emoji:emoji || "📦" },
  };
  const c = colors[type] || colors.warn;
  return (
    <div onClick={onCancel} style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:2000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:16,
      backdropFilter:"blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"#fff", borderRadius:18, maxWidth:380, width:"100%",
        overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,.3)",
      }}>
        {/* Big emoji header */}
        <div style={{
          background:c.bg, padding:"24px 20px 18px", textAlign:"center",
          borderBottom:`3px solid ${c.accent}33`,
        }}>
          <div style={{fontSize:56, lineHeight:1, marginBottom:6}}>{c.emoji}</div>
          {title && <div style={{fontSize:16, fontWeight:700, color:c.accent}}>{title}</div>}
        </div>
        {/* Detail (numbers/SKU prominent) */}
        {detail && (
          <div style={{padding:"18px 20px", textAlign:"center", fontSize:14,
                       color:"var(--g-800)", lineHeight:1.5, whiteSpace:"pre-line"}}>
            {detail}
          </div>
        )}
        {/* Buttons — large, full-width */}
        <div style={{display:"flex", gap:8, padding:"0 16px 16px"}}>
          <button onClick={onCancel} style={{
            flex:1, padding:"16px", borderRadius:12, border:"none",
            background:"var(--g-100)", color:"var(--g-700)",
            fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
            minHeight:56,
          }}>❌ {cancelLabel}</button>
          <button onClick={onConfirm} style={{
            flex:1, padding:"16px", borderRadius:12, border:"none",
            background:c.btn, color:"#fff",
            fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
            minHeight:56,
          }}>✅ {confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TOAST (replaces native alert() — emoji + color, auto-dismiss)
// ─────────────────────────────────────────────────────────────────────
function Toast({ toast, onClose }) {
  uE(() => {
    if (!toast) return;
    const t = setTimeout(onClose, toast.duration || 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  const styles = {
    error:   { bg:"#ffebee", border:"#c62828", color:"#c62828", emoji:"❌" },
    warn:    { bg:"#fff8e1", border:"#f59e0b", color:"#a07417", emoji:"⚠️" },
    success: { bg:"#e8f5e9", border:"#1b5e20", color:"#1b5e20", emoji:"✅" },
    info:    { bg:"#e3f2fd", border:"#1565c0", color:"#0d47a1", emoji:"ℹ️" },
  };
  const s = styles[toast.type] || styles.info;
  return (
    <div onClick={onClose} style={{
      position:"fixed", top:20, left:"50%", transform:"translateX(-50%)",
      zIndex:3000, background:s.bg, border:`2px solid ${s.border}`,
      borderRadius:14, padding:"14px 20px", display:"flex", alignItems:"center",
      gap:12, minWidth:200, maxWidth:"calc(100vw - 32px)", cursor:"pointer",
      boxShadow:"0 8px 24px rgba(0,0,0,.18)", animation:"toastIn .25s ease",
    }}>
      <span style={{fontSize:28, lineHeight:1}}>{toast.emoji || s.emoji}</span>
      <span style={{fontSize:15, fontWeight:700, color:s.color, lineHeight:1.3}}>
        {toast.message}
      </span>
      <style>{`@keyframes toastIn { from {opacity:0; transform:translate(-50%, -12px)} to {opacity:1; transform:translate(-50%, 0)} }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Pagination — ปุ่ม ← หน้า X/Y → สำหรับ list ยาว
// ─────────────────────────────────────────────────────────────────────
function Pagination({ page, total, pageSize, onChange, listRef }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const go = p => {
    onChange(p);
    if (listRef && listRef.current) listRef.current.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  return (
    <div style={{display:'flex',gap:8,justifyContent:'center',alignItems:'center',padding:'16px 0'}}>
      <button onClick={()=>go(page-1)} disabled={page<=1}
              style={{minHeight:44,padding:'0 16px',borderRadius:8,border:'1px solid #ddd',
                      background:page<=1?'#f5f5f5':'#fff',cursor:page<=1?'default':'pointer',
                      fontFamily:'inherit',fontSize:14}}>←</button>
      <span style={{padding:'0 8px',fontSize:14,color:'#666'}}>หน้า {page} / {totalPages}</span>
      <button onClick={()=>go(page+1)} disabled={page>=totalPages}
              style={{minHeight:44,padding:'0 16px',borderRadius:8,border:'1px solid #ddd',
                      background:page>=totalPages?'#f5f5f5':'#fff',cursor:page>=totalPages?'default':'pointer',
                      fontFamily:'inherit',fontSize:14}}>→</button>
    </div>
  );
}

// Hook for using toast — returns [toast, showToast, hideToast]
function useToast() {
  const [toast, setToast] = uS(null);
  const showToast = uC((type, message, emoji, duration) => {
    setToast({ type, message, emoji, duration });
  }, []);
  const hideToast = uC(() => setToast(null), []);
  return [toast, showToast, hideToast];
}

// ─────────────────────────────────────────────────────────────────────
// SKELETON — shimmer placeholder card for loading states
// ─────────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{background:"#fff",border:"1.5px solid var(--bdr)",borderRadius:12,padding:12,
                 display:"flex",flexDirection:"column",gap:10}}>
      <div className="skel" style={{width:"100%",aspectRatio:"4/3",borderRadius:10}}/>
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        <div className="skel" style={{height:10,width:"40%"}}/>
        <div className="skel" style={{height:13,width:"80%"}}/>
        <div className="skel" style={{height:11,width:"55%"}}/>
      </div>
      <div style={{display:"flex",gap:6}}>
        <div className="skel" style={{flex:1,height:40,borderRadius:8}}/>
        <div className="skel" style={{flex:1,height:40,borderRadius:8}}/>
      </div>
      <div className="skel" style={{height:48,borderRadius:9}}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Analytics helpers (shared by Overview deep-dive cards)
// ─────────────────────────────────────────────────────────────────────

// % change badge with arrow — green up / red down / grey new
function DeltaBadge({ pct, isNew }) {
  if (isNew) {
    return <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:11,fontWeight:700,
                          padding:"2px 7px",borderRadius:20,background:"#eef4ff",color:"#2563eb"}}>ใหม่</span>;
  }
  if (pct == null) return <span style={{fontSize:11,color:"var(--light)"}}>—</span>;
  const up = pct >= 0;
  const c  = up ? "#1f7f44" : "#c0392b";
  const bg = up ? "#eaf6ee" : "#fcecec";
  const arrow = up ? "▲" : "▼";
  const shown = Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)*100) : (Math.abs(pct)*100).toFixed(0);
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:11,fontWeight:700,
                  padding:"2px 7px",borderRadius:20,background:bg,color:c}}>
      {arrow} {shown}%
    </span>
  );
}

// Compact product row used by mover / velocity / dead-stock lists
function MiniRow({ p, onClick, allCats, primary, secondary, right }) {
  return (
    <button onClick={onClick}
      style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 12px",
              minHeight:52,
              background:"transparent",border:"none",borderBottom:"1px solid var(--bdr)",
              cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}
      onMouseEnter={e=>e.currentTarget.style.background="#fafcf7"}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      {p.imageUrl
        ? <div style={{width:34,height:34,borderRadius:6,flexShrink:0,backgroundImage:`url("${p.imageUrl}")`,
                       backgroundSize:"contain",backgroundPosition:"center",backgroundRepeat:"no-repeat",
                       backgroundColor:"#fff",border:"1px solid var(--bdr)"}}/>
        : <div style={{width:34,height:34,borderRadius:6,flexShrink:0,
                       background:catColor(p.cat,allCats)+"22",border:`1px solid ${catColor(p.cat,allCats)}55`}}/>}
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11.5,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
        <div style={{fontSize:10,color:"var(--muted)",marginTop:1}}>{secondary}</div>
      </div>
      <div style={{flexShrink:0,textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
        {right}
        {primary != null && <div style={{fontSize:10,color:"var(--light)"}}>{primary}</div>}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────────────
function OverviewView({ data, range, setRange, role }) {
  const { products, monthLabels, monthlyByCat, totals, mtoGroups,
          dayLabels, dailyByCat } = data;

  const months = monthLabels || [];
  const days   = (dayLabels && dayLabels.length > 0) ? dayLabels : [];
  const hasDailyData = days.length > 0;

  // ── new states for month picker + comparison ──────────────────────
  const [selMonth, setSelMonth] = uS(null);   // null = latest
  const [cmpSel,   setCmpSel]   = uS([]);     // explicit month selection for comparison
  const [showCmp,  setShowCmp]  = uS(false);

  // activeMonth: currently selected month (for "รายเดือน" mode)
  const activeMonth = selMonth || months[months.length - 1] || null;

  const monthlySeries = uM(() => months.map(m => {
    const cats = monthlyByCat[m] || {};
    let qty = 0, rev = 0;
    for (const c of Object.keys(cats)) { qty += cats[c].qty; rev += cats[c].sales; }
    return { month: m, label: monthLabel(m), qty, rev };
  }), [months, monthlyByCat]);

  // Real daily series from uploaded dailySales
  const dailySeries = uM(() => {
    if (!hasDailyData) return [];
    return days.map(d => {
      const cats = (dailyByCat || {})[d] || {};
      let qty = 0, rev = 0;
      for (const c of Object.keys(cats)) { qty += cats[c].qty; rev += cats[c].sales; }
      // Format DD/MM/YYYY → DD/MM
      const parts = d.split("/");
      const label = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : d;
      return { day: d, label, qty, rev };
    });
  }, [days, dailyByCat, hasDailyData]);

  // daily series filtered to selected month (for drill-down)
  const selMonthDailySeries = uM(() => {
    if (!hasDailyData || !activeMonth) return dailySeries;
    const [mo, yr] = activeMonth.split("/");
    if (!yr) return dailySeries;
    return dailySeries.filter(s => {
      const dp = s.day.split("/"); // DD/MM/YYYY
      return dp.length >= 3 && dp[1] === mo && dp[2] === yr;
    });
  }, [activeMonth, dailySeries, hasDailyData]);

  const filtered = uM(() => {
    if (range === 'day') return dailySeries;
    if (range === 'year') return monthlySeries;
    if (range === 'month') return monthlySeries.filter(m => m.month === activeMonth);
    return monthlySeries;
  }, [monthlySeries, dailySeries, range, activeMonth]);

  const sumRev = filtered.reduce((s,m) => s + m.rev, 0);
  const sumQty = filtered.reduce((s,m) => s + m.qty, 0);
  const prevRev = monthlySeries.length >= 2 ? monthlySeries[monthlySeries.length-2].rev : 0;
  const curRev = monthlySeries[monthlySeries.length-1]?.rev || 0;
  const momDelta = prevRev > 0 ? ((curRev - prevRev) / prevRev * 100).toFixed(1) : null;

  // For daily delta: last day vs previous day
  const dailyDelta = uM(() => {
    if (range !== 'day' || dailySeries.length < 2) return null;
    const last = dailySeries[dailySeries.length-1].rev;
    const prev = dailySeries[dailySeries.length-2].rev;
    if (!prev) return null;
    return ((last - prev) / prev * 100).toFixed(1);
  }, [range, dailySeries]);

  const allCats = uM(() => {
    const s = new Set();
    products.forEach(p => p.cat && s.add(p.cat));
    return [...s].sort();
  }, [products]);

  // catShare: use daily data when in day mode
  const catShare = uM(() => {
    let accum = {};
    if (range === 'day' && hasDailyData) {
      for (const d of days) {
        const cats = (dailyByCat || {})[d] || {};
        for (const c of Object.keys(cats)) {
          if (!c || c === "ไม่มีรหัสสินค้า") continue;
          accum[c] = (accum[c] || 0) + cats[c].sales;
        }
      }
    } else {
      const targetMonths = range === 'year' ? months : (activeMonth ? [activeMonth] : months.slice(-1));
      for (const m of targetMonths) {
        const cats = monthlyByCat[m] || {};
        for (const c of Object.keys(cats)) {
          if (!c || c === "ไม่มีรหัสสินค้า") continue;
          accum[c] = (accum[c] || 0) + cats[c].sales;
        }
      }
    }
    return Object.entries(accum)
      .map(([cat, rev]) => ({ cat, rev, color: catColor(cat, allCats) }))
      .sort((a,b) => b.rev - a.rev);
  }, [monthlyByCat, dailyByCat, range, months, days, allCats, hasDailyData]);

  const topCats = catShare.slice(0, 6).map(c => c.cat);

  // Stacked chart: use daily or monthly series depending on mode
  const stackedSeries = uM(() => {
    // รายวัน mode — use full daily data
    if (range === 'day' && hasDailyData) {
      return days.map(d => {
        const parts = d.split("/");
        const label = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : d;
        const row = { label };
        const cats = (dailyByCat || {})[d] || {};
        let other = 0;
        for (const c of Object.keys(cats)) {
          if (topCats.includes(c)) row[c] = Math.round(cats[c].sales);
          else other += cats[c].sales;
        }
        row["อื่นๆ"] = Math.round(other);
        return row;
      });
    }
    // รายเดือน drill-down — show daily within selected month if available
    if (range === 'month' && hasDailyData && selMonthDailySeries.length > 0) {
      return selMonthDailySeries.map(s => {
        const dp = s.day.split("/");
        const label = dp.length >= 2 ? `${dp[0]}/${dp[1]}` : s.day;
        const row = { label };
        const cats = (dailyByCat || {})[s.day] || {};
        let other = 0;
        for (const c of Object.keys(cats)) {
          if (topCats.includes(c)) row[c] = Math.round(cats[c].sales);
          else other += cats[c].sales;
        }
        row["อื่นๆ"] = Math.round(other);
        return row;
      });
    }
    // ทั้งปี / รายเดือน (no daily) — use monthly data
    const targetMonths = range === 'month' && activeMonth ? [activeMonth] : months;
    return targetMonths.map(m => {
      const row = { label: monthLabel(m) };
      const cats = monthlyByCat[m] || {};
      let other = 0;
      for (const c of Object.keys(cats)) {
        if (topCats.includes(c)) row[c] = Math.round(cats[c].sales);
        else other += cats[c].sales;
      }
      row["อื่นๆ"] = Math.round(other);
      return row;
    });
  }, [months, days, monthlyByCat, dailyByCat, topCats, range, hasDailyData, activeMonth, selMonthDailySeries]);

  // ── Period selector: map range → per-product {qty, rev} for selected window ──
  const periodInfo = uM(() => {
    if (range === 'year') {
      return {
        label: months.length ? `${monthLabel(months[0]).split(" ")[0]}–${monthLabel(months[months.length-1])}` : "ทั้งปี",
        tag: "ทั้งปี",
        perProduct: p => ({ qty: p.soldQty || 0, rev: p.soldRev || 0 }),
      };
    }
    const mk = activeMonth; // month + day mode drill to the active month
    return {
      label: mk ? monthLabel(mk) : "เดือนล่าสุด",
      tag: mk ? monthLabel(mk) : "เดือนล่าสุด",
      perProduct: p => {
        const mm = (p.monthly || []).find(x => x.month === mk);
        return { qty: mm ? mm.qty : 0, rev: mm ? mm.sales : 0 };
      },
    };
  }, [range, activeMonth, months]);

  const topSellers = uM(() =>
    products.filter(p => !p.isMTO)
      .map(p => { const v = periodInfo.perProduct(p); return { ...p, _pQty: v.qty, _pRev: v.rev }; })
      .filter(p => p._pRev > 0 || p._pQty > 0)
      .sort((a,b) => b._pRev - a._pRev)
      .slice(0, 10),
    [products, periodInfo]
  );

  // ── Movers: current vs previous month (MoM) ──────────────────────────
  const momMovers = uM(() => {
    if (months.length < 2) return { risers: [], fallers: [], cur: null, prev: null };
    const cur = months[months.length-1], prev = months[months.length-2];
    const MIN = 300; // ตัด noise: ต้องมียอดอย่างน้อยเดือนใดเดือนหนึ่ง
    const rows = products.filter(p => !p.isMTO).map(p => {
      const c  = (p.monthly||[]).find(x=>x.month===cur);
      const pr = (p.monthly||[]).find(x=>x.month===prev);
      const curRev = c?c.sales:0, prevRev = pr?pr.sales:0;
      const isNew = prevRev === 0 && curRev > 0;
      const pct = prevRev > 0 ? (curRev - prevRev)/prevRev : null;
      return { p, curRev, prevRev, curQty: c?c.qty:0, prevQty: pr?pr.qty:0,
               delta: curRev - prevRev, pct, isNew };
    }).filter(r => r.curRev >= MIN || r.prevRev >= MIN);
    const risers  = rows.filter(r => r.delta > 0).sort((a,b)=>b.delta-a.delta).slice(0,6);
    const fallers = rows.filter(r => r.delta < 0).sort((a,b)=>a.delta-b.delta).slice(0,6);
    return { risers, fallers, cur, prev };
  }, [products, months]);

  // ── Velocity: avg sales rate → days of stock left ────────────────────
  const velocity = uM(() => {
    const n = Math.max(1, Math.min(months.length, 3));
    const recent = months.slice(-n);
    const rows = products.filter(p => !p.isMTO).map(p => {
      const qty = (p.monthly||[]).filter(x=>recent.includes(x.month)).reduce((s,x)=>s+x.qty,0);
      const perDay = qty / (n*30);
      const stock = stockQty(p);
      const daysLeft = perDay > 0 ? stock/perDay : Infinity;
      return { p, perDay, stock, daysLeft, qty };
    });
    const reorder   = rows.filter(r => r.perDay>0 && r.stock>0 && r.daysLeft < 21)
                          .sort((a,b)=>a.daysLeft-b.daysLeft).slice(0,10);
    const overstock = rows.filter(r => r.perDay>0 && r.daysLeft>120 && r.stock>10)
                          .sort((a,b)=>b.daysLeft-a.daysLeft).slice(0,10);
    return { reorder, overstock, n };
  }, [products, months]);

  // ── Dead stock: holding inventory but no recent sales ────────────────
  const deadStock = uM(() => {
    const recent = months.slice(-2);
    const rows = products.filter(p => !p.isMTO && stockQty(p) > 0).map(p => {
      const recentQty = (p.monthly||[]).filter(x=>recent.includes(x.month)).reduce((s,x)=>s+x.qty,0);
      const stock = stockQty(p);
      return { p, recentQty, stock, value: stock * (p.price||0) };
    }).filter(r => r.recentQty === 0);
    rows.sort((a,b)=>b.value-a.value);
    return { list: rows.slice(0,12), count: rows.length,
             totalValue: rows.reduce((s,r)=>s+r.value,0) };
  }, [products, months]);

  // ── ABC / Pareto classification by revenue ───────────────────────────
  const abc = uM(() => {
    const sorted = products.filter(p => !p.isMTO && (p.soldRev||0) > 0)
                           .sort((a,b)=>(b.soldRev||0)-(a.soldRev||0));
    const total = sorted.reduce((s,p)=>s+(p.soldRev||0),0);
    let cum = 0;
    const counts = { A:0, B:0, C:0 }, rev = { A:0, B:0, C:0 }, groups = { A:[], B:[], C:[] };
    sorted.forEach(p => {
      cum += p.soldRev||0;
      const cumPct = total>0 ? cum/total : 0;
      const cls = cumPct <= 0.8 ? 'A' : cumPct <= 0.95 ? 'B' : 'C';
      counts[cls]++; rev[cls] += p.soldRev||0;
      groups[cls].push(p);
    });
    return { total, counts, rev, groups, n: sorted.length };
  }, [products]);

  // Top sellers per category — period-aware (ตามช่วงเวลาที่เลือก)
  const topByCategory = uM(() => {
    const byCat = {};
    products.filter(p => !p.isMTO && p.cat && p.cat !== "ไม่มีรหัสสินค้า")
      .forEach(p => {
        const v = periodInfo.perProduct(p);
        if (v.rev <= 0 && v.qty <= 0) return;
        if (!byCat[p.cat]) byCat[p.cat] = [];
        byCat[p.cat].push({ ...p, _pQty: v.qty, _pRev: v.rev });
      });
    return Object.entries(byCat)
      .map(([cat, ps]) => ({
        cat,
        products: ps.sort((a,b) => b._pRev - a._pRev).slice(0, 10),
        totalRev: ps.reduce((s,p) => s+p._pRev, 0),
      }))
      .sort((a,b) => b.totalRev - a.totalRev);
  }, [products, periodInfo]);

  const [abcModalCls, setAbcModalCls] = uS(null);

  const [overviewModalP, setOverviewModalP] = uS(null);

  // ── Comparison chart data (multi-select months) ──────────────────
  const cmpData = uM(() => {
    const activeTargets = cmpSel.length > 0 ? cmpSel : months.slice(-Math.min(3, months.length));
    const topCatsForCmp = catShare.slice(0, 5).map(c => c.cat);
    const bars = activeTargets.map(m => {
      const cats = monthlyByCat[m] || {};
      const row = { label: monthLabel(m) };
      let total = 0, other = 0;
      for (const c of Object.keys(cats)) {
        total += cats[c].sales;
        if (topCatsForCmp.includes(c)) row[c] = Math.round(cats[c].sales);
        else other += cats[c].sales;
      }
      if (other > 0) row["อื่นๆ"] = Math.round(other);
      row.total = Math.round(total);
      return row;
    });
    return { bars, topCats: topCatsForCmp, activeTargets };
  }, [cmpSel, months, monthlyByCat, catShare]);

  // ── Forecast calculations (owner only) ──
  const forecast = uM(() => {
    const linReg = (vals) => {
      const n = vals.length;
      if (n < 2) return { slope: 0, intercept: vals[0] || 0, r2: 0 };
      const xMean = (n - 1) / 2;
      const yMean = vals.reduce((s, v) => s + v, 0) / n;
      let ssxx = 0, ssxy = 0, ssyy = 0;
      for (let i = 0; i < n; i++) {
        ssxx += (i - xMean) ** 2;
        ssxy += (i - xMean) * (vals[i] - yMean);
        ssyy += (vals[i] - yMean) ** 2;
      }
      const slope = ssxx === 0 ? 0 : ssxy / ssxx;
      const intercept = yMean - slope * xMean;
      const r2 = ssyy === 0 ? 1 : Math.min(1, Math.max(0, (ssxy * ssxy) / (ssxx * ssyy)));
      return { slope, intercept, r2 };
    };

    const useLast = 6;
    const mSlice = monthlySeries.slice(-useLast);
    if (mSlice.length < 2) return null;

    const revVals = mSlice.map(m => m.rev);
    const qtyVals = mSlice.map(m => m.qty);
    const revLR   = linReg(revVals);
    const qtyLR   = linReg(qtyVals);
    const nextIdx = mSlice.length;

    const nextMonthRev = Math.max(0, revLR.slope * nextIdx + revLR.intercept);
    const nextMonthQty = Math.max(0, qtyLR.slope * nextIdx + qtyLR.intercept);

    // MAE-based confidence range
    const revMAE = revVals.reduce((s, v, i) => s + Math.abs(v - (revLR.slope * i + revLR.intercept)), 0) / revVals.length;
    const qtyMAE = qtyVals.reduce((s, v, i) => s + Math.abs(v - (qtyLR.slope * i + qtyLR.intercept)), 0) / qtyVals.length;

    const curMonthRev = mSlice[mSlice.length - 1].rev;
    const revChangePct = curMonthRev > 0 ? ((nextMonthRev - curMonthRev) / curMonthRev * 100) : 0;

    // Weekly forecast from daily data (last 8 weeks → project next 7 days)
    let weekly = null;
    if (dailySeries.length >= 14) {
      const weeksData = [];
      for (let i = dailySeries.length - 1; i >= 0 && weeksData.length < 8; ) {
        let wRev = 0, wQty = 0;
        for (let d = 0; d < 7 && i >= 0; d++, i--) {
          wRev += dailySeries[i].rev;
          wQty += dailySeries[i].qty;
        }
        weeksData.unshift({ rev: wRev, qty: wQty });
      }
      if (weeksData.length >= 2) {
        const wRevLR = linReg(weeksData.map(w => w.rev));
        const wQtyLR = linReg(weeksData.map(w => w.qty));
        const wNextIdx = weeksData.length;
        weekly = {
          rev: Math.max(0, wRevLR.slope * wNextIdx + wRevLR.intercept),
          qty: Math.max(0, wQtyLR.slope * wNextIdx + wQtyLR.intercept),
          changePct: weeksData[weeksData.length-1].rev > 0
            ? ((Math.max(0, wRevLR.slope * wNextIdx + wRevLR.intercept) - weeksData[weeksData.length-1].rev) / weeksData[weeksData.length-1].rev * 100)
            : 0,
          r2: wRevLR.r2,
        };
      }
    }

    // Chart: historical months + forecast point
    const chartData = mSlice.map((m, i) => ({
      label: m.label, actual: Math.round(m.rev),
      trend: Math.round(Math.max(0, revLR.slope * i + revLR.intercept)),
    }));
    // Add next month projected point
    const nextMonthLabel = (() => {
      const last = mSlice[mSlice.length - 1].month;
      if (!last) return "ถัดไป";
      const [yr, mo] = last.split("-").map(Number);
      const nm = mo === 12 ? 1 : mo + 1;
      const ny = mo === 12 ? yr + 1 : yr;
      return `${nm}/${String(ny).slice(-2)}`;
    })();
    chartData.push({ label: nextMonthLabel, forecast: Math.round(nextMonthRev) });

    return {
      nextMonthRev, nextMonthQty,
      revChangePct, revMAE, qtyMAE,
      r2: revLR.r2,
      chartData,
      weekly,
      basedOn: mSlice.length,
    };
  }, [monthlySeries, dailySeries]);

  const deltaVal  = range === 'day' ? dailyDelta : (range !== 'year' ? momDelta : null);
  const deltaDir  = deltaVal && parseFloat(deltaVal) < 0 ? 'down' : 'up';
  const subLabel  = range === 'day'
    ? (hasDailyData ? `${days.length} วัน (${dailySeries[0]?.label}–${dailySeries[dailySeries.length-1]?.label})` : "ยังไม่มีข้อมูลรายวัน")
    : range === 'month' ? (activeMonth ? monthLabel(activeMonth) : "เดือนล่าสุด")
    : `${months.length} เดือนรวม`;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">ภาพรวมยอดขาย</div>
          <div className="page-sub" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span>
              {range === 'day' && hasDailyData
                ? `ข้อมูลรายวัน · ${days.length} วัน`
                : `ข้อมูล ${months.length} เดือน`}
            </span>
            <span className="chip">
              <span style={{width:6,height:6,borderRadius:"50%",background:"var(--g-500)"}}></span>
              Live
            </span>
            {range === 'day' && !hasDailyData && (
              <span className="chip warn">อัปโหลด dailySales ก่อนเพื่อดูข้อมูลรายวัน</span>
            )}
          </div>
        </div>
        <div className="page-actions">
          <Seg value={range} onChange={setRange} options={[
            {value:"day",   label:"รายวัน"},
            {value:"month", label:"รายเดือน"},
            {value:"year",  label:"ทั้งปี"},
          ]}/>
        </div>
      </div>

      {/* ── Month picker strip — เลือกเดือนเมื่ออยู่ใน "รายเดือน" ── */}
      {range === 'month' && months.length > 1 && (
        <div style={{
          overflowX:'auto', display:'flex', gap:8, paddingBottom:6, marginBottom:16,
          scrollbarWidth:'none', WebkitOverflowScrolling:'touch',
        }}>
          {months.map(m => (
            <button key={m} onClick={() => setSelMonth(m)}
              style={{
                flexShrink:0, padding:'7px 16px', borderRadius:20,
                border:'1.5px solid ' + (activeMonth === m ? '#1b5e20' : 'var(--bdr)'),
                background: activeMonth === m ? '#1b5e20' : '#fff',
                color: activeMonth === m ? '#fff' : 'var(--g-700)',
                fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                transition:'background .15s, color .15s, border-color .15s',
                whiteSpace:'nowrap',
              }}>
              {monthLabel(m)}
            </button>
          ))}
        </div>
      )}

      <div className={`row ${role==='employee'?'row-2':'row-4'}`} style={{marginBottom: 20}}>
        {role === 'owner' && (
          <KPI label="ยอดขายรวม" accent="#1f7f44"
               value={fmtB(sumRev)}
               sub={subLabel}
               delta={deltaVal ? `${Math.abs(parseFloat(deltaVal))}%` : null}
               deltaDir={deltaDir}
               icon={I.sales} />
        )}
        <KPI label="จำนวนชิ้นที่ขาย" accent="#4fb472"
             value={fmtN(sumQty)}
             sub={range === 'day' ? `${days.length} วันล่าสุด` : `${fmtN(totals.nSold)} SKU มียอดขาย`}
             icon={I.cart} />
        {role === 'owner' && (
          <KPI label="มูลค่าสต๊อกคงเหลือ" accent="#a07417"
               value={fmtB(totals.totalStockValue)}
               sub={`${fmtN(totals.nWithStock)} SKU มีของในคลัง`}
               icon={I.package} />
        )}
        {role === 'owner' && (
          <KPI label="ยอดขาย / ต้นทุนสต๊อก" accent="#1f6f8b"
               value={totals.totalStockValue > 0 ? `${(totals.totalSoldRev / totals.totalStockValue).toFixed(2)}×` : "—"}
               sub="หมุนเวียนสินค้า"
               icon={I.trend} />
        )}
      </div>

      {/* ─── Forecast Tool (owner only) ─── */}
      {role === 'owner' && forecast && (
        <div style={{marginBottom: 20}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{fontSize:15,fontWeight:800,color:"var(--g-700)"}}>📈 Forecast Tool</span>
            <span style={{fontSize:11,color:"var(--muted)",fontWeight:500}}>
              พยากรณ์จากข้อมูล {forecast.basedOn} เดือนล่าสุด · Linear Regression
            </span>
            <span style={{
              fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
              background: forecast.r2 >= 0.7 ? "#e8f5e9" : forecast.r2 >= 0.4 ? "#fff8e1" : "#fdecea",
              color: forecast.r2 >= 0.7 ? "var(--g-700)" : forecast.r2 >= 0.4 ? "#a07417" : "var(--dang)",
            }}>
              R² {(forecast.r2 * 100).toFixed(0)}% {forecast.r2 >= 0.7 ? "✓ น่าเชื่อถือ" : forecast.r2 >= 0.4 ? "~ พอใช้" : "⚠ ข้อมูลน้อย"}
            </span>
          </div>

          <div className="row" style={{gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
            {/* Next Month card */}
            <div style={{
              borderRadius:14, padding:18,
              background:"linear-gradient(135deg,#f0f9f2,#e8f5e9)",
              border:"1.5px solid #a8d9b4",
            }}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>
                ประมาณยอดขาย เดือนหน้า
              </div>
              <div style={{display:"flex",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:26,fontWeight:800,color:"var(--g-700)",lineHeight:1.1}}>
                    {fmtB(forecast.nextMonthRev)}
                  </div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
                    ±{fmtB(forecast.revMAE)} จากเทรนด์
                  </div>
                </div>
                <div style={{
                  display:"flex",alignItems:"center",gap:4,
                  padding:"4px 10px",borderRadius:20,
                  background: forecast.revChangePct >= 0 ? "#c8e6c9" : "#ffcdd2",
                  color: forecast.revChangePct >= 0 ? "#1b5e20" : "#b71c1c",
                  fontSize:12,fontWeight:700,
                }}>
                  {forecast.revChangePct >= 0 ? "▲" : "▼"} {Math.abs(forecast.revChangePct).toFixed(1)}%
                  <span style={{fontWeight:400,fontSize:10,marginLeft:2}}>vs เดือนนี้</span>
                </div>
              </div>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:8}}>
                จำนวน ~{Math.round(forecast.nextMonthQty).toLocaleString()} ชิ้น
              </div>
            </div>

            {/* Next Week card */}
            {forecast.weekly ? (
              <div style={{
                borderRadius:14, padding:18,
                background:"linear-gradient(135deg,#f3f0f9,#ede8f5)",
                border:"1.5px solid #c5b8e0",
              }}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>
                  ประมาณยอดขาย 7 วันหน้า
                </div>
                <div style={{display:"flex",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontSize:26,fontWeight:800,color:"#5b3fa0",lineHeight:1.1}}>
                      {fmtB(forecast.weekly.rev)}
                    </div>
                    <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
                      ~{Math.round(forecast.weekly.qty).toLocaleString()} ชิ้น
                    </div>
                  </div>
                  <div style={{
                    display:"flex",alignItems:"center",gap:4,
                    padding:"4px 10px",borderRadius:20,
                    background: forecast.weekly.changePct >= 0 ? "#e8eaf6" : "#ffcdd2",
                    color: forecast.weekly.changePct >= 0 ? "#283593" : "#b71c1c",
                    fontSize:12,fontWeight:700,
                  }}>
                    {forecast.weekly.changePct >= 0 ? "▲" : "▼"} {Math.abs(forecast.weekly.changePct).toFixed(1)}%
                    <span style={{fontWeight:400,fontSize:10,marginLeft:2}}>vs สัปดาห์นี้</span>
                  </div>
                </div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:8}}>
                  R² รายสัปดาห์ {(forecast.weekly.r2 * 100).toFixed(0)}%
                </div>
              </div>
            ) : (
              <div style={{
                borderRadius:14, padding:18,
                background:"#f8f8f8", border:"1.5px dashed var(--bdr)",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                color:"var(--muted)", fontSize:12, gap:6,
              }}>
                <span style={{fontSize:22}}>📅</span>
                <span style={{fontWeight:600}}>ยังไม่มีข้อมูลรายวัน</span>
                <span style={{fontSize:11}}>อัปโหลด dailySales เพื่อดู Forecast รายสัปดาห์</span>
              </div>
            )}
          </div>

          {/* Trend chart: historical + forecast */}
          <Card title="แนวโน้ม + Forecast เดือนหน้า" sub="เส้นประ = ค่าพยากรณ์ | เส้นทึบ = Trend Line">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={forecast.chartData} margin={{top:6,right:16,bottom:6,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2eadd" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:11,fill:"#5b6b5e"}} tickLine={false} axisLine={false}/>
                <YAxis tick={{fontSize:10,fill:"#94a194"}} tickLine={false} axisLine={false}
                       tickFormatter={v => v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(1)}K`:String(v)}/>
                <Tooltip formatter={(v,n) => [fmtB(v), n==="actual"?"ยอดจริง":n==="trend"?"Trend Line":"Forecast"]}/>
                <Line type="monotone" dataKey="actual" stroke="var(--g-500)" strokeWidth={2.5}
                      dot={{r:3,fill:"var(--g-500)"}} connectNulls={false} name="actual"/>
                <Line type="monotone" dataKey="trend" stroke="#94a3b8" strokeWidth={1.5}
                      dot={false} strokeDasharray="4 3" name="trend"/>
                <Line type="monotone" dataKey="forecast" stroke="#7c3aed" strokeWidth={2.5}
                      dot={{r:5,fill:"#7c3aed",strokeWidth:2,stroke:"#fff"}}
                      strokeDasharray="6 3" name="forecast"/>
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      <div className="row row-12-5" style={{marginBottom: 20}}>
        <Card title={
          range === 'day' ? "ยอดขายรายวัน · แยกหมวด" :
          range === 'month' ? (hasDailyData && selMonthDailySeries.length > 0
            ? `ยอดขายรายวัน · ${activeMonth ? monthLabel(activeMonth) : ''}`
            : `ยอดขายรายเดือน · ${activeMonth ? monthLabel(activeMonth) : ''}`)
          : "แนวโน้มยอดขายรายเดือน · แยกหมวด"}
              sub={range === 'month' && hasDailyData && selMonthDailySeries.length > 0
                ? `${selMonthDailySeries.length} วัน · แท่งซ้อน Top 6 หมวด`
                : 'แท่งซ้อน — Top 6 หมวด + อื่นๆ'}>
          {range === 'day' && !hasDailyData ? (
            <Empty icon={I.upload} title="ยังไม่มีข้อมูลรายวัน"
                   sub="อัปโหลด dailySales*.xlsx ในหน้าอัปโหลด แล้วกลับมาดูที่นี่"/>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stackedSeries} margin={{top:6,right:8,bottom:6,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2eadd" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:11, fill:"#5b6b5e"}} tickLine={false} axisLine={false}/>
                <YAxis tick={{fontSize:10, fill:"#94a194"}} tickLine={false} axisLine={false}
                       tickFormatter={v => v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(1)}K`:v}/>
                <Tooltip formatter={(v,n) => [fmtB(v), n]}/>
                <Legend wrapperStyle={{fontSize:11}} iconType="circle" iconSize={8}/>
                {topCats.map((c) => (
                  <Bar key={c} dataKey={c} stackId="a" fill={catColor(c, allCats)} />
                ))}
                <Bar dataKey="อื่นๆ" stackId="a" fill="#c9d6bf" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="สัดส่วนยอดขายตามหมวด"
              sub={range==='year' ? "ทั้งปี" : range==='day' ? `${days.length} วันล่าสุด` : (activeMonth ? monthLabel(activeMonth) : "เดือนล่าสุด")}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <ResponsiveContainer width={160} height={200}>
              <PieChart>
                <Pie data={catShare.slice(0,8)} dataKey="rev" nameKey="cat"
                     cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={1.5}>
                  {catShare.slice(0,8).map((c) => <Cell key={c.cat} fill={c.color}/>)}
                </Pie>
                <Tooltip formatter={v => fmtB(v)}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{flex:1, overflowY:"auto", maxHeight:200}}>
              {catShare.slice(0,8).map((c) => {
                const pct = (c.rev / (catShare.reduce((s,x)=>s+x.rev,0)||1) * 100).toFixed(1);
                return (
                  <div key={c.cat} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",fontSize:12}}>
                    <span style={{width:10,height:10,borderRadius:3,background:c.color,flexShrink:0}}/>
                    <span style={{flex:1, overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.cat}</span>
                    <span style={{fontWeight:600, color:"var(--muted)"}}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Monthly Comparison Chart ─── */}
      {months.length >= 2 && role === 'owner' && (
        <div style={{marginBottom:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
            <span style={{fontSize:15,fontWeight:800,color:'var(--g-700)'}}>📊 เทียบยอดขายรายเดือน</span>
            <span style={{fontSize:11,color:'var(--muted)'}}>เลือกเดือนที่ต้องการเปรียบเทียบ (สูงสุด 6)</span>
            <button onClick={() => setShowCmp(v => !v)}
              style={{marginLeft:'auto',fontSize:11,padding:'4px 12px',borderRadius:12,
                      border:'1.5px solid var(--bdr)',fontFamily:'inherit',cursor:'pointer',
                      background: showCmp ? '#1b5e20' : '#fff',
                      color: showCmp ? '#fff' : 'var(--g-700)',fontWeight:600}}>
              {showCmp ? '▲ ซ่อน' : '▼ แสดงกราฟ'}
            </button>
          </div>

          {showCmp && (
            <>
              {/* Month multi-select chips */}
              <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:14}}>
                {months.map(m => {
                  const activeTargets = cmpSel.length > 0 ? cmpSel : months.slice(-Math.min(3,months.length));
                  const sel = activeTargets.includes(m);
                  return (
                    <button key={m} onClick={() => {
                      const base = cmpSel.length > 0 ? cmpSel : months.slice(-Math.min(3,months.length));
                      const next = base.includes(m)
                        ? base.filter(x => x !== m)
                        : [...base, m].slice(-6);
                      setCmpSel(next);
                    }}
                    style={{
                      padding:'5px 13px', borderRadius:16, cursor:'pointer',
                      fontFamily:'inherit', fontSize:11, fontWeight:700,
                      border:'1.5px solid ' + (sel ? '#1b5e20' : 'var(--bdr)'),
                      background: sel ? '#e8f5e9' : '#fff',
                      color: sel ? '#1b5e20' : 'var(--muted)',
                      transition:'background .1s,color .1s,border-color .1s',
                    }}>
                      {sel ? '✓ ' : ''}{monthLabel(m)}
                    </button>
                  );
                })}
                {cmpSel.length > 0 && (
                  <button onClick={() => setCmpSel([])}
                    style={{padding:'5px 13px',borderRadius:16,fontSize:11,fontWeight:600,
                            border:'1.5px solid var(--bdr)',background:'#fff',color:'var(--muted)',
                            cursor:'pointer',fontFamily:'inherit'}}>
                    ↩ รีเซ็ต
                  </button>
                )}
              </div>

              {/* Stacked bar — selected months comparison */}
              <Card title="ยอดขายตามหมวด · เทียบรายเดือน"
                    sub={`${cmpData.activeTargets.length} เดือน · แท่งซ้อน Top 5 หมวด`}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={cmpData.bars} margin={{top:6,right:8,bottom:6,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2eadd" vertical={false}/>
                    <XAxis dataKey="label" tick={{fontSize:12,fill:"#5b6b5e"}} tickLine={false} axisLine={false}/>
                    <YAxis tick={{fontSize:10,fill:"#94a194"}} tickLine={false} axisLine={false}
                           tickFormatter={v => v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(1)}K`:v}/>
                    <Tooltip formatter={(v,n) => [fmtB(v), n]}/>
                    <Legend wrapperStyle={{fontSize:11}} iconType="circle" iconSize={8}/>
                    {cmpData.topCats.map(c => (
                      <Bar key={c} dataKey={c} stackId="a" fill={catColor(c, allCats)}/>
                    ))}
                    <Bar dataKey="อื่นๆ" stackId="a" fill="#c9d6bf"/>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* Line chart — total revenue trend across selected months */}
              <Card title="ยอดขายรวม · เส้นแนวโน้ม" sub="เปรียบเทียบ total revenue รายเดือน" style={{marginTop:12}}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={cmpData.bars} margin={{top:6,right:16,bottom:6,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2eadd" vertical={false}/>
                    <XAxis dataKey="label" tick={{fontSize:11,fill:"#5b6b5e"}} tickLine={false} axisLine={false}/>
                    <YAxis tick={{fontSize:10,fill:"#94a194"}} tickLine={false} axisLine={false}
                           tickFormatter={v => v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(1)}K`:v}/>
                    <Tooltip formatter={v => [fmtB(v), 'ยอดขายรวม']}/>
                    <Line type="monotone" dataKey="total"
                      stroke="var(--g-500)" strokeWidth={2.5}
                      dot={{r:5,fill:"var(--g-500)",stroke:"#fff",strokeWidth:2}}
                      name="ยอดรวม"/>
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </>
          )}
        </div>
      )}

      {/* MTO Section */}
      {mtoGroups && mtoGroups.length > 0 && (
        <Card title="🎨 งานจัดพิเศษ (Made to Order)" sub={`${mtoGroups.length} ประเภท · ไม่นับสต๊อก`} style={{marginBottom: 20}}>
          <div className="row" style={{gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))"}}>
            {mtoGroups.map(g => (
              <div key={g.base} style={{
                padding:14, borderRadius:12,
                background:"linear-gradient(180deg, #f3eef9, #fff)",
                border:"1px solid #d8c8e8"
              }}>
                <div style={{fontSize:10,fontWeight:700,color:"#705d96",textTransform:"uppercase",letterSpacing:".06em"}}>MTO</div>
                <div style={{fontSize:14,fontWeight:700,marginTop:4,marginBottom:8,lineHeight:1.3}}>{g.base}</div>
                <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontSize:10,color:"var(--muted)"}}>{g.variants.length} แบบ · {fmtN(g.totalQty)} ชิ้น</div>
                  </div>
                  {role === "owner" && <div style={{fontSize:16,fontWeight:800,color:"#705d96"}}>{fmtB(g.totalRev)}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title={`Top 10 สินค้าขายดี · ${periodInfo.tag} (ไม่รวม MTO)`}
            sub={`เรียงตามรายได้ · ${periodInfo.label}`}
            action={null}>
        <div style={{overflowX:"auto"}}>
          <table className="t">
            <thead><tr>
              <th style={{width:42}}>#</th>
              <th>สินค้า</th>
              <th style={{width:100}}>หมวด</th>
              <th className="num" style={{width:90}}>ขาย (ชิ้น)</th>
              {role === "owner" && <th className="num" style={{width:110}}>รายได้</th>}
              <th className="num" style={{width:80}}>คงเหลือ</th>
              <th style={{width:120}}>แนวโน้ม 5 เดือน</th>
            </tr></thead>
            <tbody>
              {topSellers.map((p, i) => (
                <tr key={p.sku} style={{cursor:"pointer"}} onClick={() => setOverviewModalP(p)}>
                  <td style={{color:"var(--light)",fontWeight:700}}>{i+1}</td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{position:"relative",flexShrink:0}}>
                        {p.imageUrl ? (
                          <div style={{width:36,height:36,borderRadius:6,
                                       backgroundImage:`url("${p.imageUrl}")`,
                                       backgroundSize:"contain",backgroundPosition:"center",
                                       backgroundRepeat:"no-repeat",backgroundColor:"#fff",
                                       border:"1px solid var(--bdr)"}}/>
                        ) : (
                          <div style={{width:36,height:36,borderRadius:6,
                                       background:p.color?p.color.hex+"33":"var(--g-50)",
                                       border:p.color?`2px solid ${p.color.hex}`:"1px solid var(--bdr)"}}/>
                        )}
                        {p.imageUrl && p.color && (
                          <span style={{position:"absolute",bottom:2,right:2,width:9,height:9,
                                        borderRadius:"50%",background:p.color.hex,
                                        border:"1.5px solid #fff",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
                        )}
                      </div>
                      <div>
                        <span className="skucode" style={{fontSize:10}}>{p.sku}</span>
                        <div style={{fontWeight:500,marginTop:2}}>{p.name}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11.5,color:"var(--muted)"}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:catColor(p.cat, allCats)}}/>
                      {p.cat || "—"}
                    </span>
                  </td>
                  <td className="num" style={{fontWeight:600}}>{fmtN(p._pQty)}</td>
                  {role === "owner" && <td className="num" style={{fontWeight:700,color:"var(--g-700)"}}>{fmtB(p._pRev)}</td>}
                  <td className="num" style={{color:stockQty(p)<=36?"var(--dang)":"var(--muted)"}}>{fmtN(stockQty(p))}</td>
                  <td style={{padding:"4px 10px"}}>
                    <div style={{width:100}}>
                      <Sparkline values={p.monthly.map(m=>m.sales)}
                                 color={catColor(p.cat, allCats)} height={22}/>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top sellers per category */}
      <Card title={`🏆 Top 10 ขายดี · แยกตามหมวด · ${periodInfo.tag}`}
            sub={`ขายดีในช่วง ${periodInfo.label} · กดที่สินค้าเพื่อดูรายละเอียด`}
            style={{marginTop:20}}>
        <div className="row" style={{gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))"}}>
          {topByCategory.map(g => {
            const cc = catColor(g.cat, allCats);
            return (
              <div key={g.cat} style={{
                border:"1px solid var(--bdr)", borderRadius:12,
                background:"#fafcf7", overflow:"hidden",
              }}>
                <div style={{
                  display:"flex",alignItems:"center",gap:8,
                  padding:"10px 14px",
                  background:cc+"15", borderBottom:`2px solid ${cc}`,
                }}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:cc}}/>
                  <span style={{flex:1, fontSize:13, fontWeight:700}}>{g.cat}</span>
                  {role === "owner" && <span style={{fontSize:11, fontWeight:600, color:cc}}>{fmtB(g.totalRev)}</span>}
                </div>
                <div style={{maxHeight:340, overflowY:"auto"}}>
                  {g.products.map((p, i) => (
                    <button key={p.sku} onClick={() => setOverviewModalP(p)}
                            style={{
                              display:"flex",alignItems:"center",gap:10,
                              width:"100%", padding:"8px 12px",
                              background:"transparent", border:"none",
                              borderBottom:"1px solid var(--bdr)",
                              cursor:"pointer", textAlign:"left",
                              fontFamily:"inherit",
                              transition:"background .12s",
                            }}
                            onMouseEnter={e=>e.currentTarget.style.background="#fff"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{
                        width:20, fontSize:11, fontWeight:800,
                        color: i<3 ? cc : "var(--light)",
                      }}>
                        {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
                      </span>
                      <div style={{position:"relative",flexShrink:0}}>
                        {p.imageUrl ? (
                          <div style={{width:36,height:36,borderRadius:6,
                                       backgroundImage:`url("${p.imageUrl}")`,
                                       backgroundSize:"contain",backgroundPosition:"center",
                                       backgroundRepeat:"no-repeat",backgroundColor:"#fff",
                                       border:"1px solid var(--bdr)"}}/>
                        ) : (
                          <div style={{width:36,height:36,borderRadius:6,
                                       background: p.color ? p.color.hex+"33" : "var(--g-50)",
                                       border: p.color ? `2px solid ${p.color.hex}` : "1px solid var(--bdr)"}}/>
                        )}
                        {p.imageUrl && p.color && (
                          <span style={{position:"absolute",bottom:2,right:2,width:9,height:9,
                                        borderRadius:"50%",background:p.color.hex,
                                        border:"1.5px solid #fff",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
                        )}
                      </div>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:11.5, fontWeight:600,
                                     overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                          {p.name}
                        </div>
                        <div style={{fontSize:10, color:"var(--muted)", marginTop:1}}>
                          {fmtN(p._pQty)} ชิ้น · คงเหลือ {fmtN(stockQty(p))}
                        </div>
                      </div>
                      {role === "owner" && <div style={{fontSize:11.5, fontWeight:700, color:"var(--g-700)", flexShrink:0}}>
                        {fmtB(p._pRev)}
                      </div>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Movers: มาแรง / ตก (เดือนล่าสุด vs เดือนก่อน) ── */}
      {(momMovers.risers.length > 0 || momMovers.fallers.length > 0) && (
        <Card title="📊 สินค้ามาแรง · ตก"
              sub={momMovers.cur ? `เทียบ ${monthLabel(momMovers.cur)} กับ ${monthLabel(momMovers.prev)}` : ""}
              style={{marginTop:20}}>
          <div className="row" style={{gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))"}}>
            {[{ title:"📈 มาแรง", list:momMovers.risers, cc:"#1f7f44" },
              { title:"📉 ตกลง",  list:momMovers.fallers, cc:"#c0392b" }].map(col => (
              <div key={col.title} style={{border:"1px solid var(--bdr)",borderRadius:12,overflow:"hidden",background:"#fff"}}>
                <div style={{padding:"10px 14px",fontWeight:700,fontSize:13,
                             background:col.cc+"12",borderBottom:`2px solid ${col.cc}`}}>{col.title}</div>
                <div>
                  {col.list.length === 0
                    ? <div style={{padding:"16px",fontSize:12,color:"var(--muted)"}}>—</div>
                    : col.list.map(r => (
                        <MiniRow key={r.p.sku} p={r.p} allCats={allCats}
                          onClick={()=>setOverviewModalP(r.p)}
                          secondary={`${fmtN(r.prevQty)} → ${fmtN(r.curQty)} ชิ้น`}
                          right={<DeltaBadge pct={r.pct} isNew={r.isNew}/>}
                          primary={role==="owner" ? `${r.delta>0?"+":""}${fmtB(r.delta)}` : null}/>
                      ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Velocity: สต๊อกพอขายกี่วัน ── */}
      {(velocity.reorder.length > 0 || velocity.overstock.length > 0) && (
        <Card title="⏱️ ความเร็วการขาย · สต๊อกพอกี่วัน"
              sub={`อิงยอดขายเฉลี่ย ${velocity.n} เดือนล่าสุด`}
              style={{marginTop:20}}>
          <div className="row" style={{gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))"}}>
            {[{ title:"🔴 ควรสั่งเพิ่ม (< 21 วัน)", list:velocity.reorder, cc:"#c0392b", warn:true },
              { title:"🟡 สต๊อกค้างนาน (> 120 วัน)", list:velocity.overstock, cc:"#a07417", warn:false }].map(col => (
              <div key={col.title} style={{border:"1px solid var(--bdr)",borderRadius:12,overflow:"hidden",background:"#fff"}}>
                <div style={{padding:"10px 14px",fontWeight:700,fontSize:13,
                             background:col.cc+"12",borderBottom:`2px solid ${col.cc}`}}>{col.title}</div>
                <div style={{maxHeight:360,overflowY:"auto"}}>
                  {col.list.length === 0
                    ? <div style={{padding:"16px",fontSize:12,color:"var(--muted)"}}>—</div>
                    : col.list.map(r => (
                        <MiniRow key={r.p.sku} p={r.p} allCats={allCats}
                          onClick={()=>setOverviewModalP(r.p)}
                          secondary={`คงเหลือ ${fmtN(r.stock)} · ขาย ~${r.perDay>=1?Math.round(r.perDay):r.perDay.toFixed(1)}/วัน`}
                          right={<span style={{fontSize:12,fontWeight:800,color:col.cc}}>
                                   {isFinite(r.daysLeft) ? `${Math.round(r.daysLeft)} วัน` : "—"}
                                 </span>}
                          primary={null}/>
                      ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── ABC / Pareto ── */}
      {abc.n > 0 && (
        <Card title="🎯 ABC · สินค้ากลุ่มไหนทำรายได้หลัก"
              sub="A = 80% แรกของรายได้ · B = 80–95% · C = ที่เหลือ · กดที่กลุ่มเพื่อดูรายการสินค้า"
              style={{marginTop:20}}>
          <div className="row" style={{gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))"}}>
            {[{ cls:"A", label:"กลุ่ม A · ดาวเด่น", cc:"#1f7f44", desc:"โฟกัส อย่าให้ขาด" },
              { cls:"B", label:"กลุ่ม B · รอง",     cc:"#a07417", desc:"เฝ้าดูแนวโน้ม" },
              { cls:"C", label:"กลุ่ม C · หาง",     cc:"#9aa0a6", desc:"ทบทวน/ลดสต๊อก" }].map(g => {
              const share = abc.total>0 ? abc.rev[g.cls]/abc.total : 0;
              return (
                <button key={g.cls} onClick={()=>setAbcModalCls(g.cls)}
                        style={{border:`1px solid ${g.cc}44`,borderRadius:12,padding:14,textAlign:"left",
                                cursor:"pointer",fontFamily:"inherit",
                                background:`linear-gradient(180deg, ${g.cc}10, #fff)`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:30,height:30,borderRadius:8,background:g.cc,color:"#fff",
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                  fontWeight:800,fontSize:15}}>{g.cls}</span>
                    <div style={{fontSize:12,fontWeight:700,flex:1}}>{g.label}</div>
                    <span style={{fontSize:11,color:g.cc,fontWeight:700}}>ดู ›</span>
                  </div>
                  <div style={{display:"flex",alignItems:"baseline",gap:6,marginTop:10}}>
                    <span style={{fontSize:24,fontWeight:800,color:g.cc}}>{abc.counts[g.cls]}</span>
                    <span style={{fontSize:11,color:"var(--muted)"}}>รายการ</span>
                  </div>
                  <div style={{height:6,borderRadius:4,background:g.cc+"22",marginTop:8,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.round(share*100)}%`,background:g.cc}}/>
                  </div>
                  <div style={{fontSize:10.5,color:"var(--muted)",marginTop:6}}>
                    {role==="owner" ? `${fmtB(abc.rev[g.cls])} · ` : ""}{Math.round(share*100)}% ของรายได้
                  </div>
                  <div style={{fontSize:10.5,color:g.cc,fontWeight:600,marginTop:4}}>{g.desc}</div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── ABC drilldown modal: รายการสินค้าในกลุ่ม ── */}
      {abcModalCls && (() => {
        const meta = { A:{label:"กลุ่ม A · ดาวเด่น",cc:"#1f7f44"},
                       B:{label:"กลุ่ม B · รอง",cc:"#a07417"},
                       C:{label:"กลุ่ม C · หาง",cc:"#9aa0a6"} }[abcModalCls];
        const list = abc.groups[abcModalCls] || [];
        return (
          <div onClick={()=>setAbcModalCls(null)}
               style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:1000,
                       display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
            <div onClick={e=>e.stopPropagation()}
                 style={{background:"#fff",borderRadius:"16px 16px 0 0",width:"100%",maxWidth:640,
                         maxHeight:"82vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{padding:"14px 18px",borderBottom:`2px solid ${meta.cc}`,
                           display:"flex",alignItems:"center",gap:10}}>
                <span style={{width:30,height:30,borderRadius:8,background:meta.cc,color:"#fff",
                              display:"flex",alignItems:"center",justifyContent:"center",
                              fontWeight:800}}>{abcModalCls}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14}}>{meta.label}</div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>{list.length} รายการ · เรียงตามรายได้ทั้งปี</div>
                </div>
                <button onClick={()=>setAbcModalCls(null)}
                        style={{border:"none",background:"var(--g-50)",borderRadius:8,
                                width:32,height:32,cursor:"pointer",fontSize:16}}>✕</button>
              </div>
              <div style={{overflowY:"auto"}}>
                {list.map((p,i) => (
                  <MiniRow key={p.sku} p={p} allCats={allCats}
                    onClick={()=>{ setAbcModalCls(null); setOverviewModalP(p); }}
                    secondary={`${p.cat || "—"} · ขายรวม ${fmtN(p.soldQty)} ชิ้น`}
                    right={role==="owner"
                      ? <span style={{fontSize:12,fontWeight:700,color:meta.cc}}>{fmtB(p.soldRev)}</span>
                      : <span style={{fontSize:11,color:"var(--muted)"}}>#{i+1}</span>}
                    primary={`#${i+1}`}/>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Dead stock ── */}
      {deadStock.count > 0 && (
        <Card title="🧊 สต๊อกตาย · มีของแต่ไม่ขายเลย 2 เดือน"
              sub={`${deadStock.count} รายการ${role==="owner" ? ` · เงินจม ~${fmtB(deadStock.totalValue)}` : ""}`}
              style={{marginTop:20}}>
          <div style={{border:"1px solid var(--bdr)",borderRadius:12,overflow:"hidden",background:"#fff",maxHeight:420,overflowY:"auto"}}>
            {deadStock.list.map(r => (
              <MiniRow key={r.p.sku} p={r.p} allCats={allCats}
                onClick={()=>setOverviewModalP(r.p)}
                secondary={`${r.p.cat || "—"} · คงเหลือ ${fmtN(r.stock)} ชิ้น`}
                right={role==="owner"
                  ? <span style={{fontSize:12,fontWeight:700,color:"#1f6f8b"}}>{fmtB(r.value)}</span>
                  : <span style={{fontSize:11,color:"var(--muted)"}}>{fmtN(r.stock)} ชิ้น</span>}
                primary={null}/>
            ))}
          </div>
        </Card>
      )}

      {overviewModalP && <ProductModal p={overviewModalP} onClose={() => setOverviewModalP(null)} allCats={allCats}/>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CATEGORIES — All products + sort + gallery
// ─────────────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: "sku",        label: "รหัสสินค้า (SKU)" },
  { value: "bestseller", label: "ขายดี" },
  { value: "revenue",    label: "รายได้สูง" },
  { value: "price-high", label: "ราคาแพง → ถูก" },
  { value: "price-low",  label: "ราคาถูก → แพง" },
  { value: "vendor",     label: "ตามร้าน (Supplier)" },
  { value: "color",      label: "ตามสี" },
  { value: "stock-low",  label: "สต๊อกน้อย → มาก" },
  { value: "stock-high", label: "สต๊อกมาก → น้อย" },
  { value: "name",       label: "ชื่อ A→Z" },
];

// Compare SKUs naturally: letters prefix → numeric color part → numeric sequence part
// e.g. RT09050 → ["RT", 9, 50]  so RT09050 < RT09100 < RT10001
function compareSku(a, b) {
  const parse = (sku) => {
    if (!sku) return ["", 9999, 9999];
    const m = String(sku).match(/^([A-Za-z]+)(\d{2})(\d+)$/);
    if (m) return [m[1].toUpperCase(), parseInt(m[2], 10), parseInt(m[3], 10)];
    return [String(sku).toUpperCase(), 9999, 9999];
  };
  const [pa, ca, sa] = parse(a.sku);
  const [pb, cb, sb] = parse(b.sku);
  return pa.localeCompare(pb) || ca - cb || sa - sb;
}

const COLOR_ORDER = ["แดง","ส้ม","เหลือง","เขียว","ฟ้า","น้ำเงิน","ม่วง","ชมพู","ขาว","ครีม","น้ำตาล","ทอง","เงิน","ดำ","บานเย็น","มิ้นต์","พีช","เบจ"];

const CAT_EMOJI = {
  "Realtouch":                 "🌷",
  "ดอกไม้":                   "🌸",
  "บูช":                      "💐",
  "ไม้แซม":                   "🌾",
  "ดอกหญ้า":                  "🌼",
  "ใบ":                       "🍃",
  "ใบบูช":                    "🌿",
  "ใบไม้แขวน":                "🍂",
  "กิ่งไม้":                  "🪵",
  "กุหลาบหิน":                "🌵",
  "ต้นไม้":                   "🌳",
  "แจกันแก้ว":                "🏺",
  "เรซิ่น":                   "🎨",
  "Made to Order จัดแบบพิเศษ":"🎁",
};

const COLOR_MAP = {
  // ── base ──────────────────────────────────────────────────────────────────
  "บานเย็น":     { name:"บานเย็น",    hex:"#a82a6a", en:"Magenta" },
  "มิ้นต์":      { name:"มิ้นต์",     hex:"#9adcc1", en:"Mint" },
  "พีช":         { name:"พีช",        hex:"#e8b4a0", en:"Peach" },
  "ครีม":        { name:"ครีม",       hex:"#f0e2c0", en:"Cream" },
  "เบจ":         { name:"เบจ",        hex:"#d4bc94", en:"Beige" },
  "ทอง":         { name:"ทอง",        hex:"#c89030", en:"Gold" },
  "เงิน":        { name:"เงิน",       hex:"#bcbcbc", en:"Silver" },
  "ขาว":         { name:"ขาว",        hex:"#f4f4f4", en:"White" },
  "ดำ":          { name:"ดำ",         hex:"#2a2a2a", en:"Black" },
  // ── น้ำเงิน ────────────────────────────────────────────────────────────────
  "น้ำเงินเข้ม": { name:"น้ำเงินเข้ม", hex:"#1c3060", en:"NavyDark" },
  "น้ำเงินอ่อน": { name:"น้ำเงินอ่อน", hex:"#7096d0", en:"NavyLight" },
  "น้ำเงิน":     { name:"น้ำเงิน",    hex:"#2e4d8f", en:"Navy" },
  // ── น้ำตาล ────────────────────────────────────────────────────────────────
  "น้ำตาลเข้ม": { name:"น้ำตาลเข้ม", hex:"#4a2810", en:"BrownDark" },
  "น้ำตาลอ่อน": { name:"น้ำตาลอ่อน", hex:"#c9a070", en:"BrownLight" },
  "น้ำตาล":     { name:"น้ำตาล",    hex:"#7a4e2a", en:"Brown" },
  // ── เหลือง ────────────────────────────────────────────────────────────────
  "เหลืองเข้ม": { name:"เหลืองเข้ม", hex:"#c89010", en:"YellowDark" },
  "เหลืองอ่อน": { name:"เหลืองอ่อน", hex:"#fde98c", en:"YellowLight" },
  "เหลือง":     { name:"เหลือง",    hex:"#f4c220", en:"Yellow" },
  // ── เขียว ─────────────────────────────────────────────────────────────────
  "เขียวเข้ม":  { name:"เขียวเข้ม",  hex:"#1e5c1e", en:"GreenDark" },
  "เขียวอ่อน":  { name:"เขียวอ่อน",  hex:"#80c880", en:"GreenLight" },
  "เขียว":      { name:"เขียว",     hex:"#3a8f3a", en:"Green" },
  // ── ชมพู ──────────────────────────────────────────────────────────────────
  "ชมพูเข้ม":   { name:"ชมพูเข้ม",   hex:"#d43878", en:"PinkDark" },
  "ชมพูอ่อน":   { name:"ชมพูอ่อน",   hex:"#f5c6d8", en:"PinkLight" },
  "ชมพู":       { name:"ชมพู",      hex:"#e88aa6", en:"Pink" },
  // ── ฟ้า ───────────────────────────────────────────────────────────────────
  "ฟ้าเข้ม":    { name:"ฟ้าเข้ม",    hex:"#2878b8", en:"SkyDark" },
  "ฟ้าอ่อน":    { name:"ฟ้าอ่อน",    hex:"#b0d8f5", en:"SkyLight" },
  "ฟ้า":        { name:"ฟ้า",       hex:"#5aa3d6", en:"Sky" },
  // ── แดง ───────────────────────────────────────────────────────────────────
  "แดงเข้ม":    { name:"แดงเข้ม",    hex:"#880000", en:"RedDark" },
  "แดงอ่อน":    { name:"แดงอ่อน",    hex:"#e87070", en:"RedLight" },
  "แดง":        { name:"แดง",       hex:"#c5352a", en:"Red" },
  // ── ส้ม ───────────────────────────────────────────────────────────────────
  "ส้มเข้ม":    { name:"ส้มเข้ม",    hex:"#c85010", en:"OrangeDark" },
  "ส้มอ่อน":    { name:"ส้มอ่อน",    hex:"#f5c080", en:"OrangeLight" },
  "ส้ม":        { name:"ส้ม",       hex:"#e6862a", en:"Orange" },
  // ── ม่วง ──────────────────────────────────────────────────────────────────
  "ม่วงเข้ม":   { name:"ม่วงเข้ม",   hex:"#501878", en:"PurpleDark" },
  "ม่วงอ่อน":   { name:"ม่วงอ่อน",   hex:"#c0a0e0", en:"PurpleLight" },
  "ม่วง":       { name:"ม่วง",      hex:"#7c4ea8", en:"Purple" },
  // ── เทา ───────────────────────────────────────────────────────────────────
  "เทาเข้ม":    { name:"เทาเข้ม",    hex:"#505050", en:"GrayDark" },
  "เทาอ่อน":    { name:"เทาอ่อน",    hex:"#cccccc", en:"GrayLight" },
  "เทา":        { name:"เทา",       hex:"#909090", en:"Gray" },
};
// Longer/compound first → "เขียวเข้ม" matches before "เขียว", "น้ำเงิน" before "เงิน"
const COLOR_KEYS = [
  "บานเย็น",
  "น้ำเงินเข้ม","น้ำเงินอ่อน","น้ำเงิน",
  "น้ำตาลเข้ม","น้ำตาลอ่อน","น้ำตาล",
  "มิ้นต์","พีช","ครีม","เบจ","ทอง","เงิน",
  "เหลืองเข้ม","เหลืองอ่อน","เหลือง",
  "เขียวเข้ม","เขียวอ่อน","เขียว",
  "ชมพูเข้ม","ชมพูอ่อน","ชมพู",
  "ฟ้าเข้ม","ฟ้าอ่อน","ฟ้า",
  "แดงเข้ม","แดงอ่อน","แดง",
  "ส้มเข้ม","ส้มอ่อน","ส้ม",
  "ม่วงเข้ม","ม่วงอ่อน","ม่วง",
  "เทาเข้ม","เทาอ่อน","เทา",
  "ขาว","ดำ",
];
function detectColor(text) {
  if (!text) return null;
  const s = String(text);
  for (const k of COLOR_KEYS) if (s.indexOf(k) >= 0) return COLOR_MAP[k];
  return null;
}

// Consistent stock quantity: prefer qtyStore+qtyWH when those fields exist,
// fall back to p.qty (Zort grand-total which may include other branches).
// Used everywhere a "current stock" number is needed.
function stockQty(p) {
  return (p.qtyStore > 0 || p.qtyWH > 0)
    ? (p.qtyStore || 0) + (p.qtyWH || 0)
    : (p.qty || 0);
}

// Warehouse-only qty: warehouseQty (from Sheet) → qtyWH (from Zort upload) → qty fallback.
// Used in StockCount/Storage views where we want warehouse stock only (not store+WH combined).
function whQty(p) {
  if (!p) return 0;
  if (p.warehouseQty != null) return p.warehouseQty;
  if (p.qtyWH        != null) return p.qtyWH;
  return p.qty != null ? p.qty : 0;
}

// Strip "#1", "#10", trailing numbers, etc. from MTO product names
// "แจกันชุด#1" → "แจกันชุด", "แจกันชุด 5 อะไร" → "แจกันชุด"
function mtoBase(name) {
  if (!name) return 'งานพิเศษ';
  return String(name)
    .replace(/\s*#\s*\d+.*$/, '')
    .replace(/\s+\d+\s*$/, '')
    .trim() || 'งานพิเศษ';
}

function CategoryView({ data, role }) {
  const { products } = data;
  const allCats = uM(() => {
    const s = new Set();
    products.forEach(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า" && s.add(p.cat));
    // Custom sort order
    const CAT_ORDER = [
      "Realtouch",
      "ดอกไม้",
      "บูช",
      "ไม้แซม",
      "ดอกหญ้า",
      "ใบ",
      "ใบบูช",
      "ใบไม้แขวน",
      "กิ่งไม้",
      "กุหลาบหิน",
      "ต้นไม้",
      "แจกันแก้ว",
      "เรซิ่น",
    ];
    return [...s].sort((a, b) => {
      const idxA = CAT_ORDER.indexOf(a);
      const idxB = CAT_ORDER.indexOf(b);
      if (idxA >= 0 && idxB >= 0) return idxA - idxB;
      if (idxA >= 0) return -1;
      if (idxB >= 0) return 1;
      return a.localeCompare(b, "th");
    });
  }, [products]);
  const [active, setActive] = uS(""); // "" = ทั้งหมด (default)
  const [globalSearch, setGlobalSearch] = uS("");
  const [reorderFilter, setReorderFilter] = uS(false); // 🛒 ควรสั่ง (หน้าร้าน ≤12 && คลังมีของ)
  const [sortBy, setSortBy] = uS("sku");
  const [page, setPage] = uS(1); // pagination (20/หน้า)
  const listTopRef = React.useRef(null);
  const [colorFilter, setColorFilter] = uS(null);
  const [supplierFilter, setSupplierFilter] = uS(null);
  const [deadFilter, setDeadFilter] = uS(null); // เกณฑ์ "สินค้าจมเกิน N เดือน" (null = ไม่กรอง)
  const [newStockFilter, setNewStockFilter] = uS(false);
  const [purchasePlanMode, setPurchasePlanMode] = uS(role === "owner");
  const [supplierPage, setSupplierPage] = uS(0);
  const [orderProduct, setOrderProduct] = uS(null);
  const [globalVendor, setGlobalVendor] = uS(null); // global supplier filter (all categories)
  // Android back: ถ้ากำลังดู supplier view → กด back = ล้าง supplier filter
  useBackHandler(globalVendor ? () => { setGlobalVendor(null); setPage(1); } : null);
  const [viewMode, setViewMode] = uS('grid');
  // ── helper: parse DD/MM/YYYY → Date ──
  const parseStockDate = (str) => {
    if (!str) return null;
    const p = str.split("/");
    if (p.length !== 3) return null;
    return new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
  };
  const isNew45 = (dateStr) => {
    const d = parseStockDate(dateStr);
    if (!d || isNaN(d)) return false;
    return (new Date() - d) / (1000*60*60*24) <= 45;
  };

  const isMtoCat = active === "Made to Order จัดแบบพิเศษ";

  const sortFn = uC((a, b) => {
    switch (sortBy) {
      case "sku":        return compareSku(a, b);
      case "bestseller": return (b.soldQty - a.soldQty) || compareSku(a, b);
      case "revenue":    return (b.soldRev - a.soldRev) || compareSku(a, b);
      case "price-high": return ((b.price||0) - (a.price||0)) || compareSku(a, b);
      case "price-low":  return ((a.price||0) - (b.price||0)) || compareSku(a, b);
      case "vendor":     return (a.vendor||"zzz").localeCompare(b.vendor||"zzz") || compareSku(a, b);
      case "color": {
        const ao = a.color ? COLOR_ORDER.indexOf(a.color.name) : 99;
        const bo = b.color ? COLOR_ORDER.indexOf(b.color.name) : 99;
        return ((ao===-1?99:ao) - (bo===-1?99:bo)) || compareSku(a, b);
      }
      case "stock-low":  return (a.qty - b.qty) || compareSku(a, b);
      case "stock-high": return (b.qty - a.qty) || compareSku(a, b);
      case "name":       return a.name.localeCompare(b.name) || compareSku(a, b);
      default: return compareSku(a, b);
    }
  }, [sortBy]);

  const isGlobalSearch = globalSearch.trim().length > 0;
  const isGlobalVendor = !!globalVendor;

  // All vendors across every category (for the supplier picker)
  const allVendors = uM(() => {
    const m = {};
    products.forEach(p => {
      const v = p.vendor;
      if (!v) return;
      if (!m[v]) m[v] = { code: v, count: 0, totalQty: 0 };
      m[v].count++;
      m[v].totalQty += stockQty(p);
    });
    return Object.values(m).sort((a, b) => b.count - a.count);
  }, [products]);

  // ควรสั่ง = หน้าร้านเหลือ ≤12 && คลังยังมีของ (ไม่นับ MTO)
  const needsReorder = uC((p) => {
    if (p.isMTO) return false;
    return (p.qtyStore||0) <= 12 && (p.qtyWH||0) > 0;
  }, []);

  const filtered = uM(() => {
    const gq = globalSearch.trim().toLowerCase();
    const applyCommon = (arr) => {
      let f = arr;
      if (gq) f = f.filter(p => (p.sku||"").toLowerCase().includes(gq) || (p.name||"").toLowerCase().includes(gq));
      if (reorderFilter) f = f.filter(needsReorder);
      return f;
    };
    const purchaseSort = (a, b) => (a.qtyStore||0) - (b.qtyStore||0);
    const finalSort = purchasePlanMode ? purchaseSort : sortFn;
    // ── Global vendor mode ──────────────────────────────────────────
    if (globalVendor) {
      let f = products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า" && p.vendor === globalVendor);
      f = applyCommon(f);
      return [...f].sort(finalSort);
    }
    if (gq) {
      // Global: search all categories
      let f = products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า");
      f = applyCommon(f);
      if (newStockFilter) f = f.filter(p => isNew45(p.lastStockInDate));
      return [...f].sort(finalSort);
    }
    // Normal: filter by active category ("" = ทั้งหมด)
    let f = active === ""
      ? products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า")
      : products.filter(p => p.cat === active);
    f = applyCommon(f);
    if (colorFilter) f = f.filter(p => p.color && p.color.name === colorFilter);
    if (supplierFilter) f = f.filter(p => (p.vendor || p.lastSupplier) === supplierFilter);
    if (deadFilter)     f = f.filter(p => p.deadMonths === null || p.deadMonths >= deadFilter);
    if (newStockFilter) f = f.filter(p => isNew45(p.lastStockInDate));
    return [...f].sort(finalSort);
  }, [products, active, globalSearch, globalVendor, colorFilter, supplierFilter, deadFilter, newStockFilter, reorderFilter, needsReorder, sortFn, purchasePlanMode]);

  // reset page เมื่อ filter/category/search เปลี่ยน
  uE(() => { setPage(1); }, [active, globalSearch, globalVendor, colorFilter, supplierFilter, deadFilter, newStockFilter, reorderFilter, sortBy, purchasePlanMode]);

  // pagination — 20 รายการต่อหน้า
  const PAGE_SIZE = 20;
  const visible = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);


  // ── จัดกลุ่มตามร้าน (group filtered set by supplier) ──
  // ใช้ชื่อร้านที่อ่านง่าย: lastSupplier (ชื่อ) ก่อน แล้วค่อย vendor (รหัส)
  const supplierGroups = uM(() => {
    if (viewMode !== 'supplier') return [];
    const m = {};
    const NONE = "ไม่ระบุร้าน";
    filtered.forEach(p => {
      const key = p.lastSupplier || p.vendor || NONE;
      if (!m[key]) m[key] = { name: key, items: [], out: 0, low: 0 };
      m[key].items.push(p);
      if (!p.isMTO) {
        const q = stockQty(p);
        if (q <= 0) m[key].out++;
        else if (q <= 36) m[key].low++;
      }
    });
    return Object.values(m).sort((a, b) => {
      if (a.name === NONE) return 1;
      if (b.name === NONE) return -1;
      // ร้านที่มีของหมดก่อน แล้วเรียงตามชื่อ
      if ((a.out > 0) !== (b.out > 0)) return a.out > 0 ? -1 : 1;
      return a.name.localeCompare(b.name, "th");
    });
  }, [filtered, viewMode]);

  // ── จัดกลุ่มตาม supplier สำหรับ purchase plan mode ──
  const purchaseGroups = uM(function() {
    if (!purchasePlanMode) return [];
    var m = {};
    filtered.forEach(function(p) {
      var sup = (p.lastSupplier || p.vendor || "ไม่ระบุร้าน").trim();
      if (!m[sup]) m[sup] = [];
      m[sup].push(p);
    });
    return Object.keys(m).sort(function(a,b) { return a.localeCompare(b,"th"); })
      .map(function(name) { return { name: name, items: m[name] }; });
  }, [purchasePlanMode, filtered]);

  // reset supplierPage เมื่อ filter/mode/category เปลี่ยน
  uE(function() { setSupplierPage(0); }, [purchasePlanMode, active, globalSearch, colorFilter, supplierFilter, deadFilter, newStockFilter, reorderFilter]);

  // Compute reason tags per product (within this category sort)
  const totalCatRev = filtered.reduce((s,p) => s + p.soldRev, 0);
  const reasonMap = uM(() => {
    const map = {};
    filtered.forEach((p, idx) => {
      const tags = [];
      const m = p.monthly || [];
      // Rising trend: late half avg > early half avg × 1.4
      if (m.length >= 4) {
        const half = Math.floor(m.length / 2);
        const early = m.slice(0, half).reduce((s,x) => s + x.qty, 0) / half;
        const late  = m.slice(half).reduce((s,x) => s + x.qty, 0) / (m.length - half);
        if (early > 0 && late >= early * 1.4) tags.push({ text:"กำลังมาแรง 📈", color:"#2a9b56" });
      }
      // Consistent: sold in 3+ months
      const soldMonths = m.filter(x => x.qty > 0).length;
      if (soldMonths >= 3 && idx > 0) tags.push({ text:"ขายสม่ำเสมอ", color:"#1f6f8b" });
      // High turnover: soldQty > stock
      if (stockQty(p) > 0 && p.soldQty > stockQty(p) * 2) tags.push({ text:"ขายเร็ว ⚡", color:"#c2570a" });
      // Top revenue contributor in cat
      if (totalCatRev > 0 && p.soldRev / totalCatRev > 0.15 && idx > 0)
        tags.push({ text:`${(p.soldRev/totalCatRev*100).toFixed(0)}% รายได้หมวด`, color:"#a07417" });
      // New arrival
      if (p.lastStockInISO) {
        const daysAgo = (Date.now() - new Date(p.lastStockInISO).getTime()) / 86400000;
        if (daysAgo <= 30) tags.push({ text:"สินค้าใหม่ 🆕", color:"#705d96" });
      }
      map[p.sku] = tags.slice(0, 2);
    });
    return map;
  }, [filtered, totalCatRev]);

  const catStats = uM(() => {
    // "" = ทั้งหมด
    const f = active === ""
      ? products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า")
      : products.filter(p => p.cat === active);
    return {
      n: f.length,
      stock: f.reduce((s,p)=>s+stockQty(p),0),
      sold: f.reduce((s,p)=>s+p.soldQty,0),
      rev: f.reduce((s,p)=>s+p.soldRev,0),
      stockValue: f.reduce((s,p)=>s+(stockQty(p)*p.price),0),
    };
  }, [products, active]);

  // Supplier list for this category (ใช้สำหรับ dropdown filter)
  const supplierList = uM(() => {
    const m = {};
    const base = active === ""
      ? products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า")
      : products.filter(p => p.cat === active);
    base.forEach(p => {
      const s = p.vendor || p.lastSupplier;
      if (s) m[s] = (m[s] || 0) + 1;
    });
    return Object.entries(m).map(([name, count]) => ({ name, count }))
      .sort((a,b) => b.count - a.count);
  }, [products, active]);

  // Colors in this category for filter chips
  const colorChips = uM(() => {
    const m = {};
    const colorBase = active === ""
      ? products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า")
      : products.filter(p => p.cat === active);
    colorBase.forEach(p => {
      if (p.color) { if (!m[p.color.name]) m[p.color.name] = { count: 0, hex: p.color.hex }; m[p.color.name].count++; }
    });
    return Object.entries(m).map(([name, v]) => ({ name, ...v }))
      .sort((a,b) => (COLOR_ORDER.indexOf(a.name)===-1?99:COLOR_ORDER.indexOf(a.name)) -
                     (COLOR_ORDER.indexOf(b.name)===-1?99:COLOR_ORDER.indexOf(b.name)));
  }, [products, active]);

  const color = catColor(active, allCats);

  return (
    <div style={{width:"100%",minWidth:0,boxSizing:"border-box",overflowX:"hidden"}}>
      <div className="page-head">
        <div>
          <div className="page-title">หมวดหมู่สินค้า</div>
          <div className="page-sub">{purchasePlanMode ? `เรียงจากสต็อกหน้าร้านน้อยสุด · ${filtered.length} รายการ` : "ดูสินค้าทุกตัวในแต่ละหมวด · เรียงตามขายดี / ราคา / Supplier / สี"}</div>
        </div>
        {role === "owner" && (
          <div style={{display:"flex",gap:4,border:"1px solid #e5e7eb",borderRadius:8,overflow:"hidden",flexShrink:0}}>
            <button onClick={() => setPurchasePlanMode(false)}
              style={{padding:"6px 14px",fontSize:13,border:"none",fontFamily:"inherit",cursor:"pointer",
                      background:!purchasePlanMode?"#2563eb":"#f9fafb",
                      color:!purchasePlanMode?"#fff":"#374151"}}>
              🛍️ ดูสินค้า
            </button>
            <button onClick={() => setPurchasePlanMode(true)}
              style={{padding:"6px 14px",fontSize:13,border:"none",fontFamily:"inherit",cursor:"pointer",
                      background:purchasePlanMode?"#2563eb":"#f9fafb",
                      color:purchasePlanMode?"#fff":"#374151"}}>
              📋 จัดซื้อ
            </button>
          </div>
        )}
      </div>

      {/* ── Global Search Bar ── */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <div style={{position:"relative",flex:1}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",
                        color:"var(--muted)",pointerEvents:"none",display:"flex"}}>
            <Icon d={["M11 19 A8 8 0 1 0 11 3 a8 8 0 0 0 0 16 Z","M21 21 L16.65 16.65"]} size={17}/>
          </span>
          <input
            value={globalSearch}
            onChange={e => { setGlobalSearch(e.target.value); if (e.target.value) setReorderFilter(false); }}
            placeholder="ค้นหาสินค้าทั้งหมด (SKU / ชื่อ)..."
            style={{
              width:"100%", padding:"11px 40px 11px 38px",
              borderRadius:12, fontSize:15, fontFamily:"inherit",
              border: isGlobalSearch ? "2px solid var(--g-500)" : "1.5px solid var(--bdr)",
              background: isGlobalSearch ? "#f0fdf4" : "#fafcf7",
              boxSizing:"border-box", outline:"none",
              transition:"border-color .15s, background .15s",
            }}/>
          {isGlobalSearch && (
            <button onClick={() => setGlobalSearch("")}
              style={{
                position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
                background:"none",border:"none",cursor:"pointer",
                color:"var(--muted)",fontSize:18,lineHeight:1,padding:"4px",
              }}>✕</button>
          )}
        </div>
        <ScanButton size={44} onScan={sku => { setGlobalSearch(sku); setReorderFilter(false); }}
          style={{borderRadius:12,border:"1.5px solid var(--bdr)",background:"#fafcf7"}}/>
        </div>
        {isGlobalSearch && (
          <div style={{
            marginTop:6, fontSize:12.5, color:"var(--g-700)", fontWeight:600,
            display:"flex", alignItems:"center", gap:6,
          }}>
            <span style={{width:8,height:8,borderRadius:"50%",background:"var(--g-500)",display:"inline-block"}}/>
            พบ {filtered.length} รายการ จากทุกหมวดหมู่
            {filtered.length === 0 && <span style={{color:"var(--muted)",fontWeight:400}}>— ลองค้นหาด้วยคำอื่น</span>}
          </div>
        )}

        {/* ── Supplier input ── */}
        {allVendors.length > 0 && !isGlobalSearch && (
          <div style={{marginTop:10, position:"relative"}}>
            <datalist id="vendor-list">
              {allVendors.map(v => <option key={v.code} value={v.code}/>)}
            </datalist>
            <input
              list="vendor-list"
              placeholder="🏭 พิมพ์ชื่อ Supplier..."
              value={globalVendor || ""}
              onChange={e => {
                const val = e.target.value.trim();
                const match = allVendors.find(v => v.code.toUpperCase() === val.toUpperCase());
                const newVendor = match ? match.code : (val === "" ? null : val || null);
                setGlobalVendor(newVendor);
                if (newVendor) setReorderFilter(false);
                setPage(1);
              }}
              style={{
                width:"100%", padding:"11px 40px 11px 14px",
                borderRadius:10, fontSize:14, fontFamily:"monospace",
                fontWeight:700,
                border: globalVendor ? "2px solid var(--g-500)" : "1.5px solid var(--bdr)",
                background: globalVendor ? "#f0fdf4" : "#fff",
                boxSizing:"border-box", outline:"none",
              }}
            />
            {globalVendor && (
              <button onClick={() => { setGlobalVendor(null); setPage(1); }}
                style={{position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
                        background:"none", border:"none", cursor:"pointer",
                        fontSize:18, color:"var(--muted)", lineHeight:1, padding:"4px"}}>
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Category Dropdown (mobile) / removed pill nav ── */}
      {!isGlobalVendor && (
        <div style={{marginBottom:14}}>
          <select
            value={active}
            onChange={e => { setActive(e.target.value); setColorFilter(null); setSupplierFilter(null); setDeadFilter(null); setNewStockFilter(false); setPage(1); }}
            style={{
              width:"100%", padding:"10px 14px", borderRadius:12,
              border:"1.5px solid var(--bdr)", background:"#fafcf7",
              fontSize:14, fontWeight:600, fontFamily:"inherit",
              cursor:"pointer", boxSizing:"border-box",
              color:"var(--text)", outline:"none",
            }}>
            <option value="">📋 ทั้งหมด ({products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า").length})</option>
            {allCats.map(c => {
              const n = products.filter(p => p.cat === c).length;
              return <option key={c} value={c}>{CAT_EMOJI[c] || "📁"} {c} ({n})</option>;
            })}
          </select>
        </div>
      )}

      <div className="cat-layout"
           style={isGlobalVendor || isGlobalSearch ? {gridTemplateColumns:"1fr"} : undefined}>
        {/* Sidebar — hidden on mobile and in vendor/search mode */}
        <Card padding={false} className="cat-sidebar"
              style={{padding:"12px 8px",alignSelf:"start",position:"sticky",top:80,
                      display: (isGlobalVendor || isGlobalSearch) ? "none" : undefined}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",
                       letterSpacing:".08em",padding:"6px 12px"}}>
            หมวดหมู่ ({allCats.length})
          </div>
          <div className="cat-list" style={{maxHeight:"calc(100vh - 200px)",overflowY:"auto"}}>
            {allCats.map(c => {
              const n = products.filter(p => p.cat === c).length;
              const cc = catColor(c, allCats);
              const isMto = c === "Made to Order จัดแบบพิเศษ";
              return (
                <button key={c} onClick={() => { setActive(c); setColorFilter(null); setSupplierFilter(null); setDeadFilter(null); setNewStockFilter(false); setPage(1); }}
                        style={{
                          display:"flex",alignItems:"center",gap:8,width:"100%",
                          padding:"8px 12px",border:"none",cursor:"pointer",
                          background: active===c ? cc+"18" : "transparent",
                          borderLeft: active===c ? `3px solid ${cc}` : "3px solid transparent",
                          fontFamily:"inherit", fontSize:12.5, fontWeight: active===c?600:500,
                          color: active===c ? "var(--text)" : "var(--muted)",
                          textAlign:"left", transition:"all .12s",
                        }}>
                  <span style={{fontSize:15,flexShrink:0}}>{CAT_EMOJI[c] || "📁"}</span>
                  <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {isMto ? "🎁 งานจัดพิเศษ (MTO)" : c}
                  </span>
                  <span style={{fontSize:10,color:"var(--light)",fontWeight:500}}>{n}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <div style={{minWidth:0, width:"100%", boxSizing:"border-box", overflow:"hidden"}}>
          {/* KPIs — hide in global search / vendor mode */}
          <div className="row row-4" style={{marginBottom:18, display: (isGlobalSearch||isGlobalVendor) ? "none" : undefined}}>
            <KPI label="สินค้าในหมวด" accent={color} icon={I.layers} value={fmtN(catStats.n)} sub="SKU"/>
            {!isMtoCat ? (
              <KPI label="สต๊อกคงเหลือ" accent={color} icon={I.package} value={fmtN(catStats.stock)} sub={role === "owner" ? fmtB(catStats.stockValue) : undefined}/>
            ) : (
              <KPI label="ประเภทงาน" accent={color} icon={I.layers}
                   value={fmtN(new Set(products.filter(p=>p.cat===active).map(p=>p.mtoBase)).size)} sub="กลุ่ม"/>
            )}
            <KPI label="ขายไปแล้ว" accent={color} icon={I.cart} value={fmtN(catStats.sold)} sub="ชิ้น (5 เดือน)"/>
            {role === "owner" && <KPI label="รายได้รวม" accent={color} icon={I.sales} value={fmtB(catStats.rev)} sub={"หมวดนี้"}/>}
          </div>

          {/* Controls — hide in global search / vendor mode */}
          <Card style={{marginBottom:14, display: (isGlobalSearch||isGlobalVendor) ? "none" : undefined, width:"100%", boxSizing:"border-box"}}>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",width:"100%",minWidth:0}}>
              {/* 🛒 ควรสั่ง — quick reorder filter (key action) */}
              {(() => {
                const reorderCount = (active === "" ? products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า" && needsReorder(p)) : products.filter(p => p.cat === active && needsReorder(p))).length;
                return (
                  <button
                    onClick={() => setReorderFilter(v => !v)}
                    style={{
                      flex:"1 1 200px", minWidth:0, minHeight:44,
                      display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                      padding:"10px 14px", borderRadius:10, cursor:"pointer",
                      fontFamily:"inherit", fontSize:14, fontWeight:800,
                      border: reorderFilter ? "2px solid #d97706" : "1.5px solid #fbbf24",
                      background: reorderFilter ? "#d97706" : "#fffbeb",
                      color: reorderFilter ? "#fff" : "#b45309",
                      transition:"all .15s",
                    }}>
                    🛒 ควรสั่ง
                    <span style={{
                      fontSize:12, fontWeight:800, padding:"1px 8px", borderRadius:99,
                      background: reorderFilter ? "rgba(255,255,255,.25)" : "#fbbf24",
                      color: reorderFilter ? "#fff" : "#7c2d12",
                    }}>{reorderCount}</span>
                  </button>
                );
              })()}

              {/* Sort — ซ่อนใน purchase mode (sort คือ qtyStore asc ตายตัว) */}
              {!purchasePlanMode && (
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11.5,fontWeight:600,color:"var(--muted)"}}>เรียงตาม</span>
                  <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
                          style={{
                            padding:"8px 12px", borderRadius:9,
                            border:"1px solid var(--bdr)", background:"#fafcf7",
                            fontSize:12.5, fontWeight:600, fontFamily:"inherit",
                            cursor:"pointer",
                          }}>
                    {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Color filter chips */}
            {colorChips.length > 0 && (
              <div className="filter-bar" style={{marginTop:12,paddingTop:12,borderTop:"1px dashed var(--bdr)"}}>
                <span className="filter-bar-label">🎨 สี</span>
                <div className="filter-chips">
                  <button className={`fchip${colorFilter===null?' active':''}`}
                          onClick={()=>setColorFilter(null)}>ทั้งหมด</button>
                  {colorChips.map(c => (
                    <button key={c.name} className={`fchip${colorFilter===c.name?' active-color':''}`}
                            style={colorFilter===c.name?{borderColor:"var(--text)",background:"#f3f5f0"}:{}}
                            onClick={()=>setColorFilter(c.name===colorFilter?null:c.name)}>
                      <span style={{width:10,height:10,borderRadius:"50%",background:c.hex,
                                    border:"1px solid rgba(0,0,0,.1)",display:"inline-block",marginRight:4,verticalAlign:"middle"}}/>
                      {c.name} <span style={{opacity:.6}}>{c.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Supplier filter — dropdown แทน chips เพราะอาจมีร้านเยอะ */}
            {supplierList.length > 0 && (
              <div className="filter-bar" style={{marginTop:10,paddingTop:10,borderTop:"1px dashed var(--bdr)"}}>
                <span className="filter-bar-label">🏪 ร้าน</span>
                <select
                  value={supplierFilter || ""}
                  onChange={e => { setSupplierFilter(e.target.value || null); setPage(1); }}
                  style={{
                    flex:1, minWidth:0, minHeight:44, padding:"8px 12px",
                    borderRadius:9, border: supplierFilter ? "2px solid var(--g-500)" : "1px solid var(--bdr)",
                    background: supplierFilter ? "var(--g-50)" : "#fafcf7",
                    fontSize:13, fontWeight:600, fontFamily:"inherit", cursor:"pointer",
                    color:"var(--text)", outline:"none", boxSizing:"border-box",
                  }}>
                  <option value="">🏪 ทุกร้าน</option>
                  {supplierList.map(s => (
                    <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
                  ))}
                </select>
              </div>
            )}

            {/* New stock filter — แสดงตลอด: มีของ=เหลือง clickable, ไม่มี=เทา disabled */}
            {(() => {
              const newCount = products.filter(p => (active === "" || p.cat === active) && isNew45(p.lastStockInDate)).length;
              const hasNew = newCount > 0;
              return (
                <div className="filter-bar" style={{marginTop:10,paddingTop:10,borderTop:"1px dashed var(--bdr)"}}>
                  <span className="filter-bar-label">✨ ใหม่</span>
                  <div className="filter-chips">
                    <button className={`fchip${!newStockFilter?' active':''}`}
                            onClick={() => setNewStockFilter(false)}>ทั้งหมด</button>
                    <button className={`fchip${newStockFilter?' active':''}`}
                            onClick={hasNew ? () => setNewStockFilter(v => !v) : undefined}
                            style={!hasNew ? {
                              opacity:0.45, cursor:"default",
                              background:"var(--g-100)", borderColor:"var(--bdr)",
                              color:"var(--g-500)",
                            } : newStockFilter ? {
                              background:"#fff8e1", borderColor:"#f59e0b",
                              color:"#a07417", fontWeight:700,
                            } : {}}>
                      🆕 เข้าคลังใน 45 วัน
                      <span style={{
                        marginLeft:6, fontSize:11, fontWeight:700,
                        background: newStockFilter ? "#f59e0b" : "var(--g-200)",
                        color: newStockFilter ? "#fff" : "var(--g-800)",
                        padding:"1px 6px", borderRadius:99,
                      }}>{newCount}</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* สินค้าจม (dead stock) filter — นับจากวันโอนสาย5→หน้าร้านล่าสุด เฉพาะที่ยังมีสต็อกในคลัง */}
            {(() => {
              const inCat = products.filter(p => p.cat === active);
              // เกณฑ์ตายตัว แสดงเฉพาะระดับที่มีสินค้าเข้าข่ายจริง
              const buckets = [2, 3, 6, 12].filter(mo => inCat.some(p => (p.deadMonths || 0) >= mo));
              if (buckets.length === 0) return null;
              return (
                <div className="filter-bar" style={{marginTop:10,paddingTop:10,borderTop:"1px dashed var(--bdr)"}}>
                  <span className="filter-bar-label">⏳ สินค้าจม</span>
                  <div className="filter-chips">
                    <button className={`fchip${deadFilter===null?' active':''}`}
                            onClick={() => setDeadFilter(null)}>ทั้งหมด</button>
                    {buckets.map(mo => {
                      const cnt = inCat.filter(p => (p.deadMonths || 0) >= mo).length;
                      return (
                        <button key={mo} className={`fchip${deadFilter===mo?' active':''}`}
                                onClick={() => setDeadFilter(mo===deadFilter ? null : mo)}
                                style={deadFilter===mo ? {
                                  background:"#fff1f0", borderColor:"#ef4444",
                                  color:"#b91c1c", fontWeight:700,
                                } : {}}>
                          จมเกิน {mo} เดือน+
                          <span style={{
                            marginLeft:6, fontSize:11, fontWeight:700,
                            background: deadFilter===mo ? "#ef4444" : "var(--g-200)",
                            color: deadFilter===mo ? "#fff" : "var(--g-800)",
                            padding:"1px 6px", borderRadius:99,
                          }}>{cnt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </Card>

          {/* Header */}
          {!isGlobalSearch && !isGlobalVendor && (
            <div className="sec-head" style={{margin:"4px 0 14px"}}>
              <div>
                <div className="sec-title" style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:20,lineHeight:1}}>{active === "" ? "📋" : (CAT_EMOJI[active] || "📁")}</span>
                  <span style={{width:10,height:10,borderRadius:"50%",background:color,flexShrink:0}}/>
                  {active === "" ? "ทั้งหมด" : (isMtoCat ? "งานจัดพิเศษ (MTO)" : active)}
                  <span style={{fontSize:12, fontWeight:500, color:"var(--muted)"}}>
                    · {filtered.length} รายการ
                  </span>
                </div>
                <div className="sec-sub">
                  แสดงหน้า {page} · เรียงตาม {SORT_OPTIONS.find(o=>o.value===sortBy)?.label}
                </div>
              </div>
            </div>
          )}
          {/* Vendor mode header */}
          {isGlobalVendor && (
            <div className="sec-head" style={{margin:"4px 0 14px"}}>
              <div>
                <div className="sec-title">
                  🏭 {globalVendor}
                  <span style={{fontSize:12,fontWeight:500,color:"var(--muted)"}}>
                    · {filtered.length} รายการ
                  </span>
                </div>
                <div className="sec-sub">
                  stock รวม {filtered.reduce((s,p)=>s+stockQty(p),0).toLocaleString()} ชิ้น ·
                  เรียงตาม {SORT_OPTIONS.find(o=>o.value===sortBy)?.label}
                </div>
              </div>
            </div>
          )}

          {/* View toggle */}
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10,gap:4}}>
            <button onClick={() => setViewMode('grid')}
              style={{width:36,height:36,borderRadius:8,border:'1.5px solid var(--bdr)',
                      background: viewMode==='grid' ? '#1b5e20' : '#fff',
                      color: viewMode==='grid' ? '#fff' : 'var(--muted)',
                      cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',
                      justifyContent:'center',transition:'background .15s'}}>⊞</button>
            <button onClick={() => setViewMode('list')}
              style={{width:36,height:36,borderRadius:8,border:'1.5px solid var(--bdr)',
                      background: viewMode==='list' ? '#1b5e20' : '#fff',
                      color: viewMode==='list' ? '#fff' : 'var(--muted)',
                      cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',
                      justifyContent:'center',transition:'background .15s'}}>☰</button>
            <button onClick={() => setViewMode('supplier')} title="จัดกลุ่มตามร้าน"
              style={{height:36,padding:'0 10px',borderRadius:8,border:'1.5px solid var(--bdr)',
                      background: viewMode==='supplier' ? '#1b5e20' : '#fff',
                      color: viewMode==='supplier' ? '#fff' : 'var(--muted)',
                      cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit',
                      display:'flex',alignItems:'center',gap:4,
                      justifyContent:'center',transition:'background .15s'}}>🏭 ตามร้าน</button>
          </div>

          <div ref={listTopRef}/>
          {purchasePlanMode ? (() => {
            const grp = purchaseGroups[supplierPage];
            const total = purchaseGroups.length;
            if (total === 0) return React.createElement(Empty, {title:"ไม่พบสินค้า", sub:"ลองเปลี่ยน filter"});
            return (
              <div>
                {/* Supplier header + navigation */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,
                             background:"var(--g-50)",borderRadius:10,padding:"10px 14px",
                             border:"1px solid var(--bdr)"}}>
                  <span style={{fontSize:18}}>🏭</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:800,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {grp.name}
                    </div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>
                      ร้านที่ {supplierPage+1} จาก {total} · {grp.items.length} รายการ
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={() => { setSupplierPage(function(p){return Math.max(0,p-1);}); if(listTopRef.current) listTopRef.current.scrollIntoView({behavior:"smooth"}); }}
                      disabled={supplierPage===0}
                      style={{padding:"6px 14px",borderRadius:8,border:"1px solid var(--bdr)",
                              background:supplierPage===0?"var(--g-100)":"var(--paper)",
                              cursor:supplierPage===0?"not-allowed":"pointer",
                              fontSize:13,fontFamily:"inherit"}}>
                      ← ก่อนหน้า
                    </button>
                    <button onClick={() => { setSupplierPage(function(p){return Math.min(total-1,p+1);}); if(listTopRef.current) listTopRef.current.scrollIntoView({behavior:"smooth"}); }}
                      disabled={supplierPage===total-1}
                      style={{padding:"6px 14px",borderRadius:8,border:"1px solid var(--bdr)",
                              background:supplierPage===total-1?"var(--g-100)":"#2563eb",
                              color:supplierPage===total-1?"var(--muted)":"#fff",
                              cursor:supplierPage===total-1?"not-allowed":"pointer",
                              fontSize:13,fontFamily:"inherit",fontWeight:600}}>
                      ถัดไป →
                    </button>
                  </div>
                </div>
                {/* Products */}
                <div className="product-grid" style={{width:"100%",boxSizing:"border-box",minWidth:0}}>
                  {grp.items.map(function(p) {
                    return (
                      <div key={p.sku}>
                        <ProductCard p={p} accent={catColor(p.cat,allCats)} allCats={allCats} reasonTags={[]} onOrder={null} role={role}/>
                      </div>
                    );
                  })}
                </div>
                {/* Dot navigation */}
                {total > 1 && (
                  <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:16,flexWrap:"wrap"}}>
                    {purchaseGroups.map(function(g,i) {
                      return (
                        <button key={g.name} onClick={() => { setSupplierPage(i); if(listTopRef.current) listTopRef.current.scrollIntoView({behavior:"smooth"}); }}
                          style={{
                            padding:"4px 10px",borderRadius:20,border:"1px solid var(--bdr)",
                            background:i===supplierPage?"#2563eb":"var(--paper)",
                            color:i===supplierPage?"#fff":"var(--muted)",
                            fontSize:11,cursor:"pointer",fontFamily:"inherit",
                            fontWeight:i===supplierPage?700:400,
                          }}>
                          {g.name.length > 12 ? g.name.slice(0,10)+"…" : g.name}
                          <span style={{marginLeft:4,opacity:.7}}>({g.items.length})</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })() : filtered.length === 0 ? (
            <Empty title="ไม่พบสินค้า" sub={isGlobalSearch ? "ลองค้นหาด้วยคำอื่น" : reorderFilter ? "ไม่มีสินค้าที่ควรสั่ง 🎉" : "หมวดนี้ยังไม่มีสินค้า"}/>
          ) : viewMode === 'list' ? (
            /* ── List view — compact horizontal rows ── */
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {visible.map((p, idx) => {
                const totalQty = stockQty(p);
                const outOfStock = !p.isMTO && totalQty === 0;
                const lowStock = !p.isMTO && totalQty > 0 && totalQty <= 36;
                const accent2 = isGlobalSearch ? catColor(p.cat, allCats) : color;
                return (
                  <div key={p.sku} style={{
                    display:'flex', alignItems:'center', gap:10,
                    background:'#fff', borderRadius:12,
                    border:'1.5px solid ' + (outOfStock ? '#fecaca' : lowStock ? '#fde68a' : 'var(--bdr)'),
                    padding:'8px 10px',
                    boxShadow:'0 1px 3px rgba(0,0,0,.05)',
                    opacity: outOfStock ? 0.7 : 1,
                  }}>
                    {/* Image */}
                    <div style={{width:60,height:60,borderRadius:8,flexShrink:0,overflow:'hidden',
                                 background:'var(--g-50)',border:'1px solid var(--bdr)',
                                 display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {p.imageUrl
                        ? <img src={p.imageUrl} alt={p.name}
                            style={{width:'100%',height:'100%',objectFit:'contain'}}/>
                        : <span style={{fontSize:22}}>{CAT_EMOJI[p.cat] || '📦'}</span>}
                    </div>
                    {/* Info */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2,flexWrap:'wrap'}}>
                        <span style={{fontSize:10,fontWeight:700,color:'var(--g-500)',
                                      fontFamily:'monospace',background:'var(--g-50)',
                                      padding:'1px 5px',borderRadius:4}}>{p.sku}</span>
                        {(isGlobalSearch||isGlobalVendor) && p.cat && (
                          <span style={{fontSize:9,fontWeight:700,color:'#fff',
                                        background:catColor(p.cat,allCats),
                                        padding:'1px 6px',borderRadius:10}}>{p.cat}</span>
                        )}
                        {outOfStock && <span style={{fontSize:9,fontWeight:700,color:'#b91c1c',
                          background:'#fee2e2',padding:'1px 6px',borderRadius:10}}>หมด</span>}
                        {lowStock && !outOfStock && <span style={{fontSize:9,fontWeight:700,
                          color:'#92400e',background:'#fef3c7',padding:'1px 6px',borderRadius:10}}>
                          เหลือ {totalQty}</span>}
                      </div>
                      <div style={{fontSize:12,fontWeight:600,color:'var(--g-800)',lineHeight:1.3,
                                   overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {p.name}
                      </div>
                      <div style={{display:'flex',gap:8,marginTop:3,alignItems:'center'}}>
                        {!p.isMTO && (
                          <span style={{fontSize:11,color:'var(--muted)'}}>
                            🏪 {p.qtyStore||0} · 🏭 {p.qtyWH||0}
                          </span>
                        )}
                        {role==='owner' && (
                          <span style={{fontSize:11,fontWeight:700,color:accent2}}>
                            {fmtB(p.price)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Order button */}
                    {setOrderProduct && !purchasePlanMode && (
                      <button onClick={() => !outOfStock && setOrderProduct(p)}
                        disabled={outOfStock}
                        style={{flexShrink:0,padding:'8px 12px',borderRadius:8,border:'none',
                                background: outOfStock ? 'var(--g-100)' : '#1b5e20',
                                color: outOfStock ? 'var(--muted)' : '#fff',
                                fontSize:12,fontWeight:700,cursor: outOfStock?'not-allowed':'pointer',
                                fontFamily:'inherit',whiteSpace:'nowrap',minHeight:44}}>
                        {outOfStock ? '—' : '🛒 สั่ง'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : viewMode === 'supplier' ? (
            /* ── Group-by-supplier view — sections per ร้าน ── */
            <div style={{display:'flex',flexDirection:'column',gap:18}}>
              {supplierGroups.map(g => (
                <div key={g.name}>
                  {/* Section header — sticky, supplier name + counts + low/out badges */}
                  <div style={{
                    position:'sticky', top:64, zIndex:3,
                    display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
                    background:'#fff', borderRadius:10,
                    border:'1.5px solid var(--bdr)', borderLeft:'4px solid ' + (g.out>0 ? '#dc2626' : g.low>0 ? '#d97706' : '#1b5e20'),
                    padding:'9px 12px', marginBottom:10,
                    boxShadow:'0 1px 4px rgba(0,0,0,.06)',
                  }}>
                    <span style={{fontSize:15,flexShrink:0}}>🏭</span>
                    <span style={{fontSize:14,fontWeight:800,color:'var(--g-800)',
                                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0}}>
                      {g.name}
                    </span>
                    <span style={{fontSize:11,fontWeight:600,color:'var(--muted)',flexShrink:0}}>
                      {g.items.length} รายการ
                    </span>
                    <span style={{flex:1}}/>
                    {g.out > 0 && (
                      <span style={{fontSize:11,fontWeight:800,color:'#b91c1c',
                                    background:'#fee2e2',padding:'2px 8px',borderRadius:99,flexShrink:0}}>
                        🔴 {g.out} หมด
                      </span>
                    )}
                    {g.low > 0 && (
                      <span style={{fontSize:11,fontWeight:800,color:'#92400e',
                                    background:'#fef3c7',padding:'2px 8px',borderRadius:99,flexShrink:0}}>
                        🟡 {g.low} ใกล้หมด
                      </span>
                    )}
                  </div>
                  <div className="product-grid" style={{width:"100%",boxSizing:"border-box",minWidth:0}}>
                    {g.items.map((p, idx) => (
                      <div key={p.sku} style={{position:"relative"}}>
                        {(isGlobalSearch || isGlobalVendor) && p.cat && (
                          <div style={{
                            position:"absolute",top:8,left:8,zIndex:2,
                            background: catColor(p.cat, allCats),
                            color:"#fff", fontSize:9, fontWeight:700,
                            padding:"2px 7px", borderRadius:20,
                            maxWidth:"calc(100% - 16px)",
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                            pointerEvents:"none",
                          }}>{p.cat}</div>
                        )}
                        <ProductCard p={p}
                                     accent={isGlobalSearch ? catColor(p.cat, allCats) : color}
                                     allCats={allCats}
                                     reasonTags={[]}
                                     onOrder={purchasePlanMode ? null : setOrderProduct}
                                     role={role}/>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── Grid view — existing card layout ── */
            <div className="product-grid" style={{width:"100%",boxSizing:"border-box",minWidth:0}}>
              {visible.map((p, idx) => (
                <div key={p.sku} style={{position:"relative"}}>
                  {(isGlobalSearch || isGlobalVendor) && p.cat && (
                    <div style={{
                      position:"absolute",top:8,left:8,zIndex:2,
                      background: catColor(p.cat, allCats),
                      color:"#fff", fontSize:9, fontWeight:700,
                      padding:"2px 7px", borderRadius:20,
                      maxWidth:"calc(100% - 16px)",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                      pointerEvents:"none",
                    }}>{p.cat}</div>
                  )}
                  <ProductCard p={p}
                               rank={!isGlobalSearch && (sortBy==='bestseller' || sortBy==='revenue') ? idx+1 : null}
                               accent={isGlobalSearch ? catColor(p.cat, allCats) : color}
                               allCats={allCats}
                               reasonTags={isGlobalSearch ? [] : (reasonMap[p.sku] || [])}
                               onOrder={setOrderProduct}
                               role={role}/>
                </div>
              ))}
            </div>
          )}
          {/* Pagination — ซ่อนใน purchase mode (มี supplier navigation แทน) และ supplier view */}
          {!purchasePlanMode && viewMode !== 'supplier' && (
            <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} listRef={listTopRef}/>
          )}
        </div>
      </div>
      {orderProduct && <OrderModal product={orderProduct} onClose={() => setOrderProduct(null)}/>}
    </div>
  );
}

// ────────────── Product Card ──────────────
// ────────────── Order Modal ──────────────
const QUICK_QTYS = [24, 36, 48, 60];

function OrderModal({ product, onClose }) {
  useBackHandler(onClose); // Android back = ปิด modal สั่งของ
  const [qty, setQty] = uS(24);
  const [customMode, setCustomMode] = uS(false);
  const [orderType, setOrderType] = uS('รอขึ้นรถ');
  const [loading, setLoading] = uS(false);
  const [done, setDone] = uS(false);
  const [err, setErr] = uS(null);

  const sheetUrl = (typeof GOOGLE_SHEET_URL !== 'undefined') ? GOOGLE_SHEET_URL : null;
  const outOfStock = (product.qtyWH !== undefined ? product.qtyWH : product.qty) <= 0;

  const handleSubmit = () => {
    if (outOfStock) return;
    if (!sheetUrl) { setErr('ไม่พบ GOOGLE_SHEET_URL'); return; }
    if (qty < 1) { setErr('กรุณาระบุจำนวน'); return; }
    setLoading(true); setErr(null);
    const _sep = sheetUrl.includes('?') ? '&' : '?';
    const url = `${sheetUrl}${_sep}action=order&sku=${encodeURIComponent(product.sku)}&qty=${qty}&orderType=${encodeURIComponent(orderType)}`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setDone(true); setTimeout(onClose, 2000); }
        else setErr(d.error || 'เกิดข้อผิดพลาด');
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };

  const btnBase = {borderRadius:8, border:"1px solid var(--bdr)", cursor:"pointer",
                   fontFamily:"inherit", fontWeight:700, fontSize:13, padding:"8px 0",
                   transition:"all .12s"};

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:1500,
      background:"rgba(10,20,10,.6)", backdropFilter:"blur(5px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20
    }}>
      <div onClick={ev => ev.stopPropagation()} style={{
        background:"#fff", borderRadius:16, maxWidth:420, width:"100%",
        boxShadow:"0 20px 60px rgba(0,0,0,.3)", overflow:"hidden"
      }}>
        {/* Header */}
        <div style={{padding:"16px 20px 14px", borderBottom:"1px solid var(--bdr)",
                     display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <div style={{fontWeight:700, fontSize:16}}>🛒 สั่งไปขาย</div>
          <button onClick={onClose} style={{...btnBase, width:44, height:44, padding:0, fontSize:22, color:"var(--muted)"}}>×</button>
        </div>

        {done ? (
          <div style={{padding:40, textAlign:"center"}}>
            <div style={{fontSize:48, marginBottom:12}}>✅</div>
            <div style={{fontWeight:700, fontSize:16, color:"var(--g-700)"}}>บันทึกรายการสำเร็จ</div>
            <div style={{fontSize:12, color:"var(--muted)", marginTop:6}}>ดูได้ที่ Sheet "ลำดับที่สั่งสินค้า"</div>
          </div>
        ) : (
          <div style={{padding:20}}>
            {/* Product info */}
            <div style={{display:"flex", gap:14, marginBottom:18, alignItems:"center",
                         background:"var(--g-50)", borderRadius:10, padding:12}}>
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.name}
                     style={{width:60, height:60, borderRadius:8, objectFit:"contain",
                             background:"#fff", border:"1px solid var(--bdr)", flexShrink:0}}/>
              ) : (
                <div style={{width:60, height:60, borderRadius:8, background:"var(--g-100)",
                             display:"flex",alignItems:"center",justifyContent:"center",
                             fontSize:22, flexShrink:0}}>📦</div>
              )}
              <div style={{minWidth:0}}>
                <span className="skucode" style={{fontSize:10}}>{product.sku}</span>
                <div style={{fontWeight:600, fontSize:13, lineHeight:1.35, marginTop:3}}>{product.name}</div>
                <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>
                  คลัง: <b style={{color: outOfStock ? "var(--dang)" : "var(--g-700)"}}>
                    {outOfStock ? "หมดสต๊อก" : `${fmtN(product.qtyWH ?? product.qty)} ชิ้น`}
                  </b>
                  {product.price > 0 && sessionStorage.getItem("dmj_role") === "owner" && <> · ราคา <b>{fmtB(product.price)}</b></>}
                </div>
              </div>
            </div>

            {outOfStock ? (
              <div style={{background:"#fff0f0", border:"1px solid #fcc", borderRadius:10,
                           padding:16, textAlign:"center", fontSize:13, color:"var(--dang)", fontWeight:600}}>
                ⚠️ สินค้าหมดสต๊อก ไม่สามารถสั่งได้
              </div>
            ) : (<>
              {/* Quick qty */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12, fontWeight:600, color:"var(--muted)", marginBottom:8}}>จำนวนที่สั่ง (ชิ้น)</div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:8}}>
                  {QUICK_QTYS.map(q => (
                    <button key={q} onClick={() => { setQty(q); setCustomMode(false); }}
                            style={{...btnBase,
                              background: !customMode && qty===q ? "var(--g-700)" : "#fff",
                              color: !customMode && qty===q ? "#fff" : "var(--text)",
                              borderColor: !customMode && qty===q ? "var(--g-700)" : "var(--bdr)"}}>
                      {q}
                    </button>
                  ))}
                </div>
                <button onClick={() => setCustomMode(true)}
                        style={{...btnBase, width:"100%",
                          background: customMode ? "var(--g-50)" : "#fff",
                          color: "var(--muted)", borderStyle:"dashed"}}>
                  ✏️ กรอกเอง
                </button>
                {customMode && (
                  <input type="number" value={qty} min={1} autoFocus
                         onChange={ev => setQty(Math.max(1, parseInt(ev.target.value)||1))}
                         style={{marginTop:8, width:"100%", padding:"10px 12px",
                                 border:"1.5px solid var(--g-400)", borderRadius:8,
                                 fontSize:16, fontWeight:700, textAlign:"center",
                                 fontFamily:"inherit", boxSizing:"border-box"}}/>
                )}
              </div>

              {/* Order type */}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12, fontWeight:600, color:"var(--muted)", marginBottom:8}}>ประเภทการรับ</div>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                  {[{v:'หิ้ว',icon:'🚶',sub:'รับที่ร้าน/หิ้วไปเลย'},{v:'รอขึ้นรถ',icon:'🚛',sub:'รอจัดส่งทีหลัง'}].map(t => (
                    <button key={t.v} onClick={() => setOrderType(t.v)}
                            style={{...btnBase, padding:"10px 8px", textAlign:"center",
                              background: orderType===t.v ? "var(--g-700)" : "#fff",
                              color: orderType===t.v ? "#fff" : "var(--text)",
                              borderColor: orderType===t.v ? "var(--g-700)" : "var(--bdr)"}}>
                      <div style={{fontSize:20, marginBottom:3}}>{t.icon}</div>
                      <div style={{fontWeight:700, fontSize:13}}>{t.v}</div>
                      <div style={{fontSize:10, opacity:.75, marginTop:2}}>{t.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {err && (
                <div style={{background:"#fff0f0", border:"1px solid #fcc", borderRadius:8,
                             padding:"8px 12px", fontSize:12, color:"var(--dang)", marginBottom:12}}>
                  ⚠️ {err}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading}
                      style={{...btnBase, width:"100%", padding:"12px", fontSize:14,
                              background:"var(--g-700)", color:"#fff", borderColor:"var(--g-700)"}}>
                {loading
                  ? <><span className="spin" style={{width:14,height:14,borderWidth:2,display:"inline-block",verticalAlign:"middle",marginRight:6}}/> กำลังบันทึก…</>
                  : `✅ ยืนยันสั่ง ${fmtN(qty)} ชิ้น (${orderType})`}
              </button>
            </>)}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({ p, rank, accent, allCats, reasonTags, onOrder, role }) {
  const totalQty = (p.qtyStore > 0 || p.qtyWH > 0) ? (p.qtyStore || 0) + (p.qtyWH || 0) : (p.qty || 0);
  const lowStock = !p.isMTO && totalQty > 0 && totalQty <= 36;
  const outOfStock = !p.isMTO && totalQty === 0;
  const hashHue = (p.sku || "").split("").reduce((a,c) => a + c.charCodeAt(0), 0) % 360;
  const [lightbox, setLightbox] = uS(false);

  // Image (real or placeholder)
  const hasImg = !!p.imageUrl;

  return (
    <>
    <div className="card hover" style={{padding:0, overflow:"hidden", display:"flex", flexDirection:"column"}}>
      {/* Image */}
      <div className="pcard-img" onClick={hasImg ? () => setLightbox(true) : null}
           style={{position:"relative", padding:8, background: "linear-gradient(180deg, var(--g-50), #fff)",
                   cursor: hasImg ? "zoom-in" : "default", flex:"none"}}>
        {hasImg ? (
          <div style={{
            width:"100%", aspectRatio:"1/1", borderRadius:10,
            backgroundImage:`url("${p.imageUrl}")`,
            backgroundSize:"contain", backgroundPosition:"center",
            backgroundRepeat:"no-repeat", backgroundColor:"#fff",
            border:"1px solid var(--bdr)",
          }}/>
        ) : (
          <div className="pimg" style={{
            background: p.color
              ? `linear-gradient(135deg, ${p.color.hex}22, ${accent}11)`
              : `repeating-linear-gradient(${hashHue}deg, #ffffff 0 6px, ${accent}10 6px 12px)`,
          }}>
            <div style={{textAlign:"center",lineHeight:1.6}}>
              {p.color ? (
                <div style={{
                  width:34, height:34, borderRadius:"50%",
                  background: p.color.hex, margin:"0 auto",
                  border:"2px solid #fff",
                  boxShadow:"0 2px 8px rgba(0,0,0,.12)"
                }}/>
              ) : (
                <div style={{fontSize:22,opacity:.4,color:"var(--g-500)"}}>{I.leaf}</div>
              )}
              <div style={{marginTop:6, fontSize:8.5, color:"var(--light)", fontFamily:"JetBrains Mono, monospace"}}>
                {hasImg ? "" : "NO IMAGE"}
              </div>
            </div>
          </div>
        )}

        {/* Rank */}
        {rank != null && (
          <div style={{
            position:"absolute", top:6, left:6,
            background: rank<=3 ? accent : "#fff",
            color: rank<=3 ? "#fff" : "var(--muted)",
            border: rank<=3 ? "none" : "1px solid var(--bdr)",
            fontWeight:800, fontSize:11,
            padding:"3px 8px", borderRadius:6,
          }}>
            {rank===1?"🥇 #1":rank===2?"🥈 #2":rank===3?"🥉 #3":`#${rank}`}
          </div>
        )}

        {/* Stock badge */}
        {outOfStock && <div className="chip dang" style={{position:"absolute",top:6,right:6}}>หมด</div>}
        {lowStock && !outOfStock && (
          <div className="chip warn" style={{position:"absolute",top:6,right:6}}>เหลือ {totalQty}</div>
        )}
        {p.isMTO && (
          <div className="chip" style={{position:"absolute",top:6,right:6, background:"#f3eef9", color:"#705d96", borderColor:"#d8c8e8"}}>MTO</div>
        )}
      </div>

      {/* Body */}
      <div className="pcard-body" style={{padding:"8px 12px 12px"}}>
        <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:5, flexWrap:"wrap"}}>
          <span className="skucode">{p.sku}</span>
          {p.color && (
            <span style={{
              display:"inline-flex",alignItems:"center",gap:4,
              fontSize:10, fontWeight:600, color:"var(--muted)",
            }}>
              <span style={{width:9,height:9,borderRadius:"50%",background:p.color.hex,
                            border:"1px solid rgba(0,0,0,.1)"}}/>
              {p.color.name}
            </span>
          )}
        </div>
        <div style={{fontSize:12.5, fontWeight:600, lineHeight:1.35,
                     overflow:"hidden", display:"-webkit-box",
                     WebkitLineClamp:2, WebkitBoxOrient:"vertical",
                     minHeight:34, marginBottom:4}}>
          {p.name}
        </div>
        {reasonTags && reasonTags.length > 0 && (
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:5}}>
            {reasonTags.map((t,i) => (
              <span key={i} style={{
                fontSize:9.5, fontWeight:700, padding:"2px 6px", borderRadius:5,
                background: t.color+"18", color: t.color,
                border:`1px solid ${t.color}30`, whiteSpace:"nowrap",
              }}>{t.text}</span>
            ))}
          </div>
        )}
        {(p.lastSupplier || p.vendor) && (
          <div className="vendor-line" style={{display:"flex",alignItems:"center",gap:4,fontSize:10.5,color:"var(--muted)",marginBottom:3}}>
            {React.cloneElement(I.store, {size:11})}
            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.lastSupplier || p.vendor}</span>
          </div>
        )}
        {p.lastStockInDate && (
          <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"var(--g-700)",marginBottom:6,fontWeight:600}}>
            <span>📅 เข้าล่าสุด {p.lastStockInDate}</span>
          </div>
        )}
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end",
                     paddingTop:6, borderTop:"1px dashed var(--bdr)"}}>
          <div>
            <div style={{fontSize:9.5, color:"var(--muted)", fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>
              {p.isMTO ? "ขายแล้ว" : "คงเหลือ"}
            </div>
            <div style={{fontSize:14, fontWeight:700, lineHeight:1.2, color:lowStock||outOfStock?"var(--dang)":"var(--text)"}}>
              {p.isMTO ? fmtN(p.soldQty) : fmtN(totalQty)}
              <span style={{fontSize:9.5, color:"var(--muted)", fontWeight:500, marginLeft:3}}>ชิ้น</span>
            </div>
            {!p.isMTO && (p.qtyStore > 0 || p.qtyWH > 0) && (
              <div style={{fontSize:9.5, color:"var(--muted)", marginTop:2, lineHeight:1.3}}>
                🏪 {fmtN(p.qtyStore||0)} · 🏭 {fmtN(p.qtyWH||0)}
              </div>
            )}
          </div>
          {role === 'owner' && (
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:9.5, color:"var(--muted)", fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>ราคา</div>
              <div style={{fontSize:14, fontWeight:800, color:accent, lineHeight:1.2}}>{fmtB(p.price)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Order button */}
      {onOrder && (
        <div className="pcard-order" style={{padding:"0 12px 12px", marginTop:"auto"}}>
          <button onClick={() => !outOfStock && onOrder(p)}
                  disabled={outOfStock}
                  style={{width:"100%", padding:"9px 12px", borderRadius:8,
                          background: outOfStock ? "var(--g-100)" : "var(--g-700)",
                          color: outOfStock ? "var(--muted)" : "#fff",
                          border: outOfStock ? "1px solid var(--bdr)" : "none",
                          fontWeight:700, fontSize:12.5,
                          cursor: outOfStock ? "not-allowed" : "pointer",
                          fontFamily:"inherit", display:"flex", alignItems:"center",
                          justifyContent:"center", gap:6, transition:"background .15s"}}
                  onMouseEnter={e => { if (!outOfStock) e.currentTarget.style.background="var(--g-800)"; }}
                  onMouseLeave={e => { if (!outOfStock) e.currentTarget.style.background="var(--g-700)"; }}>
            {outOfStock ? "⚫ หมดสต๊อก" : "🛒 สั่งไปขาย"}
          </button>
        </div>
      )}
    </div>
    {lightbox && p.imageUrl && <ImageLightbox url={p.imageUrl} name={p.name} onClose={() => setLightbox(false)}/>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// STOCK / ALERTS — absolute thresholds, exclude MTO
// ─────────────────────────────────────────────────────────────────────
const STOCK_PAGE = 20;

function StatusBadge({ p, filter }) {
  if (filter === "out")  return React.createElement("span", {className:"chip dang"}, "หมด!");
  if (filter === "low") {
    if (p.qty < 12)  return React.createElement("span", {className:"chip dang"}, "🚨 ด่วน (" + p.qty + ")");
    if (p.qty < 24)  return React.createElement("span", {className:"chip warn"}, "⚠️ ใกล้หมด (" + p.qty + ")");
    return React.createElement("span", {className:"chip warn"}, "เหลือ " + p.qty + "/" + p.threshold);
  }
  if (filter === "drop") return React.createElement("span", {className:"chip", style:{background:"#f5e7f5",color:"#8a3a8a",borderColor:"#e6cde6"}}, "ลด " + p.dropPct.toFixed(0) + "%");
  if (filter === "slow") return React.createElement("span", {className:"chip info"}, p.soldQty === 0 ? "ไม่เคยขาย" : (p.soldQty/p.qty*100).toFixed(1) + "%");
  if (filter === "over") return React.createElement("span", {className:"chip info"}, (p.monthsLeft > 99 ? ">99" : p.monthsLeft.toFixed(1)) + " เดือน");
  return null;
}

function StockView({ data, role }) {
  const { products, thresholds: dataThresholds } = data;
  const [filter, setFilter] = uS("low");
  const [modalP, setModalP] = uS(null);
  const [page, setPage] = uS(0);
  const [stockSearch, setStockSearch] = uS("");
  // Editable thresholds (persisted in memory)
  const [defaultThr, setDefaultThr] = uS(dataThresholds?.default || 36);
  const [overrides, setOverrides] = uS(dataThresholds?.overrides || { "แจกันแก้ว": 3, "เรซิ่นและอื่นๆ": 3 });
  const [supplierFilter, setSupplierFilter] = uS(null);
  const [activeCat, setActiveCat] = uS("ALL");

  const getThr = uC((cat) => overrides[cat] != null ? overrides[cat] : defaultThr, [overrides, defaultThr]);

  const allCats = uM(() => {
    const s = new Set();
    products.forEach(p => p.cat && s.add(p.cat));
    return [...s].sort();
  }, [products]);

  // Exclude MTO + ไม่มีรหัสสินค้า + empty cat
  const checkable = uM(() => products.filter(p =>
    !p.isMTO &&
    p.cat &&
    p.cat !== "ไม่มีรหัสสินค้า" &&
    p.cat !== "Made to Order จัดแบบพิเศษ"
  ), [products]);

  const enriched = uM(() => checkable.map(p => {
    const currentQty = (p.qtyStore > 0 || p.qtyWH > 0) ? (p.qtyStore || 0) + (p.qtyWH || 0) : (p.qty || 0);
    const avgMonthly = p.soldQty / 5;
    const monthsLeft = avgMonthly > 0 ? currentQty / avgMonthly : null;
    const threshold = getThr(p.cat);
    return { ...p, qty: currentQty, avgMonthly, monthsLeft, threshold };
  }), [checkable, getThr]);

  const nearOut = uM(() => enriched
    .filter(p => p.qty > 0 && p.qty <= p.threshold)
    .sort((a,b) => (a.qty - b.qty) || compareSku(a, b)),
    [enriched]);

  const outOfStock = uM(() => enriched
    .filter(p => p.qty === 0 && p.soldQty > 0)
    .sort((a,b) => (b.soldRev - a.soldRev) || compareSku(a, b)),
    [enriched]);

  const slowMovers = uM(() => enriched
    .filter(p => p.qty >= 20 && (p.soldQty === 0 || (p.soldQty/p.qty) < 0.1))
    .sort((a,b) => (b.qty * b.price) - (a.qty * a.price)),
    [enriched]);

  const overstocked = uM(() => enriched
    .filter(p => p.qty > 50 && p.avgMonthly > 0 && p.monthsLeft > 12)
    .sort((a,b) => b.monthsLeft - a.monthsLeft),
    [enriched]);

  // Sales decline detection: was selling well early, dropped off late
  const declining = uM(() => enriched
    .map(p => {
      const m = p.monthly || [];
      if (m.length < 4) return null;
      const half = Math.floor(m.length / 2);
      const early = m.slice(0, half);
      const late  = m.slice(half);
      const earlyAvg = early.reduce((s,x) => s + (x.qty||0), 0) / early.length;
      const lateAvg  = late.reduce((s,x) => s + (x.qty||0), 0) / late.length;
      if (earlyAvg < 2) return null;                  // too small to matter
      if (lateAvg >= earlyAvg * 0.4) return null;     // not a real drop
      if (p.qty <= 0) return null;                    // already out of stock — different problem
      const dropPct = earlyAvg > 0 ? (1 - lateAvg/earlyAvg) * 100 : 0;
      return { ...p, earlyAvg, lateAvg, dropPct };
    })
    .filter(Boolean)
    .sort((a,b) => b.dropPct - a.dropPct)
    .slice(0, 80),
    [enriched]);

  const allSuppliers = uM(() => {
    const s = new Set();
    checkable.forEach(p => { const v = p.lastSupplier || p.vendor; if (v) s.add(v); });
    return [...s].sort();
  }, [checkable]);

  const lists = { low: nearOut, out: outOfStock, slow: slowMovers, over: overstocked, drop: declining };
  const rawList = lists[filter] || [];

  const list = uM(() => {
    let result = rawList;
    if (activeCat !== "ALL") result = result.filter(p => p.cat === activeCat);
    if (supplierFilter) result = result.filter(p => (p.lastSupplier || p.vendor) === supplierFilter);
    if (!stockSearch) return result;
    const q = stockSearch.toLowerCase();
    return result.filter(p =>
      (p.sku || "").toLowerCase().includes(q) ||
      (p.name || "").toLowerCase().includes(q) ||
      (p.cat || "").toLowerCase().includes(q)
    );
  }, [rawList, stockSearch, supplierFilter, activeCat]);

  const totalPages = Math.ceil(list.length / STOCK_PAGE);
  const paginated  = list.slice(page * STOCK_PAGE, (page + 1) * STOCK_PAGE);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">สต๊อก & แจ้งเตือน</div>
          <div className="page-sub">
            สั่งซื้อสินค้าก่อนหมด · ไม่นับ MTO (งานจัดพิเศษ)
          </div>
        </div>
      </div>

      <div className="row row-5" style={{marginBottom: 20}}>
        <div style={{cursor:"pointer"}} onClick={() => { setFilter("low"); setPage(0); setStockSearch(""); setSupplierFilter(null); setActiveCat("ALL"); }}>
          <KPI label="⚠️ ใกล้หมด — สั่งด่วน" accent="#c2570a" icon={I.warning}
               value={fmtN(nearOut.length)} sub={`≤ ${defaultThr} ชิ้น (ปรับได้)`}/>
        </div>
        <div style={{cursor:"pointer"}} onClick={() => { setFilter("out"); setPage(0); setStockSearch(""); setSupplierFilter(null); setActiveCat("ALL"); }}>
          <KPI label="🚫 หมดสต๊อกแล้ว" accent="#b8341c" icon={I.alert}
               value={fmtN(outOfStock.length)} sub="แต่ยังมียอดขาย"/>
        </div>
        <div style={{cursor:"pointer"}} onClick={() => { setFilter("drop"); setPage(0); setStockSearch(""); setSupplierFilter(null); setActiveCat("ALL"); }}>
          <KPI label="📉 ยอดขายตก" accent="#8a3a8a" icon={I.alert}
               value={fmtN(declining.length)} sub="ขายลดลง > 60%"/>
        </div>
        <div style={{cursor:"pointer"}} onClick={() => { setFilter("slow"); setPage(0); setStockSearch(""); setSupplierFilter(null); setActiveCat("ALL"); }}>
          <KPI label="🐌 สินค้าจมนาน" accent="#a07417" icon={I.package}
               value={fmtN(slowMovers.length)} sub="ขาย < 10% ของสต๊อก"/>
        </div>
        <div style={{cursor:"pointer"}} onClick={() => { setFilter("over"); setPage(0); setStockSearch(""); setSupplierFilter(null); setActiveCat("ALL"); }}>
          <KPI label="📈 สต๊อกเกินจำเป็น" accent="#1f6f8b" icon={I.layers}
               value={fmtN(overstocked.length)} sub="พอขาย > 12 เดือน"/>
        </div>
      </div>

      {/* Threshold editor */}
      <Card title="⚙️ เกณฑ์แจ้งเตือน" sub="เมื่อสต๊อกเหลือถึงจำนวนนี้ ระบบจะแจ้งให้สั่งเพิ่ม"
            style={{marginBottom:16}}>
        <div style={{display:"flex",gap:18,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:12.5,fontWeight:600}}>เกณฑ์ทั่วไป</span>
            <input type="number" value={defaultThr} min="1" max="500"
                   onChange={e=>setDefaultThr(parseInt(e.target.value)||36)}
                   style={{
                     width:80, padding:"7px 10px", borderRadius:8,
                     border:"1.5px solid var(--g-300)", background:"var(--g-50)",
                     fontSize:14, fontWeight:700, color:"var(--g-700)",
                     fontFamily:"inherit", textAlign:"center"
                   }}/>
            <span style={{fontSize:12,color:"var(--muted)"}}>ชิ้น</span>
          </div>

          <div style={{height:24, width:1, background:"var(--bdr)"}}/>

          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:12.5,fontWeight:600}}>ยกเว้น:</span>
            {Object.entries(overrides).map(([cat, val]) => (
              <div key={cat} style={{
                display:"flex",alignItems:"center",gap:6,
                padding:"5px 10px",borderRadius:8,background:"#fafcf7",
                border:"1px solid var(--bdr)"
              }}>
                <span style={{fontSize:12,fontWeight:600,color:catColor(cat, allCats)}}>{cat}</span>
                <input type="number" value={val} min="1" max="500"
                       onChange={e=>setOverrides({...overrides, [cat]: parseInt(e.target.value)||1})}
                       style={{
                         width:50, padding:"3px 6px", borderRadius:5,
                         border:"1px solid var(--bdr)", fontSize:12, fontWeight:700,
                         fontFamily:"inherit", textAlign:"center"
                       }}/>
                <span style={{fontSize:11,color:"var(--muted)"}}>ชิ้น</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{fontSize:11,color:"var(--muted)",marginTop:10,paddingTop:10,borderTop:"1px dashed var(--bdr)"}}>
          💡 แจกันแก้วและเรซิ่นเป็นสินค้าชิ้นใหญ่/ราคาสูง — ตั้งเกณฑ์ต่ำกว่าหมวดอื่น
        </div>
      </Card>

      {/* Filter tabs */}
      <div className="filter-bar" style={{marginBottom:8}}>
        <span className="filter-bar-label">ดูตาม</span>
        <div className="filter-chips">
          {[
            {id:"low",  label:`⚠️ ใกล้หมด`,  count:nearOut.length,    color:"#c2570a"},
            {id:"out",  label:`🚫 หมดสต๊อก`, count:outOfStock.length,  color:"#b8341c"},
            {id:"drop", label:`📉 ยอดขายตก`, count:declining.length,   color:"#8a3a8a"},
            {id:"slow", label:`📦 จมนาน`,    count:slowMovers.length,  color:"#a07417"},
            {id:"over", label:`🗂️ สต๊อกเกิน`,count:overstocked.length, color:"#1f6f8b"},
          ].map(t => (
            <button key={t.id} className={`fchip${filter===t.id?' active':''}`}
                    style={filter===t.id?{background:t.color,borderColor:t.color,color:"#fff",boxShadow:`0 2px 6px ${t.color}55`}:{}}
                    onClick={() => { setFilter(t.id); setPage(0); setStockSearch(""); setSupplierFilter(null); setActiveCat("ALL"); }}>
              {t.label} <span style={{opacity:.8}}>({t.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Category chips */}
      {allCats.length > 1 && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",padding:"8px 0 4px"}}>
          {["ALL", ...allCats].map(function(c) {
            return (
              <button key={c} onClick={function(){ setActiveCat(c); setPage(0); }}
                style={{padding:"4px 10px",borderRadius:999,fontSize:12,border:"1.5px solid",
                        borderColor: activeCat===c?"#2563eb":"#e5e7eb",
                        background: activeCat===c?"#eff6ff":"#fff",
                        color: activeCat===c?"#2563eb":"#374151",
                        cursor:"pointer",fontFamily:"inherit"}}>
                {c === "ALL" ? "ทั้งหมด" : c}
              </button>
            );
          })}
        </div>
      )}

      {/* Supplier filter */}
      {allSuppliers.length > 0 && (
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
          <span className="filter-bar-label">🏪 ร้านที่ซื้อ</span>
          <div style={{position:"relative",display:"flex",alignItems:"center",gap:6}}>
            <input list="supplier-list"
                   value={supplierFilter||""}
                   onChange={e => {
                     const v = e.target.value;
                     setSupplierFilter(allSuppliers.includes(v) ? v : null);
                     setPage(0);
                   }}
                   placeholder="ค้นหาหรือเลือกร้าน..."
                   style={{
                     padding:"7px 12px", borderRadius:9, fontSize:13,
                     border: supplierFilter ? "1.5px solid var(--g-600)" : "1px solid var(--bdr)",
                     background: supplierFilter ? "var(--g-50)" : "var(--paper)",
                     fontFamily:"inherit", minWidth:220, width:220,
                   }}/>
            <datalist id="supplier-list">
              {allSuppliers.map(s => {
                const cnt = rawList.filter(p => (p.lastSupplier||p.vendor)===s).length;
                return <option key={s} value={s}>{s} ({cnt} รายการ)</option>;
              })}
            </datalist>
            {supplierFilter && (
              <button className="fchip" onClick={() => { setSupplierFilter(null); setPage(0); }}
                      style={{color:"var(--dang)",borderColor:"var(--dang)"}}>✕</button>
            )}
          </div>
          {supplierFilter && (
            <span style={{fontSize:12,color:"var(--muted)"}}>
              {list.length} รายการจาก {rawList.length}
            </span>
          )}
        </div>
      )}

      {/* Search + result count */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:8,flex:"1 1 240px",minWidth:200,alignItems:"center"}}>
          <div style={{position:"relative",flex:1}}>
            <input value={stockSearch} onChange={e=>{setStockSearch(e.target.value);setPage(0);}}
                   placeholder="ค้นหา SKU / ชื่อ / หมวด..."
                   style={{width:"100%",padding:"7px 12px 7px 32px",borderRadius:9,
                           border:"1px solid var(--bdr)",fontSize:12.5,fontFamily:"inherit",
                           background:"#fafcf7",boxSizing:"border-box"}}/>
            <span style={{position:"absolute",left:10,top:8,color:"var(--light)"}}>
              <Icon d={["M11 19 A8 8 0 1 0 11 3 a8 8 0 0 0 0 16 Z","M21 21 L16.65 16.65"]} size={14}/>
            </span>
          </div>
          <ScanButton onScan={sku => { setStockSearch(sku); setPage(0); }}/>
        </div>
        <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap"}}>
          แสดง {page*STOCK_PAGE+1}–{Math.min((page+1)*STOCK_PAGE, list.length)} จาก {list.length} รายการ
        </span>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8}}>
        {paginated.map(function(p) {
          const ratio = p.qty / (p.threshold || 1);
          const lvlColor = p.qty === 0 ? "var(--dang)" :
                           ratio <= 0.33 ? "var(--dang)" :
                           ratio <= 0.66 ? "var(--warn)" : "var(--gold)";
          return (
            <div key={p.sku} onClick={function(){setModalP(p);}}
              style={{background:"#fff",borderRadius:12,padding:"12px",
                      border:"1px solid #f3f4f6",display:"flex",gap:10,
                      alignItems:"flex-start",cursor:"pointer",overflow:"hidden"}}>
              {/* รูป */}
              {p.imageUrl ? (
                <img src={p.imageUrl}
                  style={{width:48,height:48,objectFit:"cover",borderRadius:8,flexShrink:0}}
                  onError={function(e){e.target.style.display="none";}}/>
              ) : (
                <div style={{width:48,height:48,borderRadius:8,flexShrink:0,
                             background: p.color ? p.color.hex+"33" : "var(--g-50)",
                             border: p.color ? "2px solid "+p.color.hex : "1px solid var(--bdr)",
                             display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {!p.color && React.cloneElement(I.leaf, {size:18, stroke:1.5})}
                </div>
              )}
              {/* Content */}
              <div style={{flex:1,minWidth:0}}>
                {/* Row 1: SKU + ชื่อ + status badge */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:4,marginBottom:2}}>
                  <div style={{minWidth:0,flex:1}}>
                    <span style={{fontSize:11,color:"#9ca3af"}}>{p.sku}</span>
                    <div style={{fontSize:14,fontWeight:600,lineHeight:1.3,overflow:"hidden",
                                 textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                  </div>
                  <StatusBadge p={p} filter={filter} />
                </div>
                {/* Row 2: หมวด · ร้านที่ซื้อ */}
                <div style={{fontSize:12,color:"#6b7280",marginBottom:6,display:"flex",alignItems:"center",gap:4}}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:catColor(p.cat, allCats),flexShrink:0,display:"inline-block"}}/>
                  <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {p.cat}{(p.lastSupplier || p.vendor) ? " · " + (p.lastSupplier || p.vendor) : ""}
                  </span>
                </div>
                {/* Row 3: จำนวนสต๊อก + avg */}
                <div style={{display:"flex",gap:10,fontSize:13,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,color:lvlColor}}>
                    {fmtN(p.qty)} ชิ้น
                  </span>
                  {(p.qtyStore > 0 || p.qtyWH > 0) && (
                    <span style={{fontSize:11,color:"var(--muted)"}}>
                      🏪{fmtN(p.qtyStore||0)} 🏭{fmtN(p.qtyWH||0)}
                    </span>
                  )}
                  <span style={{color:"#6b7280",marginLeft:"auto",fontSize:12,whiteSpace:"nowrap"}}>
                    {p.avgMonthly > 0 ? fmtN(p.avgMonthly) + " /เดือน" : "—"}
                  </span>
                </div>
                {/* Row 4: revenue (owner only) */}
                {role === "owner" && p.soldRev > 0 && (
                  <div style={{fontSize:12,color:"#059669",marginTop:4}}>{fmtB(p.soldRev)}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {list.length === 0 && <Empty icon={I.check} title="ยอดเยี่ยม!" sub="ไม่มีรายการในกลุ่มนี้"/>}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:14}}>
          <button className="btn" disabled={page===0} onClick={()=>setPage(p=>p-1)}
                  style={{padding:"6px 14px",fontSize:12}}>
            ← ก่อนหน้า
          </button>
          {Array.from({length:totalPages},(_,i)=>i).map(i => (
            <button key={i} onClick={()=>setPage(i)}
                    style={{
                      width:32, height:32, borderRadius:8, border:"1px solid var(--bdr)",
                      background: page===i ? "var(--g-600)" : "var(--paper)",
                      color: page===i ? "#fff" : "var(--text)",
                      fontFamily:"inherit", fontWeight:600, fontSize:12, cursor:"pointer",
                    }}>
              {i+1}
            </button>
          ))}
          <button className="btn" disabled={page>=totalPages-1} onClick={()=>setPage(p=>p+1)}
                  style={{padding:"6px 14px",fontSize:12}}>
            ถัดไป →
          </button>
        </div>
      )}

      {modalP && <ProductModal p={modalP} onClose={() => setModalP(null)} allCats={allCats}/>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TRENDS — สินค้าเสี่ยงหาย / ใหม่น่าจับตา / มาแรง / ไม่ขายเลย
// ─────────────────────────────────────────────────────────────────────
function TrendsView({ data }) {
  const { products } = data;
  const [section, setSection] = uS("rising");
  const [modalP, setModalP] = uS(null);
  const [trendPage, setTrendPage] = uS(0);
  const PAGE = 30;

  const allCats = uM(() => {
    const s = new Set();
    products.forEach(p => p.cat && s.add(p.cat));
    return [...s].sort();
  }, [products]);

  const enriched = uM(() => products.filter(p => !p.isMTO && p.cat && p.cat !== "ไม่มีรหัสสินค้า"
                                                  && p.cat !== "Made to Order จัดแบบพิเศษ").map(p => {
    const m = p.monthly || [];
    let earlyAvg = 0, lateAvg = 0, soldMonths = 0;
    if (m.length >= 2) {
      const half = Math.floor(m.length / 2);
      earlyAvg = m.slice(0, half).reduce((s,x) => s + (x.qty||0), 0) / Math.max(half, 1);
      lateAvg  = m.slice(half).reduce((s,x) => s + (x.qty||0), 0) / Math.max(m.length - half, 1);
      soldMonths = m.filter(x => x.qty > 0).length;
    }
    // Prefer ISO (set by transaction-file upload), fall back to DD/MM/YYYY string from Sheet
    let daysAgoStockIn = null;
    if (p.lastStockInISO) {
      daysAgoStockIn = (Date.now() - new Date(p.lastStockInISO).getTime()) / 86400000;
    } else if (p.lastStockInDate) {
      const pts = String(p.lastStockInDate).split('/');
      if (pts.length === 3) {
        const d = new Date(parseInt(pts[2]), parseInt(pts[1]) - 1, parseInt(pts[0]));
        if (!isNaN(d.getTime())) daysAgoStockIn = (Date.now() - d.getTime()) / 86400000;
      }
    }
    return { ...p, earlyAvg, lateAvg, soldMonths, daysAgoStockIn };
  }), [products]);

  // 🔥 มาแรง — late > early × 1.4, has stock, sold this period
  const rising = uM(() => enriched
    .filter(p => p.earlyAvg >= 1 && p.lateAvg >= p.earlyAvg * 1.4 && stockQty(p) > 0)
    .map(p => ({...p, growthPct: p.earlyAvg > 0 ? ((p.lateAvg/p.earlyAvg - 1) * 100) : 0}))
    .sort((a,b) => b.growthPct - a.growthPct),
    [enriched]);

  // 🆕 สินค้าใหม่น่าจับตา — เข้าสต๊อกใน 60 วัน หรือขายได้แค่ 1-2 เดือน
  const newArrivals = uM(() => enriched
    .filter(p => {
      if (stockQty(p) <= 0) return false;
      // มีวันที่เข้าสต๊อก (ISO หรือ DD/MM/YYYY) และเข้าใน 60 วัน
      if (p.daysAgoStockIn != null && p.daysAgoStockIn <= 60) return true;
      // ไม่มีวันที่เข้าเลย — ใช้ยอดขายเป็น proxy (≤ 2 เดือน = น่าจะใหม่)
      if (p.daysAgoStockIn == null && p.soldMonths <= 2 && p.soldQty > 0) return true;
      return false;
    })
    .map(p => ({
      ...p,
      growthPct: p.earlyAvg > 0 ? ((p.lateAvg / p.earlyAvg - 1) * 100) : 0,
    }))
    .sort((a, b) => {
      // เรียงตาม: เข้าใหม่สุดก่อน ถ้าไม่มีวันเข้า เรียงตามยอดขาย
      if (a.daysAgoStockIn != null && b.daysAgoStockIn != null) return a.daysAgoStockIn - b.daysAgoStockIn;
      if (a.daysAgoStockIn != null) return -1;
      if (b.daysAgoStockIn != null) return 1;
      return b.soldQty - a.soldQty;
    }),
    [enriched]);

  // 🆘 สินค้าเสี่ยงหายจากตลาด — เคยขายได้ แต่ครึ่งหลังหยุดขายเลย
  // (soldQty===0 → "ไม่ขายเลย" เท่านั้น ไม่ overlap ที่นี่)
  const fading = uM(() => enriched
    .filter(p => {
      if (stockQty(p) <= 0) return false;
      if (p.soldQty === 0) return false;   // ← ไปอยู่ "ไม่ขายเลย" แทน
      const m = p.monthly || [];
      if (m.length < 4) return false;
      const half = Math.floor(m.length / 2);
      const earlySold = m.slice(0, half).reduce((s,x) => s + (x.qty||0), 0);
      const lateSold  = m.slice(half).reduce((s,x) => s + (x.qty||0), 0);
      // เคยขายในช่วงแรกอย่างน้อย 2 ชิ้น แต่ช่วงหลังไม่ขายเลย
      return earlySold >= 2 && lateSold === 0;
    })
    .sort((a,b) => (stockQty(b) * b.price) - (stockQty(a) * a.price)),
    [enriched]);

  // 💀 ไม่ขายเลย — soldQty = 0, has stock
  const zeroSales = uM(() => enriched
    .filter(p => p.soldQty === 0 && stockQty(p) > 0)
    .sort((a,b) => (stockQty(b) * b.price) - (stockQty(a) * a.price)),
    [enriched]);

  const sections = {
    rising:  { list: rising,       label: "🔥 มาแรง",          color: "#c2570a", desc: "ยอดขายครึ่งหลังเพิ่ม > 40% จากครึ่งแรก" },
    new:     { list: newArrivals,  label: "🆕 สินค้าใหม่น่าจับตา", color: "#705d96", desc: "เข้าสต๊อกใน 60 วัน + เริ่มมียอด" },
    fading:  { list: fading,       label: "🆘 เสี่ยงหายจากตลาด",  color: "#b8341c", desc: "เคยขาย แต่ครึ่งหลังขายไม่ได้เลย" },
    zero:    { list: zeroSales,    label: "💀 ไม่ขายเลย",       color: "#5b6b5e", desc: "มีของในสต๊อก แต่ขายไม่ได้ตลอด 5 เดือน" },
  };
  const cur = sections[section];
  const totalPages = Math.ceil(cur.list.length / PAGE);
  const paged = cur.list.slice(trendPage * PAGE, (trendPage + 1) * PAGE);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">เทรนด์สินค้า</div>
          <div className="page-sub">วิเคราะห์จากยอดขายและรายการซื้อเข้า — กดที่สินค้าเพื่อดูรายละเอียด</div>
        </div>
      </div>

      <div className="row row-4" style={{marginBottom:20}}>
        <KPI label="🔥 มาแรง" accent="#c2570a" icon={I.flame}
             value={fmtN(rising.length)} sub="ยอดขายกำลังเพิ่ม"/>
        <KPI label="🆕 ใหม่น่าจับตา" accent="#705d96" icon={I.package}
             value={fmtN(newArrivals.length)} sub="เข้าสต๊อก ≤ 60 วัน"/>
        <KPI label="🆘 เสี่ยงหาย" accent="#b8341c" icon={I.warning}
             value={fmtN(fading.length)} sub="หยุดขายในครึ่งหลัง"/>
        <KPI label="💀 ไม่ขายเลย" accent="#5b6b5e" icon={I.package}
             value={fmtN(zeroSales.length)} sub="0 ยอดขาย · มีของ"/>
      </div>

      {/* Section selector */}
      <div className="filter-bar" style={{marginBottom:14}}>
        <div className="filter-chips">
          {Object.entries(sections).map(([key, s]) => (
            <button key={key} className={`fchip${section===key?' active':''}`}
                    style={section===key?{background:s.color+"18",borderColor:s.color,color:s.color}:{}}
                    onClick={() => { setSection(key); setTrendPage(0); }}>
              {s.label} <span style={{opacity:.7}}>({s.list.length})</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{fontSize:12, color:"var(--muted)", marginBottom:10}}>
        <b style={{color:cur.color}}>{cur.label}</b> — {cur.desc} ·
        แสดง {trendPage*PAGE+1}–{Math.min((trendPage+1)*PAGE, cur.list.length)} จาก {cur.list.length}
      </div>

      {cur.list.length === 0 ? (
        <Empty icon={I.check} title="ไม่มีรายการ" sub="ยังไม่พบสินค้าในกลุ่มนี้"/>
      ) : (
        <div className="row trends-grid" style={{gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))"}}>
          {paged.map(p => (
            <div key={p.sku} onClick={() => setModalP(p)}
                 className="card hover" style={{padding:0, overflow:"hidden", cursor:"pointer"}}>
              <div style={{position:"relative", padding:10, background:"linear-gradient(180deg, var(--g-50), #fff)"}}>
                {p.imageUrl ? (
                  <div style={{
                    width:"100%", aspectRatio:"1/1", borderRadius:10,
                    backgroundImage:`url("${p.imageUrl}")`,
                    backgroundSize:"contain", backgroundPosition:"center",
                    backgroundRepeat:"no-repeat", backgroundColor:"#fff",
                    border:"1px solid var(--bdr)",
                  }}/>
                ) : (
                  <div className="pimg" style={{
                    background: p.color ? `linear-gradient(135deg, ${p.color.hex}22, ${cur.color}11)` : undefined,
                  }}>
                    {p.color ? (
                      <div style={{width:34,height:34,borderRadius:"50%",background:p.color.hex,
                                   border:"2px solid #fff",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}/>
                    ) : <div style={{fontSize:22,opacity:.4,color:"var(--g-500)"}}>{I.leaf}</div>}
                  </div>
                )}
                {p.imageUrl && p.color && (
                  <span style={{position:"absolute",bottom:14,right:14,width:14,height:14,
                                borderRadius:"50%",background:p.color.hex,
                                border:"2px solid #fff",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/>
                )}
                <span className="chip" style={{
                  position:"absolute", top:6, left:6,
                  background:cur.color+"18", color:cur.color, borderColor:cur.color+"30"
                }}>
                  {section==='rising' && `+${p.growthPct.toFixed(0)}%`}
                  {section==='new'    && (p.daysAgoStockIn != null ? `${Math.floor(p.daysAgoStockIn)}d` : "ใหม่")}
                  {section==='fading' && "หยุดขาย"}
                  {section==='zero'   && "0 ขาย"}
                </span>
              </div>
              <div style={{padding:"8px 12px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span className="skucode">{p.sku}</span>
                </div>
                <div style={{fontSize:12.5, fontWeight:600, lineHeight:1.35,
                             overflow:"hidden", display:"-webkit-box",
                             WebkitLineClamp:2, WebkitBoxOrient:"vertical",
                             minHeight:34, marginBottom:4}}>{p.name}</div>
                <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10.5,color:"var(--muted)",marginBottom:4}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:catColor(p.cat, allCats)}}/>
                  {p.cat}
                </div>
                {p.lastStockInDate && (
                  <div style={{fontSize:10,color:"var(--g-700)",fontWeight:600,marginBottom:4}}>
                    📅 เข้าล่าสุด {p.lastStockInDate} · {p.lastSupplier || p.vendor || "—"}
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",
                             paddingTop:6, borderTop:"1px dashed var(--bdr)"}}>
                  <div>
                    <div style={{fontSize:9.5,color:"var(--muted)",fontWeight:600,textTransform:"uppercase"}}>คงเหลือ</div>
                    <div style={{fontSize:13,fontWeight:700}}>{fmtN(stockQty(p))} <span style={{fontSize:9.5,color:"var(--muted)"}}>ชิ้น</span></div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:9.5,color:"var(--muted)",fontWeight:600,textTransform:"uppercase"}}>ขาย</div>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--g-700)"}}>{fmtN(p.soldQty)}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:14}}>
          <button className="btn" disabled={trendPage===0} onClick={()=>setTrendPage(p=>p-1)}>← ก่อนหน้า</button>
          <span style={{fontSize:12,color:"var(--muted)"}}>หน้า {trendPage+1} / {totalPages}</span>
          <button className="btn" disabled={trendPage>=totalPages-1} onClick={()=>setTrendPage(p=>p+1)}>ถัดไป →</button>
        </div>
      )}

      {modalP && <ProductModal p={modalP} onClose={() => setModalP(null)} allCats={allCats}/>}
    </div>
  );
}

// ────────────── Product detail modal ──────────────
function ProductModal({ p, onClose, allCats }) {
  useBackHandler(onClose); // Android back = ปิด product detail modal
  const hasImg = !!p.imageUrl;
  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:1000,
      background:"rgba(20,30,20,.55)", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"#fff", borderRadius:16, maxWidth:560, width:"100%",
        maxHeight:"90vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.25)"
      }}>
        <div style={{padding:20, borderBottom:"1px solid var(--bdr)",
                     display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12}}>
          <div>
            <div style={{fontSize:11, color:"var(--muted)", fontWeight:600, marginBottom:4}}>{p.sku}</div>
            <div style={{fontSize:16, fontWeight:700, lineHeight:1.3}}>{p.name}</div>
          </div>
          <button onClick={onClose} style={{
            border:"1px solid var(--bdr)", background:"#fff", borderRadius:10,
            width:44, height:44, cursor:"pointer", fontSize:22, color:"var(--muted)",
            fontFamily:"inherit"
          }}>×</button>
        </div>

        <div style={{padding:20}}>
          {hasImg ? (
            <div style={{
              width:"100%", aspectRatio:"1/1", borderRadius:12,
              backgroundImage:`url("${p.imageUrl}")`,
              backgroundSize:"contain", backgroundPosition:"center",
              backgroundRepeat:"no-repeat", backgroundColor:"#fafcf7",
              border:"1px solid var(--bdr)", marginBottom:16
            }}/>
          ) : (
            <div style={{
              width:"100%", aspectRatio:"1/1", borderRadius:12,
              background:"var(--g-50)", border:"1px solid var(--bdr)",
              display:"flex", alignItems:"center", justifyContent:"center",
              color:"var(--light)", fontSize:13, marginBottom:16
            }}>ไม่มีรูปภาพ</div>
          )}

          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, fontSize:13}}>
            <div>
              <div style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em"}}>หมวด</div>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:3}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:catColor(p.cat, allCats)}}/>
                {p.cat || "—"}
              </div>
            </div>
            <div>
              <div style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em"}}>ร้านที่ซื้อ</div>
              <div style={{marginTop:3}}>{p.lastSupplier || p.vendor || "—"}</div>
              {p.lastStockInDate && (
                <div style={{marginTop:3, fontSize:11, color:"var(--g-700)", fontWeight:600}}>
                  📅 เข้าล่าสุด {p.lastStockInDate}
                </div>
              )}
            </div>
            <div>
              <div style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em"}}>🏪 หน้าร้าน</div>
              <div style={{marginTop:3, fontWeight:700}}>{fmtN(p.qtyStore || 0)} ชิ้น</div>
            </div>
            <div>
              <div style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em"}}>🏭 คลัง</div>
              <div style={{marginTop:3, fontWeight:700}}>{fmtN(p.qtyWH || 0)} ชิ้น</div>
            </div>
            <div style={{gridColumn:"1 / -1", paddingTop:8, borderTop:"1px dashed var(--bdr)"}}>
              <div style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em"}}>📊 คงเหลือรวม</div>
              <div style={{marginTop:3, fontSize:20, fontWeight:800, color:"var(--g-700)"}}>
                {fmtN(stockQty(p))}
                {" "}<span style={{fontSize:12, color:"var(--muted)", fontWeight:500}}>ชิ้น</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// UPLOAD — Smart file detection
// ─────────────────────────────────────────────────────────────────────
function UploadView({ onDataLoaded, currentData }) {
  const [files, setFiles] = uS([]);
  const [dragOver, setDragOver] = uS(false);
  const [processing, setProcessing] = uS(false);
  const [done, setDone] = uS(false);
  const [toast, showToast, hideToast] = useToast();

  const detectFileType = (name, headers, titleRow, rawRows) => {
    const n = name.toLowerCase();
    const h = (headers || []).join("|").toLowerCase();
    // Filename takes precedence — Zort exports are consistent
    if (n.includes("daily"))      return { type: "daily",       label: "ยอดขายรายวัน",      color: "#2a9b56" };
    if (n.includes("monthly"))    return { type: "sales",       label: "สรุปยอดขายรายเดือน", color: "#1f7f44" };
    if (n.includes("transfer"))   return { type: "transfer",    label: "รายการโอนสินค้า",    color: "#1f6f8b" };
    if (n.includes("product"))    return { type: "product",     label: "ข้อมูลสินค้า (สต๊อก)", color: "#a07417" };
    if (n.includes("transaction"))return { type: "transaction", label: "รายการซื้อเข้า",     color: "#c2570a" };
    // Content-based fallback — inspect title row column headers
    // For sales files, the *column-position* date headers (at cols 4,6,8...) tell us daily vs monthly
    if (titleRow) {
      const dateCols = [];
      for (let c = 0; c < titleRow.length; c++) {
        const v = String(titleRow[c] || "").trim();
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) dateCols.push({col:c, type:"daily"});
        else if (/^\d{1,2}\/\d{4}$/.test(v))     dateCols.push({col:c, type:"monthly"});
      }
      if (dateCols.length > 0) {
        const isDaily = dateCols.every(d => d.type === "daily");
        return isDaily
          ? { type: "daily", label: "ยอดขายรายวัน", color: "#2a9b56" }
          : { type: "sales", label: "สรุปยอดขายรายเดือน", color: "#1f7f44" };
      }
    }
    if (h.includes("จาก") && h.includes("ไป"))
      return { type: "transfer", label: "รายการโอนสินค้า", color: "#1f6f8b" };
    if (h.includes("ราคาขาย") && h.includes("ราคาซื้อ"))
      return { type: "product", label: "ข้อมูลสินค้า (สต๊อก)", color: "#a07417" };
    if (h.includes("ผู้ติดต่อ"))
      return { type: "transaction", label: "รายการซื้อเข้า", color: "#c2570a" };
    if (h.includes("ยอดขาย"))
      return { type: "sales", label: "สรุปยอดขายรายเดือน", color: "#1f7f44" };
    return { type: "unknown", label: "ไม่ระบุประเภท", color: "#5b6b5e" };
  };

  const handleFiles = uC(async (fileList) => {
    const arr = Array.from(fileList);
    const parsed = [];
    for (const f of arr) {
      try {
        const buf = await f.arrayBuffer();
        await ensureXlsx();
        const wb = XLSX.read(buf, {type:"array"});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:""});
        let headerRow = [];
        for (let i=0;i<Math.min(5,rows.length);i++) {
          if (rows[i].some(c => String(c).includes("รหัส") || String(c) === "#")) {
            headerRow = rows[i]; break;
          }
        }
        const detected = detectFileType(f.name, headerRow, rows[0]);
        parsed.push({ name: f.name, size: f.size, rows: rows.length,
                      rawRows: rows, headerRow, sheet: wb.SheetNames[0], ...detected });
      } catch(e) {
        parsed.push({ name: f.name, error: e.message, type: "error",
                      label: "เปิดไฟล์ไม่ได้", color: "#b8341c" });
      }
    }
    setFiles(prev => [...prev, ...parsed]);
    setDone(false);
  }, []);

  const processFiles = uC(async () => {
    setProcessing(true);
    try {
      // --- Product file ---
      const productFile = files.find(f => f.type === "product");
      if (!productFile || !productFile.rawRows) {
        showToast("error", "ไม่พบไฟล์สินค้า · อัปโหลด product*.xlsx ก่อน", "📁");
        setProcessing(false);
        return;
      }

      const allRows = productFile.rawRows;
      let hIdx = -1;
      for (let i = 0; i < Math.min(10, allRows.length); i++) {
        if (allRows[i].some(c => String(c).toLowerCase().includes("รหัส") || String(c).toLowerCase() === "sku")) {
          hIdx = i; break;
        }
      }
      if (hIdx < 0) hIdx = 0;
      const headers = allRows[hIdx];
      const dataRows = allRows.slice(hIdx + 1).filter(r => r.some(c => c !== ""));

      const colIdx = (keywords) => {
        for (const kw of keywords) {
          const i = headers.findIndex(h => String(h).toLowerCase().includes(kw.toLowerCase()));
          if (i >= 0) return i;
        }
        return -1;
      };

      const iSku      = colIdx(["รหัสสินค้า","sku","รหัส"]);
      const iName     = colIdx(["ชื่อสินค้า","ชื่อ","name"]);
      const iCat      = colIdx(["หมวดหมู่","หมวด","category"]);
      const iQtyStore = colIdx(["หน้าร้าน","store"]);
      const iQtyWH    = colIdx(["คลัง","warehouse","wh"]);
      const iQty      = colIdx(["คงเหลือรวม","จำนวนรวม","รวม","จำนวน","คงเหลือ","qty","stock"]);
      const iPrice    = colIdx(["ราคาขาย","ราคา","price"]);
      const iSupplier = colIdx(["ผู้ติดต่อ","supplier","ร้าน"]);
      const iImg      = colIdx(["imageurl","รูป","image"]);

      // Build lookup map of existing products (from Google Sheet) by SKU
      // so we can preserve imageUrl (and other fields not in Zort export)
      const existingMap = {};
      if (currentData && Array.isArray(currentData.products)) {
        currentData.products.forEach(p => {
          if (p.sku) existingMap[String(p.sku).trim().toUpperCase()] = p;
        });
      }

      const products = dataRows
        .map(r => {
          const qtyStore = (iQtyStore >= 0 && iQtyStore < r.length) ? (parseFloat(r[iQtyStore]) || 0) : 0;
          const qtyWH    = (iQtyWH    >= 0 && iQtyWH    < r.length) ? (parseFloat(r[iQtyWH])    || 0) : 0;
          const qtyTot   = (iQty      >= 0 && iQty      < r.length) ? (parseFloat(r[iQty])      || 0) : (qtyStore + qtyWH);
          const sku      = String(r[iSku]  || "").trim();
          const name     = String(r[iName] || "").trim();
          const existing = existingMap[sku.toUpperCase()];
          const rawImg   = String(r[iImg] || "").trim();
          // Use Zort imageUrl if present, else fall back to existing (Google Sheet) imageUrl
          const imageUrl = rawImg || (existing && existing.imageUrl) || "";
          return {
            sku, name,
            cat:      String(r[iCat]  || "").trim(),
            qty:      qtyTot,
            qtyStore, qtyWH,
            price:    parseFloat(r[iPrice]) || (existing && existing.price) || 0,
            vendor:   String(r[iSupplier] || "").trim() || (existing && existing.vendor) || "",
            imageUrl,
            soldQty:  0, soldRev: 0,
            monthly:  [],
            isMTO:    String(r[iCat] || "").includes("Made to Order"),
            color:    detectColor(name),
          };
        })
        .filter(p => p.sku || p.name);

      // --- Monthly sales file ---
      const salesFile = files.find(f => f.type === "sales");
      let monthLabels = [];
      let monthlyByCat = {};
      const salesMap = {};

      if (salesFile && salesFile.rawRows) {
        const sRows = salesFile.rawRows;
        // Row 0: title — month labels at col 4,6,8… format "MM/YYYY"
        const titleRow = sRows[0] || [];
        const months = [];
        for (let c = 4; c < titleRow.length; c += 2) {
          const v = String(titleRow[c] || "").trim();
          if (/^\d{2}\/\d{4}$/.test(v)) months.push(v);
        }
        monthLabels = months;

        // Row 1: headers — find SKU col (รหัส but not หมวด)
        const hdr = sRows[1] || [];
        const skuCol = hdr.findIndex(h => {
          const s = String(h).toLowerCase();
          return s.includes("รหัส") && !s.includes("หมวด");
        });
        const catCol = hdr.findIndex(h => String(h).toLowerCase().includes("หมวดหมู่"));

        const sData = sRows.slice(2).filter(r => r.some(c => c !== ""));
        for (const r of sData) {
          const sku = String(r[skuCol >= 0 ? skuCol : 1] || "").trim();
          const cat = String(r[catCol >= 0 ? catCol : 3] || "").trim();
          if (!sku) continue;

          let totalQty = 0, totalRev = 0;
          const monthly = [];
          for (let mi = 0; mi < months.length; mi++) {
            const qtyVal = parseFloat(r[4 + mi * 2]) || 0;
            const revVal = parseFloat(r[5 + mi * 2]) || 0;
            monthly.push({ month: months[mi], qty: qtyVal, sales: revVal });
            totalQty += qtyVal;
            totalRev += revVal;

            if (!monthlyByCat[months[mi]]) monthlyByCat[months[mi]] = {};
            if (!monthlyByCat[months[mi]][cat]) monthlyByCat[months[mi]][cat] = { qty: 0, sales: 0 };
            monthlyByCat[months[mi]][cat].qty   += qtyVal;
            monthlyByCat[months[mi]][cat].sales += revVal;
          }
          salesMap[sku] = { soldQty: totalQty, soldRev: totalRev, monthly };
        }
      }

      // Merge monthly sales into products
      for (const p of products) {
        if (salesMap[p.sku]) {
          p.soldQty = salesMap[p.sku].soldQty;
          p.soldRev = salesMap[p.sku].soldRev;
          p.monthly = salesMap[p.sku].monthly;
        }
      }

      // --- Daily sales file ---
      const dailyFile = files.find(f => f.type === "daily");
      let dayLabels = [];
      let dailyByCat = {};
      const dailyMap = {};
      if (dailyFile && dailyFile.rawRows) {
        const dRows = dailyFile.rawRows;
        const titleRow = dRows[0] || [];
        const days = [];
        const dayCols = [];
        for (let c = 0; c < titleRow.length; c++) {
          const v = String(titleRow[c] || "").trim();
          if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
            days.push(v);
            dayCols.push(c);
          }
        }
        dayLabels = days;

        const hdr = dRows[1] || [];
        const skuCol = hdr.findIndex(h => {
          const s = String(h).toLowerCase();
          return s.includes("รหัส") && !s.includes("หมวด");
        });
        const catCol = hdr.findIndex(h => String(h).toLowerCase().includes("หมวดหมู่"));

        const dData = dRows.slice(2).filter(r => r.some(c => c !== ""));
        for (const r of dData) {
          const sku = String(r[skuCol >= 0 ? skuCol : 1] || "").trim();
          const cat = String(r[catCol >= 0 ? catCol : 3] || "").trim();
          if (!sku) continue;

          const daily = [];
          for (let di = 0; di < days.length; di++) {
            const qtyCol = dayCols[di];
            const qtyVal = (qtyCol != null && qtyCol < r.length)     ? (parseFloat(r[qtyCol])     || 0) : 0;
            const revVal = (qtyCol != null && qtyCol+1 < r.length)   ? (parseFloat(r[qtyCol + 1]) || 0) : 0;
            daily.push({ day: days[di], qty: qtyVal, sales: revVal });

            if (!dailyByCat[days[di]]) dailyByCat[days[di]] = {};
            if (!dailyByCat[days[di]][cat]) dailyByCat[days[di]][cat] = { qty: 0, sales: 0 };
            dailyByCat[days[di]][cat].qty   += qtyVal;
            dailyByCat[days[di]][cat].sales += revVal;
          }
          dailyMap[sku] = daily;
        }
        for (const p of products) {
          if (dailyMap[p.sku]) p.daily = dailyMap[p.sku];
        }
      }

      // --- Transaction detail (purchases in) — supplier + last stock-in date ---
      const txFile = files.find(f => f.type === "transaction");
      const txMap = {}; // sku -> { lastDate, lastSupplier, count }
      if (txFile && txFile.rawRows) {
        const tRows = txFile.rawRows;
        // Find header row containing "ประเภท" and "ผู้ติดต่อ"
        let tHdrIdx = -1;
        for (let i = 0; i < Math.min(5, tRows.length); i++) {
          const j = tRows[i].map(c => String(c).toLowerCase()).join("|");
          if (j.includes("ประเภท") && (j.includes("ผู้ติดต่อ") || j.includes("วันที่"))) {
            tHdrIdx = i; break;
          }
        }
        if (tHdrIdx < 0) tHdrIdx = 0;
        const tHdr = tRows[tHdrIdx];
        const findCol = (kws) => {
          for (const kw of kws) {
            const i = tHdr.findIndex(h => String(h).toLowerCase().includes(kw.toLowerCase()));
            if (i >= 0) return i;
          }
          return -1;
        };
        const iType    = findCol(["ประเภท"]);
        const iContact = findCol(["ชื่อผู้ติดต่อ","ผู้ติดต่อ"]);
        const iDate    = findCol(["วันที่ทำรายการ","วันที่"]);
        const iSku     = findCol(["รหัสสินค้า","รหัส","sku"]);

        const parseDate = (v) => {
          if (!v) return null;
          if (v instanceof Date) return v;
          const s = String(v).trim();
          const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (m) return new Date(+m[3], +m[2]-1, +m[1]);
          // Excel serial date
          const n = parseFloat(s);
          if (!isNaN(n) && n > 25569 && n < 100000) {
            return new Date((n - 25569) * 86400000);
          }
          const d = new Date(s);
          return isNaN(d.getTime()) ? null : d;
        };

        const tData = tRows.slice(tHdrIdx + 1);
        for (const r of tData) {
          if (iType >= 0 && !String(r[iType] || "").includes("ซื้อเข้า")) continue;
          const sku = iSku >= 0 ? String(r[iSku] || "").trim() : "";
          if (!sku) continue;
          const supplier = iContact >= 0 ? String(r[iContact] || "").trim() : "";
          const date = iDate >= 0 ? parseDate(r[iDate]) : null;
          const cur = txMap[sku];
          if (!cur || (date && (!cur.lastDate || date > cur.lastDate))) {
            txMap[sku] = {
              lastDate: date || cur?.lastDate || null,
              lastSupplier: supplier || cur?.lastSupplier || "",
              count: (cur?.count || 0) + 1,
            };
          } else {
            cur.count += 1;
          }
        }
        for (const p of products) {
          const t = txMap[p.sku];
          if (t) {
            if (t.lastDate) {
              const d = t.lastDate;
              p.lastStockInDate = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
              p.lastStockInISO = d.toISOString();
            }
            if (t.lastSupplier) p.lastSupplier = t.lastSupplier;
            p.purchaseCount = t.count;
          }
        }
      }

      // Build mtoGroups — group by base name (strip #1, #2, trailing numbers)
      const mtoGroups = Object.values(
        products.filter(p => p.isMTO).reduce((acc, p) => {
          const k = mtoBase(p.name);
          if (!acc[k]) acc[k] = { base: k, variants: [], totalRev: 0, totalQty: 0 };
          acc[k].variants.push(p);
          acc[k].totalRev += p.soldRev;
          acc[k].totalQty += p.soldQty;
          return acc;
        }, {})
      ).sort((a,b) => b.totalRev - a.totalRev);

      const totals = {
        nSold: products.filter(p => p.soldQty > 0 && !p.isMTO).length,
        nWithStock: products.filter(p => stockQty(p) > 0).length,
        totalStockValue: products.reduce((s, p) => s + stockQty(p) * p.price, 0),
        totalSoldRev: products.reduce((s, p) => s + p.soldRev, 0),
      };

      const newData = {
        generatedAt: new Date().toISOString(),
        products,
        monthLabels,
        monthlyByCat,
        dayLabels,
        dailyByCat,
        totals,
        mtoGroups,
        thresholds: { default: 36, overrides: { "แจกันแก้ว": 3, "เรซิ่นและอื่นๆ": 3 } },
      };

      setDone(true);
      setProcessing(false);
      setTimeout(() => onDataLoaded && onDataLoaded(newData), 800);
    } catch(e) {
      showToast("error", "เกิดข้อผิดพลาด: " + e.message, "❌");
      setProcessing(false);
    }
  }, [files, onDataLoaded, currentData, showToast]);

  return (
    <>
    <Toast toast={toast} onClose={hideToast}/>
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">อัปโหลดไฟล์ Zort</div>
          <div className="page-sub">อัปโหลดแล้วกด "ประมวลผล" — Dashboard จะแสดงข้อมูลจากไฟล์ทันที</div>
        </div>
      </div>

      <div className={`upload-zone${dragOver?' over':''}${done?' done':''}`}
           onDragOver={e=>{e.preventDefault();setDragOver(true);}}
           onDragLeave={()=>setDragOver(false)}
           onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles(e.dataTransfer.files);}}
           onClick={()=>document.getElementById("upfile").click()}>
        <div style={{width:54,height:54,margin:"0 auto 14px",borderRadius:14,
                     background:"var(--g-100)",color:"var(--g-700)",
                     display:"flex",alignItems:"center",justifyContent:"center"}}>
          {done ? I.check : React.cloneElement(I.upload, {})}
        </div>
        <div style={{fontSize:15, fontWeight:700, marginBottom:6}}>
          {done ? "✅ ประมวลผลเสร็จแล้ว!" : "ลากไฟล์มาวางตรงนี้"}
        </div>
        <div style={{fontSize:12, color:"var(--muted)", marginBottom:14}}>
          หรือคลิกเพื่อเลือกไฟล์ — รองรับหลายไฟล์พร้อมกัน (.xlsx, .xls, .csv)
        </div>
        <button className="btn primary" onClick={(e)=>{e.stopPropagation();document.getElementById("upfile").click();}}>
          {I.upload}<span>เลือกไฟล์</span>
        </button>
        <input id="upfile" type="file" multiple accept=".xlsx,.xls,.csv"
               style={{display:"none"}}
               onChange={e=>handleFiles(e.target.files)}/>
      </div>

      <div className="row row-5" style={{marginTop: 20}}>
        {[
          { type:"product",  label:"ข้อมูลสินค้า ⭐", desc:"product*.xlsx", hint:"สำคัญที่สุด — สต๊อก + ราคา", color:"#a07417"},
          { type:"sales",    label:"ยอดขายรายเดือน", desc:"monthlySales*.xlsx", hint:"ยอดขายรายหมวดต่อเดือน", color:"#1f7f44"},
          { type:"daily",    label:"ยอดขายรายวัน", desc:"dailySales*.xlsx", hint:"ยอดขายรายวัน 2 วันล่าสุด", color:"#2a9b56"},
          { type:"transaction", label:"รายการซื้อเข้า", desc:"transactionDetail*.xlsx", hint:"วันสินค้าเข้า + ร้านที่ซื้อ", color:"#c2570a"},
          { type:"transfer", label:"รายการโอน", desc:"transferDetail*.xlsx", hint:"โอนจากคลัง → ร้าน", color:"#1f6f8b"},
        ].map(g => {
          const uploaded = files.find(f => f.type === g.type);
          return (
            <div key={g.type} className="card" style={{borderTop:`3px solid ${g.color}`, position:"relative"}}>
              {uploaded && (
                <span className="chip" style={{position:"absolute",top:12,right:12,background:g.color+"18",color:g.color}}>
                  {React.cloneElement(I.check,{size:11})} อัปโหลดแล้ว
                </span>
              )}
              <div style={{fontSize:10,fontWeight:700,color:g.color,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>{g.type}</div>
              <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{g.label}</div>
              <div className="mono" style={{fontSize:10,color:"var(--muted)",marginBottom:8}}>{g.desc}</div>
              <div style={{fontSize:11.5,color:"var(--muted)"}}>{g.hint}</div>
            </div>
          );
        })}
      </div>

      {files.length > 0 && (
        <Card title={`ไฟล์ที่อัปโหลด (${files.length})`} sub="ระบบตรวจจับประเภทอัตโนมัติ" style={{marginTop:24}}
              action={
                <button className="btn primary" onClick={processFiles} disabled={processing}>
                  {processing ? <span className="spin" style={{width:14,height:14,borderWidth:2}}/> : I.refresh}
                  <span>{processing ? "กำลังประมวลผล…" : "ประมวลผลข้อมูล"}</span>
                </button>
              }>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {files.map((f, i) => (
              <div key={i} style={{
                display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
                borderRadius:10,border:"1px solid var(--bdr)",background:"#fafcf7"
              }}>
                <div style={{width:36,height:36,borderRadius:8,background:f.color+"18",color:f.color,
                             display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {f.type==="error"?React.cloneElement(I.alert,{size:18}):React.cloneElement(I.sheets,{size:18})}
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {f.name}
                  </div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>
                    {f.rows ? `${(f.rows-1).toLocaleString()} แถว · ` : ""}
                    {(f.size/1024).toFixed(1)} KB
                  </div>
                </div>
                <span className="chip" style={{background:f.color+"18",color:f.color,borderColor:f.color+"30"}}>
                  {React.cloneElement(I.check,{size:12})}{f.label}
                </span>
                <button className="btn ghost" onClick={()=>setFiles(prev=>prev.filter((_,j)=>j!==i))} style={{padding:6}}>
                  {React.cloneElement(I.x,{size:14})}
                </button>
              </div>
            ))}
          </div>
          <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:"var(--g-50)",fontSize:12,color:"var(--g-800)"}}>
            💡 ต้องมีไฟล์ <b>product*.xlsx</b> เป็นหลัก — ไฟล์อื่นเสริมข้อมูลยอดขาย
          </div>
        </Card>
      )}
    </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CONNECT — Google Sheets setup
// ─────────────────────────────────────────────────────────────────────
function ConnectView({ sheetUrl, sheetViewUrl, syncing, lastSync, source, onSync, onClearLocal }) {
  const [url, setUrl] = uS(sheetViewUrl || "");

  const lastSyncLabel = (() => {
    if (!lastSync) return "ยังไม่ sync";
    const dt = new Date(lastSync);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  })();

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">เชื่อม Google Sheet</div>
          <div className="page-sub">ใช้เป็นแหล่งข้อมูลหลัก — กด Sync เพื่อโหลดข้อมูลใหม่จาก Sheet</div>
        </div>
      </div>

      <Card style={{marginBottom: 18}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,flexWrap:"wrap"}}>
          <div style={{width:42,height:42,borderRadius:10,background:"var(--g-100)",color:"var(--g-700)",
                       display:"flex",alignItems:"center",justifyContent:"center"}}>
            {React.cloneElement(I.sheets,{size:20})}
          </div>
          <div style={{flex:1, minWidth:200}}>
            <div style={{fontSize:14, fontWeight:700}}>Doomuenjing — Inventory Master</div>
            <div style={{fontSize:11.5, color:"var(--muted)"}}>
              {source === "upload"
                ? <>ใช้ <b style={{color:"#a07417"}}>ไฟล์ที่อัปโหลด</b> · บันทึก {lastSyncLabel}</>
                : <>เชื่อมแล้ว · sync ล่าสุด {lastSyncLabel}</>}
            </div>
          </div>
          <span className="chip" style={source==="upload" ? {background:"#fef3e7",color:"#a07417",borderColor:"#f5dec0"} : {}}>
            <span style={{width:6,height:6,borderRadius:"50%",
                          background: source==="upload" ? "#a07417" : "var(--g-500)",
                          boxShadow:`0 0 0 3px ${source==="upload" ? "rgba(160,116,23,.18)" : "rgba(42,155,86,.18)"}`}}></span>
            {source === "upload" ? "ไฟล์อัปโหลด (ทับ Sheet)" : "เชื่อมต่อแล้ว"}
          </span>
        </div>

        <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
          <div style={{flex:1, minWidth:280}}>
            <label style={{fontSize:11.5,fontWeight:600,color:"var(--muted)",display:"block",marginBottom:6}}>
              Google Sheet URL
            </label>
            <input value={url} onChange={e=>setUrl(e.target.value)}
                   style={{
                     width:"100%", padding:"10px 14px", borderRadius:10,
                     border:"1px solid var(--bdr)", fontSize:12,
                     fontFamily:"JetBrains Mono, monospace", background:"#fafcf7"
                   }}/>
          </div>
          <button className="btn" disabled={syncing} onClick={onSync}>
            {syncing ? <span className="spin" style={{width:14,height:14,borderWidth:2}}/> : I.refresh}
            <span>{syncing ? "กำลัง Sync..." : "Sync เดี๋ยวนี้"}</span>
          </button>
          <button className="btn primary"
                  onClick={() => window.open(url || sheetViewUrl, "_blank", "noopener")}>
            {I.link}<span>เปิด Sheet</span>
          </button>
        </div>

        {source === "upload" && (
          <div style={{marginTop:14,padding:"12px 14px",borderRadius:10,background:"#fef3e7",
                       border:"1px solid #f5dec0",fontSize:12,color:"#a07417",
                       display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{flex:1, minWidth:200}}>
              <b>กำลังใช้ข้อมูลจากไฟล์ที่อัปโหลด</b> — Dashboard จะใช้ไฟล์นี้จนกว่าจะอัปโหลดใหม่หรือล้างข้อมูล
            </div>
            <button className="btn" onClick={onClearLocal}
                    style={{fontSize:11.5,padding:"6px 12px"}}>
              {React.cloneElement(I.x,{size:13})}<span>ล้าง · กลับไปใช้ Sheet</span>
            </button>
          </div>
        )}
      </Card>

      <div className="row row-2">
        <Card title="โครงสร้างข้อมูลที่อ่านอัตโนมัติ" sub="ระบบจะหา sheet เหล่านี้ใน Google Sheet">
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[
              ["Products", "สินค้าทั้งหมด + สต๊อก + ราคา + imageUrl", "5,485 แถว", "var(--g-600)"],
              ["MonthlySales", "ยอดขายรายเดือน × หมวด", "1,971 แถว", "var(--g-500)"],
              ["Transfers", "รายการโอนสินค้าระหว่างคลัง", "956 แถว", "var(--info)"],
              ["Purchases", "รายการซื้อเข้า + vendor", "671 แถว", "var(--warn)"],
            ].map(([name, desc, rows, color]) => (
              <div key={name} style={{display:"flex",alignItems:"center",gap:12,padding:12,
                                       borderRadius:10,background:"#fafcf7",border:"1px solid var(--bdr)"}}>
                <div style={{width:8,alignSelf:"stretch",borderRadius:4,background:color}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:700}}>{name}</div>
                  <div style={{fontSize:11, color:"var(--muted)"}}>{desc}</div>
                </div>
                <div className="mono" style={{fontSize:11,color:"var(--muted)"}}>{rows}</div>
                <span className="chip">{React.cloneElement(I.check, {size: 12})}อ่านแล้ว</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:14, padding:"12px 14px", borderRadius:10, background:"var(--g-50)",
                       border:"1px solid var(--g-100)", fontSize:12, color:"var(--g-800)"}}>
            <b style={{color:"var(--g-700)"}}>💡 รูปสินค้า:</b> เพิ่มคอลัมน์ <span className="mono" style={{background:"#fff",padding:"1px 6px",borderRadius:4}}>imageUrl</span> ใน Products sheet —
            วาง URL ของรูป (Google Drive / Imgur / Cloudinary) แล้วระบบจะแสดงในการ์ดทุกใบ
          </div>
        </Card>

        <Card title="ผู้ที่เข้าถึงได้" sub="3 คน · Doomuenjing team">
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[
              ["คุณ (Owner)", "you@doomuenjing.com", "Admin"],
              ["เจ้าของ 1", "owner1@doomuenjing.com", "Editor"],
              ["เจ้าของ 2", "owner2@doomuenjing.com", "Editor"],
            ].map(([name, email, role]) => (
              <div key={email} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
                                       borderRadius:10,background:"#fafcf7"}}>
                <div style={{width:34,height:34,borderRadius:"50%",background:"var(--g-200)",color:"var(--g-700)",
                             display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>
                  {name[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600}}>{name}</div>
                  <div style={{fontSize:11, color:"var(--muted)"}}>{email}</div>
                </div>
                <span className="chip neutral">{role}</span>
              </div>
            ))}
            <button className="btn" style={{marginTop:4, alignSelf:"flex-start"}}>
              {I.user}<span>เชิญผู้ใช้</span>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// STORAGE VIEW — Phase 2: Visual warehouse grid (A1–B10 × 15 locks each)
// ─────────────────────────────────────────────────────────────────────
function StorageView({ data }) {
  const storage = data.storage || {};
  const verifiedLockMap = storage.verifiedLockMap || {};
  const productLockMap  = storage.productLockMap  || {};
  const unassigned      = storage.unassigned      || [];
  const shelves         = storage.shelves         || { A: 10, B: 10, locksPerShelf: 15 };
  const products        = data.products           || [];

  const productMap = uM(() => {
    const m = {};
    products.forEach(p => { m[p.sku] = p; });
    return m;
  }, [products]);

  const [side, setSide] = uS('A');
  const [search, setSearch] = uS('');
  const [selectedLock, setSelectedLock] = uS(null);

  // Quick-assign mode state
  const [qaMode, setQaMode]         = uS(false);
  const [qaSku, setQaSku]           = uS('');
  const [qaLockKey, setQaLockKey]   = uS('');
  const [qaLog, setQaLog]           = uS([]);
  const [qaSaving, setQaSaving]     = uS(false);
  const [qaToast, showQaToast, hideQaToast] = useToast();

  // Local overrides stored in localStorage
  const LS_LOCK_OV = "dmj_lock_overrides_v1";
  const [lockOv, setLockOv] = uS(() => {
    try { return JSON.parse(localStorage.getItem(LS_LOCK_OV) || "{}"); } catch { return {}; }
  });
  const saveLockOv = (next) => {
    setLockOv(next);
    localStorage.setItem(LS_LOCK_OV, JSON.stringify(next));
  };
  const handleUpdateLock = (key, skus) => {
    const next = { ...lockOv, [key]: skus };
    saveLockOv(next);
  };

  const lockData = uM(() => {
    const merged = {};
    Object.keys(productLockMap).forEach(key => {
      merged[key] = { skus: productLockMap[key], verified: false, entries: [], mismatch: false };
    });
    Object.keys(verifiedLockMap).forEach(key => {
      const verifiedSkus = verifiedLockMap[key].map(v => v.sku);
      // เปรียบจำนวนจริงกับระบบ — ไม่ใช้ string status เพราะอาจล้าสมัย
      const mismatch = verifiedLockMap[key].some(v => {
        const sysP = products.find(p => p.sku === v.sku);
        const sysQty = sysP ? whQty(sysP) : v.sysQty;
        return sysQty != null && v.qty != null && v.qty !== sysQty;
      });
      const allSkus = merged[key] ? [...new Set([...merged[key].skus, ...verifiedSkus])] : verifiedSkus;
      merged[key] = { skus: allSkus, verified: true, mismatch, entries: verifiedLockMap[key] };
    });
    // Apply local overrides
    Object.keys(lockOv).forEach(key => {
      const ovSkus = lockOv[key];
      if (!merged[key]) merged[key] = { skus: ovSkus, verified: false, entries: [], mismatch: false, localOnly: true };
      else merged[key] = { ...merged[key], skus: [...new Set([...merged[key].skus, ...ovSkus])] };
    });
    return merged;
  }, [verifiedLockMap, productLockMap, lockOv]);

  const totalLocks    = (shelves.A + shelves.B) * shelves.locksPerShelf;
  const usedCount     = Object.keys(lockData).length;
  const verifiedCount = Object.keys(verifiedLockMap).length;
  const mismatchCount = Object.values(lockData).filter(d => d.mismatch).length;

  const searchSku = search.trim().toUpperCase();
  const searchMatches = uM(() => {
    if (!searchSku) return new Set();
    const matches = new Set();
    Object.entries(lockData).forEach(([key, d]) => {
      if (d.skus.some(s => s.toUpperCase().includes(searchSku))) matches.add(key);
      // also match product name
      if (d.skus.some(s => {
        const p = productMap[s];
        return p && (p.name||'').toUpperCase().includes(searchSku);
      })) matches.add(key);
    });
    return matches;
  }, [searchSku, lockData, productMap]);

  // sku → [lockKey, ...] reverse map
  const skuToLocks = uM(() => {
    const m = {};
    Object.entries(lockData).forEach(([lk, d]) => {
      (d.skus || []).forEach(sku => {
        if (!m[sku]) m[sku] = [];
        m[sku].push(lk);
      });
    });
    return m;
  }, [lockData]);

  // Enhanced search results (product cards with lock positions)
  const searchResults = uM(() => {
    if (!searchSku || searchSku.length < 1) return [];
    const results = [];
    products.forEach(p => {
      if (p.sku.toUpperCase().includes(searchSku) ||
          (p.name||'').toUpperCase().includes(searchSku)) {
        results.push({ p, locks: skuToLocks[p.sku] || [] });
      }
    });
    return results.slice(0, 12);
  }, [searchSku, products, skuToLocks]);

  // Quick-assign: save sku → lock
  const handleQuickAssign = async () => {
    const sku = qaSku.trim().toUpperCase();
    const lk  = qaLockKey.trim().toUpperCase();
    if (!sku || !lk) return;
    setQaSaving(true);
    const existingSkus = (lockData[lk]?.skus || []).filter(s => s !== sku);
    handleUpdateLock(lk, [...existingSkus, sku]);
    const prod   = productMap[sku];
    const qty    = prod ? whQty(prod) : 0;
    const result = await syncLockData(lk, [{ sku, qty, isNew: true }]);
    setQaSaving(false);
    if (result.success !== false) {
      setQaLog(prev => [
        { sku, lockKey: lk, name: prod?.name || '', ts: new Date() },
        ...prev.slice(0, 9),
      ]);
      setQaSku('');
      setQaLockKey('');
      showQaToast('success', `✅ ${sku} → ${lk}`, '💾');
    } else {
      showQaToast('error', 'บันทึกไม่สำเร็จ', '❌');
    }
  };

  const sides = side === 'all' ? ['A', 'B'] : [side];

  // ── QUICK ASSIGN MODE ─────────────────────────────────────────────
  if (qaMode) {
    const qaProduct = productMap[qaSku.trim().toUpperCase()];
    const canSave   = qaSku.trim() && qaLockKey.trim() && !qaSaving;
    return (
      <>
        <Toast toast={qaToast} onClose={hideQaToast}/>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* Header */}
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button onClick={() => setQaMode(false)}
              style={{width:44,height:44,borderRadius:10,border:'1.5px solid var(--bdr)',
                      background:'#fff',cursor:'pointer',fontSize:20,fontFamily:'inherit',flexShrink:0}}>
              ←
            </button>
            <div>
              <div style={{fontSize:16,fontWeight:800}}>📥 บันทึกตำแหน่งด่วน</div>
              <div style={{fontSize:12,color:'var(--muted)',marginTop:1}}>
                สแกน/พิมพ์ SKU แล้วระบุล็อค — บันทึกทันที
              </div>
            </div>
          </div>

          {/* Step 1 — SKU */}
          <Card padding={true}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',marginBottom:8}}>
              ① สินค้าที่จะบันทึกตำแหน่ง
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input autoFocus type="text"
                placeholder="พิมพ์หรือสแกน SKU..."
                value={qaSku}
                onChange={e => setQaSku(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && document.getElementById('qa-lock-input')?.focus()}
                style={{flex:1,padding:'12px 14px',borderRadius:10,fontSize:14,fontWeight:700,
                        fontFamily:'monospace',border:'2px solid ' + (qaProduct ? '#1b5e20' : 'var(--bdr)'),
                        background: qaProduct ? '#f0fdf4' : '#fff'}}/>
              <ScanButton size={46} onScan={sku => setQaSku(sku.toUpperCase())}/>
              {qaSku && <button onClick={() => setQaSku('')}
                style={{width:46,height:46,borderRadius:10,border:'1.5px solid var(--bdr)',
                        background:'#fff',cursor:'pointer',fontSize:18,color:'var(--muted)',fontFamily:'inherit'}}>✕</button>}
            </div>
            {qaProduct && (
              <div style={{display:'flex',alignItems:'center',gap:10,marginTop:10,
                           padding:'10px 12px',background:'#f0fdf4',borderRadius:10}}>
                {qaProduct.imageUrl
                  ? <img src={qaProduct.imageUrl} alt={qaProduct.name}
                      style={{width:44,height:44,objectFit:'contain',borderRadius:8,background:'#fff',flexShrink:0}}/>
                  : <div style={{width:44,height:44,borderRadius:8,background:'#e8f5e9',
                                 display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>
                      {CAT_EMOJI[qaProduct.cat] || '📦'}
                    </div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:'var(--g-800)',
                               overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {qaProduct.name}
                  </div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>
                    คลัง {whQty(qaProduct)} ชิ้น
                    {(skuToLocks[qaSku.trim().toUpperCase()] || []).length > 0 && (
                      <span style={{marginLeft:8,color:'#1b5e20',fontWeight:700}}>
                        ปัจจุบัน: {(skuToLocks[qaSku.trim().toUpperCase()] || []).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {qaSku.trim() && !qaProduct && (
              <div style={{marginTop:8,fontSize:12,color:'var(--warn)',fontWeight:600}}>
                ⚠️ ไม่พบ SKU นี้ในระบบ — จะบันทึกตำแหน่งได้แต่ไม่มีข้อมูลสินค้า
              </div>
            )}
          </Card>

          {/* Step 2 — Lock */}
          <Card padding={true}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',marginBottom:8}}>
              ② ตำแหน่งล็อคที่วางของ (เช่น A3/7)
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input id="qa-lock-input" type="text"
                placeholder="พิมพ์ตำแหน่ง เช่น A3/7..."
                value={qaLockKey}
                onChange={e => setQaLockKey(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && canSave && handleQuickAssign()}
                style={{flex:1,padding:'12px 14px',borderRadius:10,fontSize:16,fontWeight:800,
                        fontFamily:'monospace',border:'2px solid ' + (qaLockKey.trim() ? '#1b5e20' : 'var(--bdr)'),
                        background: qaLockKey.trim() ? '#f0fdf4' : '#fff', letterSpacing:2}}/>
              {qaLockKey && <button onClick={() => setQaLockKey('')}
                style={{width:46,height:46,borderRadius:10,border:'1.5px solid var(--bdr)',
                        background:'#fff',cursor:'pointer',fontSize:18,color:'var(--muted)',fontFamily:'inherit'}}>✕</button>}
            </div>
            {/* Quick lock picker — tap shelf buttons */}
            <div style={{marginTop:10}}>
              <LockPicker shelves={shelves} value={qaLockKey} onChange={v => setQaLockKey(v)}/>
            </div>
          </Card>

          {/* Save button */}
          <button onClick={handleQuickAssign} disabled={!canSave}
            style={{width:'100%',padding:'16px',borderRadius:12,border:'none',
                    fontSize:16,fontWeight:800,fontFamily:'inherit',cursor: canSave ? 'pointer' : 'default',
                    background: canSave ? '#1b5e20' : 'var(--g-200)',
                    color: canSave ? '#fff' : 'var(--muted)',
                    transition:'background .15s'}}>
            {qaSaving ? '⏳ กำลังบันทึก...'
              : canSave ? `💾 บันทึก ${qaSku.trim().toUpperCase()} → ${qaLockKey.trim()}`
              : 'กรอก SKU และตำแหน่งก่อน'}
          </button>

          {/* Log of recent assignments */}
          {qaLog.length > 0 && (
            <Card title="✅ บันทึกล่าสุด" padding={true}>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {qaLog.map((entry, i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,
                                        padding:'8px 10px',background: i===0 ? '#f0fdf4' : '#f8fafc',
                                        borderRadius:8,border:'1px solid ' + (i===0?'#bbf7d0':'var(--bdr)')}}>
                    <span style={{fontSize:11,fontWeight:800,fontFamily:'monospace',
                                  color:'var(--g-500)',minWidth:80}}>{entry.sku}</span>
                    <span style={{fontSize:13,fontWeight:800,color:'#1b5e20',
                                  background:'#dcfce7',borderRadius:6,padding:'2px 8px',
                                  fontFamily:'monospace'}}>{entry.lockKey}</span>
                    <span style={{flex:1,fontSize:11,color:'var(--muted)',
                                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {entry.name}
                    </span>
                    <span style={{fontSize:10,color:'var(--muted)',flexShrink:0}}>
                      {entry.ts.getHours().toString().padStart(2,'0')}:{entry.ts.getMinutes().toString().padStart(2,'0')}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </>
    );
  }

  // ── NORMAL VIEW ───────────────────────────────────────────────────
  return (
    <div className="storage-view" style={{width:"100%",minWidth:0,boxSizing:"border-box"}}>

      {/* ── Prominent search + quick-assign button ── */}
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
        <div style={{flex:1,position:'relative'}}>
          <input type="text" placeholder="🔍 ค้นหาสินค้า / สแกนบาร์โค้ด..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{width:'100%',padding:'12px 14px 12px 44px',borderRadius:12,
                    border:'2px solid ' + (search.trim() ? '#1b5e20' : 'var(--bdr)'),
                    fontSize:14,fontFamily:'inherit',background:'#fff',
                    boxSizing:'border-box'}}/>
          <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',
                        fontSize:18,pointerEvents:'none'}}>🔍</span>
          {search && <button onClick={() => setSearch('')}
            style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                    width:28,height:28,borderRadius:8,border:'none',background:'var(--g-100)',
                    cursor:'pointer',fontSize:14,color:'var(--muted)',fontFamily:'inherit'}}>✕</button>}
        </div>
        <ScanButton size={46} onScan={sku => setSearch(sku)}/>
        <button onClick={() => { setQaMode(true); setQaSku(''); setQaLockKey(''); }}
          style={{height:46,padding:'0 16px',borderRadius:12,border:'2px solid #1b5e20',
                  background:'#1b5e20',color:'#fff',fontWeight:700,fontSize:13,
                  cursor:'pointer',fontFamily:'inherit',flexShrink:0,whiteSpace:'nowrap'}}>
          📥 บันทึกตำแหน่ง
        </button>
      </div>

      {/* ── Search results panel (replaces grid while searching) ── */}
      {search.trim() && (
        <div style={{marginBottom:16}}>
          {searchResults.length === 0 ? (
            <div style={{padding:'20px',textAlign:'center',color:'var(--muted)',
                         background:'#fff',borderRadius:12,border:'1.5px solid var(--bdr)',fontSize:13}}>
              ไม่พบสินค้า "{search.trim().toUpperCase()}" ในระบบ
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <div style={{fontSize:11,color:'var(--muted)',fontWeight:600,paddingLeft:2}}>
                พบ {searchResults.length} รายการ
              </div>
              {searchResults.map(({ p, locks }) => (
                <div key={p.sku}
                  onClick={() => locks.length > 0 ? setSelectedLock(locks[0]) : null}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',
                          background:'#fff',borderRadius:12,
                          border:'2px solid ' + (locks.length > 0 ? '#1b5e20' : '#fbbf24'),
                          cursor: locks.length > 0 ? 'pointer' : 'default',
                          boxShadow:'0 1px 4px rgba(0,0,0,.05)'}}>
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt={p.name}
                        style={{width:52,height:52,objectFit:'contain',borderRadius:8,
                                background:'var(--g-50)',flexShrink:0}}/>
                    : <div style={{width:52,height:52,borderRadius:8,background:'var(--g-50)',
                                   display:'flex',alignItems:'center',justifyContent:'center',
                                   fontSize:26,flexShrink:0}}>
                        {CAT_EMOJI[p.cat] || '📦'}
                      </div>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:3}}>
                      <span style={{fontSize:11,fontWeight:700,color:'var(--g-500)',fontFamily:'monospace'}}>
                        {p.sku}
                      </span>
                      {locks.length > 0 ? locks.map(lk => (
                        <span key={lk} style={{fontSize:12,fontWeight:800,color:'#fff',
                                               background:'#1b5e20',borderRadius:6,
                                               padding:'2px 8px',fontFamily:'monospace'}}>
                          📍 {lk}
                        </span>
                      )) : (
                        <span style={{fontSize:11,fontWeight:700,color:'#92400e',
                                      background:'#fef3c7',borderRadius:6,padding:'2px 8px'}}>
                          ⚠️ ยังไม่มีตำแหน่ง
                        </span>
                      )}
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--g-800)',
                                 overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {p.name}
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:15,fontWeight:800,color:'#1b5e20'}}>
                      {whQty(p)} <span style={{fontSize:10,fontWeight:500,color:'var(--muted)'}}>ชิ้น</span>
                    </div>
                    {locks.length === 0 && (
                      <button onClick={e => { e.stopPropagation(); setQaMode(true); setQaSku(p.sku); setQaLockKey(''); }}
                        style={{marginTop:4,fontSize:11,padding:'3px 8px',borderRadius:6,
                                border:'1px solid #1b5e20',background:'#fff',color:'#1b5e20',
                                cursor:'pointer',fontWeight:700,fontFamily:'inherit'}}>
                        + ระบุตำแหน่ง
                      </button>
                    )}
                    {locks.length > 0 && (
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>แตะเพื่อดูล็อค</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="row row-4" style={{marginBottom:16}}>
        <KPI label="📦 ล็อคที่ใช้แล้ว" value={`${fmtN(usedCount)}/${fmtN(totalLocks)}`}
             sub={`${(usedCount/totalLocks*100).toFixed(1)}% ของคลัง`}
             accent="#1f7f44" icon={I.package}/>
        <KPI label="✅ เช็คแล้ว" value={fmtN(verifiedCount)}
             sub={`${usedCount > 0 ? (verifiedCount/usedCount*100).toFixed(0) : 0}% ของที่ใช้`}
             accent="#4fb472" icon={I.check}/>
        <KPI label="❌ ไม่ตรงระบบ" value={fmtN(mismatchCount)}
             sub={mismatchCount > 0 ? "⚠️ ต้องตรวจสอบ" : "✓ ปกติ"}
             accent={mismatchCount > 0 ? "#b8341c" : "#5c8a3c"} icon={I.warning}/>
        <KPI label="🔍 ยังไม่ระบุล็อค" value={fmtN(unassigned.length)}
             sub="ต้องไปเดินเช็ค"
             accent="#a07417" icon={I.alert}/>
      </div>

      <Card title="📍 แผนผังคลังสินค้า"
            sub={`ฝั่ง A: ${shelves.A} ชั้น · ฝั่ง B: ${shelves.B} ชั้น · ${shelves.locksPerShelf} ล็อค/ชั้น`}
            action={
              <Seg value={side} onChange={setSide} options={[
                {value:'A',label:'🟩 ซอย A'},{value:'B',label:'🟦 ซอย B'},{value:'all',label:'🗂️ ทั้งหมด'},
              ]}/>
            }>
        {searchSku && (
          <div style={{marginBottom:12,padding:"8px 12px",background:"#fff8e1",
                       borderRadius:8,fontSize:12,border:"1px solid #ffe082"}}>
            {searchMatches.size > 0
              ? <>ไฮไลต์ <b>{searchMatches.size}</b> ล็อคที่มี "{searchSku}" — กดล็อคสีส้มเพื่อดูรายละเอียด</>
              : <span style={{color:"var(--muted)"}}>ไม่พบ "{searchSku}" ในล็อคใดเลย</span>}
          </div>
        )}

        <div style={{display:"flex",gap:14,fontSize:11,color:"var(--muted)",
                     marginBottom:14,flexWrap:"wrap"}}>
          <span><i className="lock-legend lock-verified"/> ✅ เช็คแล้ว (ตรง)</span>
          <span><i className="lock-legend lock-master"/> 📦 มีในระบบ</span>
          <span><i className="lock-legend lock-mismatch"/> ❌ ไม่ตรงระบบ</span>
          <span><i className="lock-legend lock-empty"/> ⬜ ว่าง</span>
          <span><i className="lock-legend lock-search"/> 🔍 ผลค้นหา</span>
        </div>

        <div className="shelf-wrap">
          {sides.map(s => {
            const total = shelves[s] || 10;
            const locksN = shelves.locksPerShelf || 15;
            // Build bays: pair odd (right) with next even (left)
            // A1+A2, A3+A4, A5+A6, …
            const bays = [];
            for (let n = 1; n <= total; n += 2) {
              bays.push({ right: n, left: n + 1 <= total ? n + 1 : null });
            }
            return (
              <div key={s} className="shelf-side">
                <div className="shelf-side-label">
                  ซอย {s}
                  <span style={{fontSize:11,fontWeight:400,color:"var(--muted)",marginLeft:8}}>
                    ← ลึกเข้าไป · ทางเข้า →
                  </span>
                </div>
                <div className="aisle-bays">
                  {bays.map(({right, left}) => (
                    <div key={right} className="aisle-bay">
                      {/* Right shelf label + grid */}
                      <div className="bay-wall-label right-label">
                        ฝั่งขวา (ติดกำแพง) · {s}{right}
                      </div>
                      <ShelfBlock side={s} shelf={right} locks={locksN}
                                  lockData={lockData} searchMatches={searchMatches}
                                  onClick={setSelectedLock} allowEmpty={true} isRight={true}/>
                      {/* Aisle divider */}
                      <div className="bay-aisle-div">── ทางเดิน ──</div>
                      {/* Left shelf grid + label */}
                      {left && <>
                        <ShelfBlock side={s} shelf={left} locks={locksN}
                                    lockData={lockData} searchMatches={searchMatches}
                                    onClick={setSelectedLock} allowEmpty={true}/>
                        <div className="bay-wall-label left-label">
                          ฝั่งซ้าย · {s}{left}
                        </div>
                      </>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <UnassignedProductCards
        products={products}
        lockData={lockData}
        shelves={shelves}
        onAssigned={(sku, lockKey) => handleUpdateLock(lockKey, [
          ...(lockData[lockKey]?.skus || []).filter(s => s !== sku), sku
        ])}
      />

      {selectedLock && (
        <LockModal lockKey={selectedLock}
                   data={lockData[selectedLock] || { skus:[], verified:false, entries:[], mismatch:false }}
                   productMap={productMap}
                   products={products}
                   lockOv={lockOv[selectedLock] || []}
                   onUpdateLock={(skus) => handleUpdateLock(selectedLock, skus)}
                   onClose={() => setSelectedLock(null)}/>
      )}

      <style>{`
        .shelf-wrap { display:flex; flex-direction:column; gap:32px; }
        .shelf-side-label { font-weight:700; font-size:14px; color:var(--g-700); margin-bottom:12px;
                            padding-bottom:6px; border-bottom:2px solid var(--g-100); }
        /* Bay layout — bays scroll horizontally, each bay = right shelf + aisle + left shelf */
        .aisle-bays { display:flex; flex-direction:column; gap:20px; }
        .aisle-bay { display:flex; flex-direction:column; align-items:stretch; }
        .bay-wall-label { font-size:10px; font-weight:700; padding:3px 6px; border-radius:4px;
                          text-align:center; }
        .right-label { background:#e8f5e9; color:#1b5e20; margin-bottom:5px; }
        .left-label  { background:#e3f2fd; color:#0d47a1; margin-top:5px; }
        .bay-aisle-div { text-align:center; font-size:10px; color:var(--muted);
                         padding:5px 0; border-top:1px dashed var(--bdr);
                         border-bottom:1px dashed var(--bdr); margin:4px 0; letter-spacing:1px; }
        /* ShelfBlock inside a bay takes full width */
        .aisle-bay .shelf-block { width:100%; box-sizing:border-box; }
        .lock-grid { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr));
                     grid-auto-rows:20px; gap:2px; }
        .shelf-block { border:1px solid var(--bdr); border-radius:8px; padding:5px; background:#fff;
                       transition:box-shadow .15s; min-width:0; overflow:hidden; box-sizing:border-box; }
        .shelf-block:hover { box-shadow:0 2px 8px rgba(0,0,0,.05); }
        .shelf-label { font-weight:700; font-size:11px; text-align:center; padding:3px 4px;
                       background:var(--g-50); border-radius:5px; color:var(--g-700); margin-bottom:5px; }
        .lock-grid { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr));
                     grid-auto-rows:18px; gap:2px; }
        .lock { display:flex; align-items:center; justify-content:center; font-size:9px; line-height:1;
                border:1px solid var(--bdr); border-radius:3px; cursor:pointer; position:relative;
                background:#fafafa; color:#aaa; transition:transform .1s; user-select:none;
                min-width:0; overflow:hidden; box-sizing:border-box; }
        .lock:hover { transform:scale(1.18); z-index:1; }
        .lock.empty { cursor:default; }
        .lock.empty:hover { transform:none; }
        .lock.master { background:#c8e6c9; color:#1b5e20; border-color:#81c784; font-weight:700; }
        .lock.verified { background:#66bb6a; color:#fff; border-color:#2e7d32; font-weight:700; }
        .lock.mismatch { background:#ef5350; color:#fff; border-color:#c62828; font-weight:700; }
        .lock.search { box-shadow:inset 0 0 0 2px #ff9800; z-index:2; }
        .lock-count { position:absolute; top:0; right:0; background:#0D2C54; color:#fff;
                      font-size:8px; padding:0 3px; border-radius:0 2px 0 4px; line-height:1.4;
                      font-weight:700; }
        .lock-legend { display:inline-block; width:14px; height:14px; border-radius:3px; margin-right:5px;
                       vertical-align:middle; border:1px solid var(--bdr); }
        .lock-legend.lock-verified { background:#66bb6a; border-color:#2e7d32; }
        .lock-legend.lock-master   { background:#c8e6c9; border-color:#81c784; }
        .lock-legend.lock-mismatch { background:#ef5350; border-color:#c62828; }
        .lock-legend.lock-empty    { background:#fafafa; }
        .lock-legend.lock-search   { background:#fff; box-shadow:0 0 0 2px #ff9800; }
        @media (max-width: 1100px) {
          .shelf-row { grid-template-columns:repeat(5, 1fr); }
        }
        @media (max-width: 768px) {
          .shelf-row { grid-template-columns:repeat(4, 1fr); }
          .shelf-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
          .aisle-bays { gap: 12px; }
        }
        @media (max-width: 600px) {
          .shelf-row { grid-template-columns:repeat(2, 1fr); }
          .lock-grid { grid-template-columns:repeat(5, minmax(0,1fr)); grid-auto-rows:16px; gap:1px; }
          .lock { font-size:8px; }
          .shelf-block { padding:3px; border-radius:6px; }
          .shelf-label { font-size:10px; padding:2px 3px; margin-bottom:3px; }
          .aisle-bays { gap:8px; }
        }
      `}</style>
    </div>
  );
}

// ─── UnassignedProductCards ───────────────────────────────────────────────────
// emoji symbols for each category (for workers who can't read Thai)
const PAGE_SIZE = 10;

// Inline 2-step lock picker: select shelf → select lock number from mini grid
function LockPicker({ shelves, value, onChange }) {
  // parse current value e.g. "A3/7" → shelf="A3", lock=7
  const parseVal = (v) => {
    if (!v) return { shelf: null, lock: null };
    const m = String(v).match(/^([A-B]\d+)\/(\d+)$/);
    return m ? { shelf: m[1], lock: parseInt(m[2]) } : { shelf: null, lock: null };
  };
  const { shelf: initShelf } = parseVal(value);
  const [selShelf, setSelShelf] = uS(initShelf);

  const shelfList = uM(() => {
    const list = [];
    ['A','B'].forEach(side => {
      const count = shelves[side] || 10;
      for (let n = 1; n <= count; n++) list.push(`${side}${n}`);
    });
    return list;
  }, [shelves]);

  const locksN = shelves.locksPerShelf || 15;
  const cols = 5, rows = Math.ceil(locksN / cols);

  const handleShelf = (s) => {
    setSelShelf(s);
    // clear lock selection when shelf changes
    const { lock } = parseVal(value);
    if (lock) onChange(""); // reset
  };

  const handleLock = (n) => {
    onChange(`${selShelf}/${n}`);
  };

  const { lock: selLock } = parseVal(value);

  // even-numbered shelf = left wall, faces opposite direction → lock 1 at top-left
  const shelfNum = selShelf ? parseInt(selShelf.replace(/[A-Za-z]/g, '')) : 0;
  const isEven = shelfNum % 2 === 0;

  return (
    <div style={{fontSize:12}}>
      {/* Step 1: shelf buttons */}
      <div style={{marginBottom:6,fontSize:11,color:"var(--muted)",fontWeight:600}}>
        ① เลือกชั้น
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
        {shelfList.map(s => (
          <button key={s} onClick={() => handleShelf(s)}
                  style={{padding:"4px 8px",borderRadius:6,border:"1px solid",fontSize:11,
                          fontWeight:700,fontFamily:"monospace",cursor:"pointer",
                          background: selShelf===s ? "#1b5e20" : "#fff",
                          color: selShelf===s ? "#fff" : "var(--g-700)",
                          borderColor: selShelf===s ? "#1b5e20" : "var(--bdr)"}}>
            {s}
          </button>
        ))}
      </div>
      {/* Step 2: lock grid */}
      {selShelf && (
        <>
          <div style={{marginBottom:6,fontSize:11,color:"var(--muted)",fontWeight:600}}>
            ② เลือกล็อค ใน {selShelf}
            <span style={{marginLeft:6,fontSize:10,fontWeight:400}}>
              {isEven ? "ฝั่งซ้าย (1→ขวา)" : "ฝั่งขวา (1←ซ้าย)"}
            </span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},minmax(0,1fr))`,
                       gap:3,marginBottom:6}}>
            {Array.from({length: rows}, (_, row) =>
              Array.from({length: cols}, (_, col) => {
                const n = isEven
                  ? col * rows + row + 1
                  : (cols - 1 - col) * rows + row + 1;
                if (n > locksN) return <div key={`e${row}-${col}`}/>;
                const picked = selLock === n && value === `${selShelf}/${n}`;
                return (
                  <button key={n} onClick={() => handleLock(n)}
                          style={{padding:"5px 2px",borderRadius:5,border:"1px solid",
                                  fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"center",
                                  background: picked ? "#1565c0" : "#f5f5f5",
                                  color: picked ? "#fff" : "#333",
                                  borderColor: picked ? "#1565c0" : "#ddd"}}>
                    {n}
                  </button>
                );
              })
            )}
          </div>
          {value && (
            <div style={{fontSize:11,color:"#1565c0",fontWeight:700,textAlign:"center",
                          padding:"3px 0",background:"#e3f2fd",borderRadius:5}}>
              เลือก: {value}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function UnassignedProductCards({ products, lockData, shelves, onAssigned }) {
  const assignedSkus = uM(() => {
    const s = new Set();
    Object.values(lockData).forEach(d => d.skus.forEach(sk => s.add(sk)));
    return s;
  }, [lockData]);

  const noLock = uM(() =>
    products
      .filter(p => whQty(p) > 0 && !assignedSkus.has(p.sku))
      .sort(compareSku),
    [products, assignedSkus]);

  // All categories in noLock list
  const cats = uM(() => {
    const s = new Set();
    noLock.forEach(p => { if (p.cat) s.add(p.cat); });
    return ["ALL", ...Array.from(s)];
  }, [noLock]);

  const [catFilter, setCatFilter] = uS("ALL");
  const [search, setSearch] = uS("");
  const [page, setPage] = uS(0);
  const [picks, setPicks] = uS({});
  const [saving, setSaving] = uS({});
  const [done, setDone] = uS({});
  const [openPicker, setOpenPicker] = uS(null);
  const [toast, showToast, hideToast] = useToast();

  const filtered = uM(() => {
    let f = catFilter === "ALL" ? noLock : noLock.filter(p => p.cat === catFilter);
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      f = f.filter(p => (p.sku||"").toUpperCase().includes(q) || (p.name||"").toUpperCase().includes(q));
    }
    return f;
  }, [noLock, catFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleCatFilter = (cat) => { setCatFilter(cat); setPage(0); setSearch(""); };
  const handleSearch = (val) => { setSearch(val); setPage(0); };
  const setPick = (sku, val) => setPicks(p => ({ ...p, [sku]: val }));

  const handleAssign = async (sku) => {
    const lockKey = picks[sku];
    if (!lockKey) return;
    setSaving(s => ({ ...s, [sku]: true }));
    // 1. บันทึก localStorage ทันที
    onAssigned(sku, lockKey);
    // 2. บันทึกขึ้น Google Sheet
    const prod = products.find(p => p.sku === sku);
    const qty = prod ? whQty(prod) : 0;
    const result = await syncLockData(lockKey, [{ sku, qty, isNew: true }]);
    setSaving(s => ({ ...s, [sku]: false }));
    if (result.success !== false) {
      setDone(d => ({ ...d, [sku]: lockKey }));
      setOpenPicker(null);
      showToast("success", `บันทึก ${sku} → ล็อค ${lockKey}`, "💾");
    } else {
      showToast("error", "บันทึก Sheet ไม่สำเร็จ — ลองใหม่อีกครั้ง", "❌");
    }
  };

  if (noLock.length === 0) return null;

  return (
    <>
    <Toast toast={toast} onClose={hideToast}/>
    <Card title={`📦 สินค้าในคลังที่ยังไม่มีตำแหน่งล็อค (${noLock.length} รายการ)`}
          sub="ของมีอยู่ที่คลัง แต่ยังไม่ระบุตำแหน่ง — กดการ์ดเพื่อระบุล็อค"
          style={{marginTop:16}}>

      {/* Search + scan */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
        <input type="text" placeholder="🔍 ค้นหา SKU หรือชื่อสินค้า..."
               value={search} onChange={e => handleSearch(e.target.value)}
               style={{flex:1,padding:"8px 12px",borderRadius:9,border:"1.5px solid var(--bdr)",
                       fontSize:13,fontFamily:"inherit"}}/>
        <ScanButton onScan={sku => { handleSearch(sku); setOpenPicker(sku); }}/>
      </div>

      {/* Category filter */}
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
        {cats.map(cat => {
          const emoji = CAT_EMOJI[cat] || "";
          const count = cat === "ALL" ? noLock.length : noLock.filter(p => p.cat === cat).length;
          const active = catFilter === cat;
          return (
            <button key={cat} onClick={() => handleCatFilter(cat)}
                    style={{padding:"5px 10px",borderRadius:20,border:"1px solid",fontSize:12,
                            fontWeight: active ? 700 : 400, cursor:"pointer",
                            background: active ? "#1b5e20" : "#fff",
                            color: active ? "#fff" : "var(--g-700)",
                            borderColor: active ? "#1b5e20" : "var(--bdr)"}}>
              {emoji && <span style={{marginRight:4}}>{emoji}</span>}
              {cat === "ALL" ? "ทั้งหมด" : cat}
              <span style={{marginLeft:5,fontSize:10,
                            color: active ? "rgba(255,255,255,.8)" : "var(--muted)"}}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Product cards */}
      <div className="storage-product-grid" style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:12}}>
        {paginated.map(p => {
          const pWhQty = whQty(p);
          const isDone = !!done[p.sku];
          const isSaving = !!saving[p.sku];
          const isOpen = openPicker === p.sku;
          const picked = picks[p.sku] || "";
          const emoji = CAT_EMOJI[p.cat] || "";

          return (
            <div key={p.sku} style={{
              border:`2px solid ${isDone ? "#81c784" : isOpen ? "#1565c0" : "var(--bdr)"}`,
              borderRadius:12, overflow:"hidden", background: isDone ? "#f1f8f1" : "#fff",
              display:"flex", flexDirection:"column", transition:"border-color .15s",
              boxShadow: isOpen ? "0 4px 16px rgba(21,101,192,.15)" : "none"
            }}>
              {/* Product image */}
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name}
                     style={{width:"100%",height:140,objectFit:"contain",display:"block",background:"var(--g-50)"}}/>
              ) : (
                <div style={{width:"100%",height:100,background:"var(--g-50)",
                              display:"flex",flexDirection:"column",alignItems:"center",
                              justifyContent:"center",gap:4}}>
                  <span style={{fontSize:32}}>{emoji || "📦"}</span>
                  <span style={{fontSize:10,color:"var(--muted)"}}>ไม่มีรูป</span>
                </div>
              )}

              <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:6,flex:1}}>
                {/* SKU + qty */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:10,fontWeight:700,color:"var(--g-500)",
                                fontFamily:"monospace"}}>
                    {p.sku}
                  </span>
                  <span style={{fontSize:11,fontWeight:700,color:"#1b5e20",
                                background:"#e8f5e9",padding:"1px 7px",borderRadius:12}}>
                    คลัง {pWhQty}
                  </span>
                </div>

                {/* Name */}
                <div style={{fontSize:12,fontWeight:600,color:"var(--g-800)",lineHeight:1.35,
                              overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,
                              WebkitBoxOrient:"vertical"}}>
                  {emoji && <span style={{marginRight:4}}>{emoji}</span>}{p.name || "-"}
                </div>

                {/* Done state */}
                {isDone ? (
                  <div style={{fontSize:12,color:"#2e7d32",fontWeight:700,textAlign:"center",
                                padding:"6px",background:"#e8f5e9",borderRadius:8,marginTop:"auto"}}>
                    ✓ บันทึกล็อค {done[p.sku]} แล้ว
                  </div>
                ) : (
                  <>
                    {/* Toggle picker button */}
                    <button onClick={() => setOpenPicker(isOpen ? null : p.sku)}
                            style={{padding:"6px",borderRadius:8,border:"1px solid",fontSize:12,
                                    fontWeight:700,cursor:"pointer",marginTop:"auto",
                                    background: isOpen ? "#e3f2fd" : "#fff",
                                    color: isOpen ? "#1565c0" : "var(--g-700)",
                                    borderColor: isOpen ? "#1565c0" : "var(--bdr)"}}>
                      {picked ? `📍 ${picked}` : "📍 ระบุตำแหน่งล็อค"}
                    </button>

                    {/* Inline lock picker */}
                    {isOpen && (
                      <div style={{marginTop:6,padding:10,background:"#f8f9ff",
                                    borderRadius:8,border:"1px solid #e3f2fd"}}>
                        <LockPicker shelves={shelves} value={picked}
                                    onChange={(v) => setPick(p.sku, v)}/>
                        <button onClick={() => handleAssign(p.sku)}
                                disabled={!picked || isSaving}
                                style={{width:"100%",marginTop:8,padding:"8px",
                                        borderRadius:8,border:"none",fontWeight:700,
                                        fontSize:13,cursor: picked ? "pointer" : "default",
                                        background: picked ? "#1b5e20" : "var(--g-200)",
                                        color: picked ? "#fff" : "var(--muted)"}}>
                          {isSaving ? "กำลังบันทึก…" : picked ? `✓ บันทึก ${picked}` : "เลือกล็อคก่อน"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",
                     gap:8,marginTop:16,flexWrap:"wrap"}}>
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0}
                  style={{padding:"5px 14px",borderRadius:8,border:"1px solid var(--bdr)",
                          background:"#fff",cursor:page===0?"default":"pointer",fontSize:13,
                          color:page===0?"var(--muted)":"var(--g-800)"}}>
            ‹ ก่อนหน้า
          </button>
          {Array.from({length: totalPages}, (_,i) => (
            <button key={i} onClick={() => setPage(i)}
                    style={{padding:"5px 10px",borderRadius:8,border:"1px solid",
                            fontSize:12,fontWeight:700,cursor:"pointer",
                            background: page===i ? "#1b5e20" : "#fff",
                            color: page===i ? "#fff" : "var(--g-700)",
                            borderColor: page===i ? "#1b5e20" : "var(--bdr)"}}>
              {i+1}
            </button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page===totalPages-1}
                  style={{padding:"5px 14px",borderRadius:8,border:"1px solid var(--bdr)",
                          background:"#fff",cursor:page===totalPages-1?"default":"pointer",fontSize:13,
                          color:page===totalPages-1?"var(--muted)":"var(--g-800)"}}>
            ถัดไป ›
          </button>
          <span style={{fontSize:12,color:"var(--muted)"}}>
            หน้า {page+1}/{totalPages} ({filtered.length} รายการ)
          </span>
        </div>
      )}
    </Card>
    </>
  );
}

function ShelfBlock({ side, shelf, locks, lockData, searchMatches, onClick, allowEmpty, isRight }) {
  // ฝั่งซ้าย (isRight=false):   ฝั่งขวา (isRight=true):
  // 15 12  9  6  3              13 10  7  4  1
  // 14 11  8  5  2              14 11  8  5  2
  // 13 10  7  4  1              15 12  9  6  3
  const cols = 5, rows = 3;
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const num = isRight
        ? (cols - 1 - col) * rows + (row + 1)        // ขวา: 1 บนขวา, 15 ล่างซ้าย
        : (cols - 1 - col) * rows + (rows - row);    // ซ้าย: 15 บนซ้าย, 1 ล่างขวา
      if (num > locks) { cells.push(<div key={`e${row}-${col}`} style={{visibility:'hidden'}}/>); continue; }
      const key = `${side}${shelf}/${num}`;
      const d = lockData[key];
      const isSearch = searchMatches.has(key);
      let cls = 'lock empty';
      if (d) {
        if (d.mismatch)      cls = 'lock mismatch';
        else if (d.verified) cls = 'lock verified';
        else                 cls = 'lock master';
      }
      if (isSearch) cls += ' search';
      cells.push(
        <div key={num} className={cls}
             onClick={() => (d || allowEmpty) && onClick(key)}
             style={!d && allowEmpty ? {cursor:"pointer"} : undefined}
             title={d ? `${key} · ${d.skus.length} SKU${d.mismatch?' · สต๊อกไม่ตรง':''}` : `${key} · ว่าง (กดเพื่อเพิ่มสินค้า)`}>
          {num}
          {d && d.skus.length > 1 && <span className="lock-count">{d.skus.length}</span>}
        </div>
      );
    }
  }
  return (
    <div className="shelf-block">
      <div className="shelf-label">{side}{shelf}</div>
      <div className="lock-grid">{cells}</div>
    </div>
  );
}

// ─── WarehouseMapModal ────────────────────────────────────────────────────────
// แสดงแผนผังคลังสินค้าเหมือน StorageView แต่ไฮไลต์ล็อคที่ระบุ
// props: open, onClose, highlightKey (เช่น "A3/7"), lockData, shelves, productName, sku
function WarehouseMapModal({ open, onClose, highlightKey, lockData, shelves, productName, sku }) {
  useBackHandler(open ? onClose : null); // Android back = ปิด modal
  const [side, setSide] = uS('all');

  // auto-select ฝั่งที่มี highlight แล้ว scroll ไปหาแถวนั้น
  uE(() => {
    if (!open || !highlightKey) return;
    const m = highlightKey.match(/^([AB])/);
    if (m) setSide(m[1]);
    // scroll ไปหา highlighted cell หลัง render
    const t = setTimeout(() => {
      const el = document.querySelector('[data-hlkey="' + highlightKey + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => clearTimeout(t);
  }, [open, highlightKey]);

  if (!open) return null;

  const safeShelf = shelves || { A: 10, B: 10, locksPerShelf: 15 };
  const sides = side === 'all' ? ['A', 'B'] : [side];

  // highlight set — key เดียวแต่ใส่ใน Set เพื่อใช้กับ ShelfBlock
  const highlightSet = uM(() => {
    const s = new Set();
    if (highlightKey) s.add(highlightKey);
    return s;
  }, [highlightKey]);

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:2000,
      background:"rgba(0,0,0,.72)", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"flex-end", justifyContent:"center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"#f8fafc", borderRadius:"18px 18px 0 0",
        width:"100%", maxWidth:600, maxHeight:"90vh",
        display:"flex", flexDirection:"column",
        boxShadow:"0 -4px 32px rgba(0,0,0,.25)",
      }}>
        {/* Header */}
        <div style={{
          display:"flex", alignItems:"center", gap:12,
          padding:"16px 16px 10px", borderBottom:"1px solid var(--bdr)",
          flexShrink:0,
        }}>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:11, color:"var(--muted)", fontFamily:"monospace"}}>{sku}</div>
            <div style={{fontSize:15, fontWeight:800, lineHeight:1.2,
                         overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
              📍 {highlightKey || "—"}
              {productName ? <span style={{fontSize:12, fontWeight:500, color:"var(--muted)",
                                          marginLeft:8}}>{productName}</span> : null}
            </div>
          </div>
          <Seg value={side} onChange={setSide} options={[
            {value:'A', label:'ซอย A'},
            {value:'B', label:'ซอย B'},
            {value:'all', label:'ทั้งหมด'},
          ]}/>
          <button onClick={onClose} style={{
            width:44, height:44, borderRadius:10, border:"1.5px solid var(--bdr)",
            background:"#fff", cursor:"pointer", fontSize:20, fontFamily:"inherit",
            flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
          }}>✕</button>
        </div>

        {/* Map body */}
        <div style={{overflow:"auto", padding:"12px 16px 24px", flex:1}}>
          {/* Legend */}
          <div style={{display:'flex', gap:10, fontSize:10, color:'var(--muted)', marginBottom:10, flexWrap:'wrap'}}>
            <span><i className="lock-legend lock-verified"/> เช็คแล้ว</span>
            <span><i className="lock-legend lock-master"/> มีในระบบ</span>
            <span><i className="lock-legend lock-mismatch"/> ไม่ตรง</span>
            <span><i className="lock-legend lock-empty"/> ว่าง</span>
            <span style={{display:"inline-flex", alignItems:"center", gap:3}}>
              <span style={{display:"inline-block", width:14, height:14, borderRadius:3,
                            background:"#4ade80", border:"2px solid #16a34a",
                            verticalAlign:"middle", marginRight:3}}/>
              ตำแหน่งสินค้า
            </span>
          </div>

          <div className="shelf-wrap">
            {sides.map(s => {
              const total = safeShelf[s] || 10;
              const locksN = safeShelf.locksPerShelf || 15;
              const bays = [];
              for (let n = 1; n <= total; n += 2) {
                bays.push({ right: n, left: n + 1 <= total ? n + 1 : null });
              }
              return (
                <div key={s} className="shelf-side">
                  <div className="shelf-side-label">ซอย {s}</div>
                  <div className="aisle-bays">
                    {bays.map(({right, left}) => (
                      <div key={right} className="aisle-bay">
                        <div className="bay-wall-label right-label">ฝั่งขวา · {s}{right}</div>
                        <ShelfBlockHighlight
                          side={s} shelf={right} locks={locksN}
                          lockData={lockData || {}} highlightKey={highlightKey}
                          isRight={true}/>
                        <div className="bay-aisle-div">── ทางเดิน ──</div>
                        {left && <>
                          <ShelfBlockHighlight
                            side={s} shelf={left} locks={locksN}
                            lockData={lockData || {}} highlightKey={highlightKey}/>
                          <div className="bay-wall-label left-label">ฝั่งซ้าย · {s}{left}</div>
                        </>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Close button (large, มือถือ) */}
        <div style={{padding:"12px 16px 20px", flexShrink:0}}>
          <button onClick={onClose} style={{
            width:"100%", padding:"14px", borderRadius:12, border:"none",
            background:"var(--g-700)", color:"#fff", fontWeight:700, fontSize:15,
            fontFamily:"inherit", cursor:"pointer", minHeight:48,
          }}>ปิด</button>
        </div>
      </div>
      <style>{`
        .shelf-wrap{display:flex;flex-direction:column;gap:32px}
        .shelf-side-label{font-weight:700;font-size:14px;color:var(--g-700);margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid var(--g-100)}
        .aisle-bays{display:flex;flex-direction:column;gap:20px}
        .aisle-bay{display:flex;flex-direction:column;align-items:stretch}
        .bay-wall-label{font-size:10px;font-weight:700;padding:3px 6px;border-radius:4px;text-align:center}
        .right-label{background:#e8f5e9;color:#1b5e20;margin-bottom:5px}
        .left-label{background:#e3f2fd;color:#0d47a1;margin-top:5px}
        .bay-aisle-div{text-align:center;font-size:10px;color:var(--muted);padding:5px 0;border-top:1px dashed var(--bdr);border-bottom:1px dashed var(--bdr);margin:4px 0;letter-spacing:1px}
        .aisle-bay .shelf-block{width:100%;box-sizing:border-box}
        .lock-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-auto-rows:20px;gap:2px}
        .shelf-block{border:1px solid var(--bdr);border-radius:8px;padding:5px;background:#fff;min-width:0;overflow:hidden;box-sizing:border-box}
        .shelf-label{font-weight:700;font-size:11px;text-align:center;padding:3px 4px;background:var(--g-50);border-radius:5px;color:var(--g-700);margin-bottom:5px}
        .lock{display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;border:1px solid var(--bdr);border-radius:3px;cursor:pointer;position:relative;background:#fafafa;color:#aaa;user-select:none;min-width:0;overflow:hidden;box-sizing:border-box}
        .lock.empty{cursor:default}
        .lock.master{background:#c8e6c9;color:#1b5e20;border-color:#81c784;font-weight:700}
        .lock.verified{background:#66bb6a;color:#fff;border-color:#2e7d32;font-weight:700}
        .lock.mismatch{background:#ef5350;color:#fff;border-color:#c62828;font-weight:700}
        .lock-count{position:absolute;top:0;right:0;background:#0D2C54;color:#fff;font-size:8px;padding:0 3px;border-radius:0 2px 0 4px;line-height:1.4;font-weight:700}
        .lock-legend{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:5px;vertical-align:middle;border:1px solid var(--bdr)}
        .lock-legend.lock-verified{background:#66bb6a;border-color:#2e7d32}
        .lock-legend.lock-master{background:#c8e6c9;border-color:#81c784}
        .lock-legend.lock-mismatch{background:#ef5350;border-color:#c62828}
        .lock-legend.lock-empty{background:#fafafa}
        @media(max-width:600px){.lock-grid{grid-auto-rows:16px;gap:1px}.lock{font-size:8px}.shelf-block{padding:3px;border-radius:6px}.shelf-label{font-size:10px;padding:2px 3px;margin-bottom:3px}.aisle-bays{gap:8px}}
      `}</style>
    </div>
  );
}

// ShelfBlock สำหรับ WarehouseMapModal — เหมือน ShelfBlock แต่ไฮไลต์ highlightKey ด้วยสีเขียวสด
function ShelfBlockHighlight({ side, shelf, locks, lockData, highlightKey, isRight }) {
  const cols = 5, rows = 3;
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const num = isRight
        ? (cols - 1 - col) * rows + (row + 1)
        : (cols - 1 - col) * rows + (rows - row);
      if (num > locks) { cells.push(<div key={`e${row}-${col}`} style={{visibility:'hidden'}}/>); continue; }
      const key = `${side}${shelf}/${num}`;
      const d = lockData[key];
      const isHL = key === highlightKey;
      let cls = 'lock empty';
      if (isHL) cls = 'lock'; // override ด้วย inline style ด้านล่าง
      else if (d) {
        if (d.mismatch)      cls = 'lock mismatch';
        else if (d.verified) cls = 'lock verified';
        else                 cls = 'lock master';
      }
      const hlStyle = isHL ? {
        background:"#4ade80", borderColor:"#16a34a", color:"#14532d",
        fontWeight:900, boxShadow:"0 0 0 3px #86efac",
        animation:"wh-pulse 1s ease-in-out infinite",
        zIndex:3, transform:"scale(1.25)",
      } : undefined;
      cells.push(
        <div key={num} className={cls} style={hlStyle}
             data-hlkey={isHL ? key : undefined}
             title={isHL ? `${key} · ตำแหน่งสินค้า` : (d ? `${key} · ${d.skus.length} SKU` : `${key} · ว่าง`)}>
          {num}
          {d && !isHL && d.skus.length > 1 && <span className="lock-count">{d.skus.length}</span>}
        </div>
      );
    }
  }
  return (
    <div className="shelf-block">
      <div className="shelf-label">{side}{shelf}</div>
      <div className="lock-grid">{cells}</div>
      <style>{`@keyframes wh-pulse{0%,100%{box-shadow:0 0 0 3px #86efac}50%{box-shadow:0 0 0 6px #4ade80}}`}</style>
    </div>
  );
}

function ImageLightbox({ url, name, onClose }) {
  useBackHandler(onClose); // Android back = ปิดรูป
  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:2000,
      background:"rgba(0,0,0,.82)", backdropFilter:"blur(6px)",
      display:"flex", alignItems:"center", justifyContent:"center",
      cursor:"zoom-out"
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        display:"flex", flexDirection:"column", alignItems:"center", gap:12,
        maxWidth:"90vw", maxHeight:"90vh"
      }}>
        <img src={url} alt={name}
             style={{maxWidth:"80vw", maxHeight:"75vh",
                     borderRadius:12, boxShadow:"0 8px 40px rgba(0,0,0,.5)",
                     objectFit:"contain", background:"#fff", padding:8}}/>
        <div style={{color:"#fff", fontSize:13, fontWeight:500, textAlign:"center",
                     background:"rgba(255,255,255,.12)", padding:"6px 14px",
                     borderRadius:20, backdropFilter:"blur(4px)"}}>
          {name}
        </div>
      </div>
      <button onClick={onClose} style={{
        position:"absolute", top:16, right:16,
        background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)",
        color:"#fff", borderRadius:10, width:48, height:48,
        cursor:"pointer", fontSize:24, fontFamily:"inherit"
      }}>×</button>
    </div>
  );
}

// ─── QR Scanner (html5-qrcode — รองรับทุก browser: iOS Safari, Android, Desktop) ───
function QRScanModal({ onDetected, onClose }) {
  const scannerRef = React.useRef(null);
  const containerId = React.useMemo(() => `qr-reader-${Math.random().toString(36).slice(2,9)}`, []);
  const [err, setErr] = uS(null);
  const [lastSku, setLastSku] = uS(null);
  const [ready, setReady] = uS(false);
  const lastDetectRef = React.useRef({ sku:null, t:0 });

  uE(() => {
    if (!window.Html5Qrcode) {
      setErr("ไม่สามารถโหลด library scanner ได้\nกรุณาตรวจสอบ internet แล้วโหลดหน้านี้ใหม่");
      return;
    }
    let h5q;
    let cancelled = false;
    const start = async () => {
      try {
        h5q = new window.Html5Qrcode(containerId, {
          formatsToSupport: [
            window.Html5QrcodeSupportedFormats.QR_CODE,
            window.Html5QrcodeSupportedFormats.CODE_128,
            window.Html5QrcodeSupportedFormats.CODE_39,
            window.Html5QrcodeSupportedFormats.CODE_93,
            window.Html5QrcodeSupportedFormats.EAN_13,
            window.Html5QrcodeSupportedFormats.EAN_8,
            window.Html5QrcodeSupportedFormats.UPC_A,
            window.Html5QrcodeSupportedFormats.UPC_E,
            window.Html5QrcodeSupportedFormats.DATA_MATRIX,
            window.Html5QrcodeSupportedFormats.ITF,
          ],
        });
        scannerRef.current = h5q;
        await h5q.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            const sku = String(decoded || "").trim().toUpperCase();
            if (!sku) return;
            const now = Date.now();
            if (lastDetectRef.current.sku === sku && now - lastDetectRef.current.t < 1500) return;
            lastDetectRef.current = { sku, t: now };
            setLastSku(sku);
            onDetected(sku);
          },
          () => { /* ignore decode errors */ }
        );
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          const msg = e?.name || e?.message || String(e);
          const friendly =
            msg.includes("NotAllowed") || msg.includes("Permission")
              ? "🚫 ไม่ได้รับอนุญาตใช้กล้อง — กดอนุญาต (Allow) ใน browser แล้วลองใหม่"
            : msg.includes("NotFound") || msg.includes("Devices")
              ? "📵 ไม่พบกล้อง — ตรวจสอบว่าอุปกรณ์มีกล้องและเสียบแล้ว"
            : msg.includes("NotReadable") || msg.includes("busy")
              ? "⚠️ กล้องถูกใช้งานอยู่ — ปิดแอปอื่นที่ใช้กล้องแล้วลองใหม่"
            : msg.includes("https") || msg.includes("secure")
              ? "🔒 ต้องการ HTTPS — ไม่สามารถใช้กล้องบน HTTP ได้"
              : "❌ เปิดกล้องไม่ได้ — ลองรีโหลดหน้าหรือเปลี่ยน browser";
          setErr(friendly);
        }
      }
    };
    start();
    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) s.stop().then(() => s.clear()).catch(() => {});
    };
  }, []);

  const handleClose = async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    try { if (s) { await s.stop(); s.clear(); } } catch(e) {}
    onClose();
  };

  useBackHandler(handleClose); // Android back = ปิด scanner

  return (
    <div onClick={handleClose} style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,.88)",
      display:"flex",alignItems:"center",justifyContent:"center",
      zIndex:1100,padding:20,
    }}>
      <div className="qr-scan-modal-inner" onClick={e=>e.stopPropagation()} style={{
        background:"#fff",borderRadius:16,padding:20,
        maxWidth:400,width:"100%",
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:16,display:"flex",alignItems:"center",gap:8}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18,color:"var(--g-600)"}}>
              <path d="M4 8 V4 H8"/><path d="M16 4 H20 V8"/>
              <path d="M20 16 V20 H16"/><path d="M8 20 H4 V16"/>
              <path d="M3 12 H21"/>
            </svg>
            สแกน Barcode / QR Code
          </div>
          <button onClick={handleClose} style={{
            border:"1px solid var(--bdr)",background:"none",borderRadius:8,
            width:44,height:44,cursor:"pointer",fontSize:22,color:"var(--muted)",fontFamily:"inherit"
          }}>×</button>
        </div>

        {err ? (
          <div style={{
            padding:20,textAlign:"center",background:"#fee2e2",
            borderRadius:10,color:"#e53e3e",fontSize:13,whiteSpace:"pre-line"
          }}>{err}</div>
        ) : (
          <div style={{position:"relative",borderRadius:10,overflow:"hidden",background:"#000",minHeight:260}}>
            <div id={containerId} style={{width:"100%"}}/>
            {!ready && (
              <div style={{
                position:"absolute",inset:0,display:"flex",alignItems:"center",
                justifyContent:"center",color:"#fff",fontSize:13,
              }}>กำลังเปิดกล้อง…</div>
            )}
          </div>
        )}

        {lastSku && (
          <div style={{
            marginTop:12,padding:"8px 14px",background:"#e8f5e9",borderRadius:8,
            fontSize:13,fontWeight:700,color:"var(--g-700)",textAlign:"center",
          }}>
            ✓ สแกนได้: {lastSku}
          </div>
        )}
        <div style={{marginTop:10,fontSize:11,color:"var(--muted)",textAlign:"center"}}>
          สแกนสำเร็จแล้วกล้องจะปิดอัตโนมัติ · รองรับ iPhone/Android/PC
        </div>
      </div>
    </div>
  );
}

// ─── Reusable ScanButton ───
function ScanButton({ onScan, continuous = false, size = 36, style: extraStyle }) {
  const [open, setOpen] = uS(false);
  const handleDetected = (sku) => {
    onScan(sku.trim().toUpperCase());
    if (!continuous) setOpen(false);
  };
  const iconSize = Math.round(size * 0.52);
  return (
    <>
      <button onClick={() => setOpen(true)} title="สแกน Barcode / QR Code" style={{
        width:size, height:size, borderRadius:8,
        border:"1.5px solid var(--bdr)", background:"#fff",
        cursor:"pointer", display:"flex", alignItems:"center",
        justifyContent:"center", color:"var(--g-700)",
        flexShrink:0, ...extraStyle,
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round"
             style={{width:iconSize,height:iconSize}}>
          <path d="M4 8 V4 H8"/><path d="M16 4 H20 V8"/>
          <path d="M20 16 V20 H16"/><path d="M8 20 H4 V16"/>
          <path d="M3 12 H21"/>
        </svg>
      </button>
      {open && <QRScanModal onDetected={handleDetected} onClose={() => setOpen(false)}/>}
    </>
  );
}

// ─── sync front store data ───
async function syncFrontStoreData(entries) {
  if (!SHEET_DEPLOY_URL) { console.warn("SHEET_DEPLOY_URL not set"); return { success: false }; }
  try {
    await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        updateFrontStore: true,
        datetime: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }),
        entries,
      }),
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

// ─── Supplier Search Autocomplete ───
function SupplierSearch({ value, onChange, allSuppliers }) {
  const [text, setText] = uS(value || "");
  const [open, setOpen] = uS(false);
  const wrapRef = React.useRef(null);
  // ref เก็บ blurTimeout เพื่อยกเลิกได้เมื่อ click suggestion ก่อน blur fire
  const blurTimerRef = React.useRef(null);

  uE(() => { if (!value) setText(""); }, [value]);
  uE(() => {
    const handle = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const suggestions = uM(() => {
    const q = text.trim().toLowerCase();
    if (!q) return allSuppliers;
    return allSuppliers.filter(s => s.toLowerCase().includes(q));
  }, [text, allSuppliers]);

  const select = (s) => {
    // ยกเลิก blur timer (ถ้ามี) ก่อน click suggestion ทำงาน
    if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
    setText(s); onChange(s); setOpen(false);
  };
  const clear = () => {
    if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
    setText(""); onChange(""); setOpen(false);
  };

  // ตรวจว่า value ปัจจุบันเป็น free-text (ไม่อยู่ใน list) หรือไม่
  const isFreeText = value && !allSuppliers.includes(value);

  return (
    <div ref={wrapRef} style={{position:"relative", minWidth:150, flex:"0 0 auto"}}>
      <div style={{display:"flex",alignItems:"center",
                   border:`1.5px solid ${value ? "var(--g-500)" : "var(--bdr)"}`,
                   borderRadius:10, background:"#fff", overflow:"hidden"}}>
        {/* แสดงไอคอน ✏️ เล็กๆ เมื่อกรองด้วย free-text ที่ไม่อยู่ใน suggestions */}
        {isFreeText && (
          <span style={{paddingLeft:8,fontSize:11,color:"var(--warn)",flexShrink:0,userSelect:"none"}}>✏️</span>
        )}
        <input type="text" placeholder="🏪 ซัพพลายเออร์..."
          value={text}
          onChange={e => { setText(e.target.value); setOpen(true); onChange(""); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            // Enter → ใช้ค่าที่พิมพ์เป็น filter ทันที แม้ไม่อยู่ใน suggestions
            if (e.key === "Enter" && text.trim()) {
              if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
              onChange(text.trim()); setOpen(false);
            }
          }}
          onBlur={() => {
            // delay 150ms กันแข่งกับ onMouseDown ของ suggestion button
            blurTimerRef.current = setTimeout(function() {
              blurTimerRef.current = null;
              if (text.trim() && text.trim() !== value) {
                onChange(text.trim()); setOpen(false);
              }
            }, 150);
          }}
          style={{flex:1, padding:"8px 10px", border:"none", outline:"none",
                  fontSize:13, fontFamily:"inherit",
                  color: value ? "var(--g-700)" : "var(--text)",
                  fontWeight: value ? 600 : 400, minWidth:0}}/>
        {(text || value) && (
          <button onClick={clear}
            style={{padding:"0 8px",border:"none",background:"none",cursor:"pointer",
                    fontSize:16,color:"var(--muted)",lineHeight:1,fontFamily:"inherit"}}>×</button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div style={{
          position:"absolute", top:"100%", left:0, right:0, marginTop:4,
          background:"#fff", border:"1.5px solid var(--bdr)", borderRadius:10,
          boxShadow:"0 4px 16px rgba(0,0,0,.1)",
          maxHeight:220, overflowY:"auto", zIndex:200,
        }}>
          {suggestions.map(s => (
            <button key={s} onMouseDown={() => select(s)}
              style={{
                display:"block", width:"100%", padding:"9px 12px",
                textAlign:"left", border:"none", background:"none",
                cursor:"pointer", fontSize:13, fontFamily:"inherit",
                borderBottom:"1px solid var(--g-50)",
                color: s === value ? "var(--g-700)" : "var(--text)",
                fontWeight: s === value ? 700 : 400,
              }}
              onMouseEnter={e => e.currentTarget.style.background="#f0fdf4"}
              onMouseLeave={e => e.currentTarget.style.background="none"}>
              {s === value && "✓ "}{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
// ─── Memoized FrontStore Card ───
const FSCard = React.memo(function FSCard({ p, val, isSaved, isTouched, onSetQty, onImageClick, onOpenCalc, onOrder }) {
  const sysStore  = p.qtyStore ?? 0;
  const wh        = p.qtyWH ?? 0;
  const hasVal    = val !== "" && val != null;
  const num       = hasVal ? (parseInt(val) || 0) : null;
  const matched   = hasVal && num === sysStore;
  const diff      = hasVal ? num - sysStore : null;

  const borderColor = !hasVal ? "var(--bdr)"
    : matched ? "var(--g-500)" : "var(--dang)";
  const cardBg = isSaved ? "#f0fdf4"
    : isTouched ? "#fffbeb"
    : "#fff";
  const numVal = hasVal ? (parseInt(val) || 0) : 0;
  const adjustQty = (delta) => {
    const nv = Math.max(0, numVal + delta);
    onSetQty(p.sku, String(nv));
  };

  return (
    <div id={`fs-row-${p.sku}`}
         style={{
           background:cardBg,
           border:`2px solid ${borderColor}`,
           borderRadius:12, padding:12,
           display:"flex", flexDirection:"column", gap:10,
           transition:"border-color .2s, background .2s",
           boxShadow: hasVal ? "0 1px 3px rgba(0,0,0,.05)" : "none",
           minWidth:0, overflow:"hidden",
         }}>
      <div style={{position:"relative"}}>
        {p.imageUrl ? (
          <div onClick={() => onImageClick({url:p.imageUrl,name:p.name})}
               style={{width:"100%",aspectRatio:"4/3",borderRadius:10,cursor:"zoom-in",
                       backgroundImage:`url("${p.imageUrl}")`,backgroundSize:"contain",
                       backgroundPosition:"center",backgroundRepeat:"no-repeat",
                       backgroundColor:"#f8f9fa",border:"1px solid var(--bdr)"}}/>
        ) : (
          <div style={{width:"100%",aspectRatio:"4/3",borderRadius:10,
                       background:"var(--g-50)",border:"1px solid var(--bdr)",
                       display:"flex",alignItems:"center",justifyContent:"center",
                       fontSize:48,color:"var(--g-300)"}}>📦</div>
        )}
        {p.imageUrl && p.color && (
          <span style={{position:"absolute",bottom:8,right:8,width:12,height:12,
                        borderRadius:"50%",background:p.color.hex,
                        border:"2px solid #fff",boxShadow:"0 1px 4px rgba(0,0,0,.3)",
                        pointerEvents:"none"}}/>
        )}
      </div>
      <div>
        <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:2}}>
          <span className="skucode" style={{fontSize:10}}>{p.sku}</span>
          {isSaved && (
            <span style={{fontSize:9,background:"#dcfce7",color:"#166534",
              borderRadius:8,padding:"1px 6px",fontWeight:700}}>✓ บันทึก</span>
          )}
        </div>
        <div style={{fontWeight:600,fontSize:13,lineHeight:1.35,
                     display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",
                     overflow:"hidden"}}>
          {p.name}
        </div>
        {(p.lastSupplier || p.vendor) && (
          <div style={{fontSize:10,color:"var(--muted)",marginTop:3}}>
            🏪 {p.lastSupplier || p.vendor}
          </div>
        )}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{flex:1,textAlign:"center",background:"var(--g-600)",
                     borderRadius:8,padding:"7px 6px"}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,.75)",fontWeight:600,letterSpacing:.3}}>🏪 ร้าน</div>
          <div style={{fontSize:20,fontWeight:800,color:"#fff"}}>{fmtN(sysStore)}</div>
        </div>
        <div style={{flex:1,textAlign:"center",background:"#f1f5f9",
                     borderRadius:8,padding:"7px 6px"}}>
          <div style={{fontSize:9,color:"var(--muted)",fontWeight:600,letterSpacing:.3}}>🏭 คลัง</div>
          <div style={{fontSize:20,fontWeight:800,color:"#111"}}>{fmtN(wh)}</div>
        </div>
      </div>
      <div>
        <div style={{fontSize:10,color:"var(--muted)",fontWeight:600,marginBottom:4}}>
          ✏️ เช็คจริงที่นับได้
        </div>
        {/* ±qty buttons + input row (±5 removed — use CalcPad for large numbers) */}
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <button onClick={() => adjustQty(-1)}
            style={{minWidth:44,height:48,borderRadius:8,
                    border:"1.5px solid var(--bdr)",background:"#fff",
                    cursor:"pointer",fontSize:20,fontWeight:800,
                    fontFamily:"inherit",color:"var(--dang)",
                    opacity: numVal >= 1 ? 1 : 0.3}}>−</button>
          <div style={{flex:1, minWidth:0, position:"relative"}}>
            <input type="number" min="0" inputMode="numeric"
              value={val ?? ""}
              onChange={e => onSetQty(p.sku, e.target.value)}
              placeholder="0"
              style={{
                width:"100%", minWidth:0, padding:"10px 6px", borderRadius:9,
                fontSize:20, fontWeight:800, fontFamily:"inherit",
                textAlign:"center", outline:"none",
                border: hasVal
                  ? (matched ? "2px solid var(--g-500)" : "2px solid var(--dang)")
                  : "1.5px solid var(--bdr)",
                background: hasVal
                  ? (matched ? "#f0fdf4" : "#fff5f5")
                  : "#fff",
                color: hasVal ? (matched ? "var(--g-700)" : "var(--dang)") : "var(--text)",
              }}/>
            {hasVal && (
              <div style={{position:"absolute",top:-8,right:4,fontSize:10,
                fontWeight:700,
                color: matched ? "var(--g-700)" : "var(--dang)"}}>
                {!matched && diff !== null ? (diff > 0 ? `+${diff}` : diff) : "✓"}
              </div>
            )}
          </div>
          <button onClick={() => adjustQty(1)}
            style={{minWidth:44,height:48,borderRadius:8,
                    border:"1.5px solid var(--bdr)",background:"#f0fdf4",
                    cursor:"pointer",fontSize:20,fontWeight:800,
                    fontFamily:"inherit",color:"var(--g-700)"}}>+</button>
        </div>
        {onOpenCalc && (
          <button onClick={() => onOpenCalc(p.sku, p.name || p.sku)}
            style={{width:"100%",marginTop:4,height:40,borderRadius:9,
                    border:"1.5px solid var(--bdr)",background:"#f8fafc",
                    cursor:"pointer",fontSize:13,fontWeight:700,
                    fontFamily:"inherit",color:"var(--muted)",
                    display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <span style={{fontSize:16}}>🧮</span>
            <span>เครื่องคิดเลข</span>
          </button>
        )}
        {onOrder && (
          <button onClick={onOrder}
            style={{fontSize:12,padding:"4px 8px",borderRadius:6,background:"#eff6ff",
                    color:"#2563eb",border:"1px solid #bfdbfe",cursor:"pointer",marginTop:4,
                    width:"100%",fontFamily:"inherit",fontWeight:600}}>
            📦 สั่ง
          </button>
        )}
      </div>
    </div>
  );
});

