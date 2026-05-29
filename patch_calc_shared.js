const fs = require('fs');
let code = fs.readFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', 'utf8');

// ════════════════════════════════════════════════════════════════
// A. Add CalcPadModal as a standalone reusable component
//    (placed just before the export Object.assign line)
// ════════════════════════════════════════════════════════════════

const exportLine = 'Object.assign(window, { OverviewView,';

const calcPadComponent = `// ─────────────────────────────────────────────────────────────────────
// CALC PAD MODAL — reusable calculator overlay for qty input
// Props: { open, name, initialVal, onConfirm, onClose }
// ─────────────────────────────────────────────────────────────────────
function CalcPadModal({ open, name, initialVal, onConfirm, onClose }) {
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
      const clean = e.replace(/[^0-9+\\-*/.()]/g,'');
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
      setExpr(base.replace(/[+\\-*\\/]$/, '') + key);
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
          <div style={{fontSize:44,fontWeight:800,color:'#f8fafc',
                       fontFamily:'monospace',lineHeight:1}}>
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

`;

code = code.replace(exportLine, calcPadComponent + exportLine);

// ════════════════════════════════════════════════════════════════
// B. Add CalcPadModal to window exports
// ════════════════════════════════════════════════════════════════
code = code.replace(
  'Object.assign(window, { OverviewView, CategoryView, TrendsView, StockView, StorageView, StockCountView, TransferView, UploadView, ConnectView, LabelPrintView, ProductCard, OrderListView, OrderSummaryView, ConfirmModal, Toast, useToast, SkeletonCard, FrontStoreView });',
  'Object.assign(window, { OverviewView, CategoryView, TrendsView, StockView, StorageView, StockCountView, TransferView, UploadView, ConnectView, LabelPrintView, ProductCard, OrderListView, OrderSummaryView, ConfirmModal, Toast, useToast, SkeletonCard, FrontStoreView, CalcPadModal });'
);

// ════════════════════════════════════════════════════════════════
// C. Replace inline CalcPad in StockCountView with CalcPadModal
// ════════════════════════════════════════════════════════════════

// Remove openCalc / calcPress / calcDisplay / calcEvalPreview block from StockCountView
// and replace with simple state + use of CalcPadModal

const oldCalcFns = `  const openCalc = (sku, name) => {
    const cur = checkedQtys[sku];
    const init = (cur != null && cur !== '') ? String(cur) : '';
    setCalcPad({ sku, name, val: init, result: null, justOp: false });
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

const newCalcFns = `  const openCalc = (sku, pname) => {
    const cur = checkedQtys[sku];
    setCalcPad({ sku, name: pname, val: (cur != null && cur !== '') ? String(cur) : '' });
  };`;

code = code.replace(oldCalcFns, newCalcFns);

// Replace the big CalcPad modal JSX in StockCountView return with CalcPadModal component
const oldModalJSX = `      {/* ── Calculator modal ── */}
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

const newModalJSX = `      {/* ── CalcPadModal ── */}
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
      />`;

code = code.replace(oldModalJSX, newModalJSX);

// ════════════════════════════════════════════════════════════════
// D. Add 🧮 button to FSCard + CalcPadModal to FrontStoreView
// ════════════════════════════════════════════════════════════════

// 1. Add onOpenCalc prop to FSCard signature
code = code.replace(
  'const FSCard = React.memo(function FSCard({ p, val, isSaved, isTouched, onSetQty, onImageClick }) {',
  'const FSCard = React.memo(function FSCard({ p, val, isSaved, isTouched, onSetQty, onImageClick, onOpenCalc }) {'
);

// 2. Add 🧮 button after +5 in FSCard
const fsPlus5 = `          <button onClick={() => adjustQty(5)}
            style={{minWidth:44,height:48,borderRadius:8,
                    border:"1.5px solid var(--bdr)",background:"#f0fdf4",
                    cursor:"pointer",fontSize:13,fontWeight:700,
                    fontFamily:"inherit",color:"var(--g-700)"}}>+5</button>
        </div>
      </div>
    </div>
  );
});`;

const fsPlus5New = `          <button onClick={() => adjustQty(5)}
            style={{minWidth:44,height:48,borderRadius:8,
                    border:"1.5px solid var(--bdr)",background:"#f0fdf4",
                    cursor:"pointer",fontSize:13,fontWeight:700,
                    fontFamily:"inherit",color:"var(--g-700)"}}>+5</button>
        </div>
        <button onClick={() => onOpenCalc && onOpenCalc(p.sku, p.name)}
          style={{width:"100%",marginTop:6,height:38,borderRadius:8,
                  border:"1.5px solid var(--bdr)",background:"#f8fafc",
                  cursor:"pointer",fontSize:12,fontWeight:700,
                  fontFamily:"inherit",color:"var(--muted)",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <span style={{fontSize:16}}>🧮</span>
          <span>เครื่องคิดเลข</span>
        </button>
      </div>
    </div>
  );
});`;

code = code.replace(fsPlus5, fsPlus5New);

// 3. Add calcPad state to FrontStoreView (after lastSavedTime state)
code = code.replace(
  '  const [lastSavedTime, setLastSavedTime] = uS(null); // timestamp of last successful save',
  '  const [lastSavedTime, setLastSavedTime] = uS(null); // timestamp of last successful save\n  const [fsCalcPad, setFsCalcPad] = uS(null); // {sku, name, val} for CalcPadModal'
);

// 4. Pass onOpenCalc to FSCard render (find where FSCard is rendered in FrontStoreView)
code = code.replace(
  '              onImageClick={url => setLightbox({url, name: p.name})}',
  '              onImageClick={url => setLightbox({url, name: p.name})}\n              onOpenCalc={(sku, name) => setFsCalcPad({ sku, name, val: checkedQtys[sku] != null ? String(checkedQtys[sku]) : \'\' })}'
);

// 5. Add CalcPadModal to FrontStoreView return (before the closing </> of FrontStoreView)
// Find the existing Toast in FrontStoreView return
code = code.replace(
  '  const handleSave = uC(async () => {',
  `  const handleSave = uC(async () => {`
);

// Insert CalcPadModal before the final </> in FrontStoreView
// The FrontStoreView ends with: <Toast.../>\n    </>\n  );\n}\n\n// ─────...StockCountView
const fsvEnd = `    <Toast toast={toast} onClose={hideToast}/>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// STOCK COUNT VIEW`;

const fsvEndNew = `    <Toast toast={toast} onClose={hideToast}/>
    <CalcPadModal
      open={!!fsCalcPad}
      name={fsCalcPad ? fsCalcPad.name : ''}
      initialVal={fsCalcPad ? fsCalcPad.val : ''}
      onConfirm={function(qty){
        if (fsCalcPad) {
          setCheckedQtys(function(prev){ const o=Object.assign({},prev); o[fsCalcPad.sku]=parseInt(qty)||0; return o; });
          setTouched(function(prev){ return new Set([...prev, fsCalcPad.sku]); });
        }
        setFsCalcPad(null);
      }}
      onClose={function(){ setFsCalcPad(null); }}
    />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// STOCK COUNT VIEW`;

code = code.replace(fsvEnd, fsvEndNew);

fs.writeFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', code);

const babel = require('@babel/parser');
try {
  babel.parse(code, { plugins: ['jsx'], sourceType: 'script' });
  console.log('OK lines:', code.split('\n').length);
} catch(e) { console.log('ERR', e.message, 'line', e.loc&&e.loc.line); }
