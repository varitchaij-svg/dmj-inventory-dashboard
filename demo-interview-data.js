// ══════════════════════════════════════════════════════════════════════════
// DEMO-INTERVIEW MOCK DATA + FETCH INTERCEPTOR
// ══════════════════════════════════════════════════════════════════════════
// ข้อมูลทั้งหมดในไฟล์นี้เป็น "ข้อมูลสมมติ" ล้วน (ชื่อลูกค้า/ซัพพลายเออร์/ยอดขาย/ราคา
// ถูกสุ่มสร้างขึ้นใหม่ทั้งหมด) สร้างขึ้นเพื่อสาธิตแอปตอนสัมภาษณ์งานเท่านั้น
// ไม่มีการเชื่อมต่อ ZORT API หรือ Google Sheets จริงใดๆ — fetch ทุกคำขอที่มุ่งไปยัง
// backend จะถูกดักและตอบด้วยข้อมูลสมมติในไฟล์นี้แทน (ดู attachFetchStub ท้ายไฟล์)
(function () {
  "use strict";

  // ── seeded PRNG (deterministic — ตัวเลขสุ่มแต่คงที่ทุกครั้งที่เปิดหน้า) ──
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
    return h;
  }
  function rngFor(key) { return mulberry32(hashSeed(key)); }

  function monthKey(offset) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - offset);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  const months = [5, 4, 3, 2, 1, 0].map(monthKey); // เก่า→ใหม่ 6 เดือนล่าสุด
  const monthLabels = months.slice();

  // ── โครงสร้างหมวดหมู่สินค้า (คงไว้ตามระบบจริง) ──
  const CATS = ["TREE", "VG", "LP", "VASE", "BK", "BQ"];
  const PREFIX = { TREE: "TR", VG: "VG", LP: "LP", VASE: "VS", BK: "BK", BQ: "BQ" };
  // ชื่อสินค้าสมมติต่อหมวด (แฟนตาซีล้วน ไม่อ้างอิงสินค้าจริง)
  const NAME_POOL = {
    TREE: ["ต้นไทรใบเล็กประดิษฐ์ 150ซม.", "ต้นมะกอกประดิษฐ์กระถางหวาย", "ต้นปาล์มประดิษฐ์เขตร้อน", "ต้นบอนไซประดิษฐ์มินิ", "ต้นไผ่ประดิษฐ์มงคล"],
    VG:   ["พวงใบไม้เขียวแขวนผนัง", "เถาวัลย์ประดิษฐ์พันเสา", "ใบมอนสเตอร่าเดี่ยวปักแจกัน", "พุ่มไม้เตี้ยกระถางกลม", "ใบยูคาลิปตัสประดิษฐ์ (มัด)"],
    LP:   ["ดอกไม้เดี่ยวกลีบผ้าไหมสีขาว", "ก้านดอกป๊อปปี้เทียม", "ดอกทิวลิปเดี่ยวปักแจกัน", "ดอกกุหลาบเดี่ยวประดิษฐ์", "ดอกลิลลี่เดี่ยวผ้าซาติน"],
    VASE: ["แจกันแก้วทรงกระบอก", "แจกันเซรามิกลายดอก", "แจกันปากบานทรงคลาสสิก", "แจกันดินเผาสไตล์ญี่ปุ่น", "แจกันแก้วขาวขุ่นทรงหยดน้ำ"],
    BK:   ["ตะกร้าหวายใส่ดอกไม้", "ตะกร้าไม้สไตล์วินเทจ", "ตะกร้าจัดกระเช้าของขวัญ", "ตะกร้าผ้าลินินแต่งริบบิ้น", "ตะกร้าเหล็กดัดฉลุลาย"],
    BQ:   ["ช่อดอกไม้ประดิษฐ์งานแต่ง", "ช่อดอกไม้จัดโต๊ะรับแขก", "ช่อดอกไม้ของขวัญวันเกิด", "ช่อดอกไม้มินิถือถ่ายรูป", "ช่อดอกไม้จัดพวงหรีด"],
  };
  // ราคาฐาน/ต้นทุนโดยประมาณต่อหมวด (บาท) — ไม่อิงข้อมูลจริง
  const BASE_PRICE = { TREE: 850, VG: 260, LP: 150, VASE: 480, BK: 320, BQ: 590 };
  const BASE_COST_RATIO = 0.55; // ต้นทุน ~55% ของราคาขาย โดยประมาณ
  // ซัพพลายเออร์สมมติ (ชื่อบริษัทแฟนตาซี ไม่ใช่ชื่อจริง)
  const SUPPLIERS = ["กรีนดีไซน์ จำกัด", "สวนสวยซัพพลาย", "บ้านใบไม้เทรดดิ้ง", "ศิลป์ประดิษฐ์ จำกัด", "ผู้จัดจำหน่าย A", "ผู้จัดจำหน่าย B"];

  const products = [];
  CATS.forEach((cat, ci) => {
    NAME_POOL[cat].forEach((name, ni) => {
      const sku = `${PREFIX[cat]}${String(ni + 1).padStart(2, "0")}${String(ci * 5 + ni + 1).padStart(3, "0")}`;
      const rng = rngFor(sku);
      const price = Math.round((BASE_PRICE[cat] * (0.75 + rng() * 0.6)) / 5) * 5;
      const cost = Math.round(price * (BASE_COST_RATIO + rng() * 0.1));
      const qtyStore = Math.round(rng() * 40);
      const qtyWH = Math.round(rng() * 80);
      const threshold = 20 + Math.round(rng() * 40);
      // 4 ใน 30 รายการ = dead stock (ไม่ขยับ 60+ วัน) กระจายตามหมวด
      const isDead = (ci * 5 + ni) % 7 === 3;
      const daysAgo = isDead ? 65 + Math.round(rng() * 90) : Math.round(rng() * 40);
      const lastStockInDate = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
      const monthly = months.map((m, i) => {
        const seasonal = 1 + 0.25 * Math.sin((i / 6) * Math.PI * 1.3 + ci); // เพิ่ม pattern ตามฤดูกาล
        const qty = Math.max(1, Math.round((6 + rng() * 10) * seasonal + i * 0.6));
        return { month: m, qty, sales: qty * price };
      });
      const soldQty = monthly.reduce((s, m) => s + m.qty, 0);
      const soldRev = monthly.reduce((s, m) => s + m.sales, 0);
      const supplier = SUPPLIERS[(ci + ni) % SUPPLIERS.length];
      products.push({
        sku, name, cat, tag: supplier, vendor: supplier, lastSupplier: supplier,
        qty: qtyStore + qtyWH, qtyStore, qtyWH, price, cost,
        soldQty, soldRev, isMTO: false, imageUrl: "",
        lastStockInDate, threshold, monthly,
        frontStoreCheckedAt: new Date(Date.now() - Math.round(rng() * 20) * 86400000).toISOString(),
      });
    });
  });

  // ── mtoJobs (งานจัดพิเศษ) — ชื่อลูกค้าสมมติ "ลูกค้า A/B/C…" ──
  const CUSTOMER_NAMES = ["ลูกค้า A", "ลูกค้า B", "ลูกค้า C", "ลูกค้า D", "ลูกค้า E", "ลูกค้า F"];
  const MTO_STATUS = ["กำลังจัด", "กำลังจัด", "เสร็จแล้ว", "เสร็จแล้ว", "เสร็จแล้ว", "กำลังจัด"];
  const mtoJobs = CUSTOMER_NAMES.map((customer, i) => {
    const rng = rngFor("mto" + i);
    const d = new Date(Date.now() - (i * 5 + Math.round(rng() * 3)) * 86400000);
    const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const jobNames = ["ชุดของขวัญวันเกิด", "ช่อดอกไม้งานแต่ง", "กระเช้าของขวัญปีใหม่", "พวงหรีดดอกไม้สด(เทียม)", "ช่อรับปริญญา", "จัดดอกไม้งานเลี้ยง"];
    return {
      jobId: `MTO-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(100 + i)}`,
      date: dateStr, jobName: jobNames[i], customer,
      price: 800 + Math.round(rng() * 2200 / 50) * 50,
      imageUrl: "", status: MTO_STATUS[i],
      closedAt: MTO_STATUS[i] === "เสร็จแล้ว" ? dateStr + " 16:00" : "",
      items: [],
    };
  });

  // ── orders (รายการสั่งของ ระหว่างคลัง↔หน้าร้าน) ──
  const orderSkus = products.filter((_, i) => i % 4 === 0).slice(0, 10);
  const orders = orderSkus.map((p, i) => {
    const rng = rngFor("order" + i);
    const d = new Date(Date.now() - Math.round(rng() * 10) * 86400000);
    const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const status = i % 3 === 0 ? "รอ" : (i % 3 === 1 ? "สำเร็จ" : "ส่งแล้ว");
    const orderQty = 5 + Math.round(rng() * 25);
    return {
      id: "R" + (100 + i), type: i % 2 === 0 ? "รอขึ้นรถ" : "หิ้ว", date: dateStr, status,
      from: "สาย5", to: "หน้าร้าน", sku: p.sku, name: p.name,
      orderQty, preparedQty: status === "รอ" ? Math.round(orderQty * rng()) : orderQty,
      printFlag: status === "รอ" ? "" : "printed",
    };
  });

  // ── shipments (รายการโอนสินค้า) ──
  const shipSkus = products.filter((_, i) => i % 5 === 1).slice(0, 8);
  const shipments = shipSkus.map((p, i) => {
    const rng = rngFor("ship" + i);
    const d = new Date(Date.now() - (i * 2 + 1) * 86400000);
    const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const received = i % 3 !== 0;
    const qty = 5 + Math.round(rng() * 20);
    return {
      id: "S" + (200 + i), refNum: `TF-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(i + 1).padStart(3, "0")}`,
      date: dateStr, status: "สำเร็จ", from: "คลังสินค้าสาย5", to: "ดูเหมือนจริง",
      sku: p.sku, name: p.name, qty, image: "",
      receivedQty: received ? qty : null, receivedStatus: received ? "รับครบ" : "รอรับ",
      receivedAt: received ? dateStr + " 10:20" : "", receivedBy: received ? "frontstore" : "",
      preparedBy: i % 2 === 0 ? "warehouse" : "employee",
    };
  });

  // ── transfers (ประวัติโอน สำหรับกราฟ) ──
  const transfers = months.map((m, i) => {
    const p = products[(i * 3) % products.length];
    return { refNum: "TF-" + i, date: "01/" + m, type: "โอน", sku: p.sku, name: p.name, qty: 15 + i * 3 };
  });

  // ── purchases (รายการซื้อสินค้า) — 2-3 ซัพพลายเออร์ต่อ SKU เดียวกัน เพื่อโชว์ตรรกะเทียบราคา ──
  const compareSkus = [products[2], products[8], products[15], products[22]]; // 1 ตัวแทนแต่ละกลุ่มหมวด
  const purchases = [];
  compareSkus.forEach((p, pi) => {
    const supplierSet = [SUPPLIERS[pi % SUPPLIERS.length], SUPPLIERS[(pi + 1) % SUPPLIERS.length], SUPPLIERS[(pi + 3) % SUPPLIERS.length]];
    supplierSet.forEach((sup, si) => {
      const rng = rngFor(p.sku + sup);
      const d = new Date(Date.now() - (10 + pi * 7 + si * 3) * 86400000);
      const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      purchases.push({
        poNum: `PO-${String(100 + pi * 3 + si)}`, supplier: sup, date: dateStr,
        status: "รับแล้ว", warehouse: "สาย5", sku: p.sku, name: p.name,
        qty: 50 + Math.round(rng() * 100),
        unitPrice: Math.round(p.cost * (0.9 + rng() * 0.25)),
      });
    });
  });
  // เติมรายการซื้อทั่วไปอีกเล็กน้อยให้ SupplierView มีข้อมูลครบทุก supplier
  SUPPLIERS.forEach((sup, si) => {
    const p = products[(si * 4 + 1) % products.length];
    const rng = rngFor("gen" + sup);
    const d = new Date(Date.now() - (20 + si * 5) * 86400000);
    const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    purchases.push({
      poNum: `PO-${String(200 + si)}`, supplier: sup, date: dateStr, status: "รับแล้ว",
      warehouse: "สาย5", sku: p.sku, name: p.name,
      qty: 30 + Math.round(rng() * 60), unitPrice: Math.round(p.cost * (0.95 + rng() * 0.15)),
    });
  });

  // ── storage (ตำแหน่งจัดเก็บ) ──
  const storageSkus = products.slice(0, 12);
  const productLockMap = {}, verifiedLockMap = {}, shelves = [];
  const shelfKeys = ["A1", "A2", "A3", "B1", "B2"];
  storageSkus.forEach((p, i) => {
    const shelf = shelfKeys[i % shelfKeys.length];
    const lock = `${shelf}/${String((i % 5) + 1).padStart(2, "0")}`;
    productLockMap[p.sku] = [lock];
    verifiedLockMap[lock] = (verifiedLockMap[lock] || []).concat([{ sku: p.sku, qty: p.qtyWH }]);
  });
  shelfKeys.forEach(key => {
    const locks = Object.values(productLockMap).flat().filter(l => l.startsWith(key + "/"));
    shelves.push({ key, locks: [...new Set(locks)] });
  });
  const unassigned = products.slice(12, 15).map(p => ({ sku: p.sku, qty: p.qtyWH }));

  // ── monthlyByCat / dailyByCat (สำหรับ Overview/Trends charts) ──
  const monthlyByCat = {};
  months.forEach((m, i) => {
    monthlyByCat[m] = {};
    CATS.forEach((c, ci) => {
      const catProducts = products.filter(p => p.cat === c);
      monthlyByCat[m][c] = catProducts.reduce((s, p) => s + (p.monthly[i] ? p.monthly[i].sales : 0), 0);
    });
  });
  const dailyByCat = {};
  const days = [6, 5, 4, 3, 2, 1, 0].map(off => {
    const d = new Date(); d.setDate(d.getDate() - off);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  });
  days.forEach((dk, di) => {
    const rng = rngFor(dk);
    dailyByCat[dk] = {};
    CATS.forEach((c, ci) => { dailyByCat[dk][c] = Math.round((300 + ci * 120) * (0.7 + rng() * 0.6)); });
  });

  const totals = {
    totalStockValue: products.reduce((s, p) => s + p.cost * (p.qtyStore + p.qtyWH), 0),
    totalSoldRev: products.reduce((s, p) => s + p.soldRev, 0),
    totalSoldQty: products.reduce((s, p) => s + p.soldQty, 0),
    totalProfit: products.reduce((s, p) => s + (p.price - p.cost) * p.soldQty, 0),
  };
  const thresholds = { default: 30, overrides: {} };
  CATS.forEach(c => { thresholds.overrides[c] = 20 + CATS.indexOf(c) * 4; });

  // ── deadstock (action=getDeadStock) ──
  const deadStockItems = products
    .filter(p => {
      const days = Math.round((Date.now() - new Date(p.lastStockInDate).getTime()) / 86400000);
      return days >= 60 && p.qtyStore > 0;
    })
    .map(p => {
      const days = Math.round((Date.now() - new Date(p.lastStockInDate).getTime()) / 86400000);
      return {
        sku: p.sku, name: p.name, qtyFront: p.qtyStore, qtyWH: p.qtyWH,
        deadMonths: Math.round(days / 30), lastTransferDate: p.lastStockInDate.split("-").reverse().join("/"),
      };
    });

  // ── audit log (action=getAuditLog) ──
  const AUDIT_ACTIONS = ["อัปเดตสต็อก", "โอนสินค้า", "เพิ่มสินค้าใหม่", "แก้ไขเกณฑ์แจ้งเตือน", "ปิดงานจัดพิเศษ"];
  const AUDIT_ACTORS = ["owner", "employee1", "warehouse1", "frontstore1"];
  const auditRows = Array.from({ length: 18 }, (_, i) => {
    const rng = rngFor("audit" + i);
    const p = products[Math.round(rng() * (products.length - 1))];
    const d = new Date(Date.now() - i * 6 * 3600000);
    const ts = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const action = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length];
    return { ts, actor: AUDIT_ACTORS[i % AUDIT_ACTORS.length], action, sku: p.sku, detail: `${action} — ${p.name}` };
  });

  const FIXTURE = {
    products, orders, shipments, mtoJobs, transfers, purchases,
    storage: { productLockMap, verifiedLockMap, shelves, unassigned },
    transferStats: { "โอน": { count: transfers.length, qty: transfers.reduce((s, t) => s + t.qty, 0) }, "ปรับ": { count: 1, qty: 3 }, "ยกมา": { count: 0, qty: 0 } },
    stockCheckRequests: [], recentCountedSkus: [],
    monthLabels, monthlyByCat, dayLabels: days, dailyByCat,
    totals, thresholds, mtoGroups: [],
    updatedAt: {
      product: new Date().toISOString(), dailysales: new Date().toISOString(),
      monthlysales: new Date().toISOString(), transferDetail: new Date().toISOString(),
      transactionDetail: new Date().toISOString(),
    },
    lastModified: Date.now(),
  };

  window.__DMJ_DEMO_FIXTURE = FIXTURE;
  window.__DMJ_DEMO_DEADSTOCK = { items: deadStockItems };
  window.__DMJ_DEMO_AUDITLOG = { rows: auditRows };

  // ── seed localStorage ให้แอปแสดงข้อมูลได้ทันทีตั้งแต่ frame แรก ──
  try {
    localStorage.setItem("dmj_dashboard_data_v1", JSON.stringify(FIXTURE));
    localStorage.setItem("dmj_dashboard_source_v1", "sheet");
  } catch (e) {}

  // ══════════════════════════════════════════════════════════════════════
  // Fetch interceptor — ตัดการเชื่อมต่อเครือข่ายจริงทั้งหมดสำหรับ backend calls
  // (asset ในหน้าเว็บเอง เช่น ui.jsx/views-*.jsx/app.jsx/logo.png ยังโหลดปกติ
  //  เพราะเป็น relative path บน origin เดียวกัน ไม่ใช่ backend)
  // ══════════════════════════════════════════════════════════════════════
  function attachFetchStub() {
    const realFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const body = (init && init.body) || "";
      const isBackendCall = /script\.google|macros\/s\/|mock\.local|action=|verifyPin/i.test(url) || /verifyPin/i.test(String(body));
      if (!isBackendCall) return realFetch(input, init); // relative asset (jsx/png/manifest) → ผ่านปกติ

      if (/verifyPin/i.test(url) || /verifyPin/i.test(String(body))) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } }));
      }
      if (/action=getDeadStock/i.test(url)) {
        return Promise.resolve(new Response(JSON.stringify(window.__DMJ_DEMO_DEADSTOCK), { headers: { "Content-Type": "application/json" } }));
      }
      if (/action=getAuditLog/i.test(url)) {
        return Promise.resolve(new Response(JSON.stringify(window.__DMJ_DEMO_AUDITLOG), { headers: { "Content-Type": "application/json" } }));
      }
      if (init && init.method === "POST") {
        // ตอบ success จำลองสำหรับทุก write action (โอนสินค้า/ปิดงาน/เพิ่มสินค้าฯลฯ) — ไม่แตะ backend จริง
        return Promise.resolve(new Response(JSON.stringify({ success: true, ok: true, data: {}, lastModified: Date.now() }), { headers: { "Content-Type": "application/json" } }));
      }
      // GET payload หลัก (รวม action=orders ด้วย เพราะ fixture มี key "orders" อยู่แล้ว)
      const payload = Object.assign({}, FIXTURE, { lastModified: Date.now() });
      return Promise.resolve(new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } }));
    };
  }
  attachFetchStub();
})();
