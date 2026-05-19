�// Tab views B� Overview, Categories, Stock, Upload, Connect
const { useState: uS, useEffect: uE, useMemo: uM, useCallback: uC } = React;
const { ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
        XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } = window.Recharts;

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// OVERVIEW
// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
function OverviewView({ data, range, setRange, role }) {
  const { products, monthLabels, monthlyByCat, totals, mtoGroups,
          dayLabels, dailyByCat } = data;

  const months = monthLabels || [];
  const days   = (dayLabels && dayLabels.length > 0) ? dayLabels : [];
  const hasDailyData = days.length > 0;

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
      // Format DD/MM/YYYY B� DD/MM
      const parts = d.split("/");
      const label = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : d;
      return { day: d, label, qty, rev };
    });
  }, [days, dailyByCat, hasDailyData]);

  const filtered = uM(() => {
    if (range === 'day') return dailySeries;
    if (range === 'year') return monthlySeries;
    if (range === 'month') return monthlySeries.slice(-1);
    return monthlySeries;
  }, [monthlySeries, dailySeries, range]);

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
          if (!c || c === "@�@@�@@@@@@
@
@@�@�@�@") continue;
          accum[c] = (accum[c] || 0) + cats[c].sales;
        }
      }
    } else {
      const targetMonths = range === 'year' ? months : months.slice(-1);
      for (const m of targetMonths) {
        const cats = monthlyByCat[m] || {};
        for (const c of Object.keys(cats)) {
          if (!c || c === "@�@@�@@@@@@
@
@@�@�@�@") continue;
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
        row["@@@�@�@�"] = Math.round(other);
        return row;
      });
    }
    return months.map(m => {
      const row = { label: monthLabel(m) };
      const cats = monthlyByCat[m] || {};
      let other = 0;
      for (const c of Object.keys(cats)) {
        if (topCats.includes(c)) row[c] = Math.round(cats[c].sales);
        else other += cats[c].sales;
      }
      row["@@@�@�@�"] = Math.round(other);
      return row;
    });
  }, [months, days, monthlyByCat, dailyByCat, topCats, range, hasDailyData]);

  const topSellers = uM(() =>
    [...products].filter(p => p.soldRev > 0 && !p.isMTO)
      .sort((a,b) => b.soldRev - a.soldRev).slice(0, 10),
    [products]
  );

  // Top sellers per category B� for the gallery section
  const topByCategory = uM(() => {
    const byCat = {};
    products.filter(p => p.soldRev > 0 && !p.isMTO && p.cat && p.cat !== "@�@@�@@@@@@
@
@@�@�@�@")
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

  // B�B� Forecast calculations (owner only) B�B�
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

    // Weekly forecast from daily data (last 8 weeks B� project next 7 days)
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
      if (!last) return "@@@@�@�";
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
    ? (hasDailyData ? `${days.length} @@@� (${dailySeries[0]?.label}B�${dailySeries[dailySeries.length-1]?.label})` : "@@@�@�@@�@@@�@�@@@@@@@@@@�")
    : range === 'month' ? "@�@@@@�@@�@@
@@"
    : `${months.length} @�@@@@�@@@`;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">@�@@�@@@@@@@�@@</div>
          <div className="page-sub" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span>
              {range === 'day' && hasDailyData
                ? `@�@�@@@@@@@@@@� " ${days.length} @@@�`
                : `@�@�@@@@ ${months.length} @�@@@@�`}
            </span>
            <span className="chip">
              <span style={{width:6,height:6,borderRadius:"50%",background:"var(--g-500)"}}></span>
              Live
            </span>
            {range === 'day' && !hasDailyData && (
              <span className="chip warn">@@@�@�@@@ dailySales @�@�@@�@�@�@@�@@@@�@�@@@@@@@@@@�</span>
            )}
          </div>
        </div>
        <div className="page-actions">
          <Seg value={range} onChange={setRange} options={[
            {value:"day",   label: hasDailyData ? `@@@@@@� (${days.length})` : "@@@@@@�"},
            {value:"month", label:"@�@@@@�@�@@�"},
            {value:"year",  label:"@@@�@�@�@"},
          ]}/>
        </div>
      </div>

      <div className={`row ${role==='employee'?'row-2':'row-4'}`} style={{marginBottom: 20}}>
        {role === 'owner' && (
          <KPI label="@@@@�@@@@@" accent="#1f7f44"
               value={fmtB(sumRev)}
               sub={subLabel}
               delta={deltaVal ? `${Math.abs(parseFloat(deltaVal))}%` : null}
               deltaDir={deltaDir}
               icon={I.sales} />
        )}
        <KPI label="@�@@�@@�@�@@�@�@@@�@�@@" accent="#4fb472"
             value={fmtN(sumQty)}
             sub={range === 'day' ? `${days.length} @@@�@@�@@
@@` : `${fmtN(totals.nSold)} SKU @@@@@@�@@`}
             icon={I.cart} />
        {role === 'owner' && (
          <KPI label="@@@@�@�@@
@"@�@@�@�@�@�@@@@" accent="#a07417"
               value={fmtB(totals.totalStockValue)}
               sub={`${fmtN(totals.nWithStock)} SKU @@@�@@�@�@�@�@@@�`}
               icon={I.package} />
        )}
        {role === 'owner' && (
          <KPI label="@@@@�@@ / @"@�@�@@@�@
@"@�@@�" accent="#1f6f8b"
               value={totals.totalStockValue > 0 ? `${(totals.totalSoldRev / totals.totalStockValue).toFixed(2)}#` : "B�"}
               sub="@@@@�@�@@@@�@
@@�@�@�@"
               icon={I.trend} />
        )}
      </div>

      {/* B�B�B� Forecast Tool (owner only) B�B�B� */}
      {role === 'owner' && forecast && (
        <div style={{marginBottom: 20}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{fontSize:15,fontWeight:800,color:"var(--g-700)"}}>P�� Forecast Tool</span>
            <span style={{fontSize:11,color:"var(--muted)",fontWeight:500}}>
              @�@@@�@@@�@�@@�@�@�@@@@ {forecast.basedOn} @�@@@@�@@�@@
@@ " Linear Regression
            </span>
            <span style={{
              fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
              background: forecast.r2 >= 0.7 ? "#e8f5e9" : forecast.r2 >= 0.4 ? "#fff8e1" : "#fdecea",
              color: forecast.r2 >= 0.7 ? "var(--g-700)" : forecast.r2 >= 0.4 ? "#a07417" : "var(--dang)",
            }}>
              R" {(forecast.r2 * 100).toFixed(0)}% {forecast.r2 >= 0.7 ? "B� @�@�@@�@�@@�@@@@" : forecast.r2 >= 0.4 ? "~ @�@@�@�@�" : "B�� @�@�@@@@@�@�@@"}
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
                @�@@@@@@@@@�@@ @�@@@@�@@�@�@
              </div>
              <div style={{display:"flex",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:26,fontWeight:800,color:"var(--g-700)",lineHeight:1.1}}>
                    {fmtB(forecast.nextMonthRev)}
                  </div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
                    "{fmtB(forecast.revMAE)} @�@@�@�@@@�@@�
                  </div>
                </div>
                <div style={{
                  display:"flex",alignItems:"center",gap:4,
                  padding:"4px 10px",borderRadius:20,
                  background: forecast.revChangePct >= 0 ? "#c8e6c9" : "#ffcdd2",
                  color: forecast.revChangePct >= 0 ? "#1b5e20" : "#b71c1c",
                  fontSize:12,fontWeight:700,
                }}>
                  {forecast.revChangePct >= 0 ? "B" : "B"} {Math.abs(forecast.revChangePct).toFixed(1)}%
                  <span style={{fontWeight:400,fontSize:10,marginLeft:2}}>vs @�@@@@�@�@@�</span>
                </div>
              </div>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:8}}>
                @�@@�@@� ~{Math.round(forecast.nextMonthQty).toLocaleString()} @�@@�@�
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
                  @�@@@@@@@@@�@@ 7 @@@�@@�@�@
                </div>
                <div style={{display:"flex",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontSize:26,fontWeight:800,color:"#5b3fa0",lineHeight:1.1}}>
                      {fmtB(forecast.weekly.rev)}
                    </div>
                    <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
                      ~{Math.round(forecast.weekly.qty).toLocaleString()} @�@@�@�
                    </div>
                  </div>
                  <div style={{
                    display:"flex",alignItems:"center",gap:4,
                    padding:"4px 10px",borderRadius:20,
                    background: forecast.weekly.changePct >= 0 ? "#e8eaf6" : "#ffcdd2",
                    color: forecast.weekly.changePct >= 0 ? "#283593" : "#b71c1c",
                    fontSize:12,fontWeight:700,
                  }}>
                    {forecast.weekly.changePct >= 0 ? "B" : "B"} {Math.abs(forecast.weekly.changePct).toFixed(1)}%
                    <span style={{fontWeight:400,fontSize:10,marginLeft:2}}>vs @
@@�@@@@�@�@@�</span>
                  </div>
                </div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:8}}>
                  R" @@@@
@@�@@@@� {(forecast.weekly.r2 * 100).toFixed(0)}%
                </div>
              </div>
            ) : (
              <div style={{
                borderRadius:14, padding:18,
                background:"#f8f8f8", border:"1.5px dashed var(--bdr)",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                color:"var(--muted)", fontSize:12, gap:6,
              }}>
                <span style={{fontSize:22}}>P�&</span>
                <span style={{fontWeight:600}}>@@@�@�@@�@@@�@�@@@@@@@@@@�</span>
                <span style={{fontSize:11}}>@@@�@�@@@ dailySales @�@�@@�@@@ Forecast @@@@
@@�@@@@�</span>
              </div>
            )}
          </div>

          {/* Trend chart: historical + forecast */}
          <Card title="@�@�@@�@�@�@ + Forecast @�@@@@�@@�@�@" sub="@�@
@�@�@�@@ = @�@�@@�@@@�@@@� | @�@
@�@�@@@� = Trend Line">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={forecast.chartData} margin={{top:6,right:16,bottom:6,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2eadd" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:11,fill:"#5b6b5e"}} tickLine={false} axisLine={false}/>
                <YAxis tick={{fontSize:10,fill:"#94a194"}} tickLine={false} axisLine={false}
                       tickFormatter={v => v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(1)}K`:String(v)}/>
                <Tooltip formatter={(v,n) => [fmtB(v), n==="actual"?"@@@@�@@@�":n==="trend"?"Trend Line":"Forecast"]}/>
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

      {role === 'owner' && <div className="row row-12-5" style={{marginBottom: 20}}>
        <Card title={range === 'day' ? "@@@@�@@@@@@@@� " @�@@�@@@@" : "@�@�@@�@�@�@@@@@�@@@@@@�@@@@� " @�@@�@@@@"}
              sub={`@�@@�@�@�@�@@� B� Top 6 @@@@ + @@@�@�@�`}>
          {range === 'day' && !hasDailyData ? (
            <Empty icon={I.upload} title="@@@�@�@@�@@@�@�@@@@@@@@@@�"
                   sub="@@@�@�@@@ dailySales*.xlsx @�@�@@�@�@@@@�@�@@@ @�@@�@@�@@@�@@@@@@@�@�@@�"/>
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
                <Bar dataKey="@@@�@�@�" stackId="a" fill="#c9d6bf" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="@
@@@
@�@@�@@@@�@@@"@@@@@@"
              sub={range==='year' ? "@@@�@�@�@" : range==='day' ? `${days.length} @@@�@@�@@
@@` : "@�@@@@�@@�@@
@@"}>
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
      </div>}

      {/* MTO Section */}
      {mtoGroups && mtoGroups.length > 0 && (
        <Card title="P�� @�@@�@�@@@�@@�@@	 (Made to Order)" sub={`${mtoGroups.length} @�@@@�@�@ " @�@@�@�@@�@
@"@�@@�`} style={{marginBottom: 20}}>
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
                    <div style={{fontSize:10,color:"var(--muted)"}}>{g.variants.length} @�@�@� " {fmtN(g.totalQty)} @�@@�@�</div>
                  </div>
                  {role === 'owner' && <div style={{fontSize:16,fontWeight:800,color:"#705d96"}}>{fmtB(g.totalRev)}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Top 10 @
@@�@�@�@@�@@@@ (@@@�@�@�@ " @�@@�@@@ MTO)"
            sub={months.length > 0 ? `@�@@@@�@"@@@@@@�@@� " ${monthLabel(months[0]).split(" ")[0]}B�${monthLabel(months[months.length-1])}` : "@�@@@@�@"@@@@@@�@@�"}
            action={null}>
        <div style={{overflowX:"auto"}}>
          <table className="t">
            <thead><tr>
              <th style={{width:42}}>#</th>
              <th>@
@@�@�@�@</th>
              <th style={{width:100}}>@@@@</th>
              <th className="num" style={{width:90}}>@�@@ (@�@@�@�)</th>
              {role === 'owner' && <th className="num" style={{width:110}}>@@@@�@@�</th>}
              <th className="num" style={{width:80}}>@�@�@�@@@@</th>
              <th style={{width:120}}>@�@�@@�@�@�@ 5 @�@@@@�</th>
            </tr></thead>
            <tbody>
              {topSellers.map((p, i) => (
                <tr key={p.sku} style={{cursor:"pointer"}} onClick={() => setOverviewModalP(p)}>
                  <td style={{color:"var(--light)",fontWeight:700}}>{i+1}</td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      {p.imageUrl ? (
                        <div style={{width:36,height:36,borderRadius:6,
                                     backgroundImage:`url("${p.imageUrl}")`,
                                     backgroundSize:"contain",backgroundPosition:"center",
                                     backgroundRepeat:"no-repeat",backgroundColor:"#fff",
                                     border:"1px solid var(--bdr)",flexShrink:0}}/>
                      ) : (
                        <div style={{width:36,height:36,borderRadius:6,
                                     background:p.color?p.color.hex+"33":"var(--g-50)",
                                     border:p.color?`2px solid ${p.color.hex}`:"1px solid var(--bdr)",flexShrink:0}}/>
                      )}
                      <div>
                        <span className="skucode" style={{fontSize:10}}>{p.sku}</span>
                        <div style={{fontWeight:500,marginTop:2}}>{p.name}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11.5,color:"var(--muted)"}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:catColor(p.cat, allCats)}}/>
                      {p.cat || "B�"}
                    </span>
                  </td>
                  <td className="num" style={{fontWeight:600}}>{fmtN(p.soldQty)}</td>
                  {role === 'owner' && <td className="num" style={{fontWeight:700,color:"var(--g-700)"}}>{fmtB(p.soldRev)}</td>}
                  <td className="num" style={{color:p.qty<=36?"var(--dang)":"var(--muted)"}}>{fmtN(p.qty)}</td>
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
      <Card title="P��� Top 10 @�@@@@ " @�@@�@"@@@@@@"
            sub="@�@@@@�@
@@�@�@�@@�@�@@�@@@@@@�@�@@@@@@@@�@@@@"
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
                  {role === 'owner' && <span style={{fontSize:11, fontWeight:600, color:cc}}>{fmtB(g.totalRev)}</span>}
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
                        {i===0?"P��":i===1?"P��":i===2?"P��":`#${i+1}`}
                      </span>
                      {p.imageUrl ? (
                        <div style={{width:36,height:36,borderRadius:6,
                                     backgroundImage:`url("${p.imageUrl}")`,
                                     backgroundSize:"contain",backgroundPosition:"center",
                                     backgroundRepeat:"no-repeat",backgroundColor:"#fff",
                                     border:"1px solid var(--bdr)",flexShrink:0}}/>
                      ) : (
                        <div style={{width:36,height:36,borderRadius:6,flexShrink:0,
                                     background: p.color ? p.color.hex+"33" : "var(--g-50)",
                                     border: p.color ? `2px solid ${p.color.hex}` : "1px solid var(--bdr)"}}/>
                      )}
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:11.5, fontWeight:600,
                                     overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                          {p.name}
                        </div>
                        <div style={{fontSize:10, color:"var(--muted)", marginTop:1}}>
                          {fmtN(p.soldQty)} @�@@�@� " @�@�@�@@@@ {fmtN(p.qty)}
                        </div>
                      </div>
                      {role === 'owner' && <div style={{fontSize:11.5, fontWeight:700, color:"var(--g-700)", flexShrink:0}}>
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

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// CATEGORIES B� All products + sort + gallery
// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
const SORT_OPTIONS = [
  { value: "bestseller", label: "@�@@@@" },
  { value: "revenue",    label: "@@@@�@@�@
@@�" },
  { value: "price-high", label: "@@@�@@�@�@� B� @@@�" },
  { value: "price-low",  label: "@@@�@@@@� B� @�@�@�" },
  { value: "vendor",     label: "@"@@@@�@@� (Supplier)" },
  { value: "color",      label: "@"@@@
@" },
  { value: "stock-low",  label: "@
@"@�@@�@�@�@@ B� @@@�" },
  { value: "stock-high", label: "@
@"@�@@�@@@� B� @�@�@@" },
  { value: "name",       label: "@�@@�@ AB�Z" },
];

const COLOR_ORDER = ["@�@@�","@
@�@","@�@@@@@�","@�@�@@@","@�@�@","@�@�@@�@�@@�","@@�@@�","@�@@�@","@�@@","@�@@@","@�@�@@"@@","@@@�","@�@�@@�","@@","@�@@�@�@@�@�","@@@�@�@"@�","@�@@�","@�@�@�"];

const COLOR_MAP = {
  "@�@@�@�@@�@�":   { name:"@�@@�@�@@�@�",  hex:"#a82a6a", en:"Magenta" },
  "@�@�@@�@�@@�":   { name:"@�@�@@�@�@@�",   hex:"#2e4d8f", en:"Blue" },
  "@�@�@@"@@":   { name:"@�@�@@"@@",   hex:"#7a4e2a", en:"Brown" },
  "@@@�@�@"@�":    { name:"@@@�@�@"@�",    hex:"#9adcc1", en:"Mint" },
  "@�@@�":      { name:"@�@@�",      hex:"#e8b4a0", en:"Peach" },
  "@�@@@@@�":   { name:"@�@@@@@�",   hex:"#f4c220", en:"Yellow" },
  "@�@�@@@":    { name:"@�@�@@@",    hex:"#3a8f3a", en:"Green" },
  "@�@@�@":     { name:"@�@@�@",     hex:"#e88aa6", en:"Pink" },
  "@�@@@":     { name:"@�@@@",     hex:"#f0e2c0", en:"Cream" },
  "@�@�@�":      { name:"@�@�@�",      hex:"#d4bc94", en:"Beige" },
  "@�@�@":      { name:"@�@�@",      hex:"#5aa3d6", en:"LightBlue" },
  "@@@�":      { name:"@@@�",      hex:"#c89030", en:"Gold" },
  "@�@�@@�":     { name:"@�@�@@�",     hex:"#bcbcbc", en:"Silver" },
  "@�@@�":      { name:"@�@@�",      hex:"#c5352a", en:"Red" },
  "@
@�@":      { name:"@
@�@",      hex:"#e6862a", en:"Orange" },
  "@@�@@�":     { name:"@@�@@�",     hex:"#7c4ea8", en:"Purple" },
  "@�@@":      { name:"@�@@",      hex:"#f4f4f4", en:"White" },
  "@@":       { name:"@@",       hex:"#2a2a2a", en:"Black" },
};
// Order: longer/compound words first so "@�@@�@�@@�@�" wins over "@�@@�@�", "@�@�@@�@�@@�" over "@�@�@@�"
const COLOR_KEYS = ["@�@@�@�@@�@�","@�@�@@�@�@@�","@�@�@@"@@","@@@�@�@"@�","@�@@�","@�@@@@@�","@�@�@@@","@�@@�@","@�@@@","@�@�@�","@�@�@","@@@�","@�@�@@�","@�@@�","@
@�@","@@�@@�","@�@@","@@"];
function detectColor(text) {
  if (!text) return null;
  const s = String(text);
  for (const k of COLOR_KEYS) if (s.indexOf(k) >= 0) return COLOR_MAP[k];
  return null;
}

// Strip "#1", "#10", trailing numbers, etc. from MTO product names
// "@�@�@�@@�@�@@#1" B� "@�@�@�@@�@�@@", "@�@�@�@@�@�@@ 5 @@@�@" B� "@�@�@�@@�@�@@"
function mtoBase(name) {
  if (!name) return '@�@@�@�@@�@@	';
  return String(name)
    .replace(/\s*#\s*\d+.*$/, '')
    .replace(/\s+\d+\s*$/, '')
    .trim() || '@�@@�@�@@�@@	';
}

function CategoryView({ data, role }) {
  const { products } = data;
  const allCats = uM(() => {
    const s = new Set();
    products.forEach(p => p.cat && p.cat !== "@�@@�@@@@@@
@
@@�@�@�@" && s.add(p.cat));
    // Custom sort order
    const CAT_ORDER = [
      "Realtouch",
      "@@@�@�@@�",
      "@�@@�",
      "@�@@�@�@�@",
      "@@@�@@�@�@",
      "@�@�",
      "@�@�@�@@�",
      "@�@�@�@@�@�@�@@�",
      "@�@@�@�@�@@�",
      "@�@@@@@�@@@�",
      "@"@�@�@�@@�",
      "@�@�@�@@�@�@�@�@",
      "@�@@�@@�@�",
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
  const [sortBy, setSortBy] = uS("bestseller");
  const [showAll, setShowAll] = uS(false);
  const [colorFilter, setColorFilter] = uS(null);
  const [supplierFilter, setSupplierFilter] = uS(null);
  const [newStockFilter, setNewStockFilter] = uS(false);
  const [orderProduct, setOrderProduct] = uS(null);

  // B�B� helper: parse DD/MM/YYYY B� Date B�B�
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

  const isMtoCat = active === "Made to Order @�@@@�@�@�@�@@�@@	";

  const sortFn = uC((a, b) => {
    switch (sortBy) {
      case "bestseller": return b.soldQty - a.soldQty;
      case "revenue":    return b.soldRev - a.soldRev;
      case "price-high": return (b.price||0) - (a.price||0);
      case "price-low":  return (a.price||0) - (b.price||0);
      case "vendor":     return (a.vendor||"zzz").localeCompare(b.vendor||"zzz") || b.soldRev - a.soldRev;
      case "color": {
        const ao = a.color ? COLOR_ORDER.indexOf(a.color.name) : 99;
        const bo = b.color ? COLOR_ORDER.indexOf(b.color.name) : 99;
        return (ao===-1?99:ao) - (bo===-1?99:bo) || b.soldRev - a.soldRev;
      }
      case "stock-low":  return a.qty - b.qty;
      case "stock-high": return b.qty - a.qty;
      case "name":       return a.name.localeCompare(b.name);
      default: return 0;
    }
  }, [sortBy]);

  const isGlobalSearch = globalSearch.trim().length > 0;

  const filtered = uM(() => {
    const gq = globalSearch.trim().toLowerCase();
    if (gq) {
      // Global: search all categories
      let f = products.filter(p => p.cat && p.cat !== "@�@@�@@@@@@
@
@@�@�@�@");
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
  }, [products, active, search, globalSearch, colorFilter, supplierFilter, newStockFilter, sortFn]);

  const visible = showAll ? filtered : filtered.slice(0, 24);

  // Compute reason tags per product (within this category sort)
  const totalCatRev = filtered.reduce((s,p) => s + p.soldRev, 0);
  const reasonMap = uM(() => {
    const map = {};
    filtered.forEach((p, idx) => {
      const tags = [];
      const m = p.monthly || [];
      // Rising trend: late half avg > early half avg # 1.4
      if (m.length >= 4) {
        const half = Math.floor(m.length / 2);
        const early = m.slice(0, half).reduce((s,x) => s + x.qty, 0) / half;
        const late  = m.slice(half).reduce((s,x) => s + x.qty, 0) / (m.length - half);
        if (early > 0 && late >= early * 1.4) tags.push({ text:"@�@@@@�@@@�@@� P��", color:"#2a9b56" });
      }
      // Consistent: sold in 3+ months
      const soldMonths = m.filter(x => x.qty > 0).length;
      if (soldMonths >= 3 && idx > 0) tags.push({ text:"@�@@@
@@�@@�@
@@", color:"#1f6f8b" });
      // High turnover: soldQty > stock
      if (p.qty > 0 && p.soldQty > p.qty * 2) tags.push({ text:"@�@@@�@@�@ B�", color:"#c2570a" });
      // Top revenue contributor in cat
      if (totalCatRev > 0 && p.soldRev / totalCatRev > 0.15 && idx > 0)
        tags.push({ text:`${(p.soldRev/totalCatRev*100).toFixed(0)}% @@@@�@@�@@@@`, color:"#a07417" });
      // New arrival
      if (p.lastStockInISO) {
        const daysAgo = (Date.now() - new Date(p.lastStockInISO).getTime()) / 86400000;
        if (daysAgo <= 30) tags.push({ text:"@
@@�@�@�@@�@@@� P��"", color:"#705d96" });
      }
      map[p.sku] = tags.slice(0, 2);
    });
    return map;
  }, [filtered, totalCatRev]);

  const catStats = uM(() => {
    const f = products.filter(p => p.cat === active);
    return {
      n: f.length,
      stock: f.reduce((s,p)=>s+p.qty,0),
      sold: f.reduce((s,p)=>s+p.soldQty,0),
      rev: f.reduce((s,p)=>s+p.soldRev,0),
      stockValue: f.reduce((s,p)=>s+(p.qty*p.price),0),
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
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">@@@@@@@@�@
@@�@�@�@</div>
          <div className="page-sub">@@@
@@�@�@�@@@@�@"@@@�@�@�@"@�@@@@@@ " @�@@@@�@"@@@�@@@@ / @@@�@ / Supplier / @
@</div>
        </div>
      </div>

      {/* B�B� Global Search Bar B�B� */}
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
            placeholder="@�@�@�@@@
@@�@�@�@@@@�@�@@@ (SKU / @�@@�@)..."
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
              }}>B�"</button>
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
            @�@� {filtered.length} @@@@�@@ @�@@�@@@�@@@@@@@@�
            {filtered.length === 0 && <span style={{color:"var(--muted)",fontWeight:400}}>B� @@@�@�@�@�@@@@�@@@�@@@@�@�</span>}
          </div>
        )}
      </div>

      {/* Mobile dropdown B� hidden on desktop */}
      <div className="cat-mobile-select">
        <select value={active}
                onChange={e => { setActive(e.target.value); setColorFilter(null); setSupplierFilter(null); setNewStockFilter(false); setShowAll(false); }}
                style={{
                  width:"100%", padding:"10px 14px", borderRadius:10, fontSize:14, fontWeight:600,
                  border:"1.5px solid var(--bdr)", background:"var(--paper)", fontFamily:"inherit",
                  color:"var(--text)", cursor:"pointer",
                }}>
          {allCats.map(c => {
            const isMto = c === "Made to Order @�@@@�@�@�@�@@�@@	";
            const n = products.filter(p => p.cat === c).length;
            return <option key={c} value={c}>{isMto ? "@�@@�@�@@@�@@�@@	 (MTO)" : c} ({n})</option>;
          })}
        </select>
      </div>

      <div className="cat-layout">
        {/* Sidebar B� hidden on mobile */}
        <Card padding={false} className="cat-sidebar" style={{padding:"12px 8px",alignSelf:"start",position:"sticky",top:80}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",
                       letterSpacing:".08em",padding:"6px 12px"}}>
            @@@@@@@@� ({allCats.length})
          </div>
          <div className="cat-list" style={{maxHeight:"calc(100vh - 200px)",overflowY:"auto"}}>
            {allCats.map(c => {
              const n = products.filter(p => p.cat === c).length;
              const cc = catColor(c, allCats);
              const isMto = c === "Made to Order @�@@@�@�@�@�@@�@@	";
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
                  <span style={{width:9,height:9,borderRadius:"50%",background:cc,flexShrink:0}}/>
                  <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {isMto ? "@�@@�@�@@@�@@�@@	 (MTO)" : c}
                  </span>
                  <span style={{fontSize:10,color:"var(--light)",fontWeight:500}}>{n}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <div>
          {/* KPIs B� hide in global search mode */}
          <div className="row row-4" style={{marginBottom:18, display: isGlobalSearch ? "none" : undefined}}>
            <KPI label="@
@@�@�@�@@�@�@@@@" accent={color} icon={I.layers} value={fmtN(catStats.n)} sub="SKU"/>
            {!isMtoCat ? (
              <KPI label="@
@"@�@@�@�@�@�@@@@" accent={color} icon={I.package} value={fmtN(catStats.stock)} sub={role === 'owner' ? fmtB(catStats.stockValue) : undefined}/>
            ) : (
              <KPI label="@�@@@�@�@@�@@�" accent={color} icon={I.layers}
                   value={fmtN(new Set(products.filter(p=>p.cat===active).map(p=>p.mtoBase)).size)} sub="@�@@@�@"/>
            )}
            <KPI label="@�@@@�@�@�@@�@" accent={color} icon={I.cart} value={fmtN(catStats.sold)} sub="@�@@�@� (5 @�@@@@�)"/>
            {role === "owner" && <KPI label="@@@@�@@�@@@" accent={color} icon={I.sales} value={fmtB(catStats.rev)} sub={"@@@@@�@@�"}/>}
          </div>

          {/* Controls B� hide in global search mode */}
          <Card style={{marginBottom:14, display: isGlobalSearch ? "none" : undefined}}>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
              {/* Search */}
              <div style={{display:"flex",gap:8,flex:"1 1 220px",minWidth:200,alignItems:"center"}}>
                <div style={{position:"relative",flex:1}}>
                  <input value={search} onChange={e=>setSearch(e.target.value)}
                         placeholder="@�@�@�@@ SKU @@@@@�@@�@@
@@�@�@�@..."
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
                <span style={{fontSize:11.5,fontWeight:600,color:"var(--muted)"}}>@�@@@@�@"@@</span>
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
                <span className="filter-bar-label">P�� @
@</span>
                <div className="filter-chips">
                  <button className={`fchip${colorFilter===null?' active':''}`}
                          onClick={()=>setColorFilter(null)}>@@@�@�@@@</button>
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
                <span className="filter-bar-label">P��
 @@�@@�</span>
                <div className="filter-chips">
                  <button className={`fchip${supplierFilter===null?' active':''}`}
                          onClick={()=>setSupplierFilter(null)}>@@@�@�@@@</button>
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
                  <span className="filter-bar-label">B� @�@@@�</span>
                  <div className="filter-chips">
                    <button className={`fchip${!newStockFilter?' active':''}`}
                            onClick={() => setNewStockFilter(false)}>@@@�@�@@@</button>
                    <button className={`fchip${newStockFilter?' active':''}`}
                            onClick={() => setNewStockFilter(v => !v)}
                            style={newStockFilter ? {
                              background:"#fff8e1", borderColor:"#f59e0b",
                              color:"#a07417", fontWeight:700,
                            } : {}}>
                      P��" @�@�@�@@�@@@�@�@� 45 @@@�
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

          {/* Header B� hide when global search active */}
          {!isGlobalSearch && (
            <div className="sec-head" style={{margin:"4px 0 14px"}}>
              <div>
                <div className="sec-title" style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{width:14,height:14,borderRadius:"50%",background:color}}/>
                  {isMtoCat ? "@�@@�@�@@@�@@�@@	" : active}
                  <span style={{fontSize:12, fontWeight:500, color:"var(--muted)"}}>
                    " {filtered.length} @@@@�@@
                  </span>
                </div>
                <div className="sec-sub">
                  {showAll ? "@�@
@@�@@@�@�@@@" : `@�@
@@� ${Math.min(24, filtered.length)} @�@@� ${filtered.length}`} "
                  @�@@@@�@"@@ {SORT_OPTIONS.find(o=>o.value===sortBy)?.label}
                </div>
              </div>
              {filtered.length > 24 && (
                <button className="btn" onClick={()=>setShowAll(!showAll)}>
                  {showAll ? "@@�@@�@@@�" : `@@@@@�@�@@@ (${filtered.length})`}
                  {showAll ? I.arrowL : I.arrowR}
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <Empty title="@�@@�@�@�@
@@�@�@�@" sub={isGlobalSearch || search ? "@@@�@�@�@�@@@@�@@@�@@@@�@�" : "@@@@@�@@�@@@�@�@@�@@@
@@�@�@�@"}/>
          ) : (
            <div className="product-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",gap:14}}>
              {visible.map((p, idx) => (
                <div key={p.sku} style={{position:"relative"}}>
                  {/* Category badge overlay in global search mode */}
                  {isGlobalSearch && p.cat && (
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

// B�B�B�B�B�B�B�B�B�B�B�B�B�B� Product Card B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// B�B�B�B�B�B�B�B�B�B�B�B�B�B� Order Modal B�B�B�B�B�B�B�B�B�B�B�B�B�B�
const QUICK_QTYS = [24, 36, 48, 60];

function OrderModal({ product, onClose }) {
  const [qty, setQty] = uS(24);
  const [customMode, setCustomMode] = uS(false);
  const [orderType, setOrderType] = uS('@@@�@@�@�@@');
  const [loading, setLoading] = uS(false);
  const [done, setDone] = uS(false);
  const [err, setErr] = uS(null);

  const sheetUrl = (typeof GOOGLE_SHEET_URL !== 'undefined') ? GOOGLE_SHEET_URL : null;
  const outOfStock = (product.qtyWH !== undefined ? product.qtyWH : product.qty) <= 0;

  const handleSubmit = () => {
    if (outOfStock) return;
    if (!sheetUrl) { setErr('@�@@�@�@� GOOGLE_SHEET_URL'); return; }
    if (qty < 1) { setErr('@�@@@@@@@�@@�@@�@@�'); return; }
    setLoading(true); setErr(null);
    const url = `${sheetUrl}?action=order&sku=${encodeURIComponent(product.sku)}&qty=${qty}&orderType=${encodeURIComponent(orderType)}`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setDone(true); setTimeout(onClose, 2000); }
        else setErr(d.error || '@�@�@@@�@�@@�@@@�@@@');
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
          <div style={{fontWeight:700, fontSize:16}}>P�� @
@@�@�@�@�@�@@</div>
          <button onClick={onClose} style={{...btnBase, width:32, height:32, padding:0, fontSize:18, color:"var(--muted)"}}>#</button>
        </div>

        {done ? (
          <div style={{padding:40, textAlign:"center"}}>
            <div style={{fontSize:48, marginBottom:12}}>B�&</div>
            <div style={{fontWeight:700, fontSize:16, color:"var(--g-700)"}}>@�@@�@@@�@@@@�@@@
@@�@@�@�</div>
            <div style={{fontSize:12, color:"var(--muted)", marginTop:6}}>@@@�@@�@@@� Sheet "@@@@@�@@@�@
@@�@�@
@@�@�@�@"</div>
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
                             fontSize:22, flexShrink:0}}>P�</div>
              )}
              <div style={{minWidth:0}}>
                <span className="skucode" style={{fontSize:10}}>{product.sku}</span>
                <div style={{fontWeight:600, fontSize:13, lineHeight:1.35, marginTop:3}}>{product.name}</div>
                <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>
                  @�@@@�: <b style={{color: outOfStock ? "var(--dang)" : "var(--g-700)"}}>
                    {outOfStock ? "@@@@
@"@�@@�" : `${fmtN(product.qtyWH ?? product.qty)} @�@@�@�`}
                  </b>
                  {product.price > 0 && <> " @@@�@ <b>{fmtB(product.price)}</b></>}
                </div>
              </div>
            </div>

            {outOfStock ? (
              <div style={{background:"#fff0f0", border:"1px solid #fcc", borderRadius:10,
                           padding:16, textAlign:"center", fontSize:13, color:"var(--dang)", fontWeight:600}}>
                B��O� @
@@�@�@�@@@@@
@"@�@@� @�@@�@
@@@@@@
@@�@�@�@@�
              </div>
            ) : (<>
              {/* Quick qty */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12, fontWeight:600, color:"var(--muted)", marginBottom:8}}>@�@@�@@�@@@�@
@@�@� (@�@@�@�)</div>
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
                  B��O� @�@@@�@�@@�
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
                <div style={{fontSize:12, fontWeight:600, color:"var(--muted)", marginBottom:8}}>@�@@@�@�@@�@@@@@�</div>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                  {[{v:'@@@�@',icon:'P��',sub:'@@@�@@@�@@�@@�/@@@�@@�@�@�@@'},{v:'@@@�@@�@�@@',icon:'P���',sub:'@@@�@@@
@�@�@@@@@@�'}].map(t => (
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
                  B��O� {err}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading}
                      style={{...btnBase, width:"100%", padding:"12px", fontSize:14,
                              background:"var(--g-700)", color:"#fff", borderColor:"var(--g-700)"}}>
                {loading
                  ? <><span className="spin" style={{width:14,height:14,borderWidth:2,display:"inline-block",verticalAlign:"middle",marginRight:6}}/> @�@@@@�@�@@�@@@�B�</>
                  : `B�& @@@�@@@�@
@@�@� ${fmtN(qty)} @�@@�@� (${orderType})`}
              </button>
            </>)}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({ p, rank, accent, allCats, reasonTags, onOrder, role }) {
  const lowStock = !p.isMTO && p.qty > 0 && p.qty <= 36;
  const outOfStock = !p.isMTO && p.qty === 0;
  const hashHue = (p.sku || "").split("").reduce((a,c) => a + c.charCodeAt(0), 0) % 360;
  const [lightbox, setLightbox] = uS(false);

  // Image (real or placeholder)
  const hasImg = !!p.imageUrl;

  return (
    <>
    <div className="card hover" style={{padding:0, overflow:"hidden", display:"flex", flexDirection:"column"}}>
      {/* Image */}
      <div onClick={hasImg ? () => setLightbox(true) : null}
           style={{position:"relative", padding:10, background: "linear-gradient(180deg, var(--g-50), #fff)",
                   cursor: hasImg ? "zoom-in" : "default", flex:"none"}}>
        {hasImg ? (
          <div style={{
            width:"100%", aspectRatio:"1/1", borderRadius:10,
            backgroundImage: `url("${p.imageUrl}")`,
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
            {rank===1?"P�� #1":rank===2?"P�� #2":rank===3?"P�� #3":`#${rank}`}
          </div>
        )}

        {/* Stock badge */}
        {outOfStock && <div className="chip dang" style={{position:"absolute",top:6,right:6}}>@@@</div>}
        {lowStock && !outOfStock && (
          <div className="chip warn" style={{position:"absolute",top:6,right:6}}>@�@@@@ {p.qty}</div>
        )}
        {p.isMTO && (
          <div className="chip" style={{position:"absolute",top:6,right:6, background:"#f3eef9", color:"#705d96", borderColor:"#d8c8e8"}}>MTO</div>
        )}
      </div>

      {/* Body */}
      <div style={{padding:"8px 12px 12px"}}>
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
          <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10.5,color:"var(--muted)",marginBottom:3}}>
            {React.cloneElement(I.store, {size:11})}
            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.lastSupplier || p.vendor}</span>
          </div>
        )}
        {p.lastStockInDate && (
          <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"var(--g-700)",marginBottom:6,fontWeight:600}}>
            <span>P�& @�@�@�@@@�@@
@@ {p.lastStockInDate}</span>
          </div>
        )}
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end",
                     paddingTop:6, borderTop:"1px dashed var(--bdr)"}}>
          <div>
            <div style={{fontSize:9.5, color:"var(--muted)", fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>
              {p.isMTO ? "@�@@@�@@�@" : "@�@�@�@@@@"}
            </div>
            <div style={{fontSize:14, fontWeight:700, lineHeight:1.2, color:lowStock||outOfStock?"var(--dang)":"var(--text)"}}>
              {p.isMTO ? fmtN(p.soldQty) : fmtN(p.qty)}
              <span style={{fontSize:9.5, color:"var(--muted)", fontWeight:500, marginLeft:3}}>@�@@�@�</span>
            </div>
            {!p.isMTO && (p.qtyStore > 0 || p.qtyWH > 0) && (
              <div style={{fontSize:9.5, color:"var(--muted)", marginTop:2, lineHeight:1.3}}>
                @@�@@� {fmtN(p.qtyStore||0)} " @�@@@� {fmtN(p.qtyWH||0)}
              </div>
            )}
          </div>
          {role === 'owner' && (
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:9.5, color:"var(--muted)", fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>@@@�@</div>
              <div style={{fontSize:14, fontWeight:800, color:accent, lineHeight:1.2}}>{fmtB(p.price)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Order button */}
      {onOrder && (
        <div style={{padding:"0 12px 12px", marginTop:"auto"}}>
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
            {outOfStock ? "B� @@@@
@"@�@@�" : "P�� @
@@�@�@�@�@�@@"}
          </button>
        </div>
      )}
    </div>
    {lightbox && p.imageUrl && <ImageLightbox url={p.imageUrl} name={p.name} onClose={() => setLightbox(false)}/>}
    </>
  );
}

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// STOCK / ALERTS B� absolute thresholds, exclude MTO
// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
const STOCK_PAGE = 50;

function StockView({ data, role }) {
  const { products, thresholds: dataThresholds } = data;
  const [filter, setFilter] = uS("low");
  const [modalP, setModalP] = uS(null);
  const [page, setPage] = uS(0);
  const [stockSearch, setStockSearch] = uS("");
  // Editable thresholds (persisted in memory)
  const [defaultThr, setDefaultThr] = uS(dataThresholds?.default || 36);
  const [overrides, setOverrides] = uS(dataThresholds?.overrides || { "@�@�@�@@�@�@�@�@": 3, "@�@@�@@�@�@�@@@@@�@�@�": 3 });
  const [supplierFilter, setSupplierFilter] = uS(null);

  const getThr = uC((cat) => overrides[cat] != null ? overrides[cat] : defaultThr, [overrides, defaultThr]);

  const allCats = uM(() => {
    const s = new Set();
    products.forEach(p => p.cat && s.add(p.cat));
    return [...s].sort();
  }, [products]);

  // Exclude MTO + @�@@�@@@@@@
@
@@�@�@�@ + empty cat
  const checkable = uM(() => products.filter(p =>
    !p.isMTO &&
    p.cat &&
    p.cat !== "@�@@�@@@@@@
@
@@�@�@�@" &&
    p.cat !== "Made to Order @�@@@�@�@�@�@@�@@	"
  ), [products]);

  const enriched = uM(() => checkable.map(p => {
    const avgMonthly = p.soldQty / 5;
    const monthsLeft = avgMonthly > 0 ? p.qty / avgMonthly : null;
    const threshold = getThr(p.cat);
    return { ...p, avgMonthly, monthsLeft, threshold };
  }), [checkable, getThr]);

  const nearOut = uM(() => enriched
    .filter(p => p.qty > 0 && p.qty <= p.threshold)
    .sort((a,b) => a.qty - b.qty),
    [enriched]);

  const outOfStock = uM(() => enriched
    .filter(p => p.qty === 0 && p.soldQty > 0)
    .sort((a,b) => b.soldRev - a.soldRev),
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
      if (p.qty <= 0) return null;                    // already out of stock B� different problem
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
          <div className="page-title">@
@"@�@@� & @�@�@�@�@�@"@@@�</div>
          <div className="page-sub">
            @
@@�@�@�@@�@@
@@�@�@�@@�@�@@�@@@ " @�@@�@�@@� MTO (@�@@�@�@@@�@@�@@	)
          </div>
        </div>
      </div>

      <div className="row row-5" style={{marginBottom: 20}}>
        <KPI label="@�@�@@�@@@ B� @
@@�@�@@�@@�" accent="#c2570a" icon={I.warning}
             value={fmtN(nearOut.length)} sub={`B� ${defaultThr} @�@@�@� (@�@@@�@�@@�)`}/>
        <KPI label="@@@@
@"@�@@�@�@@�@" accent="#b8341c" icon={I.alert}
             value={fmtN(outOfStock.length)} sub="@�@"@�@@@�@@@@@@�@@"/>
        <KPI label="@@@@�@@@"@�" accent="#8a3a8a" icon={I.alert}
             value={fmtN(declining.length)} sub="@�@@@@@@� > 60%"/>
        <KPI label="@
@@�@�@�@@�@@�@@�" accent="#a07417" icon={I.package}
             value={fmtN(slowMovers.length)} sub="@�@@ < 10% @�@@�@
@"@�@@�"/>
        <KPI label="@
@"@�@@�@�@�@@�@�@@�@�@�@�" accent="#1f6f8b" icon={I.layers}
             value={fmtN(overstocked.length)} sub="@�@@�@@ > 12 @�@@@@�"/>
      </div>

      {/* Threshold editor */}
      <Card title="B��O� @�@�@@@�@�@�@�@�@�@"@@@�" sub="@�@@@�@@
@"@�@@�@�@@@@@@@�@�@@�@@�@�@@� @@@�@�@�@@�@�@�@�@�@@�@
@@�@�@�@�@@�@"
            style={{marginBottom:16}}>
        <div style={{display:"flex",gap:18,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:12.5,fontWeight:600}}>@�@�@@@�@@@�@@�@�</span>
            <input type="number" value={defaultThr} min="1" max="500"
                   onChange={e=>setDefaultThr(parseInt(e.target.value)||36)}
                   style={{
                     width:80, padding:"7px 10px", borderRadius:8,
                     border:"1.5px solid var(--g-300)", background:"var(--g-50)",
                     fontSize:14, fontWeight:700, color:"var(--g-700)",
                     fontFamily:"inherit", textAlign:"center"
                   }}/>
            <span style={{fontSize:12,color:"var(--muted)"}}>@�@@�@�</span>
          </div>

          <div style={{height:24, width:1, background:"var(--bdr)"}}/>

          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:12.5,fontWeight:600}}>@@�@�@@�@�:</span>
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
                <span style={{fontSize:11,color:"var(--muted)"}}>@�@@�@�</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{fontSize:11,color:"var(--muted)",marginTop:10,paddingTop:10,borderTop:"1px dashed var(--bdr)"}}>
          P� @�@�@�@@�@�@�@�@@�@@@�@@�@@�@�@�@�@�@�@
@@�@�@�@@�@@�@�@�@@�@�/@@@�@@
@@� B� @"@@�@�@�@�@@@�@"@�@@�@@�@@@@@@@@�@�
        </div>
      </Card>

      {/* Filter tabs */}
      <div className="filter-bar" style={{marginBottom:8}}>
        <span className="filter-bar-label">@@@"@@</span>
        <div className="filter-chips">
          {[
            {id:"low",  label:`B��O� @�@�@@�@@@`,  count:nearOut.length,    color:"#c2570a"},
            {id:"out",  label:`P�� @@@@
@"@�@@�`, count:outOfStock.length,  color:"#b8341c"},
            {id:"drop", label:`P�� @@@@�@@@"@�`, count:declining.length,   color:"#8a3a8a"},
            {id:"slow", label:`P� @�@@�@@�`,    count:slowMovers.length,  color:"#a07417"},
            {id:"over", label:`P��O� @
@"@�@@�@�@�@@�`,count:overstocked.length, color:"#1f6f8b"},
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
          <span className="filter-bar-label">P��
 @@�@@�@@@�@�@@�@</span>
          <div style={{position:"relative",display:"flex",alignItems:"center",gap:6}}>
            <input list="supplier-list"
                   value={supplierFilter||""}
                   onChange={e => {
                     const v = e.target.value;
                     setSupplierFilter(allSuppliers.includes(v) ? v : null);
                     setPage(0);
                   }}
                   placeholder="@�@�@�@@@@@@@�@@@@�@@�@@�..."
                   style={{
                     padding:"7px 12px", borderRadius:9, fontSize:13,
                     border: supplierFilter ? "1.5px solid var(--g-600)" : "1px solid var(--bdr)",
                     background: supplierFilter ? "var(--g-50)" : "var(--paper)",
                     fontFamily:"inherit", minWidth:220, width:220,
                   }}/>
            <datalist id="supplier-list">
              {allSuppliers.map(s => {
                const cnt = rawList.filter(p => (p.lastSupplier||p.vendor)===s).length;
                return <option key={s} value={s}>{s} ({cnt} @@@@�@@)</option>;
              })}
            </datalist>
            {supplierFilter && (
              <button className="fchip" onClick={() => { setSupplierFilter(null); setPage(0); }}
                      style={{color:"var(--dang)",borderColor:"var(--dang)"}}>B�"</button>
            )}
          </div>
          {supplierFilter && (
            <span style={{fontSize:12,color:"var(--muted)"}}>
              {list.length} @@@@�@@@�@@� {rawList.length}
            </span>
          )}
        </div>
      )}

      {/* Search + result count */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:8,flex:"1 1 240px",minWidth:200,alignItems:"center"}}>
          <div style={{position:"relative",flex:1}}>
            <input value={stockSearch} onChange={e=>{setStockSearch(e.target.value);setPage(0);}}
                   placeholder="@�@�@�@@ SKU / @�@@�@ / @@@@..."
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
          @�@
@@� {page*STOCK_PAGE+1}B�{Math.min((page+1)*STOCK_PAGE, list.length)} @�@@� {list.length} @@@@�@@
        </span>
      </div>

      <Card padding={false}>
        <div style={{overflowX:"auto"}}>
          <table className="t t-stock">
            <thead><tr>
              <th style={{paddingLeft:20, width:56}}>@@@�</th>
              <th>@
@@�@�@�@</th>
              <th style={{width:140}}>@@@@</th>
              <th style={{width:120}}>@@�@@�@@@�@�@@�@</th>
              <th className="num" style={{width:120}}>@�@�@�@@@@</th>
              <th className="num" style={{width:90}}>@�@�@@@�</th>
              <th className="num" style={{width:90}}>@�@@/@�@@@@�</th>
              {role === 'owner' && <th className="num" style={{width:110}}>@@@@�@@�@@@</th>}
              <th className="num" style={{width:140}}>@
@@@�@</th>
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
                      {(p.lastSupplier || p.vendor) || <span style={{color:"var(--light)"}}>B�</span>}
                      {p.lastStockInDate && <div style={{fontSize:10,color:"var(--g-700)",marginTop:1}}>@�@�@�@ {p.lastStockInDate}</div>}
                    </td>
                    <td className="num">
                      <div style={{fontWeight:700, color:lvlColor, fontSize:14, lineHeight:1.2}}>{fmtN(p.qty)}</div>
                      {(p.qtyStore > 0 || p.qtyWH > 0) && (
                        <div style={{fontSize:10, color:"var(--muted)", marginTop:2}}>
                          @@�@@� {fmtN(p.qtyStore||0)} " @�@@@� {fmtN(p.qtyWH||0)}
                        </div>
                      )}
                    </td>
                    <td className="num" style={{fontSize:12,color:"var(--muted)"}}>B� {p.threshold}</td>
                    <td className="num">{p.avgMonthly>0?fmtN(p.avgMonthly):"B�"}</td>
                    {role === 'owner' && <td className="num" style={{fontWeight:600, color:"var(--g-700)"}}>{fmtB(p.soldRev)}</td>}
                    <td className="num">
                      {filter==='out'  && <span className="chip dang">@@@!</span>}
                      {filter==='low'  && (
                        p.qty < 12
                          ? <span className="chip dang">P�� @"@�@@�@
@�@�@@�@@� ({p.qty})</span>
                          : p.qty < 24
                            ? <span className="chip warn">B��O� @�@�@@�@"@�@@�@
@�@� ({p.qty})</span>
                            : <span className="chip warn">@�@@@@ {p.qty}/{p.threshold}</span>
                      )}
                      {filter==='drop' && <span className="chip" style={{background:"#f5e7f5",color:"#8a3a8a",borderColor:"#e6cde6"}}>@@ {p.dropPct.toFixed(0)}%</span>}
                      {filter==='slow' && <span className="chip info">{p.soldQty===0?"@�@@�@�@�@@�@@":`${(p.soldQty/p.qty*100).toFixed(1)}%`}</span>}
                      {filter==='over' && <span className="chip info">{p.monthsLeft.toFixed(1)} @�@@@@�</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <Empty icon={I.check} title="@@@@�@@@�@@!" sub="@�@@�@@@@@@�@@@�@�@�@@@�@@�@@�"/>}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:14}}>
          <button className="btn" disabled={page===0} onClick={()=>setPage(p=>p-1)}
                  style={{padding:"6px 14px",fontSize:12}}>
            B�� @�@�@@�@@�@�@
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
            @@@@�@� B�
          </button>
        </div>
      )}

      {modalP && <ProductModal p={modalP} onClose={() => setModalP(null)} allCats={allCats}/>}
    </div>
  );
}

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// TRENDS B� @
@@�@�@�@@�@
@@�@@�@@@ / @�@@@�@�@�@@�@@�@"@ / @@@�@@� / @�@@�@�@@@�@@
// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
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

  const enriched = uM(() => products.filter(p => !p.isMTO && p.cat && p.cat !== "@�@@�@@@@@@
@
@@�@�@�@"
                                                  && p.cat !== "Made to Order @�@@@�@�@�@�@@�@@	").map(p => {
    const m = p.monthly || [];
    let earlyAvg = 0, lateAvg = 0, soldMonths = 0;
    if (m.length >= 2) {
      const half = Math.floor(m.length / 2);
      earlyAvg = m.slice(0, half).reduce((s,x) => s + (x.qty||0), 0) / Math.max(half, 1);
      lateAvg  = m.slice(half).reduce((s,x) => s + (x.qty||0), 0) / Math.max(m.length - half, 1);
      soldMonths = m.filter(x => x.qty > 0).length;
    }
    const daysAgoStockIn = p.lastStockInISO
      ? (Date.now() - new Date(p.lastStockInISO).getTime()) / 86400000
      : null;
    return { ...p, earlyAvg, lateAvg, soldMonths, daysAgoStockIn };
  }), [products]);

  // P� @@@�@@� B� late > early # 1.4, has stock, sold this period
  const rising = uM(() => enriched
    .filter(p => p.earlyAvg >= 1 && p.lateAvg >= p.earlyAvg * 1.4 && p.qty > 0)
    .map(p => ({...p, growthPct: p.earlyAvg > 0 ? ((p.lateAvg/p.earlyAvg - 1) * 100) : 0}))
    .sort((a,b) => b.growthPct - a.growthPct),
    [enriched]);

  // P��" @
@@�@�@�@@�@@@�@�@�@@�@@�@"@ B� @�@�@�@@
@"@�@@�@�@� 60 @@@� @@@@@�@@@�@@�@�@�@� 1-2 @�@@@@�
  const newArrivals = uM(() => enriched
    .filter(p => {
      if (p.qty <= 0) return false;
      // @@ lastStockInISO @�@@@�@�@�@@�@� 60 @@@�
      if (p.daysAgoStockIn != null && p.daysAgoStockIn <= 60) return true;
      // @�@@�@@ lastStockInISO @�@"@�@�@@@�@@�@�@�@� 1-2 @�@@@@�@�@@� (@
@@�@�@�@@�@@@�)
      if (p.daysAgoStockIn == null && p.soldMonths <= 2 && p.soldQty > 0) return true;
      return false;
    })
    .map(p => ({
      ...p,
      growthPct: p.earlyAvg > 0 ? ((p.lateAvg / p.earlyAvg - 1) * 100) : 0,
    }))
    .sort((a, b) => {
      // @�@@@@�@"@@: @�@�@�@@�@@@�@
@@@�@�@@� @@�@@�@@�@@@@@�@�@�@�@ @�@@@@�@"@@@@@@�@@
      if (a.daysAgoStockIn != null && b.daysAgoStockIn != null) return a.daysAgoStockIn - b.daysAgoStockIn;
      if (a.daysAgoStockIn != null) return -1;
      if (b.daysAgoStockIn != null) return 1;
      return b.soldQty - a.soldQty;
    }),
    [enriched]);

  // P��� @
@@�@�@�@@�@
@@�@@�@@@@�@@�@"@@@ B� has stock but no/very low recent sales, no recent restock
  const fading = uM(() => enriched
    .filter(p => {
      if (p.qty <= 0) return false;
      if (p.soldMonths === 0) return true;   // never sold in tracked months
      if (p.soldQty === 0) return true;
      // sold in early but not in recent half
      const m = p.monthly || [];
      if (m.length < 4) return false;
      const half = Math.floor(m.length / 2);
      const earlySold = m.slice(0, half).reduce((s,x) => s + (x.qty||0), 0);
      const lateSold  = m.slice(half).reduce((s,x) => s + (x.qty||0), 0);
      return earlySold >= 2 && lateSold === 0;
    })
    .sort((a,b) => (b.qty * b.price) - (a.qty * a.price)),
    [enriched]);

  // P�� @�@@�@�@@@�@@ B� soldQty = 0, has stock
  const zeroSales = uM(() => enriched
    .filter(p => p.soldQty === 0 && p.qty > 0)
    .sort((a,b) => (b.qty * b.price) - (a.qty * a.price)),
    [enriched]);

  const sections = {
    rising:  { list: rising,       label: "P� @@@�@@�",          color: "#c2570a", desc: "@@@@�@@@�@@@�@�@@@@�@�@�@@�@ > 40% @�@@�@�@@@�@�@�@@�" },
    new:     { list: newArrivals,  label: "P��" @
@@�@�@�@@�@@@�@�@�@@�@@�@"@", color: "#705d96", desc: "@�@�@�@@
@"@�@@�@�@� 60 @@@� + @�@@@�@@@@@@" },
    fading:  { list: fading,       label: "P��� @�@
@@�@@�@@@@�@@�@"@@@",  color: "#b8341c", desc: "@�@�@@�@@ @�@"@�@�@@@�@�@@@@�@�@@@�@@�@�@@�@�@@" },
    zero:    { list: zeroSales,    label: "P�� @�@@�@�@@@�@@",       color: "#5b6b5e", desc: "@@@�@@�@�@�@
@"@�@@� @�@"@�@�@@@�@@�@�@@�@"@@@ 5 @�@@@@�" },
  };
  const cur = sections[section];
  const totalPages = Math.ceil(cur.list.length / PAGE);
  const paged = cur.list.slice(trendPage * PAGE, (trendPage + 1) * PAGE);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">@�@@@�@@�@
@@�@�@�@</div>
          <div className="page-sub">@@@�@�@@@@@�@�@@�@@@@�@@@�@@@@@@�@@@�@@�@@�@�@�@ B� @�@@@@�@
@@�@�@�@@�@�@@�@@@@@@@@@�@@@@</div>
        </div>
      </div>

      <div className="row row-4" style={{marginBottom:20}}>
        <KPI label="P� @@@�@@�" accent="#c2570a" icon={I.flame}
             value={fmtN(rising.length)} sub="@@@@�@@@�@@@@�@�@�@@�@"/>
        <KPI label="P��" @�@@@�@�@�@@�@@�@"@" accent="#705d96" icon={I.package}
             value={fmtN(newArrivals.length)} sub="@�@�@�@@
@"@�@@� B� 60 @@@�"/>
        <KPI label="P��� @�@
@@�@@�@@@" accent="#b8341c" icon={I.warning}
             value={fmtN(fading.length)} sub="@@@@@�@@@�@�@�@@@�@�@@@@�"/>
        <KPI label="P�� @�@@�@�@@@�@@" accent="#5b6b5e" icon={I.package}
             value={fmtN(zeroSales.length)} sub="0 @@@@�@@ " @@@�@@�"/>
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
        <b style={{color:cur.color}}>{cur.label}</b> B� {cur.desc} "
        @�@
@@� {trendPage*PAGE+1}B�{Math.min((trendPage+1)*PAGE, cur.list.length)} @�@@� {cur.list.length}
      </div>

      {cur.list.length === 0 ? (
        <Empty icon={I.check} title="@�@@�@@@@@@�@@" sub="@@@�@�@@�@�@�@
@@�@�@�@@�@�@�@@@�@@�@@�"/>
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
                <span className="chip" style={{
                  position:"absolute", top:6, left:6,
                  background:cur.color+"18", color:cur.color, borderColor:cur.color+"30"
                }}>
                  {section==='rising' && `+${p.growthPct.toFixed(0)}%`}
                  {section==='new'    && (p.daysAgoStockIn != null ? `${Math.floor(p.daysAgoStockIn)}d` : "@�@@@�")}
                  {section==='fading' && "@@@@@�@@"}
                  {section==='zero'   && "0 @�@@"}
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
                    P�& @�@�@�@@@�@@
@@ {p.lastStockInDate} " {p.lastSupplier || p.vendor || "B�"}
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",
                             paddingTop:6, borderTop:"1px dashed var(--bdr)"}}>
                  <div>
                    <div style={{fontSize:9.5,color:"var(--muted)",fontWeight:600,textTransform:"uppercase"}}>@�@�@�@@@@</div>
                    <div style={{fontSize:13,fontWeight:700}}>{fmtN(p.qty)} <span style={{fontSize:9.5,color:"var(--muted)"}}>@�@@�@�</span></div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:9.5,color:"var(--muted)",fontWeight:600,textTransform:"uppercase"}}>@�@@</div>
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
          <button className="btn" disabled={trendPage===0} onClick={()=>setTrendPage(p=>p-1)}>B�� @�@�@@�@@�@�@</button>
          <span style={{fontSize:12,color:"var(--muted)"}}>@@�@�@ {trendPage+1} / {totalPages}</span>
          <button className="btn" disabled={trendPage>=totalPages-1} onClick={()=>setTrendPage(p=>p+1)}>@@@@�@� B�</button>
        </div>
      )}

      {modalP && <ProductModal p={modalP} onClose={() => setModalP(null)} allCats={allCats}/>}
    </div>
  );
}

// B�B�B�B�B�B�B�B�B�B�B�B�B�B� Product detail modal B�B�B�B�B�B�B�B�B�B�B�B�B�B�
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
            border:"1px solid var(--bdr)", background:"#fff", borderRadius:8,
            width:32, height:32, cursor:"pointer", fontSize:18, color:"var(--muted)",
            fontFamily:"inherit"
          }}>#</button>
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
            }}>@�@@�@@@@@�@�@@�</div>
          )}

          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, fontSize:13}}>
            <div>
              <div style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em"}}>@@@@</div>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:3}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:catColor(p.cat, allCats)}}/>
                {p.cat || "B�"}
              </div>
            </div>
            <div>
              <div style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em"}}>@@�@@�@@@�@�@@�@</div>
              <div style={{marginTop:3}}>{p.lastSupplier || p.vendor || "B�"}</div>
              {p.lastStockInDate && (
                <div style={{marginTop:3, fontSize:11, color:"var(--g-700)", fontWeight:600}}>
                  P�& @�@�@�@@@�@@
@@ {p.lastStockInDate}
                </div>
              )}
            </div>
            <div>
              <div style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em"}}>@@�@�@@@�@@�</div>
              <div style={{marginTop:3, fontWeight:700}}>{fmtN(p.qtyStore || 0)} @�@@�@�</div>
            </div>
            <div>
              <div style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em"}}>@�@@@�</div>
              <div style={{marginTop:3, fontWeight:700}}>{fmtN(p.qtyWH || 0)} @�@@�@�</div>
            </div>
            <div style={{gridColumn:"1 / -1", paddingTop:8, borderTop:"1px dashed var(--bdr)"}}>
              <div style={{fontSize:10, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em"}}>@�@�@�@@@@@@@</div>
              <div style={{marginTop:3, fontSize:20, fontWeight:800, color:"var(--g-700)"}}>{fmtN(p.qty)} <span style={{fontSize:12, color:"var(--muted)", fontWeight:500}}>@�@@�@�</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// UPLOAD B� Smart file detection
// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
function UploadView({ onDataLoaded, currentData }) {
  const [files, setFiles] = uS([]);
  const [dragOver, setDragOver] = uS(false);
  const [processing, setProcessing] = uS(false);
  const [done, setDone] = uS(false);

  const detectFileType = (name, headers, titleRow, rawRows) => {
    const n = name.toLowerCase();
    const h = (headers || []).join("|").toLowerCase();
    // Filename takes precedence B� Zort exports are consistent
    if (n.includes("daily"))      return { type: "daily",       label: "@@@@�@@@@@@@@�",      color: "#2a9b56" };
    if (n.includes("monthly"))    return { type: "sales",       label: "@
@@@�@@@@�@@@@@@�@@@@�", color: "#1f7f44" };
    if (n.includes("transfer"))   return { type: "transfer",    label: "@@@@�@@@�@@�@
@@�@�@�@",    color: "#1f6f8b" };
    if (n.includes("product"))    return { type: "product",     label: "@�@�@@@@@
@@�@�@�@ (@
@"@�@@�)", color: "#a07417" };
    if (n.includes("transaction"))return { type: "transaction", label: "@@@@�@@@�@@�@@�@�@�@",     color: "#c2570a" };
    // Content-based fallback B� inspect title row column headers
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
          ? { type: "daily", label: "@@@@�@@@@@@@@�", color: "#2a9b56" }
          : { type: "sales", label: "@
@@@�@@@@�@@@@@@�@@@@�", color: "#1f7f44" };
      }
    }
    if (h.includes("@�@@�") && h.includes("@�@�"))
      return { type: "transfer", label: "@@@@�@@@�@@�@
@@�@�@�@", color: "#1f6f8b" };
    if (h.includes("@@@�@@�@@") && h.includes("@@@�@@�@@�@"))
      return { type: "product", label: "@�@�@@@@@
@@�@�@�@ (@
@"@�@@�)", color: "#a07417" };
    if (h.includes("@�@@�@"@@@"@�@"))
      return { type: "transaction", label: "@@@@�@@@�@@�@@�@�@�@", color: "#c2570a" };
    if (h.includes("@@@@�@@"))
      return { type: "sales", label: "@
@@@�@@@@�@@@@@@�@@@@�", color: "#1f7f44" };
    return { type: "unknown", label: "@�@@�@@@�@@�@@@�@�@", color: "#5b6b5e" };
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
          if (rows[i].some(c => String(c).includes("@@@@
") || String(c) === "#")) {
            headerRow = rows[i]; break;
          }
        }
        const detected = detectFileType(f.name, headerRow, rows[0]);
        parsed.push({ name: f.name, size: f.size, rows: rows.length,
                      rawRows: rows, headerRow, sheet: wb.SheetNames[0], ...detected });
      } catch(e) {
        parsed.push({ name: f.name, error: e.message, type: "error",
                      label: "@�@�@@@�@�@@�@�@@�@�@@�", color: "#b8341c" });
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
        alert("@�@@�@�@�@�@�@@�@�@�@@@@@
@@�@�@�@ (product*.xlsx) @�@@@@@@@�@�@@@@�@�@@�");
        setProcessing(false);
        return;
      }

      const allRows = productFile.rawRows;
      let hIdx = -1;
      for (let i = 0; i < Math.min(10, allRows.length); i++) {
        if (allRows[i].some(c => String(c).toLowerCase().includes("@@@@
") || String(c).toLowerCase() === "sku")) {
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

      const iSku      = colIdx(["@@@@
@
@@�@�@�@","sku","@@@@
"]);
      const iName     = colIdx(["@�@@�@@
@@�@�@�@","@�@@�@","name"]);
      const iCat      = colIdx(["@@@@@@@@�","@@@@","category"]);
      const iQtyStore = colIdx(["@@�@�@@@�@@�","store"]);
      const iQtyWH    = colIdx(["@�@@@�","warehouse","wh"]);
      const iQty      = colIdx(["@�@�@�@@@@@@@","@�@@�@@�@@@","@@@","@�@@�@@�","@�@�@�@@@@","qty","stock"]);
      const iPrice    = colIdx(["@@@�@@�@@","@@@�@","price"]);
      const iSupplier = colIdx(["@�@@�@"@@@"@�@","supplier","@@�@@�"]);
      const iImg      = colIdx(["imageurl","@@@�","image"]);

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
          const qtyStore = iQtyStore >= 0 ? (parseFloat(r[iQtyStore]) || 0) : 0;
          const qtyWH    = iQtyWH    >= 0 ? (parseFloat(r[iQtyWH])    || 0) : 0;
          const qtyTot   = iQty      >= 0 ? (parseFloat(r[iQty])      || 0) : (qtyStore + qtyWH);
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
        // Row 0: title B� month labels at col 4,6,8B� format "MM/YYYY"
        const titleRow = sRows[0] || [];
        const months = [];
        for (let c = 4; c < titleRow.length; c += 2) {
          const v = String(titleRow[c] || "").trim();
          if (/^\d{2}\/\d{4}$/.test(v)) months.push(v);
        }
        monthLabels = months;

        // Row 1: headers B� find SKU col (@@@@
 but not @@@@)
        const hdr = sRows[1] || [];
        const skuCol = hdr.findIndex(h => {
          const s = String(h).toLowerCase();
          return s.includes("@@@@
") && !s.includes("@@@@");
        });
        const catCol = hdr.findIndex(h => String(h).toLowerCase().includes("@@@@@@@@�"));

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
          return s.includes("@@@@
") && !s.includes("@@@@");
        });
        const catCol = hdr.findIndex(h => String(h).toLowerCase().includes("@@@@@@@@�"));

        const dData = dRows.slice(2).filter(r => r.some(c => c !== ""));
        for (const r of dData) {
          const sku = String(r[skuCol >= 0 ? skuCol : 1] || "").trim();
          const cat = String(r[catCol >= 0 ? catCol : 3] || "").trim();
          if (!sku) continue;

          const daily = [];
          for (let di = 0; di < days.length; di++) {
            const qtyCol = dayCols[di];
            const qtyVal = parseFloat(r[qtyCol])     || 0;
            const revVal = parseFloat(r[qtyCol + 1]) || 0;
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

      // --- Transaction detail (purchases in) B� supplier + last stock-in date ---
      const txFile = files.find(f => f.type === "transaction");
      const txMap = {}; // sku -> { lastDate, lastSupplier, count }
      if (txFile && txFile.rawRows) {
        const tRows = txFile.rawRows;
        // Find header row containing "@�@@@�@�@" and "@�@@�@"@@@"@�@"
        let tHdrIdx = -1;
        for (let i = 0; i < Math.min(5, tRows.length); i++) {
          const j = tRows[i].map(c => String(c).toLowerCase()).join("|");
          if (j.includes("@�@@@�@�@") && (j.includes("@�@@�@"@@@"@�@") || j.includes("@@@�@@@�"))) {
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
        const iType    = findCol(["@�@@@�@�@"]);
        const iContact = findCol(["@�@@�@@�@@�@"@@@"@�@","@�@@�@"@@@"@�@"]);
        const iDate    = findCol(["@@@�@@@�@@@@@@�@@","@@@�@@@�"]);
        const iSku     = findCol(["@@@@
@
@@�@�@�@","@@@@
","sku"]);

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
          if (iType >= 0 && !String(r[iType] || "").includes("@�@@�@@�@�@�@")) continue;
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

      // Build mtoGroups B� group by base name (strip #1, #2, trailing numbers)
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
        nWithStock: products.filter(p => p.qty > 0).length,
        totalStockValue: products.reduce((s, p) => s + p.qty * p.price, 0),
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
        thresholds: { default: 36, overrides: { "@�@�@�@@�@�@�@�@": 3, "@�@@�@@�@�@�@@@@@�@�@�": 3 } },
      };

      setDone(true);
      setProcessing(false);
      setTimeout(() => onDataLoaded && onDataLoaded(newData), 800);
    } catch(e) {
      alert("@�@�@@@�@�@@�@@@�@@@: " + e.message);
      setProcessing(false);
    }
  }, [files, onDataLoaded, currentData]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">@@@�@�@@@@�@�@@� Zort</div>
          <div className="page-sub">@@@�@�@@@@�@@�@@�@ "@�@@@@@@�@" B� Dashboard @�@@�@
@@�@�@�@@@@@�@@�@�@�@@�@@@�@@</div>
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
          {done ? "B�& @�@@@@@@�@@�@
@@�@�@�@@�@!" : "@@@�@�@�@@�@@@@@�@"@@�@�@@�"}
        </div>
        <div style={{fontSize:12, color:"var(--muted)", marginBottom:14}}>
          @@@@@�@@@�@�@�@@�@@�@@@@�@�@�@@� B� @@@�@@@�@@@@@�@�@@�@�@@�@@@�@@� (.xlsx, .xls, .csv)
        </div>
        <button className="btn primary" onClick={(e)=>{e.stopPropagation();document.getElementById("upfile").click();}}>
          {I.upload}<span>@�@@@@�@�@�@@�</span>
        </button>
        <input id="upfile" type="file" multiple accept=".xlsx,.xls,.csv"
               style={{display:"none"}}
               onChange={e=>handleFiles(e.target.files)}/>
      </div>

      <div className="row row-5" style={{marginTop: 20}}>
        {[
          { type:"product",  label:"@�@�@@@@@
@@�@�@�@ B�", desc:"product*.xlsx", hint:"@
@@�@@�@@@�@
@@ B� @
@"@�@@� + @@@�@", color:"#a07417"},
          { type:"sales",    label:"@@@@�@@@@@@�@@@@�", desc:"monthlySales*.xlsx", hint:"@@@@�@@@@@@@@@@"@�@@�@@@@�", color:"#1f7f44"},
          { type:"daily",    label:"@@@@�@@@@@@@@�", desc:"dailySales*.xlsx", hint:"@@@@�@@@@@@@@� 2 @@@�@@�@@
@@", color:"#2a9b56"},
          { type:"transaction", label:"@@@@�@@@�@@�@@�@�@�@", desc:"transactionDetail*.xlsx", hint:"@@@�@
@@�@�@�@@�@�@�@ + @@�@@�@@@�@�@@�@", color:"#c2570a"},
          { type:"transfer", label:"@@@@�@@@�@@�", desc:"transferDetail*.xlsx", hint:"@�@@�@�@@�@�@@@� B� @@�@@�", color:"#1f6f8b"},
        ].map(g => {
          const uploaded = files.find(f => f.type === g.type);
          return (
            <div key={g.type} className="card" style={{borderTop:`3px solid ${g.color}`, position:"relative"}}>
              {uploaded && (
                <span className="chip" style={{position:"absolute",top:12,right:12,background:g.color+"18",color:g.color}}>
                  {React.cloneElement(I.check,{size:11})} @@@�@�@@@@�@@�@
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
        <Card title={`@�@�@@�@@@�@@@�@�@@@ (${files.length})`} sub="@@@�@�@"@@@�@�@@�@�@@@�@�@@@@"@�@�@@@"@" style={{marginTop:24}}
              action={
                <button className="btn primary" onClick={processFiles} disabled={processing}>
                  {processing ? <span className="spin" style={{width:14,height:14,borderWidth:2}}/> : I.refresh}
                  <span>{processing ? "@�@@@@�@�@@@@@@�@B�" : "@�@@@@@@�@@�@�@@@@"}</span>
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
                    {f.rows ? `${(f.rows-1).toLocaleString()} @�@@ " ` : ""}
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
            P� @"@�@@�@@@�@�@@� <b>product*.xlsx</b> @�@�@�@�@@@@� B� @�@�@@�@@@�@�@�@
@@@@�@�@@@@@@@@�@@
          </div>
        </Card>
      )}
    </div>
  );
}

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// CONNECT B� Google Sheets setup
// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
function ConnectView({ sheetUrl, sheetViewUrl, syncing, lastSync, source, onSync, onClearLocal }) {
  const [url, setUrl] = uS(sheetViewUrl || "");

  const lastSyncLabel = (() => {
    if (!lastSync) return "@@@�@�@@� sync";
    const dt = new Date(lastSync);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  })();

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">@�@�@@�@@ Google Sheet</div>
          <div className="page-sub">@�@�@�@�@�@�@�@�@@@�@�@�@�@@@@@@@@� B� @�@ Sync @�@�@@�@@�@@@@�@�@@@@@�@@@�@�@@� Sheet</div>
        </div>
      </div>

      <Card style={{marginBottom: 18}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,flexWrap:"wrap"}}>
          <div style={{width:42,height:42,borderRadius:10,background:"var(--g-100)",color:"var(--g-700)",
                       display:"flex",alignItems:"center",justifyContent:"center"}}>
            {React.cloneElement(I.sheets,{size:20})}
          </div>
          <div style={{flex:1, minWidth:200}}>
            <div style={{fontSize:14, fontWeight:700}}>Doomuenjing B� Inventory Master</div>
            <div style={{fontSize:11.5, color:"var(--muted)"}}>
              {source === "upload"
                ? <>@�@�@� <b style={{color:"#a07417"}}>@�@�@@�@@@�@@@�@�@@@</b> " @�@@�@@@� {lastSyncLabel}</>
                : <>@�@�@@�@@@�@@�@ " sync @@�@@
@@ {lastSyncLabel}</>}
            </div>
          </div>
          <span className="chip" style={source==="upload" ? {background:"#fef3e7",color:"#a07417",borderColor:"#f5dec0"} : {}}>
            <span style={{width:6,height:6,borderRadius:"50%",
                          background: source==="upload" ? "#a07417" : "var(--g-500)",
                          boxShadow:`0 0 0 3px ${source==="upload" ? "rgba(160,116,23,.18)" : "rgba(42,155,86,.18)"}`}}></span>
            {source === "upload" ? "@�@�@@�@@@�@�@@@ (@@@� Sheet)" : "@�@�@@�@@@"@�@@�@@�@"}
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
            <span>{syncing ? "@�@@@@� Sync..." : "Sync @�@@@�@@@�@@�"}</span>
          </button>
          <button className="btn primary"
                  onClick={() => window.open(url || sheetViewUrl, "_blank", "noopener")}>
            {I.link}<span>@�@�@@ Sheet</span>
          </button>
        </div>

        {source === "upload" && (
          <div style={{marginTop:14,padding:"12px 14px",borderRadius:10,background:"#fef3e7",
                       border:"1px solid #f5dec0",fontSize:12,color:"#a07417",
                       display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{flex:1, minWidth:200}}>
              <b>@�@@@@�@�@�@�@�@�@@@@@�@@�@�@�@@�@@@�@@@�@�@@@</b> B� Dashboard @�@@�@�@�@�@�@@�@�@@�@�@�@�@@�@@�@@@@�@�@@@@�@@@�@@@@@@�@@�@�@�@@@@
            </div>
            <button className="btn" onClick={onClearLocal}
                    style={{fontSize:11.5,padding:"6px 12px"}}>
              {React.cloneElement(I.x,{size:13})}<span>@@�@@� " @�@@@�@�@�@�@�@� Sheet</span>
            </button>
          </div>
        )}
      </Card>

      <div className="row row-2">
        <Card title="@�@�@@�@
@@�@@�@�@�@@@@@@@�@@�@@�@@@"@�@�@@@"@" sub="@@@�@�@�@@@ sheet @�@@@�@@�@@�@�@� Google Sheet">
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[
              ["Products", "@
@@�@�@�@@@@�@�@@@ + @
@"@�@@� + @@@�@ + imageUrl", "5,485 @�@@", "var(--g-600)"],
              ["MonthlySales", "@@@@�@@@@@@�@@@@� # @@@@", "1,971 @�@@", "var(--g-500)"],
              ["Transfers", "@@@@�@@@�@@�@
@@�@�@�@@@@@@�@@�@�@@@�", "956 @�@@", "var(--info)"],
              ["Purchases", "@@@@�@@@�@@�@@�@�@�@ + vendor", "671 @�@@", "var(--warn)"],
            ].map(([name, desc, rows, color]) => (
              <div key={name} style={{display:"flex",alignItems:"center",gap:12,padding:12,
                                       borderRadius:10,background:"#fafcf7",border:"1px solid var(--bdr)"}}>
                <div style={{width:8,alignSelf:"stretch",borderRadius:4,background:color}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:700}}>{name}</div>
                  <div style={{fontSize:11, color:"var(--muted)"}}>{desc}</div>
                </div>
                <div className="mono" style={{fontSize:11,color:"var(--muted)"}}>{rows}</div>
                <span className="chip">{React.cloneElement(I.check, {size: 12})}@@�@@�@�@@�@</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:14, padding:"12px 14px", borderRadius:10, background:"var(--g-50)",
                       border:"1px solid var(--g-100)", fontSize:12, color:"var(--g-800)"}}>
            <b style={{color:"var(--g-700)"}}>P� @@@�@
@@�@�@�@:</b> @�@�@@�@@�@@@@@�@� <span className="mono" style={{background:"#fff",padding:"1px 6px",borderRadius:4}}>imageUrl</span> @�@� Products sheet B�
            @@@� URL @�@@�@@@� (Google Drive / Imgur / Cloudinary) @�@@�@@@@�@�@�@@�@
@@�@�@�@�@@@�@@@@�@�@�
          </div>
        </Card>

        <Card title="@�@@�@@@�@�@�@�@@@@�@�@@�" sub="3 @�@� " Doomuenjing team">
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[
              ["@�@@ (Owner)", "you@doomuenjing.com", "Admin"],
              ["@�@�@�@@�@@� 1", "owner1@doomuenjing.com", "Editor"],
              ["@�@�@�@@�@@� 2", "owner2@doomuenjing.com", "Editor"],
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
              {I.user}<span>@�@�@@�@�@@�@�@�@�</span>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// STORAGE VIEW B� Phase 2: Visual warehouse grid (A1B�B10 # 15 locks each)
// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
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
  // @"@@@"@@ SKU @@@�@@@�@@�@@@�@�@@�@@�@@� (session-level) @�@�@@�@@@@�@�@@" ShelfBlock @
@
  // { "A10/10": Set(["RT19085"]), ... }
  const [deletedFromLocks, setDeletedFromLocks] = uS({});
  const handleDeleteFromLock = uC((lockKey, sku) => {
    setDeletedFromLocks(prev => {
      const prevSet = prev[lockKey] || new Set();
      return { ...prev, [lockKey]: new Set([...prevSet, sku]) };
    });
  }, []);

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
      const deleted = deletedFromLocks[key] || new Set();
      const skus = productLockMap[key].filter(s => !deleted.has(s));
      if (skus.length > 0)
        merged[key] = { skus, verified: false, entries: [], mismatch: false };
    });
    Object.keys(verifiedLockMap).forEach(key => {
      const deleted = deletedFromLocks[key] || new Set();
      const verifiedEntries = verifiedLockMap[key].filter(v => !deleted.has(v.sku));
      const verifiedSkus = verifiedEntries.map(v => v.sku);
      const mismatch = verifiedEntries.some(v => {
        const sysP = products.find(p => p.sku === v.sku);
        const sysQty = sysP ? sysP.qty : v.sysQty;
        return sysQty != null && v.qty != null && v.qty !== sysQty;
      });
      const baseSkus = merged[key] ? merged[key].skus : [];
      const allSkus = [...new Set([...baseSkus, ...verifiedSkus])];
      if (allSkus.length > 0)
        merged[key] = { skus: allSkus, verified: verifiedEntries.length > 0, mismatch, entries: verifiedEntries };
      else
        delete merged[key]; // @@�@@�@@�@@�@�@@�@ B� @�@@�@�@
@@�@�@� lockData B� ShelfBlock @
@@�@@
    });
    // Apply local overrides
    Object.keys(lockOv).forEach(key => {
      const deleted = deletedFromLocks[key] || new Set();
      const ovSkus = (lockOv[key] || []).filter(s => !deleted.has(s));
      if (ovSkus.length === 0) return;
      if (!merged[key]) merged[key] = { skus: ovSkus, verified: false, entries: [], mismatch: false, localOnly: true };
      else merged[key] = { ...merged[key], skus: [...new Set([...merged[key].skus, ...ovSkus])] };
    });
    return merged;
  }, [verifiedLockMap, productLockMap, lockOv, deletedFromLocks]);

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
    });
    return matches;
  }, [searchSku, lockData]);

  const sides = side === 'all' ? ['A', 'B'] : [side];

  return (
    <div className="storage-view">
      <div className="row row-4" style={{marginBottom:16}}>
        <KPI label="@@�@@�@@@�@�@�@�@�@@�@" value={`${fmtN(usedCount)}/${fmtN(totalLocks)}`}
             sub={`${(usedCount/totalLocks*100).toFixed(1)}% @�@@�@�@@@�`}
             accent="#1f7f44" icon={I.package}/>
        <KPI label="@�@�@�@�@�@@�@ (manual)" value={fmtN(verifiedCount)}
             sub={`${usedCount > 0 ? (verifiedCount/usedCount*100).toFixed(0) : 0}% @�@@�@@@�@�@�@�`}
             accent="#4fb472" icon={I.check}/>
        <KPI label="@@�@@�@@@�@�@@�@"@@�@@@�@�" value={fmtN(mismatchCount)}
             sub={mismatchCount > 0 ? "@"@�@@�@"@@@�@
@@�" : "@�@�@"@"}
             accent={mismatchCount > 0 ? "#b8341c" : "#5c8a3c"} icon={I.warning}/>
        <KPI label="@@@�@�@@�@@@�@@@�@@�" value={fmtN(unassigned.length)}
             sub="@"@�@@�@�@�@�@@@�@�@�@�@�"
             accent="#a07417" icon={I.alert}/>
      </div>

      <Card title="P�� @�@�@�@�@@�@�@@@�@
@@�@�@�@"
            sub={`@�@@�@� A: ${shelves.A} @�@@�@� " @�@@�@� B: ${shelves.B} @�@@�@� " ${shelves.locksPerShelf} @@�@@�/@�@@�@�`}
            action={
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <input type="text" placeholder="P�� @�@�@�@@ SKU..."
                       value={search} onChange={e => setSearch(e.target.value)}
                       style={{padding:"6px 10px",border:"1px solid var(--bdr)",
                              borderRadius:8,fontSize:12,width:160}}/>
                <Seg value={side} onChange={setSide} options={[
                  {value:'A',label:'@�@@�@� A'},{value:'B',label:'@�@@�@� B'},{value:'all',label:'@@@�@�@@@'},
                ]}/>
              </div>
            }>
        {searchSku && (
          <div style={{marginBottom:12,padding:"8px 12px",background:"#fff8e1",
                       borderRadius:8,fontSize:12,border:"1px solid #ffe082"}}>
            {searchMatches.size > 0
              ? <>@�@� <b>{searchMatches.size}</b> @@�@@�@@@�@@ "{searchSku}" B� @�@@@@�@@�@@�@�@@�@@"@�@
@�@@�@�@@�@@@@@@@@@�@@@@</>
              : <span style={{color:"var(--muted)"}}>@�@@�@�@� SKU "{searchSku}" @�@�@@�@@�@�@@�@@</span>}
          </div>
        )}

        <div style={{display:"flex",gap:14,fontSize:11,color:"var(--muted)",
                     marginBottom:14,flexWrap:"wrap"}}>
          <span><i className="lock-legend lock-verified"/> @�@�@�@�@�@@�@ (@"@@�)</span>
          <span><i className="lock-legend lock-master"/> @@@�@�@@@�@�</span>
          <span><i className="lock-legend lock-mismatch"/> @�@@�@"@@�@@@�@�</span>
          <span><i className="lock-legend lock-empty"/> @@�@@�</span>
          <span><i className="lock-legend lock-search"/> @�@@�@�@�@@</span>
        </div>

        <div className="shelf-wrap">
          {sides.map(s => (
            <div key={s} className="shelf-side">
              <div className="shelf-side-label">@�@@�@� {s}</div>
              <div className="shelf-row">
                {Array.from({length: shelves[s] || 10}, (_, i) => (
                  <ShelfBlock key={`${s}${i+1}`}
                              side={s} shelf={i+1}
                              locks={shelves.locksPerShelf || 15}
                              lockData={lockData}
                              searchMatches={searchMatches}
                              onClick={setSelectedLock}
                              allowEmpty={true}/>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {unassigned.length > 0 && (
        <Card title={`B��O� @
@@�@�@�@@@@�@�@@�@@@�@@@�@@� (${fmtN(unassigned.length)} SKU)`}
              sub="@
@@�@�@�@@@@�@@@�@�@@�@@@"@@�@@�@�@�@�@@@�@�@�@�@�@�@@@�@� B� @"@�@@�@�@@@�@�@�@�@�@�@@@�@@@�@@�@�@@"
              style={{marginTop:16}}>
          <details>
            <summary style={{cursor:"pointer",color:"var(--g-700)",fontSize:13,fontWeight:600}}>
              @@@@@@�@@ SKU
            </summary>
            <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:6,
                         maxHeight:300,overflowY:"auto",padding:4}}>
              {unassigned.slice(0, 300).map(sku => {
                const p = productMap[sku];
                return (
                  <span key={sku} className="skucode"
                        title={p ? p.name : sku}
                        style={{fontSize:10,cursor:p?"pointer":"default"}}>
                    {sku}
                  </span>
                );
              })}
              {unassigned.length > 300 && (
                <span style={{fontSize:11,color:"var(--muted)"}}>
                  ... @�@@@@@� {fmtN(unassigned.length - 300)} SKU
                </span>
              )}
            </div>
          </details>
        </Card>
      )}

      {selectedLock && (
        <LockModal lockKey={selectedLock}
                   data={lockData[selectedLock] || { skus:[], verified:false, entries:[], mismatch:false }}
                   productMap={productMap}
                   products={products}
                   lockOv={lockOv[selectedLock] || []}
                   onUpdateLock={(skus) => handleUpdateLock(selectedLock, skus)}
                   onDeleteFromLock={handleDeleteFromLock}
                   onClose={() => setSelectedLock(null)}/>
      )}

      <style>{`
        .shelf-wrap { display:flex; flex-direction:column; gap:20px; }
        .shelf-side-label { font-weight:700; font-size:14px; color:var(--g-700); margin-bottom:10px;
                            padding-bottom:6px; border-bottom:2px solid var(--g-100); }
        .shelf-row { display:grid; grid-template-columns:repeat(10, minmax(0, 1fr)); gap:8px;
                     align-items:start; }
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
        }
        @media (max-width: 600px) {
          .shelf-row { grid-template-columns:repeat(2, 1fr); }
          .lock { font-size:9px; }
          .shelf-block { padding:4px; }
          .lock-grid { gap:1px; }
        }
      `}</style>
    </div>
  );
}

function ShelfBlock({ side, shelf, locks, lockData, searchMatches, onClick, allowEmpty }) {
  const cells = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const num = col * 3 + row + 1;
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
             title={d ? `${key} " ${d.skus.length} SKU${d.mismatch?' " @
@"@�@@�@�@@�@"@@�':''}` : `${key} " @@�@@� (@�@@�@�@@�@@�@�@@�@@
@@�@�@�@)`}>
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
        position:"absolute", top:20, right:20,
        background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)",
        color:"#fff", borderRadius:8, width:36, height:36,
        cursor:"pointer", fontSize:18, fontFamily:"inherit"
      }}>#</button>
    </div>
  );
}

// B�B�B� QR Scanner (html5-qrcode B� @@@�@@@�@@@� browser: iOS Safari, Android, Desktop) B�B�B�
function QRScanModal({ onDetected, onClose }) {
  const scannerRef = React.useRef(null);
  const containerId = React.useMemo(() => `qr-reader-${Math.random().toString(36).slice(2,9)}`, []);
  const [err, setErr] = uS(null);
  const [lastSku, setLastSku] = uS(null);
  const [ready, setReady] = uS(false);
  const lastDetectRef = React.useRef({ sku:null, t:0 });

  uE(() => {
    if (!window.Html5Qrcode) {
      setErr("@�@@�@
@@@@@@�@@@ library scanner @�@@�\n@�@@@@@"@@@�@
@@� internet @�@@�@@�@@@@@�@�@@�@@�@�@@@�");
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
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.333 },
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
        if (!cancelled) setErr("@�@@�@
@@@@@@�@�@@@�@@�@@�@�@@�: " + (e?.message || e) + "\n@"@@@�@
@@�@@�@@@�@@�@@" permission @�@@�@@�@�@@�@");
      }
    };

    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop().then(() => s.clear()).catch(() => {});
      }
    };
  }, []);

  const handleClose = () => {
    const s = scannerRef.current;
    if (s) s.stop().then(() => s.clear()).catch(() => {});
    onClose();
  };

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
            @
@�@�@� Barcode / QR Code
          </div>
          <button onClick={handleClose} style={{
            border:"1px solid var(--bdr)",background:"none",borderRadius:8,
            width:32,height:32,cursor:"pointer",fontSize:18,color:"var(--muted)",fontFamily:"inherit"
          }}>#</button>
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
              }}>@�@@@@�@�@�@@@�@@�@@�B�</div>
            )}
          </div>
        )}

        {lastSku && (
          <div style={{
            marginTop:12,padding:"8px 14px",background:"#e8f5e9",borderRadius:8,
            fontSize:13,fontWeight:700,color:"var(--g-700)",textAlign:"center",
          }}>
            B� @
@�@�@�@�@@�: {lastSku}
          </div>
        )}
        <div style={{marginTop:10,fontSize:11,color:"var(--muted)",textAlign:"center"}}>
          @�@@�@@@�@@@�@@�@
@@�@� " @
@�@�@�@�@@�@"@�@@�@�@@�@@� " @@@�@@@� iPhone/Android/PC
        </div>
      </div>
    </div>
  );
}

// B�B�B� Reusable ScanButton B�B�B�
function ScanButton({ onScan, continuous = false, size = 36, style: extraStyle }) {
  const [open, setOpen] = uS(false);
  const handleDetected = (sku) => {
    onScan(sku.trim().toUpperCase());
    if (!continuous) setOpen(false);
  };
  const iconSize = Math.round(size * 0.52);
  return (
    <>
      <button onClick={() => setOpen(true)} title="@
@�@�@� Barcode / QR Code" style={{
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

// B�B�B� sync lock data to "@"@@�@@�@�@�@�@@@�@�@�@�" sheet B�B�B�
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

function LockModal({ lockKey, data, productMap, products, lockOv, onUpdateLock, onDeleteFromLock, onClose }) {
  const [lightbox, setLightbox] = uS(null);
  const [editMode, setEditMode] = uS(false); // @�@�@@/@�@@ add-SKU panel
  const [addSku, setAddSku] = uS("");
  const [saving, setSaving] = uS(false);
  const [savedSkus, setSavedSkus] = uS(new Set());
  // @�@�@�@�@�@@@�: { sku: qty } B� @�@@@�@�@@�@@@� SKU
  const [checkedQtys, setCheckedQtys] = uS(() => {
    const init = {};
    (data.entries || []).forEach(e => { init[e.sku] = e.qty ?? ""; });
    return init;
  });
  // @"@@@"@@ SKU @@@�@�@�@@�@�@�@�@@�@@�@@@� (isNew = true @
@@@@@� append row @�@� sheet)
  const [newSkus, setNewSkus] = uS(new Set());
  // @"@@@"@@ SKU @@@�@@�@@@�@�@@�@ (@�@�@@�@�@@� UI @@@�@@@@@@� API @
@@�@@�@�)
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

  const handleDelete = async (sku, isLocal) => {
    if (!confirm(`@@� ${sku} @@@�@�@@�@@�@@� ${lockKey}?\n\n@�@�@@@@@�@@@@�@@�@@@�@�@@� sheet "@"@@�@@�@�@�@�@@@�@�@�@�" @�@@@�@�`)) return;
    if (isLocal) {
      // @�@�@@�@�@�@�@@�@@�@@� @@@�@�@@�@�@@�@�@@�@@@�@@� sheet B� @@�@�@�@�@�@� UI
      onUpdateLock(lockOv.filter(s => s !== sku));
      setNewSkus(prev => { const n = new Set(prev); n.delete(sku); return n; });
      setCheckedQtys(prev => { const n = {...prev}; delete n[sku]; return n; });
    } else {
      // @@@�@@� sheet B� @�@@@@� API @@�@�@@
      const result = await syncDeleteLockEntry(lockKey, sku);
      if (result.success !== false) {
        setDeletedSkus(prev => new Set([...prev, sku]));
        setCheckedQtys(prev => { const n = {...prev}; delete n[sku]; return n; });
        setSavedSkus(prev => { const n = new Set(prev); n.delete(sku); return n; });
        // @@�@@@�@�@@� lockOv @@�@@ @@�@@@@@@@�
        if (ovSet.has(sku)) onUpdateLock(lockOv.filter(s => s !== sku));
        // @�@�@�@� StorageView @�@@�@@@�@�@@"@
@ ShelfBlock @@@�@@
        if (onDeleteFromLock) onDeleteFromLock(lockKey, sku);
      } else {
        alert("@@�@�@@�@
@@�@@�@�: " + (result.error || "@"@@@�@
@@� SHEET_DEPLOY_URL"));
      }
    }
  };

  const handleSave = async () => {
    // @@@ entries @@@�@@@�@�@ (@�@�@�@�@�@@@�)
    const entries = Object.entries(checkedQtys)
      .filter(([, v]) => v !== "" && v !== null && v !== undefined)
      .map(([sku, qty]) => ({ sku, qty: parseInt(qty) || 0, isNew: newSkus.has(sku) }));
    if (entries.length === 0) { alert("@@@�@�@@�@�@@�@�@@@�@�@@�@@�@�@�@�@�@�@@@�"); return; }
    setSaving(true);
    const result = await syncLockData(lockKey, entries);
    setSaving(false);
    if (result.success !== false) {
      const done = new Set([...savedSkus, ...entries.map(e => e.sku)]);
      setSavedSkus(done);
      setNewSkus(new Set());
      alert(`B�& @�@@�@@@� ${entries.length} @@@@�@@@�@@@@�@@�@@`);
    } else {
      alert("@�@@�@@@�@�@@�@
@@�@@�@�: " + (result.error || "@"@@@�@
@@� SHEET_DEPLOY_URL"));
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
              @"@@�@@�@�@�@�@@@�@�@�@�
            </div>
            <div style={{fontSize:20, fontWeight:700, lineHeight:1.3}}>P� @@�@@� {lockKey}</div>
            <div style={{fontSize:12, color:"var(--muted)", marginTop:4}}>
              {data.skus.length} SKU " {data.verified ? "@�@�@�@�@�@@�@ manual" : "@�@�@@@@@�@@�@@@�@� (@@@�@�@@�@�@@�@�@�@�@�)"}
              {data.mismatch && <span style={{color:"var(--dang)",marginLeft:8,fontWeight:600}}>B��O� @
@"@�@@�@�@@�@"@@�</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={handleSave}
              disabled={saving}
              style={{
                border:"1.5px solid var(--g-300)",
                background:"var(--g-700)",
                color:"#fff",
                borderRadius:8, padding:"5px 12px",
                cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                opacity: saving ? 0.6 : 1,
              }}>
              {saving ? "B� @�@@@@�@�@@�@@@�..." : "P� @�@@�@@@�"}
            </button>
            <button onClick={() => setEditMode(e => !e)}
              style={{
                border:"1.5px solid var(--g-300)",
                background: editMode ? "#f0fdf4" : "#fff",
                color:"var(--g-700)",
                borderRadius:8, padding:"5px 12px",
                cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
              }}>
              {editMode ? "B� @�@
@@�@�" : "B��O� @�@�@@�@@
@@�@�@�@"}
            </button>
            <button onClick={onClose} style={{
              border:"1px solid var(--bdr)", background:"#fff", borderRadius:8,
              width:32, height:32, cursor:"pointer", fontSize:18, color:"var(--muted)", fontFamily:"inherit"
            }}>#</button>
          </div>
        </div>

        {/* Add SKU panel B� shown in edit mode */}
        {editMode && (
          <div style={{padding:"12px 20px",background:"#f0fdf4",borderBottom:"1px solid var(--bdr)",
                       display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--g-700)",marginRight:4}}>+ @�@�@@�@@
@@�@�@�@:</div>
            <input list="lock-sku-list" value={addSku}
              onChange={e => setAddSku(e.target.value)}
              onKeyDown={e => e.key==="Enter" && addToLock()}
              placeholder="@�@@@�@� SKU @@@@@�@@�@@
@@�@�@�@..."
              style={{
                flex:1, minWidth:180, padding:"7px 12px", borderRadius:8,
                border:"1.5px solid var(--g-300)", fontSize:13, fontFamily:"inherit",
              }}/>
            <datalist id="lock-sku-list">
              {(products||[]).map(p => <option key={p.sku} value={p.sku}>{p.sku} B� {p.name}</option>)}
            </datalist>
            <button onClick={() => addToLock()} style={{
              padding:"7px 16px", borderRadius:8, border:"none",
              background:"var(--g-700)", color:"#fff",
              cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"inherit",
            }}>@�@�@@�@</button>
            <ScanButton size={38} continuous onScan={handleScanDetected}
              style={{border:"1.5px solid var(--g-300)"}}/>
          </div>
        )}

        <div style={{padding:20}}>
          {prods.length === 0 ? (
            <div style={{textAlign:"center", padding:"40px 20px", color:"var(--muted)"}}>
              <div style={{fontSize:32, marginBottom:12}}>P�</div>
              <div style={{fontWeight:600, fontSize:14, marginBottom:6}}>@@�@@�@�@@�@@�@@�@�@�@@�@</div>
              <div style={{fontSize:12}}>@�@@�@@�@ B��O� @�@�@@�@@
@@�@�@�@ @�@�@@�@@�@�@@�@@
@@�@�@�@@�@�@�@@@�@@�</div>
            </div>
          ) : (
          <table className="t">
            <thead><tr>
              <th>@
@@�@�@�@</th>
              <th className="num">@�@�@�@@@@<br/><span style={{fontWeight:400,fontSize:10,color:"var(--muted)"}}>@�@�@@@�@�</span></th>
              <th className="num">@�@�@�@�@�@@@�<br/><span style={{fontWeight:400,fontSize:10,color:"var(--muted)"}}>@�@@@�@�@�@@�@@�@@�@@@�</span></th>
              <th>@
@@@�@</th>
            </tr></thead>
            <tbody>
              {prods.map(({sku, p, isLocal}) => {
                // @�@�@�@@@@ = read-only @�@@� warehouseQty (sheet @@@�@�@@@�@@�@@�@
@@�@�@�@ col H)
                const warehouseQty = p ? (p.warehouseQty ?? p.qty) : null;
                const checkedVal = checkedQtys[sku];
                const isSaved = savedSkus.has(sku);
                // @
@@@�@: @�@�@@@@�@�@@@@� checkedQtys @�@@� warehouseQty
                const hasChecked = checkedVal !== "" && checkedVal !== undefined && checkedVal !== null;
                const checkedNum = hasChecked ? (parseInt(checkedVal) || 0) : null;
                const hasData = warehouseQty !== null && checkedNum !== null;
                const matched = hasData && warehouseQty === checkedNum;
                const diff    = hasData ? checkedNum - warehouseQty : null;

                return (
                  <tr key={sku} style={{background: isSaved ? "#f0fdf4" : undefined}}>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        {p && p.imageUrl ? (
                          <div onClick={() => setLightbox({url:p.imageUrl, name:p.name})}
                               style={{width:52,height:52,borderRadius:8,
                                       backgroundImage:`url("${p.imageUrl}")`,
                                       backgroundSize:"contain",backgroundPosition:"center",
                                       backgroundRepeat:"no-repeat",backgroundColor:"#fff",
                                       border:"1px solid var(--bdr)",flexShrink:0,
                                       cursor:"zoom-in", transition:"transform .15s, box-shadow .15s"}}
                               onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.1)";e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.15)"}}
                               onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow=""}}
                               title="@�@@@�@�@�@@�@@�@@@@@@�"/>
                        ) : (
                          <div style={{width:52,height:52,borderRadius:8,background:"var(--g-50)",
                                       border:"1px solid var(--bdr)",flexShrink:0,
                                       display:"flex",alignItems:"center",justifyContent:"center",
                                       fontSize:18,color:"var(--g-300)"}}>P�</div>
                        )}
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <span className="skucode" style={{fontSize:10}}>{sku}</span>
                            {isLocal && <span style={{fontSize:9,background:"#e8f5e9",color:"var(--g-700)",
                              borderRadius:10,padding:"1px 6px",fontWeight:700}}>+ @�@�@@�@@�@@�</span>}
                            {isSaved && <span style={{fontSize:9,background:"#dcfce7",color:"#166534",
                              borderRadius:10,padding:"1px 6px",fontWeight:700}}>B� @�@@�@@@�@�@@�@</span>}
                          </div>
                          <div style={{fontWeight:500,marginTop:2,fontSize:13}}>
                            {p ? p.name : <span style={{color:"var(--muted)",fontStyle:"italic"}}>@�@@�@�@�@�@�@@@�@�</span>}
                          </div>
                        </div>
                        <button onClick={() => handleDelete(sku, isLocal)}
                          title="@@�@@@�@�@@�@@�@@�@�@@�"
                          style={{marginLeft:8,background:"#fee2e2",border:"none",
                            borderRadius:6,cursor:"pointer",color:"#e53e3e",
                            fontWeight:700,fontSize:14,padding:"2px 8px",fontFamily:"inherit",
                            flexShrink:0}}>#</button>
                      </div>
                    </td>

                    {/* @�@�@�@@@@ B� read-only @�@
@@ */}
                    <td className="num" style={{fontWeight:600}}>
                      <span style={{color: warehouseQty != null && warehouseQty < 0 ? "var(--dang)" : undefined}}>
                        {warehouseQty != null ? fmtN(warehouseQty) : "B�"}
                      </span>
                    </td>

                    {/* @�@�@�@�@�@@@� B� editable input @�@
@@ */}
                    <td className="num">
                      <input type="number" min="0"
                        value={checkedVal ?? ""}
                        onChange={e => setCheckedQtys(prev => ({
                          ...prev, [sku]: e.target.value === "" ? "" : parseInt(e.target.value) || 0
                        }))}
                        placeholder="B�"
                        style={{
                          width:72, textAlign:"center", padding:"5px 6px",
                          borderRadius:7,
                          border: hasChecked ? "2px solid var(--g-500)" : "1.5px solid var(--bdr)",
                          fontSize:14, fontWeight:700, fontFamily:"inherit",
                          background: hasChecked ? "#f0fdf4" : "#fafafa",
                          outline:"none",
                        }}/>
                    </td>

                    {/* @
@@@�@ */}
                    <td>
                      {!hasChecked ? (
                        <span style={{fontSize:11,color:"var(--muted)"}}>@@@�@�@�@�</span>
                      ) : (
                        <div>
                          <span style={{
                            fontSize:11, fontWeight:700,
                            color: matched ? "var(--g-700)" : "var(--dang)",
                          }}>
                            {matched ? "B� @"@@�" : "B� @�@@�@"@@�"}
                          </span>
                          {!matched && diff !== null && (
                            <div style={{fontSize:10,color:"var(--dang)"}}>
                              {diff > 0 ? `+${diff}` : diff} @�@@�@@@�@�
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
    {lightbox && <ImageLightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)}/>}
    </>
  );
}

// B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�
// Front Store Check View B� @�@�@�@�@�@@�@@�@
@@�@�@�@@@�@�@@@�@@�
// B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�B"�
async function syncFrontStoreData(entries) {
  // entries = [{ sku, qty }]
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

// B�B�B� Supplier Search Autocomplete B�B�B�
function SupplierSearch({ value, onChange, allSuppliers }) {
  const [text, setText] = uS(value || "");
  const [open, setOpen] = uS(false);
  const wrapRef = React.useRef(null);

  // sync text @�@@@�@ value cleared @�@@�@�@@@�@@�
  uE(() => { if (!value) setText(""); }, [value]);

  // @�@@ dropdown @�@@@�@@�@@@�@�@@�
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
    setText(s); onChange(s); setOpen(false);
  };
  const clear = () => {
    setText(""); onChange(""); setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{position:"relative", minWidth:150, flex:"0 0 auto"}}>
      <div style={{display:"flex",alignItems:"center",
                   border:`1.5px solid ${value ? "var(--g-500)" : "var(--bdr)"}`,
                   borderRadius:10, background:"#fff", overflow:"hidden"}}>
        <input
          type="text"
          placeholder="P��
 @�@@�@�@@@@�@@@@�..."
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
                    fontSize:16,color:"var(--muted)",lineHeight:1,fontFamily:"inherit"}}>#</button>
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
              {s === value && "B� "}{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Memoized card B� re-render @�@�@�@@@"@@� value/state @�@@� card @�@@�@�@�@�@@@�@@�
const FSCard = React.memo(function FSCard({ p, val, isSaved, isTouched, onSetQty, onImageClick }) {
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
      {/* @@@�@
@@�@�@�@@�@"@�@@�@@@@�@@�@@� */}
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
                     fontSize:48,color:"var(--g-300)"}}>P�</div>
      )}

      {/* SKU + @�@@�@ */}
      <div>
        <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:2}}>
          <span className="skucode" style={{fontSize:10}}>{p.sku}</span>
          {isSaved && (
            <span style={{fontSize:9,background:"#dcfce7",color:"#166534",
              borderRadius:8,padding:"1px 6px",fontWeight:700}}>B� @�@@�@@@�</span>
          )}
        </div>
        <div style={{fontWeight:600,fontSize:13,lineHeight:1.35,
                     display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",
                     overflow:"hidden"}}>
          {p.name}
        </div>
        {(p.lastSupplier || p.vendor) && (
          <div style={{fontSize:10,color:"var(--muted)",marginTop:3}}>
            P��
 {p.lastSupplier || p.vendor}
          </div>
        )}
      </div>

      {/* qty info: @@�@�@@@�@@� (bg @�@�@@@ @"@@@�@@) + @�@@@� (bg @�@@ @"@@@@) */}
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{flex:1,textAlign:"center",background:"var(--g-600)",
                     borderRadius:8,padding:"7px 6px"}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,.75)",fontWeight:600,letterSpacing:.3}}>@@�@�@@@�@@�</div>
          <div style={{fontSize:20,fontWeight:800,color:"#fff"}}>{fmtN(sysStore)}</div>
        </div>
        <div style={{flex:1,textAlign:"center",background:"#f1f5f9",
                     borderRadius:8,padding:"7px 6px"}}>
          <div style={{fontSize:9,color:"var(--muted)",fontWeight:600,letterSpacing:.3}}>@�@@@�</div>
          <div style={{fontSize:20,fontWeight:800,color:"#111"}}>{fmtN(wh)}</div>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:"var(--muted)",fontWeight:600,marginBottom:3}}>
            @�@�@�@�@�@@@�@@@�@�@@�@�@@�
          </div>
          <input type="number" min="0" inputMode="numeric"
            value={val ?? ""}
            onChange={e => onSetQty(p.sku, e.target.value)}
            placeholder="@�@@@�@�@@�@@�..."
            style={{
              width:"100%", padding:"10px 12px", borderRadius:9,
              fontSize:18, fontWeight:800, fontFamily:"inherit",
              textAlign:"center", outline:"none",
              border: hasVal
                ? (matched ? "2px solid var(--g-500)" : "2px solid var(--dang)")
                : "1.5px solid var(--bdr)",
              background: hasVal
                ? (matched ? "#f0fdf4" : "#fff5f5")
                : "#fff",
              color: hasVal ? (matched ? "var(--g-700)" : "var(--dang)") : "var(--text)",
            }}/>
        </div>
        <div style={{minWidth:60,textAlign:"center"}}>
          {!hasVal ? (
            <div style={{fontSize:11,color:"var(--g-300)",fontWeight:600}}>@@@�@�@�@�</div>
          ) : matched ? (
            <div>
              <div style={{fontSize:18}}>B�</div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--g-700)"}}>@"@@�</div>
            </div>
          ) : (
            <div>
              <div style={{fontSize:18}}>B�</div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--dang)"}}>
                {diff > 0 ? `+${diff}` : diff}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function FrontStoreView({ data, role }) {
  const products = data.products || [];

  const CAT_ORDER = ["Realtouch","@@@�@�@@�","@�@@�","@�@@�@�@�@","@@@�@@�@�@","@�@�","@�@�@�@@�","@�@�@�@@�@�@�@@�","@�@@�@�@�@@�","@�@@@@@�@@@�","@"@�@�@�@@�","@�@�@�@@�@�@�@�@","@�@@�@@�@�"];
  const allCats = uM(() => {
    const s = new Set();
    products.forEach(p => p.cat && p.cat !== "@�@@�@@@@@@
@
@@�@�@�@" && s.add(p.cat));
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
  // showMode: "all" | "unchecked" | "mismatch"
  const [showMode, setShowMode] = uS("all");

  // checkedQtys: { sku: number|"" }
  const [checkedQtys, setCheckedQtys] = uS(() => {
    const init = {};
    products.forEach(p => {
      if (p.frontStoreCheckedQty != null && p.frontStoreCheckedQty !== "")
        init[p.sku] = p.frontStoreCheckedQty;
    });
    return init;
  });

  // touched = sku @@@� user @�@"@/@�@�@�@�@�@@�@�@@@�@�@@� (@�@�@@�@ enable @�@@�@@�@@�@@@�)
  const [touched, setTouched] = uS(new Set());

  const setQty = uC((sku, val) => {
    setCheckedQtys(prev => ({ ...prev, [sku]: val === "" ? "" : parseInt(val) || 0 }));
    setTouched(prev => new Set([...prev, sku]));
  }, []);

  // baseFiltered = filter @@@�@�@@�@�@@�@�@�@@� checkedQtys (recompute @�@�@@)
  const baseFiltered = uM(() => {
    let f = products.filter(p => p.cat && p.cat !== "@�@@�@@@@@@
@
@@�@�@�@");
    if (activeCat !== "ALL") f = f.filter(p => p.cat === activeCat);
    if (supplierFilter) f = f.filter(p => (p.lastSupplier || p.vendor) === supplierFilter);
    if (search) {
      const q = search.trim().toLowerCase();
      f = f.filter(p => (p.sku||"").toLowerCase().includes(q) || (p.name||"").toLowerCase().includes(q));
    }
    return f;
  }, [products, activeCat, supplierFilter, search]);

  // filtered = baseFiltered + showMode filter (@�@�@� checkedQtys @�@�@�@@@�@@@�@@�@@�@�@�@�)
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

  // counts (@�@�@ B� @�@�@�@@@�@�@@@@)
  const counts = uM(() => {
    let unchecked = 0, mismatch = 0;
    const perCat = {};
    products.forEach(p => {
      if (!p.cat || p.cat === "@�@@�@@@@@@
@
@@�@�@�@") return;
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
    if (!p) { alert(`@�@@�@�@�@
@@�@�@�@: ${clean}`); return; }
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
    // @�@@�@@@�@@@� sku @@@� user touched @�@@@@@�@�@
    const entries = [...touched]
      .filter(sku => checkedQtys[sku] !== "" && checkedQtys[sku] != null)
      .map(sku => ({ sku, qty: parseInt(checkedQtys[sku]) || 0 }));
    if (entries.length === 0) { alert("@�@@@�@�@@�@@�@�@�@@�@�@@�@@@�"); return; }
    setSaving(true);
    const result = await syncFrontStoreData(entries);
    setSaving(false);
    if (result.success !== false) {
      setSavedSkus(prev => new Set([...prev, ...entries.map(e => e.sku)]));
      setTouched(new Set());
      alert(`B�& @�@@�@@@� ${entries.length} @@@@�@@@�@@@@�@@�@@`);
    } else {
      alert("@�@@�@@@�@�@@�@
@@�@@�@�: " + (result.error || "@"@@@�@
@@� SHEET_DEPLOY_URL"));
    }
  };

  const PAGE_SIZE = 20;
  const [page, setPage] = uS(0);

  // reset @@�@�@@�@@@�@ filter @�@�@@@�@@�
  uE(() => { setPage(0); }, [activeCat, supplierFilter, search, showMode]);

  const totalInCat = activeCat === "ALL"
    ? products.filter(p => p.cat && p.cat !== "@�@@�@@@@@@
@
@@�@�@�@").length
    : products.filter(p => p.cat === activeCat).length;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
    <div style={{display:"flex", flexDirection:"column", gap:12}}>

      {/* B�B� Top bar: title + scan + save B�B� */}
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{flex:1, minWidth:160}}>
          <div style={{fontSize:15, fontWeight:700}}>P�� @�@�@�@�@�@@�@@�@@�@�@@@�@@�</div>
          <div style={{fontSize:11, color:"var(--muted)", marginTop:2}}>
            {uncheckedCount > 0
              ? <span>@@@�@�@�@� <b style={{color:"var(--warn)"}}>{uncheckedCount}</b> @@@@�@@</span>
              : <span style={{color:"var(--g-600)"}}>B� @�@�@�@�@�@@�@�@@�@</span>}
            {mismatchCount > 0 && <span style={{marginLeft:8, color:"var(--dang)"}}>" @�@@�@"@@� {mismatchCount} @@@@�@@</span>}
          </div>
        </div>
        <ScanButton size={40} continuous onScan={handleScanDetected}
          style={{border:"1.5px solid var(--g-300)", borderRadius:10, flexShrink:0}}/>
        <button onClick={handleSave}
          disabled={saving || touchedWithValue === 0}
          className="btn primary"
          style={{padding:"9px 18px", fontWeight:700, flexShrink:0,
                  opacity: (saving || touchedWithValue === 0) ? 0.45 : 1}}>
          {saving
            ? <><span className="spin" style={{width:13,height:13,borderWidth:2,marginRight:6}}/> @�@@�@@@�...</>
            : touchedWithValue > 0 ? `P� @�@@�@@@� (${touchedWithValue})` : "P� @�@@�@@@�"}
        </button>
      </div>

      {/* B�B� Search + mode filter B�B� */}
      <Card padding={true} style={{paddingTop:12,paddingBottom:12}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <input type="text" placeholder="P�� @�@�@�@@ SKU @@@@@�@@�@@
@@�@�@�@..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{flex:1, minWidth:160, padding:"8px 12px", borderRadius:10,
                    border:"1.5px solid var(--bdr)", fontSize:13, fontFamily:"inherit"}}/>
          <SupplierSearch
            value={supplierFilter}
            onChange={setSupplierFilter}
            allSuppliers={allSuppliers}/>
        </div>
        <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
          <Seg value={showMode} onChange={setShowMode} options={[
            {value:"all",    label:"@@@�@�@@@"},
            {value:"unchecked", label:`@@@�@�@�@�${uncheckedCount>0?` (${uncheckedCount})`:""}` },
            {value:"mismatch",  label:`@�@@�@"@@�${mismatchCount>0?` (${mismatchCount})`:""}` },
          ]}/>
          {supplierFilter && (
            <button onClick={() => setSupplierFilter("")}
              style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid var(--bdr)",
                      background:"#fff",cursor:"pointer",color:"var(--muted)",fontFamily:"inherit",
                      display:"flex",alignItems:"center",gap:4}}>
              B�" {supplierFilter}
            </button>
          )}
        </div>
        {/* Category chips B� single scroll row */}
        <div style={{display:"flex",gap:6,marginTop:10,overflowX:"auto",paddingBottom:4,
                     WebkitOverflowScrolling:"touch"}}>
          <button onClick={() => setActiveCat("ALL")}
            className={`fchip ${activeCat==="ALL"?"active":""}`}
            style={{flexShrink:0}}>
            @@@�@�@@@ ({products.filter(p => p.cat && p.cat !== "@�@@�@@@@@@
@
@@�@�@�@").length})
          </button>
          {allCats.map(c => {
            const cnt = products.filter(p => p.cat === c).length;
            const uncheckedInCat = counts.perCat[c] || 0;
            return (
              <button key={c} onClick={() => setActiveCat(c)}
                className={`fchip ${activeCat===c?"active":""}`}
                style={{flexShrink:0, position:"relative"}}>
                {c} ({cnt})
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

      {/* B�B� Card grid B�B� */}
      {filtered.length === 0 ? (
        <Card padding={true}>
          <Empty title="@�@@�@�@�@
@@�@�@�@" sub="@@@�@�@�@@@�@@� filter @@@@@�@�@�@@@�@@@�"/>
        </Card>
      ) : (
        <div style={{display:"grid",gap:10,
                     gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))"}}>
          {paginated.map(p => (
            <FSCard key={p.sku} p={p}
              val={checkedQtys[p.sku]}
              isSaved={savedSkus.has(p.sku)}
              isTouched={touched.has(p.sku)}
              onSetQty={setQty}
              onImageClick={setLightbox}/>
          ))}
        </div>
      )}

      {/* B�B� Pagination B�B� */}
      {totalPages > 1 && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",
                     gap:8,padding:"4px 0",flexWrap:"wrap"}}>
          <button onClick={() => setPage(0)} disabled={page===0}
            className="btn" style={{padding:"6px 10px",fontSize:12,minWidth:36,
                                    opacity:page===0?.35:1}}>"</button>
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0}
            className="btn" style={{padding:"6px 12px",fontSize:12,
                                    opacity:page===0?.35:1}}>B� @�@�@@�@@�@�@</button>

          {/* page number chips */}
          {Array.from({length:totalPages},(_,i)=>i)
            .filter(i => Math.abs(i-page) <= 2 || i===0 || i===totalPages-1)
            .reduce((acc,i,idx,arr) => {
              if (idx>0 && i-arr[idx-1]>1) acc.push("...");
              acc.push(i); return acc;
            },[])
            .map((item,idx) => item === "..." ? (
              <span key={`e${idx}`} style={{fontSize:12,color:"var(--muted)"}}>B�</span>
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
                                    opacity:page===totalPages-1?.35:1}}>@@@@�@� B�</button>
          <button onClick={() => setPage(totalPages-1)} disabled={page===totalPages-1}
            className="btn" style={{padding:"6px 10px",fontSize:12,minWidth:36,
                                    opacity:page===totalPages-1?.35:1}}>"</button>
        </div>
      )}

      {/* Footer info */}
      <div style={{padding:"4px 4px",fontSize:11,color:"var(--muted)",
                   display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
        <span>
          @@�@�@ {page+1}/{totalPages || 1} "
          @�@
@@� {page*PAGE_SIZE+1}B�{Math.min((page+1)*PAGE_SIZE, filtered.length)} @�@@� {fmtN(filtered.length)} @@@@�@@
        </span>
        {touchedWithValue > 0 && (
          <span style={{color:"var(--warn)",fontWeight:600}}>
            " @�@�@�@�@�@�@@�@ {touchedWithValue} @@@@�@@ (@@@�@�@@�@�@@�@@@�)
          </span>
        )}
      </div>
    </div>
    {lightbox && <ImageLightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)}/>}
    </>
  );
}

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B� Transfer View (Phase 3) B�B�B�B�B�B�B�B�B�B�B�B�B�B�
function TransferView({ data }) {
  const transfers = data.transfers || [];
  const stats = data.transferStats || { '@�@@�': {count:0,qty:0}, '@�@@@�': {count:0,qty:0}, '@@�@@': {count:0,qty:0} };
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
    const map = { '@�@@�': [], '@�@@@�': [], '@@�@@': [] };
    transfers.forEach(t => { if (map[t.type]) map[t.type].push(t); });
    return map;
  }, [transfers]);

  const transferByMonth = uM(() => {
    const map = {};
    transfers.forEach(t => {
      const d = (t.date || '').substring(0, 7);
      if (!d) return;
      map[d] = map[d] || { '@�@@�': 0, '@�@@@�': 0, '@@�@@': 0 };
      map[d][t.type] = (map[d][t.type] || 0) + (t.qty || 0);
    });
    return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0])).map(([m, v]) => ({month: m, ...v}));
  }, [transfers]);

  const totalQty = transfers.reduce((s, t) => s + (t.qty || 0), 0);
  const totalCount = transfers.length;

  return (
    <div className="transfer-view">
      <div className="row row-3" style={{marginBottom:16}}>
        <KPI label="@�@@� (Transfer)" value={`${fmtN(stats['@�@@�']?.count || 0)}`}
             sub={`${fmtN(stats['@�@@�']?.qty || 0)} @�@@�@�`}
             accent="#2196F3" icon={I.arrowR}/>
        <KPI label="@�@@@� (Adjust)" value={`${fmtN(stats['@�@@@�']?.count || 0)}`}
             sub={`${fmtN(stats['@�@@@�']?.qty || 0)} @�@@�@�`}
             accent="#FF9800" icon={I.filter}/>
        <KPI label="@@�@@ (Import)" value={`${fmtN(stats['@@�@@']?.count || 0)}`}
             sub={`${fmtN(stats['@@�@@']?.qty || 0)} @�@@�@�`}
             accent="#4CAF50" icon={I.upload}/>
      </div>

      <Card title="P�� @�@@@@@@�@@�/@�@@@�/@@�@@@@@@�@@@@�"
            sub="Trend @�@@�@�@@@�@�@@@�@@�@@�@@@
@@�@�@�@">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={transferByMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bdr)" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip contentStyle={{background:'#fff',border:'1px solid var(--bdr)',borderRadius:8}} />
            <Legend />
            <Bar dataKey="@�@@�" fill="#2196F3" name="@�@@�" />
            <Bar dataKey="@�@@@�" fill="#FF9800" name="@�@@@�" />
            <Bar dataKey="@@�@@" fill="#4CAF50" name="@@�@@" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="P�� @@@@�@@@�@@�/@�@@@�/@@�@@"
            sub={`@@@�@�@@@ ${fmtN(totalCount)} @@@@�@@ " ${fmtN(totalQty)} @�@@�@�`}
            action={
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <input type="text" placeholder="P�� @�@�@�@@ SKU..."
                       value={search} onChange={e => setSearch(e.target.value)}
                       style={{padding:"6px 10px",border:"1px solid var(--bdr)",
                              borderRadius:8,fontSize:12,width:140}}/>
                <Seg value={filterType} onChange={setFilterType} options={[
                  {value:'all',label:'@@@�@�@@@'},{value:'@�@@�',label:'@�@@�'},{value:'@�@@@�',label:'@�@@@�'},{value:'@@�@@',label:'@@�@@'},
                ]}/>
              </div>
            }
            style={{marginTop:16}}>
        {filtered.length === 0 ? (
          <div style={{textAlign:'center',padding:40,color:'var(--muted)',fontSize:13}}>
            @�@@�@�@�@�@�@@@@
          </div>
        ) : (
          <div className="t-transfer-wrap" style={{maxHeight:600,overflowY:'auto',overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table className="t" style={{minWidth:560}}>
              <thead><tr>
                <th>@�@@@�@�@</th>
                <th>@@@�@@@�</th>
                <th>SKU</th>
                <th>@
@@�@�@�@</th>
                <th className="num">@�@@�@@�</th>
                <th>@�@@�</th>
                <th>@�@�</th>
                <th>@
@@@�@</th>
              </tr></thead>
              <tbody>
                {filtered.map((t, i) => {
                  const p = productMap[t.sku];
                  const typeColor = t.type === '@�@@�' ? '#2196F3' : t.type === '@�@@@�' ? '#FF9800' : '#4CAF50';
                  return (
                    <tr key={i} style={{borderLeft:`3px solid ${typeColor}`,paddingLeft:8}}>
                      <td style={{fontWeight:600,color:typeColor}}>{t.type}</td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>{t.date}</td>
                      <td><span className="skucode" style={{fontSize:10}}>{t.sku}</span></td>
                      <td style={{fontSize:12}}>{p ? p.name : t.name || 'B�'}</td>
                      <td className="num" style={{fontWeight:600}}>{fmtN(t.qty)}</td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>{t.from || 'B�'}</td>
                      <td style={{fontSize:11,color:'var(--muted)'}}>{t.to || 'B�'}</td>
                      <td style={{fontSize:11,color: t.status?.includes('@
@@�@@�@�') ? 'var(--g-700)' : 'var(--muted)'}}>{t.status || 'B�'}</td>
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

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// LABEL PRINT B� QR Code labels, 5#14 = 70 per A4
// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// ORDERS B� localStorage state helpers
// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
const LS_ORDERS_STATE   = "dmj_orders_state_v1";
const LS_PRINTED_ORDERS = "dmj_printed_orders_v1";
function getOrdersState()   { try { return JSON.parse(localStorage.getItem(LS_ORDERS_STATE)   || "{}"); } catch { return {}; } }
function getPrintedOrders() { try { return JSON.parse(localStorage.getItem(LS_PRINTED_ORDERS) || "{}"); } catch { return {}; } }
function patchOrderState(id, updates) {
  const s = getOrdersState(); s[id] = { ...(s[id]||{}), ...updates };
  localStorage.setItem(LS_ORDERS_STATE, JSON.stringify(s)); return s;
}

// B�B�B� Sync order to Google Sheet on Done B�B�B�
async function syncOrderToSheet(orderId, preparedQty, status, printFlag, carryMode) {
  if (!SHEET_DEPLOY_URL) {
    console.warn("SHEET_DEPLOY_URL not configured B� order not synced to Sheet");
    return { success: false, error: "SHEET_DEPLOY_URL not set" };
  }
  try {
    const response = await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, preparedQty, status, printFlag, carryMode })
    });
    return { success: true };
  } catch (err) {
    console.error("syncOrderToSheet error:", err.message);
    return { success: false, error: err.message };
  }
}

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// ORDER LIST VIEW
// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
function OrderItemRow({ order, onPatch, productMap }) {
  const isPending = !order.status || order.status === "@@" || order.status === "pending";
  // default @�@@ = orderQty (@@�@@@@�@�@@�@�@@�@�@�@�)
  const [prepQty, setPrepQty] = uS(() => order.preparedQty > 0 ? order.preparedQty : (order.orderQty || 0));
  const [imgOpen, setImgOpen] = uS(false);
  uE(() => {
    setPrepQty(prev => prev === 0 ? (order.orderQty || 0) : prev);
  }, [order.orderQty]);

  const savePrepQty = v => { const n = Math.max(0, parseInt(v)||0); setPrepQty(n); onPatch(order.id, {preparedQty: n}); };
  const setPrintFlag = f => onPatch(order.id, {printFlag: f});
  const setCarryMode = m => onPatch(order.id, {carryMode: m});
  const markComplete = async () => {
    if (!order.printFlag) { alert("Please choose: PRINT P�O� or SKIP B�" first"); return; }
    const btn = event?.target;
    if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; }
    try {
      await syncOrderToSheet(order.id, prepQty, "@
@@�@@�@�", order.printFlag, cm);
      onPatch(order.id, { status: "@
@@�@@�@�" });
    } catch (err) {
      alert("@�@@�@@@�@@�@�@@@�@@�@
@@�@@�@�: " + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = "1"; }
    }
  };

  const pf = order.printFlag;
  // carryMode: @�@�@�@�@@� localStorage @�@�@@� @@�@@�@@�@@@@@�@@�@�@�@@@@@�@� sheet @@�@@�@@�@@@�@� default "truck"
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
        {/* B�B� Row 1: image + info B�B� */}
        <div style={{display:"flex",gap:10,alignItems:"flex-start",padding:"12px 14px 8px"}}>
          {/* Thumbnail B� clickable */}
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
                P��
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}}>
              <span style={{fontSize:10,color:"var(--muted)"}}>{order.sku}</span>
              <span style={{
                fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,
                background:isPending?"#fff8e1":"#e8f5e9",color:isPending?"#a07417":"#1f7f44",
              }}>{isPending?"@@":"B� Done"}</span>
            </div>
            <div style={{fontSize:14,fontWeight:600,lineHeight:1.3,marginBottom:2,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{order.name}</div>
            <div style={{fontSize:11,color:"var(--muted)"}}>
              {order.date}{order.from ? ` " ${order.from}` : ""}{order.to ? ` B� ${order.to}` : ""}
            </div>
            {locStr && (
              <div style={{
                marginTop:4,display:"inline-flex",alignItems:"center",gap:4,
                background:"#eff6ff",borderRadius:6,padding:"2px 8px",fontSize:11,color:"#1e40af",fontWeight:600,
              }}>
                P�� {locStr}
              </div>
            )}
          </div>
        </div>

        {/* B�B� Row 2: quantities + actions B�B� */}
        <div style={{
          display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
          padding:"8px 14px 12px",borderTop:"1px solid var(--g-50)",
          background:"var(--g-50)",
        }}>
          {/* Quantities */}
          <div style={{textAlign:"center",minWidth:44}}>
            <div style={{fontSize:10,color:"var(--muted)",marginBottom:1}}>@
@@�@�</div>
            <div style={{fontSize:15,fontWeight:800,color:"var(--dang)"}}>{order.orderQty}</div>
          </div>

          {/* @�@@ B� with +/- buttons */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{fontSize:10,color:"var(--muted)"}}>@�@@</div>
            <div style={{display:"flex",alignItems:"center",gap:3,flexWrap:"wrap",justifyContent:"center"}}>
              {[-10,-5,-1].map(d => (
                <button key={d} className="order-adj-btn" onClick={() => savePrepQty(prepQty+d)} disabled={!isPending}
                  style={{
                    width:30,height:30,borderRadius:6,border:"1px solid var(--bdr)",
                    background:"#fee2e2",color:"#e53e3e",fontWeight:700,fontSize:11,
                    cursor:isPending?"pointer":"default",padding:0,fontFamily:"inherit",
                  }}>{d}</button>
              ))}
              <input type="number" value={prepQty} min={0} max={9999}
                onChange={e => savePrepQty(e.target.value)}
                disabled={!isPending}
                className="order-adj-input"
                style={{
                  width:52,textAlign:"center",padding:"4px 0",borderRadius:6,
                  border:"2px solid var(--g-500)",fontSize:16,fontWeight:800,
                  background:isPending?"#f0fdf4":"var(--g-50)",fontFamily:"inherit",
                }}/>
              {[+1,+5,+10].map(d => (
                <button key={d} className="order-adj-btn" onClick={() => savePrepQty(prepQty+d)} disabled={!isPending}
                  style={{
                    width:30,height:30,borderRadius:6,border:"1px solid var(--bdr)",
                    background:"#e8f5e9",color:"#1f7f44",fontWeight:700,fontSize:11,
                    cursor:isPending?"pointer":"default",padding:0,fontFamily:"inherit",
                  }}>+{d}</button>
              ))}
            </div>
          </div>

          <div style={{textAlign:"center",minWidth:44}}>
            <div style={{fontSize:10,color:"var(--muted)",marginBottom:1}}>@�@@@@</div>
            <div style={{fontSize:15,fontWeight:800}}>{order.remaining ?? "B�"}</div>
          </div>

          <div style={{flex:1}}/>

          {/* QR toggle */}
          <button className="order-action-btn" title={pf==="print"?"Print B�":pf==="no-print"?"Skip B�"":"Tap to set print"}
            onClick={() => { if(!pf) setPrintFlag("print"); else if(pf==="print") setPrintFlag("no-print"); else setPrintFlag("print"); }}
            style={{
              width:44,height:44,borderRadius:10,cursor:"pointer",padding:0,
              border:`2px solid ${pf==="print"?"#1f7f44":pf==="no-print"?"#e53e3e":"#d1d5db"}`,
              background:pf==="print"?"#e8f5e9":pf==="no-print"?"#fee2e2":"#fff",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
            }}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,4px)",gap:"1.5px"}}>
              {[1,1,0,1,0,1,0,1,1].map((b,i)=>(
                <div key={i} style={{width:4,height:4,borderRadius:1,
                  background:pf==="print"?"#1f7f44":pf==="no-print"?"#e53e3e":b?"#9ca3af":"transparent"}}/>
              ))}
            </div>
            <div style={{fontSize:7,fontWeight:700,color:pf==="print"?"#1f7f44":pf==="no-print"?"#e53e3e":"#9ca3af"}}>
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
            {cm==="truck"?"P���":"P��"}
          </button>

          {/* Done */}
          {isPending && (
            <button onClick={markComplete} style={{
              padding:"10px 16px",borderRadius:10,border:"none",
              background:pf?"var(--g-700)":"#d1d5db",color:"#fff",
              cursor:pf?"pointer":"not-allowed",fontSize:13,fontWeight:700,
            }}>B� Done</button>
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
                P�� @"@@�@@�@�@�: {locStr}
              </div>
            )}
            {product?.cat && (
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:6}}>@@@@: {product.cat}</div>
            )}
            <div style={{display:"flex",gap:16,fontSize:13,marginBottom:14}}>
              <span>@
@@�@�: <b>{order.orderQty}</b></span>
              <span>@�@@: <b>{prepQty}</b></span>
              <span>@�@@@@: <b>{order.remaining??"B�"}</b></span>
            </div>
            <button onClick={() => setImgOpen(false)} style={{
              width:"100%",padding:"10px",background:"var(--g-700)",color:"#fff",
              border:"none",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:600,
            }}>@�@@</button>
          </div>
        </div>
      )}
    </>
  );
}

function OrderListView({ data }) {
  const orders = data.orders || [];
  const [filter, setFilter] = uS("all");
  const [st, setSt] = uS(getOrdersState);
  const productMap = uM(() => { const m={}; (data.products||[]).forEach(p=>m[p.sku]=p); return m; }, [data.products]);

  const enriched = uM(() => orders.map(o => ({ ...o, ...(st[o.id]||{}) })), [orders, st]);

  const sorted = uM(() => [...enriched].sort((a,b) => {
    const aP = !a.status||a.status==="@@"||a.status==="pending";
    const bP = !b.status||b.status==="@@"||b.status==="pending";
    return (aP&&!bP)?-1:(!aP&&bP)?1:0;
  }), [enriched]);

  const filtered = uM(() => {
    if (filter==="pending")   return sorted.filter(o => !o.status||o.status==="@@"||o.status==="pending");
    if (filter==="completed") return sorted.filter(o => o.status==="@
@@�@@�@�"||o.status==="completed");
    return sorted;
  }, [sorted, filter]);

  const patch = (id, updates) => setSt(patchOrderState(id, updates));

  const pendingCount = sorted.filter(o => !o.status||o.status==="@@"||o.status==="pending").length;

  if (!orders.length) return (
    <div style={{padding:"60px 20px",textAlign:"center"}}>
      <Empty icon={I.cart} title="@@@�@�@@�@@@@@@�@@@
@@�@�@�@@�"
        sub="@�@�@@�@@�@�@@@@@�@� Google Sheet '@@@@@�@@@�@
@@�@�@�@@�@' @�@@�@@�@ Sync"/>
    </div>
  );

  return (
    <div>
      <div className="page-head no-print">
        <div>
          <div className="page-title">@@@@�@@@
@@�@�@�@@�</div>
          <div className="page-sub">{orders.length} @@@@�@@ " {pendingCount} @@@@@�@�@@�@�@@</div>
        </div>
        <Seg value={filter} onChange={setFilter} options={[
          {value:"all",label:"@@@�@�@@@"},
          {value:"pending",label:"@@"},
          {value:"completed",label:"@
@@�@@�@�"},
        ]}/>
      </div>

      {filtered.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px 20px",color:"var(--muted)"}}>
          @�@@�@@@@@@�@@@�@� filter @�@@�
        </div>
      ) : (
        filtered.map(order => <OrderItemRow key={order.id} order={order} onPatch={patch} productMap={productMap}/>)
      )}
    </div>
  );
}

// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
// ORDER SUMMARY VIEW
// B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�B�
function OrderSummaryView({ data, onPrintRequest }) {
  const orders   = data.orders   || [];
  const products = data.products || [];
  const [st, setSt]         = uS(getOrdersState);
  const [printed, setPrinted] = uS(getPrintedOrders);
  const [bigImg, setBigImg]   = uS(null);

  const productMap = uM(() => { const m={}; products.forEach(p => m[p.sku]=p); return m; }, [products]);

  const enriched = uM(() => orders.map(o => ({
    ...o, ...(st[o.id]||{}), product: productMap[o.sku],
  })), [orders, st, productMap]);

  const sorted = uM(() => [...enriched].sort((a,b) => {
    const aP = !a.status||a.status==="@@"||a.status==="pending";
    const bP = !b.status||b.status==="@@"||b.status==="pending";
    return (aP&&!bP)?-1:(!aP&&bP)?1:0;
  }), [enriched]);

  const grouped = uM(() => {
    const g = {};
    sorted.forEach(o => {
      const cat = o.product?.cat || "@@@�@�@�";
      if (!g[cat]) g[cat] = [];
      g[cat].push(o);
    });
    return g;
  }, [sorted]);

  const handlePrint = (order) => {
    const qty = order.preparedQty || order.orderQty || 1;
    onPrintRequest([{ sku: order.sku, qty }]);
    const p2 = { ...printed, [order.id]: true };
    setPrinted(p2);
    localStorage.setItem(LS_PRINTED_ORDERS, JSON.stringify(p2));
  };

  if (!orders.length) return (
    <div style={{padding:"60px 20px",textAlign:"center"}}>
      <Empty icon={I.store} title="@@@�@�@@�@@@@@@�@@@
@@�@�@�@@�"
        sub="@�@�@@�@@�@�@@@@@�@� Google Sheet '@@@@@�@@@�@
@@�@�@�@@�@' @�@@�@@�@ Sync"/>
    </div>
  );

  return (
    <div>
      <div className="page-head no-print">
        <div>
          <div className="page-title">@
@@@�@
@@�@�@�@@@@�@�@@�@�@@@�</div>
          <div className="page-sub">@�@@@@�@"@@@@@@@@@@� " pending @�@@�@�@�@�@@� " @�@@@@�@�@�@@�@@@@�@�@@@@@
@@�@�@�@</div>
        </div>
      </div>

      {Object.entries(grouped).map(([cat, catOrders]) => (
        <div key={cat} style={{marginBottom:28}}>
          <div style={{
            fontSize:13,fontWeight:700,color:"var(--g-700)",
            padding:"7px 14px",background:"var(--g-50)",
            borderRadius:8,marginBottom:12,border:"1px solid var(--bdr)",
            display:"flex",justifyContent:"space-between",alignItems:"center",
          }}>
            <span>{cat}</span>
            <span style={{fontWeight:400,color:"var(--muted)",fontSize:12}}>{catOrders.length} @@@@�@@</span>
          </div>

          <div className="order-summary-grid" style={{
            display:"grid",
            gridTemplateColumns:"repeat(auto-fill, minmax(185px, 1fr))",
            gap:12,
          }}>
            {catOrders.map(order => {
              const isPending = !order.status||order.status==="@@"||order.status==="pending";
              const alreadyPrinted = printed[order.id];
              const prepQty = order.preparedQty || 0;

              return (
                <div key={order.id} style={{
                  background:"#fff",borderRadius:12,padding:12,
                  border:`1.5px solid ${isPending?"var(--bdr)":"#4fb472"}`,
                  display:"flex",flexDirection:"column",gap:8,
                  opacity:isPending?1:0.8,
                }}>
                  {/* Thumbnail B� click to enlarge */}
                  <div style={{position:"relative"}}>
                    {order.image ? (
                      <img src={order.image} alt=""
                        onClick={() => setBigImg(order)}
                        style={{
                          width:"100%",height:88,objectFit:"cover",
                          borderRadius:8,cursor:"pointer",display:"block",
                        }}/>
                    ) : (
                      <div onClick={() => setBigImg(order)}
                        style={{
                          width:"100%",height:88,background:"var(--g-50)",borderRadius:8,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          color:"var(--muted)",cursor:"pointer",
                        }}>{I.package}</div>
                    )}
                    {!isPending && (
                      <div style={{
                        position:"absolute",top:4,right:4,
                        background:"#1f7f44",color:"#fff",borderRadius:20,
                        fontSize:9,fontWeight:700,padding:"2px 6px",
                      }}>B� Done</div>
                    )}
                  </div>

                  {/* Name + SKU */}
                  <div>
                    <div style={{fontSize:10,color:"var(--muted)"}}>{order.sku} " {order.date}</div>
                    <div style={{fontSize:13,fontWeight:600,lineHeight:1.3}}>{order.name}</div>
                  </div>

                  {/* Qty pills */}
                  <div style={{display:"flex",gap:4}}>
                    {[["@
@@�@�",order.orderQty,"#fee2e2","var(--dang)"],
                      ["@�@@",prepQty,"#e8f5e9","var(--g-700)"],
                      ["@�@@@@",order.remaining??"B�","var(--g-50)","var(--text)"]
                    ].map(([lbl,val,bg,col]) => (
                      <div key={lbl} style={{flex:1,textAlign:"center",background:bg,borderRadius:6,padding:"4px 2px"}}>
                        <div style={{fontSize:9,color:"var(--muted)"}}>{lbl}</div>
                        <div style={{fontSize:13,fontWeight:700,color:col}}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Carry/truck indicator */}
                  <div style={{fontSize:11,color:"var(--muted)"}}>
                    {order.carryMode==="truck"?"P��� @@@
@�@�@@":order.carryMode==="carry"?"P�� @@@�@@�@@�":"B�"}
                  </div>

                  {/* Print Label button B� appears only if printFlag=print, disappears after click */}
                  {order.printFlag==="print" && !alreadyPrinted && (
                    <button onClick={() => handlePrint(order)} style={{
                      padding:"7px",borderRadius:8,border:"none",cursor:"pointer",
                      background:"var(--g-700)",color:"#fff",fontSize:12,fontWeight:700,
                    }}>P�O� Print Label</button>
                  )}
                  {alreadyPrinted && (
                    <div style={{textAlign:"center",fontSize:11,color:"var(--g-700)",fontWeight:700}}>
                      B� Printed
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

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
              <span>@
@@�@�: <b>{bigImg.orderQty}</b></span>
              <span>@�@@: <b>{bigImg.preparedQty||0}</b></span>
              <span>@�@@@@: <b>{bigImg.remaining??"B�"}</b></span>
            </div>
            {bigImg.product && (
              <div style={{fontSize:12,color:"var(--muted)",borderTop:"1px solid var(--bdr)",paddingTop:10}}>
                {bigImg.product.cat && <div>@@@@@@@@�: {bigImg.product.cat}</div>}
                {bigImg.product.price>0 && <div>@@@�@: {bigImg.product.price} @</div>}
              </div>
            )}
            <button onClick={() => setBigImg(null)} style={{
              marginTop:14,width:"100%",padding:"9px",
              background:"var(--g-700)",color:"#fff",border:"none",
              borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,
            }}>@�@@</button>
          </div>
        </div>
      )}
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
  <text x="50" y="64" font-family="sans-serif" font-size="7" fill="%231f7f44" text-anchor="middle">@@@�@@@@@�@�@@@�</text>
  <text x="50" y="76" font-family="sans-serif" font-size="5.5" fill="%231f7f44" text-anchor="middle">EST.2003</text>
</svg>`)}`;

function LabelPrintView({ data, initItems, onInitConsumed }) {
  const { products } = data;
  const [items, setItems] = uS([]);

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

  // Group into pages of 70
  const pages = uM(() => {
    const ps = [];
    for (let i = 0; i < labelList.length; i += 70) ps.push(labelList.slice(i, i + 70));
    return ps;
  }, [labelList]);

  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  const addItem = () => {
    const raw = searchVal.trim();
    const sku = raw.includes(" B� ") ? raw.split(" B� ")[0].trim() : raw.toUpperCase().trim();
    const qty = Math.max(1, parseInt(qtyVal) || 1);
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
  const updateQty  = (sku, qty) => setItems(prev => prev.map(i => i.sku === sku ? { ...i, qty: Math.max(1, qty) } : i));

  return (
    <div>
      {/* B�B� Controls (hidden on print) B�B� */}
      <div className="no-print">
        <div className="page-head">
          <div>
            <div className="page-title">@�@@@�@� Label @
@@�@�@�@</div>
            <div className="page-sub">QR Code @
@@@@@�@
@�@�@�@�@@@�@�@@� " A4 " 5 @�@@@@@�@� " @�@@@�@�@"@@@�@@�@@�@�@@@�</div>
          </div>
          {labelList.length > 0 && (
            <div className="page-actions">
              <button className="btn primary" onClick={() => window.print()}
                      style={{padding:"10px 20px",fontWeight:700,fontSize:14}}>
                P�O� @�@@@�@� {labelList.length} @�@� ({pages.length} @@�@�@)
              </button>
            </div>
          )}
        </div>

        {/* Add product row */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14,alignItems:"flex-end"}}>
          <div style={{flex:1,minWidth:220}}>
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:4,fontWeight:600}}>@�@�@�@@@
@@�@�@�@ / @�@@@�@� SKU @�@@@"@@�</div>
            <input list="lbl-sku-list" value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addItem()}
              placeholder="@�@�@�@� HL00170 @@@@ @�@@�@@
@@�@�@�@..."
              style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1.5px solid var(--bdr)",
                      fontFamily:"inherit",fontSize:13,boxSizing:"border-box"}}/>
            <datalist id="lbl-sku-list">
              {products.map(p => <option key={p.sku} value={`${p.sku} B� ${p.name}`}/>)}
            </datalist>
          </div>
          <div>
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:4,fontWeight:600}}>@�@@�@@�@�@�</div>
            <input type="number" value={qtyVal} min={1} max={700}
              onChange={e => setQtyVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addItem()}
              style={{width:90,padding:"9px 12px",borderRadius:8,border:"1.5px solid var(--bdr)",
                      fontFamily:"inherit",fontSize:13}}/>
          </div>
          <button className="btn primary" onClick={addItem}
                  style={{padding:"9px 18px",fontWeight:700}}>+ @�@�@@�@</button>
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
              @@@@�@@@@@�@�@@�@@@�@�
            </div>
            {items.map(item => {
              const p = productMap[item.sku];
              return (
                <div key={item.sku} style={{display:"flex",alignItems:"center",gap:10,
                     padding:"7px 0",borderBottom:"1px solid var(--bdr)"}}>
                  <span className="skucode" style={{fontSize:11,minWidth:80}}>{item.sku}</span>
                  <span style={{flex:1,fontSize:12,color:"var(--text)"}}>{p?.name || "B�"}</span>
                  <span style={{fontSize:12,color:"var(--g-700)",fontWeight:700,minWidth:60,textAlign:"right"}}>
                    {p?.price ? `${p.price} @` : ""}
                  </span>
                  <input type="number" value={item.qty} min={1} max={700}
                    onChange={e => updateQty(item.sku, parseInt(e.target.value) || 1)}
                    style={{width:70,padding:"4px 8px",borderRadius:6,border:"1.5px solid var(--bdr)",
                            fontFamily:"inherit",fontSize:12,textAlign:"center"}}/>
                  <span style={{fontSize:11,color:"var(--muted)",minWidth:28}}>@�@�</span>
                  <button onClick={() => removeItem(item.sku)}
                    style={{background:"none",border:"none",cursor:"pointer",color:"var(--dang)",
                            fontSize:16,padding:"0 4px",fontWeight:700}}>#</button>
                </div>
              );
            })}
            <div style={{marginTop:10,display:"flex",gap:16,fontSize:12,color:"var(--muted)",flexWrap:"wrap"}}>
              <span>@@@ <b style={{color:"var(--g-700)"}}>{totalQty}</b> @�@�</span>
              <span>= <b style={{color:"var(--g-700)"}}>{pages.length}</b> @@�@�@ A4</span>
              {totalQty % 70 !== 0 && pages.length > 0 && (
                <span style={{color:"var(--muted)"}}>
                  (@@�@�@@
@@@@�@@@@ <b style={{color:"var(--g-700)"}}>{totalQty - (pages.length - 1) * 70}</b> @�@�)
                </span>
              )}
            </div>
          </div>
        ) : (
          <div style={{textAlign:"center",padding:"40px 20px",color:"var(--muted)",
                       background:"var(--g-50)",borderRadius:12,border:"1.5px dashed var(--bdr)",marginBottom:14}}>
            <div style={{fontSize:28,marginBottom:8}}>P��O�</div>
            <div style={{fontWeight:700,marginBottom:4}}>@@@�@�@@�@@@
@@�@�@�@</div>
            <div style={{fontSize:12}}>@�@�@�@@@
@@�@�@�@@@@@@�@@@�@� SKU @@�@@�@�@� @�@@�@@�@ Enter @@@@ "+ @�@�@@�@"</div>
          </div>
        )}

        {labelList.length > 0 && (
          <div style={{fontSize:12,color:"var(--muted)",marginBottom:12,padding:"8px 12px",
                       background:"#fff8e1",borderRadius:8,border:"1px solid #f59e0b"}}>
            P� @"@@@@@�@@�@@�@@�@@�@@�@�@@ preview " @�@ <b>P�O� @�@@@�@�</b> @�@�@@�@@
@�@�@�@�@�@@@�@�@�@"@@@�
          </div>
        )}
      </div>

      {/* B�B� Label pages (visible on print + preview) B�B� */}
      {pages.map((page, pi) => (
        <div key={pi} className="label-page">
          <div className="label-grid">
            {page.map((p, i) => (
              <div key={i} className="label-cell">
                {/* row 1: name left, price right */}
                <div className="label-top-row">
                  <span className="label-name">{p.name}</span>
                  <span className="label-price">{p.price != null && p.price > 0 ? `${p.price} @` : ""}</span>
                </div>
                {/* row 2: QR centered, logo corner right */}
                <div className="label-mid-row">
                  <div className="label-qr-center" style={{width:"10mm",height:"10mm"}}>
                    {qrMap[p.sku]
                      ? <img src={qrMap[p.sku]} alt={p.sku}
                             style={{width:"100%",height:"100%",objectFit:"contain"}}/>
                      : <div style={{width:"100%",height:"100%",background:"#f0f0f0",
                                     display:"flex",alignItems:"center",justifyContent:"center",
                                     fontSize:5,color:"#aaa"}}>QR</div>
                    }
                  </div>
                  <div className="label-logo-corner">
                    <img src={logoSrc} alt="logo"
                         onError={() => setLogoSrc(LOGO_FALLBACK_SVG)}/>
                  </div>
                </div>
                {/* row 3: SKU */}
                <div className="label-sku-text">{p.sku}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { OverviewView, CategoryView, TrendsView, StockView, StorageView, TransferView, UploadView, ConnectView, LabelPrintView, ProductCard, OrderListView, OrderSummaryView });
