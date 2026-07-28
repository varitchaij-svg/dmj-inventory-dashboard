// views-quote.jsx — depends on views-main.jsx + views-analytics.jsx (โหลดก่อนหน้า)
// ใช้ computeBillTotals/isBillExcludedCat/POS_SALES_CHANNELS/POS_TRANSFER_INFO/syncSearchContact/
// syncGetContactDetail จาก views-analytics.jsx (global scope เดียวกัน ไม่ต้อง import)

// ────────────── 📝 สร้างใบเสนอราคา (QuotationFormView) — saler/owner ──────────────
// ค้นสินค้า→รายการ (SKU ล็อค ชื่อแก้ได้ เผื่อ MTO/จัดแบบพิเศษ)→คิดส่วนลดอัตโนมัติ (กฎเดียวกับ POS)
// →ค้นลูกค้าเก่า/กรอกใหม่→หมายเหตุ (default 3 บรรทัด แก้ได้)→บันทึกร่าง หรือ ส่งเข้า ZORT จริง

// ── sync helper: สร้างใบเสนอราคาจริงใน ZORT ──
async function syncCreateQuotation(quote) {
  if (!SHEET_DEPLOY_URL) return { success: false, error: "ยังไม่ได้เชื่อมต่อ Sheet" };
  try {
    const res = await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ createQuotation: true, quote, actor: window._currentUser || sessionStorage.getItem("dmj_role") || "saler" }),
    });
    return await res.json(); // { success, data:{quotationId, quotationNumber, totals} }
  } catch (err) { return { success: false, error: err.message }; }
}
// ── sync helper: บันทึกร่างใบเสนอราคา (ยังไม่ส่งเข้า ZORT) ──
async function syncSaveQuotationDraft(quote) {
  if (!SHEET_DEPLOY_URL) return { success: false, error: "ยังไม่ได้เชื่อมต่อ Sheet" };
  try {
    const res = await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ saveQuotationDraft: true, quote, actor: window._currentUser || sessionStorage.getItem("dmj_role") || "saler" }),
    });
    return await res.json(); // { success, data:{draftId} }
  } catch (err) { return { success: false, error: err.message }; }
}
// ── sync helper: ดึงร่างใบเสนอราคาทั้งหมด ──
async function syncGetQuotationDrafts() {
  if (!SHEET_DEPLOY_URL) return { success: false, error: "ยังไม่ได้เชื่อมต่อ Sheet" };
  try {
    const sep = SHEET_DEPLOY_URL.includes("?") ? "&" : "?";
    const res = await fetch(`${SHEET_DEPLOY_URL}${sep}action=getQuotationDrafts&_t=${Date.now()}`, { cache: "no-store" });
    return await res.json(); // { success, data:{drafts:[]} }
  } catch (err) { return { success: false, error: err.message }; }
}
// ── sync helper: ลบร่างทิ้ง ──
async function syncDeleteQuotationDraft(draftId) {
  if (!SHEET_DEPLOY_URL) return { success: false, error: "ยังไม่ได้เชื่อมต่อ Sheet" };
  try {
    const res = await fetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ deleteQuotationDraft: true, draftId, actor: window._currentUser || sessionStorage.getItem("dmj_role") || "saler" }),
    });
    return await res.json();
  } catch (err) { return { success: false, error: err.message }; }
}

// หมายเหตุ default 3 บรรทัด (แก้ไข/ลบ/เพิ่มได้ในฟอร์ม) — ข้อความจริงตามที่เจ้าของยืนยัน
// (ข้อ 3 = บัญชีโอนสำหรับใบเสนอราคา ต่างจาก POS_TRANSFER_INFO ที่ใช้ตอนออกบิลขายหน้าร้าน)
const QUOTE_DEFAULT_REMARKS = [
  "ราคาที่เสนอนี้เป็นราคาขาย ไม่รวมค่าขนส่ง",
  "ใบเสนอราคานี้มีอายุการใช้งาน 3 เดือน นับจากวันที่ออกเอกสารใบเสนอราคา หากพ้นระยะเวลาดังกล่าว กรุณาติดต่อเพื่อขอใบเสนอราคาใหม่",
  "ชำระโดยโอนเข้าบัญชี ธนาคารกสิกรไทย ชื่อบัญชี บริษัท ดี.ยูนิตี้ จำกัด บัญชีออมทรัพย์ สาขาเทสโก้โลตัสศาลายา เลขที่บัญชี 0503342510",
];

const QUOTE_SALES_REP_KEY = "dmj_quote_last_salesrep";

function QuotationFormView({ data, role, onBack, onSubmitted }) {
  const products = (data && data.products) || [];
  const [toast, showToast, hideToast] = useToast();

  const [cart, setCart] = uS([]);
  const [search, setSearch] = uS("");
  const [catFilter, setCatFilter] = uS("ทั้งหมด");
  const [catPage, setCatPage] = uS(0);

  const [cust, setCust] = uS({ name: "", taxId: "", branch: "", branchNo: "", address: "", phone: "", email: "" });
  const [custQuery, setCustQuery] = uS("");
  const [custResults, setCustResults] = uS(null);
  const [searching, setSearching] = uS(false);

  const [salesRep, setSalesRep] = uS(() => { try { return sessionStorage.getItem(QUOTE_SALES_REP_KEY) || ""; } catch (e) { return ""; } });
  const [channel, setChannel] = uS("หน้าร้าน");
  const [remarks, setRemarks] = uS(QUOTE_DEFAULT_REMARKS.slice());
  const [manualDiscount, setManualDiscount] = uS("");

  const [draftId, setDraftId] = uS(null);
  const [drafts, setDrafts] = uS([]);
  const [showDrafts, setShowDrafts] = uS(false);
  const [loadingDrafts, setLoadingDrafts] = uS(false);
  const [saving, setSaving] = uS(false);
  const [savingDraft, setSavingDraft] = uS(false);
  const [result, setResult] = uS(null);

  const md = Math.max(0, parseFloat(manualDiscount) || 0);
  const totals = uM(() => computeBillTotals(cart, { manualDiscount: md }), [cart, md]);

  const cats = uM(() => {
    const m = {};
    products.forEach(p => { const c = (p.category || "อื่นๆ").trim(); m[c] = (m[c] || 0) + 1; });
    return Object.keys(m).sort((a, b) => m[b] - m[a]);
  }, [products]);

  const POS_GRID_PER = 9;
  const gridAll = uM(() => (catFilter === "ทั้งหมด" ? products : products.filter(p => (p.category || "อื่นๆ").trim() === catFilter)), [products, catFilter]);
  const gridPages = Math.max(1, Math.ceil(gridAll.length / POS_GRID_PER));
  const gridPageSafe = Math.min(catPage, gridPages - 1);
  const gridItems = gridAll.slice(gridPageSafe * POS_GRID_PER, gridPageSafe * POS_GRID_PER + POS_GRID_PER);
  function pickCat(c) { setCatFilter(c); setCatPage(0); }

  const matches = uM(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const toks = q.split(/\s+/).filter(Boolean);
    const inCart = new Set(cart.map(c => c.sku));
    return products.filter(p => {
      if (inCart.has(p.sku)) return false;
      const hay = ((p.sku || "") + " " + (p.name || "") + " " + (p.category || "")).toLowerCase();
      return toks.every(t => hay.includes(t));
    }).slice(0, 20);
  }, [search, products, cart]);

  function addToCart(p) {
    setCart(c => {
      const idx = c.findIndex(it => it.sku === p.sku);
      if (idx >= 0) return c.map((it, i) => i === idx ? { ...it, qty: (Number(it.qty) || 0) + 1 } : it);
      return [...c, {
        sku: p.sku, name: p.name, category: p.category || "", imageUrl: p.imageUrl || "",
        qty: 1, price: Number(p.price) || 0,
      }];
    });
    setSearch("");
  }
  function patchItem(i, patch) { setCart(c => c.map((it, idx) => idx === i ? Object.assign({}, it, patch) : it)); }
  function removeItem(i) { setCart(c => c.filter((_, idx) => idx !== i)); }

  // เครื่องสแกนบาร์โค้ด (USB/มือถือ) ทำงานเหมือนคีย์บอร์ด: พิมพ์รหัส+Enter (mirror PosView)
  function handleScanEnter(e) {
    if (e.key !== "Enter") return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    let hit = products.find(p => String(p.sku || "").toLowerCase() === q);
    if (!hit && matches.length === 1) hit = matches[0];
    if (!hit) { showToast("warn", "ไม่พบสินค้า: " + search.trim(), "🔍"); return; }
    const idx = cart.findIndex(c => c.sku === hit.sku);
    if (idx >= 0) { patchItem(idx, { qty: (Number(cart[idx].qty) || 0) + 1 }); setSearch(""); }
    else addToCart(hit);
    showToast("success", "+ " + hit.name, "📦");
  }

  async function doSearchCustomer() {
    const q = custQuery.trim();
    if (q.length < 2) { showToast("warn", "พิมพ์อย่างน้อย 2 ตัวอักษร", "🔍"); return; }
    setSearching(true); setCustResults(null);
    const r = await syncSearchContact(q);
    setSearching(false);
    if (!r.success) { showToast("error", "ค้นไม่สำเร็จ: " + (r.error || ""), "❌"); return; }
    const list = (r.data && r.data.contacts) || [];
    setCustResults(list);
    if (!list.length) showToast("warn", "ไม่พบลูกค้า — กรอกเองได้", "📝");
  }
  async function pickCustomer(c) {
    setCust({ name: c.name || "", taxId: c.taxId || "", branch: c.branch || "", branchNo: c.branchNo || "",
      address: c.address || "", phone: c.phone || "", email: c.email || "" });
    setCustResults(null); setCustQuery("");
    showToast("success", "กรอกข้อมูลลูกค้าแล้ว", "✅");
    if (c.id) {
      const r = await syncGetContactDetail(c.id);
      const d = r && r.success && r.data && r.data.contact;
      if (d) setCust(prev => ({
        name: d.name || prev.name, taxId: d.taxId || prev.taxId, branch: d.branch || prev.branch,
        branchNo: d.branchNo || prev.branchNo, address: d.address || prev.address,
        phone: d.phone || prev.phone, email: d.email || prev.email,
      }));
    }
  }

  function patchRemark(i, val) { setRemarks(r => r.map((x, idx) => idx === i ? val : x)); }
  function removeRemark(i) { setRemarks(r => r.filter((_, idx) => idx !== i)); }
  function addRemark() { setRemarks(r => [...r, ""]); }

  function buildQuotePayload() {
    return {
      draftId: draftId || undefined,
      items: cart.map(it => ({ sku: it.sku, name: it.name, category: it.category, qty: Number(it.qty) || 0, price: Number(it.price) || 0 })),
      customer: cust,
      salesRep: salesRep.trim(),
      channel,
      remarks: remarks.map(r => r.trim()).filter(Boolean),
      manualDiscount: md,
    };
  }

  function persistSalesRep(v) {
    setSalesRep(v);
    try { sessionStorage.setItem(QUOTE_SALES_REP_KEY, v); } catch (e) {}
  }

  async function loadDrafts() {
    setLoadingDrafts(true);
    const r = await syncGetQuotationDrafts();
    setLoadingDrafts(false);
    if (!r.success) { showToast("error", "โหลดร่างไม่สำเร็จ: " + (r.error || ""), "❌"); return; }
    setDrafts((r.data && r.data.drafts) || []);
  }
  function toggleDrafts() {
    const next = !showDrafts;
    setShowDrafts(next);
    if (next) loadDrafts();
  }
  function loadDraft(d) {
    setCart(Array.isArray(d.items) ? d.items : []);
    setCust(d.customer || { name: "", taxId: "", branch: "", branchNo: "", address: "", phone: "", email: "" });
    setSalesRep(d.salesRep || "");
    setChannel(d.channel || "หน้าร้าน");
    setRemarks(Array.isArray(d.remarks) && d.remarks.length ? d.remarks : QUOTE_DEFAULT_REMARKS.slice());
    setManualDiscount(d.manualDiscount ? String(d.manualDiscount) : "");
    setDraftId(d.draftId);
    setShowDrafts(false);
    showToast("success", "โหลดร่างแล้ว", "📂");
  }
  async function deleteDraft(id) {
    if (!window.confirm("ลบร่างนี้ทิ้ง?")) return;
    const r = await syncDeleteQuotationDraft(id);
    if (r && r.success) { setDrafts(ds => ds.filter(d => d.draftId !== id)); showToast("success", "ลบร่างแล้ว", "🗑️"); }
    else showToast("error", "ลบไม่สำเร็จ: " + ((r && r.error) || ""), "❌");
  }

  async function saveDraft() {
    if (!cart.length && !cust.name) { showToast("warn", "ยังไม่มีข้อมูลให้บันทึกร่าง", "📝"); return; }
    setSavingDraft(true);
    const r = await syncSaveQuotationDraft(buildQuotePayload());
    setSavingDraft(false);
    if (!r.success) { showToast("error", "บันทึกร่างไม่สำเร็จ: " + (r.error || ""), "❌"); return; }
    setDraftId((r.data && r.data.draftId) || draftId);
    showToast("success", "บันทึกร่างแล้ว", "💾");
  }

  async function submit() {
    if (!cart.length) { showToast("warn", "ยังไม่มีสินค้าในใบเสนอราคา", "🛒"); return; }
    if (cart.some(it => (Number(it.qty) || 0) <= 0)) { showToast("warn", "จำนวนต้องมากกว่า 0", "✏️"); return; }
    if (!cust.name.trim()) { showToast("warn", "กรุณากรอกชื่อลูกค้า", "👤"); return; }
    if (!salesRep.trim()) { showToast("warn", "กรุณากรอกชื่อเซล", "🧑‍💼"); return; }
    setSaving(true);
    const r = await syncCreateQuotation(buildQuotePayload());
    setSaving(false);
    if (!r.success) { showToast("error", "สร้างใบเสนอราคาไม่สำเร็จ: " + (r.error || ""), "❌"); return; }
    persistSalesRep(salesRep.trim());
    setResult(r.data || {});
    showToast("success", "สร้างใบเสนอราคาสำเร็จ", "🎉");
    if (onSubmitted) onSubmitted();
  }

  function resetAll() {
    setCart([]); setCust({ name: "", taxId: "", branch: "", branchNo: "", address: "", phone: "", email: "" });
    setCustQuery(""); setCustResults(null); setChannel("หน้าร้าน");
    setRemarks(QUOTE_DEFAULT_REMARKS.slice()); setManualDiscount(""); setDraftId(null); setResult(null);
  }

  const th = { padding: "8px 6px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "var(--muted)" };
  const inp = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, minWidth: 0, boxSizing: "border-box" };

  if (result) {
    return (
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, margin: "0 auto" }}>
        <Card padding={true}>
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 44 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>สร้างใบเสนอราคาสำเร็จ</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--g-700,#166534)", marginTop: 6, fontFamily: "monospace" }}>{result.quotationNumber || "—"}</div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>ยอดสุทธิ {fmtBfull(result.totals ? result.totals.grandTotal : totals.grandTotal)}</div>
          </div>
        </Card>
        <button onClick={() => { resetAll(); }} style={{ padding: 14, borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700 }}>📝 สร้างใบใหม่</button>
        {onBack && <button onClick={onBack} style={{ padding: 14, borderRadius: 10, border: "none", background: "var(--g-600,#1f7f44)", color: "#fff", fontWeight: 700 }}>← กลับไปหน้าติดตามสถานะ</button>}
        <Toast toast={toast} onClose={hideToast}/>
      </div>
    );
  }

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>📝 สร้างใบเสนอราคาใหม่</div>
        {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: "var(--muted)", fontWeight: 600, cursor: "pointer" }}>✕ ปิด</button>}
      </div>

      {/* ── ร่างที่บันทึกไว้ ── */}
      <Card padding={true} title="📂 ร่างที่บันทึกไว้" action={
        <button onClick={toggleDrafts} style={{ border: "none", background: "none", color: "var(--g-600,#1f7f44)", fontWeight: 700, cursor: "pointer" }}>
          {showDrafts ? "ซ่อน ▲" : "แสดง ▼"}
        </button>
      }>
        {showDrafts && (
          loadingDrafts ? <div style={{ fontSize: 13, color: "var(--muted)" }}>กำลังโหลด…</div> :
          drafts.length === 0 ? <Empty icon="📂" title="ยังไม่มีร่าง" sub="กด 💾 บันทึกร่าง ด้านล่างเพื่อเก็บไว้ทำต่อทีหลัง"/> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {drafts.map(d => (
                <div key={d.draftId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", border: "1px solid #f3f4f6", borderRadius: 8 }}>
                  <div onClick={() => loadDraft(d)} style={{ cursor: "pointer", flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{(d.customer && d.customer.name) || "(ไม่มีชื่อลูกค้า)"}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{(d.items || []).length} รายการ · {d.salesRep || "ไม่ระบุเซล"}</div>
                  </div>
                  <button onClick={() => deleteDraft(d.draftId)} style={{ border: "none", background: "none", color: "#dc2626", fontSize: 16, cursor: "pointer", padding: "4px 8px" }}>✕</button>
                </div>
              ))}
            </div>
          )
        )}
      </Card>

      {/* ── ค้นหาสินค้า ── */}
      <Card padding={true} title="🔍 เพิ่มสินค้า">
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={handleScanEnter}
          placeholder="ค้นหาชื่อสินค้า/รหัส (พิมพ์ได้หลายคำ) หรือสแกนบาร์โค้ด" style={inp}/>
        {matches.length > 0 && (
          <div style={{ marginTop: 8, border: "1px solid #eee", borderRadius: 8, maxHeight: 260, overflowY: "auto" }}>
            {matches.map(p => (
              <div key={p.sku} onClick={() => addToCart(p)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}>
                {p.imageUrl
                  ? <img src={p.imageUrl} loading="lazy" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 5, flexShrink: 0, background: "#f3f4f6" }} onError={e => { e.target.style.display = "none"; }}/>
                  : <div style={{ width: 36, height: 36, borderRadius: 5, background: "#f3f4f6", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📦</div>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{p.sku} · {p.category || "-"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!search && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => pickCat("ทั้งหมด")} style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: catFilter === "ทั้งหมด" ? "2px solid var(--g-600,#1f7f44)" : "1px solid #d1d5db", background: catFilter === "ทั้งหมด" ? "#f0fdf4" : "#fff" }}>ทั้งหมด</button>
              {cats.slice(0, 12).map(c => (
                <button key={c} onClick={() => pickCat(c)} style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: catFilter === c ? "2px solid var(--g-600,#1f7f44)" : "1px solid #d1d5db", background: catFilter === c ? "#f0fdf4" : "#fff" }}>{c}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginTop: 10 }}>
              {gridItems.map(p => (
                <div key={p.sku} onClick={() => addToCart(p)} style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, cursor: "pointer", textAlign: "center" }}>
                  {p.imageUrl
                    ? <img src={p.imageUrl} loading="lazy" style={{ width: "100%", height: 60, objectFit: "cover", borderRadius: 5, background: "#f3f4f6" }} onError={e => { e.target.style.display = "none"; }}/>
                    : <div style={{ width: "100%", height: 60, borderRadius: 5, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📦</div>}
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>{p.sku}</div>
                </div>
              ))}
            </div>
            {gridPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8, alignItems: "center" }}>
                <button onClick={() => setCatPage(Math.max(0, gridPageSafe - 1))} disabled={gridPageSafe === 0}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700, cursor: gridPageSafe === 0 ? "default" : "pointer", opacity: gridPageSafe === 0 ? 0.4 : 1 }}>‹</button>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{gridPageSafe + 1} / {gridPages}</span>
                <button onClick={() => setCatPage(Math.min(gridPages - 1, gridPageSafe + 1))} disabled={gridPageSafe >= gridPages - 1}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700, cursor: gridPageSafe >= gridPages - 1 ? "default" : "pointer", opacity: gridPageSafe >= gridPages - 1 ? 0.4 : 1 }}>›</button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── รายการในใบเสนอราคา ── */}
      <Card padding={true} title={`📋 รายการ (${cart.length})`}>
        {cart.length === 0 ? <Empty icon="📋" title="ยังไม่มีสินค้า" sub="ค้นหาด้านบนแล้วแตะเพื่อเพิ่ม"/> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr>
                <th style={th}>สินค้า (ชื่อแก้ได้)</th><th style={{ ...th, textAlign: "center", width: 60 }}>จำนวน</th>
                <th style={{ ...th, textAlign: "right", width: 90 }}>ราคา/ชิ้น</th><th style={{ ...th, textAlign: "right", width: 90 }}>รวม</th><th style={{ width: 32 }}></th>
              </tr></thead>
              <tbody>
                {cart.map((it, i) => {
                  const excl = isBillExcludedCat(it.category);
                  return (
                    <tr key={it.sku} style={{ borderTop: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "8px 6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {it.imageUrl
                            ? <img src={it.imageUrl} loading="lazy" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 5, flexShrink: 0, background: "#f3f4f6" }} onError={e => { e.target.style.display = "none"; }}/>
                            : <div style={{ width: 36, height: 36, borderRadius: 5, background: "#f3f4f6", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📦</div>}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <input value={it.name} onChange={e => patchItem(i, { name: e.target.value })}
                              style={{ width: "100%", fontWeight: 600, border: "1px solid transparent", borderBottom: "1px dashed #d1d5db", padding: "2px 0", fontSize: 14, background: "transparent", minWidth: 0 }}/>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{it.sku}{excl ? " · ยกเว้นส่วนลด" : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "center" }}>
                        <input type="number" min="0" value={it.qty} onChange={e => patchItem(i, { qty: e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                          style={{ width: 55, padding: "6px", borderRadius: 6, border: "1px solid #d1d5db", textAlign: "center", minWidth: 0 }}/>
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>
                        <input type="number" min="0" value={it.price} onChange={e => patchItem(i, { price: e.target.value === "" ? "" : Math.max(0, parseFloat(e.target.value) || 0) })}
                          style={{ width: 80, padding: "6px", borderRadius: 6, border: "1px solid #d1d5db", textAlign: "right", minWidth: 0 }}/>
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600 }}>{fmtBfull((Number(it.qty) || 0) * (Number(it.price) || 0))}</td>
                      <td style={{ padding: "8px 6px", textAlign: "center" }}>
                        <button onClick={() => removeItem(i)} style={{ border: "none", background: "none", color: "#dc2626", fontSize: 18, cursor: "pointer" }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── ลูกค้า ── */}
      <Card padding={true} title="👤 ลูกค้า">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={custQuery} onChange={e => setCustQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearchCustomer()}
            placeholder="ค้นชื่อบริษัท หรือ เลขผู้เสียภาษี (ลูกค้าเก่า)" style={inp}/>
          <button onClick={doSearchCustomer} disabled={searching} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--g-600,#1f7f44)", color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}>
            {searching ? "..." : "ค้นหา"}
          </button>
        </div>
        {custResults && custResults.length > 0 && (
          <div style={{ marginTop: 8, border: "1px solid #eee", borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
            {custResults.map((c, i) => (
              <div key={i} onClick={() => pickCustomer(c)} style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name || "(ไม่มีชื่อ)"}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.taxId ? "เลขภาษี " + c.taxId : ""}{c.branch ? " · " + c.branch : ""}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}><FieldLabel_>ชื่อลูกค้า / บริษัท *</FieldLabel_><input value={cust.name} onChange={e => setCust({ ...cust, name: e.target.value })} style={inp}/></div>
          <div><FieldLabel_>เลขผู้เสียภาษี</FieldLabel_><input value={cust.taxId} onChange={e => setCust({ ...cust, taxId: e.target.value })} style={inp}/></div>
          <div><FieldLabel_>สาขา (ชื่อ)</FieldLabel_><input value={cust.branch} onChange={e => setCust({ ...cust, branch: e.target.value })} style={inp}/></div>
          <div><FieldLabel_>เลขที่สาขา</FieldLabel_><input value={cust.branchNo} onChange={e => setCust({ ...cust, branchNo: e.target.value })} placeholder="เช่น 00000" style={inp}/></div>
          <div><FieldLabel_>เบอร์โทร</FieldLabel_><input value={cust.phone} onChange={e => setCust({ ...cust, phone: e.target.value })} style={inp}/></div>
          <div style={{ gridColumn: "1 / -1" }}><FieldLabel_>ที่อยู่</FieldLabel_><input value={cust.address} onChange={e => setCust({ ...cust, address: e.target.value })} style={inp}/></div>
          <div style={{ gridColumn: "1 / -1" }}><FieldLabel_>อีเมล</FieldLabel_><input value={cust.email} onChange={e => setCust({ ...cust, email: e.target.value })} style={inp}/></div>
        </div>
      </Card>

      {/* ── เซล / ช่องทาง ── */}
      <Card padding={true} title="🧑‍💼 เซล / ช่องทาง">
        <FieldLabel_>ชื่อเซล *</FieldLabel_>
        <input value={salesRep} onChange={e => persistSalesRep(e.target.value)} placeholder="ชื่อผู้ทำใบเสนอราคา" style={inp}/>
        <div style={{ marginTop: 10 }}>
          <FieldLabel_>ช่องทาง</FieldLabel_>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {POS_SALES_CHANNELS.map(ch => (
              <button key={ch} onClick={() => setChannel(ch)} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: channel === ch ? "2px solid var(--g-600,#1f7f44)" : "1px solid #d1d5db",
                background: channel === ch ? "#f0fdf4" : "#fff", color: channel === ch ? "var(--g-700,#166534)" : "#374151" }}>
                {ch === "Line OA" ? "💚 Line OA" : ch}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── หมายเหตุ ── */}
      <Card padding={true} title="📝 หมายเหตุ" action={
        <button onClick={addRemark} style={{ border: "none", background: "none", color: "var(--g-600,#1f7f44)", fontWeight: 700, cursor: "pointer" }}>+ เพิ่ม</button>
      }>
        {remarks.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input value={r} onChange={e => patchRemark(i, e.target.value)} style={inp}/>
            <button onClick={() => removeRemark(i)} style={{ border: "none", background: "none", color: "#dc2626", fontSize: 16, cursor: "pointer" }}>✕</button>
          </div>
        ))}
      </Card>

      {/* ── สรุปยอด ── */}
      <Card padding={true} title="🧮 สรุปยอด">
        <div style={{ marginBottom: 10 }}>
          <FieldLabel_>ส่วนลดเพิ่มเติม (บาท)</FieldLabel_>
          <input type="number" min="0" value={manualDiscount} onChange={e => setManualDiscount(e.target.value)} placeholder="0" style={inp}/>
        </div>
        <SummaryRow_ label="มูลค่าสินค้า" value={fmtBfull(totals.retailEligible + totals.retailExcluded)}/>
        {totals.isWholesale && <SummaryRow_ label="ส่วนลดขายส่ง 20%" value={"−" + fmtBfull(totals.wholesaleDiscount)} color="#16a34a"/>}
        {totals.tierRate > 0 && <SummaryRow_ label={`ส่วนลดตามยอด ${(totals.tierRate * 100).toFixed(0)}%`} value={"−" + fmtBfull(totals.tierDiscount)} color="#16a34a"/>}
        {md > 0 && <SummaryRow_ label="ส่วนลดเพิ่มเติม" value={"−" + fmtBfull(md)} color="#16a34a"/>}
        <div style={{ borderTop: "1px dashed #d1d5db", margin: "8px 0" }}/>
        <SummaryRow_ label="มูลค่าก่อน VAT" value={fmtBfull(totals.preVat)} muted/>
        <SummaryRow_ label="VAT 7%" value={fmtBfull(totals.vat)} muted/>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>ยอดสุทธิ</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: "var(--g-700,#166534)" }}>{fmtBfull(totals.grandTotal)}</span>
        </div>
        {totals.savings > 0 && <div style={{ textAlign: "right", fontSize: 12, color: "#16a34a", marginTop: 2 }}>ประหยัด {fmtBfull(totals.savings)}</div>}
      </Card>

      <div style={{ display: "flex", gap: 8, position: "sticky", bottom: 12 }}>
        <button onClick={saveDraft} disabled={savingDraft} style={{ flex: 1, padding: 16, borderRadius: 12, border: "1px solid #d1d5db", background: "#fff", fontWeight: 800, fontSize: 15 }}>
          {savingDraft ? "กำลังบันทึก…" : "💾 บันทึกร่าง"}
        </button>
        <button onClick={submit} disabled={saving || !cart.length} style={{ flex: 2, padding: 16, borderRadius: 12, border: "none", fontWeight: 800, fontSize: 16,
          background: (saving || !cart.length) ? "#9ca3af" : "var(--g-600,#1f7f44)", color: "#fff", boxShadow: "0 4px 14px rgba(0,0,0,.15)" }}>
          {saving ? "กำลังส่ง..." : `📤 ส่งเข้า ZORT · ${fmtBfull(totals.grandTotal)}`}
        </button>
      </div>

      <Toast toast={toast} onClose={hideToast}/>
    </div>
  );
}

if (typeof module !== 'undefined') module.exports = { QUOTE_DEFAULT_REMARKS };
