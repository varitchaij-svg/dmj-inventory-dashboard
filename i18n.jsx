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
