const fs = require('fs');
let code = fs.readFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', 'utf8');

const step3Start = code.indexOf('  // ── STEP 3: นับสินค้า ─────────────────────────────────────────────');
const step3End   = code.indexOf('\nfunction TransferView', step3Start);

const newStep3 = `  // ── STEP 3: นับสินค้า ─────────────────────────────────────────────
  const filledCount = Object.values(checkedQtys).filter(v => v !== '' && v != null).length;

  return (
    <>
      <Toast toast={toast} onClose={hideToast}/>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>

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

        {lockSkus.length === 0 ? (
          <Card padding={true}>
            <Empty title="ล็อคนี้ยังไม่มีสินค้า" sub="เพิ่มสินค้าในหน้าตำแหน่งคลัง"/>
          </Card>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14}}>
            {lockSkus.map(function(sku){
              const p      = productMap[sku];
              const sys    = p
                ? (p.warehouseQty != null ? p.warehouseQty
                 : p.qtyWH != null       ? p.qtyWH
                 : p.qty   != null       ? p.qty : 0)
                : null;
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

const result = code.substring(0, step3Start) + newStep3 + code.substring(step3End);
fs.writeFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', result);

const babel = require('@babel/parser');
try {
  babel.parse(result, { plugins: ['jsx'], sourceType: 'script' });
  console.log('OK lines:', result.split('\n').length);
} catch(e) { console.log('ERR', e.message, 'line', e.loc&&e.loc.line); }
