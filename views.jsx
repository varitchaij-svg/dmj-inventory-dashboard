// views.jsx v20260521-fix4
// Tab views — Overview, Categories, Stock, Upload, Connect
const { useState: uS, useEffect: uE, useMemo: uM, useCallback: uC } = React;

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

  const topSellers = uM(() =>
    [...products].filter(p => p.soldRev > 0 && !p.isMTO)
      .sort((a,b) => b.soldRev - a.soldRev).slice(0, 10),
    [products]
  );

  // Top sellers per category — for the gallery section
  const topByCategory = uM(() => {
    const byCat = {};
    products.filter(p => p.soldRev > 0 && !p.isMTO && p.cat && p.cat !== "ไม่มีรหัสสินค้า")
      .forEach(p => {
        if (!byCat[p.cat]) byCat[p.cat] = [];
        byCat[p.cat].push(p);
      });
    return Object.entries(byCat)
      .map(([cat, ps]) => ({
        cat,
        products: ps.sort((a,b) => b.soldRev - a.soldRev).slice(0, 10),
        totalRev: ps.reduce((s,p) => s+p.soldRev, 0),
      }))
      .sort((a,b) => b.totalRev - a.totalRev);
  }, [products]);

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

      <Card title="Top 10 สินค้าขายดี (ทั้งปี · ไม่รวม MTO)"
            sub={months.length > 0 ? `เรียงตามรายได้ · ${monthLabel(months[0]).split(" ")[0]}–${monthLabel(months[months.length-1])}` : "เรียงตามรายได้"}
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
                  <td className="num" style={{fontWeight:600}}>{fmtN(p.soldQty)}</td>
                  {role === "owner" && <td className="num" style={{fontWeight:700,color:"var(--g-700)"}}>{fmtB(p.soldRev)}</td>}
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
      <Card title="🏆 Top 10 ขายดี · แยกตามหมวด"
            sub="กดที่สินค้าเพื่อดูรูปและรายละเอียด"
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
                          {fmtN(p.soldQty)} ชิ้น · คงเหลือ {fmtN(stockQty(p))}
                        </div>
                      </div>
                      {role === "owner" && <div style={{fontSize:11.5, fontWeight:700, color:"var(--g-700)", flexShrink:0}}>
                        {fmtB(p.soldRev)}
                      </div>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

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
  "Realtouch":                 "✨",
  "ดอกไม้":                   "🌸",
  "บูช":                      "🌿",
  "ไม้แซม":                   "🌾",
  "ดอกหญ้า":                  "🌱",
  "ใบ":                       "🍃",
  "ใบบูช":                    "🍂",
  "ใบไม้แขวน":                "🎋",
  "กิ่งไม้":                  "🌵",
  "กุหลาบหิน":                "🪨",
  "ต้นไม้":                   "🌳",
  "แจกันแก้ว":                "🏺",
  "เรซิ่น":                   "💎",
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
  const [active, setActive] = uS(allCats[0] || "");
  const [search, setSearch] = uS("");
  const [globalSearch, setGlobalSearch] = uS("");
  const [sortBy, setSortBy] = uS("sku");
  const [showAll, setShowAll] = uS(false);
  const [colorFilter, setColorFilter] = uS(null);
  const [supplierFilter, setSupplierFilter] = uS(null);
  const [newStockFilter, setNewStockFilter] = uS(false);
  const [orderProduct, setOrderProduct] = uS(null);
  const [globalVendor, setGlobalVendor] = uS(null); // global supplier filter (all categories)
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

  const filtered = uM(() => {
    // ── Global vendor mode ──────────────────────────────────────────
    if (globalVendor) {
      let f = products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า" && p.vendor === globalVendor);
      const gq = globalSearch.trim().toLowerCase();
      if (gq) f = f.filter(p => (p.sku||"").toLowerCase().includes(gq) || (p.name||"").toLowerCase().includes(gq));
      return [...f].sort(sortFn);
    }
    const gq = globalSearch.trim().toLowerCase();
    if (gq) {
      // Global: search all categories
      let f = products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า");
      f = f.filter(p => (p.sku||"").toLowerCase().includes(gq) || (p.name||"").toLowerCase().includes(gq));
      if (newStockFilter) f = f.filter(p => isNew45(p.lastStockInDate));
      return [...f].sort(sortFn);
    }
    // Normal: filter by active category
    let f = products.filter(p => p.cat === active);
    if (search) {
      const q = search.toLowerCase();
      f = f.filter(p => (p.sku||"").toLowerCase().includes(q) || (p.name||"").toLowerCase().includes(q));
    }
    if (colorFilter) f = f.filter(p => p.color && p.color.name === colorFilter);
    if (supplierFilter) f = f.filter(p => (p.lastSupplier || p.vendor) === supplierFilter);
    if (newStockFilter) f = f.filter(p => isNew45(p.lastStockInDate));
    return [...f].sort(sortFn);
  }, [products, active, search, globalSearch, globalVendor, colorFilter, supplierFilter, newStockFilter, sortFn]);

  const visible = showAll ? filtered : filtered.slice(0, 24);

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
    const f = products.filter(p => p.cat === active);
    return {
      n: f.length,
      stock: f.reduce((s,p)=>s+stockQty(p),0),
      sold: f.reduce((s,p)=>s+p.soldQty,0),
      rev: f.reduce((s,p)=>s+p.soldRev,0),
      stockValue: f.reduce((s,p)=>s+(stockQty(p)*p.price),0),
    };
  }, [products, active]);

  // Supplier list for this category
  const supplierChips = uM(() => {
    const m = {};
    products.filter(p => p.cat === active).forEach(p => {
      const s = p.lastSupplier || p.vendor;
      if (s) m[s] = (m[s] || 0) + 1;
    });
    return Object.entries(m).map(([name, count]) => ({ name, count }))
      .sort((a,b) => b.count - a.count);
  }, [products, active]);

  // Colors in this category for filter chips
  const colorChips = uM(() => {
    const m = {};
    products.filter(p => p.cat === active).forEach(p => {
      if (p.color) m[p.color.name] = (m[p.color.name]||{count:0, hex:p.color.hex}, {count:(m[p.color.name]?.count||0)+1, hex:p.color.hex});
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
          <div className="page-sub">ดูสินค้าทุกตัวในแต่ละหมวด · เรียงตามขายดี / ราคา / Supplier / สี</div>
        </div>
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
            onChange={e => setGlobalSearch(e.target.value)}
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
        <ScanButton size={44} onScan={sku => setGlobalSearch(sku)}
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
                setGlobalVendor(match ? match.code : (val === "" ? null : val || null));
                setShowAll(false);
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
              <button onClick={() => { setGlobalVendor(null); setShowAll(false); }}
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
            onChange={e => { setActive(e.target.value); setColorFilter(null); setSupplierFilter(null); setNewStockFilter(false); setShowAll(false); }}
            style={{
              width:"100%", padding:"10px 14px", borderRadius:12,
              border:"1.5px solid var(--bdr)", background:"#fafcf7",
              fontSize:14, fontWeight:600, fontFamily:"inherit",
              cursor:"pointer", boxSizing:"border-box",
              color:"var(--text)", outline:"none",
            }}>
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
                <button key={c} onClick={() => { setActive(c); setColorFilter(null); setSupplierFilter(null); setNewStockFilter(false); setShowAll(false); }}
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
              {/* Search */}
              <div style={{display:"flex",gap:8,flex:"1 1 220px",minWidth:0,alignItems:"center"}}>
                <div style={{position:"relative",flex:1}}>
                  <input value={search} onChange={e=>setSearch(e.target.value)}
                         placeholder="ค้นหา SKU หรือชื่อสินค้า..."
                         style={{
                           width:"100%", padding:"8px 12px 8px 34px", borderRadius:9,
                           border:"1px solid var(--bdr)", fontSize:13,
                           fontFamily:"inherit", background:"#fafcf7", boxSizing:"border-box",
                         }}/>
                  <span style={{position:"absolute",left:10,top:9,color:"var(--light)"}}>
                    <Icon d={["M11 19 A8 8 0 1 0 11 3 a8 8 0 0 0 0 16 Z","M21 21 L16.65 16.65"]} size={15}/>
                  </span>
                </div>
                <ScanButton onScan={sku => setSearch(sku)}/>
              </div>

              {/* Sort */}
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

            {/* Supplier filter chips */}
            {supplierChips.length > 0 && (
              <div className="filter-bar" style={{marginTop:10,paddingTop:10,borderTop:"1px dashed var(--bdr)"}}>
                <span className="filter-bar-label">🏪 ร้าน</span>
                <div className="filter-chips">
                  <button className={`fchip${supplierFilter===null?' active':''}`}
                          onClick={()=>setSupplierFilter(null)}>ทั้งหมด</button>
                  {supplierChips.map(s => (
                    <button key={s.name} className={`fchip${supplierFilter===s.name?' active':''}`}
                            onClick={()=>setSupplierFilter(s.name===supplierFilter?null:s.name)}>
                      {s.name} <span style={{opacity:.6}}>{s.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* New stock filter */}
            {(() => {
              const newCount = products.filter(p => p.cat === active && isNew45(p.lastStockInDate)).length;
              if (newCount === 0) return null;
              return (
                <div className="filter-bar" style={{marginTop:10,paddingTop:10,borderTop:"1px dashed var(--bdr)"}}>
                  <span className="filter-bar-label">✨ ใหม่</span>
                  <div className="filter-chips">
                    <button className={`fchip${!newStockFilter?' active':''}`}
                            onClick={() => setNewStockFilter(false)}>ทั้งหมด</button>
                    <button className={`fchip${newStockFilter?' active':''}`}
                            onClick={() => setNewStockFilter(v => !v)}
                            style={newStockFilter ? {
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
          </Card>

          {/* Header */}
          {!isGlobalSearch && !isGlobalVendor && (
            <div className="sec-head" style={{margin:"4px 0 14px"}}>
              <div>
                <div className="sec-title" style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:20,lineHeight:1}}>{CAT_EMOJI[active] || "📁"}</span>
                  <span style={{width:10,height:10,borderRadius:"50%",background:color,flexShrink:0}}/>
                  {isMtoCat ? "งานจัดพิเศษ (MTO)" : active}
                  <span style={{fontSize:12, fontWeight:500, color:"var(--muted)"}}>
                    · {filtered.length} รายการ
                  </span>
                </div>
                <div className="sec-sub">
                  {showAll ? "แสดงทั้งหมด" : `แสดง ${Math.min(24, filtered.length)} จาก ${filtered.length}`} ·
                  เรียงตาม {SORT_OPTIONS.find(o=>o.value===sortBy)?.label}
                </div>
              </div>
              {filtered.length > 24 && (
                <button className="btn" onClick={()=>setShowAll(!showAll)}>
                  {showAll ? "ย่อกลับ" : `ดูทั้งหมด (${filtered.length})`}
                  {showAll ? I.arrowL : I.arrowR}
                </button>
              )}
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
              {filtered.length > 24 && (
                <button className="btn" onClick={()=>setShowAll(!showAll)}>
                  {showAll ? "ย่อกลับ" : `ดูทั้งหมด (${filtered.length})`}
                  {showAll ? I.arrowL : I.arrowR}
                </button>
              )}
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
          </div>

          {filtered.length === 0 ? (
            <Empty title="ไม่พบสินค้า" sub={isGlobalSearch || search ? "ลองค้นหาด้วยคำอื่น" : "หมวดนี้ยังไม่มีสินค้า"}/>
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
                    {setOrderProduct && (
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
    const url = `${sheetUrl}?action=order&sku=${encodeURIComponent(product.sku)}&qty=${qty}&orderType=${encodeURIComponent(orderType)}`;
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
const STOCK_PAGE = 50;

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
    if (supplierFilter) result = result.filter(p => (p.lastSupplier || p.vendor) === supplierFilter);
    if (!stockSearch) return result;
    const q = stockSearch.toLowerCase();
    return result.filter(p =>
      (p.sku || "").toLowerCase().includes(q) ||
      (p.name || "").toLowerCase().includes(q) ||
      (p.cat || "").toLowerCase().includes(q)
    );
  }, [rawList, stockSearch, supplierFilter]);

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
        <KPI label="⚠️ ใกล้หมด — สั่งด่วน" accent="#c2570a" icon={I.warning}
             value={fmtN(nearOut.length)} sub={`≤ ${defaultThr} ชิ้น (ปรับได้)`}/>
        <KPI label="🚫 หมดสต๊อกแล้ว" accent="#b8341c" icon={I.alert}
             value={fmtN(outOfStock.length)} sub="แต่ยังมียอดขาย"/>
        <KPI label="📉 ยอดขายตก" accent="#8a3a8a" icon={I.alert}
             value={fmtN(declining.length)} sub="ขายลดลง > 60%"/>
        <KPI label="🐌 สินค้าจมนาน" accent="#a07417" icon={I.package}
             value={fmtN(slowMovers.length)} sub="ขาย < 10% ของสต๊อก"/>
        <KPI label="📈 สต๊อกเกินจำเป็น" accent="#1f6f8b" icon={I.layers}
             value={fmtN(overstocked.length)} sub="พอขาย > 12 เดือน"/>
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
                    style={filter===t.id?{background:t.color+"18",borderColor:t.color,color:t.color}:{}}
                    onClick={() => { setFilter(t.id); setPage(0); setStockSearch(""); setSupplierFilter(null); }}>
              {t.label} <span style={{opacity:.7}}>({t.count})</span>
            </button>
          ))}
        </div>
      </div>

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

      <Card padding={false}>
        <div style={{overflowX:"auto", WebkitOverflowScrolling:"touch", maxWidth:"100%"}}>
          <table className="t t-stock">
            <thead><tr>
              <th style={{paddingLeft:20, width:56}}>รูป</th>
              <th>สินค้า</th>
              <th style={{width:140}}>หมวด</th>
              <th style={{width:120}}>ร้านที่ซื้อ</th>
              <th className="num" style={{width:120}}>คงเหลือ</th>
              <th className="num" style={{width:90}}>เกณฑ์</th>
              <th className="num" style={{width:90}}>ขาย/เดือน</th>
              {role === 'owner' && <th className="num" style={{width:110}}>รายได้รวม</th>}
              <th className="num" style={{width:140}}>สถานะ</th>
            </tr></thead>
            <tbody>
              {paginated.map((p, i) => {
                const ratio = p.qty / (p.threshold || 1);
                const lvlColor = p.qty === 0 ? "var(--dang)" :
                                 ratio <= 0.33 ? "var(--dang)" :
                                 ratio <= 0.66 ? "var(--warn)" : "var(--gold)";
                return (
                  <tr key={p.sku} style={{cursor:"pointer"}} onClick={() => setModalP(p)}>
                    <td style={{paddingLeft:20}}>
                      {p.imageUrl ? (
                        <div style={{width:40,height:40,borderRadius:6,
                                     backgroundImage:`url("${p.imageUrl}")`,
                                     backgroundSize:"contain",backgroundPosition:"center",
                                     backgroundRepeat:"no-repeat",backgroundColor:"#fff",
                                     border:"1px solid var(--bdr)"}}/>
                      ) : (
                        <div style={{width:40,height:40,borderRadius:6,
                                     background: p.color ? p.color.hex+"33" : "var(--g-50)",
                                     border: p.color ? `2px solid ${p.color.hex}` : "1px solid var(--bdr)",
                                     display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {!p.color && React.cloneElement(I.leaf, {size:16, stroke:1.5})}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span className="skucode">{p.sku}</span>
                        <span style={{fontWeight:500}}>{p.name}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11.5,color:"var(--muted)"}}>
                        <span style={{width:7,height:7,borderRadius:"50%",background:catColor(p.cat, allCats)}}/>
                        {p.cat}
                      </span>
                    </td>
                    <td style={{fontSize:12, color:"var(--muted)"}}>
                      {(p.lastSupplier || p.vendor) || <span style={{color:"var(--light)"}}>—</span>}
                      {p.lastStockInDate && <div style={{fontSize:10,color:"var(--g-700)",marginTop:1}}>เข้า {p.lastStockInDate}</div>}
                    </td>
                    <td className="num">
                      <div style={{fontWeight:700, color:lvlColor, fontSize:14, lineHeight:1.2}}>{fmtN(p.qty)}</div>
                      {(p.qtyStore > 0 || p.qtyWH > 0) && (
                        <div style={{fontSize:10, color:"var(--muted)", marginTop:2}}>
                          ร้าน {fmtN(p.qtyStore||0)} · คลัง {fmtN(p.qtyWH||0)}
                        </div>
                      )}
                    </td>
                    <td className="num" style={{fontSize:12,color:"var(--muted)"}}>≤ {p.threshold}</td>
                    <td className="num">{p.avgMonthly>0?fmtN(p.avgMonthly):"—"}</td>
                    {role === 'owner' && <td className="num" style={{fontWeight:600, color:"var(--g-700)"}}>{fmtB(p.soldRev)}</td>}
                    <td className="num">
                      {filter==='out'  && <span className="chip dang">หมด!</span>}
                      {filter==='low'  && (
                        p.qty < 12
                          ? <span className="chip dang">🚨 ต้องส่งด่วน ({p.qty})</span>
                          : p.qty < 24
                            ? <span className="chip warn">⚠️ ใกล้ต้องส่ง ({p.qty})</span>
                            : <span className="chip warn">เหลือ {p.qty}/{p.threshold}</span>
                      )}
                      {filter==='drop' && <span className="chip" style={{background:"#f5e7f5",color:"#8a3a8a",borderColor:"#e6cde6"}}>ลด {p.dropPct.toFixed(0)}%</span>}
                      {filter==='slow' && <span className="chip info">{p.soldQty===0?"ไม่เคยขาย":`${(p.soldQty/p.qty*100).toFixed(1)}%`}</span>}
                      {filter==='over' && <span className="chip info">{p.monthsLeft > 99 ? ">99" : p.monthsLeft.toFixed(1)} เดือน</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <Empty icon={I.check} title="ยอดเยี่ยม!" sub="ไม่มีรายการในกลุ่มนี้"/>}
      </Card>

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
          กดปิดเมื่อเสร็จ · สแกนได้ต่อเนื่อง · รองรับ iPhone/Android/PC
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
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
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

  const select = (s) => { setText(s); onChange(s); setOpen(false); };
  const clear = () => { setText(""); onChange(""); setOpen(false); };

  return (
    <div ref={wrapRef} style={{position:"relative", minWidth:150, flex:"0 0 auto"}}>
      <div style={{display:"flex",alignItems:"center",
                   border:`1.5px solid ${value ? "var(--g-500)" : "var(--bdr)"}`,
                   borderRadius:10, background:"#fff", overflow:"hidden"}}>
        <input type="text" placeholder="🏪 ซัพพลายเออร์..."
          value={text}
          onChange={e => { setText(e.target.value); setOpen(true); onChange(""); }}
          onFocus={() => setOpen(true)}
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
const FSCard = React.memo(function FSCard({ p, val, isSaved, isTouched, onSetQty, onImageClick, onOpenCalc }) {
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
        {/* ±qty buttons + input row */}
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <button onClick={() => adjustQty(-5)}
            style={{minWidth:44,height:48,borderRadius:8,
                    border:"1.5px solid var(--bdr)",background:"#fff",
                    cursor:"pointer",fontSize:13,fontWeight:700,
                    fontFamily:"inherit",color:"var(--dang)",
                    opacity: numVal >= 5 ? 1 : 0.3}}>−5</button>
          <button onClick={() => adjustQty(-1)}
            style={{minWidth:44,height:48,borderRadius:8,
                    border:"1.5px solid var(--bdr)",background:"#fff",
                    cursor:"pointer",fontSize:15,fontWeight:800,
                    fontFamily:"inherit",color:"var(--dang)",
                    opacity: numVal >= 1 ? 1 : 0.3}}>−</button>
          <div style={{flex:1,position:"relative"}}>
            <input type="number" min="0" inputMode="numeric"
              value={val ?? ""}
              onChange={e => onSetQty(p.sku, e.target.value)}
              placeholder="0"
              style={{
                width:"100%", padding:"10px 6px", borderRadius:9,
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
                    cursor:"pointer",fontSize:15,fontWeight:800,
                    fontFamily:"inherit",color:"var(--g-700)"}}>+</button>
          <button onClick={() => adjustQty(5)}
            style={{minWidth:44,height:48,borderRadius:8,
                    border:"1.5px solid var(--bdr)",background:"#f0fdf4",
                    cursor:"pointer",fontSize:13,fontWeight:700,
                    fontFamily:"inherit",color:"var(--g-700)"}}>+5</button>
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
      </div>
    </div>
  );
});

// ─── FrontStoreView ───
function FrontStoreView({ data, role }) {
  const products = data.products || [];
  const [toast, showToast, hideToast] = useToast();
  const CAT_ORDER = ["Realtouch","ดอกไม้","บูช","ไม้แซม","ดอกหญ้า","ใบ","ใบบูช","ใบไม้แขวน","กิ่งไม้","กุหลาบหิน","ต้นไม้","แจกันแก้ว","เรซิ่น"];

  const allCats = uM(() => {
    const s = new Set();
    products.forEach(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า" && s.add(p.cat));
    return [...s].sort((a, b) => {
      const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1; if (ib >= 0) return 1;
      return a.localeCompare(b, "th");
    });
  }, [products]);

  const allSuppliers = uM(() => {
    const s = new Set();
    products.forEach(p => { if (p.lastSupplier) s.add(p.lastSupplier); if (p.vendor) s.add(p.vendor); });
    return [...s].sort();
  }, [products]);

  const [activeCat, setActiveCat] = uS("ALL");
  const [supplierFilter, setSupplierFilter] = uS("");
  const [search, setSearch] = uS("");
  const [saving, setSaving] = uS(false);
  const [lightbox, setLightbox] = uS(null);
  const [savedSkus, setSavedSkus] = uS(new Set());
  const [scrollToSku, setScrollToSku] = uS(null);
  const [showMode, setShowMode] = uS("all");
  const [mounted, setMounted] = uS(false);
  uE(() => { const t = setTimeout(() => setMounted(true), 350); return () => clearTimeout(t); }, []);

  const [checkedQtys, setCheckedQtys] = uS(() => {
    const init = {};
    products.forEach(p => {
      if (p.frontStoreCheckedQty != null && p.frontStoreCheckedQty !== "")
        init[p.sku] = p.frontStoreCheckedQty;
    });
    return init;
  });
  const [touched, setTouched] = uS(new Set());
  const [lastSavedTime, setLastSavedTime] = uS(null); // timestamp of last successful save
  const [fsCalcPad, setFsCalcPad] = uS(null); // {sku, name, val} for CalcPadModal

  const setQty = uC((sku, val) => {
    setCheckedQtys(prev => ({ ...prev, [sku]: val === "" ? "" : parseInt(val) || 0 }));
    setTouched(prev => new Set([...prev, sku]));
  }, []);

  const baseFiltered = uM(() => {
    let f = products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า");
    if (activeCat !== "ALL") f = f.filter(p => p.cat === activeCat);
    if (supplierFilter) f = f.filter(p => (p.lastSupplier || p.vendor) === supplierFilter);
    if (search) {
      const q = search.trim().toLowerCase();
      f = f.filter(p => (p.sku||"").toLowerCase().includes(q) || (p.name||"").toLowerCase().includes(q));
    }
    return [...f].sort(compareSku);
  }, [products, activeCat, supplierFilter, search]);

  const filtered = uM(() => {
    if (showMode === "all") return baseFiltered;
    if (showMode === "unchecked")
      return baseFiltered.filter(p => checkedQtys[p.sku] == null || checkedQtys[p.sku] === "");
    if (showMode === "mismatch")
      return baseFiltered.filter(p => {
        const v = checkedQtys[p.sku];
        if (v == null || v === "") return false;
        return parseInt(v) !== (p.qtyStore ?? 0);
      });
    return baseFiltered;
  }, [baseFiltered, showMode, checkedQtys]);

  const counts = uM(() => {
    let unchecked = 0, mismatch = 0;
    const perCat = {};
    products.forEach(p => {
      if (!p.cat || p.cat === "ไม่มีรหัสสินค้า") return;
      const v = checkedQtys[p.sku];
      const noVal = v == null || v === "";
      if (noVal) {
        unchecked++;
        perCat[p.cat] = (perCat[p.cat] || 0) + 1;
      } else if (parseInt(v) !== (p.qtyStore ?? 0)) {
        mismatch++;
      }
    });
    return { unchecked, mismatch, perCat };
  }, [products, checkedQtys]);

  const uncheckedCount = counts.unchecked;
  const mismatchCount  = counts.mismatch;

  const touchedWithValue = uM(() =>
    [...touched].filter(sku => checkedQtys[sku] !== "" && checkedQtys[sku] != null).length
  , [touched, checkedQtys]);

  const handleScanDetected = (sku) => {
    if (!sku) return;
    const clean = sku.trim().toUpperCase();
    const p = products.find(x => x.sku === clean);
    if (!p) {
      showToast("error", `ไม่พบ ${clean}`, "🔍");
      return;
    }
    setActiveCat("ALL");
    setSearch(clean);
    setScrollToSku(clean);
  };

  uE(() => {
    if (!scrollToSku) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`fs-row-${scrollToSku}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.background = "#fff9c4";
        setTimeout(() => { if (el) el.style.background = ""; }, 2000);
      }
      setScrollToSku(null);
    }, 200);
    return () => clearTimeout(t);
  }, [scrollToSku]);

  const handleSave = async () => {
    const entries = [...touched]
      .filter(sku => checkedQtys[sku] !== "" && checkedQtys[sku] != null)
      .map(sku => ({ sku, qty: parseInt(checkedQtys[sku]) || 0 }));
    if (entries.length === 0) {
      showToast("warn", "ยังไม่ได้กรอกจำนวน", "✏️");
      return;
    }
    setSaving(true);
    const result = await syncFrontStoreData(entries);
    setSaving(false);
    if (result.success !== false) {
      setSavedSkus(prev => new Set([...prev, ...entries.map(e => e.sku)]));
      setTouched(new Set());
      setLastSavedTime(new Date());
      showToast("success", `บันทึก ${entries.length} รายการ`, "💾");
    } else {
      showToast("error", "บันทึกไม่สำเร็จ", "❌");
    }
  };

  const PAGE_SIZE = 20;
  const [page, setPage] = uS(0);
  uE(() => { setPage(0); }, [activeCat, supplierFilter, search, showMode]);

  const totalInCat = activeCat === "ALL"
    ? products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า").length
    : products.filter(p => p.cat === activeCat).length;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
    {/* ── CalcPadModal for FrontStoreView ── */}
    <CalcPadModal
      open={!!fsCalcPad}
      name={fsCalcPad ? (fsCalcPad.name || fsCalcPad.sku) : ''}
      initialVal={fsCalcPad ? fsCalcPad.val : ''}
      onConfirm={function(qty){
        if (fsCalcPad) {
          setCheckedQtys(prev => ({ ...prev, [fsCalcPad.sku]: qty === '' ? '' : parseInt(qty)||0 }));
          setTouched(prev => new Set([...prev, fsCalcPad.sku]));
        }
        setFsCalcPad(null);
      }}
      onClose={function(){ setFsCalcPad(null); }}
    />
    <div style={{display:"flex", flexDirection:"column", gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{flex:1, minWidth:160}}>
          <div style={{fontSize:15, fontWeight:700}}>🛒 เช็คจำนวนหน้าร้าน</div>
          <div style={{fontSize:11, color:"var(--muted)", marginTop:2}}>
            {uncheckedCount > 0
              ? <span>รอเช็ค <b style={{color:"var(--warn)"}}>{uncheckedCount}</b> รายการ</span>
              : <span style={{color:"var(--g-600)"}}>✓ เช็คครบแล้ว</span>}
            {mismatchCount > 0 && <span style={{marginLeft:8, color:"var(--dang)"}}>· ไม่ตรง {mismatchCount} รายการ</span>}
          </div>
        </div>
        <ScanButton size={40} continuous onScan={handleScanDetected}
          style={{border:"1.5px solid var(--g-300)", borderRadius:10, flexShrink:0}}/>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2,flexShrink:0}}>
          <button onClick={handleSave}
            disabled={saving || touchedWithValue === 0}
            className="btn primary"
            style={{padding:"9px 18px", fontWeight:700,
                    opacity: (saving || touchedWithValue === 0) ? 0.45 : 1}}>
            {saving
              ? <><span className="spin" style={{width:13,height:13,borderWidth:2,marginRight:6}}/> บันทึก...</>
              : touchedWithValue > 0 ? `💾 บันทึก (${touchedWithValue})` : "💾 บันทึก"}
          </button>
          {lastSavedTime && (
            <div style={{fontSize:10,color:"var(--g-600)",fontWeight:600}}>
              ✓ บันทึกแล้ว {lastSavedTime.getHours().toString().padStart(2,"0")}:{lastSavedTime.getMinutes().toString().padStart(2,"0")}
            </div>
          )}
        </div>
      </div>

      <Card padding={true} style={{paddingTop:12,paddingBottom:12}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <input type="text" placeholder="🔍 ค้นหา SKU หรือชื่อสินค้า..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{flex:1, minWidth:160, padding:"8px 12px", borderRadius:10,
                    border:"1.5px solid var(--bdr)", fontSize:13, fontFamily:"inherit"}}/>
          <SupplierSearch value={supplierFilter} onChange={setSupplierFilter} allSuppliers={allSuppliers}/>
        </div>
        <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
          <Seg value={showMode} onChange={setShowMode} options={[
            {value:"all",       label:"🗂️ ทั้งหมด"},
            {value:"unchecked", label:`⬜ รอเช็ค${uncheckedCount>0?` (${uncheckedCount})`:""}`},
            {value:"mismatch",  label:`❌ ไม่ตรง${mismatchCount>0?` (${mismatchCount})`:""}`},
          ]}/>
          {supplierFilter && (
            <button onClick={() => setSupplierFilter("")}
              style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid var(--bdr)",
                      background:"#fff",cursor:"pointer",color:"var(--muted)",fontFamily:"inherit",
                      display:"flex",alignItems:"center",gap:4}}>
              ✕ {supplierFilter}
            </button>
          )}
        </div>
        <div style={{display:"flex",gap:6,marginTop:10,overflowX:"auto",paddingBottom:4,
                     WebkitOverflowScrolling:"touch"}}>
          <button onClick={() => setActiveCat("ALL")}
            className={`fchip ${activeCat==="ALL"?"active":""}`}
            style={{flexShrink:0}}>
            🗂️ ทั้งหมด ({products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า").length})
          </button>
          {allCats.map(c => {
            const cnt = products.filter(p => p.cat === c).length;
            const uncheckedInCat = counts.perCat[c] || 0;
            const emoji = CAT_EMOJI[c] || "";
            return (
              <button key={c} onClick={() => setActiveCat(c)}
                className={`fchip ${activeCat===c?"active":""}`}
                style={{flexShrink:0, position:"relative"}}>
                {emoji && <span style={{marginRight:4}}>{emoji}</span>}{c} ({cnt})
                {uncheckedInCat > 0 && activeCat !== c && (
                  <span style={{marginLeft:4, fontSize:9, background:"var(--warn)",
                    color:"#fff", borderRadius:8, padding:"0 4px", fontWeight:700}}>
                    {uncheckedInCat}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {!mounted ? (
        <div className="front-grid">
          {Array.from({length:6}).map((_,i) => <SkeletonCard key={i}/>)}
        </div>
      ) : filtered.length === 0 ? (
        <Card padding={true}>
          <Empty title="ไม่พบสินค้า" sub="ลองเปลี่ยน filter หรือค้นหาใหม่"/>
        </Card>
      ) : (
        <div className="front-grid">
          {paginated.map(p => (
            <FSCard key={p.sku} p={p}
              val={checkedQtys[p.sku]}
              isSaved={savedSkus.has(p.sku)}
              isTouched={touched.has(p.sku)}
              onSetQty={setQty}
              onImageClick={setLightbox}
              onOpenCalc={(sku, name) => {
                const cur = checkedQtys[sku];
                setFsCalcPad({ sku, name, val: (cur != null && cur !== '') ? String(cur) : '' });
              }}/>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",
                     gap:8,padding:"4px 0",flexWrap:"wrap"}}>
          <button onClick={() => setPage(0)} disabled={page===0}
            className="btn" style={{padding:"6px 10px",fontSize:12,minWidth:36,
                                    opacity:page===0?.35:1}}>«</button>
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0}
            className="btn" style={{padding:"6px 12px",fontSize:12,
                                    opacity:page===0?.35:1}}>‹ ก่อนหน้า</button>
          {Array.from({length:totalPages},(_,i)=>i)
            .filter(i => Math.abs(i-page) <= 2 || i===0 || i===totalPages-1)
            .reduce((acc,i,idx,arr) => {
              if (idx>0 && i-arr[idx-1]>1) acc.push("...");
              acc.push(i); return acc;
            },[])
            .map((item,idx) => item === "..." ? (
              <span key={`e${idx}`} style={{fontSize:12,color:"var(--muted)"}}>…</span>
            ) : (
              <button key={item} onClick={() => setPage(item)}
                className={`btn${item===page?" primary":""}`}
                style={{padding:"6px 10px",fontSize:12,minWidth:34,fontWeight:item===page?700:400}}>
                {item+1}
              </button>
            ))
          }
          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page===totalPages-1}
            className="btn" style={{padding:"6px 12px",fontSize:12,
                                    opacity:page===totalPages-1?.35:1}}>ถัดไป ›</button>
          <button onClick={() => setPage(totalPages-1)} disabled={page===totalPages-1}
            className="btn" style={{padding:"6px 10px",fontSize:12,minWidth:36,
                                    opacity:page===totalPages-1?.35:1}}>»</button>
        </div>
      )}

      <div style={{padding:"4px 4px",fontSize:11,color:"var(--muted)",
                   display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
        <span>
          หน้า {page+1}/{totalPages || 1} ·
          แสดง {page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE, filtered.length)} จาก {fmtN(filtered.length)} รายการ
        </span>
        {touchedWithValue > 0 && (
          <span style={{color:"var(--warn)",fontWeight:600}}>
            · แก้ไขแล้ว {touchedWithValue} รายการ (ยังไม่บันทึก)
          </span>
        )}
      </div>
    </div>
    {lightbox && <ImageLightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)}/>}
    <Toast toast={toast} onClose={hideToast}/>
    </>
  );
}

// ─── sync lock data to "ตำแหน่งจัดเก็บ" sheet ───
async function syncLockData(lockKey, entries) {
  // entries = [{ sku, qty, isNew }]
  if (!SHEET_DEPLOY_URL) { console.warn("SHEET_DEPLOY_URL not set"); return { success: false }; }
  try {
    await fetch(SHEET_DEPLOY_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updateLockData: true,
        lockKey,
        datetime: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }),
        entries,
      }),
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

async function syncDeleteLockEntry(lockKey, sku) {
  if (!SHEET_DEPLOY_URL) { console.warn("SHEET_DEPLOY_URL not set"); return { success: false }; }
  try {
    await fetch(SHEET_DEPLOY_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteLockEntry: true, lockKey, sku }),
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

function LockModal({ lockKey, data, productMap, products, lockOv, onUpdateLock, onClose }) {
  const [lightbox, setLightbox] = uS(null);
  const [editMode, setEditMode] = uS(false);
  const [addSku, setAddSku] = uS("");
  const [saving, setSaving] = uS(false);
  const [savedSkus, setSavedSkus] = uS(new Set());
  const [toast, showToast, hideToast] = useToast();
  // confirm modal state for delete
  const [delConfirm, setDelConfirm] = uS(null); // { sku, isLocal }
  // เช็คจริง: { sku: qty } — กรอกได้ทุก SKU
  const [checkedQtys, setCheckedQtys] = uS(() => {
    const init = {};
    (data.entries || []).forEach(e => { init[e.sku] = e.qty ?? ""; });
    return init;
  });
  // ติดตาม SKU ที่เพิ่งเพิ่มใหม่ (isNew = true สำหรับ append row ใน sheet)
  const [newSkus, setNewSkus] = uS(new Set());
  // ติดตาม SKU ที่ลบออกแล้ว (ซ่อนจาก UI ทันทีหลัง API สำเร็จ)
  const [deletedSkus, setDeletedSkus] = uS(new Set());

  const ovSet = new Set(lockOv);

  const addToLock = (skuOverride) => {
    const sku = (skuOverride || addSku).trim().toUpperCase();
    if (!sku) return;
    if (data.skus.includes(sku) || ovSet.has(sku)) { setAddSku(""); return; }
    onUpdateLock([...ovSet, sku]);
    setNewSkus(prev => new Set([...prev, sku]));
    setAddSku("");
  };
  const handleScanDetected = (sku) => {
    if (!sku) return;
    const clean = sku.trim().toUpperCase();
    if (!data.skus.includes(clean) && !ovSet.has(clean)) {
      onUpdateLock([...ovSet, clean]);
      setNewSkus(prev => new Set([...prev, clean]));
    }
  };
  const removeFromLock = (sku) => {
    onUpdateLock(lockOv.filter(s => s !== sku));
  };

  const handleDelete = (sku, isLocal) => {
    setDelConfirm({ sku, isLocal });
  };
  const doDelete = async () => {
    const { sku, isLocal } = delConfirm || {};
    setDelConfirm(null);
    if (!sku) return;
    if (isLocal) {
      onUpdateLock(lockOv.filter(s => s !== sku));
      setNewSkus(prev => { const n = new Set(prev); n.delete(sku); return n; });
      setCheckedQtys(prev => { const n = {...prev}; delete n[sku]; return n; });
      showToast("success", `ลบ ${sku} แล้ว`, "🗑️");
    } else {
      const result = await syncDeleteLockEntry(lockKey, sku);
      if (result.success !== false) {
        setDeletedSkus(prev => new Set([...prev, sku]));
        setCheckedQtys(prev => { const n = {...prev}; delete n[sku]; return n; });
        setSavedSkus(prev => { const n = new Set(prev); n.delete(sku); return n; });
        if (ovSet.has(sku)) onUpdateLock(lockOv.filter(s => s !== sku));
        showToast("success", `ลบ ${sku} แล้ว`, "🗑️");
      } else {
        showToast("error", "ลบไม่สำเร็จ", "❌");
      }
    }
  };

  const handleSave = async () => {
    const entries = Object.entries(checkedQtys)
      .filter(([, v]) => v !== "" && v !== null && v !== undefined)
      .map(([sku, qty]) => ({ sku, qty: parseInt(qty) || 0, isNew: newSkus.has(sku) }));
    if (entries.length === 0) {
      showToast("warn", "ยังไม่ได้กรอกจำนวน", "✏️");
      return;
    }
    setSaving(true);
    const result = await syncLockData(lockKey, entries);
    setSaving(false);
    if (result.success !== false) {
      const done = new Set([...savedSkus, ...entries.map(e => e.sku)]);
      setSavedSkus(done);
      setNewSkus(new Set());
      showToast("success", `บันทึก ${entries.length} รายการ`, "💾");
    } else {
      showToast("error", "บันทึกไม่สำเร็จ", "❌");
    }
  };

  const allSkus = [...new Set([...data.skus, ...lockOv])].filter(s => !deletedSkus.has(s));
  const prods = allSkus.map(s => ({ sku: s, p: productMap[s], isLocal: ovSet.has(s) && !data.skus.includes(s) }));
  return (
    <>
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:1000,
      background:"rgba(20,30,20,.55)", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"#fff", borderRadius:16, maxWidth:680, width:"100%",
        maxHeight:"90vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.25)"
      }}>
        <div style={{padding:20, borderBottom:"1px solid var(--bdr)",
                     display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12}}>
          <div>
            <div style={{fontSize:11, color:"var(--muted)", fontWeight:600, marginBottom:4}}>
              ตำแหน่งจัดเก็บ
            </div>
            <div style={{fontSize:20, fontWeight:700, lineHeight:1.3}}>📦 ล็อค {lockKey}</div>
            <div style={{fontSize:12, color:"var(--muted)", marginTop:4}}>
              {data.skus.length} SKU · {data.verified ? "เช็คแล้ว manual" : "ข้อมูลจากระบบ (ยังไม่ได้เช็ค)"}
              {data.mismatch && <span style={{color:"var(--dang)",marginLeft:8,fontWeight:600}}>⚠️ สต๊อกไม่ตรง</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={() => setEditMode(e => !e)} style={{
              border:"1.5px solid var(--g-300)",
              background: editMode ? "#f0fdf4" : "#fff",
              color:"var(--g-700)",
              borderRadius:8, padding:"5px 12px",
              cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
            }}>{editMode ? "✓ เสร็จ" : "✏️ เพิ่มสินค้า"}</button>
            <button onClick={onClose} style={{
              border:"1px solid var(--bdr)", background:"#fff", borderRadius:10,
              width:44, height:44, cursor:"pointer", fontSize:22, color:"var(--muted)", fontFamily:"inherit"
            }}>×</button>
          </div>
        </div>

        {/* Add SKU panel — shown in edit mode */}
        {editMode && (
          <div style={{padding:"12px 20px",background:"#f0fdf4",borderBottom:"1px solid var(--bdr)",
                       display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--g-700)",marginRight:4}}>+ เพิ่มสินค้า:</div>
            <input list="lock-sku-list" value={addSku}
              onChange={e => setAddSku(e.target.value)}
              onKeyDown={e => e.key==="Enter" && addToLock()}
              placeholder="พิมพ์ SKU หรือชื่อสินค้า..."
              style={{
                flex:1, minWidth:180, padding:"7px 12px", borderRadius:8,
                border:"1.5px solid var(--g-300)", fontSize:13, fontFamily:"inherit",
              }}/>
            <datalist id="lock-sku-list">
              {(products||[]).map(p => <option key={p.sku} value={p.sku}>{p.sku} — {p.name}</option>)}
            </datalist>
            <button onClick={() => addToLock()} style={{
              padding:"7px 16px", borderRadius:8, border:"none",
              background:"var(--g-700)", color:"#fff",
              cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"inherit",
            }}>เพิ่ม</button>
            <ScanButton size={38} continuous onScan={handleScanDetected}
              style={{border:"1.5px solid var(--g-300)"}}/>
          </div>
        )}

        <div style={{padding:20}}>
          <table className="t">
            <thead><tr>
              <th>สินค้า</th>
              <th className="num">คงเหลือ<br/><span style={{fontWeight:400,fontSize:10,color:"var(--muted)"}}>ในระบบ</span></th>
            </tr></thead>
            <tbody>
              {prods.map(({sku, p, isLocal}) => {
                const warehouseQty = p ? whQty(p) : null;
                const checkedVal = checkedQtys[sku];
                const isSaved = savedSkus.has(sku);
                const hasChecked = checkedVal !== "" && checkedVal !== undefined && checkedVal !== null;
                const checkedNum = hasChecked ? (parseInt(checkedVal) || 0) : null;
                const hasData = warehouseQty !== null && checkedNum !== null;
                const matched = hasData && warehouseQty === checkedNum;
                const diff    = hasData ? checkedNum - warehouseQty : null;

                return (
                  <tr key={sku} style={{background: isSaved ? "#f0fdf4" : undefined}}>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{position:"relative",flexShrink:0}}>
                          {p && p.imageUrl ? (
                            <div onClick={() => setLightbox({url:p.imageUrl, name:p.name})}
                                 style={{width:52,height:52,borderRadius:8,
                                         backgroundImage:`url("${p.imageUrl}")`,
                                         backgroundSize:"contain",backgroundPosition:"center",
                                         backgroundRepeat:"no-repeat",backgroundColor:"#fff",
                                         border:"1px solid var(--bdr)",
                                         cursor:"zoom-in", transition:"transform .15s, box-shadow .15s"}}
                                 onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.1)";e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.15)"}}
                                 onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow=""}}
                                 title="คลิกเพื่อขยายรูป"/>
                          ) : (
                            <div style={{width:52,height:52,borderRadius:8,background:"var(--g-50)",
                                         border:"1px solid var(--bdr)",
                                         display:"flex",alignItems:"center",justifyContent:"center",
                                         fontSize:18,color:"var(--g-300)"}}>📦</div>
                          )}
                          {p && p.imageUrl && p.color && (
                            <span style={{position:"absolute",bottom:2,right:2,width:9,height:9,
                                          borderRadius:"50%",background:p.color.hex,
                                          border:"1.5px solid #fff",boxShadow:"0 1px 3px rgba(0,0,0,.3)",
                                          pointerEvents:"none"}}/>
                          )}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <span className="skucode" style={{fontSize:10}}>{sku}</span>
                            {isLocal && <span style={{fontSize:9,background:"#e8f5e9",color:"var(--g-700)",
                              borderRadius:10,padding:"1px 6px",fontWeight:700}}>+ เพิ่มเอง</span>}
                            {isSaved && <span style={{fontSize:9,background:"#dcfce7",color:"#166534",
                              borderRadius:10,padding:"1px 6px",fontWeight:700}}>✓ บันทึกแล้ว</span>}
                          </div>
                          <div style={{fontWeight:500,marginTop:2,fontSize:13}}>
                            {p ? p.name : <span style={{color:"var(--muted)",fontStyle:"italic"}}>ไม่พบในระบบ</span>}
                          </div>
                        </div>
                        <button onClick={() => handleDelete(sku, isLocal)}
                          title="ลบออกจากล็อคนี้"
                          style={{marginLeft:8,background:"#fee2e2",border:"none",
                            borderRadius:6,cursor:"pointer",color:"#e53e3e",
                            fontWeight:700,fontSize:16,
                            minWidth:36,height:36,padding:"0 8px",fontFamily:"inherit",
                            flexShrink:0}}>×</button>
                      </div>
                    </td>

                    {/* คงเหลือ — read-only เสมอ */}
                    <td className="num" style={{fontWeight:600}}>
                      <span style={{color: warehouseQty != null && warehouseQty < 0 ? "var(--dang)" : undefined}}>
                        {warehouseQty != null ? fmtN(warehouseQty) : "—"}
                      </span>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    {lightbox && <ImageLightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)}/>}
    <ConfirmModal
      open={!!delConfirm}
      type="danger"
      emoji="🗑️"
      title="ยืนยันลบสินค้าออกจากล็อค"
      detail={delConfirm ? `${delConfirm.sku}\n📍 ${lockKey}` : ""}
      confirmLabel="ลบ"
      onConfirm={doDelete}
      onCancel={() => setDelConfirm(null)}
    />
    <Toast toast={toast} onClose={hideToast}/>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// STOCK COUNT VIEW — นับ stock คลัง ทีละล็อค (Owner + WH เท่านั้น)
// ─────────────────────────────────────────────────────────────────────
function StockCountView({ data }) {
  const storage    = data.storage  || {};
  const shelves    = storage.shelves || { A: 10, B: 10, locksPerShelf: 15 };
  const verifiedLockMap = storage.verifiedLockMap || {};
  const productLockMap  = storage.productLockMap  || {};
  const products   = data.products || [];

  const lockData = uM(() => {
    const merged = {};
    Object.keys(productLockMap).forEach(k => {
      merged[k] = { skus: productLockMap[k] || [] };
    });
    Object.keys(verifiedLockMap).forEach(k => {
      const vSkus = verifiedLockMap[k].map(v => v.sku);
      const base  = merged[k] ? merged[k].skus : [];
      merged[k]   = { skus: [...new Set([...base, ...vSkus])] };
    });
    return merged;
  }, [verifiedLockMap, productLockMap]);

  const productMap = uM(() => {
    const m = {};
    products.forEach(p => { m[p.sku] = p; });
    return m;
  }, [products]);

  const [step, setStep]                     = uS(1);
  const [selShelf, setSelShelf]             = uS(null);
  const [selLockKey, setSelLockKey]         = uS(null);
  const [checkedQtys, setCheckedQtys]       = uS({});
  const [savedSkus, setSavedSkus]           = uS(new Set());
  const [saving, setSaving]                 = uS(false);
  const [lastSavedTime, setLastSavedTime]   = uS(null);
  const [toast, showToast, hideToast]       = useToast();
  const [calcPad, setCalcPad]               = uS(null); // {sku, val, name}
  const [stockSearch, setStockSearch]       = uS('');
  // Supplier mode
  const [supplierMode, setSupplierMode]     = uS(false);
  const [selSupplier, setSelSupplier]       = uS(null);
  const [suppSearch, setSuppSearch]         = uS('');

  uE(() => { setCheckedQtys({}); setSavedSkus(new Set()); setLastSavedTime(null); setStockSearch(''); }, [selLockKey]);
  uE(() => { setCheckedQtys({}); setSavedSkus(new Set()); setLastSavedTime(null); setStockSearch(''); }, [selSupplier]);

  // Android back button: step 3 → 2 → 1
  uE(function(){
    if (step === 1 || !window.__dmjBackStack) return;
    var handler = function(){ setStep(function(s){ return s > 1 ? s - 1 : 1; }); };
    window.__dmjBackStack.push(handler);
    history.pushState({ _dmj: 1 }, '');
    return function(){
      var i = window.__dmjBackStack.lastIndexOf(handler);
      if (i >= 0) window.__dmjBackStack.splice(i, 1);
    };
  }, [step]);

  const openCalc = (sku, name) => {
    const cur = checkedQtys[sku];
    const init = (cur != null && cur !== '') ? String(cur) : '';
    setCalcPad({ sku, name, expr: init, result: null, justOp: false });
  };

  // Safe expression evaluator — supports + - * /
  const evalExpr = (expr) => {
    try {
      const clean = expr.replace(/[^0-9+\-*/.()]/g,'');
      if (!clean) return null;
      // eslint-disable-next-line no-new-func
      const v = Function('return (' + clean + ')')();
      if (!isFinite(v)) return null;
      return Math.max(0, Math.round(v * 100) / 100);
    } catch(e) { return null; }
  };

  const calcPress = (key) => {
    if (!calcPad) return;
    const { expr, result, justOp } = calcPad;

    if (key === 'CONFIRM') {
      // Confirm final value → set qty
      const finalExpr = result !== null ? String(result) : expr;
      const v = evalExpr(finalExpr);
      const qty = v !== null ? String(Math.max(0, Math.floor(v))) : '';
      setCheckedQtys(prev => { const o = Object.assign({},prev); o[calcPad.sku] = qty; return o; });
      setCalcPad(null);
      return;
    }
    if (key === 'CANCEL') { setCalcPad(null); return; }
    if (key === 'DEL') {
      if (result !== null) {
        setCalcPad(p => ({ ...p, expr: String(result), result: null, justOp: false }));
      } else {
        setCalcPad(p => ({ ...p, expr: p.expr.length > 1 ? p.expr.slice(0,-1) : '', justOp: false }));
      }
      return;
    }
    if (key === 'C') {
      setCalcPad(p => ({ ...p, expr: '', result: null, justOp: false }));
      return;
    }
    if (key === '=') {
      const toEval = result !== null ? String(result) : expr;
      const v = evalExpr(toEval);
      setCalcPad(p => ({ ...p, result: v !== null ? v : p.result, expr: toEval, justOp: false }));
      return;
    }

    const isOp = ['+','-','*','/'].includes(key);
    if (isOp) {
      // If just evaluated, continue from result
      const base = result !== null ? String(result) : expr;
      // Replace trailing operator if already has one
      const trimmed = base.replace(/[+\-*\/]$/, '');
      setCalcPad(p => ({ ...p, expr: trimmed + key, result: null, justOp: true }));
      return;
    }

    // Digit or dot
    if (result !== null && !justOp) {
      // Start fresh after result (unless continuing with operator)
      setCalcPad(p => ({ ...p, expr: key, result: null, justOp: false }));
    } else {
      setCalcPad(p => ({
        ...p,
        expr: p.expr.length >= 16 ? p.expr : p.expr + key,
        result: null,
        justOp: false,
      }));
    }
  };

  // What to show on display
  const calcDisplay = calcPad
    ? (calcPad.result !== null ? String(calcPad.result) : (calcPad.expr || '0'))
    : '0';
  const calcEvalPreview = calcPad && calcPad.expr && !calcPad.justOp
    ? evalExpr(calcPad.expr) : null;

  const locksN = shelves.locksPerShelf || 15;
  const COLS = 5, ROWS = 3; // match ShelfBlock exactly

  const shelfList = uM(() => {
    const list = [];
    ['A','B'].forEach(side => {
      for (let n = 1; n <= (shelves[side] || 10); n++) list.push(side + n);
    });
    return list;
  }, [shelves]);

  const lockSkus = uM(() => {
    if (!selLockKey) return [];
    return lockData[selLockKey] ? lockData[selLockKey].skus : [];
  }, [selLockKey, lockData]);

  const summary = uM(() => {
    let waiting = 0, matched = 0, mismatched = 0;
    lockSkus.forEach(sku => {
      const p   = productMap[sku];
      const sys = p ? whQty(p) : null;
      const val = checkedQtys[sku];
      const has = val !== '' && val != null;
      if (!has) { waiting++; return; }
      (sys !== null && (parseInt(val)||0) === sys) ? matched++ : mismatched++;
    });
    return { waiting, matched, mismatched };
  }, [lockSkus, checkedQtys, productMap]);

  const adjustQty = (sku, delta) => {
    const cur = checkedQtys[sku];
    const n   = (cur !== '' && cur != null) ? (parseInt(cur)||0) : 0;
    setCheckedQtys(prev => ({ ...prev, [sku]: String(Math.max(0, n + delta)) }));
  };

  const handleSave = async () => {
    const entries = Object.entries(checkedQtys)
      .filter(([, v]) => v !== '' && v != null)
      .map(([sku, qty]) => ({ sku, qty: parseInt(qty)||0 }));
    if (!entries.length) { showToast('warn', 'ยังไม่ได้กรอกจำนวน', '✏️'); return; }
    setSaving(true);
    const result = await syncLockData(selLockKey, entries);
    setSaving(false);
    if (result.success !== false) {
      setSavedSkus(new Set(entries.map(e => e.sku)));
      setLastSavedTime(new Date());
      showToast('success', 'บันทึกแล้ว ' + entries.length + ' รายการ', '💾');
    } else {
      showToast('error', 'บันทึกไม่สำเร็จ', '❌');
    }
  };

  const shelfNum = selShelf ? parseInt(selShelf.replace(/[A-Za-z]/g,'')) : 0;
  const isRight  = shelfNum % 2 !== 0;
  const lockNumAt = (row, col) =>
    isRight
      ? (COLS - 1 - col) * ROWS + (row + 1)      // ขวา: 1 บนขวา
      : (COLS - 1 - col) * ROWS + (ROWS - row);  // ซ้าย: 15 บนซ้าย

  const shelfStats = uM(() => {
    const s = {};
    shelfList.forEach(sh => {
      let total = 0;
      for (let n = 1; n <= locksN; n++) {
        const d = lockData[sh + '/' + n];
        if (d && d.skus.length) total += d.skus.length;
      }
      s[sh] = { total };
    });
    return s;
  }, [shelfList, lockData, locksN]);

  // ── SUPPLIER MODE memos ──────────────────────────────────────────
  // sku → lockKey reverse map
  const skuToLock = uM(() => {
    const m = {};
    Object.entries(lockData).forEach(([lk, d]) => {
      (d.skus || []).forEach(sku => { m[sku] = lk; });
    });
    return m;
  }, [lockData]);

  // suppliers that have at least one product with warehouse stock
  const allSuppliersWH = uM(() => {
    const s = new Set();
    products.forEach(p => {
      if (whQty(p) > 0) {
        const v = p.lastSupplier || p.vendor;
        if (v) s.add(v);
      }
    });
    return [...s].sort();
  }, [products]);

  const filteredSuppliers = uM(() => {
    if (!suppSearch.trim()) return allSuppliersWH;
    const q = suppSearch.trim().toLowerCase();
    return allSuppliersWH.filter(s => s.toLowerCase().includes(q));
  }, [allSuppliersWH, suppSearch]);

  // products from selected supplier in warehouse, sorted by lock position
  const supplierProducts = uM(() => {
    if (!selSupplier) return [];
    return products
      .filter(p => (p.lastSupplier || p.vendor) === selSupplier && whQty(p) > 0)
      .sort((a, b) => {
        const la = skuToLock[a.sku] || 'zzz';
        const lb = skuToLock[b.sku] || 'zzz';
        return la.localeCompare(lb, undefined, { numeric: true }) || compareSku(a, b);
      });
  }, [selSupplier, products, skuToLock]);

  const supplierSummary = uM(() => {
    let waiting = 0, matched = 0, mismatched = 0;
    supplierProducts.forEach(p => {
      const sys = whQty(p);
      const val = checkedQtys[p.sku];
      const has = val !== '' && val != null;
      if (!has) { waiting++; return; }
      ((parseInt(val)||0) === sys) ? matched++ : mismatched++;
    });
    return { waiting, matched, mismatched };
  }, [supplierProducts, checkedQtys]);

  const handleSaveSupplier = async () => {
    // group checked entries by lockKey
    const byLock = {};
    let noLockCount = 0;
    supplierProducts.forEach(p => {
      const qty = checkedQtys[p.sku];
      if (qty === '' || qty == null) return;
      const lk = skuToLock[p.sku];
      if (!lk) { noLockCount++; return; }
      if (!byLock[lk]) byLock[lk] = [];
      byLock[lk].push({ sku: p.sku, qty: parseInt(qty)||0 });
    });
    const lockEntries = Object.entries(byLock);
    if (lockEntries.length === 0) {
      showToast('warn', noLockCount > 0 ? 'สินค้าที่กรอกยังไม่มีตำแหน่งล็อค' : 'ยังไม่ได้กรอกจำนวน', '✏️');
      return;
    }
    setSaving(true);
    let anyError = false;
    for (const [lk, entries] of lockEntries) {
      const result = await syncLockData(lk, entries);
      if (result.success === false) anyError = true;
    }
    setSaving(false);
    const totalSaved = lockEntries.reduce((s, [, e]) => s + e.length, 0);
    if (!anyError) {
      setSavedSkus(new Set(lockEntries.flatMap(([, e]) => e.map(x => x.sku))));
      setLastSavedTime(new Date());
      showToast('success', `บันทึก ${totalSaved} รายการ ใน ${lockEntries.length} ล็อค`, '💾');
    } else {
      showToast('error', 'บันทึกบางรายการไม่สำเร็จ', '❌');
    }
  };

  // ── step 1 global search — must be declared before any early return (Rules of Hooks) ──
  const step1SearchResults = uM(() => {
    const q = stockSearch.trim().toUpperCase();
    if (!q) return [];
    const hits = [];
    Object.entries(lockData).forEach(([lk, d]) => {
      (d.skus || []).forEach(sku => {
        if (hits.length >= 30) return;
        const p = productMap[sku];
        const skuUp = sku.toUpperCase();
        const nameUp = (p && p.name ? p.name : '').toUpperCase();
        if (skuUp.includes(q) || nameUp.includes(q)) {
          hits.push({ sku, lockKey: lk, p });
        }
      });
    });
    // also include products in no lock
    if (hits.length < 30) {
      products.forEach(p => {
        if (hits.length >= 30) return;
        if (!skuToLock[p.sku]) {
          const skuUp = p.sku.toUpperCase();
          const nameUp = (p.name || '').toUpperCase();
          if (skuUp.includes(q) || nameUp.includes(q)) {
            hits.push({ sku: p.sku, lockKey: null, p });
          }
        }
      });
    }
    return hits;
  }, [stockSearch, lockData, productMap, products, skuToLock]);

  // ── SUPPLIER MODE — นับตามซัพพลายเออร์ ──────────────────────────
  if (supplierMode) {
    const suppFilledCount = Object.values(checkedQtys).filter(v => v !== '' && v != null).length;
    return (
      <>
        <Toast toast={toast} onClose={hideToast}/>
        <CalcPadModal
          open={!!calcPad}
          name={calcPad ? (calcPad.name || calcPad.sku) : ''}
          initialVal={calcPad ? calcPad.expr : ''}
          onConfirm={function(qty){
            if (calcPad) setCheckedQtys(function(prev){ const o=Object.assign({},prev); o[calcPad.sku]=qty; return o; });
            setCalcPad(null);
          }}
          onClose={function(){ setCalcPad(null); }}
        />
        <div style={{display:'flex',flexDirection:'column',gap:14,width:"100%",minWidth:0,boxSizing:"border-box"}}>

          {/* Header */}
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            {selSupplier ? (
              <button onClick={() => { setSelSupplier(null); setSuppSearch(''); }}
                style={{width:44,height:44,borderRadius:10,border:'1.5px solid var(--bdr)',
                        background:'#fff',cursor:'pointer',fontSize:20,fontFamily:'inherit',flexShrink:0}}>
                ←
              </button>
            ) : (
              <button onClick={() => { setSupplierMode(false); }}
                style={{width:44,height:44,borderRadius:10,border:'1.5px solid var(--bdr)',
                        background:'#fff',cursor:'pointer',fontSize:20,fontFamily:'inherit',flexShrink:0}}>
                ←
              </button>
            )}
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:800}}>
                🏭 {selSupplier || 'เลือกซัพพลายเออร์'}
              </div>
              <div style={{fontSize:11,color:'var(--muted)'}}>
                {selSupplier
                  ? `${supplierProducts.length} SKU ในคลัง — กรอกจำนวนที่นับได้`
                  : `${allSuppliersWH.length} ซัพพลายเออร์ที่มีของในคลัง`}
              </div>
            </div>
            {selSupplier && (
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
                <button onClick={handleSaveSupplier} disabled={saving||suppFilledCount===0}
                  className="btn primary"
                  style={{padding:'10px 20px',fontWeight:700,fontSize:14,
                          opacity:(saving||suppFilledCount===0)?0.4:1}}>
                  {saving ? '⏳ บันทึก...' : suppFilledCount>0 ? `💾 บันทึก (${suppFilledCount})` : '💾 บันทึก'}
                </button>
                {lastSavedTime && (
                  <div style={{fontSize:10,color:'var(--g-600)',fontWeight:600}}>
                    {'✓ '+lastSavedTime.getHours().toString().padStart(2,'0')+':'+lastSavedTime.getMinutes().toString().padStart(2,'0')}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── ยังไม่ได้เลือก supplier → แสดง list ── */}
          {!selSupplier && (
            <>
              <input type="text" placeholder="🔍 ค้นหาซัพพลายเออร์..."
                value={suppSearch} onChange={e => setSuppSearch(e.target.value)}
                style={{padding:'10px 14px',borderRadius:10,border:'1.5px solid var(--bdr)',
                        fontSize:13,fontFamily:'inherit',background:'#fff'}}/>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {filteredSuppliers.length === 0 && (
                  <Empty title="ไม่พบซัพพลายเออร์" sub="ลองค้นหาด้วยคำอื่น"/>
                )}
                {filteredSuppliers.map(sup => {
                  const prods = products.filter(p =>
                    (p.lastSupplier || p.vendor) === sup && whQty(p) > 0);
                  const locks = new Set(prods.map(p => skuToLock[p.sku]).filter(Boolean));
                  return (
                    <div key={sup} onClick={() => setSelSupplier(sup)}
                      style={{background:'#fff',border:'1.5px solid var(--bdr)',borderRadius:14,
                              padding:'14px 16px',cursor:'pointer',
                              display:'flex',alignItems:'center',gap:12,
                              boxShadow:'0 1px 4px rgba(0,0,0,.04)'}}>
                      <div style={{width:40,height:40,borderRadius:12,background:'#f0fdf4',
                                   display:'flex',alignItems:'center',justifyContent:'center',
                                   fontSize:20,flexShrink:0}}>🏭</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:14,color:'var(--g-800)',
                                     overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {sup}
                        </div>
                        <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>
                          {prods.length} SKU · {locks.size > 0 ? `${locks.size} ล็อค` : 'ยังไม่มีตำแหน่ง'}
                        </div>
                      </div>
                      <div style={{fontSize:18,color:'var(--muted)'}}>›</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── เลือก supplier แล้ว → แสดงสินค้า ── */}
          {selSupplier && (
            <>
              {/* Summary chips */}
              {supplierProducts.length > 0 && (
                <div style={{display:'flex',gap:8}}>
                  {[
                    {n:supplierSummary.waiting,    label:'⬜ รอนับ',  bg:'#f1f5f9', c:'var(--muted)'},
                    {n:supplierSummary.matched,    label:'✅ ตรง',    bg:'#f0fdf4', c:'var(--g-700)'},
                    {n:supplierSummary.mismatched, label:'⚠️ ไม่ตรง',
                     bg:supplierSummary.mismatched>0?'#fff5f5':'#f1f5f9',
                     c:supplierSummary.mismatched>0?'var(--dang)':'var(--muted)'},
                  ].map(function(item){
                    return (
                      <div key={item.label} style={{flex:1,textAlign:'center',padding:'10px 4px',
                                                    borderRadius:12,background:item.bg}}>
                        <div style={{fontSize:22,fontWeight:800,color:item.c}}>{item.n}</div>
                        <div style={{fontSize:11,color:item.c,fontWeight:600}}>{item.label}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Search */}
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="text" placeholder="🔍 ค้นหา SKU หรือชื่อสินค้า..."
                  value={stockSearch}
                  onChange={e => setStockSearch(e.target.value.toUpperCase())}
                  style={{flex:1,padding:'9px 12px',borderRadius:10,border:'1.5px solid var(--bdr)',
                          fontSize:13,fontFamily:'inherit',background:'#fff'}}/>
                <ScanButton size={44} onScan={sku => setStockSearch(sku)}/>
                {stockSearch && (
                  <button onClick={() => setStockSearch('')}
                    style={{width:44,height:44,borderRadius:10,border:'1.5px solid var(--bdr)',
                            background:'#fff',cursor:'pointer',fontSize:18,fontFamily:'inherit',
                            color:'var(--muted)',flexShrink:0}}>✕</button>
                )}
              </div>

              {/* Product cards */}
              {supplierProducts.length === 0 ? (
                <Empty title="ไม่มีสินค้าในคลัง" sub="ซัพพลายเออร์นี้ไม่มีสินค้าในคลังขณะนี้"/>
              ) : (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:14}}>
                  {supplierProducts.filter(p => {
                    if (!stockSearch) return true;
                    const sq = stockSearch.trim().toUpperCase();
                    return p.sku.toUpperCase().includes(sq) || (p.name||'').toUpperCase().includes(sq);
                  }).map(p => {
                    const lockKey = skuToLock[p.sku];
                    const sys  = whQty(p);
                    const val  = checkedQtys[p.sku];
                    const has  = val !== '' && val != null;
                    const num  = has ? (parseInt(val)||0) : 0;
                    const matched = has && num === sys;
                    const diff = has ? num - sys : null;
                    const saved = savedSkus.has(p.sku);
                    const bdr   = !has ? 'var(--bdr)' : matched ? 'var(--g-500)' : 'var(--dang)';
                    const bgCard = saved ? '#f0fdf4' : !has ? '#fff' : matched ? '#f0fdf4' : '#fff5f5';

                    return (
                      <div key={p.sku} style={{
                        background:bgCard, border:'2px solid '+bdr, borderRadius:16, overflow:'hidden',
                        display:'flex', flexDirection:'column', transition:'border-color .15s,background .15s',
                        boxShadow:'0 2px 8px rgba(0,0,0,.06)',
                      }}>
                        {/* Image */}
                        <div style={{position:'relative',paddingTop:'75%',background:'var(--g-50)',flexShrink:0}}>
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name}
                                 style={{position:'absolute',inset:0,width:'100%',height:'100%',
                                         objectFit:'contain',background:'var(--g-50)'}}/>
                          ) : (
                            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
                                         justifyContent:'center',fontSize:32}}>
                              {CAT_EMOJI[p.cat] || '📦'}
                            </div>
                          )}
                          {/* Lock badge — prominent position indicator */}
                          {lockKey ? (
                            <div style={{
                              position:'absolute',top:6,left:6,
                              background:'rgba(27,94,32,.88)',color:'#fff',
                              borderRadius:8,padding:'3px 8px',
                              fontSize:11,fontWeight:800,fontFamily:'monospace',
                              backdropFilter:'blur(4px)',
                              display:'flex',alignItems:'center',gap:4,
                            }}>
                              📍 {lockKey}
                            </div>
                          ) : (
                            <div style={{
                              position:'absolute',top:6,left:6,
                              background:'rgba(180,83,9,.85)',color:'#fff',
                              borderRadius:8,padding:'3px 8px',
                              fontSize:10,fontWeight:700,
                              backdropFilter:'blur(4px)',
                            }}>
                              ⚠️ ไม่มีตำแหน่ง
                            </div>
                          )}
                          {p.color && (
                            <span style={{
                              position:'absolute',bottom:6,right:6,
                              width:14,height:14,borderRadius:'50%',
                              background:p.color.hex,
                              border:'2px solid rgba(255,255,255,.9)',
                              boxShadow:'0 1px 3px rgba(0,0,0,.3)',
                            }}/>
                          )}
                        </div>

                        <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:8,flex:1}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:6}}>
                            <span style={{fontSize:10,fontWeight:700,color:'var(--g-500)',fontFamily:'monospace'}}>
                              {p.sku}
                            </span>
                            <span style={{fontSize:11,fontWeight:700,color:'#1b5e20',
                                          background:'#e8f5e9',padding:'1px 7px',borderRadius:10,flexShrink:0}}>
                              คลัง {sys}
                            </span>
                          </div>
                          <div style={{fontSize:12,fontWeight:600,color:'var(--g-800)',lineHeight:1.35,
                                        overflow:'hidden',display:'-webkit-box',
                                        WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                            {p.name || '—'}
                          </div>

                          {/* Count result */}
                          {has && (
                            <div style={{fontSize:11,fontWeight:700,textAlign:'center',borderRadius:8,padding:'4px 6px',
                                          background:matched?'#dcfce7':'#fee2e2',color:matched?'#166534':'#991b1b'}}>
                              {matched ? `✅ นับได้ ${num} ตรง` : `⚠️ นับได้ ${num} (${diff>0?'+':''}${diff} จากระบบ)`}
                            </div>
                          )}

                          {/* ± controls */}
                          <div style={{display:'flex',gap:5,alignItems:'center',marginTop:'auto'}}>
                            {[-5,-1].map(d => (
                              <button key={d} onClick={() => adjustQty(p.sku, d)}
                                style={{flex:1,height:44,borderRadius:8,border:'1.5px solid var(--bdr)',
                                        background:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,
                                        fontFamily:'inherit',color:'var(--g-700)'}}>
                                {d}
                              </button>
                            ))}
                            <button onClick={() => openCalc(p.sku, p.name)}
                              style={{flex:2,height:44,borderRadius:8,border:'1.5px solid var(--g-400)',
                                      background:has?'#f0fdf4':'#fff',cursor:'pointer',
                                      fontSize:14,fontWeight:800,fontFamily:'monospace',
                                      color:has?'var(--g-700)':'var(--muted)'}}>
                              {has ? num : '—'}
                            </button>
                            {[1,5].map(d => (
                              <button key={d} onClick={() => adjustQty(p.sku, d)}
                                style={{flex:1,height:44,borderRadius:8,border:'1.5px solid var(--bdr)',
                                        background:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,
                                        fontFamily:'inherit',color:'var(--g-700)'}}>
                                +{d}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </>
    );
  }

  // ── STEP 1: เลือกชั้น ────────────────────────────────────────────
  if (step === 1) return (
    <>
      <Toast toast={toast} onClose={hideToast}/>
      <div style={{display:'flex',flexDirection:'column',gap:16,width:"100%",minWidth:0,boxSizing:"border-box"}}>
        <div>
          <div style={{fontSize:16,fontWeight:800}}>📊 นับ stock คลัง</div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>ขั้น 1 — เลือกชั้น หรือค้นหาสินค้า</div>
        </div>

        {/* ── Search + Scan (global) ── */}
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <input type="text" placeholder="🔍 ค้นหา SKU หรือชื่อสินค้า..."
            value={stockSearch}
            onChange={e => setStockSearch(e.target.value.toUpperCase())}
            style={{flex:1,padding:'11px 14px',borderRadius:10,border:'1.5px solid var(--bdr)',
                    fontSize:13,fontFamily:'inherit',background:'#fff'}}/>
          <ScanButton size={46} onScan={sku => setStockSearch(sku.toUpperCase())}/>
          {stockSearch && (
            <button onClick={() => setStockSearch('')}
              style={{width:46,height:46,borderRadius:10,border:'1.5px solid var(--bdr)',
                      background:'#fff',cursor:'pointer',fontSize:18,fontFamily:'inherit',
                      color:'var(--muted)',flexShrink:0}}>✕</button>
          )}
        </div>

        {/* ── Search results ── */}
        {stockSearch.trim().length > 0 && (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {step1SearchResults.length === 0 ? (
              <div style={{textAlign:'center',padding:'20px 0',color:'var(--muted)',fontSize:13}}>
                ไม่พบสินค้าที่ตรงกัน
              </div>
            ) : (
              <>
                <div style={{fontSize:11,color:'var(--muted)',fontWeight:600}}>
                  พบ {step1SearchResults.length} รายการ — แตะเพื่อไปนับล็อคนั้นเลย
                </div>
                {step1SearchResults.map(({ sku, lockKey, p }) => {
                  const sys = p ? whQty(p) : null;
                  const shelf = lockKey ? lockKey.split('/')[0] : null;
                  return (
                    <div key={sku + (lockKey||'')}
                      onClick={() => {
                        if (!lockKey) return;
                        setSelShelf(shelf);
                        setSelLockKey(lockKey);
                        setStockSearch('');
                        setStep(3);
                      }}
                      style={{
                        display:'flex', alignItems:'center', gap:12,
                        background: lockKey ? '#fff' : '#fffbf0',
                        border:'1.5px solid ' + (lockKey ? 'var(--bdr)' : '#fbbf24'),
                        borderRadius:12, padding:'10px 14px',
                        cursor: lockKey ? 'pointer' : 'default',
                        boxShadow:'0 1px 4px rgba(0,0,0,.04)',
                      }}>
                      {/* Image or emoji */}
                      {p && p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name}
                          style={{width:44,height:44,objectFit:'contain',borderRadius:8,
                                  background:'var(--g-50)',flexShrink:0}}/>
                      ) : (
                        <div style={{width:44,height:44,borderRadius:8,background:'var(--g-50)',
                                     display:'flex',alignItems:'center',justifyContent:'center',
                                     fontSize:22,flexShrink:0}}>
                          {(p && CAT_EMOJI[p.cat]) || '📦'}
                        </div>
                      )}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                          <span style={{fontSize:11,fontWeight:700,color:'var(--g-500)',
                                        fontFamily:'monospace'}}>{sku}</span>
                          {lockKey ? (
                            <span style={{fontSize:11,fontWeight:800,color:'#fff',
                                          background:'#1b5e20',borderRadius:6,
                                          padding:'1px 7px',fontFamily:'monospace'}}>
                              📍 {lockKey}
                            </span>
                          ) : (
                            <span style={{fontSize:10,fontWeight:700,color:'#92400e',
                                          background:'#fef3c7',borderRadius:6,padding:'1px 7px'}}>
                              ⚠️ ไม่มีตำแหน่ง
                            </span>
                          )}
                        </div>
                        <div style={{fontSize:12,fontWeight:600,color:'var(--g-800)',marginTop:2,
                                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {(p && p.name) || '—'}
                        </div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        {sys != null && (
                          <div style={{fontSize:13,fontWeight:800,color:'#1b5e20'}}>
                            {sys} <span style={{fontSize:10,fontWeight:500,color:'var(--muted)'}}>ชิ้น</span>
                          </div>
                        )}
                        {lockKey && (
                          <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>แตะเพื่อนับ ›</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Mode toggle — ซ่อนเมื่อกำลังค้นหา */}
        {!stockSearch.trim() && (
        <div style={{display:'flex',gap:8}}>
          <button style={{flex:1,padding:'10px 0',borderRadius:10,border:'2px solid #1b5e20',
                          background:'#1b5e20',color:'#fff',fontWeight:700,fontSize:13,
                          cursor:'pointer',fontFamily:'inherit'}}>
            📦 ตามล็อค
          </button>
          <button onClick={() => setSupplierMode(true)}
            style={{flex:1,padding:'10px 0',borderRadius:10,border:'2px solid var(--bdr)',
                    background:'#fff',color:'var(--g-700)',fontWeight:700,fontSize:13,
                    cursor:'pointer',fontFamily:'inherit'}}>
            🏭 ตามซัพพลายเออร์
          </button>
        </div>
        )}

        {/* Shelf grid — ซ่อนเมื่อกำลังค้นหา */}
        {!stockSearch.trim() && (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {['A','B'].map(side => (
              <div key={side}>
                <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',
                             textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>
                  ซอย {side}
                </div>
                <div style={{display:'grid',
                             gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))',gap:10}}>
                  {shelfList.filter(s => s[0] === side).map(sh => {
                    const shN = parseInt(sh.replace(/[A-Za-z]/g,''));
                    const isR = shN % 2 !== 0;
                    const stat = shelfStats[sh] || { total:0 };
                    return (
                      <div key={sh}
                        onClick={() => { setSelShelf(sh); setStep(2); }}
                        style={{
                          background:'#fff',
                          border:'2px solid ' + (stat.total>0 ? 'var(--bdr)' : '#e2e8f0'),
                          borderRadius:14, padding:'16px 8px', cursor:'pointer',
                          display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                          boxShadow:'0 1px 4px rgba(0,0,0,.05)',
                          minHeight:96,
                        }}>
                        <div style={{fontSize:22,fontWeight:800,color:'var(--g-700)',
                                     fontFamily:'monospace'}}>{sh}</div>
                        <div style={{fontSize:10,fontWeight:700,borderRadius:8,padding:'2px 8px',
                                     background:isR?'#fef3c7':'#e0f2fe',
                                     color:isR?'#b45309':'#1f6f8b'}}>
                          {isR ? '🧱 ขวา' : '🚪 ซ้าย'}
                        </div>
                        <div style={{fontSize:11,color:'var(--muted)'}}>
                          {stat.total>0 ? stat.total+' SKU' : 'ว่าง'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  // ── STEP 2: เลือกล็อค ───────────────────────────────────────────
  if (step === 2) return (
    <>
      <Toast toast={toast} onClose={hideToast}/>
      <div style={{display:'flex',flexDirection:'column',gap:14,width:"100%",minWidth:0,boxSizing:"border-box"}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={() => setStep(1)}
            style={{width:40,height:40,borderRadius:10,border:'1.5px solid var(--bdr)',
                    background:'#fff',cursor:'pointer',fontSize:20,fontFamily:'inherit',
                    flexShrink:0}}>
            ←
          </button>
          <div>
            <div style={{fontSize:15,fontWeight:800}}>ชั้น {selShelf}</div>
            <div style={{fontSize:11,color:'var(--muted)'}}>
              {isRight ? '🧱 ฝั่งขวา' : '🚪 ฝั่งซ้าย'} · ขั้น 2 — เลือกล็อค
            </div>
          </div>
        </div>
        <Card padding={true}>
          <div style={{fontSize:11,color:'var(--muted)',fontWeight:600,marginBottom:10}}>
            {isRight ? '🔢 ล็อค 1 อยู่มุมบน-ขวา' : '🔢 ล็อค 1 อยู่มุมบน-ซ้าย'}
          </div>
          <div style={{display:'grid',
                       gridTemplateColumns:'repeat('+COLS+',1fr)',maxWidth:480,margin:'0 auto',gap:8}}>
            {Array.from({length:ROWS}, (_, row) =>
              Array.from({length:COLS}, (_, col) => {
                const n   = lockNumAt(row, col);
                if (n < 1 || n > locksN) return <div key={'e'+row+'-'+col}/>;
                const key = selShelf + '/' + n;
                const d   = lockData[key];
                const cnt = d ? d.skus.length : 0;
                return (
                  <div key={n}
                    onClick={() => { if(cnt>0){ setSelLockKey(key); setStep(3); } }}
                    style={{
                      background: cnt>0 ? '#fff' : '#f8fafc',
                      border:'2px solid ' + (cnt>0 ? 'var(--g-400)' : '#e2e8f0'),
                      borderRadius:10, padding:'12px 4px',
                      cursor: cnt>0 ? 'pointer' : 'default',
                      textAlign:'center',
                      opacity: cnt>0 ? 1 : 0.4,
                    }}>
                    <div style={{fontSize:18,fontWeight:800,color:'var(--g-700)'}}>{n}</div>
                    <div style={{fontSize:9,color:cnt>0?'var(--g-600)':'#94a3b8',fontWeight:600}}>
                      {cnt>0 ? cnt+' SKU' : 'ว่าง'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </>
  );

  // ── STEP 3: นับสินค้า ─────────────────────────────────────────────
  const filledCount = Object.values(checkedQtys).filter(v => v !== '' && v != null).length;

  return (
    <>
      <Toast toast={toast} onClose={hideToast}/>

      {/* ── CalcPadModal ── */}
      <CalcPadModal
        open={!!calcPad}
        name={calcPad ? (calcPad.name || calcPad.sku) : ''}
        initialVal={calcPad ? calcPad.val : ''}
        onConfirm={function(qty){
          if (calcPad) {
            setCheckedQtys(function(prev){ const o=Object.assign({},prev); o[calcPad.sku]=qty; return o; });
          }
          setCalcPad(null);
        }}
        onClose={function(){ setCalcPad(null); }}
      />

      <div style={{display:'flex',flexDirection:'column',gap:12,width:"100%",minWidth:0,boxSizing:"border-box"}}>

        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <button onClick={() => setStep(2)}
            style={{width:44,height:44,borderRadius:10,border:'1.5px solid var(--bdr)',
                    background:'#fff',cursor:'pointer',fontSize:20,fontFamily:'inherit',flexShrink:0}}>
            ←
          </button>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:800}}>ล็อค {selLockKey}</div>
            <div style={{fontSize:11,color:'var(--muted)'}}>ขั้น 3 — กรอกจำนวนที่นับได้จริง</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
            <button onClick={handleSave} disabled={saving||filledCount===0}
              className="btn primary"
              style={{padding:'10px 20px',fontWeight:700,fontSize:14,
                      opacity:(saving||filledCount===0)?0.4:1}}>
              {saving ? '⏳ บันทึก...' : filledCount>0 ? '💾 บันทึก ('+filledCount+')' : '💾 บันทึก'}
            </button>
            {lastSavedTime && (
              <div style={{fontSize:10,color:'var(--g-600)',fontWeight:600}}>
                {'✓ บันทึก '+lastSavedTime.getHours().toString().padStart(2,'0')+':'+lastSavedTime.getMinutes().toString().padStart(2,'0')}
              </div>
            )}
          </div>
        </div>

        {lockSkus.length > 0 && (
          <div style={{display:'flex',gap:8}}>
            {[
              {n:summary.waiting,    label:'⬜ รอนับ',  bg:'#f1f5f9', c:'var(--muted)'},
              {n:summary.matched,    label:'✅ ตรง',    bg:'#f0fdf4', c:'var(--g-700)'},
              {n:summary.mismatched, label:'⚠️ ไม่ตรง',
               bg:summary.mismatched>0?'#fff5f5':'#f1f5f9',
               c:summary.mismatched>0?'var(--dang)':'var(--muted)'},
            ].map(function(item){
              return (
                <div key={item.label} style={{flex:1,textAlign:'center',padding:'10px 4px',
                                              borderRadius:12,background:item.bg}}>
                  <div style={{fontSize:22,fontWeight:800,color:item.c}}>{item.n}</div>
                  <div style={{fontSize:11,color:item.c,fontWeight:600}}>{item.label}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Search + Scan ── */}
        {lockSkus.length > 0 && (
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input
              type="text"
              placeholder="🔍 ค้นหา SKU หรือชื่อสินค้า..."
              value={stockSearch}
              onChange={function(e){ setStockSearch(e.target.value.toUpperCase()); }}
              style={{flex:1,padding:'9px 12px',borderRadius:10,
                      border:'1.5px solid var(--bdr)',fontSize:13,
                      fontFamily:'inherit',background:'#fff'}}
            />
            <ScanButton
              size={44}
              onScan={function(sku){ setStockSearch(sku); }}
            />
            {stockSearch && (
              <button onClick={function(){ setStockSearch(''); }}
                style={{width:44,height:44,borderRadius:10,border:'1.5px solid var(--bdr)',
                        background:'#fff',cursor:'pointer',fontSize:18,fontFamily:'inherit',
                        color:'var(--muted)',flexShrink:0}}>
                ✕
              </button>
            )}
          </div>
        )}

        {lockSkus.length === 0 ? (
          <Card padding={true}>
            <Empty title="ล็อคนี้ยังไม่มีสินค้า" sub="เพิ่มสินค้าในหน้าตำแหน่งคลัง"/>
          </Card>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:14}}>
            {lockSkus.filter(function(sku){
              if (!stockSearch) return true;
              const sq = stockSearch.trim().toUpperCase();
              const p = productMap[sku];
              return sku.toUpperCase().includes(sq) || (p && p.name && p.name.toUpperCase().includes(sq));
            }).map(function(sku){
              const p      = productMap[sku];
              const sys    = p ? whQty(p) : null;
              const val    = checkedQtys[sku];
              const has    = val !== '' && val != null;
              const num    = has ? (parseInt(val)||0) : 0;
              const matched = has && sys !== null && num === sys;
              const diff   = has && sys !== null ? num - sys : null;
              const saved  = savedSkus.has(sku);
              const bdr    = !has ? 'var(--bdr)' : matched ? 'var(--g-500)' : 'var(--dang)';
              const bgCard = saved ? '#f0fdf4' : !has ? '#fff' : matched ? '#f0fdf4' : '#fff5f5';

              return (
                <div key={sku} style={{
                  background:bgCard, border:'2px solid '+bdr,
                  borderRadius:16, overflow:'hidden',
                  display:'flex', flexDirection:'column',
                  transition:'border-color .15s,background .15s',
                  boxShadow:'0 2px 8px rgba(0,0,0,.06)',
                }}>
                  {/* Image 4:3 ratio */}
                  <div style={{position:'relative',paddingTop:'75%',background:'var(--g-50)',flexShrink:0}}>
                    {p && p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name}
                           style={{position:'absolute',inset:0,width:'100%',height:'100%',
                                   objectFit:'contain',padding:6}}/>
                    ) : (
                      <div style={{position:'absolute',inset:0,display:'flex',
                                   alignItems:'center',justifyContent:'center',fontSize:36}}>
                        📦
                      </div>
                    )}
                    {p && p.imageUrl && p.color && (
                      <span style={{position:'absolute',bottom:8,left:8,width:12,height:12,
                                    borderRadius:'50%',background:p.color.hex,
                                    border:'2px solid #fff',boxShadow:'0 1px 4px rgba(0,0,0,.3)',
                                    pointerEvents:'none'}}/>
                    )}
                    <div style={{position:'absolute',top:6,right:6,
                                 fontSize:10,fontWeight:800,borderRadius:10,padding:'3px 8px',
                                 background:!has?'rgba(241,245,249,.9)':matched?'rgba(220,252,231,.95)':'rgba(254,226,226,.95)',
                                 color:!has?'var(--muted)':matched?'#166534':'var(--dang)'}}>
                      {!has ? '⬜ รอนับ' : matched ? '✅ ตรง' : (diff>0?'⚠️ +'+diff:'⚠️ '+diff)}
                    </div>
                  </div>

                  <div style={{padding:'10px 12px 14px',display:'flex',flexDirection:'column',gap:7,flex:1}}>
                    <div style={{fontSize:10,fontWeight:700,color:'var(--g-500)',fontFamily:'monospace'}}>{sku}</div>
                    <div style={{fontSize:13,fontWeight:700,lineHeight:1.3,
                                 overflow:'hidden',display:'-webkit-box',
                                 WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                      {p ? p.name : React.createElement('span',{style:{color:'var(--muted)',fontStyle:'italic'}},'ไม่พบในระบบ')}
                    </div>

                    {/* Sys qty row */}
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                                 padding:'6px 10px',borderRadius:10,
                                 background:!has?'#f8fafc':matched?'#f0fdf4':'#fff5f5'}}>
                      <span style={{fontSize:11,color:'var(--muted)',fontWeight:600}}>ระบบ</span>
                      <span style={{fontSize:18,fontWeight:800,
                                    color:!has?'var(--text)':matched?'var(--g-700)':'var(--dang)'}}>
                        {sys != null ? sys : '—'}
                        {saved ? React.createElement('span',{style:{
                          marginLeft:6,fontSize:10,background:'#dcfce7',color:'#166534',
                          borderRadius:8,padding:'1px 6px',fontWeight:700}},'✓') : null}
                      </span>
                    </div>

                    {/* ±5 ±1 [input] ±1 ±5 */}
                    <div style={{display:'flex',alignItems:'stretch',gap:3}}>
                      <button onClick={function(){ adjustQty(sku,-5); }}
                        style={{flex:'0 0 36px',height:44,borderRadius:8,
                                border:'1.5px solid var(--bdr)',background:'#fff',
                                cursor:'pointer',fontSize:10,fontWeight:800,
                                fontFamily:'inherit',color:'var(--dang)',
                                opacity:num>=5?1:0.3}}>
                        −5
                      </button>
                      <button onClick={function(){ adjustQty(sku,-1); }}
                        style={{flex:'0 0 36px',height:44,borderRadius:8,
                                border:'1.5px solid var(--bdr)',background:'#fff',
                                cursor:'pointer',fontSize:18,fontWeight:800,
                                fontFamily:'inherit',color:'var(--dang)',
                                opacity:num>=1?1:0.3}}>
                        −
                      </button>
                      <input type="number" min="0" inputMode="numeric"
                        value={val != null ? val : ''}
                        onChange={function(e){
                          setCheckedQtys(function(prev){
                            const o = Object.assign({},prev);
                            o[sku] = e.target.value===''?'':String(Math.max(0,parseInt(e.target.value)||0));
                            return o;
                          });
                        }}
                        placeholder={sys != null ? String(sys) : '0'}
                        style={{
                          flex:1,textAlign:'center',padding:'6px 0',
                          borderRadius:8,fontSize:18,fontWeight:800,
                          fontFamily:'inherit',outline:'none',minWidth:0,
                          border:has?(matched?'2px solid var(--g-500)':'2px solid var(--dang)'):'1.5px solid var(--g-300)',
                          background:has?(matched?'#f0fdf4':'#fff5f5'):'#fff',
                          color:has?(matched?'var(--g-700)':'var(--dang)'):'var(--text)',
                        }}/>
                      <button onClick={function(){ adjustQty(sku,1); }}
                        style={{flex:'0 0 36px',height:44,borderRadius:8,
                                border:'1.5px solid var(--g-200)',background:'#f0fdf4',
                                cursor:'pointer',fontSize:18,fontWeight:800,
                                fontFamily:'inherit',color:'var(--g-700)'}}>
                        +
                      </button>
                      <button onClick={function(){ adjustQty(sku,5); }}
                        style={{flex:'0 0 36px',height:44,borderRadius:8,
                                border:'1.5px solid var(--g-200)',background:'#f0fdf4',
                                cursor:'pointer',fontSize:10,fontWeight:800,
                                fontFamily:'inherit',color:'var(--g-700)'}}>
                        +5
                      </button>
                    </div>
                    {/* Calc button */}
                    <button onClick={function(){ openCalc(sku, p ? p.name : sku); }}
                      style={{width:'100%',marginTop:4,height:38,borderRadius:8,
                              border:'1.5px solid var(--bdr)',background:'#f8fafc',
                              cursor:'pointer',fontSize:13,fontWeight:700,
                              fontFamily:'inherit',color:'var(--muted)',
                              display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                      <span style={{fontSize:16}}>🧮</span>
                      <span>เครื่องคิดเลข</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function TransferView({ data }) {
  const transfers = data.transfers || [];
  const stats = data.transferStats || { 'โอน': {count:0,qty:0}, 'ปรับ': {count:0,qty:0}, 'ยกมา': {count:0,qty:0} };
  const products = data.products || [];

  const [filterType, setFilterType] = uS('all');
  const [search, setSearch] = uS('');

  const productMap = uM(() => {
    const m = {};
    products.forEach(p => { m[p.sku] = p; });
    return m;
  }, [products]);

  const filtered = uM(() => {
    let list = transfers;
    if (filterType !== 'all') list = list.filter(t => t.type === filterType);
    const sq = search.trim().toUpperCase();
    if (sq) list = list.filter(t => t.sku.toUpperCase().includes(sq) || t.name.toUpperCase().includes(sq));
    return list;
  }, [transfers, filterType, search]);

  const transferByType = uM(() => {
    const map = { 'โอน': [], 'ปรับ': [], 'ยกมา': [] };
    transfers.forEach(t => { if (map[t.type]) map[t.type].push(t); });
    return map;
  }, [transfers]);

  const transferByMonth = uM(() => {
    const map = {};
    transfers.forEach(t => {
      const d = (t.date || '').substring(0, 7);
      if (!d) return;
      map[d] = map[d] || { 'โอน': 0, 'ปรับ': 0, 'ยกมา': 0 };
      map[d][t.type] = (map[d][t.type] || 0) + (t.qty || 0);
    });
    return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0])).map(([m, v]) => ({month: m, ...v}));
  }, [transfers]);

  const totalQty = transfers.reduce((s, t) => s + (t.qty || 0), 0);
  const totalCount = transfers.length;

  return (
    <div className="transfer-view">
      <div className="row row-3" style={{marginBottom:16}}>
        <KPI label="โอน (Transfer)" value={`${fmtN(stats['โอน']?.count || 0)}`}
             sub={`${fmtN(stats['โอน']?.qty || 0)} ชิ้น`}
             accent="#2196F3" icon={I.arrowR}/>
        <KPI label="ปรับ (Adjust)" value={`${fmtN(stats['ปรับ']?.count || 0)}`}
             sub={`${fmtN(stats['ปรับ']?.qty || 0)} ชิ้น`}
             accent="#FF9800" icon={I.filter}/>
        <KPI label="ยกมา (Import)" value={`${fmtN(stats['ยกมา']?.count || 0)}`}
             sub={`${fmtN(stats['ยกมา']?.qty || 0)} ชิ้น`}
             accent="#4CAF50" icon={I.upload}/>
      </div>

      <Card title="📊 ปริมาณโอน/ปรับ/ยกมารายเดือน"
            sub="Trend ของการเคลื่อนย้ายสินค้า">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={transferByMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bdr)" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip contentStyle={{background:'#fff',border:'1px solid var(--bdr)',borderRadius:8}} />
            <Legend />
            <Bar dataKey="โอน" fill="#2196F3" name="โอน" />
            <Bar dataKey="ปรับ" fill="#FF9800" name="ปรับ" />
            <Bar dataKey="ยกมา" fill="#4CAF50" name="ยกมา" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="📋 รายการโอน/ปรับ/ยกมา"
            sub={`ทั้งหมด ${fmtN(totalCount)} รายการ · ${fmtN(totalQty)} ชิ้น`}
            action={
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input type="text" placeholder="🔍 ค้นหา SKU..."
                       value={search} onChange={e => setSearch(e.target.value)}
                       style={{padding:"6px 10px",border:"1px solid var(--bdr)",
                              borderRadius:8,fontSize:12,width:130}}/>
                <ScanButton size={36} onScan={sku => setSearch(sku)}/>
                <Seg value={filterType} onChange={setFilterType} options={[
                  {value:'all',label:'ทั้งหมด'},{value:'โอน',label:'โอน'},{value:'ปรับ',label:'ปรับ'},{value:'ยกมา',label:'ยกมา'},
                ]}/>
              </div>
            }
            style={{marginTop:16}}>
        {filtered.length === 0 ? (
          <div style={{padding:"20px 0"}}>
            <Empty title="ไม่พบข้อมูล" sub={search ? `ไม่พบ "${search}" · ลองค้นหาใหม่` : "ลองเลือก filter อื่น"}/>
          </div>
        ) : (
          <div className="t-transfer-wrap" style={{maxHeight:600,overflowY:'auto',overflowX:'auto',WebkitOverflowScrolling:'touch',maxWidth:'100%'}}>
            <table className="t" style={{minWidth:560}}>
              <thead><tr>
                <th>ประเภท</th>
                <th>วันที่</th>
                <th>SKU</th>
                <th>สินค้า</th>
                <th className="num">จำนวน</th>
                <th>จาก</th>
                <th>ไป</th>
                <th>สถานะ</th>
              </tr></thead>
              <tbody>
                {filtered.map((t, i) => {
                  const p = productMap[t.sku];
                  const typeColor = t.type === 'โอน' ? '#2196F3' : t.type === 'ปรับ' ? '#FF9800' : '#4CAF50';
                  return (
                    <tr key={i} style={{borderLeft:`3px solid ${typeColor}`,paddingLeft:8}}>
                      <td style={{fontWeight:600,color:typeColor}}>{t.type}</td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>{t.date}</td>
                      <td><span className="skucode" style={{fontSize:10}}>{t.sku}</span></td>
                      <td style={{fontSize:12}}>{p ? p.name : t.name || '—'}</td>
                      <td className="num" style={{fontWeight:600}}>{fmtN(t.qty)}</td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>{t.from || '—'}</td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>{t.to || '—'}</td>
                      <td style={{fontSize:11,color: t.status?.includes('สำเร็จ') ? 'var(--g-700)' : 'var(--muted)'}}>{t.status || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <style>{`
        .transfer-view { padding: 0; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LABEL PRINT — QR Code labels, 5×14 = 70 per A4
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// ORDERS — localStorage state helpers
// ─────────────────────────────────────────────────────────────────────
const LS_ORDERS_STATE   = "dmj_orders_state_v1";
const LS_PRINTED_ORDERS = "dmj_printed_orders_v1";
function getOrdersState()   { try { return JSON.parse(localStorage.getItem(LS_ORDERS_STATE)   || "{}"); } catch { return {}; } }
function getPrintedOrders() { try { return JSON.parse(localStorage.getItem(LS_PRINTED_ORDERS) || "{}"); } catch { return {}; } }
function patchOrderState(id, updates) {
  const s = getOrdersState(); s[id] = { ...(s[id]||{}), ...updates };
  // record when status was changed so we can detect ID collisions with new orders
  if ('status' in updates) s[id].markedAt = new Date().toISOString();
  localStorage.setItem(LS_ORDERS_STATE, JSON.stringify(s)); return s;
}
async function syncOrderUpdate(order, updates) {
  if (!SHEET_DEPLOY_URL) return;
  try {
    await fetch(SHEET_DEPLOY_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        status:      updates.status,
        preparedQty: updates.preparedQty,
        printFlag:   updates.printFlag,
        carryMode:   updates.carryMode,
      }),
    });
  } catch(e) { console.warn("syncOrderUpdate failed:", e.message); }
}

// ─────────────────────────────────────────────────────────────────────
// ORDER LIST VIEW
// ─────────────────────────────────────────────────────────────────────
function OrderItemRow({ order, onPatch, productMap }) {
  const isPending = !order.status || order.status === "รอ" || order.status === "pending";
  const [prepQty, setPrepQty] = uS(() => order.preparedQty > 0 ? order.preparedQty : (order.orderQty || 0));
  const [imgOpen, setImgOpen] = uS(false);
  const [toast, showToast, hideToast] = useToast();
  uE(() => {
    setPrepQty(prev => prev === 0 ? (order.orderQty || 0) : prev);
  }, [order.orderQty]);

  const savePrepQty = v => {
    const n = Math.max(0, parseInt(v)||0);
    setPrepQty(n);
    onPatch(order.id, {preparedQty: n});
    syncOrderUpdate(order, {preparedQty: n});
  };
  const setPrintFlag = f => {
    onPatch(order.id, {printFlag: f});
    syncOrderUpdate(order, {printFlag: f});
  };
  const setCarryMode = m => onPatch(order.id, {carryMode: m});
  const markComplete = () => {
    if (!order.printFlag) {
      showToast("warn", "เลือก PRINT หรือ SKIP ก่อน", "🖨️");
      return;
    }
    onPatch(order.id, { status: "สำเร็จ" });
    syncOrderUpdate(order, { status: "สำเร็จ" });
    showToast("success", "บันทึกแล้ว", "✅", 2500);
  };

  const pf = order.printFlag;
  // carryMode: ใช้จาก localStorage ก่อน ถ้าไม่มีดูจากข้อมูลใน sheet ถ้าไม่มีก็ default "truck"
  const cm = order.carryMode || "truck";
  const product = productMap ? productMap[order.sku] : null;
  const locs = product?.locations || [];
  const locStr = locs.length
    ? locs.map(l => `${l.side}${l.shelf}/${l.lock}`).join(", ")
    : null;

  return (
    <>
      <div className="order-item-row" style={{
        background:"#fff", borderRadius:12, marginBottom:8,
        border:`1.5px solid ${isPending?"var(--bdr)":"#4fb472"}`,
        overflow:"hidden", opacity: isPending ? 1 : 0.75,
      }}>
        {/* ── Row 1: image + info ── */}
        <div style={{display:"flex",gap:10,alignItems:"flex-start",padding:"12px 14px 8px"}}>
          {/* Thumbnail — clickable */}
          <div onClick={() => (order.image || product) && setImgOpen(true)}
            style={{
              width:54,height:54,borderRadius:8,flexShrink:0,overflow:"hidden",
              background:"var(--g-50)",cursor:(order.image||product)?"pointer":"default",
              border:"1px solid var(--bdr)",position:"relative",
            }}>
            {order.image
              ? <img src={order.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--muted)"}}>{I.package}</div>
            }
            {(order.image||product) && (
              <div style={{position:"absolute",bottom:2,right:2,background:"rgba(0,0,0,.45)",
                borderRadius:4,padding:"1px 4px",fontSize:8,color:"#fff",lineHeight:1.4}}>
                🔍
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}}>
              <span style={{fontSize:10,color:"var(--muted)"}}>{order.sku}</span>
              <span style={{
                fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
                background:isPending?"#fff8e1":"#e8f5e9",color:isPending?"#a07417":"#1f7f44",
                letterSpacing:.3,
              }}>{isPending?"🟡 รอ":"✅ Done"}</span>
            </div>
            <div style={{fontSize:14,fontWeight:600,lineHeight:1.3,marginBottom:2,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{order.name}</div>
            <div style={{fontSize:11,color:"var(--muted)"}}>
              {order.date}{order.from ? ` · ${order.from}` : ""}{order.to ? ` → ${order.to}` : ""}
            </div>
            {locStr && (
              <div style={{
                marginTop:4,display:"inline-flex",alignItems:"center",gap:4,
                background:"#eff6ff",borderRadius:6,padding:"2px 8px",fontSize:11,color:"#1e40af",fontWeight:600,
              }}>
                📍 {locStr}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: quantities + actions ── */}
        <div style={{
          display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
          padding:"8px 14px 12px",borderTop:"1px solid var(--g-50)",
          background:"var(--g-50)",
        }}>
          {/* Quantities */}
          <div style={{textAlign:"center",minWidth:44}}>
            <div style={{fontSize:10,color:"var(--muted)",marginBottom:1}}>📋 สั่ง</div>
            <div style={{fontSize:15,fontWeight:800,color:"var(--dang)"}}>{order.orderQty}</div>
          </div>

          {/* จัด — with +/- buttons (≥44px for mobile) */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
            <div style={{fontSize:10,color:"var(--muted)"}}>📦 จัด</div>
            <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",justifyContent:"center"}}>
              {[-10,-5,-1].map(d => (
                <button key={d} className="order-adj-btn" onClick={() => savePrepQty(prepQty+d)} disabled={!isPending}
                  style={{
                    minWidth:44,height:44,padding:"0 6px",borderRadius:8,border:"1.5px solid #ef9a9a",
                    background:"#fee2e2",color:"#c62828",fontWeight:800,fontSize:13,
                    cursor:isPending?"pointer":"default",fontFamily:"inherit",
                  }}>{d}</button>
              ))}
              <input type="number" value={prepQty} min={0} max={9999}
                onChange={e => savePrepQty(e.target.value)}
                disabled={!isPending}
                className="order-adj-input"
                style={{
                  width:64,height:44,textAlign:"center",borderRadius:8,
                  border:"2px solid var(--g-500)",fontSize:18,fontWeight:800,
                  background:isPending?"#f0fdf4":"var(--g-50)",fontFamily:"inherit",
                }}/>
              {[+1,+5,+10].map(d => (
                <button key={d} className="order-adj-btn" onClick={() => savePrepQty(prepQty+d)} disabled={!isPending}
                  style={{
                    minWidth:44,height:44,padding:"0 6px",borderRadius:8,border:"1.5px solid #81c784",
                    background:"#e8f5e9",color:"#1b5e20",fontWeight:800,fontSize:13,
                    cursor:isPending?"pointer":"default",fontFamily:"inherit",
                  }}>+{d}</button>
              ))}
            </div>
          </div>

          <div style={{textAlign:"center",minWidth:44}}>
            <div style={{fontSize:10,color:"var(--muted)",marginBottom:1}}>🔢 เหลือ</div>
            <div style={{fontSize:15,fontWeight:800}}>{order.remaining ?? "—"}</div>
          </div>

          <div style={{flex:1}}/>

          {/* QR toggle */}
          <button className="order-action-btn" title={pf==="print"?"Print ✓":pf==="no-print"?"Skip ✕":"Tap to set print"}
            onClick={() => { if(!pf) setPrintFlag("print"); else if(pf==="print") setPrintFlag("no-print"); else setPrintFlag("print"); }}
            style={{
              width:44,height:44,borderRadius:10,cursor:"pointer",padding:0,
              border:`2px solid ${pf==="print"?"#c62828":pf==="no-print"?"#111":"#d1d5db"}`,
              background:pf==="print"?"#ffebee":pf==="no-print"?"#222":"#fff",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
            }}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,4px)",gap:"1.5px"}}>
              {[1,1,0,1,0,1,0,1,1].map((b,i)=>(
                <div key={i} style={{width:4,height:4,borderRadius:1,
                  background:pf==="print"?"#c62828":pf==="no-print"?"#fff":b?"#9ca3af":"transparent"}}/>
              ))}
            </div>
            <div style={{fontSize:7,fontWeight:700,color:pf==="print"?"#c62828":pf==="no-print"?"#fff":"#9ca3af"}}>
              {pf==="print"?"PRINT":pf==="no-print"?"SKIP":"QR"}
            </div>
          </button>

          {/* Carry/Truck */}
          <button className="order-action-btn" onClick={() => setCarryMode(cm==="truck"?"carry":"truck")}
            style={{
              width:44,height:44,borderRadius:10,cursor:"pointer",
              border:"1.5px solid var(--bdr)",fontSize:22,
              background:cm==="truck"?"#eff6ff":cm==="carry"?"#f0fdf4":"#fff",
              display:"flex",alignItems:"center",justifyContent:"center",
            }}>
            {cm==="truck"?"🚛":"🚶"}
          </button>

          {/* Done */}
          {isPending && (
            <button onClick={markComplete} style={{
              padding:"10px 16px",borderRadius:10,border:"none",
              background:pf?"#1b5e20":"#d1d5db",color:"#fff",
              cursor:pf?"pointer":"not-allowed",fontSize:14,fontWeight:800,
              display:"flex",flexDirection:"column",alignItems:"center",gap:1,
              minWidth:52,
            }}>
              <span style={{fontSize:18}}>✅</span>
              <span style={{fontSize:10,letterSpacing:.3}}>Done</span>
            </button>
          )}
        </div>
      </div>

      {/* Image + location modal */}
      {imgOpen && (
        <div onClick={() => setImgOpen(false)} style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,.78)",
          display:"flex",alignItems:"center",justifyContent:"center",
          zIndex:1000,cursor:"pointer",padding:16,
        }}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:"#fff",borderRadius:16,padding:20,
            maxWidth:380,width:"100%",maxHeight:"90vh",overflow:"auto",
          }}>
            {order.image && (
              <img src={order.image} alt="" style={{width:"100%",borderRadius:10,marginBottom:14,display:"block"}}/>
            )}
            <div style={{fontWeight:700,fontSize:16,marginBottom:2}}>{order.name}</div>
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:10}}>{order.sku}</div>

            {locStr && (
              <div style={{
                display:"flex",alignItems:"center",gap:6,
                background:"#eff6ff",borderRadius:8,padding:"8px 12px",
                marginBottom:10,fontSize:13,fontWeight:700,color:"#1e40af",
              }}>
                📍 ตำแหน่ง: {locStr}
              </div>
            )}
            {product?.cat && (
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:6}}>หมวด: {product.cat}</div>
            )}
            <div style={{display:"flex",gap:16,fontSize:13,marginBottom:14}}>
              <span>สั่ง: <b>{order.orderQty}</b></span>
              <span>จัด: <b>{prepQty}</b></span>
              <span>เหลือ: <b>{order.remaining??"—"}</b></span>
            </div>
            <button onClick={() => setImgOpen(false)} style={{
              width:"100%",padding:"14px",background:"var(--g-700)",color:"#fff",
              border:"none",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:700,
              minHeight:48,
            }}>❌ ปิด</button>
          </div>
        </div>
      )}
      <Toast toast={toast} onClose={hideToast}/>
    </>
  );
}

// สร้าง stable ID จาก sku + date + qty ถ้าไม่มี id จาก sheet
function stableOrderId(o, i) {
  if (o.id) return String(o.id);
  const parts = [o.sku || '', String(o.date || '').replace(/\D/g,''), String(o.orderQty || 0)];
  return parts.join('_') || String(i);
}

function OrderListView({ data }) {
  const orders = data.orders || [];
  const [filter, setFilter] = uS("all");
  const [st, setSt] = uS(getOrdersState);
  const productMap = uM(() => { const m={}; (data.products||[]).forEach(p=>m[p.sku]=p); return m; }, [data.products]);

  const enriched = uM(() => {
    const DONE_ST = new Set(["สำเร็จ","completed","ส่งแล้ว","shipped"]);
    return orders.map((o, i) => {
      const id = stableOrderId(o, i);
      const local = st[id] || {};
      // Guard: sheet says "รอ" but localStorage says a terminal status.
      // Only keep localStorage if we can positively confirm it's the SAME order
      // (order date ≤ markedAt). Otherwise trust the sheet — new order / ID collision.
      const sheetPending = !o.status || o.status === "รอ" || o.status === "pending";
      if (sheetPending && DONE_ST.has(local.status)) {
        let keepLocal = false;
        if (local.markedAt && o.date) {
          const orderMs  = new Date(o.date).getTime();
          const markedMs = new Date(local.markedAt).getTime();
          keepLocal = !isNaN(orderMs) && !isNaN(markedMs) && orderMs <= markedMs;
        }
        if (!keepLocal) {
          // strip all terminal-state fields → show as pending
          const { status:_s, markedAt:_m, shipped:_sh, ...rest } = local;
          return { ...o, id, ...rest };
        }
      }
      return { ...o, id, ...local };
    });
  }, [orders, st]);

  const sorted = uM(() => [...enriched].sort((a,b) => {
    const aP = !a.status||a.status==="รอ"||a.status==="pending";
    const bP = !b.status||b.status==="รอ"||b.status==="pending";
    return (aP&&!bP)?-1:(!aP&&bP)?1:0;
  }), [enriched]);

  const isShippedOut = o => o.status === "ส่งแล้ว" || o.status === "shipped";
  const filtered = uM(() => {
    const base = sorted.filter(o => !isShippedOut(o)); // ส่งแล้ว → ออกจากรายการนี้ทันที
    if (filter==="pending")   return base.filter(o => !o.status||o.status==="รอ"||o.status==="pending");
    if (filter==="completed") return base.filter(o => o.status==="สำเร็จ"||o.status==="completed");
    return base;
  }, [sorted, filter]);

  const patch = (id, updates) => setSt(patchOrderState(id, updates));

  const pendingCount = sorted.filter(o => !o.status||o.status==="รอ"||o.status==="pending").length;

  if (!orders.length) return (
    <div style={{padding:"60px 20px",textAlign:"center"}}>
      <Empty icon={I.cart} title="ยังไม่มีรายการสั่งของ"
        sub="เพิ่มข้อมูลใน Google Sheet 'ลำดับที่สั่งซื้อ' แล้วกด Sync"/>
    </div>
  );

  return (
    <div>
      <div className="page-head no-print">
        <div>
          <div className="page-title">📋 รายการสั่งของ</div>
          <div className="page-sub">📦 {orders.length} รายการ · 🟡 {pendingCount} รอดำเนินการ</div>
        </div>
        <Seg value={filter} onChange={setFilter} options={[
          {value:"all",     label:"🗂️ ทั้งหมด"},
          {value:"pending", label:"🟡 รอ"},
          {value:"completed",label:"✅ สำเร็จ"},
        ]}/>
      </div>

      {filtered.length === 0 ? (
        <div style={{padding:"40px 20px"}}>
          <Empty title="ไม่มีรายการใน filter นี้" sub="ลองเลือก filter อื่น"/>
        </div>
      ) : (
        filtered.map(order => <OrderItemRow key={order.id} order={order} onPatch={patch} productMap={productMap}/>)
      )}
    </div>
  );
}

// ─── deduct stock from sheet ───
async function syncStockDeduct(sku, qty) {
  if (!SHEET_DEPLOY_URL) { console.warn("SHEET_DEPLOY_URL not set"); return { success: false }; }
  try {
    await fetch(SHEET_DEPLOY_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transferStock: true, sku, qty }),
    });
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

const LS_SHIPPED_ORDERS = "dmj_shipped_orders_v1";
const LS_MISSED_TRUCK   = "dmj_missed_truck_v1";
function getShippedOrders() { try { return JSON.parse(localStorage.getItem(LS_SHIPPED_ORDERS)||"{}"); } catch { return {}; } }
function getMissedOrders()  { try { return JSON.parse(localStorage.getItem(LS_MISSED_TRUCK)  ||"{}"); } catch { return {}; } }

// ─────────────────────────────────────────────────────────────────────
// ORDER SUMMARY VIEW
// ─────────────────────────────────────────────────────────────────────
function OrderSummaryView({ data, onPrintRequest }) {
  const orders   = data.orders   || [];
  const products = data.products || [];
  const [st, setSt]           = uS(getOrdersState);
  const [printed, setPrinted] = uS(getPrintedOrders);
  const [shipped, setShipped] = uS(getShippedOrders);
  const [missed,  setMissed]  = uS(getMissedOrders);
  const [sending, setSending] = uS(null);
  const [bigImg, setBigImg]   = uS(null);
  const [toast, showToast, hideToast] = useToast();
  const [shipConfirm, setShipConfirm]    = uS(null); // single order
  const [shipAllConfirm, setShipAllConfirm] = uS(null); // ready[] array

  const productMap = uM(() => { const m={}; products.forEach(p => m[p.sku]=p); return m; }, [products]);

  const enriched = uM(() => {
    const DONE_ST = new Set(["สำเร็จ","completed","ส่งแล้ว","shipped"]);
    return orders.map((o, i) => {
      const id = stableOrderId(o, i);
      const local = st[id] || {};
      const sheetPending = !o.status || o.status === "รอ" || o.status === "pending";
      if (sheetPending && DONE_ST.has(local.status)) {
        let keepLocal = false;
        if (local.markedAt && o.date) {
          const orderMs  = new Date(o.date).getTime();
          const markedMs = new Date(local.markedAt).getTime();
          keepLocal = !isNaN(orderMs) && !isNaN(markedMs) && orderMs <= markedMs;
        }
        if (!keepLocal) {
          const { status:_s, markedAt:_m, shipped:_sh, ...rest } = local;
          return { ...o, id, ...rest, product: productMap[o.sku] };
        }
      }
      return { ...o, id, ...local, product: productMap[o.sku] };
    });
  }, [orders, st, productMap]);

  // แสดงเฉพาะที่กด Done แล้ว
  const isDone = o => o.status === "สำเร็จ" || o.status === "completed" || o.status === "done";
  const doneOrders = uM(() => enriched.filter(isDone), [enriched]);

  // แยกกลุ่ม: หิ้วก่อน, รถหลัง
  const carryOrders = uM(() => doneOrders.filter(o => o.carryMode === "carry"), [doneOrders]);
  const truckOrders = uM(() => doneOrders.filter(o => o.carryMode !== "carry"), [doneOrders]);

  const handlePrint = (order) => {
    const qty = order.preparedQty || order.orderQty || 1;
    onPrintRequest([{ sku: order.sku, qty }]);
    const p2 = { ...printed, [order.id]: true };
    setPrinted(p2);
    localStorage.setItem(LS_PRINTED_ORDERS, JSON.stringify(p2));
  };

  const handleShip = (order) => setShipConfirm(order);
  const doShip = async () => {
    const order = shipConfirm;
    setShipConfirm(null);
    if (!order) return;
    const qty = order.preparedQty || order.orderQty || 0;
    setSending(order.id);
    await syncStockDeduct(order.sku, qty);
    try {
      await fetch(SHEET_DEPLOY_URL, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteOrder: true, orderId: order.id }),
      });
    } catch(e) { console.warn("deleteOrder failed:", e.message); }
    setSending(null);
    const next = { ...shipped, [order.id]: true };
    setShipped(next);
    localStorage.setItem(LS_SHIPPED_ORDERS, JSON.stringify(next));
    setSt(patchOrderState(order.id, { status: "ส่งแล้ว" }));
    showToast("success", `ส่ง ${qty} ชิ้นแล้ว`, "📦");
  };

  const toggleMissed = (order) => {
    const next = { ...missed };
    if (next[order.id]) delete next[order.id];
    else next[order.id] = true;
    setMissed(next);
    localStorage.setItem(LS_MISSED_TRUCK, JSON.stringify(next));
  };

  // ship all ready (not missed, not already shipped) in a group
  const handleShipAll = (orders) => {
    const ready = orders.filter(o => !shipped[o.id] && !missed[o.id]);
    if (!ready.length) return;
    setShipAllConfirm(ready);
  };
  const doShipAll = async () => {
    const ready = shipAllConfirm;
    setShipAllConfirm(null);
    if (!ready || !ready.length) return;
    const nextShipped = { ...shipped };
    let nextSt = getOrdersState();
    for (const order of ready) {
      setSending(order.id);
      const qty = order.preparedQty || order.orderQty || 0;
      await syncStockDeduct(order.sku, qty);
      nextShipped[order.id] = true;
      // อัพเดท shared state ให้ OrderListView เห็นด้วย
      nextSt[order.id] = { ...(nextSt[order.id]||{}), status: "ส่งแล้ว" };
      syncOrderUpdate(order, { shipped: true, status: "ส่งแล้ว" });
    }
    setSending(null);
    setShipped(nextShipped);
    localStorage.setItem(LS_SHIPPED_ORDERS, JSON.stringify(nextShipped));
    localStorage.setItem(LS_ORDERS_STATE, JSON.stringify(nextSt));
    setSt(nextSt);
    showToast("success", `ส่ง ${ready.length} รายการแล้ว`, "📦");
  };

  if (!orders.length) return (
    <div style={{padding:"60px 20px",textAlign:"center"}}>
      <Empty icon={I.store} title="ยังไม่มีรายการสั่งของ"
        sub="เพิ่มข้อมูลใน Google Sheet 'ลำดับที่สั่งซื้อ' แล้วกด Sync"/>
    </div>
  );

  if (!doneOrders.length) return (
    <div style={{padding:"60px 20px",textAlign:"center"}}>
      <Empty icon={I.package} title="ยังไม่มีสินค้าพร้อมออกจากคลัง"
        sub="กลับไปหน้า 'รายการสั่งของ' → หยิบของ → กด Done แล้วค่อยกลับมาที่นี่"/>
    </div>
  );

  // render group section
  const renderSection = (label, emoji, orders, isTruck) => {
    if (!orders.length) return null;
    const readyCount = orders.filter(o => !shipped[o.id] && !missed[o.id]).length;
    // sort: not-shipped-not-missed first, missed to end, shipped to very end
    const sorted = [...orders].sort((a,b) => {
      const aS = shipped[a.id] ? 2 : missed[a.id] ? 1 : 0;
      const bS = shipped[b.id] ? 2 : missed[b.id] ? 1 : 0;
      return aS - bS;
    });
    return (
      <div style={{marginBottom:28}}>
        {/* Section header */}
        <div style={{
          display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,
          padding:"8px 14px",background: isTruck ? "#eff6ff" : "#f0fdf4",
          borderRadius:10,marginBottom:12,
          border:`1.5px solid ${isTruck?"#bfdbfe":"#bbf7d0"}`,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>{emoji}</span>
            <span style={{fontWeight:700,fontSize:14,color: isTruck?"#1d4ed8":"var(--g-700)"}}>
              {label}
            </span>
            <span style={{fontSize:12,color:"var(--muted)"}}>
              {readyCount > 0 ? `${readyCount} รายการรอส่ง` : "ส่งหมดแล้ว"}
            </span>
          </div>
          {readyCount > 0 && (
            <button onClick={() => handleShipAll(orders)} style={{
              padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",
              background: isTruck?"#1d4ed8":"var(--g-700)",color:"#fff",
              fontSize:12,fontWeight:700,fontFamily:"inherit",
            }}>
              ✅ ส่งทั้งหมด ({readyCount})
            </button>
          )}
        </div>

        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fill, minmax(185px, 1fr))",
          gap:12,
        }}>
          {sorted.map(order => {
            const isShipped = !!shipped[order.id];
            const isMissed  = !!missed[order.id];
            const isSending = sending === order.id;
            const alreadyPrinted = printed[order.id];
            const prepQty = order.preparedQty || order.orderQty || 0;

            return (
              <div key={order.id} style={{
                background: isShipped ? "#f0fdf4" : isMissed ? "#fef2f2" : "#fff",
                borderRadius:12, padding:12,
                border:`1.5px solid ${isShipped?"#4fb472":isMissed?"#fca5a5":"var(--bdr)"}`,
                display:"flex",flexDirection:"column",gap:8,
                opacity: isShipped ? 0.7 : 1,
                transition:"all .2s",
              }}>
                {/* Image */}
                <div style={{position:"relative"}}>
                  {order.image ? (
                    <img src={order.image} alt=""
                      onClick={() => setBigImg(order)}
                      style={{width:"100%",height:88,objectFit:"contain",
                              borderRadius:8,cursor:"pointer",display:"block",
                              background:"var(--g-50)"}}/>
                  ) : (
                    <div onClick={() => setBigImg(order)}
                      style={{width:"100%",height:88,background:"var(--g-50)",borderRadius:8,
                              display:"flex",alignItems:"center",justifyContent:"center",
                              color:"var(--muted)",cursor:"pointer"}}>{I.package}</div>
                  )}
                  {/* Status badge */}
                  {isShipped && (
                    <div style={{position:"absolute",top:4,right:4,
                      background:"#1f7f44",color:"#fff",borderRadius:20,
                      fontSize:9,fontWeight:700,padding:"2px 6px"}}>✅ ส่งแล้ว</div>
                  )}
                  {isMissed && !isShipped && (
                    <div style={{position:"absolute",top:4,right:4,
                      background:"#ef4444",color:"#fff",borderRadius:20,
                      fontSize:9,fontWeight:700,padding:"2px 6px"}}>🚫 ไม่ขึ้น</div>
                  )}
                </div>

                {/* Info */}
                <div>
                  <div style={{fontSize:10,color:"var(--muted)"}}>{order.sku} · {order.date}</div>
                  <div style={{fontSize:13,fontWeight:600,lineHeight:1.3}}>{order.name}</div>
                </div>

                {/* Qty pills */}
                <div style={{display:"flex",gap:4}}>
                  {[["สั่ง",order.orderQty,"#fee2e2","var(--dang)"],
                    ["จัด",prepQty,"#e8f5e9","var(--g-700)"],
                    ["เหลือ",order.remaining??"—","var(--g-50)","var(--text)"]
                  ].map(([lbl,val,bg,col]) => (
                    <div key={lbl} style={{flex:1,textAlign:"center",background:bg,borderRadius:6,padding:"4px 2px"}}>
                      <div style={{fontSize:9,color:"var(--muted)"}}>{lbl}</div>
                      <div style={{fontSize:13,fontWeight:700,color:col}}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                {!isShipped && (
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:2}}>
                    {/* Print Label */}
                    {order.printFlag==="print" && !alreadyPrinted && (
                      <button onClick={() => handlePrint(order)} style={{
                        padding:"6px",borderRadius:7,border:"none",cursor:"pointer",
                        background:"var(--g-700)",color:"#fff",fontSize:11,fontWeight:700,fontFamily:"inherit",
                      }}>🖨️ Print Label</button>
                    )}
                    {alreadyPrinted && (
                      <div style={{textAlign:"center",fontSize:10,color:"var(--g-700)",fontWeight:700}}>✓ Printed</div>
                    )}

                    {/* Ship + Missed row */}
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={() => handleShip(order)} disabled={isSending || isMissed}
                        style={{
                          flex:1,padding:"7px 4px",borderRadius:7,border:"none",
                          background: isMissed?"var(--g-100)":"var(--g-700)",
                          color: isMissed?"var(--muted)":"#fff",
                          fontSize:11,fontWeight:700,cursor:isMissed?"not-allowed":"pointer",
                          fontFamily:"inherit",opacity:isSending?0.6:1,
                        }}>
                        {isSending ? "⏳..." : "✅ ส่งแล้ว"}
                      </button>
                      {isTruck && (
                        <button onClick={() => toggleMissed(order)}
                          title={isMissed?"ยกเลิก - ใส่คืนในรถ":"รถเต็ม - ไม่ได้ขึ้น"}
                          style={{
                            width:34,borderRadius:7,
                            border:`1.5px solid ${isMissed?"#ef4444":"var(--bdr)"}`,
                            background:isMissed?"#fee2e2":"#fff",
                            color:isMissed?"#ef4444":"var(--muted)",
                            cursor:"pointer",fontSize:14,fontFamily:"inherit",
                          }}>
                          🚫
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* "Missed truck" sub-section summary */}
        {isTruck && orders.some(o => missed[o.id] && !shipped[o.id]) && (
          <div style={{
            marginTop:14,padding:"10px 14px",background:"#fef2f2",
            borderRadius:8,border:"1px solid #fca5a5",fontSize:12,
          }}>
            <b style={{color:"#ef4444"}}>🚫 ไม่ได้ขึ้นรถ ({orders.filter(o=>missed[o.id]&&!shipped[o.id]).length} รายการ)</b>
            <span style={{color:"var(--muted)",marginLeft:8}}>— กด 🚫 อีกครั้งเพื่อยกเลิกและส่งได้</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="page-head no-print">
        <div>
          <div className="page-title">สรุปสินค้าออกจากคลัง</div>
          <div className="page-sub">
            สินค้าที่จัดเสร็จแล้ว · {doneOrders.length} รายการ
            {Object.keys(shipped).length > 0 && ` · ส่งแล้ว ${Object.keys(shipped).filter(id=>doneOrders.find(o=>o.id===id)).length} รายการ`}
          </div>
        </div>
      </div>

      {renderSection("หิ้วเอง", "🚶", carryOrders, false)}
      {renderSection("ขึ้นรถ",  "🚛", truckOrders, true)}

      {/* Expanded image modal */}
      {bigImg && (
        <div onClick={() => setBigImg(null)} style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,.78)",
          display:"flex",alignItems:"center",justifyContent:"center",
          zIndex:1000,cursor:"pointer",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:"#fff",borderRadius:16,padding:20,
            maxWidth:380,width:"90%",maxHeight:"90vh",overflow:"auto",
          }}>
            {bigImg.image && (
              <img src={bigImg.image} alt=""
                style={{width:"100%",borderRadius:10,marginBottom:12,display:"block"}}/>
            )}
            <div style={{fontWeight:700,fontSize:16,marginBottom:2}}>{bigImg.name}</div>
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:10}}>{bigImg.sku}</div>
            <div style={{display:"flex",gap:16,fontSize:13,marginBottom:10}}>
              <span>สั่ง: <b>{bigImg.orderQty}</b></span>
              <span>จัด: <b>{bigImg.preparedQty||0}</b></span>
              <span>เหลือ: <b>{bigImg.remaining??"—"}</b></span>
            </div>
            {bigImg.product && (
              <div style={{fontSize:12,color:"var(--muted)",borderTop:"1px solid var(--bdr)",paddingTop:10}}>
                {bigImg.product.cat && <div>หมวดหมู่: {bigImg.product.cat}</div>}
                {bigImg.product.price>0 && <div>ราคา: {bigImg.product.price} ฿</div>}
              </div>
            )}
            <button onClick={() => setBigImg(null)} style={{
              marginTop:14,width:"100%",padding:"14px",
              background:"var(--g-700)",color:"#fff",border:"none",
              borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:700,
              minHeight:48,
            }}>❌ ปิด</button>
          </div>
        </div>
      )}
      <ConfirmModal
        open={!!shipConfirm}
        type="ship"
        emoji="📦"
        title="ยืนยันส่งสินค้า"
        detail={shipConfirm ? `${shipConfirm.name}\n\n📦 ${shipConfirm.preparedQty || shipConfirm.orderQty || 0} ชิ้น\n\n🏭 → 🏪 (คลัง → ร้าน)\n🗑️ ลบจากรายการสั่ง` : ""}
        confirmLabel="ส่ง"
        onConfirm={doShip}
        onCancel={() => setShipConfirm(null)}
      />
      <ConfirmModal
        open={!!shipAllConfirm}
        type="ship"
        emoji="📦"
        title="ยืนยันส่งสินค้าทั้งหมด"
        detail={shipAllConfirm ? `📦 ${shipAllConfirm.length} รายการ\n\n🏭 → 🏪 (คลัง → ร้าน)` : ""}
        confirmLabel={`ส่งทั้งหมด`}
        onConfirm={doShipAll}
        onCancel={() => setShipAllConfirm(null)}
      />
      <Toast toast={toast} onClose={hideToast}/>
    </div>
  );
}

// Fallback SVG logo if logo.png not found
const LOGO_FALLBACK_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="47" fill="none" stroke="%231f7f44" stroke-width="3"/>
  <circle cx="50" cy="50" r="41" fill="none" stroke="%231f7f44" stroke-width="1"/>
  <text x="50" y="38" font-family="serif" font-size="11" font-weight="bold" fill="%231f7f44" text-anchor="middle">Doo</text>
  <text x="50" y="52" font-family="serif" font-size="10" fill="%231f7f44" text-anchor="middle">Muenjing</text>
  <text x="50" y="64" font-family="sans-serif" font-size="7" fill="%231f7f44" text-anchor="middle">ดูเหมือนจริง</text>
  <text x="50" y="76" font-family="sans-serif" font-size="5.5" fill="%231f7f44" text-anchor="middle">EST.2003</text>
</svg>`)}`;

function LabelPrintView({ data, initItems, onInitConsumed }) {
  const { products } = data;
  const [items, setItems] = uS([]);
  const [printMode, setPrintMode] = uS("a4"); // "a4" | "sticker"

  // Auto-populate from order summary "Print Label" button
  uE(() => {
    if (!initItems || !initItems.length) return;
    setItems(initItems.map(it => ({ sku: it.sku, qty: it.qty })));
    if (onInitConsumed) onInitConsumed();
  }, [initItems]);
  const [searchVal, setSearchVal] = uS("");
  const [qtyVal, setQtyVal] = uS("1");
  const [qrMap, setQrMap] = uS({});
  const [logoSrc, setLogoSrc] = uS("logo.png");

  const productMap = uM(() => {
    const m = {};
    products.forEach(p => { m[p.sku] = p; });
    return m;
  }, [products]);

  // Generate QR codes using qrcodejs (synchronous DOM-based)
  const doGenerate = uC((skus) => {
    if (!skus.length) return;
    const QR = window.QRCode;
    if (!QR) { console.warn("qrcodejs not loaded"); return; }

    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none";
    document.body.appendChild(wrap);

    const results = {};
    skus.forEach(sku => {
      const el = document.createElement("div");
      wrap.appendChild(el);
      try {
        new QR(el, {
          text: sku, width: 80, height: 80,
          colorDark: "#000000", colorLight: "#ffffff",
          correctLevel: QR.CorrectLevel.M,
        });
        const canvas = el.querySelector("canvas");
        if (canvas) results[sku] = canvas.toDataURL("image/png");
      } catch(e) { console.warn("QR error:", sku, e); }
    });

    document.body.removeChild(wrap);
    if (Object.keys(results).length) {
      setQrMap(prev => ({ ...prev, ...results }));
    }
  }, []);

  uE(() => {
    const pending = items.map(i => i.sku).filter(s => !qrMap[s]);
    if (!pending.length) return;
    // slight delay ensures qrcodejs is ready after page load
    const t = setTimeout(() => doGenerate(pending), 80);
    return () => clearTimeout(t);
  }, [items, doGenerate]);

  // Expand items to exact label list (no padding)
  const labelList = uM(() => {
    const flat = [];
    items.forEach(item => {
      const p = productMap[item.sku];
      if (!p) return;
      for (let i = 0; i < item.qty; i++) flat.push(p);
    });
    return flat;
  }, [items, productMap]);

  // 70 labels per A4 page (5 cols × 14 rows)
  const pages = uM(() => {
    const ps = [];
    for (let i = 0; i < labelList.length; i += 70) ps.push(labelList.slice(i, i + 70));
    return ps;
  }, [labelList]);

  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  // Safely escape HTML entities to prevent XSS in popup
  const escHtml = (s) => String(s || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

  // Print sticker labels in a popup window (50mm thermal printer, single column, gap 3mm)
  const printVaseLabels = uC(() => {
    if (!labelList.length) return;

    const labelsHTML = labelList.map(p => {
      const qrImg = qrMap[p.sku]
        ? `<img src="${qrMap[p.sku]}" style="width:100%;height:100%;display:block;"/>`
        : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:5px;color:#aaa;">QR</div>`;
      const priceStr = p.price != null && p.price > 0 ? `${escHtml(String(p.price))} ฿` : "";
      return `
      <div class="lbl">
        <div class="ltop">
          <span class="lname">${escHtml(p.name)}</span>
          ${priceStr ? `<span class="lprice">${priceStr}</span>` : ""}
        </div>
        <div class="lmid">
          <div class="lqr">${qrImg}</div>
          <img src="${logoSrc}" class="llogo" onerror="this.style.display='none'"/>
        </div>
        <div class="lsku">${p.sku}</div>
      </div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Kanit","Noto Sans Thai",sans-serif; background:#f0f0f0; padding:16px; }
  .print-btn {
    display:block; margin:0 auto 16px; padding:10px 32px;
    background:#1f7f44; color:#fff; border:none; border-radius:8px;
    font-size:16px; font-weight:700; cursor:pointer; font-family:inherit;
  }
  .print-btn:hover { background:#176035; }
  /* Screen: readable card size */
  .lbl {
    width:300px; height:150px; box-sizing:border-box;
    display:flex; flex-direction:column;
    padding:9px 12px; overflow:hidden;
    background:#fff; border-radius:6px;
    box-shadow:0 1px 4px rgba(0,0,0,.12);
    margin:0 auto 9px;
  }
  .ltop { display:flex; justify-content:space-between; align-items:flex-start; gap:6px; flex-shrink:0; margin-bottom:4px; }
  .lname { font-size:13px; font-weight:700; color:#111; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .lprice { font-size:13px; font-weight:700; color:#111; white-space:nowrap; }
  .lmid { flex:1; position:relative; display:flex; align-items:center; justify-content:center; }
  .lqr { width:78px; height:78px; }
  .llogo { position:absolute; bottom:0; right:0; width:36px; height:36px; object-fit:contain; opacity:.65; }
  .lsku { font-size:11px; font-family:"Kanit",sans-serif; font-weight:500; color:#333; text-align:center; letter-spacing:0.5px; flex-shrink:0; }
  /* Print: 50×25mm */
  @media print {
    @page { size: 50mm 25mm; margin: 0; }
    body { background:#fff; padding:0; }
    .print-btn { display:none; }
    .lbl {
      width:50mm; height:25mm; border-radius:0;
      padding:1.5mm 2mm; box-shadow:none; margin:0 0 3mm;
      page-break-after:always;
    }
    .lbl:last-child { page-break-after:avoid; margin-bottom:0; }
    .ltop { margin-bottom:0; gap:1mm; }
    .lname { font-size:6.5pt; }
    .lprice { font-size:6.5pt; }
    .lqr { width:13mm; height:13mm; }
    .llogo { width:8mm; height:8mm; }
    .lsku { font-size:5pt; }
  }
</style>
</head><body>
<button class="print-btn" onclick="window.print()">🖨️ พิมพ์ ${labelList.length} ใบ</button>
${labelsHTML}
</body></html>`;

    const win = window.open("", "_blank", "width=520,height=700");
    if (!win) {
      // Popup blocked — show toast instead of alert
      if (window.__dmjToast) window.__dmjToast({ type:"warn", message:"🔒 Browser บล็อก Pop-up — กด Allow ใน address bar แล้วลองใหม่" });
      else alert("กรุณาอนุญาต Pop-up ใน address bar แล้วลองใหม่");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus(); // bring popup to front
  }, [labelList, qrMap, logoSrc]);

  const addItem = () => {
    const raw = searchVal.trim();
    const sku = raw.includes(" — ") ? raw.split(" — ")[0].trim() : raw.toUpperCase().trim();
    const qty = Math.min(700, Math.max(1, parseInt(qtyVal) || 1)); // clamp 1–700
    if (!sku || !productMap[sku]) return;
    setItems(prev => {
      const ex = prev.find(i => i.sku === sku);
      if (ex) return prev.map(i => i.sku === sku ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { sku, qty }];
    });
    setSearchVal("");
    setQtyVal("1");
  };

  const removeItem = sku => setItems(prev => prev.filter(i => i.sku !== sku));
  const updateQty  = (sku, qty) => setItems(prev => prev.map(i => i.sku === sku ? { ...i, qty: Math.min(700, Math.max(1, qty || 1)) } : i));

  return (
    <div>
      {/* ── Controls (hidden on print) ── */}
      <div className="no-print">
        <div className="page-head">
          <div>
            <div className="page-title">พิมพ์ Label สินค้า</div>
            <div className="page-sub">
              {printMode === "a4"
                ? "A4 · 5 คอลัมน์ · 70 ใบ/หน้า"
                : "สติ๊กเกอร์ · 50×25mm · gap 3mm · แถวเดียว"}
            </div>
          </div>
          {labelList.length > 0 && (
            <div className="page-actions">
              {printMode === "a4" ? (
                <button className="btn primary" onClick={() => window.print()}
                        style={{padding:"10px 20px",fontWeight:700,fontSize:14}}>
                  🖨️ พิมพ์ {labelList.length} ใบ ({pages.length} หน้า A4)
                </button>
              ) : (
                <button className="btn primary" onClick={printVaseLabels}
                        style={{padding:"10px 20px",fontWeight:700,fontSize:14}}>
                  🖨️ พิมพ์ {labelList.length} ใบ (Sticker)
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Print mode toggle ── */}
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {[
            {id:"a4",      label:"📄 A4",       sub:"42×21mm · 70/หน้า"},
            {id:"sticker", label:"🏷️ สติ๊กเกอร์", sub:"50×25mm · แถวเดียว"},
          ].map(m => (
            <button key={m.id} onClick={() => setPrintMode(m.id)} style={{
              padding:"8px 14px", borderRadius:10, cursor:"pointer", fontFamily:"inherit",
              border: printMode===m.id ? "2px solid var(--accent)" : "1.5px solid var(--bdr)",
              background: printMode===m.id ? "#e8f5e9" : "var(--paper)",
              fontWeight: printMode===m.id ? 700 : 500, fontSize:13,
              color: printMode===m.id ? "var(--accent)" : "var(--text)",
              display:"flex", flexDirection:"column", alignItems:"flex-start", gap:1,
            }}>
              <span>{m.label}</span>
              <span style={{fontSize:10,color:"var(--muted)",fontWeight:400}}>{m.sub}</span>
            </button>
          ))}
        </div>

        {/* Add product row */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14,alignItems:"flex-end"}}>
          <div style={{flex:1,minWidth:220}}>
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:4,fontWeight:600}}>ค้นหาสินค้า / พิมพ์ SKU โดยตรง</div>
            <input list="lbl-sku-list" value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addItem()}
              placeholder="เช่น HL00170 หรือ ชื่อสินค้า..."
              style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1.5px solid var(--bdr)",
                      fontFamily:"inherit",fontSize:13,boxSizing:"border-box"}}/>
            <datalist id="lbl-sku-list">
              {products.map(p => <option key={p.sku} value={`${p.sku} — ${p.name}`}/>)}
            </datalist>
          </div>
          <div>
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:4,fontWeight:600}}>จำนวนใบ</div>
            <input type="number" value={qtyVal} min={1} max={700}
              onChange={e => setQtyVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addItem()}
              style={{width:90,padding:"9px 12px",borderRadius:8,border:"1.5px solid var(--bdr)",
                      fontFamily:"inherit",fontSize:13}}/>
          </div>
          <button className="btn primary" onClick={addItem}
                  style={{padding:"9px 18px",fontWeight:700}}>+ เพิ่ม</button>
          <ScanButton size={40} continuous
            style={{alignSelf:"flex-end",borderRadius:8}}
            onScan={sku => {
              if (!productMap[sku]) return;
              const qty = Math.max(1, parseInt(qtyVal) || 1);
              setItems(prev => {
                const ex = prev.find(i => i.sku === sku);
                if (ex) return prev.map(i => i.sku===sku ? {...i, qty:i.qty+qty} : i);
                return [...prev, { sku, qty }];
              });
            }}/>
        </div>

        {/* Items list */}
        {items.length > 0 ? (
          <div style={{background:"var(--g-50)",borderRadius:12,padding:"10px 14px",marginBottom:14,border:"1px solid var(--bdr)"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",marginBottom:8,textTransform:"uppercase",letterSpacing:".06em"}}>
              รายการที่จะพิมพ์
            </div>
            {items.map(item => {
              const p = productMap[item.sku];
              return (
                <div key={item.sku} style={{display:"flex",alignItems:"center",gap:10,
                     padding:"7px 0",borderBottom:"1px solid var(--bdr)"}}>
                  <span className="skucode" style={{fontSize:11,minWidth:80}}>{item.sku}</span>
                  <span style={{flex:1,fontSize:12,color:"var(--text)"}}>{p?.name || "—"}</span>
                  <span style={{fontSize:12,color:"var(--g-700)",fontWeight:700,minWidth:60,textAlign:"right"}}>
                    {p?.price && sessionStorage.getItem("dmj_role") === "owner" ? `${p.price} ฿` : ""}
                  </span>
                  <input type="number" value={item.qty} min={1} max={700}
                    onChange={e => updateQty(item.sku, parseInt(e.target.value) || 1)}
                    style={{width:70,padding:"4px 8px",borderRadius:6,border:"1.5px solid var(--bdr)",
                            fontFamily:"inherit",fontSize:12,textAlign:"center"}}/>
                  <span style={{fontSize:11,color:"var(--muted)",minWidth:28}}>ใบ</span>
                  <button onClick={() => removeItem(item.sku)}
                    style={{background:"none",border:"none",cursor:"pointer",color:"var(--dang)",
                            fontSize:18,padding:"4px 8px",fontWeight:700,
                            minWidth:36,height:36,borderRadius:6}}>×</button>
                </div>
              );
            })}
            <div style={{marginTop:10,display:"flex",gap:16,fontSize:12,color:"var(--muted)",flexWrap:"wrap"}}>
              <span>รวม <b style={{color:"var(--g-700)"}}>{totalQty}</b> ใบ</span>
              {printMode === "a4" && <>
                <span>= <b style={{color:"var(--g-700)"}}>{pages.length}</b> หน้า A4</span>
                {totalQty % 70 !== 0 && pages.length > 0 && (
                  <span>(หน้าสุดท้ายมี <b style={{color:"var(--g-700)"}}>{totalQty - (pages.length-1)*70}</b> ใบ)</span>
                )}
              </>}
            </div>
          </div>
        ) : (
          <div style={{textAlign:"center",padding:"40px 20px",color:"var(--muted)",
                       background:"var(--g-50)",borderRadius:12,border:"1.5px dashed var(--bdr)",marginBottom:14}}>
            <div style={{fontSize:28,marginBottom:8}}>🏷️</div>
            <div style={{fontWeight:700,marginBottom:4}}>ยังไม่มีสินค้า</div>
            <div style={{fontSize:12}}>ค้นหาสินค้าหรือพิมพ์ SKU ด้านบน แล้วกด Enter หรือ "+ เพิ่ม"</div>
          </div>
        )}

        {labelList.length > 0 && (
          <div style={{fontSize:12,color:"var(--muted)",marginBottom:12,padding:"8px 12px",
                       background:"#fff8e1",borderRadius:8,border:"1px solid #f59e0b"}}>
            💡 ตัวอย่างด้านล่างคือ preview · กด <b>🖨️ พิมพ์</b> เพื่อส่งไปปริ้นเตอร์
          </div>
        )}
      </div>

      {/* ── Preview area — switches by printMode ── */}
      {printMode === "a4" ? (
        /* A4 pages (visible on print too) */
        pages.map((page, pi) => (
          <div key={pi} className="label-page">
            <div className="label-grid">
              {page.map((p, i) => (
                <div key={i} className="label-cell">
                  <div className="label-top-row">
                    <span className="label-name">{p.name}</span>
                    <span className="label-price">{p.price != null && p.price > 0 ? `${p.price} ฿` : ""}</span>
                  </div>
                  <div className="label-mid-row">
                    <div className="label-qr-center" style={{width:"10mm",height:"10mm"}}>
                      {qrMap[p.sku]
                        ? <img src={qrMap[p.sku]} alt={p.sku} style={{width:"100%",height:"100%",objectFit:"contain"}}/>
                        : <div style={{width:"100%",height:"100%",background:"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:5,color:"#aaa"}}>QR</div>
                      }
                    </div>
                    <div className="label-logo-corner">
                      <img src={logoSrc} alt="logo" onError={() => setLogoSrc(LOGO_FALLBACK_SVG)}/>
                    </div>
                  </div>
                  <div className="label-sku-text">{p.sku}</div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        /* Sticker preview — actual 50×25mm proportions (2:1), scaled up 3× for readability */
        <div className="no-print" style={{display:"flex",flexDirection:"column",gap:9,padding:"4px 0"}}>
          {labelList.map((p, i) => (
            <div key={i} style={{
              width:300, height:150, boxSizing:"border-box",
              background:"#fff", boxShadow:"0 1px 4px rgba(0,0,0,.12)",
              display:"flex", flexDirection:"column",
              padding:"9px 12px", overflow:"hidden", flexShrink:0,
            }}>
              {/* Row 1: name + price */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6,flexShrink:0,marginBottom:4}}>
                <span style={{fontSize:13,fontWeight:600,color:"#111",fontFamily:"Kanit,sans-serif",flex:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{p.name}</span>
                {p.price != null && p.price > 0 && (
                  <span style={{fontSize:13,fontWeight:700,color:"#111",fontFamily:"Kanit,sans-serif",flexShrink:0,whiteSpace:"nowrap"}}>{p.price} ฿</span>
                )}
              </div>
              {/* Row 2: QR center + logo corner */}
              <div style={{flex:1,position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{width:78,height:78}}>
                  {qrMap[p.sku]
                    ? <img src={qrMap[p.sku]} alt={p.sku} style={{width:"100%",height:"100%",objectFit:"contain"}}/>
                    : <div style={{width:"100%",height:"100%",background:"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#aaa"}}>QR</div>
                  }
                </div>
                <div style={{position:"absolute",bottom:0,right:0,width:36,height:36,opacity:.65}}>
                  <img src={logoSrc} alt="logo" style={{width:"100%",height:"100%",objectFit:"contain"}}
                       onError={e => e.currentTarget.style.display="none"}/>
                </div>
              </div>
              {/* Row 3: SKU */}
              <div style={{fontSize:11,fontFamily:"Kanit,sans-serif",fontWeight:500,color:"#333",textAlign:"center",letterSpacing:.5,flexShrink:0}}>{p.sku}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CALC PAD MODAL — reusable calculator overlay for qty input
// Props: { open, name, initialVal, onConfirm, onClose }
// ─────────────────────────────────────────────────────────────────────
function CalcPadModal({ open, name, initialVal, onConfirm, onClose }) {
  useBackHandler(open ? onClose : null); // Android back = ปิดเครื่องคิดเลข
  const [expr, setExpr]     = uS('');
  const [result, setResult] = uS(null);
  const [justOp, setJustOp] = uS(false);

  // Reset when opened
  uE(() => {
    if (open) {
      const init = (initialVal != null && initialVal !== '') ? String(initialVal) : '';
      setExpr(init); setResult(null); setJustOp(false);
    }
  }, [open, initialVal]);

  if (!open) return null;

  const evalExpr = (e) => {
    try {
      const clean = e.replace(/[^0-9+\-*/.()]/g,'');
      if (!clean) return null;
      // eslint-disable-next-line no-new-func
      const v = Function('return (' + clean + ')')();
      if (!isFinite(v)) return null;
      return Math.max(0, Math.round(v * 100) / 100);
    } catch(_) { return null; }
  };

  const display = result !== null ? String(result) : (expr || '0');
  const preview = expr && !justOp ? evalExpr(expr) : null;

  const press = (key) => {
    if (key === 'CONFIRM') {
      const base = result !== null ? String(result) : expr;
      const v = evalExpr(base);
      onConfirm(v !== null ? String(Math.max(0, Math.floor(v))) : '');
      return;
    }
    if (key === 'CANCEL') { onClose(); return; }
    if (key === 'DEL') {
      if (result !== null) { setExpr(String(result)); setResult(null); setJustOp(false); }
      else { setExpr(p => p.length > 1 ? p.slice(0,-1) : ''); setJustOp(false); }
      return;
    }
    if (key === 'C') { setExpr(''); setResult(null); setJustOp(false); return; }
    if (key === '=') {
      const base = result !== null ? String(result) : expr;
      const v = evalExpr(base);
      if (v !== null) { setResult(v); setJustOp(false); }
      return;
    }
    const isOp = ['+','-','*','/'].includes(key);
    if (isOp) {
      const base = result !== null ? String(result) : expr;
      setExpr(base.replace(/[+\-*\/]$/, '') + key);
      setResult(null); setJustOp(true);
      return;
    }
    // digit / dot
    if (result !== null && !justOp) { setExpr(key); setResult(null); setJustOp(false); }
    else { setExpr(p => p.length >= 16 ? p : p + key); setResult(null); setJustOp(false); }
  };

  const BTNS = [
    {k:'C',    lb:'C',   bg:'#fee2e2', c:'var(--dang)', fs:16},
    {k:'DEL',  lb:'⌫',   bg:'#fef3c7', c:'#b45309',    fs:22},
    {k:'(',    lb:'(',   bg:'#f1f5f9', c:'var(--text)', fs:20},
    {k:'/',    lb:'÷',   bg:'#ede9fe', c:'#7c3aed',    fs:20},
    {k:'7',    lb:'7',   bg:'#fff',    c:'var(--text)', fs:26},
    {k:'8',    lb:'8',   bg:'#fff',    c:'var(--text)', fs:26},
    {k:'9',    lb:'9',   bg:'#fff',    c:'var(--text)', fs:26},
    {k:'*',    lb:'×',   bg:'#ede9fe', c:'#7c3aed',    fs:20},
    {k:'4',    lb:'4',   bg:'#fff',    c:'var(--text)', fs:26},
    {k:'5',    lb:'5',   bg:'#fff',    c:'var(--text)', fs:26},
    {k:'6',    lb:'6',   bg:'#fff',    c:'var(--text)', fs:26},
    {k:'-',    lb:'−',   bg:'#ede9fe', c:'#7c3aed',    fs:26},
    {k:'1',    lb:'1',   bg:'#fff',    c:'var(--text)', fs:26},
    {k:'2',    lb:'2',   bg:'#fff',    c:'var(--text)', fs:26},
    {k:'3',    lb:'3',   bg:'#fff',    c:'var(--text)', fs:26},
    {k:'+',    lb:'+',   bg:'#ede9fe', c:'#7c3aed',    fs:26},
    {k:')',    lb:')',   bg:'#f1f5f9', c:'var(--text)', fs:20},
    {k:'0',    lb:'0',   bg:'#fff',    c:'var(--text)', fs:26},
    {k:'=',    lb:'=',   bg:'#475569', c:'#fff',       fs:26},
    {k:'CONFIRM',lb:'✓ ใช้', bg:'var(--g-600)', c:'#fff', fs:15},
  ];

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,
                 background:'rgba(0,0,0,.6)',
                 display:'flex',alignItems:'flex-end',justifyContent:'center'}}
         onClick={onClose}>
      <div style={{background:'#fff',borderRadius:'22px 22px 0 0',
                   width:'100%',maxWidth:420,padding:'18px 16px 32px',
                   boxShadow:'0 -8px 32px rgba(0,0,0,.18)'}}
           onClick={function(e){ e.stopPropagation(); }}>
        <div style={{fontSize:12,color:'var(--muted)',fontWeight:600,
                     textAlign:'center',marginBottom:10,
                     overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
          🧮 {name || ''}
        </div>
        <div style={{background:'#0f172a',borderRadius:14,padding:'12px 18px 8px',
                     marginBottom:12,minHeight:76,
                     display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
          <div style={{fontSize:12,color:'#64748b',fontFamily:'monospace',
                       wordBreak:'break-all',textAlign:'right',minHeight:16}}>
            {expr || ''}
          </div>
          <div style={{
                       fontSize: display.length > 10 ? 22 : display.length > 7 ? 30 : display.length > 4 ? 38 : 44,
                       fontWeight:800,color:'#f8fafc',
                       fontFamily:'monospace',lineHeight:1,
                       width:'100%',textAlign:'right',
                       overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
            {display}
          </div>
          {preview !== null && preview !== parseFloat(display) && (
            <div style={{fontSize:12,color:'#94a3b8',fontFamily:'monospace'}}>
              {'= '+preview}
            </div>
          )}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:7}}>
          {BTNS.map(function(btn){
            return (
              <button key={btn.k} onClick={function(){ press(btn.k); }}
                style={{height:56,borderRadius:12,fontFamily:'inherit',
                        fontSize:btn.fs,fontWeight:800,cursor:'pointer',
                        border:'none',background:btn.bg,color:btn.c,
                        WebkitTapHighlightColor:'transparent'}}>
                {btn.lb}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OverviewView, CategoryView, TrendsView, StockView, StorageView, StockCountView, TransferView, UploadView, ConnectView, LabelPrintView, ProductCard, OrderListView, OrderSummaryView, ConfirmModal, Toast, useToast, SkeletonCard, FrontStoreView, CalcPadModal });

Object.assign(window, { OverviewView, CategoryView, TrendsView, StockView, StorageView, StockCountView, TransferView, UploadView, ConnectView, LabelPrintView, ProductCard, OrderListView, OrderSummaryView, ConfirmModal, Toast, useToast, SkeletonCard, FrontStoreView, CalcPadModal });