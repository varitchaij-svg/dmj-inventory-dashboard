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
// ── sync helper: แก้ไขใบเสนอราคาเดิมใน ZORT (ใบที่ลูกค้ายังไม่อนุมัติ) ──
async function syncEditQuotation(quote) {
  if (!SHEET_DEPLOY_URL) return { success: false, error: "ยังไม่ได้เชื่อมต่อ Sheet" };
  try {
    const res = await dmjFetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ editQuotation: true, quote, actor: window._currentUser || sessionStorage.getItem("dmj_role") || "saler" }),
    });
    return await res.json(); // { success, data:{quotationId, quotationNumber, totals, infoWarning} }
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
// ── sync helper: ออกเลขที่ใบแจ้งหนี้ของเราเอง (IVB-yyyyMM###) ผูกกับเลขที่ใบเสนอราคาต้นทาง —
// พิมพ์ซ้ำใบเดิมได้เลขเดิมเสมอ (idempotent ฝั่ง backend)
async function syncGetInvoiceNumber(quotationNumber) {
  if (!SHEET_DEPLOY_URL) return { ok: false, error: "ยังไม่ได้เชื่อมต่อ Sheet" };
  try {
    const res = await dmjFetch(SHEET_DEPLOY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ getInvoiceNumber: true, quotationNumber, actor: window._currentUser || sessionStorage.getItem("dmj_role") || "saler" }),
    });
    return await res.json().catch(() => ({ ok: false, error: "อ่านผลลัพธ์ไม่ได้" })); // { ok, invoiceNumber, reused }
  } catch (err) { return { ok: false, error: err.message }; }
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

function fmtInvoiceBaht(n) {
  return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── ชื่อไฟล์ตอนผู้ใช้เลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ ──
// รูปแบบที่เจ้าของขอ: "ใบแจ้งหนี้ยอดมัดจำ _ IVB-202608002" (ชื่อเอกสาร + เลขที่เอกสาร)
// เบราว์เซอร์ตั้งชื่อไฟล์ PDF จาก `document.title` → เปลี่ยน title ชั่วคราวก่อนสั่งพิมพ์
// **ทำแบบนี้แทนการ rasterize DOM ด้วย html2canvas/jsPDF โดยตั้งใจ**: เลย์เอาต์ A4 จริงของ
// เอกสาร (width 210mm / min-height 297mm / flex column) อยู่ใน `@media print` ทั้งชุด และ
// `.quote-print-area` ถูก `display:none` บนจอ — จับภาพจากจอจึงได้เอกสารคนละหน้าตากับที่พิมพ์
// จริง อีกทั้งไม่ต้องเพิ่ม CDN (repo นี้เคยเจอ CDN ไม่เสถียรบน iPad/เน็ตร้านมาแล้ว จน
// ต้อง self-host html2canvas)
// ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ทิ้ง — เลขที่เอกสาร/ชื่อมาจากผู้ใช้และ backend ได้ทั้งคู่
function docFileName(docTitle, docNumber) {
  const clean = (s) => String(s == null ? "" : s).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  const t = clean(docTitle), n = clean(docNumber);
  if (t && n) return t + " _ " + n;
  return t || n;
}

// ── วันที่บนหัวเอกสาร ──
// รับ "yyyy-MM-dd" จากช่องเลือกวันที่ (InvoiceOptionsModal) · ไม่ส่งมา/รูปแบบไม่ตรง = ใช้วันนี้
// ⚠️ แยก y/m/d เป็นตัวเลขเองแทน `new Date("yyyy-MM-dd")` เพราะรูปแบบนั้นถูกตีเป็น **UTC**
// → เครื่องที่ timezone ติดลบได้วันที่เลื่อนไป 1 วัน (ญาติกับบทเรียนข้อ 11)
// th-TH ให้ปี พ.ศ. อยู่แล้ว → "7 สิงหาคม 2569"
function docDateLabel(ymd) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(ymd == null ? "" : ymd).trim());
  let d = null;
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
    const cand = new Date(y, mo - 1, da);
    // กันวันที่ที่ไม่มีจริง (เช่น 2026-02-31 ที่ JS จะเลื่อนไปเป็น 3 มี.ค. เงียบ ๆ)
    if (cand.getFullYear() === y && cand.getMonth() === mo - 1 && cand.getDate() === da) d = cand;
  }
  return (d || new Date()).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

// ── สั่งพิมพ์เอกสาร A4 พร้อมตั้งชื่อไฟล์ ──
// ใช้ร่วมกันทั้ง QuotationFormView (views-quote.jsx) และ QuoteFollowupView (views-analytics.jsx)
// — เดิม effect พิมพ์ถูก copy ไว้สองที่ · คืน document.title เดิมเสมอตอน afterprint
// ⚠️ ผูก listener **ก่อน** window.print() (เดิมผูกทีหลัง) ไม่งั้นเบราว์เซอร์ที่ยิง afterprint
// เร็วกว่าจังหวะผูกจะทำให้ title ค้างเป็นชื่อไฟล์ไปทั้งแอป
function runQuoteDocPrint(fileName, isMobile) {
  const prevTitle = document.title;
  if (fileName) document.title = fileName;
  const onAfter = () => {
    document.title = prevTitle;
    setPosPrintPageSize("a4");
    document.body.classList.remove("quote-print-mobile");
    window.removeEventListener("afterprint", onAfter);
  };
  window.addEventListener("afterprint", onAfter);
  setPosPrintPageSize("a4");
  document.body.classList.toggle("quote-print-mobile", !!isMobile);
  window.print();
}

// ป้ายหัวเอกสาร 3 แบบ — ต้องตรงกับ kind ที่ InvoiceOptionsModal ส่งมา
const INVOICE_KIND_LABEL = { full: "ใบแจ้งหนี้", deposit: "ใบแจ้งหนี้ยอดมัดจำ", remaining: "ใบแจ้งหนี้ยอดคงเหลือ" };

// หมายเหตุของใบแจ้งหนี้ — คนละชุดกับใบเสนอราคา · ข้อความตามไฟล์ต้นแบบที่เจ้าของส่งมา (2026-08-06)
// **เนื้อหาเปลี่ยนตามหัวข้อเอกสาร**: เต็มจำนวนไม่มีข้อ 1 เรื่องมัดจำ ส่วนยอดมัดจำ/ยอดคงเหลือมีเงื่อนไข
// เฉพาะของตัวเองเป็นข้อ 1 แล้วข้อที่เหลือเลื่อนเลขตาม — เลขข้อฝังในเนื้อหาเอง (QuotationPrintDoc
// ไม่เติมเลขให้) จึงต้องประกอบใหม่ทุกครั้ง ห้าม hard-code เป็น array ตายตัวเหมือนเดิม
// บรรทัดที่ไม่มีเลขนำ = บรรทัดต่อเนื่องของข้อก่อนหน้า (ตามที่เจ้าของจัดบรรทัดไว้ในไฟล์)
function buildInvoiceRemarks(kind, o) {
  const opt = o || {};
  const grandTotal = Number(opt.grandTotal) || 0;
  const deposit = Number(opt.deposit) || 0;
  const remaining = Number(opt.remaining) || 0;
  const lines = [];
  if (kind === "deposit") {
    lines.push("1. เมื่อบริษัทได้รับชำระค่ามัดจำเรียบร้อยแล้ว บริษัทจะเริ่มดำเนินการผลิตสินค้า");
    lines.push("โดยยอดค่ามัดจำจะนำไปหักจากยอดค่าสินค้าเมื่อส่งมอบสินค้า คงเหลือยอดที่ต้องชำระจำนวน " + fmtInvoiceBaht(remaining) + " บาท");
  } else if (kind === "remaining") {
    lines.push("1. ใบแจ้งหนี้ฉบับนี้เรียกเก็บยอดคงเหลือ หลังหักเงินมัดจำที่ได้รับชำระแล้วจำนวน " + fmtInvoiceBaht(deposit) + " บาท");
    lines.push("จากยอดรวมทั้งสิ้น " + fmtInvoiceBaht(grandTotal) + " บาท คงเหลือยอดที่ต้องชำระจำนวน " + fmtInvoiceBaht(remaining) + " บาท");
  }
  const n = lines.length ? 2 : 1;   // ข้อถัดไปเริ่มที่ 2 ถ้ามีข้อ 1 เฉพาะแบบแล้ว
  lines.push(n + ". กรุณาตรวจสอบรายละเอียดในใบแจ้งหนี้ หากพบข้อผิดพลาด โปรดแจ้งกลับภายใน 3 วันทำการ");
  lines.push("บริษัทขอสงวนสิทธิ์ในการเปลี่ยนแปลงราคา กรณียังไม่ได้รับชำระเงิน");
  lines.push((n + 1) + ". ราคาดังกล่าวยังไม่รวมค่าขนส่ง โดยค่าขนส่งจะคำนวณเพิ่มเติมตามระยะทางและวิธีการจัดส่งที่ลูกค้าเลือก");
  lines.push((n + 2) + ". กรุณาชำระเงินโดยโอนเข้าบัญชี ธนาคารกสิกรไทย ชื่อบัญชี บริษัท ดี.ยูนิตี้ จำกัด ประเภทบัญชี ออมทรัพย์");
  lines.push("สาขา เทสโก้ โลตัส ศาลายา เลขที่บัญชี 050-3-34251-0");
  return lines;
}

// fallback เมื่อยังไม่ได้ผ่าน InvoiceOptionsModal (เช่นพิมพ์ซ้ำหลัง state ถูกล้าง)
const INVOICE_DEFAULT_REMARKS = buildInvoiceRemarks("full", {});

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
  const [poNumber, setPoNumber] = uS("");   // เลขที่ใบสั่งซื้อของลูกค้า → "เอกสารอ้างอิง1" บนใบแจ้งหนี้
  const [docDate, setDocDate] = uS(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const deposit = Math.max(0, Math.min(Number(depositStr) || 0, grandTotal));
  const remaining = Math.max(0, grandTotal - deposit);

  const [remarksText, setRemarksText] = uS(() => INVOICE_DEFAULT_REMARKS.join("\n"));
  const [touched, setTouched] = uS(false);

  // หมายเหตุเปลี่ยนตามหัวข้อเอกสารที่เลือก (เต็มจำนวน/มัดจำ/ยอดคงเหลือ) — ประกอบใหม่ทั้งชุด
  // ไม่ใช่ต่อท้ายข้อ 4 แบบเดิม เพราะเลขข้อของข้อที่เหลือต้องเลื่อนตามด้วย
  uE(() => {
    if (touched) return;
    setRemarksText(buildInvoiceRemarks(kind, { grandTotal, deposit, remaining }).join("\n"));
  }, [kind, deposit, touched]);

  const dueAmount = kind === "deposit" ? deposit : (kind === "remaining" ? remaining : null);
  const dueLabel = kind === "deposit" ? "ยอดมัดจำที่เรียกเก็บ" : (kind === "remaining" ? "ยอดคงเหลือที่เรียกเก็บ" : null);
  const needDeposit = kind !== "full" && deposit <= 0;

  const confirm = () => {
    if (needDeposit) return;
    onConfirm({ kind, remarks: remarksText.split("\n"), dueAmount, dueLabel, deposit, poNumber: poNumber.trim(), docDate });
  };

  const opts = [
    { v: "full", label: "ใบแจ้งหนี้ (เต็มจำนวน)", desc: "เรียกเก็บยอดเต็มตามใบเสนอราคา" },
    { v: "deposit", label: "ใบแจ้งหนี้ยอดมัดจำ", desc: "แจ้งหนี้บางส่วนก่อน ส่วนที่เหลือแจ้งทีหลัง" },
    { v: "remaining", label: "ใบแจ้งหนี้ยอดคงเหลือ", desc: "หักมัดจำที่ชำระแล้วออกจากยอดรวม" },
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
            {/* ชิป % — มัดจำมักคิดเป็นเปอร์เซ็นต์ (50% เป็นค่าที่ใช้บ่อยสุด) กดแล้วเติมยอดบาทให้เลย
                ป้าย "สรุปยอดเรียกเก็บค่ามัดจำ 50%" บนเอกสารคำนวณกลับจากยอดบาทอีกที */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[30, 50].map(pct => (
                <button key={pct} onClick={() => setDepositStr(String(Math.round(grandTotal * pct) / 100))} style={{
                  padding: "6px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", background: "#fff",
                  fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                }}>{pct}%</button>
              ))}
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

        {/* เลขที่ใบสั่งซื้อของลูกค้า — ขึ้นเป็น "เอกสารอ้างอิง1" บนใบแจ้งหนี้ (เลขใบเสนอราคาเลื่อนไปเป็น
            อ้างอิง2 ตามไฟล์ต้นแบบ) · ไม่กรอกก็ได้ → เลขใบเสนอราคาขึ้นเป็นอ้างอิง1 แทน */}
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>เลขที่ใบสั่งซื้อลูกค้า / PO <span style={{ fontWeight: 500, color: "#6b7280" }}>(ไม่บังคับ)</span></div>
        <input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="เช่น PO148983"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #d1d5db", fontSize: 15, marginBottom: 14, boxSizing: "border-box", fontFamily: "inherit" }} />

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>วันที่เอกสาร <span style={{ fontWeight: 500, color: "#6b7280" }}>(ค่าปัจจุบัน)</span></div>
        <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #d1d5db", fontSize: 15, marginBottom: 14, boxSizing: "border-box", fontFamily: "inherit" }} />

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>หมายเหตุ (แก้ไขได้)</div>
        <textarea value={remarksText} onChange={e => { setRemarksText(e.target.value); setTouched(true); }}
          style={{ width: "100%", minHeight: 130, padding: 11, borderRadius: 10, border: "1.5px solid #d1d5db", fontFamily: "inherit", fontSize: 13, marginBottom: 14, boxSizing: "border-box", resize: "vertical" }} />

        {/* ชื่อไฟล์ที่จะได้ตอนเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ — โชว์ให้เห็นก่อนกด
            (เลขที่เอกสารยังไม่ออกจนกว่าจะกดพิมพ์ จึงโชว์เป็นตัวอย่างรูปแบบ) */}
        <div style={{ fontSize: 11.5, color: "#6b7280", marginBottom: 12, lineHeight: 1.5 }}>
          📄 เลือก “บันทึกเป็น PDF” ในหน้าต่างพิมพ์ จะได้ไฟล์ชื่อ<br/>
          <span style={{ fontWeight: 700, color: "#374151" }}>{INVOICE_KIND_LABEL[kind] || "ใบแจ้งหนี้"} _ IVB-…</span>
        </div>

        <div style={{ display: "flex", gap: 9 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "13px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>ยกเลิก</button>
          <button onClick={confirm} disabled={needDeposit} style={{
            flex: 2, padding: "13px", borderRadius: 10, border: "none", fontFamily: "inherit",
            background: "var(--g-600,#1f7f44)", color: "#fff", fontWeight: 800, fontSize: 15,
            cursor: needDeposit ? "default" : "pointer", opacity: needDeposit ? .5 : 1,
          }}>🖨️ พิมพ์{INVOICE_KIND_LABEL[kind] || "ใบแจ้งหนี้"}</button>
        </div>
      </div>
    </div>
  );
}

// เติม "รูป + หมวด" จาก catalog ให้รายการที่โหลดกลับมาจากที่จัดเก็บ (ร่างที่บันทึกไว้)
// ─────────────────────────────────────────────────────────────────────────────
// `buildQuotePayload` เก็บลงร่างแค่ sku/ชื่อ/หมวด/จำนวน/ราคา — **ไม่เก็บ imageUrl โดยตั้งใจ**
// (URL ยาวทำให้ร่างบวม + รูปเปลี่ยนทีหลังได้ ฝังไว้จะค้างรูปเก่า) → ต้องหาใหม่จาก `products`
// ทุกครั้งที่โหลด ไม่งั้น **ทุกแถวกลายเป็นกล่อง 📦 ทั้งที่สินค้ามีรูป** ซึ่งผิดกติกา UI ของโปรเจกต์นี้
// (พนักงานจำสินค้าจากรูป ไม่ใช่รหัส) — เจอจริง ส.ค. 2026 ตอนเจ้าของกดโหลดร่างแล้วรูปหายทั้งใบ
// ⚠️ **ห้ามแตะ price/qty/name ที่นี่** — ร่างเก็บค่าที่ผู้ใช้ตั้ง/แก้เอง ทับเมื่อไหร่ = งานที่ทำไว้หาย
//    (ต่างจากเส้นทาง `editQuote` ที่ **ต้อง** คืนราคาตั้งจาก catalog เพราะราคาที่ ZORT คืนมา
//     เป็นราคาหลังเฉลี่ยส่วนลดแล้ว — คนละเจตนากัน อย่าเอามารวมเป็นฟังก์ชันเดียว)
function quoteHydrateItems_(items, products) {
  if (!Array.isArray(items)) return [];
  const bySku = {};
  (products || []).forEach(p => { bySku[String(p.sku || "").trim().toUpperCase()] = p; });
  return items.map(it => {
    const p = bySku[String(it.sku || "").trim().toUpperCase()];
    if (!p) return it;   // SKU ไม่มีใน catalog แล้ว — คงรายการไว้ตามเดิม ไม่ทิ้งของที่ผู้ใช้ใส่มา
    return Object.assign({}, it, {
      imageUrl: it.imageUrl || p.imageUrl || "",
      category: it.category || p.category || "",
    });
  });
}

// editQuote (ไม่บังคับ) = ใบเสนอราคาเดิมที่จะแก้ไข — ได้จาก getQuotationForPrint + id/number
//   { quotationId, quotationNumber, customer, items, remarks, totals }
// ⚠️ items[].price ที่ได้จาก ZORT เป็น "ราคาหลังเฉลี่ยส่วนลดแล้ว" (createQuotation ส่ง netUnit
// เข้าไป ไม่ใช่ราคาตั้ง) ถ้าโหลดกลับมาตรงๆ แล้วให้ฟอร์มคิดส่วนลดซ้ำ = โดนหักสองเด้ง
// → คืนราคาตั้งจาก catalog (products) ตาม SKU ก่อนเสมอ ถ้าไม่เจอ SKU ค่อย fallback ใช้ราคาจาก ZORT
// (ผู้ใช้แก้ราคาต่อบรรทัดได้อยู่แล้ว + มีแบนเนอร์เตือนให้ตรวจราคาก่อนบันทึก)
function QuotationFormView({ data, role, onBack, onSubmitted, editQuote }) {
  const products = (data && data.products) || [];
  const [toast, showToast, hideToast] = useToast();

  const [cart, setCart] = uS(() => {
    if (!editQuote) return [];
    const bySku = {};
    products.forEach(p => { bySku[String(p.sku || "").trim().toUpperCase()] = p; });
    return (editQuote.items || []).map(it => {
      const p = bySku[String(it.sku || "").trim().toUpperCase()];
      return {
        sku: it.sku, name: it.name,
        qty: Number(it.qty) || 0,
        price: p && Number(p.price) > 0 ? Number(p.price) : (Number(it.price) || 0),
        category: (p && p.category) || it.category || "",
        imageUrl: (p && p.imageUrl) || "",
        _priceFromCatalog: !!(p && Number(p.price) > 0),
      };
    });
  });
  const [search, setSearch] = uS("");
  const [catFilter, setCatFilter] = uS("ทั้งหมด");
  const [catPage, setCatPage] = uS(0);

  const [cust, setCust] = uS(() => Object.assign(
    { name: "", taxId: "", branch: "", branchNo: "", address: "", phone: "", email: "" },
    (editQuote && editQuote.customer) || {}
  ));
  const [custQuery, setCustQuery] = uS("");
  const [custResults, setCustResults] = uS(null);
  const [searching, setSearching] = uS(false);

  // ผู้ทำใบเสนอราคา — มาจากบัญชีที่ล็อกอินเสมอ ไม่ให้พิมพ์เอง (กันพิมพ์ชื่อคนอื่นผิดคน)
  // server จะทับด้วยชื่อจาก session อีกชั้นตอนบันทึกจริงอยู่แล้ว อันนี้แค่โชว์ผลให้ตรงกันตั้งแต่จอ
  const salesRep = window._currentUserName || sessionStorage.getItem("dmj_role") || "";
  const [channel, setChannel] = uS("หน้าร้าน");
  const [remarks, setRemarks] = uS(() =>
    (editQuote && Array.isArray(editQuote.remarks) && editQuote.remarks.length)
      ? editQuote.remarks.slice() : QUOTE_DEFAULT_REMARKS.slice());
  const [manualDiscount, setManualDiscount] = uS("");

  // สินค้าที่กำลังเปิดดูรายละเอียด — เก็บเป็น sku ไม่ใช่ object
  // (เก็บ object ตรง ๆ จะค้างค่าเก่าถ้า products อัปเดตระหว่างเปิดโมดัลอยู่)
  const [detailSku, setDetailSku] = uS(null);

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
  const [invoiceExtra, setInvoiceExtra] = uS(null);         // {remarks, dueAmount, dueLabel, docDate} จาก modal
  const [invoiceNumber, setInvoiceNumber] = uS(null);       // เลขที่ใบแจ้งหนี้ของเราเอง (IVB-yyyyMM###) จาก syncGetInvoiceNumber
  const [invoiceNumberBusy, setInvoiceNumberBusy] = uS(false);
  const [printFileName, setPrintFileName] = uS("");          // ชื่อไฟล์ตอนเลือก "บันทึกเป็น PDF"

  // ⚠️ พิมพ์ผ่าน effect (ไม่พิมพ์ทันทีในตัว handler) เพราะเลขที่ใบแจ้งหนี้/หมายเหตุ/ชนิดเอกสาร
  // เพิ่งถูก setState ไป — DOM ยังเป็นของ render รอบก่อน · effect ทำงานหลัง React commit
  // เอกสารที่พิมพ์จึงเป็นชุดที่อัปเดตแล้วเสมอ
  uE(() => {
    if (printReq <= 0) return;
    runQuoteDocPrint(printFileName, typeof window !== "undefined" && window.innerWidth <= 600);
  }, [printReq]);
  function doPrint(docType, fileName) {
    setPrintDocType(docType || "quotation");
    setPrintFileName(fileName || "");
    setPrintReq(n => n + 1);
  }
  // ใบเสนอราคา — ไม่ต้องออกเลขใหม่ ใช้เลข QT ของ ZORT เป็นชื่อไฟล์ได้เลย
  function printQuotation() {
    doPrint("quotation", docFileName("ใบเสนอราคา", result.quotationNumber));
  }

  // ก่อนพิมพ์ใบแจ้งหนี้ ต้องออก "เลขที่ใบแจ้งหนี้" ของเราเองก่อนเสมอ (IVB-yyyyMM###) — พิมพ์ซ้ำใบเดิม
  // ได้เลขเดิม (backend idempotent) แต่ถ้าออกเลขไม่สำเร็จ (เน็ตหลุด/GAS ตอบ HTML) ห้ามพิมพ์เอกสารที่ไม่มี
  // เลขที่เอกสาร — โชว์ toast แดงแล้วหยุด ให้ผู้ใช้กดลองใหม่เอง
  async function confirmInvoicePrint(extra) {
    setInvoiceExtra(extra);
    setInvoiceModal(false);
    setInvoiceNumberBusy(true);
    const r = await syncGetInvoiceNumber(result.quotationNumber);
    setInvoiceNumberBusy(false);
    if (!r || !r.ok) { showToast("error", "ออกเลขที่ใบแจ้งหนี้ไม่สำเร็จ: " + ((r && r.error) || ""), "❌"); return; }
    setInvoiceNumber(r.invoiceNumber);
    doPrint("invoice", docFileName(INVOICE_KIND_LABEL[(extra && extra.kind) || "full"], r.invoiceNumber));
  }

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

  // ของจริงจาก catalog ก่อนเสมอ (ได้สต๊อก/ราคา/ร้านที่ซื้อครบ) — ไม่เจอค่อยประกอบจากรายการในใบ
  // เพื่อให้ยังกดดูรูปใหญ่+ชื่อได้ ดีกว่ากดแล้วไม่มีอะไรเกิดขึ้น (SKU อาจถูกลบไปแล้ว)
  // ⚠️ ProductModal อ่านหมวดจาก `p.cat` (app.jsx มิเรอร์มาจาก p.category) ไม่ใช่ `p.category`
  const detailProduct = uM(() => {
    if (!detailSku) return null;
    const key = String(detailSku).trim().toUpperCase();
    const p = products.find(x => String(x.sku || "").trim().toUpperCase() === key);
    if (p) return p;
    const it = cart.find(x => String(x.sku || "").trim().toUpperCase() === key);
    return it ? { sku: it.sku, name: it.name, imageUrl: it.imageUrl || "", cat: it.category || "", price: Number(it.price) || 0 } : null;
  }, [detailSku, products, cart]);

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
      // โหมดแก้ไข: ส่ง id/number ของใบเดิมไปด้วย — server ใช้ id ยิง EditQuotation ที่ใบนั้นตรงๆ
      quotationId: editQuote ? editQuote.quotationId : undefined,
      quotationNumber: editQuote ? editQuote.quotationNumber : undefined,
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
    // ผ่าน quoteHydrateItems_ เสมอ — ร่างไม่ได้เก็บ imageUrl ไว้ ถ้าเซ็ตตรง ๆ รูปหายทั้งใบ
    setCart(quoteHydrateItems_(d.items, products));
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
    const r = editQuote ? await syncEditQuotation(buildQuotePayload()) : await syncCreateQuotation(buildQuotePayload());
    setSaving(false);
    if (!r.success) {
      showToast("error", (editQuote ? "แก้ไขใบเสนอราคาไม่สำเร็จ: " : "สร้างใบเสนอราคาไม่สำเร็จ: ") + (r.error || ""), "❌");
      return;
    }
    // แก้ไขสำเร็จแต่ข้อมูลลูกค้าอัปเดตไม่ผ่าน — รายการ/ยอดเปลี่ยนแล้วจริง ต้องบอกให้รู้ ไม่ใช่เงียบ
    if (r.data && r.data.infoWarning) showToast("warn", "แก้รายการสำเร็จ แต่ข้อมูลลูกค้าอัปเดตไม่ผ่าน: " + r.data.infoWarning, "⚠️");
    // ใบที่แก้ไขยังเป็นใบเดิม — เติมเลขที่เอกสารเดิมกลับให้หน้าผลลัพธ์/ปุ่มพิมพ์ใช้ต่อได้
    setResult(Object.assign({ quotationNumber: editQuote ? editQuote.quotationNumber : null }, r.data || {}));
    showToast("success", editQuote ? "แก้ไขใบเสนอราคาสำเร็จ" : "สร้างใบเสนอราคาสำเร็จ", "🎉");
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
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>{editQuote ? "แก้ไขใบเสนอราคาสำเร็จ" : "สร้างใบเสนอราคาสำเร็จ"}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--g-700,#166534)", marginTop: 6, fontFamily: "monospace" }}>{result.quotationNumber || "—"}</div>
              <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>ยอดสุทธิ {fmtBfull(result.totals ? result.totals.grandTotal : totals.grandTotal)}</div>
              {editQuote && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>อัปเดตใบเดิมใน ZORT แล้ว (ไม่ได้สร้างใบใหม่)</div>}
            </div>
          </Card>
          <button onClick={printQuotation} style={{ padding: 14, borderRadius: 10, border: "none", background: "var(--g-600,#1f7f44)", color: "#fff", fontWeight: 700 }}>🖨️ พิมพ์ใบเสนอราคา (A4)</button>
          <button onClick={() => setInvoiceModal(true)} disabled={invoiceNumberBusy} style={{ padding: 14, borderRadius: 10, border: "1px solid var(--g-600,#1f7f44)", background: "#fff", color: "var(--g-700,#166534)", fontWeight: 700, opacity: invoiceNumberBusy ? .6 : 1 }}>{invoiceNumberBusy ? "⏳ กำลังออกเลขที่..." : "🧾 พิมพ์ใบแจ้งหนี้ (A4)"}</button>
          {!editQuote && <button onClick={() => { resetAll(); }} style={{ padding: 14, borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700 }}>📝 สร้างใบใหม่</button>}
          {onBack && <button onClick={onBack} style={{ padding: 14, borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700 }}>← กลับไปหน้าติดตามสถานะ</button>}
          <Toast toast={toast} onClose={hideToast}/>
        </div>
        {invoiceModal && (
          <InvoiceOptionsModal grandTotal={(result.totals || totals).grandTotal}
            onCancel={() => setInvoiceModal(false)}
            onConfirm={confirmInvoicePrint}/>
        )}
        <QuotationPrintDoc quotationNumber={result.quotationNumber} invoiceNumber={invoiceNumber} items={cart} customer={cust}
          remarks={printDocType === "invoice" ? (invoiceExtra ? invoiceExtra.remarks : INVOICE_DEFAULT_REMARKS) : remarks}
          salesRep={salesRep} totals={result.totals || totals} docType={printDocType}
          invoiceKind={invoiceExtra ? invoiceExtra.kind : "full"}
          deposit={invoiceExtra ? invoiceExtra.deposit : 0}
          poNumber={invoiceExtra ? invoiceExtra.poNumber : ""}
          dueAmount={printDocType === "invoice" && invoiceExtra ? invoiceExtra.dueAmount : null}
          dueLabel={printDocType === "invoice" && invoiceExtra ? invoiceExtra.dueLabel : null}
          docDate={printDocType === "invoice" && invoiceExtra ? invoiceExtra.docDate : null}/>
      </React.Fragment>
    );
  }

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>
          {editQuote ? `✏️ แก้ไขใบเสนอราคา ${editQuote.quotationNumber || ""}` : "📝 สร้างใบเสนอราคาใหม่"}
        </div>
        {onBack && <button onClick={onBack} style={{ border: "none", background: "none", color: "var(--muted)", fontWeight: 600, cursor: "pointer" }}>✕ ปิด</button>}
      </div>

      {/* โหมดแก้ไข: เตือนเรื่องราคา — ราคาที่ ZORT เก็บไว้เป็นราคาหลังเฉลี่ยส่วนลดแล้ว โหลดกลับมา
          ตรงๆ ไม่ได้ (จะโดนหักซ้ำ) จึงคืนราคาตั้งจาก catalog ปัจจุบันให้แทน — ถ้าตอนออกใบเดิม
          ใช้ราคาพิเศษที่ไม่ตรง catalog ต้องพิมพ์แก้เอง ระบบเดาแทนไม่ได้ */}
      {editQuote && (
        <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#7a5a00", lineHeight: 1.7 }}>
          ⚠️ <b>ตรวจราคาก่อนบันทึก</b> — ราคาต่อชิ้นดึงจาก<b>ราคาขายปัจจุบัน</b>ของสินค้าแต่ละตัว
          ไม่ใช่ราคาที่พิมพ์ในใบเดิม (ระบบย้อนราคาเดิมกลับไม่ได้เพราะใบเก่าเก็บเป็นราคาหลังหักส่วนลดแล้ว)
          ถ้าใบเดิมใช้ราคาพิเศษ กรุณาพิมพ์แก้ในช่องราคาให้ตรงก่อนกดบันทึก
          <div style={{ marginTop: 4 }}>บันทึกแล้วจะ<b>อัปเดตใบเดิม</b>ใน ZORT (เลขที่เอกสารเท่าเดิม ไม่ได้สร้างใบใหม่)</div>
        </div>
      )}

      {/* ── ร่างที่บันทึกไว้ (โหมดแก้ไขไม่ต้องมี — ร่างเป็นคนละเรื่องกับใบที่ออกไปแล้ว) ── */}
      {!editQuote && (
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
      )}

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
                          {/* แตะรูป/รหัส = เปิดรายละเอียด + รูปใหญ่ (กติกา UI: ทุกที่ที่โชว์ SKU+ชื่อ ต้องกดดูได้)
                              ชื่อเป็น input แก้ได้ จึงกดที่ชื่อไม่ได้ — ต้องมีทางเข้าอื่นที่ชัดเจนแทน */}
                          <div onClick={() => setDetailSku(it.sku)} title="ดูรายละเอียดสินค้า"
                            style={{ width: 36, height: 36, borderRadius: 5, flexShrink: 0, background: "#f3f4f6", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                            {it.imageUrl
                              ? <img src={it.imageUrl} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={e => { e.target.style.display = "none"; }}/>
                              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📦</div>}
                            <div style={{ position: "absolute", bottom: 0, right: 0, background: "rgba(0,0,0,.45)", borderRadius: "4px 0 0 0", padding: "0 3px", fontSize: 8, color: "#fff", lineHeight: 1.5 }}>🔍</div>
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <input value={it.name} onChange={e => patchItem(i, { name: e.target.value })}
                              style={{ width: "100%", fontWeight: 600, border: "1px solid transparent", borderBottom: "1px dashed #d1d5db", padding: "2px 0", fontSize: 14, background: "transparent", minWidth: 0 }}/>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>
                              <span onClick={() => setDetailSku(it.sku)} style={{ cursor: "pointer", textDecoration: "underline dotted" }}>{it.sku}</span>
                              {excl ? " · ยกเว้นส่วนลด" : ""}
                            </div>
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
        {/* โหมดแก้ไขไม่มีปุ่มบันทึกร่าง — ใบออกไปแล้ว เก็บเป็นร่างซ้ำไม่มีความหมาย */}
        {!editQuote && (
          <button onClick={saveDraft} disabled={savingDraft} style={{ flex: 1, padding: 16, borderRadius: 12, border: "1px solid #d1d5db", background: "#fff", fontWeight: 800, fontSize: 15 }}>
            {savingDraft ? "กำลังบันทึก…" : "💾 บันทึกร่าง"}
          </button>
        )}
        <button onClick={submit} disabled={saving || !cart.length} style={{ flex: 2, padding: 16, borderRadius: 12, border: "none", fontWeight: 800, fontSize: 16,
          background: (saving || !cart.length) ? "#9ca3af" : "var(--g-600,#1f7f44)", color: "#fff", boxShadow: "0 4px 14px rgba(0,0,0,.15)" }}>
          {saving
            ? (editQuote ? "กำลังบันทึก..." : "กำลังส่ง...")
            : (editQuote ? `💾 บันทึกการแก้ไข · ${fmtBfull(totals.grandTotal)}` : `📤 ส่งเข้า ZORT · ${fmtBfull(totals.grandTotal)}`)}
        </button>
      </div>

      {detailProduct && <ProductModal p={detailProduct} onClose={() => setDetailSku(null)}/>}

      <Toast toast={toast} onClose={hideToast}/>
    </div>
  );
}

// ใบเสนอราคา A4 สำหรับพิมพ์ (โชว์เฉพาะตอน print ผ่าน CSS .pos-print-area — mirror PosReceipt)
// items = [{sku,name,qty,price,category}] ราคาปลีก/ชิ้น — คิดส่วนลดต่อหน่วยแบบเฉลี่ยเหมือนฝั่ง server
// docType="invoice" → หน้าตาเอกสารเหมือนใบเสนอราคาทุกอย่าง เปลี่ยนป้ายหัวเอกสาร — remarks ของ
// ใบแจ้งหนี้ (default = INVOICE_DEFAULT_REMARKS หรือแก้ไขแล้วจาก InvoiceOptionsModal) ผู้เรียกส่งมาตรงๆ
// dueAmount/dueLabel (ไม่บังคับ) = กล่องเน้นยอดที่เรียกเก็บจริง เมื่อพิมพ์แบบมัดจำ/ยอดคงเหลือ
// invoiceKind = "full"|"deposit"|"remaining" → เปลี่ยนป้ายหัวเอกสาร + บรรทัดสรุปยอดในกล่องขวาล่าง
// ⚠️ เลย์เอาต์ฝั่ง **ใบแจ้งหนี้** ยึดไฟล์ต้นแบบที่เจ้าของส่งมา (2026-08-06) ซึ่งต่างจากใบเสนอราคา
// หลายจุด: มีคอลัมน์ "หน่วย" แยก · ไม่มีคอลัมน์ส่วนลด (ส่วนลดเฉลี่ยลงราคา/หน่วยแล้ว) · กล่องลูกค้า
// ใช้ "นามลูกค้า/เลขที่สาขา" ไม่มีโทรศัพท์-อีเมล · ช่องเซ็นเป็น ผู้สั่งซื้อ/ผู้มีอำนาจ
// **ห้ามเอาไปใช้กับใบเสนอราคา** — ฝั่งนั้นตรวจเทียบกับ QT-202607023.pdf ไว้แล้ว ต้องคงเดิม
function QuotationPrintDoc({ quotationNumber, invoiceNumber, items, customer, remarks, salesRep, totals, docType, dueAmount, dueLabel, invoiceKind, deposit, poNumber, docDate: docDateProp }) {
  const isInvoice = docType === "invoice";
  const kind = invoiceKind || "full";
  const docLabel = isInvoice ? (INVOICE_KIND_LABEL[kind] || "ใบแจ้งหนี้") : "ใบเสนอราคา";
  const effRemarks = remarks || [];
  const gross = (totals.retailEligible || 0) + (totals.retailExcluded || 0);
  const factor = gross > 0 ? totals.grandTotal / gross : 1;
  const rows = (items || []).map(it => {
    const price = Number(it.price) || 0, qty = Number(it.qty) || 0;
    const finalUnit = price * factor;
    return { sku: it.sku, name: it.name, qty, price, unit: it.unit || "ชิ้น", netUnit: finalUnit,
             discUnit: Math.max(0, price - finalUnit), amount: finalUnit * qty };
  });
  const totalUnits = rows.reduce((s, r) => s + r.qty, 0);
  const POS_ROWS_PER_PAGE = 20;
  const pages = [];
  for (let i = 0; i < rows.length; i += POS_ROWS_PER_PAGE) pages.push(rows.slice(i, i + POS_ROWS_PER_PAGE));
  if (pages.length === 0) pages.push([]);
  const cell = { padding: "4px 6px", borderRight: "0.5px solid #999", fontSize: 12 };
  const boxCell = { padding: "3px 8px", border: "0.5px solid #999" };
  const num = (n) => (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // วันที่เอกสาร — ผู้ใช้ระบุเองได้จาก InvoiceOptionsModal (prop docDate = "yyyy-MM-dd")
  // ไม่ส่งมา = วันนี้ (พฤติกรรมเดิมของใบเสนอราคา)
  const docDate = docDateLabel(docDateProp);
  const cust = customer || {};

  // ── ยอดที่เรียกเก็บจริงในใบนี้ + ฐานภาษีของยอดนั้น ──
  // ราคาสินค้าในตารางรวม VAT อยู่แล้ว (เหมือน computeBillTotals) → แตกฐานภาษีด้วยการหาร 1.07
  // ตรงกับไฟล์ต้นแบบเป๊ะ: มัดจำ 35,660 → ก่อนภาษี 33,327.10 + VAT 2,332.90
  const dueNet = dueAmount != null ? dueAmount : totals.grandTotal;
  const duePre = Math.round(dueNet / 1.07 * 100) / 100;
  const dueVat = Math.round((dueNet - duePre) * 100) / 100;
  const paidDeposit = Number(deposit) || 0;
  // ป้าย "สรุปยอดเรียกเก็บค่ามัดจำ 50%" — โชว์ % ต่อเมื่อหารลงตัวพอดี (ผู้ใช้กรอกยอดบาท ไม่ได้กรอก %)
  // ไม่ลงตัว → ไม่โชว์ % เลย ดีกว่าโชว์ 42.06% ที่อ่านแล้วสับสน
  let depPctLabel = "";
  if (kind === "deposit" && totals.grandTotal > 0) {
    const pct = Math.round(dueNet / totals.grandTotal * 10000) / 100;
    if (Math.abs(totals.grandTotal * pct / 100 - dueNet) < 0.005) depPctLabel = " " + (pct % 1 === 0 ? pct : pct.toFixed(2)) + "%";
  }

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
                <div style={{ fontSize: 11 }}>เลขที่เอกสาร : {(isInvoice ? invoiceNumber : quotationNumber) || "—"}</div>
                {/* อ้างอิง1 = ใบสั่งซื้อของลูกค้า (PO), อ้างอิง2 = ใบเสนอราคาของเรา — ตามไฟล์ต้นแบบ
                    ไม่ได้กรอก PO → เลขใบเสนอราคาเลื่อนขึ้นเป็นอ้างอิง1 (ไม่ปล่อยให้มี "2" ลอยโดยไม่มี "1") */}
                {isInvoice && (poNumber
                  ? <React.Fragment>
                      <div style={{ fontSize: 11 }}>เอกสารอ้างอิง1 : {poNumber}</div>
                      <div style={{ fontSize: 11 }}>เอกสารอ้างอิง2 : {quotationNumber || "—"}</div>
                    </React.Fragment>
                  : <div style={{ fontSize: 11 }}>เอกสารอ้างอิง1 : {quotationNumber || "—"}</div>
                )}
                {pages.length > 1 ? <div style={{ fontSize: 11 }}>หน้า {pi + 1}/{pages.length}</div> : null}
              </div>
            </div>
            {/* ── กล่องลูกค้า (หน้าแรกเท่านั้น) — ตารางจริง (border-collapse) มีเส้นตาราง
                ครบทุกแถว/คอลัมน์ · **ใบเสนอราคา** จัดตามเอกสาร ZORT ต้นฉบับ (QT-202607023.pdf)
                "รหัสผู้ติดต่อ" เว้นว่างเสมอ (ไม่มี field นี้ในระบบเรา) · **ใบแจ้งหนี้** จัดตามไฟล์
                ต้นแบบของเจ้าของ: นามลูกค้า+เลขผู้เสียภาษีแถวเดียวกัน, "เลขที่สาขา", ไม่มีโทร/อีเมล ── */}
            {pi === 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #999", marginBottom: 8, fontSize: 11.5 }}>
                <tbody>
                  {isInvoice ? (
                    <React.Fragment>
                      <tr>
                        <td style={boxCell}><b>นามลูกค้า:</b> {cust.name || "—"}</td>
                        <td style={boxCell}><b>เลขประจำตัวผู้เสียภาษี:</b> {cust.taxId || "—"}</td>
                      </tr>
                      {(cust.branch || cust.branchNo) && (
                        <tr>
                          <td style={boxCell}><b>ชื่อสาขา:</b> {cust.branch || "—"}</td>
                          <td style={boxCell}><b>เลขที่สาขา:</b> {cust.branchNo || "—"}</td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={2} style={boxCell}><b>ที่อยู่:</b> {cust.address || "—"}</td>
                      </tr>
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
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
                    </React.Fragment>
                  )}
                </tbody>
              </table>
            )}
            {/* ── ตารางสินค้า — กรอบเดียวกันยืดเต็มพื้นที่ที่เหลือ (flex:1) ให้เห็นเป็น
                "ช่องสี่เหลี่ยม" ว่างต่อจากรายการจริง เหมือนเอกสาร ZORT ต้นฉบับที่เจ้าของ
                อ้างอิงมา (QT-202607023.pdf) — ไม่ใช่ดันช่องเซ็นลงล่างสุดแบบเดิมอีกต่อไป ──*/}
            <div className="quote-items-fill" style={{ flex: 1, display: "flex", flexDirection: "column", border: "0.5px solid #999" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  {/* ใบแจ้งหนี้: จำนวน/หน่วย แยกคอลัมน์ + ไม่มีช่องส่วนลด (ส่วนลดเฉลี่ยลง "ราคา/หน่วย"
                      ไปแล้ว) ตามไฟล์ต้นแบบ · ใบเสนอราคา: คงคอลัมน์เดิมที่เทียบกับ ZORT ไว้แล้ว */}
                  {isInvoice ? (
                    <tr style={{ background: "#f3f4f6", borderBottom: "0.5px solid #999" }}>
                      <th style={{ ...cell, width: 28, textAlign: "center" }}>#</th>
                      <th style={{ ...cell, width: 80, textAlign: "left" }}>รหัสสินค้า</th>
                      <th style={{ ...cell, textAlign: "left" }}>ชื่อสินค้า</th>
                      <th style={{ ...cell, width: 50, textAlign: "center" }}>จำนวน</th>
                      <th style={{ ...cell, width: 44, textAlign: "center" }}>หน่วย</th>
                      <th style={{ ...cell, width: 74, textAlign: "right" }}>ราคา/หน่วย</th>
                      <th style={{ ...cell, width: 84, textAlign: "right", borderRight: "none" }}>จำนวนเงิน</th>
                    </tr>
                  ) : (
                    <tr style={{ background: "#f3f4f6", borderBottom: "0.5px solid #999" }}>
                      <th style={{ ...cell, width: 28, textAlign: "center" }}>#</th>
                      <th style={{ ...cell, width: 80, textAlign: "left" }}>รหัสสินค้า</th>
                      <th style={{ ...cell, textAlign: "left" }}>ชื่อสินค้า</th>
                      <th style={{ ...cell, width: 60, textAlign: "center" }}>จำนวน</th>
                      <th style={{ ...cell, width: 70, textAlign: "right" }}>มูลค่าต่อหน่วย</th>
                      <th style={{ ...cell, width: 60, textAlign: "right" }}>ส่วนลดต่อหน่วย</th>
                      <th style={{ ...cell, width: 80, textAlign: "right", borderRight: "none" }}>รวม</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "0.5px solid #e5e7eb" }}>
                      <td style={{ ...cell, textAlign: "center" }}>{startIdx + i + 1}</td>
                      <td style={cell}>{r.sku}</td>
                      <td style={cell}>{r.name}</td>
                      {isInvoice ? (
                        <React.Fragment>
                          <td style={{ ...cell, textAlign: "center" }}>{r.qty}</td>
                          <td style={{ ...cell, textAlign: "center" }}>{r.unit}</td>
                          <td style={{ ...cell, textAlign: "right" }}>{num(r.netUnit)}</td>
                        </React.Fragment>
                      ) : (
                        <React.Fragment>
                          <td style={{ ...cell, textAlign: "center" }}>{r.qty} {r.unit}</td>
                          <td style={{ ...cell, textAlign: "right" }}>{num(r.price)}</td>
                          <td style={{ ...cell, textAlign: "right" }}>{r.discUnit > 0 ? num(r.discUnit) : "-"}</td>
                        </React.Fragment>
                      )}
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
              // gap ต้องมี — ป้าย "รวมเงินทั้งสิ้น / GRAND TOTAL" ยาวจนชนตัวเลขถ้าไม่เว้น
              const sumRow = { display: "flex", justifyContent: "space-between", gap: 10, padding: "2px 0" };
              const vatLabel = isInvoice ? "ภาษีมูลค่าเพิ่ม / VAT 7 %" : "ภาษีมูลค่าเพิ่ม (7%)";
              return (
                <React.Fragment>
                  {/* "รวม" ลอยเหนือกล่อง = ของใบเสนอราคา · ใบแจ้งหนี้ไปจากตารางสินค้าเข้ากล่องสรุปเลย */}
                  {!isInvoice && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4, fontSize: 12, fontWeight: 700 }}>
                      <span style={{ minWidth: 240, display: "flex", justifyContent: "space-between" }}><span>รวม</span><span>{num(rowmAmount)} บาท</span></span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, gap: 12 }}>
                    <div style={{ fontSize: 11, maxWidth: isInvoice ? "50%" : "55%" }}>
                      {(effRemarks || []).filter(Boolean).length > 0 && (
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 2 }}>หมายเหตุ</div>
                          {/* ไม่เติมเลขข้อให้เอง — ผู้ใช้พิมพ์เลขข้อไว้ในเนื้อหาแต่ละบรรทัดเองอยู่แล้ว
                              (เจ้าของแจ้ง 2026-07-30: เติมซ้ำเป็น "1. 1. ..." ) */}
                          {(effRemarks || []).filter(Boolean).map((r, i) => <div key={i}>{r}</div>)}
                        </div>
                      )}
                      {/* ตัวอักษรต้องเป็น "ยอดที่ต้องชำระจริงในใบนี้" ไม่ใช่ยอดรวมทั้งบิล — ใบมัดจำ
                          เก็บ 35,660 ต้องอ่านว่าสามหมื่นห้าพันหกร้อยหกสิบบาทถ้วน (ตามไฟล์ต้นแบบ) */}
                      {isInvoice ? (
                        <div style={{ marginTop: 6 }}>
                          <b>จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)</b> ({bahtText(dueNet)})
                        </div>
                      ) : (
                        <React.Fragment>
                          <div style={{ marginTop: 6 }}>สินค้าทั้งหมด {totalUnits} หน่วย</div>
                          <div>({bahtText(totals.grandTotal)})</div>
                        </React.Fragment>
                      )}
                    </div>
                    <div style={{ minWidth: isInvoice ? 302 : 240, fontSize: 12, border: "1px solid #999", borderRadius: 4, padding: "6px 8px" }}>
                      {/* ── กล่องสรุปยอด ──
                          ใบแจ้งหนี้ (ตามไฟล์ต้นแบบ): ยอดเต็มทั้งบิลก่อน → ยอดที่เรียกเก็บในใบนี้ →
                          แตกฐานภาษีของยอดนั้น → "ยอดที่ต้องชำระ" ปิดท้าย · ไม่มีบรรทัดส่วนลด
                          (เฉลี่ยลงราคา/หน่วยในตารางไปแล้ว) · เต็มจำนวนตัดบล็อกกลางทิ้ง เหลือยอดที่ต้องชำระ */}
                      {!isInvoice && tierRate > 0 && (
                        <div style={sumRow}><span>ส่วนลด</span><span>{(tierRate * 100).toFixed(2)}%</span></div>
                      )}
                      {!isInvoice && manualDiscount > 0 && (
                        <div style={sumRow}><span>ส่วนลดเพิ่มเติม</span><span>{num(manualDiscount)} บาท</span></div>
                      )}
                      <div style={sumRow}><span>มูลค่ารวมก่อนภาษี</span><span>{num(totals.preVat)} บาท</span></div>
                      <div style={sumRow}><span>{vatLabel}</span><span>{num(totals.vat)} บาท</span></div>
                      <div style={{ ...sumRow, padding: "4px 0", fontWeight: 800, fontSize: 14, borderTop: "1px solid #000", marginTop: 2, background: "#f3f4f6" }}>
                        <span>{isInvoice ? "รวมเงินทั้งสิ้น / GRAND TOTAL" : "มูลค่ารวมสุทธิ"}</span>
                        <span style={{ whiteSpace: "nowrap" }}>{num(totals.grandTotal)} บาท</span>
                      </div>
                      {isInvoice ? (
                        <React.Fragment>
                          {kind === "deposit" && (
                            <div style={{ ...sumRow, marginTop: 3 }}><span>สรุปยอดเรียกเก็บค่ามัดจำ{depPctLabel}</span><span>{num(dueNet)} บาท</span></div>
                          )}
                          {kind === "remaining" && (
                            <React.Fragment>
                              <div style={{ ...sumRow, marginTop: 3 }}><span>หัก เงินมัดจำที่ชำระแล้ว</span><span>({num(paidDeposit)})</span></div>
                              <div style={sumRow}><span>สรุปยอดเรียกเก็บคงเหลือ</span><span>{num(dueNet)} บาท</span></div>
                            </React.Fragment>
                          )}
                          {kind !== "full" && (
                            <React.Fragment>
                              <div style={sumRow}><span>มูลค่าก่อนภาษีของยอด{kind === "deposit" ? "มัดจำ" : "คงเหลือ"}</span><span>{num(duePre)} บาท</span></div>
                              <div style={sumRow}><span>{vatLabel}</span><span>{num(dueVat)} บาท</span></div>
                            </React.Fragment>
                          )}
                          <div style={{ ...sumRow, padding: "5px 0 2px", marginTop: 3, borderTop: "1px solid #000", fontWeight: 800, fontSize: 14 }}>
                            <span>ยอดที่ต้องชำระ</span><span style={{ whiteSpace: "nowrap" }}>{num(dueNet)} บาท</span>
                          </div>
                        </React.Fragment>
                      ) : (
                        /* ใบเสนอราคาที่พิมพ์แบบมัดจำ/คงเหลือ (ไม่ควรเกิด แต่กันไว้) — กล่องเน้นเดิม */
                        dueAmount != null && (
                          <div style={{ ...sumRow, padding: "6px 0 2px", marginTop: 4, borderTop: "2px solid #f59e0b", fontWeight: 800, fontSize: 15, color: "#92400e" }}>
                            <span>{dueLabel || "ยอดที่เรียกเก็บ"}</span><span>{num(dueAmount)} บาท</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })()}
            {/* ── ช่องเซ็น (หน้าสุดท้ายเท่านั้น) — ตารางสินค้าด้านบนยืดเต็มพื้นที่แล้ว
                (flex:1) ไม่ต้องดัน marginTop:"auto" ที่นี่อีก แค่เว้นระยะปกติต่อจากกล่อง
                สรุปยอด เหมือนเอกสาร ZORT ต้นฉบับ · ผู้เสนอราคาอยู่ขวา ผู้อนุมัติสั่งซื้ออยู่
                ซ้าย (สลับตำแหน่งตามที่เจ้าของขอ) · ใบแจ้งหนี้ใช้ ผู้สั่งซื้อ / ผู้มีอำนาจ ตามไฟล์ต้นแบบ */}
            {isLast && (
              <div style={{ display: "flex", justifyContent: "space-around", marginTop: 32, paddingTop: 24, fontSize: 11, textAlign: "center" }}>
                {(isInvoice ? ["ผู้สั่งซื้อ", "ผู้มีอำนาจ / AUTHORIZED"] : ["ผู้อนุมัติสั่งซื้อ", "ผู้เสนอราคา"]).map(l => (
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
