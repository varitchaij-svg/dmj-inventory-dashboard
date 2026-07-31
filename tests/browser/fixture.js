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
  ];

  const orders = [
    { id: 'R3', type: 'รอขึ้นรถ', date: '01/06/2025', status: 'รอ', from: 'สาย5', to: 'หน้าร้าน',
      sku: 'VAS001', name: 'แจกันแก้วใส ทรงสูง', orderQty: 24, preparedQty: 0, printFlag: '' },
    { id: 'R4', type: 'หิ้ว', date: '01/06/2025', status: 'รอ', from: 'สาย5', to: 'หน้าร้าน',
      sku: 'FLW002', name: 'ดอกไม้ประดิษฐ์ สีแดง', orderQty: 12, preparedQty: 12, printFlag: 'print' },
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

  const purchases = [
    { poNum: 'PO-001', supplier: 'ACME', date: '01/05/2025', status: 'รับแล้ว', warehouse: 'สาย5',
      sku: 'VAS001', name: 'แจกันแก้วใส ทรงสูง', qty: 100, unitPrice: 150 },
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
    storage: {
      productLockMap: { VAS001: ['A1/05'], FLW002: ['A2/03'] },
      verifiedLockMap: { 'A1/05': [{ sku: 'VAS001', qty: 25 }] },
      shelves: [{ key: 'A1', locks: ['A1/01', 'A1/05'] }, { key: 'A2', locks: ['A2/03'] }],
      unassigned: [{ sku: 'DEC003', qty: 20 }],
    },
    transferStats: { 'โอน': { count: 6, qty: 75 }, 'ปรับ': { count: 1, qty: 3 }, 'ยกมา': { count: 0, qty: 0 } },
    stockCheckRequests: [],
    recentCountedSkus: [],
    monthLabels,
    monthlyByCat,
    dayLabels: days,
    dailyByCat,
    totals: { totalStockValue: 250000, totalSoldRev: 33620, totalSoldQty: 159, totalProfit: 6724 },
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
    attendanceMonthlySummary: {
      month: today.slice(0, 7),
      rows: [
        { staffId: 'S001', name: 'สมชาย ใจดี', role: 'frontstore', daysWorked: 6, daysAbsent: 0, lateDays: 1, lateMin: 5, workedMin: 2480, bathroomMin: 25 },
        { staffId: 'S002', name: 'สมหญิง ขยัน', role: 'warehouse', daysWorked: 7, daysAbsent: 1, lateDays: 0, lateMin: 0, workedMin: 2900, bathroomMin: 10 },
      ],
    },
    listActiveStaffNames: { staff: [{ staffId: 'S001', name: 'สมชาย ใจดี' }, { staffId: 'S002', name: 'สมหญิง ขยัน' }] },
  };
})();
