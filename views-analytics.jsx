// views-analytics.jsx — depends on views-main.jsx (loaded first)
// ─── PurchaseGroupView — จัดกลุ่มสินค้าตาม supplier สำหรับ owner planning ───
function PurchaseGroupView({ products }) {
  // group by lastSupplier || vendor || "ไม่ระบุ"
  const groups = {};
  products.forEach(function(p) {
    const sup = ((p.lastSupplier || p.vendor || "ไม่ระบุ") + "").trim();
    if (!groups[sup]) groups[sup] = [];
    groups[sup].push(p);
  });
  const sorted = Object.keys(groups).sort();
  if (sorted.length === 0) return (
    <Card padding={true}><Empty title="ไม่พบสินค้า" sub="ลองเปลี่ยน filter"/></Card>
  );
  return (
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      {sorted.map(function(sup) {
        const items = groups[sup].slice().sort(function(a,b) { return (a.qtyStore||0) - (b.qtyStore||0); });
        return (
          <div key={sup} style={{marginBottom:16}}>
            <div style={{padding:"8px 12px",background:"#f3f4f6",borderRadius:8,fontWeight:700,fontSize:14,marginBottom:8}}>
              🏪 {sup} <span style={{fontWeight:400,color:"#6b7280",fontSize:12}}>({items.length} รายการ)</span>
            </div>
            {items.map(function(p) {
              const isOut = (p.qtyStore||0) === 0;
              const isLow = !isOut && (p.qtyStore||0) <= 5;
              const badge = isOut ? {bg:"#fef2f2",color:"#dc2626",label:"หมด!"} :
                            isLow ? {bg:"#fff7ed",color:"#ea580c",label:"ต่ำ"} :
                            {bg:"#f0fdf4",color:"#16a34a",label:"ปกติ"};
              return (
                <div key={p.sku} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderBottom:"1px solid #f3f4f6"}}>
                  {p.imageUrl && <img src={p.imageUrl} style={{width:40,height:40,objectFit:"cover",borderRadius:6,flexShrink:0}} onError={function(e){e.target.style.display="none";}}/>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                    <div style={{fontSize:12,color:"#6b7280"}}>{p.sku}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:13}}>🏪 {p.qtyStore||0} <span style={{color:"#9ca3af"}}>/ 🏭 {p.qtyWH||0}</span></div>
                    <span style={{fontSize:11,padding:"2px 6px",borderRadius:999,background:badge.bg,color:badge.color}}>{badge.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── FrontStoreView ───
function FrontStoreView({ data, role, checkRequest }) {
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
  const [purchaseMode, setPurchaseMode] = uS(false);
  const [mounted, setMounted] = uS(false);
  uE(() => { const t = setTimeout(() => setMounted(true), 350); return () => clearTimeout(t); }, []);

  // ถ้า checkRequest ส่งมา → auto-set supplier filter ถ้า SKU ทั้งหมดมาจาก supplier เดียว
  uE(function() {
    if (!checkRequest || !products.length) return;
    var checkSkus = new Set(checkRequest.skus || []);
    var sups = new Set();
    products.forEach(function(p) {
      if (checkSkus.has(p.sku)) {
        var s = p.lastSupplier || p.vendor;
        if (s) sups.add(s);
      }
    });
    if (sups.size === 1) setSupplierFilter([...sups][0]);
  }, [checkRequest, products]);

  const [checkedQtys, setCheckedQtys] = uS(() => {
    const init = {};
    products.forEach(p => {
      if (p.frontStoreCheckedQty != null && p.frontStoreCheckedQty !== "")
        init[p.sku] = p.frontStoreCheckedQty;
    });
    return init;
  });
  const [touched, setTouched] = uS(new Set());
  const touchedRef = React.useRef(new Set());
  uE(() => { touchedRef.current = touched; }, [touched]);
  const [lastSavedTime, setLastSavedTime] = uS(null); // timestamp of last successful save
  const [fsCalcPad, setFsCalcPad] = uS(null); // {sku, name, val} for CalcPadModal
  const [transferTarget, setTransferTarget] = uS(null); // {sku, name, maxQty} สำหรับ mini modal โอน
  const [transferQty, setTransferQty] = uS(1);
  const [transferring, setTransferring] = uS(false);

  // Multi-device sync: เมื่อ products อัปเดต (หลัง sync) → merge frontStoreCheckedQty
  // เฉพาะ SKU ที่เครื่องนี้ยังไม่แตะ (touched) — กัน overwrite ค่าที่กำลังพิมพ์อยู่
  uE(() => {
    setCheckedQtys(prev => {
      let changed = false;
      const next = { ...prev };
      products.forEach(p => {
        if (touchedRef.current.has(p.sku)) return;
        if (p.frontStoreCheckedQty == null) return;
        if (prev[p.sku] !== p.frontStoreCheckedQty) { next[p.sku] = p.frontStoreCheckedQty; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  const setQty = uC((sku, val) => {
    setCheckedQtys(prev => ({ ...prev, [sku]: val === "" ? "" : parseInt(val) || 0 }));
    setTouched(prev => new Set([...prev, sku]));
  }, []);

  const baseFiltered = uM(() => {
    let f = products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า");
    if (activeCat !== "ALL") f = f.filter(p => p.cat === activeCat);
    if (supplierFilter) f = f.filter(p => (p.lastSupplier || p.vendor || "").toLowerCase() === supplierFilter.toLowerCase());
    if (search) {
      const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
      f = f.filter(p => {
        const hay = ((p.sku||"") + " " + (p.name||"")).toLowerCase();
        return tokens.every(t => hay.includes(t));
      });
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
    if (showMode === "reorder") return baseFiltered.filter(function(p) { return (p.qtyStore||0) <= 12 && (p.qtyWH||0) > 0; });
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

  const handleSave = async (isAuto = false) => {
    const entries = [...touched]
      .filter(sku => checkedQtys[sku] !== "" && checkedQtys[sku] != null)
      .map(sku => ({ sku, qty: parseInt(checkedQtys[sku]) || 0 }));
    if (entries.length === 0) {
      if (!isAuto) showToast("warn", "ยังไม่ได้กรอกจำนวน", "✏️");
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
    } else if (!isAuto) {
      // auto-save ที่ fail จะเงียบ + retry เอง (FAB ยังแสดง "รอบันทึก") กัน toast เด้งซ้ำทุก 3 วิ
      showToast("error", "บันทึกไม่สำเร็จ", "❌");
    }
  };

  // Auto-save with 3-second debounce
  uE(() => {
    if (touchedWithValue === 0 || saving) return;
    const timer = setTimeout(() => {
      handleSave(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [checkedQtys, touched, saving, touchedWithValue]);

  // โอนสินค้าจากคลัง → หน้าร้าน (ใช้ reorder mode)
  async function handleTransfer() {
    if (!transferTarget || transferQty < 1) return;
    setTransferring(true);
    try {
      const res = await syncStockTransferBatch([{ sku: transferTarget.sku, qty: transferQty, name: transferTarget.name }]);
      if (res && res.success === false) throw new Error(res.error || "ไม่สำเร็จ");
      showToast("success", `โอน ${transferQty} ชิ้น "${transferTarget.name}" แล้ว`, "📦");
      setTransferTarget(null);
      setTransferQty(1);
    } catch(e) {
      showToast("error", "โอนไม่สำเร็จ: " + (e.message || e), "❌");
    }
    setTransferring(false);
  }

  const PAGE_SIZE = 20;
  const [page, setPage] = uS(0);
  uE(() => { setPage(0); }, [activeCat, supplierFilter, search, showMode]);
  // ปิด purchase mode เมื่อ role ไม่ใช่ owner
  uE(() => { if (role !== "owner") setPurchaseMode(false); }, [role]);

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
        <ScanButton size={40} onScan={handleScanDetected}
          style={{border:"1.5px solid var(--g-300)", borderRadius:10, flexShrink:0}}/>
        {role === "owner" && (
          <div style={{display:"flex",gap:4,border:"1px solid #e5e7eb",borderRadius:8,overflow:"hidden"}}>
            <button onClick={() => setPurchaseMode(false)}
              style={{minHeight:44,padding:"6px 14px",fontSize:13,border:"none",background:!purchaseMode?"#2563eb":"#f9fafb",
                      color:!purchaseMode?"#fff":"#374151",cursor:"pointer",fontFamily:"inherit"}}>
              ตรวจสต็อก
            </button>
            <button onClick={() => setPurchaseMode(true)}
              style={{minHeight:44,padding:"6px 14px",fontSize:13,border:"none",background:purchaseMode?"#2563eb":"#f9fafb",
                      color:purchaseMode?"#fff":"#374151",cursor:"pointer",fontFamily:"inherit"}}>
              📋 จัดซื้อ
            </button>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2,flexShrink:0}}>
          <button onClick={() => handleSave()}
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
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",maxWidth:"100%"}}>
            <Seg value={showMode} onChange={setShowMode} options={[
              {value:"all",       label:"🗂️ ทั้งหมด"},
              {value:"unchecked", label:`⬜ รอเช็ค${uncheckedCount>0?` (${uncheckedCount})`:""}`},
              {value:"mismatch",  label:`❌ ไม่ตรง${mismatchCount>0?` (${mismatchCount})`:""}`},
              {value:"reorder",   label:"🔄 ควรสั่ง"},
            ]}/>
          </div>
          {supplierFilter && (
            <button onClick={() => setSupplierFilter("")}
              style={{minHeight:44,fontSize:11,padding:"4px 12px",borderRadius:8,border:"1px solid var(--bdr)",
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

      {purchaseMode ? (
        <PurchaseGroupView products={baseFiltered}/>
      ) : !mounted ? (
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
              }}
              onOrder={(p.qtyWH || 0) > 0 ? () => {
                setTransferTarget({ sku: p.sku, name: p.name, maxQty: p.qtyWH || 0 });
                setTransferQty(Math.min(p.qtyWH || 0, Math.max(1, 12 - (p.qtyStore || 0))));
              } : undefined}/>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",
                     gap:8,padding:"4px 0",flexWrap:"wrap"}}>
          <button onClick={() => setPage(0)} disabled={page===0}
            className="btn" style={{minHeight:44,padding:"6px 12px",fontSize:14,minWidth:44,
                                    opacity:page===0?.35:1}}>«</button>
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0}
            className="btn" style={{minHeight:44,padding:"6px 14px",fontSize:13,
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
                style={{minHeight:44,padding:"6px 10px",fontSize:14,minWidth:44,fontWeight:item===page?700:400}}>
                {item+1}
              </button>
            ))
          }
          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page===totalPages-1}
            className="btn" style={{minHeight:44,padding:"6px 14px",fontSize:13,
                                    opacity:page===totalPages-1?.35:1}}>ถัดไป ›</button>
          <button onClick={() => setPage(totalPages-1)} disabled={page===totalPages-1}
            className="btn" style={{minHeight:44,padding:"6px 12px",fontSize:14,minWidth:44,
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

    {/* Sticky FAB button (bottom-right) */}
    {touchedWithValue > 0 && (
      <div style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 999,
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12
      }}>
        <div style={{
          padding: "12px 16px", borderRadius: 12,
          background: saving ? "var(--warn)" : "var(--g-600)",
          color: "#fff", fontSize: 13, fontWeight: 700,
          boxShadow: "0 4px 12px rgba(0,0,0,.15)",
          transition: "background .2s"
        }}>
          {saving ? <>⏳ กำลังบันทึก {touchedWithValue}...</> : <>✏️ รอบันทึก {touchedWithValue}</> }
        </div>
        {lastSavedTime && (
          <div style={{
            padding: "8px 12px", borderRadius: 8,
            background: "#f0fdf4", color: "var(--g-700)",
            fontSize: 11, fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,.1)"
          }}>
            ✓ บันทึกแล้ว {lastSavedTime.getHours().toString().padStart(2,"0")}:{lastSavedTime.getMinutes().toString().padStart(2,"0")}
          </div>
        )}
      </div>
    )}

    {lightbox && <ImageLightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)}/>}
    <Toast toast={toast} onClose={hideToast}/>

    {/* ── Mini Transfer Modal (reorder mode) ── */}
    {transferTarget && (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:9999,
                   display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div style={{background:"#fff",borderRadius:12,padding:20,width:"100%",maxWidth:360,
                     boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}>
          <div style={{fontWeight:700,fontSize:16,marginBottom:12}}>📦 สั่งเพิ่ม: {transferTarget.name}</div>
          <div style={{fontSize:13,color:"#6b7280",marginBottom:8}}>คลังมี: {transferTarget.maxQty} ชิ้น</div>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:13,display:"block",marginBottom:4}}>จำนวนที่จะโอน</label>
            <input type="number" min={1} max={transferTarget.maxQty || 999}
              value={transferQty}
              onChange={e => setTransferQty(Math.max(1, parseInt(e.target.value) || 1))}
              style={{width:"100%",padding:"8px 12px",border:"1px solid #d1d5db",borderRadius:8,
                      fontSize:16,boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={() => setTransferTarget(null)}
              style={{flex:1,padding:"10px 0",borderRadius:8,border:"1px solid #d1d5db",
                      background:"#f9fafb",cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>
              ยกเลิก
            </button>
            <button onClick={handleTransfer} disabled={transferring}
              style={{flex:2,padding:"10px 0",borderRadius:8,border:"none",
                      background:transferring?"#93c5fd":"#2563eb",color:"#fff",
                      cursor:transferring?"not-allowed":"pointer",fontSize:14,fontWeight:600,
                      fontFamily:"inherit"}}>
              {transferring ? "กำลังโอน..." : "✅ ยืนยันโอน"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── confirm stock count → write to SHEET_PRODUCTS col H + push ZORT ───
async function confirmStockCount(entries) {
  // entries = [{ sku, qty }]
  if (!SHEET_DEPLOY_URL) { console.warn("SHEET_DEPLOY_URL not set"); return { success: false }; }
  try {
    const res = await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        confirmStockCount: true,
        datetime: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }),
        clientLoadedAt: window._dataLoadedAt || 0, // สำหรับ conflict detection
        actor: window._currentUser || sessionStorage.getItem("dmj_role") || "พนักงาน",
        entries,
      }),
    });
    const json = await res.json();
    return json; // คืน object ดิบ (success, conflict, error)
  } catch (err) { return { success: false, error: err.message }; }
}

// ─── sync lock data to "ตำแหน่งจัดเก็บ" sheet ───
async function syncLockData(lockKey, entries) {
  // entries = [{ sku, qty, isNew }]
  if (!SHEET_DEPLOY_URL) { console.warn("SHEET_DEPLOY_URL not set"); return { success: false }; }
  try {
    await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        updateLockData: true,
        lockKey,
        datetime: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }),
        entries,
        actor: window._currentUser || sessionStorage.getItem("dmj_role") || "พนักงาน",
      }),
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

async function syncDeleteLockEntry(lockKey, sku) {
  if (!SHEET_DEPLOY_URL) { console.warn("SHEET_DEPLOY_URL not set"); return { success: false }; }
  try {
    await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ deleteLockEntry: true, lockKey, sku }),
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

function LockModal({ lockKey, data, productMap, products, lockOv, onUpdateLock, onClose }) {
  useBackHandler(onClose); // Android back = ปิด lock modal
  const [lightbox, setLightbox] = uS(null);
  const [editMode, setEditMode] = uS(false);
  const [addSku, setAddSku] = uS("");
  const [saving, setSaving] = uS(false);
  const [savedSkus, setSavedSkus] = uS(new Set());
  const [lastSavedTime, setLastSavedTime] = uS(null);
  const [lastSavedSnap, setLastSavedSnap] = uS(""); // snapshot กัน auto-save วนซ้ำ
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

  const handleSave = async (isAuto = false) => {
    const entries = Object.entries(checkedQtys)
      .filter(([, v]) => v !== "" && v !== null && v !== undefined)
      .map(([sku, qty]) => ({ sku, qty: parseInt(qty) || 0, isNew: newSkus.has(sku) }));
    if (entries.length === 0) {
      if (!isAuto) showToast("warn", "ยังไม่ได้กรอกจำนวน", "✏️");
      return;
    }
    setSaving(true);
    const snap = JSON.stringify(checkedQtys);
    const result = await syncLockData(lockKey, entries);
    setSaving(false);
    if (result.success !== false) {
      const done = new Set([...savedSkus, ...entries.map(e => e.sku)]);
      setSavedSkus(done);
      setNewSkus(new Set());
      setLastSavedTime(new Date());
      setLastSavedSnap(snap); // กัน auto-save วนซ้ำ: ค่าที่ save ไปแล้วจะไม่ถูก save อีก
      showToast("success", `บันทึก ${entries.length} รายการ`, "💾");
    } else if (!isAuto) {
      showToast("error", "บันทึกไม่สำเร็จ", "❌");
    }
  };

  // Auto-save with 3-second debounce — save เฉพาะเมื่อค่าต่างจากที่ save ล่าสุด (กัน loop)
  const touchedCount = Object.values(checkedQtys).filter(v => v !== "" && v != null).length;
  uE(() => {
    if (touchedCount === 0 || saving) return;
    if (JSON.stringify(checkedQtys) === lastSavedSnap) return; // ไม่มีอะไรเปลี่ยน → ไม่ต้อง save
    const timer = setTimeout(() => {
      handleSave(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [checkedQtys, saving, touchedCount, lastSavedSnap]);

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
            <ScanButton size={38} onScan={handleScanDetected}
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
    {/* Sticky FAB button (bottom-right) */}
    {touchedCount > 0 && (
      <div style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 1099,
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12
      }}>
        <div style={{
          padding: "12px 16px", borderRadius: 12,
          background: saving ? "var(--warn)" : "var(--g-600)",
          color: "#fff", fontSize: 13, fontWeight: 700,
          boxShadow: "0 4px 12px rgba(0,0,0,.15)",
          transition: "background .2s"
        }}>
          {saving ? <>⏳ กำลังบันทึก...</> : <>✏️ รอบันทึก {touchedCount}</> }
        </div>
        {lastSavedTime && (
          <div style={{
            padding: "8px 12px", borderRadius: 8,
            background: "#f0fdf4", color: "var(--g-700)",
            fontSize: 11, fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,.1)"
          }}>
            ✓ บันทึกแล้ว {lastSavedTime.getHours().toString().padStart(2,"0")}:{lastSavedTime.getMinutes().toString().padStart(2,"0")}
          </div>
        )}
      </div>
    )}

    <Toast toast={toast} onClose={hideToast}/>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// STOCK COUNT VIEW — นับ stock คลัง ทีละล็อค (Owner + WH เท่านั้น)
// ─────────────────────────────────────────────────────────────────────
function StockCountView({ data, checkRequest, onCheckComplete }) {
  const storage    = data.storage  || {};
  const shelves    = storage.shelves || { A: 10, B: 10, locksPerShelf: 15 };
  const verifiedLockMap = storage.verifiedLockMap || {};
  const productLockMap  = storage.productLockMap  || {};

  // ถ้ามี checkRequest → กรองสินค้าเฉพาะ SKU ที่ owner ส่งมา
  const checkSkuSet = uM(function() {
    if (!checkRequest) return null;
    return new Set(checkRequest.skus);
  }, [checkRequest]);

  const products = uM(function() {
    var all = data.products || [];
    if (!checkSkuSet) return all;
    return all.filter(function(p){ return checkSkuSet.has(p.sku); });
  }, [data.products, checkSkuSet]);

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
  // saveStatus: "idle" | "pending" | "saving" | "saved" | "error"
  const [saveStatus, setSaveStatus]         = uS("idle");
  const [confirming, setConfirming]         = uS(false);
  const [lastSavedTime, setLastSavedTime]   = uS(null);
  const [lastSavedSnap, setLastSavedSnap]   = uS(""); // snapshot กัน auto-save วนซ้ำ
  const [toast, showToast, hideToast]       = useToast();
  const [calcPad, setCalcPad]               = uS(null); // {sku, val, name}
  const [stockSearch, setStockSearch]       = uS('');
  // Supplier mode
  const [supplierMode, setSupplierMode]     = uS(false);
  const [selSupplier, setSelSupplier]       = uS(null);
  const [suppSearch, setSuppSearch]         = uS('');
  const [countFilter, setCountFilter]       = uS('all'); // all | pending | matched | mismatched — กรองตอนนับของเยอะ
  // SKU ที่ผู้ใช้เครื่องนี้แก้เอง — ไม่ให้ค่าจากเครื่องอื่น (recentCountedSkus) มาทับ + ใช้ตอน save
  const localEditsRef = React.useRef(new Set());
  // จำจำนวนที่นับไว้ในเครื่องนี้ แยกตาม context (ล็อค/ซัพพลายเออร์) — กดออกแล้วกลับเข้ามายังเห็นเลขเดิม
  // ผูกกับ window เพื่อให้ค้างอยู่แม้สลับแท็บแล้ว component remount (รีเซ็ตเมื่อ reload หน้าเท่านั้น)
  const countsCacheRef = React.useRef(window._dmjStockCounts || (window._dmjStockCounts = {})); // { ctxKey: { sku: qtyStr } }
  const ctxKeyOf = (sup, lock) => sup ? ('s:' + sup) : (lock ? ('l:' + lock) : '');

  // restore ค่าที่นับไว้เดิมของ context นี้ (ถ้ามี) เมื่อสลับล็อค/ซัพพลายเออร์ → กดออก-เข้าใหม่ไม่หาย
  const restoreCtx = (key) => {
    const saved = (key && countsCacheRef.current[key]) ? { ...countsCacheRef.current[key] } : {};
    setCheckedQtys(saved);
    localEditsRef.current = new Set(Object.keys(saved));
    setSavedSkus(new Set()); setLastSavedTime(null);
    setLastSavedSnap(JSON.stringify(saved)); // กัน auto-save เด้งทันทีหลัง restore
    setStockSearch(''); setSaveStatus("idle"); setCountFilter('all');
  };
  uE(() => { restoreCtx(ctxKeyOf(null, selLockKey)); }, [selLockKey]); // eslint-disable-line react-hooks/exhaustive-deps
  uE(() => { restoreCtx(ctxKeyOf(selSupplier, null)); }, [selSupplier]); // eslint-disable-line react-hooks/exhaustive-deps

  // นับพร้อมกันหลายเครื่อง: ดึง "จำนวนที่เครื่องอื่นเพิ่งนับ" (data.recentCountedSkus) มาแสดงด้วย
  // เฉพาะ SKU ที่เครื่องนี้ "ยังไม่ได้แตะเอง" — re-run เมื่อเปลี่ยน context ด้วย (กลับเข้ามาเห็นของเครื่องอื่น)
  uE(() => {
    const remote = data.recentCountedSkus;
    if (!remote || typeof remote !== 'object') return;
    setCheckedQtys(prev => {
      let changed = false; const next = { ...prev };
      Object.keys(remote).forEach(sku => {
        if (localEditsRef.current.has(sku)) return;          // เครื่องนี้แก้เอง → ไม่ทับ
        const cur = prev[sku];
        const val = String(remote[sku]);
        if ((cur == null || cur === '') && val !== '' && cur !== val) { next[sku] = val; changed = true; }
      });
      if (!changed) return prev;
      // ถ้าก่อน merge ไม่มีค่าค้างรอ save (clean) → เลื่อน snapshot ตามไปด้วย
      // กัน auto-save เด้งบันทึกค่าที่ merge มาจากเครื่องอื่นซ้ำ (push ZORT ฟรี ๆ)
      const prevSnap = JSON.stringify(prev);
      setLastSavedSnap(ls => (ls === prevSnap ? JSON.stringify(next) : ls));
      return next;
    });
  }, [data.recentCountedSkus, selSupplier, selLockKey]);

  // ถ้า checkRequest ส่งมา → auto-เข้า supplier mode ถ้า SKU ทั้งหมดมาจาก supplier เดียว
  uE(function() {
    if (!checkRequest || !checkRequest.skus || !checkRequest.skus.length) return;
    var checkSkus = new Set(checkRequest.skus);
    var sups = new Set();
    (data.products || []).forEach(function(p) {
      if (checkSkus.has(p.sku)) {
        var s = p.lastSupplier || p.vendor;
        if (s) sups.add(s);
      }
    });
    if (sups.size === 1) {
      setSupplierMode(true);
      setSelSupplier([...sups][0]);
    } else if (sups.size > 1) {
      setSupplierMode(true);
    }
  }, [checkRequest]);

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
      const ck = ctxKeyOf(selSupplier, selLockKey);
      if (ck) { (countsCacheRef.current[ck] = countsCacheRef.current[ck] || {})[calcPad.sku] = qty; }
      localEditsRef.current.add(calcPad.sku);
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
    const nv  = String(Math.max(0, n + delta));
    const ck  = ctxKeyOf(selSupplier, selLockKey);
    if (ck) { (countsCacheRef.current[ck] = countsCacheRef.current[ck] || {})[sku] = nv; }
    localEditsRef.current.add(sku);
    setCheckedQtys(prev => ({ ...prev, [sku]: nv }));
  };

  const scTouchedCount = Object.values(checkedQtys).filter(v => v !== '' && v != null).length;

  // derived: true ขณะ POST อยู่ (ใช้ disable ปุ่ม)
  const saving = saveStatus === "saving";

  const handleSave = async (isAuto = false) => {
    // บันทึกเฉพาะ SKU ที่ "เครื่องนี้นับเอง" — ไม่ re-save ค่าที่ merge มาจากเครื่องอื่น (กัน push ZORT ซ้ำ)
    const entries = Object.entries(checkedQtys)
      .filter(([sku, v]) => v !== '' && v != null && localEditsRef.current.has(sku))
      .map(([sku, qty]) => ({ sku, qty: parseInt(qty)||0 }));
    if (!entries.length) { if (!isAuto) showToast('warn', 'ยังไม่ได้กรอกจำนวน', '✏️'); return; }
    setSaveStatus("saving");
    const snap = JSON.stringify(checkedQtys);
    // ถ้านับตามล็อค → บันทึกตำแหน่งจัดเก็บด้วย; แล้ว commit ผลนับ → อัปเดตคลังจริง + push ZORT
    if (selLockKey) await syncLockData(selLockKey, entries);
    const result = await confirmStockCount(entries);
    if (result.conflict) {
      setSaveStatus("error");
      showToast('error', 'ข้อมูลถูกแก้ไขโดยคนอื่น กด 🔄 Reload เพื่อดูข้อมูลล่าสุด', '⚠️');
    } else if (result.success !== false) {
      setSavedSkus(new Set(entries.map(e => e.sku)));
      setLastSavedTime(new Date());
      setLastSavedSnap(snap); // กัน auto-save วนซ้ำ
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
      showToast('success', 'บันทึก ' + entries.length + ' รายการ — อัปเดตคลัง + ZORT', '✅');
    } else {
      setSaveStatus("error");
      if (!isAuto) showToast('error', 'บันทึกไม่สำเร็จ', '❌');
    }
  };

  // Auto-save with 3-second debounce — save เฉพาะเมื่อค่าต่างจากที่ save ล่าสุด (กัน loop)
  // ทำงานทั้งโหมดเลือกตามล็อค (selLockKey) และตามซัพพลายเออร์ (selSupplier)
  uE(() => {
    if (scTouchedCount === 0 || saving) return;
    if (!selLockKey && !selSupplier) return;
    const snap = JSON.stringify(checkedQtys);
    if (snap === lastSavedSnap) return;
    // บอก user ว่ามีข้อมูลรอ save
    setSaveStatus("pending");
    const timer = setTimeout(() => {
      handleSave(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [checkedQtys, saving, scTouchedCount, selLockKey, selSupplier, lastSavedSnap]);

  const handleConfirm = async () => {
    const entries = Object.entries(checkedQtys)
      .filter(([sku, v]) => v !== '' && v != null && localEditsRef.current.has(sku))
      .map(([sku, qty]) => ({ sku, qty: parseInt(qty)||0 }));
    if (!entries.length) { showToast('warn', 'ยังไม่ได้กรอกจำนวน', '✏️'); return; }
    setConfirming(true);
    const snap = JSON.stringify(checkedQtys);
    if (selLockKey) await syncLockData(selLockKey, entries);
    const result = await confirmStockCount(entries);
    setConfirming(false);
    if (result.conflict) {
      setSaveStatus("error");
      showToast('error', 'ข้อมูลถูกแก้ไขโดยคนอื่น กด 🔄 Reload เพื่อดูข้อมูลล่าสุด', '⚠️');
    } else if (result.success !== false) {
      setSavedSkus(new Set(entries.map(e => e.sku)));
      setLastSavedTime(new Date());
      setLastSavedSnap(snap); // กัน auto-save commit ซ้ำหลังกดยืนยันเอง
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
      showToast('success', 'ยืนยันผลนับแล้ว ' + entries.length + ' รายการ — อัปเดตคลัง + ZORT', '✅');
    } else {
      setSaveStatus("error");
      showToast('error', 'ยืนยันไม่สำเร็จ', '❌');
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

  // suppliers ที่มีสินค้าในคลัง (qtyWH > 0) สำหรับแสดง list ปกติ
  // แต่ถ้ามี checkRequest ให้รวม supplier ของ SKU ที่ขอด้วย (qtyWH อาจ = 0 ได้)
  const allSuppliersWH = uM(() => {
    const s = new Set();
    const checkSkuSet = checkRequest ? new Set(checkRequest.skus || []) : null;
    products.forEach(p => {
      const v = p.lastSupplier || p.vendor;
      if (!v) return;
      if (whQty(p) > 0) { s.add(v); return; }
      if (checkSkuSet && checkSkuSet.has(p.sku)) s.add(v);
    });
    return [...s].sort();
  }, [products, checkRequest]);

  const filteredSuppliers = uM(() => {
    if (!suppSearch.trim()) return allSuppliersWH;
    const q = suppSearch.trim().toLowerCase();
    return allSuppliersWH.filter(s => s.toLowerCase().includes(q));
  }, [allSuppliersWH, suppSearch]);

  // products จาก supplier ที่เลือก — filter qtyWH > 0 เสมอ เว้นแต่ SKU นั้นอยู่ใน checkRequest
  const supplierProducts = uM(() => {
    if (!selSupplier) return [];
    const checkSkuSet = checkRequest ? new Set(checkRequest.skus || []) : null;
    return products
      .filter(p => {
        if ((p.lastSupplier || p.vendor) !== selSupplier) return false;
        if (whQty(p) > 0) return true;
        return checkSkuSet && checkSkuSet.has(p.sku);
      })
      .sort((a, b) => {
        const la = skuToLock[a.sku] || 'zzz';
        const lb = skuToLock[b.sku] || 'zzz';
        return la.localeCompare(lb, undefined, { numeric: true }) || compareSku(a, b);
      });
  }, [selSupplier, products, skuToLock, checkRequest]);

  // รายการที่แสดงจริงหลังกรอง (สถานะนับ + ค้นหา) — ใช้ทั้ง render และเช็คว่าว่างไหม
  const supplierVisible = uM(() => supplierProducts.filter(p => {
    if (countFilter !== 'all') {
      const v = checkedQtys[p.sku];
      const h = v !== '' && v != null;
      const m = h && (parseInt(v)||0) === whQty(p);
      if (countFilter === 'pending'    && h) return false;
      if (countFilter === 'matched'    && !(h && m)) return false;
      if (countFilter === 'mismatched' && !(h && !m)) return false;
    }
    if (!stockSearch) return true;
    const sq = stockSearch.trim().toUpperCase();
    return p.sku.toUpperCase().includes(sq) || (p.name||'').toUpperCase().includes(sq);
  }), [supplierProducts, countFilter, checkedQtys, stockSearch]);

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
    setSaveStatus("saving");
    let anyError = false;
    for (const [lk, entries] of lockEntries) {
      const result = await syncLockData(lk, entries);
      if (result.success === false) anyError = true;
    }
    const totalSaved = lockEntries.reduce((s, [, e]) => s + e.length, 0);
    if (!anyError) {
      setSavedSkus(new Set(lockEntries.flatMap(([, e]) => e.map(x => x.sku))));
      setLastSavedTime(new Date());
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
      showToast('success', `บันทึก ${totalSaved} รายการ ใน ${lockEntries.length} ล็อค`, '💾');
    } else {
      setSaveStatus("error");
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
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                <button onClick={handleSaveSupplier} disabled={saving||suppFilledCount===0}
                  className="btn primary"
                  style={{padding:'10px 20px',fontWeight:700,fontSize:14,
                          opacity:(saving||suppFilledCount===0)?0.4:1}}>
                  {saveStatus === "saving" ? '↻ กำลังบันทึก...' : suppFilledCount>0 ? `💾 บันทึก (${suppFilledCount})` : '💾 บันทึก'}
                </button>
                {/* สถานะ auto-save 3 state */}
                {saveStatus === "pending" && (
                  <span style={{fontSize:11,color:'#888',fontWeight:600}}>● รอบันทึก...</span>
                )}
                {saveStatus === "saved" && (
                  <span style={{fontSize:11,color:'#22c55e',fontWeight:600}}>✓ บันทึกแล้ว</span>
                )}
                {saveStatus === "error" && (
                  <span style={{fontSize:11,color:'#ef4444',fontWeight:700}}>⚠️ บันทึกไม่สำเร็จ กด 🔄 Reload</span>
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
              {/* Summary chips — กดเพื่อกรอง (เช็คของเยอะจะได้ไม่ซ้ำ: กด "รอนับ" เห็นเฉพาะที่ยังไม่ได้นับ) */}
              {supplierProducts.length > 0 && (
                <div style={{display:'flex',gap:8}}>
                  {[
                    {key:'pending',    n:supplierSummary.waiting,    label:'⬜ รอนับ',  bg:'#f1f5f9', c:'var(--muted)'},
                    {key:'matched',    n:supplierSummary.matched,    label:'✅ ตรง',    bg:'#f0fdf4', c:'var(--g-700)'},
                    {key:'mismatched', n:supplierSummary.mismatched, label:'⚠️ ไม่ตรง',
                     bg:supplierSummary.mismatched>0?'#fff5f5':'#f1f5f9',
                     c:supplierSummary.mismatched>0?'var(--dang)':'var(--muted)'},
                  ].map(function(item){
                    var active = countFilter === item.key;
                    return (
                      <div key={item.label} onClick={() => setCountFilter(active ? 'all' : item.key)}
                        style={{flex:1,textAlign:'center',padding:'10px 4px',cursor:'pointer',
                                borderRadius:12,background:item.bg,
                                border: active ? '2px solid '+item.c : '2px solid transparent',
                                boxShadow: active ? '0 2px 8px rgba(0,0,0,.12)' : 'none'}}>
                        <div style={{fontSize:22,fontWeight:800,color:item.c}}>{item.n}</div>
                        <div style={{fontSize:11,color:item.c,fontWeight:600}}>{item.label}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {countFilter !== 'all' && (
                <button onClick={() => setCountFilter('all')}
                  style={{alignSelf:'flex-start',background:'#fff',border:'1.5px solid var(--bdr)',
                          borderRadius:999,padding:'5px 14px',fontSize:12,fontWeight:600,
                          cursor:'pointer',fontFamily:'inherit',color:'var(--g-700)'}}>
                  ✕ แสดงทั้งหมด
                </button>
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
              ) : supplierVisible.length === 0 ? (
                <Empty title={countFilter === 'pending' ? '🎉 นับครบทุกรายการแล้ว' : 'ไม่พบรายการ'}
                  sub={countFilter === 'pending' ? 'ไม่มีรายการที่ค้างนับ' : 'ลองเปลี่ยนตัวกรองหรือคำค้นหา'}/>
              ) : (
                <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,width:"100%",minWidth:0,boxSizing:"border-box"}}>
                  {supplierVisible.map(p => {
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
                          {/* นับแล้ว → ติ๊กถูกมุมขวาบน ให้เห็นชัดว่าเช็คแล้ว ไม่ต้องนับซ้ำ */}
                          {has && (
                            <div style={{
                              position:'absolute',top:6,right:6,
                              width:26,height:26,borderRadius:'50%',
                              background: matched ? 'var(--g-500)' : 'var(--dang)',
                              color:'#fff',fontSize:15,fontWeight:900,
                              display:'flex',alignItems:'center',justifyContent:'center',
                              border:'2px solid rgba(255,255,255,.95)',
                              boxShadow:'0 1px 4px rgba(0,0,0,.35)',
                            }}>
                              {matched ? '✓' : '!'}
                            </div>
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
      {/* ── Check Request banner ── */}
      {checkRequest && (
        <div style={{background:"#fffbeb",borderBottom:"1px solid #fcd34d",
                     padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>📋</span>
          <div style={{flex:1,fontSize:14}}>
            <b>กำลังเช็คตามคำขอ</b> · {checkRequest.skus.length} รายการ
          </div>
          <button onClick={function(){ onCheckComplete && onCheckComplete(checkRequest.reqId); }}
            style={{background:"#1f7f44",color:"#fff",border:"none",borderRadius:8,
                    padding:"8px 14px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
            ✅ เสร็จแล้ว
          </button>
        </div>
      )}
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
      {/* ── Check Request banner ── */}
      {checkRequest && (
        <div style={{background:"#fffbeb",borderBottom:"1px solid #fcd34d",
                     padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>📋</span>
          <div style={{flex:1,fontSize:14}}>
            <b>กำลังเช็คตามคำขอ</b> · {checkRequest.skus.length} รายการ
          </div>
          <button onClick={function(){ onCheckComplete && onCheckComplete(checkRequest.reqId); }}
            style={{background:"#1f7f44",color:"#fff",border:"none",borderRadius:8,
                    padding:"8px 14px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
            ✅ เสร็จแล้ว
          </button>
        </div>
      )}
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
      {/* ── Check Request banner ── */}
      {checkRequest && (
        <div style={{background:"#fffbeb",borderBottom:"1px solid #fcd34d",
                     padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>📋</span>
          <div style={{flex:1,fontSize:14}}>
            <b>กำลังเช็คตามคำขอ</b> · {checkRequest.skus.length} รายการ
          </div>
          <button onClick={function(){ onCheckComplete && onCheckComplete(checkRequest.reqId); }}
            style={{background:"#1f7f44",color:"#fff",border:"none",borderRadius:8,
                    padding:"8px 14px",fontWeight:600,fontSize:13,cursor:"pointer"}}>
            ✅ เสร็จแล้ว
          </button>
        </div>
      )}

      {/* ── CalcPadModal ── */}
      <CalcPadModal
        open={!!calcPad}
        name={calcPad ? (calcPad.name || calcPad.sku) : ''}
        initialVal={calcPad ? calcPad.val : ''}
        onConfirm={function(qty){
          if (calcPad) {
            const ck = ctxKeyOf(selSupplier, selLockKey);
            if (ck) { (countsCacheRef.current[ck] = countsCacheRef.current[ck] || {})[calcPad.sku] = qty; }
            localEditsRef.current.add(calcPad.sku);
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
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
            <div style={{display:'flex',gap:6}}>
              <button onClick={() => handleSave()} disabled={saving||confirming||filledCount===0}
                className="btn"
                style={{padding:'10px 14px',fontWeight:700,fontSize:13,
                        border:'1.5px solid var(--bdr)',background:'#fff',
                        opacity:(saving||confirming||filledCount===0)?0.4:1}}>
                {saving ? '⏳...' : '💾 draft'}
              </button>
              <button onClick={handleConfirm} disabled={saving||confirming||filledCount===0}
                className="btn primary"
                style={{padding:'10px 16px',fontWeight:700,fontSize:13,
                        opacity:(saving||confirming||filledCount===0)?0.4:1}}>
                {confirming ? '⏳ ยืนยัน...' : '✅ ยืนยันผลนับ' + (filledCount>0?' ('+filledCount+')':'')}
              </button>
            </div>
            {lastSavedTime && (
              <div style={{fontSize:10,color:'var(--g-600)',fontWeight:600}}>
                {'✓ '+lastSavedTime.getHours().toString().padStart(2,'0')+':'+lastSavedTime.getMinutes().toString().padStart(2,'0')}
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
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,width:"100%",minWidth:0,boxSizing:"border-box"}}>
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
                    <div style={{display:'flex',alignItems:'stretch',gap:2}}>
                      <button onClick={function(){ adjustQty(sku,-5); }}
                        style={{flex:'0 0 28px',height:40,borderRadius:7,
                                border:'1.5px solid var(--bdr)',background:'#fff',
                                cursor:'pointer',fontSize:9,fontWeight:800,
                                fontFamily:'inherit',color:'var(--dang)',padding:0,
                                opacity:num>=5?1:0.3}}>
                        −5
                      </button>
                      <button onClick={function(){ adjustQty(sku,-1); }}
                        style={{flex:'0 0 28px',height:40,borderRadius:7,
                                border:'1.5px solid var(--bdr)',background:'#fff',
                                cursor:'pointer',fontSize:16,fontWeight:800,
                                fontFamily:'inherit',color:'var(--dang)',padding:0,
                                opacity:num>=1?1:0.3}}>
                        −
                      </button>
                      <input type="number" min="0" inputMode="numeric"
                        value={val != null ? val : ''}
                        onChange={function(e){
                          const newVal = e.target.value===''?'':String(Math.max(0,parseInt(e.target.value)||0));
                          const ck = ctxKeyOf(selSupplier, selLockKey);
                          if (ck) { (countsCacheRef.current[ck] = countsCacheRef.current[ck] || {})[sku] = newVal; }
                          localEditsRef.current.add(sku);
                          setCheckedQtys(function(prev){
                            const o = Object.assign({},prev);
                            o[sku] = newVal;
                            return o;
                          });
                        }}
                        placeholder={sys != null ? String(sys) : '0'}
                        style={{
                          flex:1,textAlign:'center',padding:'4px 0',
                          borderRadius:7,fontSize:16,fontWeight:800,
                          fontFamily:'inherit',outline:'none',minWidth:0,
                          border:has?(matched?'2px solid var(--g-500)':'2px solid var(--dang)'):'1.5px solid var(--g-300)',
                          background:has?(matched?'#f0fdf4':'#fff5f5'):'#fff',
                          color:has?(matched?'var(--g-700)':'var(--dang)'):'var(--text)',
                        }}/>
                      <button onClick={function(){ adjustQty(sku,1); }}
                        style={{flex:'0 0 28px',height:40,borderRadius:7,
                                border:'1.5px solid var(--g-200)',background:'#f0fdf4',
                                cursor:'pointer',fontSize:16,fontWeight:800,
                                fontFamily:'inherit',color:'var(--g-700)',padding:0}}>
                        +
                      </button>
                      <button onClick={function(){ adjustQty(sku,5); }}
                        style={{flex:'0 0 28px',height:40,borderRadius:7,
                                border:'1.5px solid var(--g-200)',background:'#f0fdf4',
                                cursor:'pointer',fontSize:9,fontWeight:800,
                                fontFamily:'inherit',color:'var(--g-700)',padding:0}}>
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

      {/* Sticky FAB button (bottom-right) */}
      {(scTouchedCount > 0 || saveStatus === "saved" || saveStatus === "error") && selLockKey && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 999,
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12
        }}>
          <div style={{
            padding: "12px 16px", borderRadius: 12,
            background: saveStatus === "saving" ? "var(--warn)"
              : saveStatus === "error" ? "#fee2e2"
              : saveStatus === "saved" ? "#f0fdf4"
              : "var(--g-600)",
            color: saveStatus === "error" ? "#ef4444"
              : saveStatus === "saved" ? "#16a34a"
              : "#fff",
            fontSize: 13, fontWeight: 700,
            boxShadow: "0 4px 12px rgba(0,0,0,.15)",
            transition: "background .2s, color .2s"
          }}>
            {saveStatus === "pending" && <><span style={{color:"#ccc"}}>●</span> รอบันทึก... ({scTouchedCount})</>}
            {saveStatus === "saving"  && <>↻ กำลังบันทึก...</>}
            {saveStatus === "saved"   && <>✓ บันทึกแล้ว</>}
            {saveStatus === "error"   && <span style={{fontWeight:700}}>⚠️ บันทึกไม่สำเร็จ กด 🔄 Reload</span>}
            {saveStatus === "idle"    && <>✏️ รอบันทึก {scTouchedCount}</>}
          </div>
        </div>
      )}
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

// ── content signature ของ order — ใช้ผูก localStorage state เข้ากับ "ตัวตน" ของ order
// แทนเลขแถว (id เช่น "R5") ที่ถูก reuse เมื่อ order เก่าถูกลบแล้ว order ใหม่มาแทนแถวเดิม
// → กัน state เก่า (เช่น "ส่งแล้ว") เลอะมาทับ order ใหม่ที่บังเอิญอยู่แถวเดียวกัน
// ใช้ field จาก readOrders_: sku, date ("dd/MM/yy"), orderQty
function orderSig(o) {
  if (!o) return "";
  return `${(o.sku||'').trim().toUpperCase()}|${String(o.date||'').replace(/\D/g,'')}|${o.orderQty||0}`;
}

// ── reconcileOrderState: ตัดสินใจว่าจะ apply localStorage entry กับ order นี้หรือไม่
// หลักการ: sheet เป็น authoritative สำหรับ visibility — localStorage ห้ามซ่อน order
// ที่ sheet บอกว่ายัง "รอ" เว้นแต่ยืนยันได้ว่าเป็น order เดียวกันจริง (sig ตรง) และเพิ่งกดไปเร็ว ๆ นี้
// คืน object ที่จะ spread ทับ order: { ...o, id, ...<ผลลัพธ์> }
// nowMs ส่งเข้ามาเพื่อให้เทสต์ได้ (default = Date.now())
function reconcileOrderState(order, localEntry, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  const SIX_H = 6 * 60 * 60 * 1000;
  const DONE_ST = new Set(["สำเร็จ","completed","ส่งแล้ว","shipped"]);
  const local = localEntry || {};
  // ไม่มี local state → ไม่มีอะไรต้อง apply
  if (!Object.keys(local).length) return {};

  const sheetPending = !order.status || order.status === "รอ" || order.status === "pending";
  const sig = orderSig(order);

  // กรณี row reuse: local มี sig แต่ไม่ตรงกับ order ปัจจุบัน → state นี้เป็นของ order อื่น
  // (แถวถูก reuse) → ทิ้งทั้งหมด ไม่ให้เลอะข้าม order
  if (local.sig && local.sig !== sig) return {};

  // local terminal status (สำเร็จ/ส่งแล้ว ฯลฯ) ทับ sheet ที่บอกว่ายังรอ
  const localTerminal = DONE_ST.has(local.status);
  if (sheetPending && localTerminal) {
    // ใช้ 6-hour check ทั้งกรณีมี sig และไม่มี sig
    // (no sig = ข้อมูลก่อน migration — ยังให้ผ่านได้ถ้าเพิ่งกด เพื่อไม่ทิ้ง "สำเร็จ" ที่ user เพิ่งกดไว้)
    // sig ตรง (order เดียวกันจริง) หรือไม่มี sig → เก็บไว้เฉพาะถ้าเพิ่งกดภายใน 6 ชม. (optimistic UI ตอน GAS cache ยังไม่ sync)
    const markedMs = local.markedAt ? new Date(local.markedAt).getTime() : NaN;
    const isRecent = !isNaN(markedMs) && (now - markedMs) < SIX_H;
    if (!isRecent) {
      const { status:_s, markedAt:_m, shipped:_sh, ...rest } = local;
      return rest;
    }
  }
  // กรณีปกติ (sig ตรง และ status สอดคล้อง) → apply local ตามเดิม
  return local;
}

function patchOrderState(id, updates, sig) {
  const s = getOrdersState();
  // ถ้า entry เดิมมี sig แต่ไม่ตรงกับ order ปัจจุบัน = state ค้างของ order อื่น (row reuse)
  // → ทิ้งทั้ง entry ก่อน merge มิฉะนั้น status เก่า (เช่น "ส่งแล้ว") จะถูก adopt มาทับ
  //   order ใหม่เมื่อ sig ถูกเขียนทับให้ตรง → order หายจากรายการ/สรุป
  const prev = (sig != null && s[id] && s[id].sig && s[id].sig !== sig) ? {} : (s[id] || {});
  s[id] = { ...prev, ...updates };
  // แนบ sig (content signature) ลงไปเสมอ เพื่อกัน row-reuse เลอะข้าม order
  if (sig != null) s[id].sig = sig;
  // record when status was changed so we can detect ID collisions with new orders
  if ('status' in updates) s[id].markedAt = new Date().toISOString();
  localStorage.setItem(LS_ORDERS_STATE, JSON.stringify(s)); return s;
}

// ── ลบ entry ใน dmj_orders_state_v1 ที่ sig ไม่ตรงกับ order ปัจจุบันไหนเลย
// (กัน localStorage โตเรื่อย ๆ จากเลขแถวที่ถูก reuse) — ไม่ throw ถ้าพังให้เงียบ
function cleanupOrdersState(orders) {
  try {
    const s = getOrdersState();
    const ids = new Set();
    const sigs = new Set();
    (orders||[]).forEach((o, i) => { ids.add(stableOrderId(o, i)); sigs.add(orderSig(o)); });
    let changed = false;
    Object.keys(s).forEach(id => {
      const e = s[id] || {};
      // ทิ้งเฉพาะ entry ที่มี sig แต่ sig นั้นไม่ตรง order ไหนเลย และ id ก็ไม่ตรง order ปัจจุบัน
      if (e.sig && !sigs.has(e.sig) && !ids.has(id)) { delete s[id]; changed = true; }
    });
    if (changed) localStorage.setItem(LS_ORDERS_STATE, JSON.stringify(s));
    return s;
  } catch { return getOrdersState(); }
}
async function syncOrderUpdate(order, updates) {
  if (!SHEET_DEPLOY_URL) return;
  try {
    await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        updateOrderState: true,
        orderId: order.id,
        sku:         order.sku,
        date:        order.date,
        status:      updates.status,
        preparedQty: updates.preparedQty,
        printFlag:   updates.printFlag,
        carryMode:   updates.carryMode,
      }),
    });
  } catch(e) { console.warn("syncOrderUpdate failed:", e.message); }
}

// ยืนยันรับของจากชีต "รายการโอนสินค้า" (sync ข้ามเครื่อง)
async function syncShipmentReceive(rowId, sku, receivedQty) {
  if (!SHEET_DEPLOY_URL) return { success:false };
  try {
    const res = await fetch(SHEET_DEPLOY_URL, {
      method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify({
        confirmShipmentReceive:true, rowId, sku, receivedQty,
        actor: window._currentUser || sessionStorage.getItem("dmj_role") || "พนักงาน",
      }),
    });
    return await res.json().catch(()=>({success:false}));
  } catch(e){ return { success:false, error:e.message }; }
}

// ─────────────────────────────────────────────────────────────────────
// ORDER LIST VIEW
// ─────────────────────────────────────────────────────────────────────
function OrderItemRow({ order, onPatch, productMap, role, skuLocks, storageData }) {
  const isPending = !order.status || order.status === "รอ" || order.status === "pending";
  const [prepQty, setPrepQty] = uS(() => order.preparedQty > 0 ? order.preparedQty : (order.orderQty || 0));
  const [imgOpen, setImgOpen] = uS(false);
  const [mapOpen, setMapOpen] = uS(false); // warehouse map modal
  const [zeroConfirm, setZeroConfirm] = uS(false);
  const [zeroed, setZeroed] = uS(false);
  const [zeroing, setZeroing] = uS(false);
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

  const doZeroStock = async () => {
    setZeroConfirm(false);
    setZeroing(true);
    const res = await syncZeroStock(order.sku);
    setZeroing(false);
    if (res && res.success === true) {
      setZeroed(true);
      syncDeleteOrders([order.id]);
      showToast("success", `ปรับ ${order.name} เป็น 0 แล้ว`, "✅", 4000);
    } else {
      showToast("warn", `ไม่สำเร็จ: ${(res && res.error) || "ลองใหม่"}`, "⚠️", 5000);
    }
  };

  const pf = order.printFlag;
  // carryMode: ใช้จาก localStorage ก่อน ถ้าไม่มีดูจากข้อมูลใน sheet ถ้าไม่มีก็ default "truck"
  const cm = order.carryMode || "truck";
  const product = productMap ? productMap[order.sku] : null;
  const locs = product?.locations || [];
  const locStr = locs.length
    ? locs.map(l => `${l.side}${l.shelf}/${l.lock}`).join(", ")
    : null;

  // ตำแหน่งล็อคจาก storage data (data.storage.productLockMap / verifiedLockMap)
  const skuUpper = (order.sku || '').trim().toUpperCase();
  const lockKeys = skuLocks ? (skuLocks[skuUpper] || skuLocks[order.sku] || []) : [];
  // ใช้ล็อคแรกเป็น highlight target
  const primaryLock = lockKeys[0] || null;

  return (
    <>
      <div className="order-item-row" style={{
        background:"#fff", borderRadius:12, marginBottom:8,
        border:`1.5px solid ${isPending?"var(--bdr)":"#4fb472"}`,
        overflow:"hidden", opacity: isPending ? 1 : 0.75,
      }}>
        {/* ── Row 1: image + info ── */}
        <div style={{display:"flex",gap:10,alignItems:"flex-start",padding:"12px 14px 8px"}}>
          {/* Thumbnail — clickable; fallback ใช้รูปสินค้าตาม SKU ถ้าแถวไม่มีรูป */}
          {(() => { const imgSrc = order.image || product?.imageUrl || null;
          return (
          <div onClick={() => (imgSrc || product) && setImgOpen(true)}
            style={{
              width:54,height:54,borderRadius:8,flexShrink:0,overflow:"hidden",
              background:"var(--g-50)",cursor:(imgSrc||product)?"pointer":"default",
              border:"1px solid var(--bdr)",position:"relative",
            }}>
            {imgSrc
              ? <img src={imgSrc} alt="" onError={e=>{e.target.style.display="none"}} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--muted)"}}>{I.package}</div>
            }
            {(imgSrc||product) && (
              <div style={{position:"absolute",bottom:2,right:2,background:"rgba(0,0,0,.45)",
                borderRadius:4,padding:"1px 4px",fontSize:8,color:"#fff",lineHeight:1.4}}>
                🔍
              </div>
            )}
          </div>
          ); })()}

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
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {order.name}{cm === "carry" ? <span style={{fontSize:11,fontWeight:700,color:"#1565c0",marginLeft:5,background:"#e3f2fd",borderRadius:4,padding:"1px 6px"}}>order</span> : null}
            </div>
            <div style={{fontSize:11,color:"var(--muted)"}}>
              {order.date}{order.from ? ` · ${order.from}` : ""}{order.to ? ` → ${order.to}` : ""}
            </div>
            {primaryLock && (
              <button onClick={() => setMapOpen(true)} style={{
                marginTop:4,display:"inline-flex",alignItems:"center",gap:4,
                background:"#f0fdf4",borderRadius:6,padding:"3px 9px",fontSize:11,
                color:"#166534",fontWeight:700,border:"1.5px solid #86efac",cursor:"pointer",
                fontFamily:"inherit",
              }}>
                📍 {lockKeys.join(", ")}
              </button>
            )}
          </div>

          {/* ❌ ไม่ได้จัด — มุมขวาบน */}
          {isPending && !zeroed && role !== "frontstore" && role !== "saler" && (
            <button onClick={() => setZeroConfirm(true)}
              title="ไม่ได้จัด — สินค้าหมด ปรับ ZORT เป็น 0"
              disabled={zeroing}
              style={{
                alignSelf:"flex-start",flexShrink:0,
                width:32,height:32,borderRadius:8,
                border:"1.5px solid #fca5a5",background:"#fff5f5",color:"#dc2626",
                cursor:zeroing?"not-allowed":"pointer",fontSize:16,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"inherit",padding:0,
              }}>
              {zeroing ? "⏳" : "❌"}
            </button>
          )}
          {zeroed && (
            <div style={{
              alignSelf:"flex-start",flexShrink:0,
              fontSize:10,fontWeight:700,color:"#dc2626",padding:"4px 7px",
              background:"#fff5f5",borderRadius:8,border:"1.5px solid #fca5a5",
              whiteSpace:"nowrap",
            }}>❌ ไม่ได้จัด</div>
          )}
        </div>

        {/* ── Row 2: quantities + actions ── */}
        {(
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
            {isPending && role !== "frontstore" && role !== "saler" && (
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
        )}
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
            {(order.image || product?.imageUrl) && (
              <img src={order.image || product?.imageUrl} alt="" onError={e=>{e.target.style.display="none"}} style={{width:"100%",borderRadius:10,marginBottom:14,display:"block"}}/>
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
      {/* Warehouse map modal — เปิดเมื่อกด chip ตำแหน่ง */}
      {mapOpen && primaryLock && (
        <WarehouseMapModal
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          highlightKey={primaryLock}
          lockData={(() => {
            const storage = storageData || {};
            const plm = storage.productLockMap  || {};
            const vlm = storage.verifiedLockMap || {};
            const merged = {};
            Object.keys(plm).forEach(k => {
              merged[k] = { skus: plm[k], verified: false, entries: [], mismatch: false };
            });
            Object.keys(vlm).forEach(k => {
              const vSkus = vlm[k].map(v => v.sku);
              const allSkus = merged[k] ? [...new Set([...merged[k].skus, ...vSkus])] : vSkus;
              merged[k] = { skus: allSkus, verified: true, mismatch: false, entries: vlm[k] };
            });
            return merged;
          })()}
          shelves={(storageData || {}).shelves || { A: 10, B: 10, locksPerShelf: 15 }}
          productName={order.name}
          sku={order.sku}
        />
      )}
      <ConfirmModal
        open={zeroConfirm}
        type="warn"
        emoji="❌"
        title="ไม่ได้จัดสินค้า?"
        detail={`${order.name} (${order.sku})\n\nจะปรับสต็อก WH ใน ZORT เป็น 0\nและลบรายการนี้ออกจากรายการสั่ง\n\n⚠️ ทำแล้วย้อนกลับไม่ได้`}
        confirmLabel="ยืนยัน ไม่ได้จัด"
        onConfirm={doZeroStock}
        onCancel={() => setZeroConfirm(false)}
      />
      <Toast toast={toast} onClose={hideToast}/>
    </>
  );
}

// Parse Thai short date "dd/MM/yy" or "dd/MM/yyyy" → ms timestamp
function parseDateMs(s) {
  if (!s) return NaN;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();
  // Try dd/MM/yy or dd/MM/yyyy
  const m = String(s).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return NaN;
  let [, day, mon, yr] = m;
  yr = Number(yr); if (yr < 100) yr += 2000;
  return new Date(yr, Number(mon) - 1, Number(day)).getTime();
}

// สร้าง stable ID จาก sku + date + qty ถ้าไม่มี id จาก sheet
function stableOrderId(o, i) {
  if (o.id) return String(o.id);
  const parts = [o.sku || '', String(o.date || '').replace(/\D/g,''), String(o.orderQty || 0)];
  return parts.join('_') || String(i);
}

// ─────────────────────────────────────────────────────────────────────
// SHIPMENT RECEIVE LIST — แท็บ "ส่งแล้ว" ดึงจากชีต "รายการโอนสินค้า"
// ─────────────────────────────────────────────────────────────────────
// แต่ละ row ถือ state ของช่อง "รับจริง" ของตัวเอง
function ShipmentRow({ s, role, productMap, onConfirm }) {
  const [imgOpen, setImgOpen] = uS(false);
  const [recvQty, setRecvQty] = uS(() => s.receivedQty != null ? s.receivedQty : (s.qty || 0));
  const [editing, setEditing] = uS(false);
  const product = productMap ? productMap[s.sku] : null;
  const imgSrc = s.image || product?.imageUrl || null;
  const canConfirm = role === "saler" || role === "frontstore";
  const canEdit = ["owner","employee","saler","frontstore"].includes(role);

  const handleConfirm = () => {
    const n = Math.max(0, parseInt(recvQty) || 0);
    setEditing(false);
    onConfirm(s, n);
  };

  return (
    <div style={{
      background:"#fff", borderRadius:12, marginBottom:8,
      border:`1.5px solid ${s.receivedAt ? "#4fb472" : "var(--bdr)"}`,
      overflow:"hidden",
    }}>
      {/* ── Row 1: image + info ── */}
      <div style={{display:"flex",gap:10,alignItems:"flex-start",padding:"12px 14px 8px"}}>
        <div onClick={() => imgSrc && setImgOpen(true)}
          style={{
            width:54,height:54,borderRadius:8,flexShrink:0,overflow:"hidden",
            background:"var(--g-50)",cursor:imgSrc?"pointer":"default",
            border:"1px solid var(--bdr)",position:"relative",
          }}>
          {imgSrc
            ? <img src={imgSrc} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--muted)"}}>{I.package}</div>
          }
          {imgSrc && (
            <div style={{position:"absolute",bottom:2,right:2,background:"rgba(0,0,0,.45)",
              borderRadius:4,padding:"1px 4px",fontSize:8,color:"#fff",lineHeight:1.4}}>
              🔍
            </div>
          )}
        </div>

        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,color:"var(--muted)",marginBottom:2}}>{s.sku}</div>
          <div style={{fontSize:14,fontWeight:600,lineHeight:1.3,marginBottom:2,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
          <div style={{fontSize:11,color:"var(--muted)"}}>
            {s.refNum}{s.date ? ` · ${s.date}` : ""}
          </div>
        </div>
      </div>

      {/* ── Row 2: ส่ง + ยืนยันรับ ── */}
      <div style={{
        display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
        padding:"10px 14px 12px",borderTop:"1px solid var(--g-50)",
        background:"var(--g-50)",
      }}>
        {/* Sent qty */}
        <div style={{textAlign:"center",minWidth:44}}>
          <div style={{fontSize:10,color:"var(--muted)",marginBottom:1}}>🚚 ส่ง</div>
          <div style={{fontSize:15,fontWeight:800,color:"var(--dang)"}}>{s.qty}</div>
        </div>

        {s.receivedAt && !editing ? (
          // ── ยืนยันแล้ว — แสดงผล ──
          (() => { const rq = s.receivedQty ?? 0; const full = rq >= s.qty; return (
          <>
          <div style={{
            flex:1,display:"flex",alignItems:"center",gap:8,
            background: full ? "#f0fdf4" : "#fff8e1",
            borderRadius:10,padding:"8px 12px",
            border:`1.5px solid ${full ? "#86efac" : "#fcd34d"}`,
          }}>
            <span style={{fontSize:20}}>{full ? "✅" : "⚠️"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700}}>
                {full ? "รับครบ" : "รับไม่ครบ"}
              </div>
              <div style={{fontSize:11,color:"var(--muted)"}}>
                รับ {rq} / ส่ง {s.qty} pcs
              </div>
              {s.receivedBy && (
                <div style={{fontSize:10,color:"var(--muted)"}}>รับโดย {s.receivedBy}</div>
              )}
              {s.preparedBy && (
                <div style={{fontSize:10,color:"var(--muted)"}}>จัดโดย {s.preparedBy}</div>
              )}
            </div>
          </div>
          {canEdit && !full && (
            <button onClick={() => { setRecvQty(rq); setEditing(true); }} style={{
              padding:"8px 12px",borderRadius:10,border:"1.5px solid var(--bdr)",
              background:"#fff",cursor:"pointer",fontSize:12,fontWeight:600,
              color:"var(--muted)",whiteSpace:"nowrap",flexShrink:0,
            }}>✏️ แก้ไข</button>
          )}
          </>
          ); })()
        ) : (editing || (!s.receivedAt && canConfirm)) ? (
          // ── sale/FS ยืนยันรับ / แก้ไขภายหลัง ──
          <>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <div style={{fontSize:10,color:"var(--muted)"}}>📥 {editing ? "แก้ไข" : "รับจริง"}</div>
              <input type="number" value={recvQty} min={0} max={9999}
                onChange={e => setRecvQty(Math.max(0,parseInt(e.target.value)||0))}
                style={{
                  width:64,height:44,textAlign:"center",borderRadius:8,
                  border:"2px solid var(--g-500)",fontSize:18,fontWeight:800,
                  background:"#f0fdf4",fontFamily:"inherit",
                }}/>
            </div>
            <div style={{flex:1}}/>
            {editing && (
              <button onClick={() => setEditing(false)} style={{
                padding:"10px 12px",borderRadius:10,border:"1.5px solid var(--bdr)",
                background:"#fff",cursor:"pointer",fontSize:12,fontWeight:600,
                color:"var(--muted)",minHeight:44,
              }}>ยกเลิก</button>
            )}
            <button onClick={handleConfirm} style={{
              padding:"10px 16px",borderRadius:10,border:"none",
              background:"#1b5e20",color:"#fff",
              cursor:"pointer",fontSize:14,fontWeight:800,
              display:"flex",flexDirection:"column",alignItems:"center",gap:1,
              minWidth:64,minHeight:44,
            }}>
              <span style={{fontSize:18}}>📦</span>
              <span style={{fontSize:10,letterSpacing:.3}}>{editing ? "บันทึก" : "ยืนยันรับ"}</span>
            </button>
          </>
        ) : (
          // ── role อื่น — รอ sale/FS ──
          <div style={{
            flex:1,display:"flex",alignItems:"center",gap:8,
            background:"#fafafa",borderRadius:10,padding:"8px 12px",
            border:"1.5px solid var(--bdr)",
          }}>
            <span style={{fontSize:18}}>⏳</span>
            <div style={{fontSize:13,color:"var(--muted)"}}>รอ sale/FS ยืนยันรับ</div>
          </div>
        )}
      </div>

      {/* Image modal */}
      {imgOpen && imgSrc && (
        <div onClick={() => setImgOpen(false)} style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,.78)",
          display:"flex",alignItems:"center",justifyContent:"center",
          zIndex:1000,cursor:"pointer",padding:16,
        }}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:"#fff",borderRadius:16,padding:20,
            maxWidth:380,width:"100%",maxHeight:"90vh",overflow:"auto",
          }}>
            <img src={imgSrc} alt="" style={{width:"100%",borderRadius:10,marginBottom:14,display:"block"}}/>
            <div style={{fontWeight:700,fontSize:16,marginBottom:2}}>{s.name}</div>
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:10}}>{s.sku}</div>
            <button onClick={() => setImgOpen(false)} style={{
              width:"100%",padding:"14px",background:"var(--g-700)",color:"#fff",
              border:"none",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:700,
              minHeight:48,
            }}>❌ ปิด</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ShipmentReceiveList({ data, role, productMap }) {
  const shipments = data.shipments || [];
  const [confirmed, setConfirmed] = uS({}); // { [id]: {receivedQty, receivedStatus, receivedAt} }
  const [toast, showToast, hideToast] = useToast();

  // เมื่อ backend ยืนยัน receivedAt มาแล้ว → ล้าง overlay ตัวนั้นทิ้ง ใช้ค่าจริง (receivedBy ฯลฯ)
  uE(() => {
    setConfirmed(prev => {
      if (!Object.keys(prev).length) return prev;
      const next = {};
      let changed = false;
      const real = {};
      shipments.forEach(s => { real[s.id] = s; });
      Object.keys(prev).forEach(id => {
        if (real[id] && real[id].receivedAt) { changed = true; return; } // มีค่าจริงแล้ว ทิ้ง overlay
        next[id] = prev[id];
      });
      return changed ? next : prev;
    });
  }, [shipments]);

  // merge overlay (optimistic) กับข้อมูลจริง
  const rows = uM(() =>
    shipments.map(s => confirmed[s.id] ? { ...s, ...confirmed[s.id] } : s),
    [shipments, confirmed]
  );

  // group ตาม refNum (batch) แล้ว sort batch ใหม่สุดอยู่บน
  const batches = uM(() => {
    const map = {};
    rows.forEach(s => {
      const key = s.refNum || "—";
      if (!map[key]) map[key] = { refNum: s.refNum, date: s.date, items: [] };
      map[key].items.push(s);
    });
    const arr = Object.values(map);
    arr.sort((a, b) => {
      const da = parseDateMs(a.date), db = parseDateMs(b.date);
      if (da !== db) return (isNaN(db)?0:db) - (isNaN(da)?0:da);
      // tiebreak: id เลขมากอยู่บน
      const idNum = x => Math.max(...x.items.map(i => parseInt(String(i.id).replace(/\D/g,''))||0));
      return idNum(b) - idNum(a);
    });
    return arr;
  }, [rows]);

  const handleConfirm = (s, n) => {
    const status = n >= s.qty ? "รับครบ" : "รับไม่ครบ";
    setConfirmed(prev => ({ ...prev, [s.id]: { receivedQty:n, receivedStatus:status, receivedAt:new Date().toISOString() } }));
    syncShipmentReceive(s.id, s.sku, n);
    showToast("success", status==="รับครบ" ? "รับครบ ✅" : `รับ ${n}/${s.qty} pcs ⚠️`, "📦", 3000);
  };

  if (!shipments.length) return (
    <div style={{padding:"40px 20px"}}>
      <Empty title="ยังไม่มีของที่ส่งออกจากคลัง" sub="เมื่อ warehouse กดส่งของ รายการจะมาแสดงที่นี่"/>
    </div>
  );

  return (
    <div>
      {batches.map(b => {
        const total = b.items.length;
        const received = b.items.filter(i => i.receivedAt).length;
        return (
          <div key={b.refNum || "—"} style={{marginBottom:16}}>
            {/* Batch header chip */}
            <div style={{
              display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
              marginBottom:8,padding:"6px 12px",borderRadius:20,
              background:"#eff6ff",border:"1.5px solid #bfdbfe",
              fontSize:12,fontWeight:700,color:"#1e40af",
            }}>
              <span>🚚 {b.refNum}</span>
              {b.date && <span style={{color:"var(--muted)",fontWeight:600}}>· {b.date}</span>}
              <span style={{
                marginLeft:"auto",fontSize:11,fontWeight:800,
                color: received >= total ? "#1f7f44" : "#a07417",
              }}>
                รับแล้ว {received}/{total} รายการ
              </span>
            </div>
            {[...b.items]
              .sort((a, b) => (a.receivedAt ? 1 : 0) - (b.receivedAt ? 1 : 0))
              .map(s => (
                <ShipmentRow key={s.id} s={s} role={role} productMap={productMap} onConfirm={handleConfirm}/>
              ))}
          </div>
        );
      })}
      <Toast toast={toast} onClose={hideToast}/>
    </div>
  );
}

function OrderListView({ data, role }) {
  const orders = data.orders || [];
  const [filter, setFilter] = uS("all");
  const [st, setSt] = uS(getOrdersState);

  // cleanup state ค้างที่ sig ไม่ตรง order ไหนเลย (กัน localStorage โตเรื่อย ๆ) — ครั้งเดียวเมื่อ orders เปลี่ยน
  uE(() => { setSt(cleanupOrdersState(orders)); }, [orders]);
  const productMap = uM(() => { const m={}; (data.products||[]).forEach(p=>m[p.sku]=p); return m; }, [data.products]);

  // สร้าง skuToLocks จาก storage data (productLockMap + verifiedLockMap)
  const skuLocks = uM(() => {
    const storage = data.storage || {};
    const plm = storage.productLockMap  || {};
    const vlm = storage.verifiedLockMap || {};
    const m = {};
    const addEntry = (lk, sku) => {
      const k = (sku||'').trim().toUpperCase();
      if (!k) return;
      if (!m[k]) m[k] = [];
      if (!m[k].includes(lk)) m[k].push(lk);
    };
    Object.entries(plm).forEach(([lk, skus]) => (skus||[]).forEach(s => addEntry(lk, s)));
    Object.entries(vlm).forEach(([lk, entries]) => (entries||[]).forEach(e => addEntry(lk, e.sku)));
    return m;
  }, [data.storage]);

  const enriched = uM(() => {
    return orders.map((o, i) => {
      const id = stableOrderId(o, i);
      // reconcileOrderState ตัดสินใจว่าจะ apply localStorage state นี้หรือไม่
      // (กัน row-reuse เลอะข้าม order + auto-heal state ค้างเดิมที่ไม่มี sig)
      const applied = reconcileOrderState(o, st[id]);
      return { ...o, id, ...applied };
    });
  }, [orders, st]);

  const sorted = uM(() => [...enriched].sort((a,b) => {
    const aP = !a.status||a.status==="รอ"||a.status==="pending";
    const bP = !b.status||b.status==="รอ"||b.status==="pending";
    return (aP&&!bP)?-1:(!aP&&bP)?1:0;
  }), [enriched]);

  const isShippedOut = o => o.status === "ส่งแล้ว" || o.status === "shipped";
  const filtered = uM(() => {
    if (filter === "shipped") return sorted.filter(isShippedOut);
    const base = sorted.filter(o => !isShippedOut(o));
    if (filter==="pending")   return base.filter(o => !o.status||o.status==="รอ"||o.status==="pending");
    if (filter==="completed") return base.filter(o => o.status==="สำเร็จ"||o.status==="completed");
    return base;
  }, [sorted, filter]);

  // แนบ sig ของ order ที่กำลัง patch เสมอ (lookup จาก enriched ด้วย id) เพื่อกัน row-reuse เลอะข้าม
  const patch = (id, updates) => {
    const o = enriched.find(x => x.id === id);
    setSt(patchOrderState(id, updates, o ? orderSig(o) : undefined));
  };

  const pendingCount = sorted.filter(o => !o.status||o.status==="รอ"||o.status==="pending").length;

  const hasShipments = (data.shipments||[]).length > 0;

  // orders ว่าง แต่มี shipments → ดึง tab "ส่งแล้ว" มาไว้หน้าแรก ให้ saler/FS ยืนยันรับได้
  if (!orders.length && !hasShipments) return (
    <div style={{padding:"60px 20px",textAlign:"center"}}>
      <Empty icon={I.cart} title="ยังไม่มีรายการสั่งของ"
        sub="เพิ่มข้อมูลใน Google Sheet 'ลำดับที่สั่งซื้อ' แล้วกด Sync"/>
    </div>
  );

  // ถ้า orders ว่างแต่ shipments มีข้อมูล → force ไปที่ tab "ส่งแล้ว" อัตโนมัติ
  const effectiveFilter = (!orders.length && hasShipments && filter !== "shipped") ? "shipped" : filter;

  return (
    <div>
      <div className="page-head no-print">
        <div>
          <div className="page-title">📋 รายการสั่งของ</div>
          <div className="page-sub">
            {effectiveFilter==="shipped"
              ? `📦 ${(data.shipments||[]).length} รายการส่งออก · ✅ ${(data.shipments||[]).filter(s=>s.receivedAt).length} รับแล้ว`
              : `📦 ${filtered.length} รายการ · 🟡 ${pendingCount} รอดำเนินการ`}
          </div>
        </div>
        <Seg value={effectiveFilter} onChange={setFilter} options={[
          {value:"all",      label:"🗂️ ทั้งหมด"},
          {value:"pending",  label:"🟡 รอ"},
          {value:"completed",label:"✅ สำเร็จ"},
          {value:"shipped",  label:"🚚 ส่งแล้ว"},
        ]}/>
      </div>

      {effectiveFilter === "shipped" ? (
        <ShipmentReceiveList data={data} role={role} productMap={productMap}/>
      ) : filtered.length === 0 ? (
        <div style={{padding:"40px 20px"}}>
          <Empty title="ไม่มีรายการใน filter นี้" sub="ลองเลือก filter อื่น"/>
        </div>
      ) : (
        filtered.map(order => <OrderItemRow key={order.id} order={order} onPatch={patch} productMap={productMap} role={role} skuLocks={skuLocks} storageData={data.storage}/>)
      )}
    </div>
  );
}

// ─── โอนสต็อก คลัง(H) → หน้าร้าน(G) ───
async function syncStockDeduct(sku, qty, name) {
  if (!SHEET_DEPLOY_URL) { console.warn("SHEET_DEPLOY_URL not set"); return { success: false }; }
  try {
    const res = await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ transferStock: true, sku, qty, name, actor: window._currentUser || sessionStorage.getItem("dmj_role") || "พนักงาน" }),
    });
    const json = await res.json().catch(() => ({}));
    return json;
  } catch(e) { console.warn("syncStockDeduct error:", e.message); return { success: false, error: e.message }; }
}

// ส่งหลายรายการในครั้งเดียว → Apps Script สร้าง ZORT Transfer เอกสารเดียว (เลขที่ auto)
// items = [{ sku, qty, name }, ...]
async function syncStockTransferBatch(items) {
  if (!SHEET_DEPLOY_URL) { console.warn("SHEET_DEPLOY_URL not set"); return { success: false }; }
  try {
    const res = await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ transferStockBatch: true, list: items, actor: window._currentUser || sessionStorage.getItem("dmj_role") || "พนักงาน", clientLoadedAt: window._dataLoadedAt || 0 }),
    });
    const json = await res.json().catch(() => ({}));
    return json;
  } catch(e) { console.warn("syncStockTransferBatch error:", e.message); return { success: false, error: e.message }; }
}

// ปรับ WH qty=0 ใน Sheets + ZORT (สินค้าหมด ไม่ได้จัด)
async function syncZeroStock(sku) {
  if (!SHEET_DEPLOY_URL) return { success: false };
  try {
    const res = await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ zeroStock: true, sku, actor: window._currentUser || sessionStorage.getItem("dmj_role") || "warehouse" }),
    });
    const json = await res.json().catch(() => ({}));
    return json;
  } catch(e) { return { success: false, error: e.message }; }
}

// ลบหลาย order rows ในครั้งเดียว
async function syncDeleteOrders(orderIds) {
  if (!SHEET_DEPLOY_URL || !orderIds || !orderIds.length) return;
  try {
    await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ deleteOrders: true, orderIds }),
    });
  } catch(e) { console.warn("syncDeleteOrders error:", e.message); }
}

// สั่ง sync สต็อกจาก ZORT เดี๋ยวนี้ (ใช้เวลาสักครู่)
async function syncZortNow() {
  if (!SHEET_DEPLOY_URL) return { success: false };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ syncZortNow: true }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return await res.json().catch(() => ({}));
  } catch(e) { console.warn("syncZortNow error:", e.message); return { success: false, error: e.message }; }
}

async function syncZortSalesNow() {
  if (!SHEET_DEPLOY_URL) return { success: false };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000); // 3 นาที — sync ยอดขาย 365 วันใช้เวลานาน
    const res = await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ syncZortSalesNow: true }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return await res.json().catch(() => ({}));
  } catch(e) { console.warn("syncZortSalesNow error:", e.message); return { success: false, error: e.message }; }
}

// ─── เบิกวัตถุดิบ MTO — หักคลังหลายรายการ ───
async function syncDeductMaterials(items) {
  if (!SHEET_DEPLOY_URL || !items.length) return { success: false };
  try {
    await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ deductMaterials: true, items }),
    });
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

// ─── Modal เบิกวัตถุดิบ MTO ───────────────────────────────────
function MaterialDrawModal({ open, orderName, products, onConfirm, onSkip, onCancel }) {
  const [search, setSearch] = uS("");
  const [items,  setItems]  = uS([]);
  const [qty,    setQty]    = uS(1);
  const [picked, setPicked] = uS(null); // product object ที่กำลังจะเพิ่ม

  useBackHandler(open ? onCancel : null);

  // reset ทุกครั้งที่เปิด
  uE(() => { if (open) { setSearch(""); setItems([]); setQty(1); setPicked(null); } }, [open]);

  if (!open) return null;

  const filtered = search.trim().length >= 1
    ? (products || []).filter(p =>
        !p.isMTO &&
        (p.sku.toLowerCase().includes(search.toLowerCase()) ||
         p.name.toLowerCase().includes(search.toLowerCase()))
      ).slice(0, 8)
    : [];

  const addItem = (p) => {
    const q = Number(qty) || 1;
    setItems(prev => {
      const existing = prev.find(x => x.sku === p.sku);
      if (existing) return prev.map(x => x.sku === p.sku ? { ...x, qty: x.qty + q } : x);
      return [...prev, { sku: p.sku, name: p.name, qty: q }];
    });
    setSearch(""); setQty(1); setPicked(null);
  };

  const removeItem = (sku) => setItems(prev => prev.filter(x => x.sku !== sku));

  const handleConfirm = () => onConfirm(items);

  return (
    <div onClick={onCancel} style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.65)", zIndex:2100,
      display:"flex", alignItems:"center", justifyContent:"center", padding:16,
      backdropFilter:"blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"#fff", borderRadius:18, width:"100%", maxWidth:400,
        overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,.3)",
        maxHeight:"90vh", display:"flex", flexDirection:"column",
      }}>
        {/* Header */}
        <div style={{ background:"#f3eef9", padding:"18px 20px 14px", borderBottom:"2px solid #d8c8e8" }}>
          <div style={{ fontSize:28, textAlign:"center", marginBottom:4 }}>🌸</div>
          <div style={{ fontWeight:700, fontSize:15, color:"#5b3d82", textAlign:"center" }}>เบิกวัตถุดิบ / ดอกไม้</div>
          <div style={{ fontSize:12, color:"#705d96", textAlign:"center", marginTop:2 }}>{orderName}</div>
        </div>

        <div style={{ padding:"14px 16px", overflowY:"auto", flex:1 }}>
          {/* Search + qty row */}
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <div style={{ flex:1, position:"relative" }}>
              <input
                autoFocus
                placeholder="ค้นหา SKU หรือชื่อสินค้า"
                value={search}
                onChange={e => { setSearch(e.target.value); setPicked(null); }}
                style={{
                  width:"100%", padding:"9px 12px", borderRadius:8, fontSize:13,
                  border:"1.5px solid var(--bdr)", fontFamily:"inherit", boxSizing:"border-box",
                }}
              />
              {/* Dropdown results */}
              {filtered.length > 0 && (
                <div style={{
                  position:"absolute", top:"100%", left:0, right:0, background:"#fff",
                  border:"1.5px solid var(--bdr)", borderRadius:8, zIndex:10,
                  boxShadow:"0 4px 16px rgba(0,0,0,.12)", maxHeight:200, overflowY:"auto",
                }}>
                  {filtered.map(p => (
                    <div key={p.sku} onClick={() => { setPicked(p); setSearch(p.name); }}
                      style={{
                        padding:"8px 12px", cursor:"pointer", fontSize:12,
                        borderBottom:"1px solid var(--bdr)",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background="#f5f5f5"}
                      onMouseLeave={e => e.currentTarget.style.background=""}
                    >
                      <span style={{ fontWeight:600, color:"var(--g-700)" }}>{p.sku}</span>
                      <span style={{ color:"var(--muted)", marginLeft:6 }}>{p.name}</span>
                      <span style={{ float:"right", color:"var(--muted)" }}>คลัง: {p.qtyWH ?? p.qty ?? 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <input
              type="number" min="1" value={qty}
              onChange={e => setQty(e.target.value)}
              style={{ width:60, padding:"9px 8px", borderRadius:8, fontSize:13,
                       border:"1.5px solid var(--bdr)", fontFamily:"inherit", textAlign:"center" }}
            />
            <button
              onClick={() => picked && addItem(picked)}
              disabled={!picked}
              style={{
                padding:"9px 14px", borderRadius:8, border:"none", cursor: picked ? "pointer" : "not-allowed",
                background: picked ? "var(--g-700)" : "#ccc", color:"#fff", fontSize:13, fontWeight:700,
                fontFamily:"inherit",
              }}
            >เพิ่ม</button>
          </div>

          {/* รายการที่เพิ่มแล้ว */}
          {items.length > 0 ? (
            <div style={{ background:"#fafafa", borderRadius:10, padding:"8px 4px", marginTop:4 }}>
              <div style={{ fontSize:11, color:"var(--muted)", padding:"0 8px 6px", fontWeight:600 }}>
                รายการที่จะเบิก ({items.length} รายการ)
              </div>
              {items.map(it => (
                <div key={it.sku} style={{
                  display:"flex", alignItems:"center", gap:8,
                  padding:"6px 10px", borderBottom:"1px solid var(--bdr)",
                }}>
                  <div style={{ flex:1, fontSize:12 }}>
                    <span style={{ fontWeight:600 }}>{it.sku}</span>
                    <span style={{ color:"var(--muted)", marginLeft:6 }}>{it.name}</span>
                  </div>
                  <span style={{ fontWeight:700, color:"var(--g-700)", minWidth:28, textAlign:"right" }}>×{it.qty}</span>
                  <button onClick={() => removeItem(it.sku)} style={{
                    background:"none", border:"none", cursor:"pointer", color:"var(--dang)", fontSize:16, padding:"0 2px"
                  }}>×</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign:"center", color:"var(--muted)", fontSize:12, padding:"16px 0" }}>
              ค้นหาและเพิ่มวัตถุดิบที่ใช้ในงานนี้
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ padding:"12px 16px 16px", display:"flex", gap:8, borderTop:"1px solid var(--bdr)" }}>
          <button onClick={onSkip} style={{
            flex:1, padding:"13px", borderRadius:10, border:"1.5px solid var(--bdr)",
            background:"#fff", fontSize:13, fontFamily:"inherit", cursor:"pointer", color:"var(--muted)",
          }}>
            ข้ามการเบิก
          </button>
          <button onClick={handleConfirm} disabled={items.length === 0} style={{
            flex:2, padding:"13px", borderRadius:10, border:"none",
            background: items.length > 0 ? "#705d96" : "#ccc",
            color:"#fff", fontSize:13, fontWeight:700, fontFamily:"inherit",
            cursor: items.length > 0 ? "pointer" : "not-allowed",
          }}>
            ✅ เบิก {items.length > 0 ? `${items.length} รายการ` : ""}
          </button>
        </div>
      </div>
    </div>
  );
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
  const [shipped, setShipped] = uS(() => {
    const raw = getShippedOrders();
    const SIX_H = 6 * 60 * 60 * 1000;
    const now   = Date.now();
    // Keep only entries marked within 6 hours
    const clean = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => {
        const t = typeof v === "number" ? v : (v && v.t);
        return t && (now - t) < SIX_H;
      })
    );
    if (Object.keys(clean).length !== Object.keys(raw).length) {
      localStorage.setItem(LS_SHIPPED_ORDERS, JSON.stringify(clean));
    }
    return clean;
  });
  const [missed,  setMissed]  = uS(getMissedOrders);
  const [sending, setSending] = uS(null);
  const [bigImg, setBigImg]   = uS(null);
  const [toast, showToast, hideToast] = useToast();
  const [shipConfirm, setShipConfirm]    = uS(null); // single order
  const [shipAllConfirm, setShipAllConfirm] = uS(null); // ready[] array
  const [materialDraw, setMaterialDraw]  = uS(null); // { order, afterConfirm: fn }
  const [resetConfirm, setResetConfirm]  = uS(false); // ยืนยันรีเซ็ตสถานะการส่ง
  const isOnline = useOnlineStatus(); // ตรวจสอบการเชื่อมต่อก่อนส่งสถานะ
  // warehouse map modal state — shared สำหรับ card ทุกใบในหน้านี้
  const [mapModal, setMapModal] = uS(null); // { lockKey, productName, sku } | null

  const productMap = uM(() => {
    const m = {};
    products.forEach(p => {
      if (p.sku) {
        m[p.sku] = p;
        m[p.sku.trim().toUpperCase()] = p;
      }
    });
    return m;
  }, [products]);

  // skuLocks และ lockDataForModal สำหรับ WarehouseMapModal
  const skuLocks = uM(() => {
    const storage = data.storage || {};
    const plm = storage.productLockMap  || {};
    const vlm = storage.verifiedLockMap || {};
    const m = {};
    const add = (lk, sku) => {
      const k = (sku||'').trim().toUpperCase();
      if (!k) return;
      if (!m[k]) m[k] = [];
      if (!m[k].includes(lk)) m[k].push(lk);
    };
    Object.entries(plm).forEach(([lk, skus]) => (skus||[]).forEach(s => add(lk, s)));
    Object.entries(vlm).forEach(([lk, entries]) => (entries||[]).forEach(e => add(lk, e.sku)));
    return m;
  }, [data.storage]);

  const lockDataForModal = uM(() => {
    const storage = data.storage || {};
    const plm = storage.productLockMap  || {};
    const vlm = storage.verifiedLockMap || {};
    const merged = {};
    Object.keys(plm).forEach(k => {
      merged[k] = { skus: plm[k], verified: false, entries: [], mismatch: false };
    });
    Object.keys(vlm).forEach(k => {
      const vSkus = vlm[k].map(v => v.sku);
      const allSkus = merged[k] ? [...new Set([...merged[k].skus, ...vSkus])] : vSkus;
      merged[k] = { skus: allSkus, verified: true, mismatch: false, entries: vlm[k] };
    });
    return merged;
  }, [data.storage]);

  const enriched = uM(() => {
    return orders.map((o, i) => {
      const id = stableOrderId(o, i);
      const skuKey = (o.sku || '').trim().toUpperCase();
      // ใช้ reconcileOrderState เดียวกับ OrderListView → กัน row-reuse เลอะข้าม order
      // (sig ไม่ตรง = state ของ order อื่น → ทิ้ง) + auto-heal state ค้างเดิมที่ไม่มี sig
      const applied = reconcileOrderState(o, st[id]);
      return { ...o, id, ...applied, product: productMap[o.sku] || productMap[skuKey] };
    });
  }, [orders, st, productMap]);

  // แสดงเฉพาะที่กด Done แล้ว
  const isDone = o => o.status === "สำเร็จ" || o.status === "completed" || o.status === "done";
  const doneOrders = uM(() => enriched.filter(isDone), [enriched]);

  // แยกกลุ่ม: หิ้วก่อน, รถหลัง — ซ่อน shipped ที่ไม่ใช่ missed
  const carryOrders = uM(() => doneOrders.filter(o => o.carryMode === "carry").filter(o => !shipped[o.id] || missed[o.id]), [doneOrders, shipped, missed]);
  const truckOrders = uM(() => doneOrders.filter(o => o.carryMode !== "carry").filter(o => !shipped[o.id] || missed[o.id]), [doneOrders, shipped, missed]);

  // ล้าง printed entries ที่ sheet ยังไม่ยืนยัน (กัน stale cache แสดง "✓ Printed" ผิด)
  // เชื่อ sheet เป็น source of truth: ถ้า sheet บอก "print" = ยังไม่ได้ปริ้น ล้างออก
  uE(() => {
    if (!doneOrders.length) return;
    const currentIds = new Set(doneOrders.map(o => o.id));
    const cleaned = Object.fromEntries(
      Object.entries(printed).filter(([id]) => {
        if (!currentIds.has(id)) return false; // ไม่ใช่ batch นี้
        const ord = doneOrders.find(o => o.id === id);
        return ord && ord.printFlag === "printed"; // เก็บแค่ที่ sheet ยืนยันแล้ว
      })
    );
    if (Object.keys(cleaned).length !== Object.keys(printed).length) {
      setPrinted(cleaned);
      localStorage.setItem(LS_PRINTED_ORDERS, JSON.stringify(cleaned));
    }
  }, [doneOrders]);

  const handlePrint = (order) => {
    const qty = order.preparedQty || order.orderQty || 1;
    onPrintRequest([{ sku: order.sku, qty }]);
    const p2 = { ...printed, [order.id]: true };
    setPrinted(p2);
    localStorage.setItem(LS_PRINTED_ORDERS, JSON.stringify(p2));
    setSt(patchOrderState(order.id, { printFlag: "printed" }, orderSig(order)));
    syncOrderUpdate(order, { printFlag: "printed" });
  };

  const handlePrintAll = (ordersArr) => {
    const items = ordersArr.map(o => ({ sku: o.sku, qty: o.preparedQty || o.orderQty || 1 }));
    onPrintRequest(items);
    const p2 = { ...printed };
    ordersArr.forEach(o => { p2[o.id] = true; });
    setPrinted(p2);
    localStorage.setItem(LS_PRINTED_ORDERS, JSON.stringify(p2));
    ordersArr.forEach(o => {
      setSt(patchOrderState(o.id, { printFlag: "printed" }, orderSig(o)));
      syncOrderUpdate(o, { printFlag: "printed" });
    });
  };

  const handleShip = (order) => setShipConfirm(order);

  // ทำการส่งสินค้าจริง (หลังผ่าน confirm และ material draw แล้ว)
  const finalizeShip = async (order, matItems) => {
    const qty = order.preparedQty || order.orderQty || 0;
    setSending(order.id);

    // ถ้าไม่ใช่ MTO → โอนสต็อกคลัง→หน้าร้าน / ถ้าเป็น MTO → เบิกวัตถุดิบ (ถ้ามี)
    // เก็บผลโอนไว้ตัดสินว่า "ส่งสำเร็จจริง" ไหม — กันบั๊กข้อมูลหาย (เดิมลบ order ทิ้งแม้คลังไม่พอ)
    let transferOk = true, transferred = qty, errMsg = "";
    if (!order.product?.isMTO) {
      const res = await syncStockDeduct(order.sku, qty, order.carryMode === "carry" ? order.name + " order" : order.name);
      const ok = res && res.success === true;
      transferred = (res && res.data && res.data.transferred != null) ? Number(res.data.transferred) : (ok ? qty : 0);
      transferOk = ok && transferred > 0;       // โอนได้จริง > 0 ชิ้น = สำเร็จ
      errMsg = (res && res.error) || "";
    } else if (matItems && matItems.length > 0) {
      await syncDeductMaterials(matItems);
    }

    setSending(null);

    // คลังไม่พอ/ไม่พบสินค้า → ไม่ลบ order, ไม่มาร์คส่งแล้ว, คงไว้ให้ส่งใหม่ภายหลัง
    if (!transferOk) {
      showToast("warn", `ส่งไม่สำเร็จ — คลังไม่พอ/ไม่พบสินค้า${errMsg ? ` (${errMsg})` : ""} · คงรายการไว้`, "⚠️", 7000);
      return;
    }

    try {
      await fetch(SHEET_DEPLOY_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ deleteOrder: true, orderId: order.id }),
      });
    } catch(e) { console.warn("deleteOrder failed:", e.message); }

    const next = { ...shipped, [order.id]: Date.now() };
    setShipped(next);
    localStorage.setItem(LS_SHIPPED_ORDERS, JSON.stringify(next));
    setSt(patchOrderState(order.id, { status: "ส่งแล้ว" }, orderSig(order)));
    const shortMsg = transferred < qty ? ` (คลังพอแค่ ${transferred}/${qty})` : "";
    showToast(transferred < qty ? "warn" : "success", `ส่ง ${transferred} ชิ้นแล้ว${shortMsg}`, "📦");
  };

  const doShip = async () => {
    const order = shipConfirm;
    setShipConfirm(null);
    if (!order) return;

    if (order.product?.isMTO) {
      // MTO → เปิด modal เบิกวัตถุดิบ
      setMaterialDraw({
        order,
        afterConfirm: (matItems) => { setMaterialDraw(null); finalizeShip(order, matItems); },
        afterSkip:    ()          => { setMaterialDraw(null); finalizeShip(order, []); },
      });
    } else {
      await finalizeShip(order, []);
    }
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

    // โอนสต็อกที่ไม่ใช่ MTO เป็น "ก้อนเดียว" → ZORT สร้าง transfer เอกสารเดียว เลขที่ auto
    const transferItems = ready
      .filter(o => !o.product?.isMTO)
      .map(o => ({ orderId: o.id, sku: o.sku, qty: o.preparedQty || o.orderQty || 0, name: o.name }))
      .filter(it => it.sku && it.qty > 0);

    let batchRes = { success: true };
    if (transferItems.length) {
      batchRes = await syncStockTransferBatch(transferItems);
    }
    const batchOk = batchRes && batchRes.success === true;

    // ถ้า batch ทั้งก้อนล้ม (network/timeout/GAS error) → ไม่ลบ ไม่มาร์คอะไรเลย คงรายการไว้ทั้งหมด ให้ลองใหม่
    if (!batchOk) {
      setSending(null);
      if (batchRes && batchRes.conflict) {
        // conflict = ข้อมูลฝั่ง server ใหม่กว่าที่เครื่องนี้โหลด → ดึงข้อมูลล่าสุดให้ แล้วให้ลองอีกครั้ง
        showToast("warn", "ข้อมูลมีการอัปเดต — กำลังโหลดใหม่ แล้วลองส่งอีกครั้ง", "🔄", 6000);
        if (typeof window._dmjRefetch === "function") window._dmjRefetch();
      } else {
        showToast("warn", `ส่งไม่สำเร็จ — ระบบมีปัญหา ${batchRes.error || batchRes.message || ""} · คงรายการไว้ ลองใหม่อีกครั้ง`, "⚠️", 7000);
      }
      return;
    }

    // map ผลลัพธ์รายตัวจาก GAS (results[]) → ตัดสินรายตัวว่า "ส่งสำเร็จ" ไหม
    // FAIL OPEN: ถ้าไม่มีผลรายตัว (response ใหญ่/parse ไม่ครบ) → ถือว่าส่งแล้ว (เหมือนพฤติกรรมเดิม)
    //   เก็บไว้เฉพาะตัวที่ GAS บอกชัดว่า "ไม่พบ SKU" หรือ "โอนได้ 0 ชิ้น" เท่านั้น (กันข้อมูลหายเฉพาะเคสนั้น)
    const results = (batchRes && batchRes.data && batchRes.data.results) || [];
    const resultById = {};
    results.forEach(r => { if (r && r.orderId) resultById[String(r.orderId)] = r; });
    const orderSucceeded = (o) => {
      if (o.product?.isMTO) return true;             // MTO ไม่โอนสต็อกคลัง
      const r = resultById[o.id];
      // FAIL CLOSED: ลบ/มาร์ค "ส่งแล้ว" เฉพาะตัวที่ GAS ยืนยันโอนจริง (transferred>0) เท่านั้น
      // ที่เหลือทั้งหมด — ไม่มีผลรายตัว / duplicate (cache ค้าง) / notFound / โอนได้ 0 ชิ้น —
      //   ถือว่า "ยังไม่ได้ส่ง" → คงไว้ในรายการ ไม่ลบ กันบั๊กข้อมูลหายแบบไม่ได้โอนเข้า ZORT จริง
      if (!r) return false;
      return Number(r.transferred) > 0;
    };
    const succeeded = ready.filter(orderSucceeded);
    const kept      = ready.filter(o => !orderSucceeded(o)); // คลังไม่พอ/ไม่พบสินค้า → คงไว้ในรายการ

    // ส่งบางส่วน: โอนได้ >0 แต่ไม่ครบจำนวนที่สั่ง (คลังมีไม่พอ) → order ถูกลบ แต่ต้องเตือนว่าของไปไม่ครบ
    const partials = succeeded.filter(o => {
      const r = resultById[o.id];
      return r && Number(r.transferred) > 0 && r.requested != null && Number(r.transferred) < Number(r.requested);
    }).map(o => {
      const r = resultById[o.id];
      return { name: o.name || o.sku, transferred: Number(r.transferred), requested: Number(r.requested) };
    });

    // อัปเดตสถานะ "ส่งแล้ว" เฉพาะ order ที่โอนสำเร็จ (เบา ไม่ยิง ZORT ซ้ำ)
    for (const order of succeeded) {
      nextShipped[order.id] = Date.now();
      // แนบ sig + markedAt เหมือน patchOrderState เพื่อกัน row-reuse เลอะข้าม order
      nextSt[order.id] = { ...(nextSt[order.id]||{}), status: "ส่งแล้ว", sig: orderSig(order), markedAt: new Date().toISOString() };
    }
    setSending(null);
    setShipped(nextShipped);
    localStorage.setItem(LS_SHIPPED_ORDERS, JSON.stringify(nextShipped));
    localStorage.setItem(LS_ORDERS_STATE, JSON.stringify(nextSt));
    setSt(nextSt);

    // ลบเฉพาะ order ที่ส่งสำเร็จออกจาก Sheet — order ที่คลังไม่พอจะคงไว้ให้ส่งใหม่ภายหลัง
    if (succeeded.length) syncDeleteOrders(succeeded.map(o => o.id));

    const zErr = batchRes && batchRes.data && batchRes.data.zortError;
    const partialMsg = partials.length
      ? ` · ⚠️ คลังไม่พอ ${partials.length} รายการ ส่งได้บางส่วน (${partials.slice(0,4).map(p => `${p.name} ${p.transferred}/${p.requested}`).join(", ")}${partials.length > 4 ? ` …(+${partials.length - 4})` : ""})`
      : "";
    if (kept.length) {
      const names = kept.slice(0, 8).map(o => o.name || o.sku).join(", ");
      const more = kept.length > 8 ? ` …(+${kept.length - 8})` : "";
      showToast("warn", `ส่งสำเร็จ ${succeeded.length} · ยังไม่ได้ส่ง ${kept.length} รายการ (กดส่งอีกครั้ง): ${names}${more}${partialMsg}`, "⚠️", 8000);
    } else if (zErr) {
      showToast("warn", `ส่ง ${succeeded.length} รายการ — แต่ ZORT มีปัญหา ${zErr}`, "⚠️", 7000);
    } else if (partials.length) {
      showToast("warn", `ส่ง ${succeeded.length} รายการ${partialMsg}`, "⚠️", 8000);
    } else {
      const zNum = batchRes && batchRes.data && batchRes.data.zortNumber;
      showToast("success", `ส่ง ${succeeded.length} รายการแล้ว${zNum ? ` (ZORT ${zNum})` : ""}`, "📦");
    }
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
    const printableOrders = orders.filter(o => {
      const ap = printed[o.id] || o.printFlag === "printed";
      return o.printFlag === "print" && !ap && !shipped[o.id];
    });
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
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {printableOrders.length > 0 && (
              <button onClick={() => handlePrintAll(printableOrders)} style={{
                padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",
                background:"#374151",color:"#fff",
                fontSize:12,fontWeight:700,fontFamily:"inherit",
              }}>
                🖨️ ปริ้น Label ({printableOrders.length})
              </button>
            )}
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
            const alreadyPrinted = printed[order.id] || order.printFlag === "printed";
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
                  {(order.image || order.product?.imageUrl) ? (
                    <img src={order.image || order.product?.imageUrl} alt=""
                      onClick={() => setBigImg(order)}
                      onError={e=>{e.target.style.display="none"}}
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
                  <div style={{fontSize:13,fontWeight:600,lineHeight:1.3}}>
                    {order.name}{order.carryMode === "carry" ? <span style={{fontSize:10,fontWeight:700,color:"#1565c0",marginLeft:5,background:"#e3f2fd",borderRadius:4,padding:"1px 5px"}}>order</span> : null}
                  </div>
                  {/* chip ตำแหน่งคลัง — กดเปิดแผนที่คลัง */}
                  {(() => {
                    const sk = (order.sku||'').trim().toUpperCase();
                    const lks = skuLocks[sk] || skuLocks[order.sku] || [];
                    if (!lks.length) return null;
                    return (
                      <button onClick={() => setMapModal({ lockKey: lks[0], productName: order.name, sku: order.sku })}
                        style={{
                          marginTop:4,display:"inline-flex",alignItems:"center",gap:3,
                          background:"#f0fdf4",borderRadius:6,padding:"2px 8px",fontSize:10,
                          color:"#166534",fontWeight:700,border:"1.5px solid #86efac",
                          cursor:"pointer",fontFamily:"inherit",
                        }}>
                        📍 {lks.join(", ")}
                      </button>
                    );
                  })()}
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
                    {!isOnline && (
                      <div style={{fontSize:10,color:"#b45309",textAlign:"center",
                                   fontWeight:600,marginBottom:2}}>⚠️ ไม่มีอินเทอร์เน็ต</div>
                    )}
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={() => handleShip(order)} disabled={isSending || isMissed || !isOnline}
                        style={{
                          flex:1,padding:"10px 4px",minHeight:44,borderRadius:7,border:"none",
                          background: (isMissed||!isOnline)?"var(--g-100)":"var(--g-700)",
                          color: (isMissed||!isOnline)?"var(--muted)":"#fff",
                          fontSize:11,fontWeight:700,
                          cursor:(isMissed||!isOnline)?"not-allowed":"pointer",
                          fontFamily:"inherit",opacity:isSending?0.6:1,
                        }}>
                        {isSending ? "⏳..." : "✅ ส่งแล้ว"}
                      </button>
                      {isTruck && (
                        <button onClick={() => toggleMissed(order)}
                          title={isMissed?"ยกเลิก - ใส่คืนในรถ":"รถเต็ม - ไม่ได้ขึ้น"}
                          style={{
                            width:44,minHeight:44,borderRadius:7,
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
        <button onClick={() => setResetConfirm(true)} style={{
          padding:"6px 12px",borderRadius:8,border:"1.5px solid var(--bdr)",
          background:"#fff",color:"var(--muted)",fontSize:11,fontWeight:600,
          cursor:"pointer",fontFamily:"inherit",
        }}>🔄 รีเซ็ตสถานะ</button>
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
            {(bigImg.image || bigImg.product?.imageUrl) && (
              <img src={bigImg.image || bigImg.product?.imageUrl} alt=""
                onError={e=>{e.target.style.display="none"}}
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
        open={resetConfirm}
        type="warn"
        emoji="🔄"
        title="รีเซ็ตสถานะการส่ง?"
        detail="สถานะ 'ส่งแล้ว' และ 'ไม่ขึ้นรถ' ทั้งหมดจะถูกล้าง"
        confirmLabel="รีเซ็ต"
        onConfirm={() => {
          localStorage.removeItem(LS_SHIPPED_ORDERS);
          localStorage.removeItem(LS_MISSED_TRUCK);
          const cleared = {};
          setShipped(cleared);
          setMissed(cleared);
          setResetConfirm(false);
          showToast("success", "รีเซ็ตสถานะการส่งแล้ว", "🔄");
        }}
        onCancel={() => setResetConfirm(false)}
      />
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
      <MaterialDrawModal
        open={!!materialDraw}
        orderName={materialDraw?.order ? `${materialDraw.order.name} (${materialDraw.order.sku})` : ""}
        products={products}
        onConfirm={materialDraw?.afterConfirm || (() => {})}
        onSkip={materialDraw?.afterSkip || (() => {})}
        onCancel={() => setMaterialDraw(null)}
      />
      {/* Warehouse map modal — เปิดเมื่อกด chip ตำแหน่งคลัง */}
      {mapModal && (
        <WarehouseMapModal
          open={!!mapModal}
          onClose={() => setMapModal(null)}
          highlightKey={mapModal.lockKey}
          lockData={lockDataForModal}
          shelves={(data.storage || {}).shelves || { A: 10, B: 10, locksPerShelf: 15 }}
          productName={mapModal.productName}
          sku={mapModal.sku}
        />
      )}
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

  const LABELS_PER_PAGE = 70; // 5 cols × 14 rows
  const pages = uM(() => {
    const ps = [];
    for (let i = 0; i < labelList.length; i += LABELS_PER_PAGE) ps.push(labelList.slice(i, i + LABELS_PER_PAGE));
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

    let prevSkuSep = null;
    const labelsHTML = labelList.map(p => {
      const cutSep = prevSkuSep !== null && p.sku !== prevSkuSep
        ? `<div class="cut-sep">✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─</div>`
        : "";
      prevSkuSep = p.sku;
      const qrImg = qrMap[p.sku]
        ? `<img src="${qrMap[p.sku]}" style="width:100%;height:100%;display:block;"/>`
        : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:5px;color:#aaa;">QR</div>`;
      const priceStr = p.price != null && p.price > 0 ? `${escHtml(String(p.price))} ฿` : "";
      return cutSep + `
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
  /* SKU-group separator (screen only in popup) */
  .cut-sep {
    text-align:center; font-size:12px; color:#aaa;
    letter-spacing:3px; padding:5px 0;
    border-top:1px dashed #ddd; border-bottom:1px dashed #ddd;
    width:300px; margin:2px auto;
  }
  /* Print: 50×25mm */
  @media print {
    @page { size: 50mm 25mm; margin: 0; }
    body { background:#fff; padding:0; }
    .print-btn { display:none; }
    .cut-sep { display:none; }
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
          <ScanButton size={40}
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
              {page.map((p, i) => {
                const globalIdx = pi * LABELS_PER_PAGE + i;
                const isSkuBreak = globalIdx > 0 && p.sku !== labelList[globalIdx - 1].sku;
                return (
                <div key={i} className={`label-cell${isSkuBreak ? " sku-break" : ""}`}>
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
                );
              })}
            </div>
          </div>
        ))
      ) : (
        /* Sticker preview — actual 50×25mm proportions (2:1), scaled up 3× for readability */
        <div className="no-print" style={{display:"flex",flexDirection:"column",gap:9,padding:"4px 0"}}>
          {labelList.map((p, i) => {
            const isStickerBreak = i > 0 && p.sku !== labelList[i - 1].sku;
            return (
            <React.Fragment key={i}>
              {isStickerBreak && (
                <div style={{textAlign:"center",color:"#bbb",fontSize:11,letterSpacing:4,padding:"5px 0",borderTop:"1px dashed #ddd",borderBottom:"1px dashed #ddd",width:300,alignSelf:"center"}}>
                  ✂ ─ ─ ─
                </div>
              )}
            <div style={{
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
            </React.Fragment>
            );
          })}
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

// ─────────────────────────────────────────────────────────────────────
// MTO JOB VIEW — งานจัดพิเศษ (MTO)
// ─────────────────────────────────────────────────────────────────────
function MtoJobView({ data }) {
  const [jobs, setJobs] = uS(() => data.mtoJobs || []);
  uE(() => { setJobs(data.mtoJobs || []); }, [data.mtoJobs]);
  const [view, setView] = uS("list"); // "list" | "create" | "detail"
  const [activeJob, setActiveJob] = uS(null);
  const [newJob, setNewJob] = uS({ jobName: "", customer: "", price: "", imageUrl: "" });
  const [materials, setMaterials] = uS([]);
  const [search, setSearch] = uS("");
  const [searchQty, setSearchQty] = uS(1);
  const [searchWarehouse, setSearchWarehouse] = uS("warehouse");
  const [saving, setSaving] = uS(false);
  const [deleteConfirm, setDeleteConfirm] = uS(null); // job ที่รอยืนยันลบ
  const [toast, showToast, hideToast] = useToast();
  const isOnline = useOnlineStatus(); // ตรวจสอบการเชื่อมต่อก่อนบันทึก
  // Android back: detail/create → list
  useBackHandler(view !== "list" ? () => setView("list") : null);

  const products = data.products || [];

  const searchResults = uM(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return products.filter(p =>
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.name && p.name.toLowerCase().includes(q))
    ).slice(0, 5);
  }, [search, products]);

  const todayStr = () => {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  };

  const nowStr = () => {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleCreateJob = async () => {
    if (!newJob.jobName.trim()) { showToast("error", "กรุณาระบุชื่องาน"); return; }
    setSaving(true);
    try {
      const res = await fetch(SHEET_DEPLOY_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          createMtoJob: true,
          jobName: newJob.jobName.trim(),
          customer: newJob.customer.trim(),
          price: newJob.price ? Number(newJob.price) : "",
          imageUrl: newJob.imageUrl.trim(),
          dateStr: todayStr(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        const created = {
          jobId: json.jobId,
          date: todayStr(),
          jobName: newJob.jobName.trim(),
          customer: newJob.customer.trim(),
          price: newJob.price ? Number(newJob.price) : 0,
          imageUrl: newJob.imageUrl.trim(),
          status: "กำลังจัด",
          closedAt: "",
          items: [],
        };
        setJobs(prev => [created, ...prev]);
        setNewJob({ jobName: "", customer: "", price: "", imageUrl: "" });
        setView("list");
        showToast("success", "สร้างงานเรียบร้อย");
      } else {
        showToast("error", json.error || "เกิดข้อผิดพลาด");
      }
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const addMaterial = (product) => {
    if (!product) return;
    setMaterials(prev => {
      const existing = prev.findIndex(m => m.sku === product.sku);
      if (existing >= 0) {
        const updated = [...prev];
        const m = updated[existing];
        const addWH = searchWarehouse === "warehouse" ? searchQty : 0;
        const addFS = searchWarehouse === "frontstore" ? searchQty : 0;
        updated[existing] = { ...m, qty: m.qty + searchQty, qtyWH: (Number(m.qtyWH) || 0) + addWH, qtyFS: (Number(m.qtyFS) || 0) + addFS };
        return updated;
      }
      return [...prev, {
        sku: product.sku, name: product.name, qty: searchQty, returnedQty: 0,
        qtyWH: searchWarehouse === "warehouse" ? searchQty : 0,
        qtyFS: searchWarehouse === "frontstore" ? searchQty : 0,
      }];
    });
    setSearch("");
    setSearchQty(1);
  };

  const removeMaterial = (idx) => {
    setMaterials(prev => prev.filter((_, i) => i !== idx));
  };

  const setMaterialQty = (idx, val) => {
    setMaterials(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      const qty = Math.max(1, Number(val) || 1);
      return { ...m, qty, returnedQty: Math.min(Number(m.returnedQty) || 0, qty) };
    }));
  };

  const setReturnedQty = (idx, val) => {
    setMaterials(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      const r = Math.max(0, Math.min(Number(val) || 0, Number(m.qty) || 0));
      return { ...m, returnedQty: r };
    }));
  };

  const setQtyWH = (idx, val) => {
    setMaterials(prev => prev.map((m, i) => i !== idx ? m : { ...m, qtyWH: Math.max(0, Number(val) || 0) }));
  };

  const setQtyFS = (idx, val) => {
    setMaterials(prev => prev.map((m, i) => i !== idx ? m : { ...m, qtyFS: Math.max(0, Number(val) || 0) }));
  };

  // บันทึกวัตถุดิบเป็น draft โดยไม่ปิดงาน — ออกจากงานแล้วกลับมาไม่หาย
  const handleSaveDraft = async () => {
    if (!activeJob) return;
    setSaving(true);
    try {
      const res = await fetch(SHEET_DEPLOY_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          saveMtoJobItems: true,
          jobId: activeJob.jobId,
          items: materials,
        }),
      });
      const json = await res.json();
      if (json.success) {
        // อัปเดต local job ให้เก็บ draft items ไว้ (เปิดงานใหม่ไม่หาย)
        const updatedJob = { ...activeJob, items: materials };
        setJobs(prev => prev.map(j => j.jobId === activeJob.jobId ? updatedJob : j));
        setActiveJob(updatedJob);
        showToast("success", "บันทึกวัตถุดิบเรียบร้อย");
      } else {
        showToast("error", json.error || "เกิดข้อผิดพลาด");
      }
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCloseJob = async () => {
    if (!activeJob) return;
    if (materials.length === 0) { showToast("warn", "ยังไม่มีวัตถุดิบ"); return; }
    setSaving(true);
    try {
      const closed = nowStr();
      const res = await fetch(SHEET_DEPLOY_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          closeMtoJob: true,
          jobId: activeJob.jobId,
          jobName: activeJob.name || activeJob.jobId,
          items: materials,
          closedAt: closed,
          clientLoadedAt: window._dataLoadedAt || 0, // สำหรับ conflict detection
          actor: window._currentUser || sessionStorage.getItem("dmj_role") || "พนักงาน",
        }),
      });
      const json = await res.json();
      if (json.conflict) {
        showToast("error", "ข้อมูลถูกแก้ไขโดยคนอื่น กด 🔄 Reload เพื่อดูข้อมูลล่าสุด");
        // ไม่ reset input — ผู้ใช้ยังคงเห็นรายการวัตถุดิบที่กรอกไว้
      } else if (json.success) {
        const updatedJob = { ...activeJob, status: "เสร็จแล้ว", closedAt: closed, items: materials };
        setJobs(prev => prev.map(j => j.jobId === activeJob.jobId ? updatedJob : j));
        setActiveJob(updatedJob);
        setMaterials([]);
        setView("detail");
        showToast("success", "ปิดงานและสร้างรายการขาย ZORT เรียบร้อย");
      } else {
        showToast("error", json.error || "เกิดข้อผิดพลาด");
      }
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteJob = async (job) => {
    setSaving(true);
    try {
      const res = await fetch(SHEET_DEPLOY_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ deleteMtoJob: true, jobId: job.jobId, actor: window._currentUser || sessionStorage.getItem("dmj_role") || "พนักงาน" }),
      });
      const json = await res.json();
      if (json.success) {
        setJobs(prev => prev.filter(j => j.jobId !== job.jobId));
        if (activeJob && activeJob.jobId === job.jobId) { setActiveJob(null); setView("list"); }
        showToast("success", "ลบงานเรียบร้อย");
      } else {
        showToast("error", json.error || "เกิดข้อผิดพลาด");
      }
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (job) => {
    setActiveJob(job);
    const items = (job.items || []).map(m => {
      const qty = Number(m.qty) || 0;
      const ret = Math.max(0, Math.min(Number(m.returnedQty) || 0, qty));
      const net = Math.max(0, qty - ret);
      return {
        ...m,
        qtyWH: m.qtyWH != null ? Number(m.qtyWH) : (m.warehouse !== "frontstore" ? net : 0),
        qtyFS: m.qtyFS != null ? Number(m.qtyFS) : (m.warehouse === "frontstore" ? net : 0),
      };
    });
    setMaterials(items);
    setView("detail");
  };

  // ── List View ──
  if (view === "list") return (
    <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto" }}>
      <Toast toast={toast} onClose={hideToast} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--g-800)" }}>🎁 งานจัดพิเศษ (MTO)</div>
        <button className="btn primary" onClick={() => setView("create")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          ➕ สร้างงานใหม่
        </button>
      </div>

      {jobs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎁</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>ยังไม่มีงานจัดพิเศษ</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>กดปุ่ม "สร้างงานใหม่" เพื่อเริ่มต้น</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {jobs.map(job => (
            <div key={job.jobId}
              onClick={() => openDetail(job)}
              style={{
                background: "#fff", border: "1.5px solid var(--bdr)", borderRadius: 12,
                padding: "14px 16px", cursor: "pointer", transition: "box-shadow .15s",
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.10)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--g-800)" }}>{job.jobName}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {job.date}{job.customer ? ` · ${job.customer}` : ""}
                  </div>
                  {job.price > 0 && (
                    <div style={{ fontSize: 12, color: "var(--g-700)", marginTop: 2, fontWeight: 600 }}>
                      ฿{Number(job.price).toLocaleString()}
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                  background: job.status === "เสร็จแล้ว" ? "#e8f5e9" : "#fff8e1",
                  color: job.status === "เสร็จแล้ว" ? "#1b5e20" : "#a07417",
                  border: `1px solid ${job.status === "เสร็จแล้ว" ? "#81c784" : "#f59e0b"}`,
                  whiteSpace: "nowrap",
                }}>
                  {job.status === "เสร็จแล้ว" ? "✅ เสร็จแล้ว" : "🟡 กำลังจัด"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Create View ──
  if (view === "create") return (
    <div style={{ padding: "16px", maxWidth: 500, margin: "0 auto" }}>
      <Toast toast={toast} onClose={hideToast} />
      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--g-800)", marginBottom: 20 }}>➕ สร้างงานใหม่</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>ชื่องาน *</div>
          <input
            value={newJob.jobName}
            onChange={e => setNewJob(p => ({ ...p, jobName: e.target.value }))}
            placeholder="เช่น ชุดของขวัญวันเกิดลูกค้า A"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
          />
        </label>
        <label>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>ลูกค้า (ไม่จำเป็น)</div>
          <input
            value={newJob.customer}
            onChange={e => setNewJob(p => ({ ...p, customer: e.target.value }))}
            placeholder="ชื่อลูกค้า"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
          />
        </label>
        <label>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>ราคา (ไม่จำเป็น)</div>
          <input
            type="number" value={newJob.price}
            onChange={e => setNewJob(p => ({ ...p, price: e.target.value }))}
            placeholder="0"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
          />
        </label>
        <label>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>URL รูป (ไม่จำเป็น)</div>
          <input
            value={newJob.imageUrl}
            onChange={e => setNewJob(p => ({ ...p, imageUrl: e.target.value }))}
            placeholder="https://..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
          />
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button className="btn ghost" onClick={() => setView("list")} style={{ flex: 1, padding: "12px" }}>ยกเลิก</button>
          <button className="btn primary" onClick={handleCreateJob} disabled={saving} style={{ flex: 2, padding: "12px" }}>
            {saving ? "กำลังสร้าง..." : "สร้างงาน"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Detail View ──
  if (view === "detail" && activeJob) {
    const isOpen = activeJob.status === "กำลังจัด";
    return (
      <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto" }}>
        <Toast toast={toast} onClose={hideToast} />
        <ConfirmModal
          open={!!deleteConfirm}
          type="danger"
          title={`ลบงาน "${deleteConfirm?.jobName}"?`}
          detail="การลบไม่สามารถย้อนกลับได้"
          confirmLabel="ลบ"
          onConfirm={() => { const j = deleteConfirm; setDeleteConfirm(null); handleDeleteJob(j); }}
          onCancel={() => setDeleteConfirm(null)}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="btn ghost" onClick={() => { setView("list"); setActiveJob(null); setMaterials([]); }}>← กลับ</button>
          <button className="btn ghost" style={{ marginLeft: "auto", color: "var(--dang)", borderColor: "var(--dang)" }}
            onClick={() => setDeleteConfirm(activeJob)} disabled={saving}>
            🗑️ ลบงาน
          </button>
        </div>

        {/* Job header */}
        <div style={{ background: "#fff", border: "1.5px solid var(--bdr)", borderRadius: 12, padding: "16px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--g-800)" }}>{activeJob.jobName}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                {activeJob.date}{activeJob.customer ? ` · ลูกค้า: ${activeJob.customer}` : ""}
              </div>
              {activeJob.price > 0 && (
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--g-700)", marginTop: 4 }}>
                  ฿{Number(activeJob.price).toLocaleString()}
                </div>
              )}
              {activeJob.closedAt && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>ปิดงาน: {activeJob.closedAt}</div>
              )}
            </div>
            <div style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
              background: isOpen ? "#fff8e1" : "#e8f5e9",
              color: isOpen ? "#a07417" : "#1b5e20",
              border: `1px solid ${isOpen ? "#f59e0b" : "#81c784"}`,
            }}>
              {isOpen ? "🟡 กำลังจัด" : "✅ เสร็จแล้ว"}
            </div>
          </div>
          {activeJob.imageUrl && (
            <img src={activeJob.imageUrl} alt="job" style={{ width: "100%", borderRadius: 8, marginTop: 12, maxHeight: 200, objectFit: "cover" }} />
          )}
        </div>

        {/* Add materials (open jobs only) */}
        {isOpen && (
          <div style={{ background: "#fff", border: "1.5px solid var(--bdr)", borderRadius: 12, padding: "16px", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--g-800)", marginBottom: 12 }}>เพิ่มวัตถุดิบที่ใช้</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="ค้นหาสินค้า (SKU หรือชื่อ)"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
                  />
                  {searchResults.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid var(--bdr)", borderRadius: 8, zIndex: 100, boxShadow: "0 4px 16px rgba(0,0,0,.12)" }}>
                      {searchResults.map(p => (
                        <div key={p.sku} onClick={() => addMaterial(p)}
                          style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid var(--bdr)", fontSize: 13 }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--g-50)"}
                          onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                        >
                          <span style={{ fontWeight: 600 }}>{p.sku}</span>
                          <span style={{ color: "var(--muted)", marginLeft: 8 }}>{p.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <ScanButton size={42} onScan={sku => {
                  const code = String(sku || "").trim().toUpperCase();
                  const found = products.find(p => (p.sku || "").trim().toUpperCase() === code);
                  if (found) { addMaterial(found); showToast("success", `เพิ่ม ${found.sku}`); }
                  else { setSearch(code); showToast("warn", `ไม่พบ SKU: ${code}`); }
                }}/>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number" value={searchQty} min={1}
                  onChange={e => setSearchQty(Math.max(1, Number(e.target.value)))}
                  style={{ width: 80, padding: "10px 12px", borderRadius: 8, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
                />
                <select value={searchWarehouse} onChange={e => setSearchWarehouse(e.target.value)}
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 14 }}>
                  <option value="warehouse">คลังสาย5</option>
                  <option value="frontstore">หน้าร้าน</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Materials list */}
        <div style={{ background: "#fff", border: "1.5px solid var(--bdr)", borderRadius: 12, padding: "16px", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--g-800)", marginBottom: 12 }}>
            วัตถุดิบ {materials.length > 0 ? `(${materials.length} รายการ)` : ""}
          </div>
          {materials.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>ยังไม่มีวัตถุดิบ</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {materials.map((m, idx) => {
                const ret = Number(m.returnedQty) || 0;
                const net = Math.max(0, (Number(m.qty) || 0) - ret);
                const qtyWH = Number(m.qtyWH) || 0;
                const qtyFS = Number(m.qtyFS) || 0;
                const splitTotal = qtyWH + qtyFS;
                const mismatch = isOpen && net > 0 && splitTotal !== net;
                const prod = products.find(p => (p.sku||"").trim().toUpperCase() === (m.sku||"").trim().toUpperCase());
                const imgSrc = prod && prod.imageUrl ? prod.imageUrl : "";
                return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--g-50)", borderRadius: 8, flexWrap: "wrap" }}>
                  {imgSrc ? (
                    <img src={imgSrc} alt={m.sku} loading="lazy"
                      style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: "1px solid var(--bdr)", background: "#fff" }}
                      onError={e => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, border: "1px solid var(--bdr)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "var(--muted)" }}>📦</div>
                  )}
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.sku}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                  </div>
                  {isOpen ? (
                    <>
                      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 10, color: "var(--muted)" }}>
                        เบิก
                        <input type="number" min={1} value={m.qty} onChange={e => setMaterialQty(idx, e.target.value)}
                          style={{ width: 52, padding: "5px 6px", borderRadius: 6, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 13, textAlign: "center" }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 10, color: "#c0392b" }}>
                        คืน
                        <input type="number" min={0} max={m.qty} value={ret} onChange={e => setReturnedQty(idx, e.target.value)}
                          style={{ width: 52, padding: "5px 6px", borderRadius: 6, border: "1.5px solid #f0b8b0", fontFamily: "inherit", fontSize: 13, textAlign: "center", color: "#c0392b" }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 10, color: "var(--g-700)" }}>
                        คลัง
                        <input type="number" min={0} value={qtyWH} onChange={e => setQtyWH(idx, e.target.value)}
                          style={{ width: 52, padding: "5px 6px", borderRadius: 6, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 13, textAlign: "center" }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 10, color: "#1565c0" }}>
                        ร้าน
                        <input type="number" min={0} value={qtyFS} onChange={e => setQtyFS(idx, e.target.value)}
                          style={{ width: 52, padding: "5px 6px", borderRadius: 6, border: "1.5px solid #90caf9", fontFamily: "inherit", fontSize: 13, textAlign: "center", color: "#1565c0" }} />
                      </label>
                      <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", minWidth: 42, textAlign: "center", color: mismatch ? "var(--dang)" : "var(--g-700)" }}>
                        {mismatch ? `⚠ ${splitTotal}≠${net}` : `ตัด ${splitTotal}`}
                      </div>
                      <button onClick={() => removeMaterial(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dang)", fontSize: 16, padding: "0 4px" }}>✕</button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: "var(--g-700)", fontWeight: 700, whiteSpace: "nowrap" }}>
                        เบิก {m.qty}{ret > 0 ? ` · คืน ${ret}` : ""}
                      </div>
                      {qtyWH > 0 && (
                        <div style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#e8f5e9", color: "#1b5e20", fontWeight: 700, whiteSpace: "nowrap" }}>
                          คลัง {qtyWH}
                        </div>
                      )}
                      {qtyFS > 0 && (
                        <div style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#e3f2fd", color: "#1565c0", fontWeight: 700, whiteSpace: "nowrap" }}>
                          ร้าน {qtyFS}
                        </div>
                      )}
                    </>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ปุ่มบันทึก + ปิดงาน (แยก 2 ปุ่ม) */}
        {isOpen && (
          <>
            {!isOnline && (
              <div style={{
                textAlign:"center",fontSize:12,color:"#b45309",
                background:"#fffbeb",border:"1px solid #fde68a",
                borderRadius:8,padding:"6px 12px",marginBottom:6,fontWeight:600,
              }}>⚠️ ไม่มีอินเทอร์เน็ต — ไม่สามารถบันทึก/ปิดงานได้</div>
            )}
            {/* ปุ่มบันทึก — เก็บวัตถุดิบไว้โดยยังไม่ปิดงาน (ยังไม่ตัดสต็อก) */}
            <button className="btn" onClick={handleSaveDraft}
              disabled={saving || !isOnline}
              style={{ width: "100%", padding: "13px", fontSize: 15, fontWeight: 800, background: "#fff",
                       color: "#1b5e20", border: "2px solid #1b5e20", borderRadius: 12, marginBottom: 10,
                       opacity: !isOnline ? 0.5 : 1 }}>
              {saving ? "กำลังบันทึก..." : "💾 บันทึก (ยังไม่ปิดงาน)"}
            </button>
            {/* ปุ่มปิดงาน — ตัดสต็อก + สร้างรายการขาย ZORT */}
            <button className="btn primary" onClick={handleCloseJob}
              disabled={saving || materials.length === 0 || !isOnline}
              style={{ width: "100%", padding: "14px", fontSize: 15, fontWeight: 800, background: "#1b5e20", borderRadius: 12,
                       opacity: (!isOnline || materials.length === 0) ? 0.5 : 1 }}>
              {saving ? "กำลังปิดงาน..." : "✅ ปิดงาน & สร้างรายการขาย ZORT"}
            </button>
          </>
        )}
      </div>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// AUDIT LOG VIEW — แสดงประวัติการแก้ข้อมูล (เจ้าของเท่านั้น)
// ─────────────────────────────────────────────────────────────────────
function AuditLogView() {
  const [rows, setRows] = uS([]);
  const [loading, setLoading] = uS(true);
  const [err, setErr] = uS(null);
  const [auditPage, setAuditPage] = uS(1);
  const [search, setSearch] = uS("");
  const [actionFilter, setActionFilter] = uS("all");
  const auditListRef = React.useRef(null);
  const AUDIT_PAGE_SIZE = 20;

  const load = async () => {
    if (!SHEET_DEPLOY_URL) { setErr("ยังไม่ได้เชื่อมต่อ Sheet"); setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const sep = SHEET_DEPLOY_URL.includes("?") ? "&" : "?";
      const res = await fetch(`${SHEET_DEPLOY_URL}${sep}action=getAuditLog&_t=${Date.now()}`, { cache: "no-store" });
      const d = await res.json();
      setRows(Array.isArray(d.rows) ? d.rows : []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  uE(() => { load(); }, []);

  const actionTypes = uM(() => {
    const seen = new Set();
    rows.forEach(r => { if (r.action) seen.add(r.action); });
    return [...seen].sort();
  }, [rows]);

  const filteredRows = uM(() => {
    let list = rows;
    if (actionFilter !== "all") list = list.filter(r => r.action === actionFilter);
    const sq = search.trim().toLowerCase();
    if (sq) list = list.filter(r =>
      (r.actor || "").toLowerCase().includes(sq) ||
      (r.sku || "").toLowerCase().includes(sq) ||
      (r.detail || "").toLowerCase().includes(sq)
    );
    return list;
  }, [rows, search, actionFilter]);

  uE(() => { setAuditPage(1); }, [search, actionFilter]);

  const actionBadgeStyle = (action) => {
    if (action === "นับสต็อก")  return { background: "#e8f5e9", color: "#1b5e20" };
    if (action === "โอนสต็อก")  return { background: "#e3f2fd", color: "#0d47a1" };
    if (action === "ปิดงาน MTO") return { background: "#fff3e0", color: "#e65100" };
    return { background: "#f3e5f5", color: "#4a148c" };
  };

  return (
    <div style={{ padding: "16px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--g-700)" }}>📋 Audit Log</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>ประวัติการแก้ข้อมูล 200 รายการล่าสุด</div>
        </div>
        <button className="btn ghost" onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {loading ? <span className="spin" style={{ width: 14, height: 14, borderWidth: 2 }}/> : "🔄"}
          <span>รีโหลด</span>
        </button>
      </div>

      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 ค้นหา ผู้ใช้ / SKU / รายละเอียด..."
            style={{
              flex: "1 1 200px", padding: "8px 12px", borderRadius: 8,
              border: "1.5px solid var(--bdr)", fontSize: 13,
              fontFamily: "inherit", outline: "none", background: "var(--paper)",
            }}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["all", ...actionTypes].map(a => (
              <button key={a}
                onClick={() => setActionFilter(a)}
                style={{
                  padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", border: "1.5px solid", fontFamily: "inherit",
                  borderColor: actionFilter === a ? "var(--g-600)" : "var(--bdr)",
                  background:  actionFilter === a ? "var(--g-600)" : "var(--paper)",
                  color:       actionFilter === a ? "#fff" : "var(--muted)",
                }}
              >{a === "all" ? "ทั้งหมด" : a}</button>
            ))}
          </div>
        </div>
      )}

      {err && (
        <div style={{ background: "#fff0f0", border: "1px solid var(--dang)", borderRadius: 8, padding: "10px 14px", color: "var(--dang)", marginBottom: 12, fontSize: 13 }}>
          ⚠️ {err}
        </div>
      )}

      <div ref={auditListRef}/>
      {loading && rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
          <span className="spin" style={{ width: 24, height: 24, borderWidth: 3, display: "inline-block" }}/>
          <div style={{ marginTop: 8, fontSize: 13 }}>กำลังโหลด…</div>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 14 }}>
          ยังไม่มีรายการ Audit Log
        </div>
      ) : (<>
        {filteredRows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 14 }}>
            ไม่พบรายการที่ตรงกับการค้นหา
          </div>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--bdr)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--g-50)", borderBottom: "2px solid var(--bdr)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--g-700)", whiteSpace: "nowrap" }}>วันที่เวลา</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--g-700)" }}>ผู้ใช้</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--g-700)" }}>Action</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--g-700)" }}>SKU</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--g-700)" }}>รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice((auditPage-1)*AUDIT_PAGE_SIZE, auditPage*AUDIT_PAGE_SIZE).map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--bdr)", background: idx % 2 === 0 ? "var(--paper)" : "var(--g-50)" }}>
                    <td style={{ padding: "8px 12px", color: "var(--muted)", whiteSpace: "nowrap", fontSize: 12 }}>{r.ts}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.actor}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                        ...actionBadgeStyle(r.action),
                      }}>{r.action}</span>
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>{r.sku}</td>
                    <td style={{ padding: "8px 12px", color: "var(--text)" }}>{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={auditPage} total={filteredRows.length} pageSize={AUDIT_PAGE_SIZE} onChange={setAuditPage} listRef={auditListRef}/>
      </>)}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// DeadStockView — สินค้าจม (read-only, เจ้าของดูคนเดียว)
// ดึง action=getDeadStock จาก GAS แสดงสินค้าที่มีหน้าร้าน > 0
// และไม่ได้รับโอนมานานกว่า 3 เดือน
// ───────────────────────────────────────────────────────────
function DeadStockView() {
  const [items, setItems] = uS([]);
  const [loading, setLoading] = uS(true);
  const [err, setErr] = uS(null);
  const [deadPage, setDeadPage] = uS(1);
  const deadListRef = React.useRef(null);
  const DEAD_PAGE_SIZE = 20;

  const load = async () => {
    if (!SHEET_DEPLOY_URL) { setErr("ยังไม่ได้เชื่อมต่อ Sheet"); setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const sep = SHEET_DEPLOY_URL.includes("?") ? "&" : "?";
      const res = await fetch(`${SHEET_DEPLOY_URL}${sep}action=getDeadStock&_t=${Date.now()}`, { cache: "no-store" });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  uE(() => { load(); }, []);

  // สีตาม deadMonths: 3-5=ส้ม, 6-11=แดง, 12+=แดงเข้ม, null=เทา
  const deadColor = (dm) => {
    if (dm === null) return { bg: "#f5f5f5", fg: "#888" };
    if (dm >= 12)   return { bg: "#ffebee", fg: "#b71c1c" };
    if (dm >= 6)    return { bg: "#fff3e0", fg: "#b71c1c" };
    return              { bg: "#fff8e1", fg: "#e65100" };
  };

  // แยก items ที่มี deadMonths กับ null
  const known = items.filter(x => x.deadMonths !== null);
  const unknown = items.filter(x => x.deadMonths === null);

  return (
    <div style={{ padding: "16px", maxWidth: 960, margin: "0 auto" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--g-700)" }}>📦 สินค้าจม</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>ไม่ได้โอนจากคลังสาย5 &gt; 3 เดือน — มีของอยู่หน้าร้าน</div>
        </div>
        <button className="btn ghost" onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {loading ? <span className="spin" style={{ width: 14, height: 14, borderWidth: 2 }}/> : "🔄"}
          <span>รีโหลด</span>
        </button>
      </div>

      {err && (
        <div style={{ background: "#fff0f0", border: "1px solid var(--dang)", borderRadius: 8, padding: "10px 14px", color: "var(--dang)", marginBottom: 12, fontSize: 13 }}>
          ⚠️ {err}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
          <span className="spin" style={{ width: 24, height: 24, borderWidth: 3, display: "inline-block" }}/>
          <div style={{ marginTop: 8, fontSize: 13 }}>กำลังโหลด…</div>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 14 }}>
          ไม่มีสินค้าจม 🎉
        </div>
      ) : (
        <>
          {/* summary chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <span style={{ background: "#ffebee", color: "#b71c1c", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
              12+ เดือน: {items.filter(x => x.deadMonths !== null && x.deadMonths >= 12).length} รายการ
            </span>
            <span style={{ background: "#fff3e0", color: "#b71c1c", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
              6-11 เดือน: {items.filter(x => x.deadMonths !== null && x.deadMonths >= 6 && x.deadMonths < 12).length} รายการ
            </span>
            <span style={{ background: "#fff8e1", color: "#e65100", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
              3-5 เดือน: {items.filter(x => x.deadMonths !== null && x.deadMonths < 6).length} รายการ
            </span>
            {unknown.length > 0 && (
              <span style={{ background: "#f5f5f5", color: "#888", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
                ไม่มีข้อมูล: {unknown.length} รายการ
              </span>
            )}
          </div>

          <div ref={deadListRef}/>
          <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--bdr)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--g-50)", borderBottom: "2px solid var(--bdr)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--g-700)" }}>ชื่อสินค้า</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--g-700)", whiteSpace: "nowrap" }}>SKU</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "var(--g-700)", whiteSpace: "nowrap" }}>หน้าร้าน</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "var(--g-700)", whiteSpace: "nowrap" }}>คลัง</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "var(--g-700)", whiteSpace: "nowrap" }}>จมมา</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--g-700)", whiteSpace: "nowrap" }}>โอนล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {[...known, ...unknown].slice((deadPage-1)*DEAD_PAGE_SIZE, deadPage*DEAD_PAGE_SIZE).map((item, idx) => {
                  const c = deadColor(item.deadMonths);
                  return (
                    <tr key={item.sku || idx} style={{ borderBottom: "1px solid var(--bdr)", background: idx % 2 === 0 ? "var(--paper)" : "var(--g-50)" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text)" }}>{item.name || "—"}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "var(--muted)" }}>{item.sku}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700 }}>{item.qtyFront}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--muted)" }}>{item.qtyWH}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontWeight: 700, fontSize: 12, background: c.bg, color: c.fg }}>
                          {item.deadMonths === null ? "ไม่มีข้อมูล" : (item.deadMonths >= 12 ? "⚠️ " : "") + item.deadMonths + " เดือน"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", color: "var(--muted)", fontSize: 12 }}>{item.lastTransferDate || "ไม่มีข้อมูล"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={deadPage} total={[...known, ...unknown].length} pageSize={DEAD_PAGE_SIZE} onChange={setDeadPage} listRef={deadListRef}/>
        </>
      )}
    </div>
  );
}

// ────────────── 🛒 สั่งซื้อ (Purchase/Reorder) ──────────────

Object.assign(window, { OverviewView, CategoryView, TrendsView, StockView, StorageView, StockCountView, TransferView, UploadView, ConnectView, LabelPrintView, ProductCard, OrderListView, OrderSummaryView, ConfirmModal, Toast, useToast, SkeletonCard, FrontStoreView, CalcPadModal, MaterialDrawModal, MtoJobView, useOnlineStatus, AuditLogView, DeadStockView, Pagination, WarehouseMapModal });
