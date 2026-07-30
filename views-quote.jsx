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
    const res = await dmjFetch(SHEET_DEPLOY_URL, {
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
    const res = await dmjFetch(SHEET_DEPLOY_URL, {
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
// ── sync helper: ดึงรายละเอียดใบเสนอราคาเดิม (สำหรับพิมพ์ A4 ย้อนหลัง) ──
async function syncGetQuotationForPrint(idOrNumber) {
  if (!SHEET_DEPLOY_URL) return { success: false, error: "ยังไม่ได้เชื่อมต่อ Sheet" };
  try {
    const sep = SHEET_DEPLOY_URL.includes("?") ? "&" : "?";
    const res = await fetch(`${SHEET_DEPLOY_URL}${sep}action=getQuotationForPrint&id=${encodeURIComponent(idOrNumber)}&_t=${Date.now()}`, { cache: "no-store" });
    return await res.json(); // { success, data:{quotationNumber,customer,items,remarks,salesRep,totals} }
  } catch (err) { return { success: false, error: err.message }; }
}
// ── sync helper: ลบร่างทิ้ง ──
async function syncDeleteQuotationDraft(draftId) {
  if (!SHEET_DEPLOY_URL) return { success: false, error: "ยังไม่ได้เชื่อมต่อ Sheet" };
  try {
    const res = await dmjFetch(SHEET_DEPLOY_URL, {
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

// หมายเหตุของใบแจ้งหนี้ — คนละชุดกับใบเสนอราคา (เจ้าของยืนยัน 2026-07-30) ตายตัว ไม่ผูกกับ
// หมายเหตุที่บันทึกไว้ในใบเสนอราคาต้นฉบับ · แต่ละบรรทัดคือ 1 แถวตามที่เจ้าของพิมพ์มาเป๊ะ
// (มีเลขข้อในเนื้อหาเองแล้ว — QuotationPrintDoc ไม่เติมเลขซ้ำ)
const INVOICE_DEFAULT_REMARKS = [
  "1. กรุณาตรวจสอบรายละเอียดในใบแจ้งหนี้ หากมีข้อผิดพลาด กรุณาแจ้งกลับภายใน 3 วันทำการ",
  "บริษัทขอสงวนสิทธิ์ในการเปลี่ยนแปลงราคาโดยไม่แจ้งให้ทราบล่วงหน้า หากยังไม่มีการชำระเงิน",
  "2. ราคานี้ยังไม่รวมค่าขนส่ง",
  "ค่าขนส่งจะคำนวณเพิ่มเติมตามระยะทางและวิธีขนส่งที่ลูกค้าเลือก",
  "3. ชำระโดยโอนเข้าบัญชี ธนาคารกสิกรไทย ชื่อบัญชี บริษัท ดี.ยูนิตี้ จำกัด",
  "บัญชีออมทรัพย์ สาขาเทสโก้โลตัสศาลายา เลขที่บัญชี 0503342510",
];

function fmtInvoiceBaht(n) {
  return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════════════
// InvoiceOptionsModal — ตั้งค่าก่อนพิมพ์ใบแจ้งหนี้: เต็มจำนวน / เรียกเก็บมัดจำ / เรียกเก็บยอดคงเหลือ
// ───────────────────────────────────────────────
// เจ้าของขอ 2026-07-30: ลูกค้าบางรายขอแยกใบแจ้งหนี้เป็น "มัดจำ" กับ "ยอดคงเหลือ" ทีหลัง —
// กรอกยอดมัดจำครั้งเดียว อีกฝั่งคำนวณให้เอง + หมายเหตุเงื่อนไขใส่อัตโนมัติ (แก้ต่อได้อิสระในช่อง)
// หมายเหตุ auto-suggest ทำงานจนกว่าผู้ใช้จะพิมพ์ในช่องเอง (touched=true) — กันเขียนทับสิ่งที่แก้ไว้
// ═══════════════════════════════════════════════
function InvoiceOptionsModal({ grandTotal, onCancel, onConfirm }) {
  const [kind, setKind] = uS("full"); // "full" | "deposit" | "remaining"
  const [depositStr, setDepositStr] = uS("");
  const deposit = Math.max(0, Math.min(Number(depositStr) || 0, grandTotal));
  const remaining = Math.max(0, grandTotal - deposit);

  const baseText = INVOICE_DEFAULT_REMARKS.join("\n");
  const [remarksText, setRemarksText] = uS(baseText);
  const [touched, setTouched] = uS(false);

  uE(() => {
    if (touched) return;
    let extra = "";
    if (kind === "deposit" && deposit > 0) {
      extra = `4. ใบแจ้งหนี้ฉบับนี้เรียกเก็บเงินมัดจำ ${fmtInvoiceBaht(deposit)} บาท จากยอดรวม ${fmtInvoiceBaht(grandTotal)} บาท `
            + `ส่วนที่เหลืออีก ${fmtInvoiceBaht(remaining)} บาท จะเรียกเก็บในใบแจ้งหนี้ฉบับถัดไป`;
    } else if (kind === "remaining" && deposit > 0) {
      extra = `4. ใบแจ้งหนี้ฉบับนี้เรียกเก็บยอดคงเหลือ หลังหักเงินมัดจำที่ชำระแล้ว ${fmtInvoiceBaht(deposit)} บาท `
            + `จากยอดรวม ${fmtInvoiceBaht(grandTotal)} บาท คงเหลือเรียกเก็บ ${fmtInvoiceBaht(remaining)} บาท`;
    }
    setRemarksText(extra ? baseText + "\n" + extra : baseText);
  }, [kind, deposit, touched]);

  const dueAmount = kind === "deposit" ? deposit : (kind === "remaining" ? remaining : null);
  const dueLabel = kind === "deposit" ? "ยอดมัดจำที่เรียกเก็บ" : (kind === "remaining" ? "ยอดคงเหลือที่เรียกเก็บ" : null);
  const needDeposit = kind !== "full" && deposit <= 0;

  const confirm = () => {
    if (needDeposit) return;
    onConfirm({ remarks: remarksText.split("\n"), dueAmount, dueLabel });
  };

  const opts = [
    { v: "full", label: "เต็มจำนวน", desc: "เรียกเก็บยอดเต็มตามใบเสนอราคา" },
    { v: "deposit", label: "เรียกเก็บมัดจำ", desc: "แจ้งหนี้บางส่วนก่อน ส่วนที่เหลือแจ้งทีหลัง" },
    { v: "remaining", label: "เรียกเก็บยอดคงเหลือ", desc: "หักมัดจำที่ชำระแล้วออกจากยอดรวม" },
  ];

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onCancel(); }} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 2100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div style={{ background: "#fff", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 480, padding: 18, maxHeight: "92vh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 3 }}>🧾 ตั้งค่าใบแจ้งหนี้</div>
        <div style={{ fontSize: 12.5, color: "#6b7280", marginBottom: 14 }}>ยอดรวมในใบเสนอราคา: {fmtInvoiceBaht(grandTotal)} บาท</div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>ประเภทใบแจ้งหนี้</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {opts.map(o => (
            <button key={o.v} onClick={() => setKind(o.v)} style={{
              textAlign: "left", padding: "10px 12px", borderRadius: 10, fontFamily: "inherit", cursor: "pointer",
              border: kind === o.v ? "2px solid var(--g-600,#1f7f44)" : "1.5px solid #d1d5db",
              background: kind === o.v ? "#f0fdf4" : "#fff",
            }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{o.label}</div>
              <div style={{ fontSize: 11.5, color: "#6b7280" }}>{o.desc}</div>
            </button>
          ))}
        </div>

        {kind !== "full" && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>
              ยอดมัดจำ (บาท) <span style={{ color: "#dc2626" }}>*</span>
            </div>
            <input type="number" value={depositStr} onChange={e => setDepositStr(e.target.value)}
              placeholder="0" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #d1d5db", fontSize: 15, marginBottom: 10, boxSizing: "border-box" }} />
            <div style={{ fontSize: 12.5, color: "#6b7280", marginBottom: 14 }}>
              {kind === "deposit"
                ? `เรียกเก็บ ${fmtInvoiceBaht(deposit)} บาท · เหลืออีก ${fmtInvoiceBaht(remaining)} บาท`
                : `เรียกเก็บ ${fmtInvoiceBaht(remaining)} บาท (หลังหักมัดจำ ${fmtInvoiceBaht(deposit)} บาท)`}
            </div>
          </>
        )}

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>หมายเหตุ (แก้ไขได้)</div>
        <textarea value={remarksText} onChange={e => { setRemarksText(e.target.value); setTouched(true); }}
          style={{ width: "100%", minHeight: 130, padding: 11, borderRadius: 10, border: "1.5px solid #d1d5db", fontFamily: "inherit", fontSize: 13, marginBottom: 14, boxSizing: "border-box", resize: "vertical" }} />

        <div style={{ display: "flex", gap: 9 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "13px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>ยกเลิก</button>
          <button onClick={confirm} disabled={needDeposit} style={{
            flex: 2, padding: "13px", borderRadius: 10, border: "none", fontFamily: "inherit",
            background: "var(--g-600,#1f7f44)", color: "#fff", fontWeight: 800, fontSize: 15,
            cursor: needDeposit ? "default" : "pointer", opacity: needDeposit ? .5 : 1,
          }}>🖨️ พิมพ์ใบแจ้งหนี้</button>
        </div>
      </div>
    </div>
  );
}

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

  // ผู้ทำใบเสนอราคา — มาจากบัญชีที่ล็อกอินเสมอ ไม่ให้พิมพ์เอง (กันพิมพ์ชื่อคนอื่นผิดคน)
  // server จะทับด้วยชื่อจาก session อีกชั้นตอนบันทึกจริงอยู่แล้ว อันนี้แค่โชว์ผลให้ตรงกันตั้งแต่จอ
  const salesRep = window._currentUserName || sessionStorage.getItem("dmj_role") || "";
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
  const [printReq, setPrintReq] = uS(0);
  const [printDocType, setPrintDocType] = uS("quotation"); // "quotation" | "invoice" — เอกสารหน้าตาเดียวกัน แค่เปลี่ยนป้าย
  const [invoiceModal, setInvoiceModal] = uS(false);        // เปิด InvoiceOptionsModal ก่อนพิมพ์ใบแจ้งหนี้
  const [invoiceExtra, setInvoiceExtra] = uS(null);         // {remarks, dueAmount, dueLabel} จาก modal

  uE(() => {
    if (printReq <= 0) return;
    setPosPrintPageSize("a4");
    window.print();
    const onAfter = () => { setPosPrintPageSize("a4"); window.removeEventListener("afterprint", onAfter); };
    window.addEventListener("afterprint", onAfter);
  }, [printReq]);
  function doPrint(docType) { setPrintDocType(docType || "quotation"); setPrintReq(n => n + 1); }

  const md = Math.max(0, parseFloat(manualDiscount) || 0);
  const totals = uM(() => computeBillTotals(cart, { manualDiscount: md }), [cart, md]);

  // หมวด Made to Order/จัดแบบพิเศษ — ขึ้นชิปแรกสุดเสมอ (เจ้าของขอ: หามุ่งงานพิเศษบ่อย
  // สินค้าชื่อคล้ายกันเยอะ อยากเห็นหมวดนี้ก่อนหมวดอื่นไม่ต้องไล่หา) ไม่รวม "อุปกรณ์สำนักงาน"
  // (อยู่ใน BILL_EXCLUDE_CAT_KEYWORDS เดียวกันแต่เป็นหมวดคนละความหมาย)
  function isMtoCat(cat) {
    const c = String(cat || "").toLowerCase();
    return c.indexOf("made to order") >= 0 || c.indexOf("จัดแบบพิเศษ") >= 0;
  }
  const cats = uM(() => {
    const m = {};
    products.forEach(p => { const c = (p.category || "อื่นๆ").trim(); m[c] = (m[c] || 0) + 1; });
    return Object.keys(m).sort((a, b) => {
      const am = isMtoCat(a), bm = isMtoCat(b);
      if (am !== bm) return am ? -1 : 1;
      return m[b] - m[a];
    });
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

  // เสนอ MTO หลายรายการในใบเดียว — กด "+" ที่แถว MTO เพื่อเพิ่มอีกแถว โดยระบบเลือก SKU
  // ถัดไปในหมวดเดียวกันที่ยังไม่อยู่ในรายการให้เอง (ไม่ต้องไล่หาเอง เพราะสินค้ากลุ่มนี้
  // ชื่อคล้ายกันเยอะ) ชื่อ/ราคา/จำนวน ยังแก้ได้ตามปกติหลังเพิ่ม
  function addNextMto(item) {
    const inCart = new Set(cart.map(c => c.sku));
    const nextP = products.find(p => (p.category || "").trim() === item.category && !inCart.has(p.sku));
    if (!nextP) { showToast("warn", "ไม่มี SKU ว่างเหลือในหมวดนี้แล้ว", "🔍"); return; }
    addToCart(nextP);
  }

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

  // กล้องสแกน (ScanButton จาก views-main.jsx) — ผลลัพธ์เป็น sku ตัวใหญ่แล้ว
  function handleCameraScan(sku) {
    const hit = products.find(p => String(p.sku || "").toUpperCase() === sku);
    if (!hit) { showToast("warn", "ไม่พบสินค้า: " + sku, "🔍"); return; }
    const idx = cart.findIndex(c => c.sku === hit.sku);
    if (idx >= 0) patchItem(idx, { qty: (Number(cart[idx].qty) || 0) + 1 });
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
    // salesRep ไม่โหลดจากร่างเก่า — ยึดชื่อคนที่ล็อกอินอยู่ตอนนี้เสมอ (ใครหยิบร่างมาทำต่อ = คนนั้นเป็นผู้ทำ)
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
    if (!salesRep.trim()) { showToast("warn", "ไม่พบชื่อผู้ทำใบเสนอราคา — กรุณาล็อกอินใหม่", "🧑‍💼"); return; }
    setSaving(true);
    const r = await syncCreateQuotation(buildQuotePayload());
    setSaving(false);
    if (!r.success) { showToast("error", "สร้างใบเสนอราคาไม่สำเร็จ: " + (r.error || ""), "❌"); return; }
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
    // หมายเหตุ: QuotationPrintDoc ต้องอยู่นอก div ที่จำกัด maxWidth (480px เพื่อความสวยงามบนจอ)
    // เพราะ .quote-print-page บังคับ width:210mm ตอนพิมพ์ — ถ้าซ้อนอยู่ใน maxWidth เดิม
    // เบราว์เซอร์จะบีบเนื้อหาพิมพ์ให้แคบลงไม่เต็มหน้า A4 (เห็นเป็นคอลัมน์แคบชิดซ้าย)
    return (
      <React.Fragment>
        <div className="no-print" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, margin: "0 auto" }}>
          <Card padding={true}>
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 44 }}>🎉</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>สร้างใบเสนอราคาสำเร็จ</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--g-700,#166534)", marginTop: 6, fontFamily: "monospace" }}>{result.quotationNumber || "—"}</div>
              <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>ยอดสุทธิ {fmtBfull(result.totals ? result.totals.grandTotal : totals.grandTotal)}</div>
            </div>
          </Card>
          <button onClick={() => doPrint("quotation")} style={{ padding: 14, borderRadius: 10, border: "none", background: "var(--g-600,#1f7f44)", color: "#fff", fontWeight: 700 }}>🖨️ พิมพ์ใบเสนอราคา (A4)</button>
          <button onClick={() => setInvoiceModal(true)} style={{ padding: 14, borderRadius: 10, border: "1px solid var(--g-600,#1f7f44)", background: "#fff", color: "var(--g-700,#166534)", fontWeight: 700 }}>🧾 พิมพ์ใบแจ้งหนี้ (A4)</button>
          <button onClick={() => { resetAll(); }} style={{ padding: 14, borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700 }}>📝 สร้างใบใหม่</button>
          {onBack && <button onClick={onBack} style={{ padding: 14, borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700 }}>← กลับไปหน้าติดตามสถานะ</button>}
          <Toast toast={toast} onClose={hideToast}/>
        </div>
        {invoiceModal && (
          <InvoiceOptionsModal grandTotal={(result.totals || totals).grandTotal}
            onCancel={() => setInvoiceModal(false)}
            onConfirm={(extra) => { setInvoiceExtra(extra); setInvoiceModal(false); doPrint("invoice"); }}/>
        )}
        <QuotationPrintDoc quotationNumber={result.quotationNumber} items={cart} customer={cust}
          remarks={printDocType === "invoice" ? (invoiceExtra ? invoiceExtra.remarks : INVOICE_DEFAULT_REMARKS) : remarks}
          salesRep={salesRep} totals={result.totals || totals} docType={printDocType}
          dueAmount={printDocType === "invoice" && invoiceExtra ? invoiceExtra.dueAmount : null}
          dueLabel={printDocType === "invoice" && invoiceExtra ? invoiceExtra.dueLabel : null}/>
      </React.Fragment>
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
        <div style={{ display: "flex", gap: 6 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={handleScanEnter}
            placeholder="ค้นหาชื่อสินค้า/รหัส (พิมพ์ได้หลายคำ) หรือสแกนบาร์โค้ด" style={{ ...inp, flex: 1 }}/>
          {typeof ScanButton === "function" && <ScanButton onScan={handleCameraScan} size={38}/>}
        </div>
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
                    ? <img src={p.imageUrl} loading="lazy" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain", borderRadius: 5, background: "#f3f4f6" }} onError={e => { e.target.style.display = "none"; }}/>
                    : <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 5, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📦</div>}
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
                      <td style={{ padding: "8px 6px", textAlign: "center", whiteSpace: "nowrap" }}>
                        {isMtoCat(it.category) && (
                          <button onClick={() => addNextMto(it)} title="เพิ่มรายการ Made to Order ถัดไป" style={{ border: "none", background: "none", color: "var(--g-600,#1f7f44)", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>➕</button>
                        )}
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
        <FieldLabel_>ชื่อเซล</FieldLabel_>
        {/* มาจากบัญชีที่ล็อกอินเสมอ ไม่ให้พิมพ์เอง — กันพิมพ์ชื่อคนอื่นผิดคนบนเอกสารที่ส่งลูกค้า */}
        <div style={{ ...inp, background: "#f3f4f6", color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
          👤 {salesRep || "ไม่พบชื่อ — กรุณาล็อกอินใหม่"}
        </div>
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

// ใบเสนอราคา A4 สำหรับพิมพ์ (โชว์เฉพาะตอน print ผ่าน CSS .pos-print-area — mirror PosReceipt)
// items = [{sku,name,qty,price,category}] ราคาปลีก/ชิ้น — คิดส่วนลดต่อหน่วยแบบเฉลี่ยเหมือนฝั่ง server
// docType="invoice" → หน้าตาเอกสารเหมือนใบเสนอราคาทุกอย่าง เปลี่ยนป้ายหัวเอกสาร — remarks ของ
// ใบแจ้งหนี้ (default = INVOICE_DEFAULT_REMARKS หรือแก้ไขแล้วจาก InvoiceOptionsModal) ผู้เรียกส่งมาตรงๆ
// dueAmount/dueLabel (ไม่บังคับ) = กล่องเน้นยอดที่เรียกเก็บจริง เมื่อพิมพ์แบบมัดจำ/ยอดคงเหลือ
function QuotationPrintDoc({ quotationNumber, items, customer, remarks, salesRep, totals, docType, dueAmount, dueLabel }) {
  const docLabel = docType === "invoice" ? "ใบแจ้งหนี้" : "ใบเสนอราคา";
  const effRemarks = remarks || [];
  const gross = (totals.retailEligible || 0) + (totals.retailExcluded || 0);
  const factor = gross > 0 ? totals.grandTotal / gross : 1;
  const rows = (items || []).map(it => {
    const price = Number(it.price) || 0, qty = Number(it.qty) || 0;
    const finalUnit = price * factor;
    return { sku: it.sku, name: it.name, qty, price, discUnit: Math.max(0, price - finalUnit), amount: finalUnit * qty };
  });
  const totalUnits = rows.reduce((s, r) => s + r.qty, 0);
  const POS_ROWS_PER_PAGE = 20;
  const pages = [];
  for (let i = 0; i < rows.length; i += POS_ROWS_PER_PAGE) pages.push(rows.slice(i, i + POS_ROWS_PER_PAGE));
  if (pages.length === 0) pages.push([]);
  const cell = { padding: "4px 6px", borderRight: "0.5px solid #999", fontSize: 12 };
  const boxCell = { padding: "3px 8px", border: "0.5px solid #999" };
  const num = (n) => (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const docDate = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
  const cust = customer || {};

  return (
    <div className="quote-print-area">
      {pages.map((pageRows, pi) => {
        const isLast = pi === pages.length - 1;
        const startIdx = pi * POS_ROWS_PER_PAGE;
        return (
          <div key={pi} className="quote-print-page" style={{ color: "#111", fontFamily: "inherit", display: "flex", flexDirection: "column" }}>
            {/* ── หัวเอกสาร ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ maxWidth: "62%" }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{POS_SELLER.name}</div>
                <div style={{ fontSize: 11 }}>ที่อยู่: {POS_SELLER.address}</div>
                <div style={{ fontSize: 11 }}>โทรศัพท์: {POS_SELLER.phone} โทรสาร: {POS_SELLER.fax} อีเมล: {POS_SELLER.email}</div>
                <div style={{ fontSize: 11 }}>เลขประจำตัวผู้เสียภาษี: {POS_SELLER.taxId}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 800, border: "1px solid #000", padding: "3px 8px", borderRadius: 4 }}>{docLabel}</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>วันที่ : {docDate}</div>
                <div style={{ fontSize: 11 }}>เลขที่เอกสาร : {quotationNumber || "—"}</div>
                {pages.length > 1 ? <div style={{ fontSize: 11 }}>หน้า {pi + 1}/{pages.length}</div> : null}
              </div>
            </div>
            {/* ── กล่องลูกค้า (หน้าแรกเท่านั้น) — ตารางจริง (border-collapse) มีเส้นตาราง
                ครบทุกแถว/คอลัมน์ จัดตำแหน่งตามเอกสาร ZORT ต้นฉบับที่เจ้าของอ้างอิงมาเป๊ะ
                (QT-202607023.pdf) — "รหัสผู้ติดต่อ" เว้นว่างเสมอ (ไม่มี field นี้ในระบบเรา) ── */}
            {pi === 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #999", marginBottom: 8, fontSize: 11.5 }}>
                <tbody>
                  <tr>
                    <td style={boxCell}><b>รหัสผู้ติดต่อ:</b></td>
                    <td style={boxCell}><b>เลขประจำตัวผู้เสียภาษี:</b> {cust.taxId || "—"}</td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={boxCell}><b>นามผู้ติดต่อ:</b> {cust.name || "—"}</td>
                  </tr>
                  {(cust.branch || cust.branchNo) && (
                    <tr>
                      <td style={boxCell}><b>ชื่อสาขา:</b> {cust.branch || "—"}</td>
                      <td style={boxCell}><b>สาขาที่:</b> {cust.branchNo || "—"}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={2} style={boxCell}><b>ที่อยู่:</b> {cust.address || "—"}</td>
                  </tr>
                  <tr>
                    <td style={boxCell}><b>โทรศัพท์:</b> {cust.phone || "—"}</td>
                    <td style={boxCell}><b>อีเมล:</b> {cust.email || "—"}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {/* ── ตารางสินค้า — กรอบเดียวกันยืดเต็มพื้นที่ที่เหลือ (flex:1) ให้เห็นเป็น
                "ช่องสี่เหลี่ยม" ว่างต่อจากรายการจริง เหมือนเอกสาร ZORT ต้นฉบับที่เจ้าของ
                อ้างอิงมา (QT-202607023.pdf) — ไม่ใช่ดันช่องเซ็นลงล่างสุดแบบเดิมอีกต่อไป ──*/}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", border: "0.5px solid #999" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6", borderBottom: "0.5px solid #999" }}>
                    <th style={{ ...cell, width: 28, textAlign: "center" }}>#</th>
                    <th style={{ ...cell, width: 80, textAlign: "left" }}>รหัสสินค้า</th>
                    <th style={{ ...cell, textAlign: "left" }}>ชื่อสินค้า</th>
                    <th style={{ ...cell, width: 60, textAlign: "center" }}>จำนวน</th>
                    <th style={{ ...cell, width: 70, textAlign: "right" }}>มูลค่าต่อหน่วย</th>
                    <th style={{ ...cell, width: 60, textAlign: "right" }}>ส่วนลดต่อหน่วย</th>
                    <th style={{ ...cell, width: 80, textAlign: "right", borderRight: "none" }}>รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "0.5px solid #e5e7eb" }}>
                      <td style={{ ...cell, textAlign: "center" }}>{startIdx + i + 1}</td>
                      <td style={cell}>{r.sku}</td>
                      <td style={cell}>{r.name}</td>
                      <td style={{ ...cell, textAlign: "center" }}>{r.qty} ชิ้น</td>
                      <td style={{ ...cell, textAlign: "right" }}>{num(r.price)}</td>
                      <td style={{ ...cell, textAlign: "right" }}>{r.discUnit > 0 ? num(r.discUnit) : "-"}</td>
                      <td style={{ ...cell, textAlign: "right", borderRight: "none" }}>{num(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ flex: 1 }}></div>
            </div>
            {/* ── "รวม" + สรุปยอด — คำนวณตรงกับตรรกะส่วนลดขั้นบันไดจริง (computeBillTotals)
                ตรวจสอบเทียบกับ QT-202607023.pdf แล้วตัวเลขตรงกันทุกบรรทัด:
                "รวม" = หลังหักขายส่ง 20% (ถ้าเข้าเงื่อนไข) ก่อนหักขั้นบันได
                "ส่วนลด" ในกล่องสรุป = tierRate เป็น % (ไม่ใช่บาท) — ไม่ใช่ manualDiscount
                totals จาก getQuotationForPrint (พิมพ์ย้อนหลัง) ไม่มี wholesaleSubtotal/tierRate
                (ไม่รู้ breakdown เดิม) → fallback ไปใช้ grandTotal ตรงๆ ไม่โชว์แถวส่วนลด ── */}
            {isLast && (() => {
              const hasBreakdown = totals.wholesaleSubtotal != null;
              const rowmAmount = hasBreakdown ? totals.wholesaleSubtotal + (totals.retailExcluded || 0) : totals.grandTotal;
              const tierRate = hasBreakdown ? (totals.tierRate || 0) : 0;
              const manualDiscount = totals.manualDiscount || 0;
              return (
                <React.Fragment>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4, fontSize: 12, fontWeight: 700 }}>
                    <span style={{ minWidth: 240, display: "flex", justifyContent: "space-between" }}><span>รวม</span><span>{num(rowmAmount)} บาท</span></span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, gap: 12 }}>
                    <div style={{ fontSize: 11, maxWidth: "55%" }}>
                      {(effRemarks || []).filter(Boolean).length > 0 && (
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 2 }}>หมายเหตุ</div>
                          {/* ไม่เติมเลขข้อให้เอง — ผู้ใช้พิมพ์เลขข้อไว้ในเนื้อหาแต่ละบรรทัดเองอยู่แล้ว
                              (เจ้าของแจ้ง 2026-07-30: เติมซ้ำเป็น "1. 1. ..." ) */}
                          {(effRemarks || []).filter(Boolean).map((r, i) => <div key={i}>{r}</div>)}
                        </div>
                      )}
                      <div style={{ marginTop: 6 }}>สินค้าทั้งหมด {totalUnits} หน่วย</div>
                      <div>({bahtText(totals.grandTotal)})</div>
                    </div>
                    <div style={{ minWidth: 240, fontSize: 12, border: "1px solid #999", borderRadius: 4, padding: "6px 8px" }}>
                      {tierRate > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>ส่วนลด</span><span>{(tierRate * 100).toFixed(2)}%</span></div>
                      )}
                      {manualDiscount > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>ส่วนลดเพิ่มเติม</span><span>{num(manualDiscount)} บาท</span></div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>มูลค่ารวมก่อนภาษี</span><span>{num(totals.preVat)} บาท</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>ภาษีมูลค่าเพิ่ม (7%)</span><span>{num(totals.vat)} บาท</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontWeight: 800, fontSize: 14, borderTop: "1px solid #000", marginTop: 2, background: "#f3f4f6" }}><span>มูลค่ารวมสุทธิ</span><span>{num(totals.grandTotal)} บาท</span></div>
                      {/* ยอดที่เรียกเก็บจริงในใบแจ้งหนี้ฉบับนี้ — โผล่เฉพาะพิมพ์แบบมัดจำ/ยอดคงเหลือ
                          (dueAmount==null = เต็มจำนวน ไม่ต้องมีกล่องนี้ซ้ำกับ "มูลค่ารวมสุทธิ") */}
                      {dueAmount != null && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 2px", marginTop: 4, borderTop: "2px solid #f59e0b", fontWeight: 800, fontSize: 15, color: "#92400e" }}>
                          <span>{dueLabel || "ยอดที่เรียกเก็บ"}</span><span>{num(dueAmount)} บาท</span>
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })()}
            {/* ── ช่องเซ็น (หน้าสุดท้ายเท่านั้น) — ตารางสินค้าด้านบนยืดเต็มพื้นที่แล้ว
                (flex:1) ไม่ต้องดัน marginTop:"auto" ที่นี่อีก แค่เว้นระยะปกติต่อจากกล่อง
                สรุปยอด เหมือนเอกสาร ZORT ต้นฉบับ · ผู้เสนอราคาอยู่ขวา ผู้อนุมัติสั่งซื้ออยู่
                ซ้าย (สลับตำแหน่งตามที่เจ้าของขอ) */}
            {isLast && (
              <div style={{ display: "flex", justifyContent: "space-around", marginTop: 32, paddingTop: 24, fontSize: 11, textAlign: "center" }}>
                {["ผู้อนุมัติสั่งซื้อ", "ผู้เสนอราคา"].map(l => (
                  <div key={l} style={{ width: "35%" }}>
                    <div style={{ borderBottom: "0.5px dotted #000", marginBottom: 4, height: 28 }}></div>
                    {l}
                    <div style={{ color: "#555", marginTop: 2 }}>วันที่ {docDate}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

if (typeof module !== 'undefined') module.exports = { QUOTE_DEFAULT_REMARKS };
