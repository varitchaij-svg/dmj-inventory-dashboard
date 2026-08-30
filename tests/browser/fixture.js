// ── Mock data fixture สำหรับ headless browser test ──────────────────────────
// รูปแบบเดียวกับที่ Google Apps Script (doGet) ส่งกลับ — ใช้ seed เข้า localStorage
// + stub fetch เพื่อทดสอบ full app โดยไม่ต้องต่อ backend จริง (ไม่มี secret/ZORT/network)
// เดือนถูกคำนวณจากวันที่ปัจจุบัน เพื่อให้กราฟ/เทรนด์มีข้อมูลเดือนล่าสุดเสมอ (ไม่ค้างปีเก่า)
(function () {
  function monthKey(offset) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - offset);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  // 6 เดือนล่าสุด เก่า→ใหม่
  const months = [5, 4, 3, 2, 1, 0].map(monthKey);
  const monthLabels = months.slice();

  // ยอดรายเดือนแบบ "ย่อ" แบบเดียวกับที่ GAS ส่งจริง: [ดัชนีเดือนใน monthLabels, qty, sales]
  // ตั้งใจใช้รูปแบบย่อในฟิกซ์เจอร์ เพื่อให้เทสต์เดินผ่านโค้ดกาง (expandMonthlyCompact) จริง
  // ถ้าใส่เป็น monthly เต็มไว้ เทสต์จะผ่านแม้โค้ดกางพัง = คุมไม่ได้จริง
  function monthlyCompact(base) {
    // series 6 เดือน qty/sales เพิ่มขึ้นเรื่อย ๆ (มีเทรนด์ให้ chart วาด)
    return months.map((m, i) => [i, base + i * 3, (base + i * 3) * 100]);
  }

  const products = [
    {
      sku: 'VAS001', name: 'แจกันแก้วใส ทรงสูง', cat: 'แจกันแก้ว', tag: 'ACME',
      qty: 40, qtyStore: 15, qtyWH: 25, price: 250, soldQty: 60, soldRev: 15000,
      isMTO: false, imageUrl: '', vendor: 'ACME', lastSupplier: 'ACME',
      lastStockInDate: monthKey(1).split('/').reverse().join('-') + '-01',
      threshold: 36, mo: monthlyCompact(8),
    },
    {
      sku: 'FLW002', name: 'ดอกไม้ประดิษฐ์ สีแดง', cat: 'ดอกไม้', tag: 'BLOOM',
      qty: 8, qtyStore: 3, qtyWH: 5, price: 120, soldQty: 90, soldRev: 10800,
      isMTO: false, imageUrl: '', vendor: 'BLOOM', lastSupplier: 'BLOOM',
      lastStockInDate: monthKey(2).split('/').reverse().join('-') + '-15',
      threshold: 36, mo: monthlyCompact(12),
    },
    {
      sku: 'DEC003', name: 'ของตกแต่งเรซิ่น รูปนก', cat: 'เรซิ่นและอื่นๆ', tag: 'CRAFT',
      qty: 120, qtyStore: 100, qtyWH: 20, price: 80, soldQty: 4, soldRev: 320,
      isMTO: false, imageUrl: '', vendor: 'CRAFT', lastSupplier: 'CRAFT',
      lastStockInDate: '2024-01-01', threshold: 36, mo: monthlyCompact(1),
    },
    {
      sku: 'MTO900', name: 'จัดช่อพิเศษ #1 งานแต่ง', cat: 'งานพิเศษ', tag: '',
      qty: 0, qtyStore: 0, qtyWH: 0, price: 1500, soldQty: 5, soldRev: 7500,
      isMTO: true, imageUrl: '', mo: monthlyCompact(2),
    },
    // ── PIN010-012: หมวดใหม่ "ต้นไม้ประดิษฐ์" ตั้งใจไม่ทับหมวด/สีที่ทดสอบไว้แล้วข้างบน (แดง=FLW002
    // ตัวเดียว, ดอกไม้=FLW002 ตัวเดียว) — ใช้ทดสอบ 2 เรื่องที่เจ้าของขอหลัง merge (ส.ค. 2026):
    // (1) ค้นชื่อ "สน" ต้องขึ้นแค่ PIN010 (ชื่อตรงเป๊ะ) ไม่ใช่ทุกตัวที่สะกดปนคำนี้ (PIN011/PIN012)
    // (2) กรองต่อด้วยสีจากแท็บ 🏷️ หมวด — หมวดนี้มี 3 SKU แต่มีแค่ PIN012 ที่เป็นสี "เงิน"
    { sku: 'PIN010', name: 'สน', cat: 'ต้นไม้ประดิษฐ์', tag: 'GREEN',
      qty: 30, qtyStore: 10, qtyWH: 20, price: 90, soldQty: 10, soldRev: 900,
      isMTO: false, imageUrl: '', vendor: 'GREEN', lastSupplier: 'GREEN',
      lastStockInDate: monthKey(1).split('/').reverse().join('-') + '-01',
      threshold: 20, mo: monthlyCompact(3),
    },
    { sku: 'PIN011', name: 'ต้นสนประดิษฐ์', cat: 'ต้นไม้ประดิษฐ์', tag: 'GREEN',
      qty: 18, qtyStore: 8, qtyWH: 10, price: 150, soldQty: 4, soldRev: 600,
      isMTO: false, imageUrl: '', vendor: 'GREEN', lastSupplier: 'GREEN',
      lastStockInDate: monthKey(2).split('/').reverse().join('-') + '-01',
      threshold: 20, mo: monthlyCompact(1),
    },
    { sku: 'PIN012', name: 'สนใบเงิน', cat: 'ต้นไม้ประดิษฐ์', tag: 'GREEN',
      qty: 12, qtyStore: 4, qtyWH: 8, price: 200, soldQty: 2, soldRev: 400,
      isMTO: false, imageUrl: '', vendor: 'GREEN', lastSupplier: 'GREEN',
      lastStockInDate: monthKey(1).split('/').reverse().join('-') + '-01',
      threshold: 20, mo: monthlyCompact(1),
    },
    // ── CLY040/ORN041: คนละหมวด แต่ชื่อสินค้ามีคำร่วม "มินิ" เหมือนกัน ──
    // ใช้ทดสอบว่าเพิ่มสินค้าใหม่ → หา Prefix จากชื่อ ต้องกรองด้วยหมวดที่เลือกก่อนเสมอ
    // (ค้น "มินิ" ตอนอยู่หมวด "แจกันเซรามิก" ต้องได้ CLY เท่านั้น ห้ามได้ ORN จากหมวด "ของประดับตกแต่ง"
    // แม้ชื่อจะมีคำว่า "มินิ" ตรงกันก็ตาม)
    // ⚠️ ชื่อ CLY040 ห้ามมีคำว่า "แจกัน" — ชนกับ test "ปุ่มลอยส่งคำขอเช็ค…ค้นชื่อ" ที่ค้น "แจกัน"
    // แล้วคาดว่าได้ VAS001+FLW002 พอดี 2 รายการ (ตั้งใจใช้ "โถ" แทน แม้หมวดจะชื่อ "แจกันเซรามิก")
    { sku: 'CLY040', name: 'โถเซรามิกมินิ ทรงกลม', cat: 'แจกันเซรามิก', tag: 'POTTERY',
      qty: 24, qtyStore: 10, qtyWH: 14, price: 60, soldQty: 6, soldRev: 360,
      isMTO: false, imageUrl: '', vendor: 'POTTERY', lastSupplier: 'POTTERY',
      lastStockInDate: monthKey(1).split('/').reverse().join('-') + '-01',
      threshold: 12, mo: monthlyCompact(2),
    },
    { sku: 'ORN041', name: 'ของประดับมินิ ระย้า', cat: 'ของประดับตกแต่ง', tag: 'SPARKLE',
      qty: 30, qtyStore: 12, qtyWH: 18, price: 45, soldQty: 8, soldRev: 360,
      isMTO: false, imageUrl: '', vendor: 'SPARKLE', lastSupplier: 'SPARKLE',
      lastStockInDate: monthKey(1).split('/').reverse().join('-') + '-01',
      threshold: 12, mo: monthlyCompact(2),
    },
  ];

  const orders = [
    // orderedBy/preparedBy = ใครสั่ง/ใครจัด · R3 จงใจไม่มีชื่อผู้จัด (ยังไม่มีใครจัด)
    // ⚠️ ต้องมี `carryMode` ด้วย ไม่ใช่ `type` อย่างเดียว — `type` คือค่าดิบในชีต (คอลัมน์ A)
    //    ส่วนที่ frontend อ่านจริงคือ `carryMode` ที่ readOrders_ แปลงมาให้ ("หิ้ว"→carry)
    //    ขาดไปเมื่อไหร่ = ทุกใบกลายเป็น "ขึ้นรถ" หมด แล้วเส้นทางของหิ้วไม่เคยถูกทดสอบเลย
    //    ทั้งที่หน้าจอยังเรนเดอร์ครบทุกใบเหมือนปกติ · R3=ขึ้นรถ R4=หิ้ว (ต้องขึ้นก่อน R3)
    { id: 'R3', type: 'รอขึ้นรถ', carryMode: 'truck', date: '01/06/2025', status: 'รอ', from: 'สาย5', to: 'หน้าร้าน',
      sku: 'VAS001', name: 'แจกันแก้วใส ทรงสูง', orderQty: 24, preparedQty: 0, printFlag: '',
      orderedBy: 'สมชาย ใจดี (หน้าร้าน)', preparedBy: '' },
    { id: 'R4', type: 'หิ้ว', carryMode: 'carry', date: '01/06/2025', status: 'รอ', from: 'สาย5', to: 'หน้าร้าน',
      sku: 'FLW002', name: 'ดอกไม้ประดิษฐ์ สีแดง', orderQty: 12, preparedQty: 12, printFlag: 'print',
      orderedBy: 'สมชาย ใจดี (หน้าร้าน)', preparedBy: 'สมหญิง ขยัน (คลังสินค้า)' },
    // R5/R6 = จัดเสร็จแล้ว (status "สำเร็จ") → โผล่ในหน้า "สรุปสินค้าออกจากคลัง"
    //   R5 แจกันแก้ว → sticker3 · R6 ดอกไม้ → A4 (เลือกทั้งคู่ = ทดสอบจัดกลุ่ม 2 Format)
    { id: 'R5', type: 'หิ้ว', carryMode: 'carry', date: '02/06/2025', status: 'สำเร็จ', from: 'สาย5', to: 'หน้าร้าน',
      sku: 'VAS001', name: 'แจกันแก้วใส ทรงสูง', orderQty: 6, preparedQty: 6, printFlag: 'print', remaining: 0,
      orderedBy: 'สมชาย ใจดี (หน้าร้าน)', preparedBy: 'สมหญิง ขยัน (คลังสินค้า)' },
    { id: 'R6', type: 'หิ้ว', carryMode: 'carry', date: '02/06/2025', status: 'สำเร็จ', from: 'สาย5', to: 'หน้าร้าน',
      sku: 'FLW002', name: 'ดอกไม้ประดิษฐ์ สีแดง', orderQty: 12, preparedQty: 12, printFlag: 'print', remaining: 0,
      orderedBy: 'สมชาย ใจดี (หน้าร้าน)', preparedBy: 'สมหญิง ขยัน (คลังสินค้า)' },
  ];

  const shipments = [
    { id: 'S3', refNum: 'TF-20250601-001', date: '01/06/2025', status: 'สำเร็จ', from: 'คลังสินค้าสาย5',
      to: 'ดูเหมือนจริง', sku: 'VAS001', name: 'แจกันแก้วใส ทรงสูง', qty: 24, image: '',
      receivedQty: null, receivedStatus: 'รอรับ', receivedAt: '', receivedBy: '', preparedBy: 'warehouse' },
    { id: 'S4', refNum: 'TF-20250601-002', date: '31/05/2025', status: 'สำเร็จ', from: 'คลังสินค้าสาย5',
      to: 'ดูเหมือนจริง', sku: 'FLW002', name: 'ดอกไม้ประดิษฐ์ สีแดง', qty: 10, image: '',
      receivedQty: 10, receivedStatus: 'รับครบ', receivedAt: '31/05/2025 10:20', receivedBy: 'frontstore', preparedBy: 'employee' },
  ];

  const mtoJobs = [
    // assigneeId ตรงกับ window._currentStaffId ที่ harness.html seed ไว้ ('STF001')
    // → งานนี้ต้องโผล่ในการ์ด "งานของฉัน" (MyJobsCard) · แก้ที่ไหนต้องแก้ให้ตรงกัน
    { jobId: 'MTO-202506001', date: '01/06/2025', jobName: 'จัดช่อพิเศษ งานแต่ง', customer: 'คุณเอ',
      price: 1500, imageUrl: '', status: 'กำลังจัด', closedAt: '', items: [],
      assigneeId: 'STF001', assigneeName: 'สมชาย' },
    // ปิดงานแล้ว + เป็นของคนอื่น → ต้อง **ไม่** ถูกนับในการ์ด "งานของฉัน"
    { jobId: 'MTO-202505009', date: '20/05/2025', jobName: 'จัดกระเช้าปีใหม่', customer: 'บริษัท B',
      price: 3000, imageUrl: '', status: 'เสร็จแล้ว', closedAt: '20/05/2025 16:00', items: [],
      assigneeId: 'STF002', assigneeName: 'สมหญิง' },
  ];

  const transfers = months.map((m, i) => ({
    refNum: 'TF-' + i, date: '01/' + m, type: 'โอน', sku: 'VAS001', name: 'แจกันแก้วใส ทรงสูง', qty: 10 + i,
  }));

  // ⚠️ readPurchases_ (backend) คืน date เป็น ISO "yyyy-MM-dd" — fixture ต้องใช้รูปแบบเดียวกัน
  // แถวล่าสุด (วันนี้) ทำให้ "ของเข้าใหม่ 30 วัน" + ปุ่ม "บันทึก PDF" โผล่ในเทสต์ (recentIntake)
  const _isoToday = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const purchases = [
    { poNum: 'PO-001', supplier: 'ACME', date: '2025-05-01', status: 'รับแล้ว', warehouse: 'สาย5',
      sku: 'VAS001', name: 'แจกันแก้วใส ทรงสูง', qty: 100, unitPrice: 150 },
    { poNum: 'PO-777', supplier: 'GX2312', date: _isoToday, status: 'รับแล้ว', warehouse: 'สาย5',
      sku: 'VAS001', name: 'แจกันแก้วใส ทรงสูง', qty: 60, unitPrice: 150 },
  ];

  const monthlyByCat = {};
  const dailyByCat = {};
  const cats = ['แจกันแก้ว', 'ดอกไม้', 'เรซิ่นและอื่นๆ'];
  months.forEach((m) => { monthlyByCat[m] = {}; cats.forEach((c, ci) => { monthlyByCat[m][c] = (ci + 1) * 1000 + Math.round(Math.random() * 500); }); });
  const days = [4, 3, 2, 1, 0].map((off) => { const d = new Date(); d.setDate(d.getDate() - off); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; });
  days.forEach((dk) => { dailyByCat[dk] = {}; cats.forEach((c, ci) => { dailyByCat[dk][c] = (ci + 1) * 100; }); });

  window.__DMJ_FIXTURE = {
    products,
    orders,
    shipments,
    mtoJobs,
    transfers,
    purchases,
    // ⚠️ รูปร่างต้องตรงกับที่ buildFullData_ สร้างจริง:
    //    productLockMap/verifiedLockMap = { lockKey: [...] } (คีย์คือ "ล็อค" ไม่ใช่ SKU) ·
    //    shelves = { A, B, locksPerShelf } · unassigned = [sku, ...]
    //    ก่อนหน้านี้ productLockMap กลับข้าง (คีย์เป็น SKU) → แผนผังคลังไม่มีล็อคไหนขึ้นเลย
    //    แต่เทสต์ยังเขียวเพราะเช็คแบบ OR แล้วไปเจอ DEC003 ในรายการ "ยังไม่ระบุล็อค" แทน
    // FLW002 อยู่ที่ "A0" = ช่องของที่ไม่ได้อยู่บนชั้นวางของซอย A (วางพื้น/นอกชั้น)
    storage: {
      // เลขล็อคไม่เติมศูนย์นำหน้า — lockKeyOf_ สร้างจากตัวเลข ("A1/05" ในชีตกลายเป็นคีย์ "A1/5")
      productLockMap:  { 'A1/5': ['VAS001'], 'A0': ['FLW002'] },
      verifiedLockMap: { 'A1/5': [{ sku: 'VAS001', qty: 25, sysQty: 25 }] },
      shelves: { A: 10, B: 10, locksPerShelf: 15 },
      unassigned: ['DEC003'],
    },
    transferStats: { 'โอน': { count: 6, qty: 75 }, 'ปรับ': { count: 1, qty: 3 }, 'ยกมา': { count: 0, qty: 0 } },
    stockCheckRequests: [],
    recentCountedSkus: [],
    monthLabels,
    monthlyByCat,
    dayLabels: days,
    dailyByCat,
    // มูลค่าสต๊อกเป็นราคาขายส่งแล้ว (GAS คูณ wholesaleRatio ให้ก่อนส่ง) — ส่ง ratio มาด้วย
    // เพื่อให้หน้าเว็บติดป้าย "ปลีก −20%" ได้ตรงกับตัวเลขที่โชว์
    totals: { totalStockValue: 250000, totalSoldRev: 33620, totalSoldQty: 159, totalProfit: 6724,
              nSold: 3, wholesaleRatio: 0.8 },
    thresholds: { default: 36, overrides: { 'แจกันแก้ว': 3, 'เรซิ่นและอื่นๆ': 3 } },
    mtoGroups: [],
    updatedAt: { product: new Date().toISOString(), dailysales: new Date().toISOString(),
                 monthlysales: new Date().toISOString(), transferDetail: new Date().toISOString(),
                 transactionDetail: new Date().toISOString() },
    lastModified: Date.now(),
  };
})();

// ── fixture ของระบบลงเวลา (คนละก้อนกับ payload หลัก — มาจาก action POST ไม่ใช่ doGet) ──
// harness ใช้ตอบ attPost() ตาม action · shape ต้องตรงกับที่ views-attendance.jsx อ่านจริง
// (today.events / rows[].events / totals) ไม่งั้นได้แค่หน้าเปล่า ไม่ได้ทดสอบการเรนเดอร์จริง
(function () {
  const today = (function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  })();
  const ev = (type, typeTh, time, siteName) => ({
    id: type + '-' + time, type, typeTh, time, siteName: siteName || 'หน้าร้าน',
    inArea: true, distM: 12, hasPhoto: type === 'in', photo: '', fixed: false,
  });
  const myEvents = [
    ev('in', 'เข้างาน', '08:05'),
    ev('breakStart', 'เริ่มพัก', '12:00'),
    ev('breakEnd', 'กลับจากพัก', '12:45'),
  ];
  window.__DMJ_ATT_FIXTURE = {
    myToday: {
      date: today, staffName: 'สมชาย ใจดี',
      shift: { start: '08:00', end: '17:00', name: 'กะปกติ' },
      allowed: ['out', 'breakStart', 'bathroomStart'],
      events: myEvents,
      summary: { inTime: '08:05', outTime: '', workedMin: 275, lateMin: 5, breakMin: 45, bathroomMin: 0 },
    },
    myAttendanceSummary: {
      month: today.slice(0, 7),
      totals: { workedMin: 2480, daysWorked: 6, lateDays: 1, lateMin: 5, daysAbsent: 0, breakMin: 270, bathroomMin: 25 },
      days: [{ date: today, inTime: '08:05', outTime: '', workedMin: 275, lateMin: 5, absent: false }],
    },
    attendanceToday: {
      date: today,
      rows: [
        { staffId: 'S001', name: 'สมชาย ใจดี', role: 'frontstore', state: 'ทำงานอยู่',
          shift: { start: '08:00', end: '17:00', name: 'กะปกติ' }, events: myEvents,
          summary: { inTime: '08:05', outTime: '', workedMin: 275, lateMin: 5, breakMin: 45, bathroomMin: 0 } },
        { staffId: 'S002', name: 'สมหญิง ขยัน', role: 'warehouse', state: 'พักอยู่',
          shift: { start: '08:00', end: '17:00', name: 'กะปกติ' },
          events: [ev('in', 'เข้างาน', '07:58', 'คลังสินค้าสาย5'), ev('breakStart', 'เริ่มพัก', '12:10', 'คลังสินค้าสาย5')],
          summary: { inTime: '07:58', outTime: '', workedMin: 250, lateMin: 0, breakMin: 20, bathroomMin: 0 } },
        { staffId: 'S003', name: 'มานะ อดทน', role: 'saler', state: 'ยังไม่มา',
          shift: null, events: [], summary: { inTime: '', outTime: '', workedMin: null, lateMin: 0 } },
      ],
    },
    // สรุปทั้งเดือน — ก้อนเดียวกับที่แท็บ "📅 รายงานการเข้างาน" (AttendanceReportView) ใช้
    // ⚠️ **ต้องมี `days[]` จริง** ไม่ใช่แค่ยอดรวม — ทั้งตารางรายวัน ค่าเฉลี่ยเวลาเข้า-ออก และ
    //    กราฟรายสัปดาห์ คำนวณจาก days ทั้งหมด · ถ้า fixture มีแต่ยอดรวม หน้าจะเรนเดอร์ผ่าน
    //    (ไม่ crash) แต่ค่าเฉลี่ยทุกช่องเป็น "—" = เทสต์เขียวโดยไม่ได้ทดสอบส่วนที่ทำใหม่เลย
    attendanceMonthlySummary: (function () {
      const ym = today.slice(0, 7);
      const lastDay = Number(today.slice(8, 10));
      // สร้างรายวันแบบเดียวกับที่ attendanceMonthlySummaryHandler_ ส่งมา (ตัดที่วันนี้เหมือน attMonthRange_)
      const mk = (staff, cfg) => {
        const days = [];
        let daysScheduled = 0, daysPresent = 0, daysWorked = 0, daysAbsent = 0,
            lateDays = 0, lateMin = 0, workedMin = 0, breakMin = 0, breakCount = 0,
            bathroomMin = 0, bathroomCount = 0;
        for (let i = 1; i <= lastDay; i++) {
          const date = ym + '-' + String(i).padStart(2, '0');
          const dow = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, i).getDay();
          const isToday = i === lastDay;
          const off = dow === 0;                       // อาทิตย์ = ไม่มีกะ (วันหยุด)
          const absent = !off && !isToday && i % 9 === 0;  // จงใจให้มีวันขาดอย่างน้อย 1 วัน
          const shift = off ? null : { name: 'กะปกติ', start: '08:00', end: '17:00' };
          const late = (!off && !absent && i % 5 === 0) ? cfg.late : 0;
          const came = !off && !absent;
          const d = {
            date: date, dow: dow, isToday: isToday, isPast: !isToday, absent: absent, shift: shift,
            inTime: came ? cfg.inBase.replace('MM', String(late).padStart(2, '0')) : null,
            outTime: came && !isToday ? cfg.outTime : null,
            workedMin: came && !isToday ? cfg.worked : null,
            lateMin: came ? late : null,
            breakMin: came ? cfg.brk : 0, breakCount: came ? 1 : 0,
            bathroomMin: came ? cfg.bath : 0, bathroomCount: came ? cfg.bathN : 0,
            forgotBreakEnd: false, forgotBathroomEnd: false,
          };
          if (shift) daysScheduled++;
          if (d.inTime) daysPresent++;
          if (d.workedMin != null) { workedMin += d.workedMin; daysWorked++; }
          if (d.lateMin) { lateDays++; lateMin += d.lateMin; }
          if (absent) daysAbsent++;
          breakMin += d.breakMin; breakCount += d.breakCount;
          bathroomMin += d.bathroomMin; bathroomCount += d.bathroomCount;
          days.push(d);
        }
        return Object.assign({}, staff, {
          daysScheduled, daysPresent, daysWorked, daysAbsent, lateDays, lateMin,
          workedMin, breakMin, breakCount, bathroomMin, bathroomCount, days,
        });
      };
      return {
        month: ym, isCurrentMonth: true, lastDate: today,
        rows: [
          mk({ staffId: 'S001', name: 'สมชาย ใจดี', role: 'frontstore' },
             { inBase: '08:MM:00', outTime: '17:05:00', worked: 480, late: 6, brk: 60, bath: 65, bathN: 6 }),
          mk({ staffId: 'S002', name: 'สมหญิง ขยัน', role: 'warehouse' },
             { inBase: '07:MM:00', outTime: '17:20:00', worked: 505, late: 0, brk: 45, bath: 30, bathN: 3 }),
        ],
      };
    })(),
    listActiveStaffNames: { staff: [{ staffId: 'S001', name: 'สมชาย ใจดี' }, { staffId: 'S002', name: 'สมหญิง ขยัน' }] },
  };

  // ── แจ้งเตือนในแอป (กระดิ่ง 🔔) — 2 เรื่อง อ่านแล้ว 1 ยังไม่อ่าน 1 ──
  // unread = 1 → badge ต้องขึ้นเลข 1 · tab ของอันที่ยังไม่อ่านชี้ไป "orders" (มีทุก role)
  window.__DMJ_NOTI_FIXTURE = {
    ok: true,
    unread: 1,
    items: [
      // focus = SKU ที่ต้องพาไปหยุดหลังกด · จงใจเลือก VAS001 ซึ่งเป็นใบ "ขึ้นรถ" = แถวที่ 2
      // (แถวแรกคือ FLW002 ของหิ้ว) → พิสูจน์ว่าเด้งไป "ใบที่ถูก" ไม่ใช่ใบแรกที่เจอเฉย ๆ
      { id: 'n1', ts: Date.now() - 3 * 60000, type: 'order', tab: 'orders', focus: 'VAS001',
        title: '📦 ออเดอร์ใหม่ 12 ชิ้น', body: 'แจกันแก้วใส · VAS001', by: '', read: false },
      // ของโอนมาทั้งชุด = ไม่มี focus (หลาย SKU) แต่มี view → ต้องพาไปแท็บ "รายการสั่งของ"
      // **ตัวกรอง "ส่งแล้ว"** ซึ่งเป็นหน้าเดียวที่กดรับของได้จริง (ไม่ใช่แค่เปิดแท็บทิ้งไว้)
      { id: 'n2', ts: Date.now() - 2 * 3600000, type: 'shipment', tab: 'orders', view: 'shipped',
        title: '🚚 ของโอนมาหน้าร้าน 3 รายการ', body: 'ดอกกุหลาบแดง และอีก 2 รายการ · รอกดรับ',
        by: 'สมหญิง ขยัน (คลังสินค้า)', read: true },
      // ของหมดหน้าร้าน → "สินค้า & สั่ง" ในตัวกรอง 🛒 ควรสั่ง · ใน fixture มีตัวเดียวที่เข้าเกณฑ์
      // (FLW002 หน้าร้าน 3 คลัง 5) — VAS001 หน้าร้าน 15 ต้องถูกกรองออก ใช้พิสูจน์ว่า
      // "ตัวกรองถูกเปิดจริง" ไม่ใช่แค่สลับแท็บมาถึงแล้วโชว์ทุกตัวเหมือนเดิม
      { id: 'n3', ts: Date.now() - 5 * 3600000, type: 'stock', tab: 'categories', view: 'reorder',
        title: '🛒 ของหมดหน้าร้าน 1 รายการ — คลังยังมี สั่งได้เลย',
        body: 'ดอกไม้ประดิษฐ์ สีแดง (คลังมี 5) · เปิดในตัวกรอง "🛒 ควรสั่ง"',
        by: '', read: true },
    ],
  };

  // ── 🏅 ผลงานพนักงาน (action=staffPerf) — 2 คน คนละตำแหน่ง + 1 ชื่อที่จับคู่ไม่ได้ ──
  // ต้องมี 2 role ต่างกัน เพื่อยืนยันว่า UI **แยกกลุ่มตามตำแหน่ง** ไม่ใช่อันดับรวมทั้งร้าน
  // และต้องมี unmatched เพื่อยืนยันว่าการ์ดเตือน "จับคู่ชื่อไม่ได้" ถูกเรนเดอร์จริง
  window.__DMJ_STAFFPERF_FIXTURE = {
    success: true,
    data: {
      month: '2026-08', isCurrentMonth: true, lastDate: '2026-08-05', auditRows: 260,
      cats: [
        { key: 'count',    emoji: '📊', label: 'นับสต็อกคลัง', ops: true,  unit: 'รายการ', skip: false },
        { key: 'transfer', emoji: '🔄', label: 'โอนของ',       ops: true,  unit: 'รายการ', skip: false },
        { key: 'fscheck',  emoji: '🏪', label: 'เช็คหน้าร้าน',  ops: true,  unit: 'รายการ', skip: false },
        { key: 'punch',    emoji: '🕐', label: 'กดลงเวลา',     ops: false, unit: 'ครั้ง',  skip: true },
      ],
      staff: [
        { staffId: 'STF002', name: 'สมหญิง ขยัน', role: 'warehouse', status: 'active', pictureUrl: '',
          total: 148, opsTotal: 148, byCat: { count: 120, transfer: 28, punch: 42 },
          byDay: { '2026-08-01': 60, '2026-08-04': 88 },
          workedMin: 2400, daysWorked: 5, lateDays: 1, lateMin: 12, daysAbsent: 0, perHour: 3.7 },
        { staffId: 'STF001', name: 'สมชาย ใจดี', role: 'frontstore', status: 'active', pictureUrl: '',
          total: 63, opsTotal: 63, byCat: { fscheck: 63, punch: 38 },
          byDay: { '2026-08-03': 63 },
          workedMin: 1980, daysWorked: 4, lateDays: 0, lateMin: 0, daysAbsent: 1, perHour: 1.9 },
        // เซล — ต้องมี saleRevenue/saleBills เพื่อยืนยันว่า UI โชว์ "ยอดขายเป็นเงิน" ไม่ใช่แค่จำนวนใบ
        { staffId: 'STF003', name: 'มาลี ขายเก่ง', role: 'saler', status: 'active', pictureUrl: '',
          total: 40, opsTotal: 40, byCat: { sale: 40, punch: 30 },
          byDay: { '2026-08-02': 40 },
          workedMin: 2100, daysWorked: 5, lateDays: 0, lateMin: 0, daysAbsent: 0, perHour: 1.1,
          saleRevenue: 87500, saleBills: 40 },
      ],
      unmatched: [{ actor: 'พนักงานเก่า (หน้าร้าน)', total: 9 }],
    },
  };

  // ── 👥 ลูกค้า & ยอดซื้อ (action=getCustomerAnalytics) ──
  // ครอบ 3 ปี (ข้อมูลเริ่มกลางปี 2024 เหมือนของจริง) เพื่อให้บล็อก "ลูกค้าใหม่ vs เก่า" มีอะไรให้เทียบ
  // ลูกค้าแต่ละรายจงใจให้ตกคนละกลุ่ม: ใหม่ / ซื้อเพิ่ม / ซื้อลด / กลับมา / หายไป
  // ไม่มี fixture นี้ = CustomerView ทั้งหน้าเรนเดอร์แค่ "ยังไม่มีข้อมูลลูกค้า" (เทสต์เขียวโดยไม่ได้ทดสอบอะไร)
  (function () {
    const months = [];
    for (let y = 2024; y <= 2026; y++) {
      for (let m = 1; m <= 12; m++) {
        if (y === 2024 && m < 3) continue;
        if (y === 2026 && m > 8) continue;
        months.push(String(m).padStart(2, '0') + '/' + y);
      }
    }
    const bm = (obj) => {
      const o = {};
      Object.keys(obj).forEach(k => { o[k] = { total: obj[k], count: 1 }; });
      return o;
    };
    const raw = [
      { key: 'C1', name: 'บริษัท กรีน เฮ้าส์ จำกัด',  byMonth: bm({ '05/2024': 90000, '03/2025': 120000, '03/2026': 190000 }) },
      { key: 'C2', name: 'บริษัท สินแพทย์ จำกัด',     byMonth: bm({ '04/2025': 150000, '04/2026': 60000 }) },
      { key: 'C3', name: 'บริษัท ใหม่ล่าสุด จำกัด',    byMonth: bm({ '02/2026': 80000, '06/2026': 45000 }) },
      { key: 'C4', name: 'บริษัท กลับมาซื้อ จำกัด',    byMonth: bm({ '07/2024': 70000, '05/2026': 52000 }) },
      { key: 'C5', name: 'บริษัท หายไปแล้ว จำกัด',     byMonth: bm({ '06/2025': 110000 }) },
    ];
    const customers = raw.map(c => {
      let total = 0, orderCount = 0, lastMonth = null;
      months.forEach(mk => { const e = c.byMonth[mk]; if (e && e.total > 0) { total += e.total; orderCount += e.count; lastMonth = mk; } });
      return Object.assign({}, c, { total, orderCount, lastMonth, products: [{ sku: 'VAS001', name: 'แจกันแก้วใส', qty: 12, rev: 3600 }] });
    }).sort((a, b) => b.total - a.total);
    window.__DMJ_CUSTOMER_FIXTURE = {
      months, customers,
      grandTotal: customers.reduce((s, c) => s + c.total, 0),
      generatedAt: new Date().toISOString(),
    };
  })();

  // ── 📄 ใบเสนอราคา (action=getQuotationSummary) ──
  // แยกหน้าเจ้าของ (แดชบอร์ด/เทียบเซล) กับพนักงานขาย (หน้าทำงาน "ของฉัน")
  // sale ของ "ของฉัน" ต้องตรงกับชื่อที่ me คืน (harness: name='ทดสอบ ระบบ' → window._currentUserName)
  // ไม่งั้นตัวกรอง "⭐ ของฉัน" จะว่าง แล้วเทสต์เขียวโดยไม่ได้ทดสอบการกรองเลย
  // ⚠️ วันที่ผูกกับ "เดือนปัจจุบัน" แบบไดนามิก — เพราะฝั่ง saler ตัวกรองช่วงเวลา default = เดือนนี้
  //    (เจ้าของสั่ง ส.ค. 2026) · ถ้า hard-code เดือนไว้ พอข้ามเดือนจริง ใบจะถูกกรองหาย เทสต์แดงเอง
  const _qNow = new Date();
  const _qYM = (mb) => { const d = new Date(_qNow.getFullYear(), _qNow.getMonth() - mb, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const _cur = _qYM(0), _prev = _qYM(1);
  window.__DMJ_QUOTE_FIXTURE = {
    items: [
      { id: 'Q1', number: 'QT-' + _cur.replace('-', '') + '001',  status: 'Pending', customer: 'ร้านดอกไม้สวย ๆ',       phone: '081-234-5678', amount: 12450, quotationDate: _cur + '-01',  ageDays: 3,  expireInDays: 12, sale: 'ทดสอบ ระบบ' },
      { id: 'Q2', number: 'QT-' + _prev.replace('-', '') + '002', status: 'Pending', customer: 'บริษัท กรีนการ์เด้น จำกัด', phone: '092-345-6789', amount: 28900, quotationDate: _prev + '-20', ageDays: 20, expireInDays: 5,  sale: 'ทดสอบ ระบบ' },
      { id: 'Q3', number: 'QT-' + _cur.replace('-', '') + '003',  status: 'Success', customer: 'ร้านใบไม้ใบหญ้า',        phone: '093-456-7890', amount: 7850,  quotationDate: _cur + '-02',  ageDays: 2,  expireInDays: 20, sale: 'ทดสอบ ระบบ' },
      { id: 'Q4', number: 'QT-' + _cur.replace('-', '') + '004',  status: 'Pending', customer: 'บริษัท ของเซลอื่น จำกัด',  phone: '084-567-8901', amount: 15600, quotationDate: _cur + '-03',  ageDays: 1,  expireInDays: 14, sale: 'เซลคนอื่น' },
      { id: 'Q5', number: 'QT-' + _prev.replace('-', '') + '005', status: 'Success', customer: 'ลูกค้าของเซลอื่น',        phone: '085-678-9012', amount: 5000,  quotationDate: _prev + '-15', ageDays: 25, expireInDays: 0,  sale: 'เซลคนอื่น' },
    ],
    salesList: ['ทดสอบ ระบบ', 'เซลคนอื่น'],
    statusBreakdown: { Pending: 3, Success: 2 },
    generatedAt: new Date().toISOString(),
  };
})();
