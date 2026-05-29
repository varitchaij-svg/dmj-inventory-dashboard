const fs = require('fs');
let code = fs.readFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', 'utf8');

// ── 1. StockCountView: add [search, setSearch] state ─────────────────────────
const oldState = `  const [calcPad, setCalcPad]               = uS(null); // {sku, val, name}

  uE(() => { setCheckedQtys({}); setSavedSkus(new Set()); setLastSavedTime(null); }, [selLockKey]);`;
const newState = `  const [calcPad, setCalcPad]               = uS(null); // {sku, val, name}
  const [stockSearch, setStockSearch]       = uS('');

  uE(() => { setCheckedQtys({}); setSavedSkus(new Set()); setLastSavedTime(null); setStockSearch(''); }, [selLockKey]);`;
code = code.replace(oldState, newState);

// ── 2. StockCountView: filter lockSkus by stockSearch ────────────────────────
// Find "const lockSkus" and extend it
const oldLockSkus = `  const lockSkus = uM(() =>
    selLockKey ? (lockData[selLockKey]?.skus || []) : []
  , [lockData, selLockKey]);`;

// Check if exact string exists; if not, try without the memoization
const altLockSkus = code.includes(oldLockSkus);

// Also try the version that might exist
const foundLockSkus = code.includes('const lockSkus = uM');

console.log('lockSkus pattern found:', altLockSkus, 'uM found:', foundLockSkus);

// ── 3. StockCountView step 3: add search bar + ScanButton above product grid ──
// Insert after the summary badges block and before the product grid
const oldGridStart = `        {lockSkus.length === 0 ? (
          <Card padding={true}>
            <Empty title="ล็อคนี้ยังไม่มีสินค้า" sub="เพิ่มสินค้าในหน้าตำแหน่งคลัง"/>
          </Card>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14}}>
            {lockSkus.map(function(sku){`;

const newGridStart = `        {/* Search + Scan bar */}
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
              style={{borderRadius:10}}
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
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14}}>
            {lockSkus.filter(function(sku){
              if (!stockSearch) return true;
              const sq = stockSearch.trim().toUpperCase();
              const p = productMap[sku];
              return sku.toUpperCase().includes(sq) || (p && p.name && p.name.toUpperCase().includes(sq));
            }).map(function(sku){`;

if (code.includes(oldGridStart)) {
  code = code.replace(oldGridStart, newGridStart);
  console.log('StockCountView grid patch applied');
} else {
  console.log('ERR: StockCountView grid pattern not found');
}

// ── 4. TransferView: add ScanButton next to search input ─────────────────────
const oldTransferSearch = `                <input type="text" placeholder="🔍 ค้นหา SKU..."
                       value={search} onChange={e => setSearch(e.target.value)}`;

const newTransferSearch = `                <div style={{display:'flex',gap:8,alignItems:'center',flex:1}}>
                <input type="text" placeholder="🔍 ค้นหา SKU..."
                       value={search} onChange={e => setSearch(e.target.value)}`;

// Find closing of the input and add ScanButton after
const oldTransferSearchFull = `                <input type="text" placeholder="🔍 ค้นหา SKU..."
                       value={search} onChange={e => setSearch(e.target.value)}
                       style={{flex:1,padding:"8px 12px",borderRadius:9,border:"1.5px solid var(--bdr)",
                               fontSize:13,fontFamily:"inherit"}}/>`;

const newTransferSearchFull = `                <div style={{display:'flex',gap:8,alignItems:'center',flex:1}}>
                <input type="text" placeholder="🔍 ค้นหา SKU..."
                       value={search} onChange={e => setSearch(e.target.value)}
                       style={{flex:1,padding:"8px 12px",borderRadius:9,border:"1.5px solid var(--bdr)",
                               fontSize:13,fontFamily:"inherit"}}/>
                <ScanButton size={40} onScan={sku => { setSearch(sku); }}/>
                </div>`;

if (code.includes(oldTransferSearchFull)) {
  code = code.replace(oldTransferSearchFull, newTransferSearchFull);
  console.log('TransferView scan patch applied');
} else {
  console.log('ERR: TransferView search pattern not found');
  // try to find what's there
  const idx = code.indexOf('placeholder="🔍 ค้นหา SKU..."');
  if (idx > 0) console.log('Found at:', code.substring(idx-10, idx+200));
}

fs.writeFileSync('D:/DMJ/Inventory & Sales Dashboard/views.jsx', code);

const babel = require('@babel/parser');
try {
  babel.parse(code, { plugins: ['jsx'], sourceType: 'script' });
  console.log('OK lines:', code.split('\n').length);
} catch(e) { console.log('ERR', e.message, 'line', e.loc&&e.loc.line); }
