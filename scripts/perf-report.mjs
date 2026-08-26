// scripts/perf-report.mjs — Phase B backend observability: offline log analyzer
// ─────────────────────────────────────────────────────────────────────────────
// อ่านบรรทัด log ที่ instrumentation ฝั่ง GAS พ่นออกมา (prefix `[perfB]` + `[perf] doGet`)
// แล้วสรุปเป็น 7 metrics ของ Backend Stability Audit v1 · เป็น **เครื่องมือ offline ล้วน**
// ไม่รันบน GAS ไม่กระทบ production เลย — เจ้าของ copy log จาก Executions/Cloud Logging
// มาใส่ไฟล์แล้วรัน:  node scripts/perf-report.mjs <logfile>   (ไม่ใส่ = อ่าน stdin)
//
// ทำไม concurrency ประกอบ offline: GAS สร้าง V8 context ใหม่ทุก request → ไม่มี shared
// memory ให้ทำ counter · และการเขียน counter ลง Cache/Property ทุก request จะกลายเป็น
// bottleneck เสียเอง (สิ่งที่ instrumentation ต้องห้าม) · จึง log START (t) + END (durMs)
// ต่อ request แล้วนับ "ช่วง [t, t+dur] ที่ทับกัน" ที่นี่แทน — ได้ค่า max concurrency ที่แม่นยำ
// โดยไม่แตะ hot path เลย
// ─────────────────────────────────────────────────────────────────────────────

// ── parsers (pure — ทดสอบได้) ────────────────────────────────────────────────

// START: [perfB] START kind=doPost id=abc action=punch t=1699999999999
export function parseStart(line) {
  const m = line.match(/\[perfB\] START kind=(\S+) id=(\S+) action=(\S*) t=(\d+)/);
  if (!m) return null;
  return { kind: m[1], id: m[2], action: m[3] || '', t: Number(m[4]) };
}
// END: [perfB] END kind=doPost id=abc action=punch durMs=123 sessN=2 sessMs=45 lock=punch:w0:h120 ...
export function parseEnd(line) {
  const m = line.match(/\[perfB\] END kind=(\S+) id=(\S+) action=(\S*) durMs=(\d+) sessN=(\d+) sessMs=(\d+)/);
  if (!m) return null;
  return { kind: m[1], id: m[2], action: m[3] || '', durMs: Number(m[4]),
           sessN: Number(m[5]), sessMs: Number(m[6]) };
}
// LOCK: [perfB] LOCK tag=punch got=true waitMs=0 holdMs=120 id=abc
export function parseLock(line) {
  const m = line.match(/\[perfB\] LOCK tag=(\S+) got=(\S+) waitMs=(\d+) holdMs=(\d+)/);
  if (!m) return null;
  return { tag: m[1], got: m[2] === 'true', waitMs: Number(m[3]), holdMs: Number(m[4]) };
}
// ZORT: [perfB] ZORT tag=AddTransfer ms=850 attempt=2 ok=false id=abc
export function parseZort(line) {
  const m = line.match(/\[perfB\] ZORT tag=(\S+) ms=(\d+) attempt=(\d+) ok=(\S+)/);
  if (!m) return null;
  return { tag: m[1], ms: Number(m[2]), attempt: Number(m[3]), ok: m[4] === 'true' };
}
// DRIVE: [perfB] DRIVE tag=attPhoto ms=1400 ok=true id=abc
export function parseDrive(line) {
  const m = line.match(/\[perfB\] DRIVE tag=(\S+) ms=(\d+) ok=(\S+)/);
  if (!m) return null;
  return { tag: m[1], ms: Number(m[2]), ok: m[3] === 'true' };
}
// DOUBLE-RESOLVE: [perfB] DOUBLE-RESOLVE id=abc action=me
export function parseDouble(line) {
  const m = line.match(/\[perfB\] DOUBLE-RESOLVE id=(\S+) action=(\S*)/);
  if (!m) return null;
  return { id: m[1], action: m[2] || '' };
}
// existing perfLogDoGet_: [perf] doGet HIT variant=full_v3 รวม=123ms ส่ง=4200KB ...
export function parseDoGet(line) {
  const m = line.match(/\[perf\] doGet (\S+) variant=(\S+) รวม=(\d+)ms/);
  if (!m) return null;
  return { kind: m[1], variant: m[2], totalMs: Number(m[3]) };
}

// ── stats helpers ────────────────────────────────────────────────────────────
function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}
function stat(nums) {
  const s = nums.slice().sort((a, b) => a - b);
  return { n: s.length, p50: pct(s, 50), p95: pct(s, 95), max: s.length ? s[s.length - 1] : 0 };
}

// max concurrency จาก [start,end] intervals — sweep line
// คืน { max, at, samples } · at = epoch ms ที่ concurrency สูงสุด (ครั้งแรกที่ถึงจุดสูงสุด)
export function maxConcurrency(intervals) {
  const ev = [];
  for (const iv of intervals) {
    if (!(iv.end > iv.start)) { ev.push({ t: iv.start, d: +1 }); ev.push({ t: iv.start + 1, d: -1 }); continue; }
    ev.push({ t: iv.start, d: +1 });
    ev.push({ t: iv.end, d: -1 });
  }
  // ปิด (−1) ก่อนเปิด (+1) ที่เวลาเดียวกัน → ไม่นับ request ที่เพิ่งจบพร้อมอันใหม่ที่เพิ่งเริ่ม
  ev.sort((a, b) => (a.t - b.t) || (a.d - b.d));
  let cur = 0, max = 0, at = 0;
  for (const e of ev) {
    cur += e.d;
    if (cur > max) { max = cur; at = e.t; }
  }
  return { max, at };
}

// ── รวมทุก metric จาก log text ───────────────────────────────────────────────
export function analyze(text) {
  const lines = String(text).split(/\r?\n/);
  const starts = new Map();   // id → {kind,action,t}
  const ends = [];            // {kind,action,id,durMs,sessN,sessMs, t?}
  const intervals = [];
  const byAction = new Map(); // action → durMs[]
  const locks = new Map();    // tag → {wait:[], hold:[], fail:0}
  const zort = new Map();     // tag → {ms:[], retries:0, fail:0}
  const drive = new Map();    // tag → {ms:[], fail:0}
  const doubles = [];
  const doget = new Map();    // kind → count (HIT/MISS/STALE/WAIT-HIT/FRESH)

  for (const line of lines) {
    const st = parseStart(line);
    if (st) { starts.set(st.id, st); continue; }
    const en = parseEnd(line);
    if (en) {
      ends.push(en);
      const s = starts.get(en.id);
      const startT = s ? s.t : null;
      if (startT != null) intervals.push({ start: startT, end: startT + en.durMs });
      const act = en.action || '(none)';
      if (!byAction.has(act)) byAction.set(act, []);
      byAction.get(act).push(en.durMs);
      continue;
    }
    const lk = parseLock(line);
    if (lk) {
      if (!locks.has(lk.tag)) locks.set(lk.tag, { wait: [], hold: [], fail: 0 });
      const L = locks.get(lk.tag);
      L.wait.push(lk.waitMs);
      if (lk.got) L.hold.push(lk.holdMs); else L.fail++;
      continue;
    }
    const z = parseZort(line);
    if (z) {
      if (!zort.has(z.tag)) zort.set(z.tag, { ms: [], retries: 0, fail: 0 });
      const Z = zort.get(z.tag);
      Z.ms.push(z.ms);
      if (z.attempt > 1) Z.retries++;
      if (!z.ok) Z.fail++;
      continue;
    }
    const dr = parseDrive(line);
    if (dr) {
      if (!drive.has(dr.tag)) drive.set(dr.tag, { ms: [], fail: 0 });
      const D = drive.get(dr.tag);
      if (dr.ok) D.ms.push(dr.ms); else D.fail++;
      continue;
    }
    const db = parseDouble(line);
    if (db) { doubles.push(db); continue; }
    const dg = parseDoGet(line);
    if (dg) { doget.set(dg.kind, (doget.get(dg.kind) || 0) + 1); continue; }
  }

  // metric 1: concurrency
  const conc = maxConcurrency(intervals);

  // metric 3: doPost/doGet action durations
  const actions = [];
  for (const [act, arr] of byAction) actions.push(Object.assign({ action: act }, stat(arr)));
  actions.sort((a, b) => b.max - a.max);

  // metric 4: resolveSession — double count + sess distribution
  const sessN = ends.map(e => e.sessN);
  const sessMs = ends.map(e => e.sessMs);
  const doubleByAction = {};
  for (const d of doubles) doubleByAction[d.action || '(none)'] = (doubleByAction[d.action || '(none)'] || 0) + 1;

  // metric 2: locks
  const lockStats = [];
  for (const [tag, L] of locks) lockStats.push({ tag, wait: stat(L.wait), hold: stat(L.hold), fail: L.fail });
  lockStats.sort((a, b) => b.hold.max - a.hold.max);

  // metric 5: zort
  const zortStats = [];
  for (const [tag, Z] of zort) zortStats.push(Object.assign({ tag, retries: Z.retries, fail: Z.fail }, stat(Z.ms)));

  // metric 6: drive
  const driveStats = [];
  for (const [tag, D] of drive) driveStats.push(Object.assign({ tag, fail: D.fail }, stat(D.ms)));

  // metric 7: cache mix
  const cacheMix = {};
  for (const [k, v] of doget) cacheMix[k] = v;

  return {
    counts: { starts: starts.size, ends: ends.length },
    concurrency: conc,                                   // 1
    locks: lockStats,                                    // 2
    actions,                                             // 3
    resolveSession: {                                    // 4
      doubleResolves: doubles.length, doubleByAction,
      sessPerReq: stat(sessN), sessMsPerReq: stat(sessMs),
    },
    zort: zortStats,                                     // 5
    drive: driveStats,                                   // 6
    cacheMix,                                            // 7
  };
}

// ── รายงานเป็นข้อความ ────────────────────────────────────────────────────────
export function formatReport(a) {
  const L = [];
  const ms = (x) => `${x}ms`;
  L.push('══ Phase B — Backend observability report ══');
  L.push(`requests: START=${a.counts.starts} END=${a.counts.ends}`);
  L.push('');
  L.push('① concurrency (สูงสุดที่ request ทับกัน)');
  L.push(`   max=${a.concurrency.max}${a.concurrency.at ? `  ที่ epoch=${a.concurrency.at} (${new Date(a.concurrency.at).toISOString()})` : ''}`);
  L.push('');
  L.push('② lock wait/hold (write paths + punch)');
  if (!a.locks.length) L.push('   — ไม่มีข้อมูลล็อก —');
  for (const l of a.locks)
    L.push(`   ${l.tag.padEnd(14)} wait p50=${ms(l.wait.p50)} max=${ms(l.wait.max)}  ·  hold p50=${ms(l.hold.p50)} max=${ms(l.hold.max)}  ·  fail=${l.fail}  (n=${l.wait.n})`);
  L.push('');
  L.push('③ doPost/doGet action + duration (เรียงตาม max ช้าสุด)');
  for (const x of a.actions.slice(0, 20))
    L.push(`   ${x.action.padEnd(20)} n=${String(x.n).padEnd(5)} p50=${ms(x.p50)} p95=${ms(x.p95)} max=${ms(x.max)}`);
  L.push('');
  L.push('④ resolveSession_');
  L.push(`   double-resolve=${a.resolveSession.doubleResolves}  ${JSON.stringify(a.resolveSession.doubleByAction)}`);
  L.push(`   resolves/request: p50=${a.resolveSession.sessPerReq.p50} max=${a.resolveSession.sessPerReq.max}  ·  sessMs/request p50=${ms(a.resolveSession.sessMsPerReq.p50)} max=${ms(a.resolveSession.sessMsPerReq.max)}`);
  L.push('');
  L.push('⑤ ZORT latency + retry');
  if (!a.zort.length) L.push('   — ไม่มี ZORT call ในช่วง log นี้ —');
  for (const z of a.zort)
    L.push(`   ${z.tag.padEnd(14)} p50=${ms(z.p50)} max=${ms(z.max)}  ·  retries=${z.retries} fail=${z.fail}  (n=${z.n})`);
  L.push('');
  L.push('⑥ Drive photo upload latency (ในล็อก punch)');
  if (!a.drive.length) L.push('   — ไม่มี upload ในช่วง log นี้ —');
  for (const d of a.drive)
    L.push(`   ${d.tag.padEnd(14)} p50=${ms(d.p50)} max=${ms(d.max)}  ·  fail=${d.fail}  (n=${d.n})`);
  L.push('');
  L.push('⑦ cache mix (HIT/MISS/STALE/WAIT-HIT/FRESH)');
  L.push(`   ${JSON.stringify(a.cacheMix)}`);
  return L.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function isMain() {
  try { return import.meta.url === `file://${process.argv[1]}`; } catch { return false; }
}
if (isMain()) {
  const fs = await import('node:fs');
  const file = process.argv[2];
  const text = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');
  console.log(formatReport(analyze(text)));
}
