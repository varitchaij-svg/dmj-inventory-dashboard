const fs = require('fs');
let code = fs.readFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', 'utf8');

// ── 1. Replace openCalc + calcPress functions ─────────────────────────
const oldFns = `  const openCalc = (sku, name) => {
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

const newFns = `  const openCalc = (sku, name) => {
    const cur = checkedQtys[sku];
    const init = (cur != null && cur !== '') ? String(cur) : '';
    setCalcPad({ sku, name, expr: init, result: null, justOp: false });
  };

  // Safe expression evaluator — supports + - * /
  const evalExpr = (expr) => {
    try {
      const clean = expr.replace(/[^0-9+\\-*/.()]/g,'');
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
      const trimmed = base.replace(/[+\\-*\\/]$/, '');
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
    ? evalExpr(calcPad.expr) : null;`;

code = code.replace(oldFns, newFns);

// ── 2. Replace CalcPad modal UI ───────────────────────────────────────
const oldModal = `      {/* ── CalcPad modal ── */}
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
      )}`;

const newModal = `      {/* ── Calculator modal ── */}
      {calcPad && (
        <div style={{position:'fixed',inset:0,zIndex:9999,
                     background:'rgba(0,0,0,.6)',
                     display:'flex',alignItems:'flex-end',justifyContent:'center'}}
             onClick={() => calcPress('CANCEL')}>
          <div style={{background:'#fff',borderRadius:'22px 22px 0 0',
                       width:'100%',maxWidth:420,padding:'18px 16px 32px',
                       boxShadow:'0 -8px 32px rgba(0,0,0,.18)'}}
               onClick={function(e){ e.stopPropagation(); }}>

            {/* Product name */}
            <div style={{fontSize:12,color:'var(--muted)',fontWeight:600,
                         textAlign:'center',marginBottom:10,
                         overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
              🧮 {calcPad.name || calcPad.sku}
            </div>

            {/* Display */}
            <div style={{background:'#0f172a',borderRadius:14,padding:'12px 18px 8px',
                         marginBottom:12,minHeight:80,
                         display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
              {/* Expression */}
              <div style={{fontSize:13,color:'#64748b',fontFamily:'monospace',
                           wordBreak:'break-all',textAlign:'right',minHeight:18}}>
                {calcPad.expr || ''}
              </div>
              {/* Main number */}
              <div style={{fontSize:44,fontWeight:800,color:'#f8fafc',
                           fontFamily:'monospace',lineHeight:1}}>
                {calcDisplay}
              </div>
              {/* Preview of result */}
              {calcEvalPreview !== null && calcEvalPreview !== parseFloat(calcDisplay) && (
                <div style={{fontSize:13,color:'#94a3b8',fontFamily:'monospace'}}>
                  {'= '+calcEvalPreview}
                </div>
              )}
            </div>

            {/* Button grid 4×4 */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:7}}>
              {[
                {k:'C',    label:'C',   bg:'#fee2e2', c:'var(--dang)',   fs:18},
                {k:'DEL',  label:'⌫',   bg:'#fef3c7', c:'#b45309',       fs:22},
                {k:'(',    label:'(',   bg:'#f1f5f9', c:'var(--text)',    fs:20},
                {k:'/',    label:'÷',   bg:'#ede9fe', c:'#7c3aed',       fs:22},

                {k:'7',    label:'7',   bg:'#fff',    c:'var(--text)',    fs:26},
                {k:'8',    label:'8',   bg:'#fff',    c:'var(--text)',    fs:26},
                {k:'9',    label:'9',   bg:'#fff',    c:'var(--text)',    fs:26},
                {k:'*',    label:'×',   bg:'#ede9fe', c:'#7c3aed',       fs:22},

                {k:'4',    label:'4',   bg:'#fff',    c:'var(--text)',    fs:26},
                {k:'5',    label:'5',   bg:'#fff',    c:'var(--text)',    fs:26},
                {k:'6',    label:'6',   bg:'#fff',    c:'var(--text)',    fs:26},
                {k:'-',    label:'−',   bg:'#ede9fe', c:'#7c3aed',       fs:26},

                {k:'1',    label:'1',   bg:'#fff',    c:'var(--text)',    fs:26},
                {k:'2',    label:'2',   bg:'#fff',    c:'var(--text)',    fs:26},
                {k:'3',    label:'3',   bg:'#fff',    c:'var(--text)',    fs:26},
                {k:'+',    label:'+',   bg:'#ede9fe', c:'#7c3aed',       fs:26},

                {k:')',    label:')',   bg:'#f1f5f9', c:'var(--text)',    fs:20},
                {k:'0',    label:'0',   bg:'#fff',    c:'var(--text)',    fs:26},
                {k:'=',    label:'=',   bg:'#1f7f44', c:'#fff',          fs:26},
                {k:'CONFIRM',label:'✓ ใช้',bg:'#1f7f44',c:'#fff',       fs:15},
              ].map(function(btn){
                return (
                  <button key={btn.k} onClick={function(){ calcPress(btn.k); }}
                    style={{
                      height:58, borderRadius:12, fontFamily:'inherit',
                      fontSize:btn.fs, fontWeight:800, cursor:'pointer',
                      border:'none',
                      background:btn.bg, color:btn.c,
                      WebkitTapHighlightColor:'transparent',
                      transition:'opacity .1s',
                      gridColumn: btn.k==='CONFIRM' ? 'span 1' : undefined,
                    }}>
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}`;

code = code.replace(oldModal, newModal);

fs.writeFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', code);

const babel = require('@babel/parser');
try {
  babel.parse(code, { plugins: ['jsx'], sourceType: 'script' });
  console.log('OK lines:', code.split('\n').length);
} catch(e) { console.log('ERR', e.message, 'line', e.loc&&e.loc.line); }
