const fs = require('fs');
let code = fs.readFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', 'utf8');

// 1. Add calcPad state after existing states
const stateBlock = `  const [toast, showToast, hideToast]       = useToast();`;
const stateBlockNew = `  const [toast, showToast, hideToast]       = useToast();
  const [calcPad, setCalcPad]               = uS(null); // {sku, val, name}`;
code = code.replace(stateBlock, stateBlockNew);

// 2. Add CalcPad helper functions after uE reset
const afterReset = `  uE(() => { setCheckedQtys({}); setSavedSkus(new Set()); setLastSavedTime(null); }, [selLockKey]);`;
const afterResetNew = `  uE(() => { setCheckedQtys({}); setSavedSkus(new Set()); setLastSavedTime(null); }, [selLockKey]);

  const openCalc = (sku, name) => {
    const cur = checkedQtys[sku];
    setCalcPad({ sku, name, val: (cur != null && cur !== '') ? String(cur) : '' });
  };
  const calcPress = (key) => {
    if (!calcPad) return;
    if (key === 'DEL') {
      setCalcPad(p => ({ ...p, val: p.val.length > 1 ? p.val.slice(0,-1) : '' }));
    } else if (key === 'OK') {
      const v = calcPad.val === '' ? '' : String(Math.max(0, parseInt(calcPad.val)||0));
      setCheckedQtys(prev => { const o = Object.assign({},prev); o[calcPad.sku] = v; return o; });
      setCalcPad(null);
    } else if (key === 'X') {
      setCalcPad(null);
    } else {
      // digit
      setCalcPad(p => ({
        ...p,
        val: p.val === '0' ? key : (p.val.length < 5 ? p.val + key : p.val)
      }));
    }
  };`;
code = code.replace(afterReset, afterResetNew);

// 3. Add CalcPad modal overlay to STEP 3 return — insert after <Toast .../>
const toastLine = `      <Toast toast={toast} onClose={hideToast}/>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>

        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <button onClick={() => setStep(2)}`;

const toastLineNew = `      <Toast toast={toast} onClose={hideToast}/>

      {/* ── CalcPad modal ── */}
      {calcPad && (
        <div style={{position:'fixed',inset:0,zIndex:9999,
                     background:'rgba(0,0,0,.55)',
                     display:'flex',alignItems:'flex-end',justifyContent:'center'}}
             onClick={() => setCalcPad(null)}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',
                       width:'100%',maxWidth:400,padding:'20px 16px 32px'}}
               onClick={e => e.stopPropagation()}>
            {/* Product name */}
            <div style={{fontSize:12,color:'var(--muted)',fontWeight:600,
                         textAlign:'center',marginBottom:6,
                         overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
              {calcPad.name || calcPad.sku}
            </div>
            {/* Display */}
            <div style={{background:'#f8fafc',borderRadius:12,padding:'10px 20px',
                         textAlign:'right',marginBottom:16,
                         border:'2px solid var(--g-200)'}}>
              <span style={{fontSize:42,fontWeight:800,color:'var(--text)',
                            fontFamily:'monospace',letterSpacing:2}}>
                {calcPad.val === '' ? '0' : calcPad.val}
              </span>
            </div>
            {/* Numpad grid */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {['7','8','9','4','5','6','1','2','3','DEL','0','OK'].map(function(k){
                const isDel = k==='DEL', isOk = k==='OK';
                return (
                  <button key={k} onClick={() => calcPress(k)}
                    style={{
                      height:60, borderRadius:12, fontFamily:'inherit',
                      fontSize: isDel?18 : isOk?18 : 28,
                      fontWeight:800, cursor:'pointer',
                      border: isOk?'none':'1.5px solid var(--bdr)',
                      background: isOk?'var(--g-600)' : isDel?'#fee2e2':'#fff',
                      color: isOk?'#fff' : isDel?'var(--dang)':'var(--text)',
                      transition:'transform .08s',
                      WebkitTapHighlightColor:'transparent',
                    }}>
                    {k==='DEL' ? '⌫' : k==='OK' ? '✓' : k}
                  </button>
                );
              })}
            </div>
            {/* Cancel */}
            <button onClick={() => setCalcPad(null)}
              style={{width:'100%',marginTop:10,height:44,borderRadius:12,
                      border:'1.5px solid var(--bdr)',background:'#f8fafc',
                      cursor:'pointer',fontSize:14,fontWeight:700,
                      fontFamily:'inherit',color:'var(--muted)'}}>
              ยกเลิก ✕
            </button>
          </div>
        </div>
      )}

      <div style={{display:'flex',flexDirection:'column',gap:12}}>

        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <button onClick={() => setStep(2)}`;

code = code.replace(toastLine, toastLineNew);

// 4. Close the extra <div> — find the closing </> of step3 and add closing div before it
// The step3 return now has an extra wrapping div, need to close it
const closingOld = `      </div>
    </>
  );
}

function TransferView`;
const closingNew = `      </div>
      </div>
    </>
  );
}

function TransferView`;
code = code.replace(closingOld, closingNew);

// 5. Add 🧮 button next to each input field in step3 cards
// Find the +5 button and add calc button after it
const plus5Btn = `                      <button onClick={function(){ adjustQty(sku,5); }}
                        style={{flex:'0 0 36px',height:44,borderRadius:8,
                                border:'1.5px solid var(--g-200)',background:'#f0fdf4',
                                cursor:'pointer',fontSize:10,fontWeight:800,
                                fontFamily:'inherit',color:'var(--g-700)'}}>
                        +5
                      </button>
                    </div>`;
const plus5BtnNew = `                      <button onClick={function(){ adjustQty(sku,5); }}
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
                    </button>`;
code = code.replace(plus5Btn, plus5BtnNew);

fs.writeFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', code);

const babel = require('@babel/parser');
try {
  babel.parse(code, { plugins: ['jsx'], sourceType: 'script' });
  console.log('OK lines:', code.split('\n').length);
} catch(e) { console.log('ERR', e.message, 'line', e.loc&&e.loc.line); }
