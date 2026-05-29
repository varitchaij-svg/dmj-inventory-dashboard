const fs = require('fs');
const code = fs.readFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', 'utf8');

const startMarker = 'function StockCountView';
const endMarker   = '\nfunction TransferView';
const startIdx    = code.indexOf(startMarker);
const endIdx      = code.indexOf(endMarker, startIdx);

const before = code.substring(0, startIdx);
const after  = code.substring(endIdx); // starts with '\nfunction TransferView'

const newComponent = `function StockCountView({ data }) {
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

  uE(() => { setCheckedQtys({}); setSavedSkus(new Set()); setLastSavedTime(null); }, [selLockKey]);

  const locksN = shelves.locksPerShelf || 15;
  const COLS = 3, ROWS = Math.ceil(locksN / COLS);

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
      const sys = p ? (p.warehouseQty != null ? p.warehouseQty : p.qtyWH != null ? p.qtyWH : p.qty != null ? p.qty : 0) : null;
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
      ? (COLS - 1 - col) * ROWS + (row + 1)
      : col * ROWS + (row + 1);

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

  // ── STEP 1: เลือกชั้น ────────────────────────────────────────────
  if (step === 1) return (
    <>
      <Toast toast={toast} onClose={hideToast}/>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div>
          <div style={{fontSize:16,fontWeight:800}}>📊 นับ stock คลัง</div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>ขั้น 1 — เลือกชั้น</div>
        </div>
        {['A','B'].map(side => (
          <div key={side}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',
                         textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>
              ซอย {side}
            </div>
            <div style={{display:'grid',
                         gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10}}>
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
    </>
  );

  // ── STEP 2: เลือกล็อค ───────────────────────────────────────────
  if (step === 2) return (
    <>
      <Toast toast={toast} onClose={hideToast}/>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
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
                       gridTemplateColumns:'repeat('+COLS+',1fr)',gap:8}}>
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
      <div style={{display:'flex',flexDirection:'column',gap:12}}>

        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <button onClick={() => setStep(2)}
            style={{width:40,height:40,borderRadius:10,border:'1.5px solid var(--bdr)',
                    background:'#fff',cursor:'pointer',fontSize:20,fontFamily:'inherit',
                    flexShrink:0}}>
            ←
          </button>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:800}}>ล็อค {selLockKey}</div>
            <div style={{fontSize:11,color:'var(--muted)'}}>ขั้น 3 — กรอกจำนวนที่นับได้</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
            <button onClick={handleSave}
              disabled={saving || filledCount===0}
              className="btn primary"
              style={{padding:'9px 18px',fontWeight:700,
                      opacity:(saving||filledCount===0)?0.4:1}}>
              {saving
                ? React.createElement(React.Fragment, null, React.createElement('span', {className:'spin', style:{width:13,height:13,borderWidth:2,marginRight:6}}), 'บันทึก...')
                : filledCount>0 ? '💾 บันทึก ('+filledCount+')' : '💾 บันทึก'}
            </button>
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
              {n:summary.waiting,   label:'⬜ รอนับ', bg:'#f1f5f9', c:'var(--muted)'},
              {n:summary.matched,   label:'✅ ตรง',   bg:'#f0fdf4', c:'var(--g-700)'},
              {n:summary.mismatched,label:'⚠️ ไม่ตรง',
               bg:summary.mismatched>0?'#fff5f5':'#f1f5f9',
               c:summary.mismatched>0?'var(--dang)':'var(--muted)'},
            ].map(function(item){ return (
              <div key={item.label} style={{flex:1,textAlign:'center',padding:'8px 4px',
                                            borderRadius:10,background:item.bg}}>
                <div style={{fontSize:18,fontWeight:800,color:item.c}}>{item.n}</div>
                <div style={{fontSize:10,color:item.c,fontWeight:600}}>{item.label}</div>
              </div>
            ); })}
          </div>
        )}

        {lockSkus.length === 0 ? (
          <Card padding={true}><Empty title="ล็อคนี้ยังไม่มีสินค้า" sub="เพิ่มสินค้าในหน้าตำแหน่งคลัง"/></Card>
        ) : (
          <div style={{display:'grid',
                       gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))',gap:12}}>
            {lockSkus.map(function(sku){
              const p       = productMap[sku];
              const sys     = p ? (p.warehouseQty != null ? p.warehouseQty : p.qtyWH != null ? p.qtyWH : p.qty != null ? p.qty : 0) : null;
              const val     = checkedQtys[sku];
              const has     = val !== '' && val != null;
              const num     = has ? (parseInt(val)||0) : 0;
              const matched = has && sys !== null && num === sys;
              const diff    = has && sys !== null ? num - sys : null;
              const saved   = savedSkus.has(sku);
              const bdr     = !has ? 'var(--bdr)' : matched ? 'var(--g-500)' : 'var(--dang)';
              const bgCard  = saved ? '#f0fdf4' : !has ? '#fff' : matched ? '#f0fdf4' : '#fff5f5';
              return (
                <div key={sku} style={{
                  background:bgCard, border:'2px solid '+bdr,
                  borderRadius:14, overflow:'hidden',
                  display:'flex', flexDirection:'column',
                  transition:'border-color .15s',
                }}>
                  {p && p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name}
                         style={{width:'100%',height:120,objectFit:'contain',
                                 display:'block',background:'var(--g-50)'}}/>
                  ) : (
                    <div style={{width:'100%',height:90,background:'var(--g-50)',
                                 display:'flex',alignItems:'center',justifyContent:'center',
                                 fontSize:28}}>📦</div>
                  )}
                  <div style={{padding:'10px',display:'flex',flexDirection:'column',gap:6,flex:1}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:9,fontWeight:700,color:'var(--g-500)',
                                    fontFamily:'monospace'}}>{sku}</span>
                      <span style={{fontSize:9,fontWeight:700,borderRadius:8,padding:'1px 6px',
                                    background:!has?'#f1f5f9':matched?'#dcfce7':'#fee2e2',
                                    color:!has?'var(--muted)':matched?'#166534':'var(--dang)'}}>
                        {!has ? '⬜' : matched ? '✅' : (diff>0?'+'+diff:String(diff))}
                      </span>
                    </div>
                    <div style={{fontSize:12,fontWeight:600,lineHeight:1.3,
                                 overflow:'hidden',display:'-webkit-box',
                                 WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                      {p ? p.name : React.createElement('span',
                        {style:{color:'var(--muted)',fontStyle:'italic'}}, 'ไม่พบในระบบ')}
                    </div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>
                      {'ระบบ: '}
                      <b style={{color:'var(--text)'}}>{sys != null ? sys : '—'}</b>
                      {saved && React.createElement('span',{style:{
                        marginLeft:4,fontSize:9,background:'#dcfce7',color:'#166534',
                        borderRadius:8,padding:'1px 5px',fontWeight:700}}, '✓')}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:4,marginTop:2}}>
                      <button onClick={function(){ adjustQty(sku,-1); }}
                        style={{flex:1,height:44,borderRadius:8,border:'1.5px solid var(--bdr)',
                                background:'#fff',cursor:'pointer',fontSize:20,fontWeight:800,
                                fontFamily:'inherit',color:'var(--dang)',
                                opacity:num>0?1:0.3}}>
                        {'−'}
                      </button>
                      <input type="number" min="0" inputMode="numeric"
                        value={val != null ? val : ''}
                        onChange={function(e){
                          setCheckedQtys(function(prev){
                            const obj = Object.assign({}, prev);
                            obj[sku] = e.target.value===''?'':String(parseInt(e.target.value)||0);
                            return obj;
                          });
                        }}
                        placeholder="0"
                        style={{
                          flex:2, textAlign:'center', padding:'8px 2px',
                          borderRadius:8, fontSize:16, fontWeight:800,
                          fontFamily:'inherit', outline:'none',
                          border:has?(matched?'2px solid var(--g-500)':'2px solid var(--dang)'):'1.5px solid var(--bdr)',
                          background:has?(matched?'#f0fdf4':'#fff5f5'):'#fff',
                          color:has?(matched?'var(--g-700)':'var(--dang)'):'var(--text)',
                        }}/>
                      <button onClick={function(){ adjustQty(sku,1); }}
                        style={{flex:1,height:44,borderRadius:8,border:'1.5px solid var(--bdr)',
                                background:'#f0fdf4',cursor:'pointer',fontSize:20,fontWeight:800,
                                fontFamily:'inherit',color:'var(--g-700)'}}>
                        {'+'}
                      </button>
                    </div>
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
`;

const result = before + newComponent + after;
fs.writeFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', result);
console.log('written, lines:', result.split('\n').length);
