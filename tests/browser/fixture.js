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

  function monthly(base) {
    // สร้าง series 6 เดือน มี qty/sales เพิ่มขึ้นเรื่อย ๆ (มีเทรนด์ให้ chart วาด)
    return months.map((m, i) => ({ month: m, qty: base + i * 3, sales: (base + i * 3) * 100 }));
  }

  const products = [
    {
      sku: 'VAS001', name: 'แจกันแก้วใส ทรงสูง', cat: 'แจกันแก้ว', tag: 'ACME',
      qty: 40, qtyStore: 15, qtyWH: 25, price: 250, soldQty: 60, soldRev: 15000,
      isMTO: false, imageUrl: '', vendor: 'ACME', lastSupplier: 'ACME',
      lastStockInDate: monthKey(1).split('/').reverse().join('-') + '-01',
      threshold: 36, monthly: monthly(8),
    },
    {
      sku: 'FLW002', name: 'ดอกไม้ประดิษฐ์ สีแดง', cat: 'ดอกไม้', tag: 'BLOOM',
      qty: 8, qtyStore: 3, qtyWH: 5, price: 120, soldQty: 90, soldRev: 10800,
      isMTO: false, imageUrl: '', vendor: 'BLOOM', lastSupplier: 'BLOOM',
      lastStockInDate: monthKey(2).split('/').reverse().join('-') + '-15',
      threshold: 36, monthly: monthly(12),
    },
    {
      sku: 'DEC003', name: 'ของตกแต่งเรซิ่น รูปนก', cat: 'เรซิ่นและอื่นๆ', tag: 'CRAFT',
      qty: 120, qtyStore: 100, qtyWH: 20, price: 80, soldQty: 4, soldRev: 320,
      isMTO: false, imageUrl: '', vendor: 'CRAFT', lastSupplier: 'CRAFT',
      lastStockInDate: '2024-01-01', threshold: 36, monthly: monthly(1),
    },
    {
      sku: 'MTO900', name: 'จัดช่อพิเศษ #1 งานแต่ง', cat: 'งานพิเศษ', tag: '',
      qty: 0, qtyStore: 0, qtyWH: 0, price: 1500, soldQty: 5, soldRev: 7500,
      isMTO: true, imageUrl: '', monthly: monthly(2),
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
    { jobId: 'MTO-202506001', date: '01/06/2025', jobName: 'จัดช่อพิเศษ งานแต่ง', customer: 'คุณเอ',
      price: 1500, imageUrl: '', status: 'กำลังจัด', closedAt: '', items: [] },
    { jobId: 'MTO-202505009', date: '20/05/2025', jobName: 'จัดกระเช้าปีใหม่', customer: 'บริษัท B',
      price: 3000, imageUrl: '', status: 'เสร็จแล้ว', closedAt: '20/05/2025 16:00', items: [] },
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
