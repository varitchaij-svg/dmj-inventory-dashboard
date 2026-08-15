// ────────────────────────────────────────────────────────────────────────
// ระบบหลายภาษา (i18n) — ไทย / English / မြန်မာ
// โหลด **ก่อน** ui.jsx (ดูลำดับ <script> ใน "Doomuenjing Dashboard.html") เพื่อให้
// `t()` / `getLang()` / `setLang()` / `useLang()` เป็น global ที่ทุกไฟล์เรียกได้ทันที
//
// หลักการ (Phase 7 i18n — ส.ค. 2026):
//  • **ใช้ "ข้อความไทย" เป็น key** — `t("ลงเวลาเข้างาน")` · ไม่เจอคำแปล → คืนไทยเหมือนเดิม
//    → ทยอยแปลทีละหน้าได้ **ปลอดภัยบน production** (ขาดคำแปล = เห็นไทย ไม่ใช่จอพัง)
//  • **แปลเฉพาะหน้าพนักงาน + ล็อกอิน** (คนที่ต้องใช้พม่า = แรงงาน role employee/warehouse/
//    frontstore) · หน้าเจ้าของ (analytics/POS/ใบเสนอราคา/ใบกำกับ/ผลงานพนักงาน) คงไทยไว้
//  • **ห้ามแปลค่าจากชีต** (ชื่อสินค้า/หมวด/ลูกค้า) · ตัวเลข/เงิน/วันที่ คงเดิม
//
// ⚠️ กติกาเวลาใช้ `t()` (กันบั๊กเงียบ — บทเรียนเดียวกับ constant/useMemo ค้างค่า):
//  • ข้อความที่ฝังใน **constant ระดับโมดูล / useMemo** (เช่น TABS[].label, ROLE_LABELS)
//    ให้ **เก็บ constant เป็นไทยไว้เหมือนเดิม แล้วครอบ `t()` ตอน render ที่ปลายทาง**
//    (`t(tab.label)`) ไม่ใช่ครอบตอนประกาศ constant — ไม่งั้นเปลี่ยนภาษาแล้วป้ายค้างภาษาเดิม
//  • เปลี่ยนภาษา = App เรียก `useLang()` (subscribe) → re-render ทั้งต้นไม้ → `t()` อ่านค่าใหม่
//
// ⚠️ ฟอนต์พม่า: ใช้ **Myanmar Unicode** (ไม่ใช่ Zawgyi) · font-stack เผื่อไว้ใน CSS ของ HTML แล้ว
// ⚠️ คำแปลพม่าเป็น "ฉบับร่าง" — ต้องให้พนักงานพม่าตัวจริงตรวจก่อนถือว่าถูกต้อง

// รายชื่อภาษาที่รองรับ (ลำดับ = ลำดับปุ่มในเมนูเลือกภาษา)
const DMJ_LANGS = [
  { code: "th", label: "ไทย",     flag: "🇹🇭", native: "ไทย" },
  { code: "en", label: "English", flag: "🇬🇧", native: "English" },
  { code: "my", label: "မြန်မာ",  flag: "🇲🇲", native: "မြန်မာ" },
];
const DMJ_LANG_CODES = DMJ_LANGS.map(l => l.code);
const DMJ_DEFAULT_LANG = "th";

// ── พจนานุกรม: key = ข้อความไทย · ค่า = { en, my } ──
// ⚠️ **คำแปลพม่า (my) ทั้งหมดเป็น "ฉบับร่าง"** ต้องให้พนักงานพม่าตัวจริงตรวจก่อนถือว่าถูก
// ⚠️ เก็บเฉพาะ "ข้อความทั้งประโยค/ทั้งคำ" — ห้ามใส่ชิ้นส่วนที่ถูกต่อสตริง (เช่น "รวม " + x)
//    หรือชื่อเดือน/วันย่อ เพราะลำดับคำพม่า/อังกฤษต่างจากไทย แปลชิ้นส่วนแล้วผิดบริบท
// ⚠️ ชื่อเมนู (tab) เก็บ "เฉพาะข้อความหลังอีโมจิ" — nav ใช้ splitTabLabel แยกอีโมจิออกแล้ว
const DMJ_I18N = {
  // ── เลือกภาษา ──
  "ภาษา":              { en: "Language",        my: "ဘာသာစကား" },
  "เลือกภาษา":         { en: "Select language", my: "ဘာသာစကား ရွေးပါ" },

  // ── หน้าล็อกอิน ──
  "เข้าสู่ระบบเพื่อใช้งาน":       { en: "Sign in to continue",           my: "အသုံးပြုရန် အကောင့်ဝင်ပါ" },
  "เข้าสู่ระบบด้วย LINE":         { en: "Sign in with LINE",             my: "LINE ဖြင့် ဝင်ရန်" },
  "เข้าสู่ระบบโดยไม่เปิดแอป LINE": { en: "Sign in without the LINE app",  my: "LINE app မဖွင့်ဘဲ ဝင်ရန်" },
  "กำลังรอผลการเข้าสู่ระบบ…":     { en: "Waiting for sign-in…",          my: "အကောင့်ဝင်ခြင်း စောင့်နေသည်…" },

  // ── แถบบน / เมนู / ยูทิลิตี้ ──
  "เพิ่มเติม":         { en: "More",       my: "နောက်ထပ်" },
  "เมนูเพิ่มเติม":     { en: "More menu",  my: "နောက်ထပ် မီနူး" },
  "ออกจากระบบ":        { en: "Log out",    my: "ထွက်ရန်" },
  "Sync ใหม่":         { en: "Sync",       my: "ပြန်လည် စင့်ခ်လုပ်" },
  "กำลัง sync...":     { en: "Syncing…",   my: "စင့်ခ်လုပ်နေသည်…" },
  "โหลดใหม่":          { en: "Reload",     my: "ပြန်တင်" },

  // ── ชื่อเมนู (เฉพาะที่พนักงานเห็น — ข้อความหลังอีโมจิ) ──
  "ลงเวลา":               { en: "Time clock",        my: "အချိန်မှတ်တမ်း" },
  "ใครเข้างานวันนี้":       { en: "Who's in today",    my: "ဒီနေ့ ဘယ်သူလာ" },
  "สินค้า & สั่ง":          { en: "Products & order",  my: "ကုန်ပစ္စည်း & မှာယူ" },
  "สต๊อก & แจ้งเตือน":      { en: "Stock & alerts",    my: "ပစ္စည်းလက်ကျန် & သတိပေးချက်" },
  "เช็คหน้าร้าน":          { en: "Check storefront",  my: "ဆိုင်ရှေ့ စစ်ဆေး" },
  "ตำแหน่งคลัง":           { en: "Storage locations", my: "သိုလှောင်နေရာ" },
  "นับ stock คลัง":        { en: "Count warehouse stock", my: "ဂိုဒေါင် စာရင်းရေတွက်" },
  "เพิ่มสินค้าใหม่":        { en: "Add new product",   my: "ကုန်ပစ္စည်းအသစ် ထည့်" },
  "โอน/ปรับ/ยกมา":         { en: "Transfer / adjust", my: "လွှဲပြောင်း / ချိန်ညှိ" },
  "รายการสั่งของ":         { en: "Order list",        my: "မှာယူစာရင်း" },
  "ติดตามสถานะ":           { en: "Track status",      my: "အခြေအနေ ခြေရာခံ" },
  "สรุปสินค้าออกจากคลัง":   { en: "Goods-out summary", my: "ဂိုဒေါင်ထွက်ကုန် အနှစ်ချုပ်" },
  "งานจัดพิเศษ":           { en: "Special jobs",      my: "အထူးအလုပ်" },
  "พิมพ์ Label":           { en: "Print label",       my: "တံဆိပ် ပရင့်ထုတ်" },
  "งานคลัง":               { en: "Warehouse tasks",   my: "ဂိုဒေါင်အလုပ်" },
  "เทรนด์":                { en: "Trends",            my: "ရောင်းအားလားရာ" },

  // ── ลงเวลาเข้า-ออกงาน (หน้าที่แรงงานพม่าใช้บ่อยสุด) ──
  "เข้างาน":            { en: "Clock in",           my: "အလုပ်ဝင်" },
  "ออกงาน":             { en: "Clock out",          my: "အလုပ်ဆင်း" },
  "เริ่มพัก":            { en: "Start break",        my: "နားချိန် စ" },
  "กลับจากพัก":         { en: "Back from break",    my: "နားပြီး ပြန်ဝင်" },
  "ไปห้องน้ำ":           { en: "Restroom",           my: "အိမ်သာ သွား" },
  "กลับจากห้องน้ำ":      { en: "Back from restroom", my: "အိမ်သာမှ ပြန်" },
  "ทำงานอยู่":          { en: "Working",            my: "အလုပ်လုပ်နေ" },
  "พักอยู่":             { en: "On break",           my: "နားနေ" },
  "ยังไม่มา":            { en: "Not in yet",         my: "မရောက်သေး" },
  "สาย":                { en: "Late",               my: "နောက်ကျ" },
  "มาสาย":              { en: "Came late",          my: "နောက်ကျ ရောက်" },
  "ขาด":                { en: "Absent",             my: "ပျက်ကွက်" },
  "วันหยุด":            { en: "Day off",            my: "ပိတ်ရက်" },
  "ไม่มีกะ":            { en: "No shift",           my: "အလှည့် မရှိ" },
  "ตำแหน่ง":            { en: "Location",           my: "တည်နေရာ" },
  "ทำงานวันนี้":        { en: "Worked today",       my: "ဒီနေ့ အလုပ်ချိန်" },
  "วันนี้":             { en: "Today",              my: "ဒီနေ့" },
  "เวลาของฉัน":         { en: "My time",            my: "ကျွန်ုပ်၏ အချိန်" },
  "ทั้งหมด":            { en: "All",                my: "အားလုံး" },
  "ภาพรวม":             { en: "Overview",           my: "ခြုံငုံသုံးသပ်ချက်" },
  "สรุปรายคน":          { en: "Per-person summary", my: "တစ်ဦးချင်း အနှစ်ချုပ်" },
  "รวม/เฉลี่ย":         { en: "Total / average",    my: "စုစုပေါင်း / ပျမ်းမျှ" },
  "เปิดกล้อง":          { en: "Open camera",        my: "ကင်မရာ ဖွင့်" },
  "ถ่ายใหม่":           { en: "Retake",             my: "ပြန်ရိုက်" },
  "มีรูป":              { en: "Has photo",          my: "ဓာတ်ပုံ ရှိ" },
  "ไม่ได้เปิด GPS":      { en: "GPS not enabled",    my: "GPS မဖွင့်ထား" },

  // ── ปุ่ม / คำสั่งทั่วไป ──
  "บันทึก":             { en: "Save",       my: "သိမ်း" },
  "ยกเลิก":             { en: "Cancel",     my: "ပယ်ဖျက်" },
  "ปิด":                { en: "Close",      my: "ပိတ်" },
  "ลองใหม่":            { en: "Try again",  my: "ထပ်စမ်း" },
  "ค้นหา":              { en: "Search",     my: "ရှာ" },
  "สั่ง":               { en: "Order",      my: "မှာ" },
  "ยืนยัน":             { en: "Confirm",    my: "အတည်ပြု" },
  "รับของ":             { en: "Receive goods", my: "ပစ္စည်း လက်ခံ" },
  "โอน":                { en: "Transfer",   my: "လွှဲပြောင်း" },

  // ── ป้ายตำแหน่งงาน ──
  "เจ้าของ":            { en: "Owner",      my: "ပိုင်ရှင်" },
  "หน้าร้าน":           { en: "Storefront", my: "ဆိုင်ရှေ့" },
  "คลังสินค้า":         { en: "Warehouse",  my: "ဂိုဒေါင်" },
  "พนักงาน":            { en: "Staff",      my: "ဝန်ထမ်း" },

  // ── ลงเวลา — ชุดเพิ่มเติม (รอบตรวจใหม่ ยังไม่ยืนยัน) ──
  "ไม่มีกะวันนี้":       { en: "No shift today",           my: "ဒီနေ့ အလှည့်မရှိ" },
  "กะ {start}-{end}":   { en: "Shift {start}-{end}",       my: "အလှည့် {start}-{end}" },
  "กำลังโหลด…":         { en: "Loading…",                 my: "ဖွင့်နေသည်…" },
  "ถ่ายรูปยืนยันก่อนเข้างาน": { en: "Take a photo before clocking in", my: "အလုပ်မဝင်မီ ဓာတ်ပုံရိုက်ပါ" },
  "ลงเวลาออกงานครบแล้ววันนี้": { en: "All clocked out for today",  my: "ဒီနေ့ အလုပ်ဆင်း ပြီးပါပြီ" },
  "กำลังหา…":           { en: "Searching…",               my: "ရှာနေသည်…" },
  "พร้อม (±{acc} ม.)":  { en: "Ready (±{acc} m)",          my: "အသင့် (±{acc} မီတာ)" },
  "กำลังทำงาน":         { en: "Working",                  my: "အလုပ်လုပ်နေဆဲ" },
  "ยังไม่ได้ลงเวลาวันนี้": { en: "No time entries yet today", my: "ဒီနေ့ အချိန်မှတ်တမ်း မရှိသေး" },
  "เข้างานสาย {n} นาที":  { en: "Clocked in {n} min late",  my: "{n} မိနစ် နောက်ကျ ဝင်" },
  "พักรวม {t}":         { en: "Break total {t}",           my: "နားချိန် စုစုပေါင်း {t}" },
  "ห้องน้ำรวม {t}":     { en: "Restroom total {t}",        my: "အိမ်သာ စုစုပေါင်း {t}" },
  "ลืมกด \"กลับจากพัก\" — แจ้งเจ้าของให้แก้ให้":
    { en: "Forgot to tap \"Back from break\" — ask the owner to fix it", my: "\"နားပြီးပြန်ဝင်\" နှိပ်ရန် မေ့ — ပိုင်ရှင်ကို ပြင်ခိုင်းပါ" },
  "ลืมกด \"กลับจากห้องน้ำ\" — แจ้งเจ้าของให้แก้ให้":
    { en: "Forgot to tap \"Back from restroom\" — ask the owner to fix it", my: "\"အိမ်သာမှပြန်\" နှိပ်ရန် မေ့ — ပိုင်ရှင်ကို ပြင်ခိုင်းပါ" },
  "ยังลงเวลาได้ตามปกติ แต่ระบบจะบันทึกว่าไม่มีพิกัด":
    { en: "You can still clock in normally, but it will be recorded as \"no location\"",
      my: "ပုံမှန်အတိုင်း အချိန်မှတ်နိုင်ပါသည်၊ သို့သော် \"တည်နေရာမရှိ\" ဟု မှတ်တမ်းတင်ပါမည်" },
  "นาที":               { en: "min",                      my: "မိနစ်" },
  "ชม.":                { en: "hr",                       my: "နာရီ" },

  // ── สั่งของ (ProductCard / OrderModal) — ชุดตรวจใหม่ ยังไม่ยืนยัน ──
  "หมด":                { en: "Out",                my: "ကုန်" },
  "หมด!":               { en: "Out!",               my: "ကုန်!" },
  "หมดสต๊อก":           { en: "Out of stock",       my: "ပစ္စည်းကုန်" },
  "หมด — นับหน้าร้าน":   { en: "Out — count storefront", my: "ကုန် — ဆိုင်ရှေ့ရေတွက်" },
  "สั่งไปขาย":          { en: "Order to sell",      my: "ရောင်းရန် မှာ" },
  "สั่งแล้ว {n}":       { en: "Ordered {n}",        my: "မှာပြီး {n}" },
  "จัดของแล้ว {n}":     { en: "Prepared {n}",       my: "ပြင်ဆင်ပြီး {n}" },
  "ขายแล้ว":            { en: "Sold",               my: "ရောင်းပြီး" },
  "คงเหลือ":            { en: "In stock",           my: "လက်ကျန်" },
  "เหลือ {n}":          { en: "{n} left",           my: "{n} ကျန်" },
  "ชิ้น":               { en: "pcs",                my: "ခု" },
  "ราคา":               { en: "Price",              my: "ဈေးနှုန်း" },
  "ใกล้หมด ({n})":      { en: "Low ({n})",          my: "နည်းနေပြီ ({n})" },
  "ควรสั่ง":            { en: "Suggested",          my: "မှာသင့်" },
  "นับใหม่":            { en: "Recount",            my: "ပြန်ရေတွက်" },
  "กรอกเอง":            { en: "Enter manually",     my: "ကိုယ်တိုင်ရိုက်" },
  "หน้าร้านเหลือกี่ชิ้น?": { en: "How many left in the storefront?", my: "ဆိုင်ရှေ့မှာ ဘယ်နှစ်ခု ကျန်လဲ?" },
  "นับก่อนสั่ง — หน้าร้านเหลือกี่ชิ้น?":
    { en: "Count before ordering — how many left in the storefront?", my: "မမှာမီ ရေတွက်ပါ — ဆိုင်ရှေ့မှာ ဘယ်နှစ်ခု ကျန်လဲ?" },
  "จำนวนที่สั่ง (ชิ้น)": { en: "Order quantity (pcs)", my: "မှာမည့် အရေအတွက် (ခု)" },
  "ประเภทการรับ":       { en: "Pickup type",        my: "လက်ခံနည်း" },
  "หิ้ว":               { en: "Carry",              my: "ကိုယ်တိုင်ယူ" },
  "รอขึ้นรถ":           { en: "By truck",           my: "ကားဖြင့်ပို့" },
  "รับที่ร้าน/หิ้วไปเลย": { en: "Pick up / carry now", my: "ဆိုင်မှာယူ / ချက်ချင်းယူ" },
  "รอจัดส่งทีหลัง":     { en: "Deliver later",      my: "နောက်မှ ပို့ရန်" },
  "เลือกจำนวนที่จะสั่งก่อน": { en: "Choose a quantity first", my: "အရေအတွက် အရင်ရွေးပါ" },
  "ยืนยันสั่ง {n} ชิ้น ({type})": { en: "Confirm order {n} pcs ({type})", my: "မှာယူ အတည်ပြု {n} ခု ({type})" },
  "บันทึกหน้าร้าน {n} ชิ้น แล้วปิด": { en: "Save storefront {n} pcs and close", my: "ဆိုင်ရှေ့ {n} ခု သိမ်းပြီး ပိတ်" },

  // ── รายการสั่งของ + รับของ (OrderListView / OrderItemRow / ShipmentRow) — ชุดตรวจใหม่ ──
  "รอ":                 { en: "Pending",            my: "စောင့်ဆိုင်း" },
  "สำเร็จ":             { en: "Done",               my: "ပြီးစီး" },
  "ส่งแล้ว":            { en: "Shipped",            my: "ပို့ပြီး" },
  "รอดำเนินการ":        { en: "Pending",            my: "ဆောင်ရွက်ရန် ကျန်" },
  "จัด":                { en: "Prepare",            my: "ပြင်ဆင်" },
  "{n} รายการ":         { en: "{n} items",          my: "{n} ခု" },
  "บันทึกแล้ว":         { en: "Saved",              my: "သိမ်းပြီး" },
  "ยังไม่บันทึก":       { en: "Not saved yet",      my: "မသိမ်းရသေး" },
  "ออเดอร์ใหม่":        { en: "New orders",         my: "မှာယူ အသစ်" },
  "หิ้วเอง — จัดก่อน":   { en: "Carry — prepare first", my: "ကိုယ်တိုင်ယူ — အရင်ပြင်" },
  "ขึ้นรถ":             { en: "By truck",           my: "ကားတင်" },
  "ยังไม่มีรายการสั่งของ": { en: "No orders yet",      my: "မှာယူစာရင်း မရှိသေး" },
  "ไม่มีรายการใน filter นี้": { en: "No items in this filter", my: "ဤ filter တွင် စာရင်းမရှိ" },
  "ลองเลือก filter อื่น": { en: "Try another filter", my: "အခြား filter ရွေးကြည့်ပါ" },
  // — รับของ —
  "รับจริง":            { en: "Actual received",    my: "အမှန် လက်ခံ" },
  "รับแล้ว":            { en: "Received",           my: "လက်ခံပြီး" },
  "ยังไม่รับ":          { en: "Not received",       my: "မလက်ခံရသေး" },
  "รับครบ":             { en: "Fully received",     my: "အပြည့် လက်ခံ" },
  "รับไม่ครบ":          { en: "Partially received", my: "မပြည့် လက်ခံ" },
  "ยืนยันรับ":          { en: "Confirm receipt",    my: "လက်ခံ အတည်ပြု" },
  "แก้ไข":              { en: "Edit",               my: "တည်းဖြတ်" },
  "ยังไม่มีของที่ส่งออกจากคลัง": { en: "No goods shipped from the warehouse yet", my: "ဂိုဒေါင်မှ ပို့သည့် ပစ္စည်း မရှိသေး" },
  "เมื่อ warehouse กดส่งของ รายการจะมาแสดงที่นี่": { en: "Items appear here when the warehouse ships them", my: "ဂိုဒေါင်က ပစ္စည်းပို့သောအခါ ဤနေရာတွင် ပေါ်လာမည်" },

  // ══ P2 ที่เหลือ (frontstore + warehouse) — ชุดตรวจใหม่ ══
  // — คำใช้ร่วมหลายหน้า —
  "รายการ":             { en: "items",              my: "ခု" },
  "ของฉัน":             { en: "Mine",               my: "ကျွန်ုပ်၏" },
  "ค้นหา":              { en: "Search",             my: "ရှာ" },
  "ไม่พบสินค้า":        { en: "No products found",  my: "ပစ္စည်း ရှာမတွေ့" },
  "ลองเปลี่ยน filter หรือค้นหาใหม่": { en: "Try another filter or search again", my: "အခြား filter သို့မဟုတ် ပြန်ရှာကြည့်ပါ" },
  // — เช็คหน้าร้าน (FrontStoreView) —
  "เช็คจำนวนหน้าร้าน":   { en: "Check storefront counts", my: "ဆိုင်ရှေ့ အရေအတွက် စစ်ဆေး" },
  "ควรเช็คก่อน":        { en: "Check first",        my: "အရင်စစ်သင့်" },
  "รอเช็ค":             { en: "To check",           my: "စစ်ရန်ကျန်" },
  "ไม่ตรง":             { en: "Mismatch",           my: "မကိုက်ညီ" },
  "ยังไม่ได้กรอกจำนวน":  { en: "Quantity not entered", my: "အရေအတွက် မဖြည့်ရသေး" },
  "ค้นหา SKU หรือชื่อสินค้า...": { en: "Search SKU or product name…", my: "SKU သို့မဟုတ် ကုန်အမည် ရှာပါ…" },
  "กำลังบันทึก {n}":    { en: "Saving {n}",         my: "သိမ်းနေသည် {n}" },
  "รอบันทึก {n}":       { en: "Pending save {n}",   my: "သိမ်းရန်ကျန် {n}" },
  "กำลังโอน...":        { en: "Transferring…",      my: "လွှဲပြောင်းနေသည်…" },
  "ยืนยันโอน":          { en: "Confirm transfer",   my: "လွှဲပြောင်း အတည်ပြု" },
  // — สต๊อก & แจ้งเตือน (StockView) —
  "ใกล้หมด":            { en: "Low",                my: "နည်းနေ" },
  "ใกล้หมด — สั่งด่วน":  { en: "Low — order now",    my: "နည်းနေ — အမြန်မှာ" },
  "หมดสต๊อกแล้ว":       { en: "Out of stock",       my: "ပစ္စည်းကုန်" },
  "แต่ยังมียอดขาย":     { en: "but still selling",  my: "ဒါပေမဲ့ ရောင်းအားရှိ" },
  "ยอดขายตก":           { en: "Sales dropping",     my: "ရောင်းအား ကျ" },
  "ขายลดลง > 60%":      { en: "Sales down >60%",    my: "ရောင်းအား ၆၀% ကျော် ကျ" },
  "สินค้าจมนาน":        { en: "Slow movers",        my: "ကြာရှည် မရွေ့" },
  "ขาย < 10% ของสต๊อก":  { en: "Sold <10% of stock", my: "လက်ကျန်၏ ၁၀% အောက် ရောင်း" },
  "สต๊อกเกินจำเป็น":    { en: "Overstocked",        my: "လိုအပ်သည်ထက် ပို" },
  "พอขาย > 12 เดือน":   { en: "Enough for >12 months", my: "၁၂ လကျော် ရောင်းလောက်" },
  "จมนาน":              { en: "Slow",               my: "ကြာရှည်" },
  "สต๊อกเกิน":          { en: "Overstock",          my: "ပိုလျှံ" },
  "หมดแล้ว":            { en: "Sold out",           my: "ကုန်သွားပြီ" },
  "ยอดเยี่ยม!":         { en: "Excellent!",         my: "အကောင်းဆုံး!" },
  "ไม่มีรายการในกลุ่มนี้": { en: "No items in this group", my: "ဤအုပ်စုတွင် စာရင်းမရှိ" },
  "ค้นหาหรือเลือกร้าน...": { en: "Search or pick a shop…", my: "ဆိုင် ရှာ သို့မဟုတ် ရွေးပါ…" },
  "ค้นหา SKU / ชื่อ / หมวด...": { en: "Search SKU / name / category…", my: "SKU / အမည် / အမျိုးအစား ရှာပါ…" },
  "เกณฑ์แจ้งเตือน":     { en: "Alert thresholds",   my: "သတိပေး ကန့်သတ်ချက်" },
  "เมื่อสต๊อกเหลือถึงจำนวนนี้ ระบบจะแจ้งให้สั่งเพิ่ม — แก้แล้วบันทึกให้อัตโนมัติ":
    { en: "When stock drops to this number, the system will prompt a reorder — edits save automatically",
      my: "လက်ကျန် ဤအရေအတွက်သို့ ရောက်လျှင် ထပ်မှာရန် အသိပေးမည် — ပြင်လျှင် အလိုအလျောက် သိမ်းသည်" },
  "กำลังบันทึกเกณฑ์…":  { en: "Saving thresholds…", my: "ကန့်သတ်ချက် သိမ်းနေသည်…" },
  "บันทึกเกณฑ์แล้ว — ทุกเครื่องเห็นค่าใหม่หลัง Sync":
    { en: "Thresholds saved — all devices see the new values after Sync", my: "ကန့်သတ်ချက် သိမ်းပြီး — Sync ပြီးလျှင် စက်အားလုံး တန်ဖိုးအသစ် မြင်မည်" },
  "บันทึกเกณฑ์ไม่สำเร็จ — เช็คอินเทอร์เน็ตแล้วลองแก้ตัวเลขอีกครั้ง":
    { en: "Failed to save thresholds — check your internet and edit the numbers again", my: "ကန့်သတ်ချက် မသိမ်းနိုင် — အင်တာနက် စစ်ပြီး ဂဏန်းများ ပြန်ပြင်ကြည့်ပါ" },
  // — งานคลัง (WarehouseHomeView) —
  "งานคลังวันนี้":      { en: "Warehouse tasks today", my: "ဒီနေ့ ဂိုဒေါင်အလုပ်" },
  "รวมงานค้าง + ลำดับหยิบของ ให้จบในหน้าเดียว": { en: "All pending tasks + pick order on one page", my: "ကျန်အလုပ်များ + ယူရမည့်အစီအစဉ် စာမျက်နှာတစ်ခုတည်း" },
  "แตะเพื่อจัดการ ›":   { en: "Tap to manage ›",    my: "စီမံရန် တို့ပါ ›" },
  "ไม่มีงานค้าง":       { en: "No pending tasks",   my: "ကျန်အလုပ် မရှိ" },
  "ออเดอร์เตรียมครบ · ของหิ้วกดส่งครบ · ของจัดเก็บครบ · หน้าร้านรับครบแล้ว":
    { en: "Orders prepared · carry items shipped · goods stored · storefront received", my: "မှာယူ ပြင်ဆင်ပြီး · ကိုယ်တိုင်ယူ ပို့ပြီး · သိမ်းဆည်းပြီး · ဆိုင်ရှေ့ လက်ခံပြီး" },
  "ออเดอร์ต้องเตรียม":   { en: "Orders to prepare",  my: "ပြင်ဆင်ရန် မှာယူ" },
  "ของหิ้วรอกดส่ง":     { en: "Carry items to ship", my: "ပို့ရန် ကိုယ်တိုင်ယူ ပစ္စည်း" },
  "ของยังไม่จัดเก็บ":    { en: "Not stored yet",     my: "မသိမ်းရသေး" },
  "ล็อคยังไม่เคยนับ":    { en: "Locks never counted", my: "မရေတွက်ဖူးသော လော့ခ်" },
  "ของโอนรอหน้าร้านรับ":  { en: "Transfers awaiting receipt", my: "လက်ခံရန် စောင့်ဆိုင်း လွှဲပြောင်း" },
  "หน้าร้านรับไม่ครบ":   { en: "Storefront under-received", my: "ဆိုင်ရှေ့ မပြည့် လက်ခံ" },
  "หยิบของตามตำแหน่ง":   { en: "Pick by location",   my: "နေရာအလိုက် ယူ" },
  "เรียงตามล็อค เดินหยิบรอบเดียวจบ · แตะรูป/ชื่อดูรายละเอียด": { en: "Sorted by lock, pick in one round · tap image/name for details", my: "လော့ခ်အလိုက် စီ၊ တစ်ကြိမ်တည်း ယူ · ပုံ/အမည် တို့၍ အသေးစိတ်" },
  "หยิบ {n}":           { en: "Pick {n}",           my: "ယူ {n}" },
  "ของที่โอนไปหน้าร้าน":  { en: "Transferred to storefront", my: "ဆိုင်ရှေ့သို့ လွှဲပြီး" },
  "ติดตามว่าหน้าร้านรับครบหรือยัง": { en: "Track whether the storefront received everything", my: "ဆိုင်ရှေ့ အကုန်လက်ခံပြီးမပြီး ခြေရာခံ" },
  "ยังไม่มีตำแหน่งล็อค":  { en: "No lock assigned yet", my: "လော့ခ်နေရာ မသတ်မှတ်ရသေး" },
  "รอรับ":              { en: "Awaiting",           my: "လက်ခံရန် စောင့်" },
  // — นับ stock คลัง (StockCountView) —
  "นับก่อนขึ้นชั้น":     { en: "Count before shelving", my: "စင်မတင်မီ ရေတွက်" },
  "นับก่อนขึ้นชั้น (ยังไม่มีตำแหน่ง)": { en: "Count before shelving (no location yet)", my: "စင်မတင်မီ ရေတွက် (နေရာမရှိသေး)" },
  "ไม่สำเร็จ กด 🔄 Reload":     { en: "Failed — tap 🔄 Reload", my: "မအောင်မြင် — 🔄 Reload နှိပ်ပါ" },
  "บันทึกไม่สำเร็จ กด 🔄 Reload": { en: "Save failed — tap 🔄 Reload", my: "မသိမ်းနိုင် — 🔄 Reload နှိပ်ပါ" },
  "ค้นหาหรือสแกนสินค้า แล้วกรอกจำนวนที่นับได้ — ระบบจะตั้งยอดคลังตามที่กรอก":
    { en: "Search or scan a product and enter the counted qty — the system sets the warehouse total to what you enter",
      my: "ကုန်ပစ္စည်း ရှာ သို့မဟုတ် စကင်န်ဖတ်ပြီး ရေတွက်ရရှိသည့် အရေအတွက် ဖြည့်ပါ — စနစ်က ဖြည့်သည့်အတိုင်း ဂိုဒေါင်စုစုပေါင်း သတ်မှတ်မည်" },
  "ตั้งยอดคลัง":        { en: "Set warehouse total", my: "ဂိုဒေါင်စုစုပေါင်း သတ်မှတ်" },
  "ยังไม่มีรายการนับ":   { en: "No count items yet", my: "ရေတွက်စရာ မရှိသေး" },
  "ค้นหาซัพพลายเออร์...": { en: "Search supplier…",   my: "ပေးသွင်းသူ ရှာပါ…" },
  "ไม่พบซัพพลายเออร์":   { en: "No supplier found",  my: "ပေးသွင်းသူ ရှာမတွေ့" },
  "ลองค้นหาด้วยคำอื่น":  { en: "Try a different search", my: "အခြားစကားလုံးဖြင့် ရှာကြည့်ပါ" },
  "ไม่มีสินค้าในคลัง":   { en: "No goods in the warehouse", my: "ဂိုဒေါင်တွင် ပစ္စည်းမရှိ" },
  "ซัพพลายเออร์นี้ไม่มีสินค้าในคลังขณะนี้": { en: "This supplier has no goods in the warehouse right now", my: "ဤပေးသွင်းသူတွင် ယခု ဂိုဒေါင်၌ ပစ္စည်းမရှိ" },
  "ขั้น 1 — เลือกชั้น หรือค้นหาสินค้า": { en: "Step 1 — pick a shelf or search products", my: "အဆင့် ၁ — စင်ရွေး သို့မဟုတ် ကုန်ပစ္စည်းရှာ" },
  "ขั้น 3 — กรอกจำนวนที่นับได้จริง": { en: "Step 3 — enter the actual counted quantity", my: "အဆင့် ၃ — အမှန်ရေတွက်ရသည့် အရေအတွက် ဖြည့်" },
  "แตะเพื่อนับ ›":      { en: "Tap to count ›",     my: "ရေတွက်ရန် တို့ပါ ›" },
  "ควรนับก่อน":         { en: "Count first",        my: "အရင်ရေတွက်သင့်" },
  "สินค้าขายดี (A) หรือไม่ได้นับนาน — แตะเพื่อไปนับเลย (ยังไม่มีตำแหน่ง = นับก่อนขึ้นชั้น)":
    { en: "Best sellers (A) or long uncounted — tap to count now (no location = count before shelving)",
      my: "ရောင်းအားကောင်း (A) သို့မဟုတ် ကြာရှည်မရေတွက် — ချက်ချင်းရေတွက်ရန် တို့ပါ (နေရာမရှိ = စင်မတင်မီရေတွက်)" },
  "ปิดค้นหา":           { en: "Close search",       my: "ရှာဖွေမှု ပိတ်" },
  "เจอสินค้าอื่นในล็อคนี้? แตะเพื่อเพิ่ม": { en: "Found other items in this lock? Tap to add", my: "ဤလော့ခ်တွင် အခြားပစ္စည်းတွေ့လား? ထည့်ရန် တို့ပါ" },
  "ระบบจะบันทึกตำแหน่ง+จำนวนในล็อคนี้ (ไม่แก้ยอดคลังรวม)": { en: "The system records the location + quantity in this lock (does not change the warehouse total)", my: "စနစ်က ဤလော့ခ်၏ နေရာ + အရေအတွက် မှတ်တမ်းတင်မည် (ဂိုဒေါင်စုစုပေါင်း မပြောင်း)" },
  "พิมพ์ชื่อหรือ SKU สินค้าที่เจอ...": { en: "Type the name or SKU you found…", my: "တွေ့သည့် အမည် သို့မဟုတ် SKU ရိုက်ပါ…" },
  "ล็อคนี้ยังไม่มีสินค้าในระบบ": { en: "This lock has no items in the system yet", my: "ဤလော့ခ်တွင် စနစ်၌ ပစ္စည်းမရှိသေး" },
  "เจอในล็อค":          { en: "Found in lock",      my: "လော့ခ်တွင် တွေ့" },
  "รอนับ":              { en: "To count",           my: "ရေတွက်ရန်" },
  "ตรง":                { en: "Match",              my: "ကိုက်ညီ" },
  "เครื่องคิดเลข":       { en: "Calculator",         my: "ဂဏန်းတွက်စက်" },
  // — ตำแหน่งคลัง (StorageView) —
  "บันทึกตำแหน่งด่วน":   { en: "Quick save location", my: "နေရာ အမြန်သိမ်း" },
  "พิมพ์หรือสแกน SKU...": { en: "Type or scan SKU…",  my: "SKU ရိုက် သို့မဟုတ် စကင်န်ဖတ်…" },
  "พิมพ์ตำแหน่ง เช่น A3/7 หรือ A0...": { en: "Type location, e.g. A3/7 or A0…", my: "နေရာ ရိုက်ပါ ဥပမာ A3/7 သို့မဟုတ် A0…" },
  "บันทึกล่าสุด":        { en: "Recently saved",     my: "မကြာမီ သိမ်းထား" },
  "แตะเพื่อดูล็อค":      { en: "Tap to view lock",   my: "လော့ခ်ကြည့်ရန် တို့ပါ" },
  "ล็อคที่ใช้แล้ว":      { en: "Locks used",         my: "သုံးပြီး လော့ခ်" },
  "{p}% ของคลัง":       { en: "{p}% of warehouse",  my: "ဂိုဒေါင်၏ {p}%" },
  "เช็คแล้ว":           { en: "Checked",            my: "စစ်ပြီး" },
  "{p}% ของที่ใช้":     { en: "{p}% of used",       my: "သုံးထားသည့် {p}%" },
  "ไม่ตรงระบบ":         { en: "Doesn't match system", my: "စနစ်နှင့် မကိုက်" },
  "ต้องตรวจสอบ":        { en: "Needs review",       my: "စစ်ဆေးရန် လို" },
  "ปกติ":               { en: "Normal",             my: "ပုံမှန်" },
  "ยังไม่ระบุล็อค":      { en: "No lock assigned",   my: "လော့ခ် မသတ်မှတ်ရသေး" },
  "ต้องไปเดินเช็ค":      { en: "Need to go check",   my: "သွားစစ်ရန် လို" },
  "แผนผังคลังสินค้า":    { en: "Warehouse map",      my: "ဂိုဒေါင် မြေပုံ" },
  "ซอย A":              { en: "Aisle A",            my: "လမ်း A" },
  "ซอย B":              { en: "Aisle B",            my: "လမ်း B" },
  // — สินค้า & สั่ง (CategoryView ตัวกรอง/ค้นหา) —
  "หมวดหมู่สินค้า":     { en: "Product categories", my: "ကုန်ပစ္စည်း အမျိုးအစား" },
  "ค้นหาสินค้าทั้งหมด (SKU / ชื่อ)...": { en: "Search all products (SKU / name)…", my: "ကုန်ပစ္စည်းအားလုံး ရှာ (SKU / အမည်)…" },
  "พิมพ์ชื่อ Supplier...": { en: "Type supplier name…", my: "ပေးသွင်းသူ အမည် ရိုက်ပါ…" },
  "เฉพาะของฉัน":        { en: "Mine only",          my: "ကျွန်ုပ်၏သာ" },
  "แตะเพื่อดูเฉพาะของฉัน": { en: "Tap to see only mine", my: "ကျွန်ုပ်၏သာ ကြည့်ရန် တို့ပါ" },
  "กำลังดูของฉัน + ของใช้ร่วมกัน (อุปกรณ์สำนักงาน/ของตกแต่ง) · แตะเพื่อดูทั้งหมด":
    { en: "Viewing mine + shared items (office supplies/decor) · tap to see all", my: "ကျွန်ုပ်၏ + အတူသုံး ပစ္စည်း (ရုံးသုံး/အလှဆင်) ကြည့်နေ · အားလုံးကြည့်ရန် တို့ပါ" },
  // — งานจัดพิเศษ (MtoJobView) —
  "งานจัดพิเศษ (MTO)":  { en: "Special jobs (MTO)", my: "အထူးအလုပ် (MTO)" },
  "สร้างงานใหม่":       { en: "Create new job",     my: "အလုပ်အသစ် ဖန်တီး" },
  "กลับ":               { en: "Back",               my: "နောက်သို့" },
  "ไม่มีอินเทอร์เน็ต — ไม่สามารถบันทึก/ปิดงานได้": { en: "No internet — can't save/close jobs", my: "အင်တာနက်မရှိ — သိမ်း/ပိတ် မရ" },
  "กำลังโหลดรายชื่อ…":  { en: "Loading names…",     my: "အမည်များ ဖွင့်နေသည်…" },
  "ค้นหาสินค้า (SKU หรือชื่อ)": { en: "Search products (SKU or name)", my: "ကုန်ပစ္စည်း ရှာ (SKU သို့မဟုတ် အမည်)" },
  "ชื่องาน *":          { en: "Job name *",         my: "အလုပ်အမည် *" },
  "ชื่อลูกค้า":         { en: "Customer name",      my: "ဖောက်သည် အမည်" },
  "ยังไม่มีวัตถุดิบ":    { en: "No materials yet",   my: "ကုန်ကြမ်း မရှိသေး" },
  "ราคา (ไม่จำเป็น)":   { en: "Price (optional)",   my: "ဈေးနှုန်း (မဖြစ်မနေ မဟုတ်)" },
  "URL รูป (ไม่จำเป็น)": { en: "Image URL (optional)", my: "ပုံ URL (မဖြစ်မနေ မဟုတ်)" },
  "ลูกค้า (ไม่จำเป็น)":  { en: "Customer (optional)", my: "ဖောက်သည် (မဖြစ်မနေ မဟုတ်)" },
  "เช่น ชุดของขวัญวันเกิดลูกค้า A": { en: "e.g. Customer A birthday gift set", my: "ဥပမာ ဖောက်သည် A မွေးနေ့ လက်ဆောင်စုံ" },
  "เปลี่ยน":            { en: "Change",             my: "ပြောင်း" },
  "เพิ่มวัตถุดิบที่ใช้":  { en: "Add materials used", my: "သုံးသည့် ကုန်ကြမ်း ထည့်" },
  "แตะดูรูปใหญ่":       { en: "Tap to enlarge",     my: "ချဲ့ကြည့်ရန် တို့ပါ" },
  'กดปุ่ม "สร้างงานใหม่" เพื่อเริ่มต้น': { en: 'Tap "Create new job" to start', my: '"အလုပ်အသစ်ဖန်တီး" နှိပ်၍ စတင်ပါ' },
  // — พิมพ์ Label (LabelPrintView) —
  "พิมพ์ Label สินค้า": { en: "Print product labels", my: "ကုန်ပစ္စည်း တံဆိပ် ပရင့်ထုတ်" },
  "ค้นหาสินค้า / พิมพ์ SKU โดยตรง": { en: "Search products / type SKU directly", my: "ကုန်ပစ္စည်းရှာ / SKU တိုက်ရိုက်ရိုက်" },
  "จำนวนใบ":            { en: "Label count",        my: "တံဆိပ် အရေအတွက်" },
  'ค้นหาสินค้าหรือพิมพ์ SKU ด้านบน แล้วกด Enter หรือ "+ เพิ่ม"': { en: 'Search or type SKU above, then press Enter or "+ Add"', my: 'အပေါ်တွင် ရှာ သို့မဟုတ် SKU ရိုက်ပြီး Enter သို့မဟုတ် "+ ထည့်" နှိပ်ပါ' },
  "เพิ่ม":              { en: "Add",                my: "ထည့်" },
  "เช่น HL00170 หรือ ชื่อสินค้า...": { en: "e.g. HL00170 or product name…", my: "ဥပမာ HL00170 သို့မဟုတ် ကုန်အမည်…" },
  // — เพิ่มสินค้าใหม่ (AddProductView) —
  "หมวดหมู่ *":         { en: "Category *",         my: "အမျိုးအစား *" },
  "…หรือพิมพ์หมวดใหม่": { en: "…or type a new category", my: "…သို့မဟုတ် အမျိုးအစားအသစ် ရိုက်" },
  "พิมพ์ชื่อสินค้าเพื่อหารหัส (เช่น มะกอก → OL)": { en: "Type a product name to find its prefix (e.g. olive → OL)", my: "prefix ရှာရန် ကုန်အမည် ရိုက် (ဥပမာ သံလွင် → OL)" },
  "พิมพ์ Prefix เช่น OL": { en: "Type prefix, e.g. OL", my: "prefix ရိုက် ဥပမာ OL" },
  "ขึ้นแบบใหม่ ▸":      { en: "New design ▸",       my: "ဒီဇိုင်းအသစ် ▸" },
  "เปลี่ยน ✕":          { en: "Change ✕",           my: "ပြောင်း ✕" },
  "ค้นหาแบบเดิม (รหัส/ชื่อ)": { en: "Search existing design (code/name)", my: "ရှိပြီးဒီဇိုင်း ရှာ (ကုဒ်/အမည်)" },
  "เช่น 01":            { en: "e.g. 01",            my: "ဥပမာ 01" },
  "ค้นหาสี (เช่น แดง, ชมพู) หรือพิมพ์รหัส": { en: "Search color (e.g. red, pink) or type code", my: "အရောင်ရှာ (ဥပမာ အနီ, ပန်းရောင်) သို့မဟုတ် ကုဒ်ရိုက်" },
  "รหัส SKU ที่จะสร้าง": { en: "SKU to be created", my: "ဖန်တီးမည့် SKU" },
  "SKU นี้มีอยู่แล้วในระบบ": { en: "This SKU already exists", my: "ဤ SKU ရှိပြီးသား" },
  "กำลังตรวจรหัสซ้ำ…":  { en: "Checking for duplicates…", my: "ထပ်နေမနေ စစ်နေသည်…" },
  "SKU นี้มีใน ZORT แล้ว (ยังไม่ sync)": { en: "This SKU already exists in ZORT (not synced yet)", my: "ဤ SKU ZORT တွင် ရှိပြီး (မ sync ရသေး)" },
  "รหัสนี้ใช้ได้":       { en: "This code is available", my: "ဤကုဒ် သုံးလို့ရ" },
  "เลือก Prefix/แบบ + Variant ให้ครบ": { en: "Select prefix/design + variant", my: "prefix/ဒီဇိုင်း + variant ရွေးပါ" },
  "เช่น ป๊อปปี้B.":     { en: "e.g. PoppyB.",       my: "ဥပမာ PoppyB." },
  "ราคาส่ง (บาท)":      { en: "Wholesale price (THB)", my: "လက်ကား ဈေး (ဘတ်)" },
  "พิมพ์ชื่อร้าน/ซัพพลายเออร์ (ถ้ามี)": { en: "Type shop/supplier name (if any)", my: "ဆိုင်/ပေးသွင်းသူ အမည် ရိုက် (ရှိလျှင်)" },
  "พิมพ์ชื่อร้าน/ซัพพลายเออร์ (มีชื่อเดิมให้เลือก)": { en: "Type shop/supplier name (existing names available)", my: "ဆိုင်/ပေးသွင်းသူ အမည် ရိုက် (ရှိပြီးအမည် ရွေးနိုင်)" },
  "จำนวนเริ่มต้น + คลังที่เก็บ": { en: "Initial quantity + storage warehouse", my: "ကနဦး အရေအတွက် + သိုလှောင်ဂိုဒေါင်" },
  "เพิ่มอีก":           { en: "Add another",        my: "နောက်ထပ် ထည့်" },
  "กำลังบันทึก…":       { en: "Saving…",            my: "သိမ်းနေသည်…" },
};

// ── ค่าภาษาปัจจุบัน: อ่านจาก localStorage ตอนโหลด (ก่อน React จะ render ครั้งแรก) ──
(function initLang() {
  let l = DMJ_DEFAULT_LANG;
  try { l = localStorage.getItem("dmj_lang") || DMJ_DEFAULT_LANG; } catch (_) {}
  if (DMJ_LANG_CODES.indexOf(l) < 0) l = DMJ_DEFAULT_LANG;
  try { window.dmjLang = l; } catch (_) {}
  try { document.documentElement.setAttribute("lang", l); } catch (_) {}
})();

function getLang() {
  try { return window.dmjLang || DMJ_DEFAULT_LANG; } catch (_) { return DMJ_DEFAULT_LANG; }
}

function setLang(code) {
  if (DMJ_LANG_CODES.indexOf(code) < 0) return;
  try { window.dmjLang = code; } catch (_) {}
  try { localStorage.setItem("dmj_lang", code); } catch (_) {}
  try { document.documentElement.setAttribute("lang", code); } catch (_) {}
  // แจ้งทุก component ที่ subscribe (App + LangSwitcher) ให้ re-render
  try { window.dispatchEvent(new Event("dmj:langchange")); } catch (_) {}
}

// t("ข้อความไทย", { name: "..." }) — แปลถ้ามีคำแปล ไม่งั้นคืนไทย · แทนที่ {var} ด้วย vars[var]
function t(key, vars) {
  let out = key;
  const lang = getLang();
  if (lang !== "th" && key != null) {
    const e = DMJ_I18N[key];
    if (e && e[lang]) out = e[lang];
  }
  if (vars && typeof out === "string") {
    out = out.replace(/\{(\w+)\}/g, function (m, k) {
      return (vars[k] != null) ? String(vars[k]) : m;
    });
  }
  return out;
}

// hook: คืนภาษาปัจจุบัน + subscribe การเปลี่ยนภาษา (ให้ component re-render เอง)
// App เรียกตัวนี้ 1 ครั้ง → เปลี่ยนภาษาแล้ว re-render ทั้งต้นไม้ → ทุก t() อ่านค่าใหม่
function useLang() {
  const [l, setL] = React.useState(getLang());
  React.useEffect(function () {
    const h = function () { setL(getLang()); };
    window.addEventListener("dmj:langchange", h);
    // เผื่อค่าเปลี่ยนระหว่าง first render กับ effect mount
    if (getLang() !== l) setL(getLang());
    return function () { window.removeEventListener("dmj:langchange", h); };
  }, []); // eslint-disable-line
  return l;
}

if (typeof module !== "undefined") {
  module.exports = { DMJ_LANGS, DMJ_LANG_CODES, DMJ_I18N, DMJ_DEFAULT_LANG, getLang, setLang, t };
}
