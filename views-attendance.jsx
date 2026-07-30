// views-attendance.jsx — ลงเวลาเข้า-ออกงาน (เฟส A)
// depends on: ui.jsx (uS/uE/uM/uC aliases), views-main.jsx โหลดก่อน
// แยกไฟล์ตามสถาปัตยกรรมเดิม — กัน Babel compile ช้าเพราะไฟล์ใหญ่เกิน

// ── helper: POST action ไป GAS พร้อม session token ──
async function attPost(body) {
  const base = (typeof SHEET_DEPLOY_URL !== 'undefined') ? SHEET_DEPLOY_URL : null;
  if (!base) throw new Error("ยังไม่ได้เชื่อมต่อ Sheet");
  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ sessionToken: localStorage.getItem("dmj_session_token") }, body)),
  });
  return res.json();
}

// ข้อมูลกลางของทุกประเภทการลงเวลา — ใช้ทั้งไทม์ไลน์/AttFixModal/ปุ่มสลับสถานะ
const ATT_TYPE_META = {
  in:            { label: "เข้างาน",          emoji: "🟢", color: "#1f7f44" },
  out:           { label: "ออกงาน",           emoji: "🏁", color: "#705d96" },
  breakStart:    { label: "เริ่มพัก",          emoji: "🍽️", color: "#a07417" },
  breakEnd:      { label: "กลับจากพัก",       emoji: "↩️", color: "#1f6f8b" },
  bathroomStart: { label: "ไปห้องน้ำ",         emoji: "🚻", color: "#2563a8" },
  bathroomEnd:   { label: "กลับจากห้องน้ำ",    emoji: "↩️", color: "#1f6f8b" },
};
// เดิม 4 ปุ่มตายตัว (เข้างาน/เริ่มพัก/กลับจากพัก/ออกงาน) ตอนนี้รวมเป็น "ปุ่มสลับสถานะ" 3 กลุ่ม —
// แต่ละกลุ่มโชว์ปุ่มเดียวที่ตำแหน่งเดิม สลับป้าย/สีตามว่าตอนนี้ "ยังไม่เริ่ม" หรือ "กำลังทำอยู่"
// (เข้างาน⟷ออกงาน, เริ่มพัก⟷กลับจากพัก, ไปห้องน้ำ⟷กลับจากห้องน้ำ)
const ATT_TOGGLE_GROUPS = [
  { key: "work",     idle: "in",            active: "out" },
  { key: "break",    idle: "breakStart",    active: "breakEnd" },
  { key: "bathroom", idle: "bathroomStart", active: "bathroomEnd" },
];

// วันนี้แบบ yyyy-MM-dd ตามเวลาเครื่อง (ห้ามใช้ toISOString — จะเพี้ยนไป 1 วันเพราะแปลงเป็น UTC)
function attTodayKey(d) {
  const x = d || new Date();
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}
function attHm(d) {
  const x = d || new Date();
  return String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0");
}

function attMinLabel(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
}

// ── ขอพิกัด GPS · คืน null ถ้าไม่ได้/ปฏิเสธ (ไม่บล็อกการลงเวลา ตามนโยบายที่เจ้าของเลือก) ──
function attGetPosition(timeoutMs) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    navigator.geolocation.getCurrentPosition(
      (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => finish(null),
      { enableHighAccuracy: true, timeout: timeoutMs || 12000, maximumAge: 30000 }
    );
    setTimeout(() => finish(null), (timeoutMs || 12000) + 500); // กัน callback ไม่ยิงเลยบน iOS บางรุ่น
  });
}

// ── ย่อรูปก่อนส่ง — กัน payload ใหญ่จน GAS timeout (ตั้งใจให้ ~60-100KB) ──
function attShrinkImage(file, maxW) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("เปิดรูปไม่สำเร็จ"));
      img.onload = () => {
        const w = Math.min(maxW || 640, img.width);
        const h = Math.round(img.height * (w / img.width));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.7));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ปุ่มสลับสถานะ 1 ปุ่ม/กลุ่ม — โชว์ฝั่ง idle (ยังไม่เริ่ม) หรือ active (กำลังทำอยู่ กดเพื่อจบ)
// ตาม allowed ที่ server คำนวณมาให้ · ทั้ง idle/active ไม่อยู่ใน allowed เลย = ปิดปุ่มไว้ก่อน
// (เช่น ยังไม่ได้เข้างาน หรือกำลังอยู่ในอีกสถานะหนึ่งพร้อมกันไม่ได้ เช่น กำลังพักอยู่กดห้องน้ำไม่ได้)
function AttToggleButton({ group, allowed, busy, onPunch, big }) {
  const isActive = allowed.indexOf(group.active) >= 0;
  const isIdle = allowed.indexOf(group.idle) >= 0;
  const type = isActive ? group.active : group.idle;
  const meta = ATT_TYPE_META[type];
  const on = isActive || isIdle;
  const isBusy = busy === type;
  return (
    <button onClick={() => onPunch(type)} disabled={!on || !!busy}
      style={{
        display: "flex", flexDirection: big ? "row" : "column", alignItems: "center", justifyContent: "center",
        gap: big ? 10 : 6, padding: big ? "18px 8px" : "22px 8px", borderRadius: 16, fontFamily: "inherit",
        width: "100%", boxSizing: "border-box",
        border: on ? `2px solid ${meta.color}` : "1.5px solid var(--bdr)",
        background: on ? meta.color : "var(--paper)",
        color: on ? "#fff" : "var(--muted)",
        fontSize: big ? 17 : 15, fontWeight: 800, minHeight: big ? 64 : 88,
        cursor: on && !busy ? "pointer" : "default", opacity: on ? 1 : .45,
        boxShadow: on ? `0 4px 14px ${meta.color}33` : "none",
      }}>
      {isBusy ? <span className="spin" style={{ width: big ? 22 : 20, height: big ? 22 : 20, borderWidth: 3 }} />
              : <span style={{ fontSize: big ? 26 : 24 }}>{meta.emoji}</span>}
      <span>{meta.label}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════
// AttendanceView — หน้าลงเวลาของพนักงาน (ทุก role)
// ═══════════════════════════════════════════════
function AttendanceView({ role }) {
  const [mode, setMode] = uS("today");    // "today" | "month" — สลับ "วันนี้" / "เวลาของฉัน"
  const [today, setToday] = uS(null);
  const [loading, setLoading] = uS(true);
  const [err, setErr] = uS(null);
  const [busy, setBusy] = uS(null);       // type ที่กำลังส่ง
  const [toast, setToast] = uS(null);     // {kind:"ok"|"err", text}
  const [gps, setGps] = uS({ state: "idle" }); // idle | loading | ok | denied
  const [photo, setPhoto] = uS(null);     // dataURL ที่ย่อแล้ว
  const [clock, setClock] = uS(() => new Date());
  const fileRef = React.useRef(null);

  // นาฬิกาเดินจริง — พนักงานเห็นเวลาตรงกับที่ระบบจะบันทึก
  uE(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  const load = uC(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await attPost({ action: "myToday" });
      if (d && d.success) setToday(d.data);
      else setErr((d && d.error) || "โหลดไม่สำเร็จ — ต้องเข้าสู่ระบบด้วย LINE ก่อน");
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  uE(() => { load(); }, [load]);

  // ขอ GPS ทันทีที่เปิดหน้า — ให้ผู้ใช้กดอนุญาตก่อน แล้วตอนกดปุ่มจริงจะเร็ว
  uE(() => {
    let alive = true;
    setGps({ state: "loading" });
    attGetPosition().then(p => {
      if (!alive) return;
      setGps(p ? { state: "ok", ...p } : { state: "denied" });
    });
    return () => { alive = false; };
  }, []);

  const allowed = (today && today.allowed) || [];
  const needPhoto = allowed.indexOf("in") >= 0; // บังคับรูปเฉพาะตอนเข้างาน (ตามที่เจ้าของเลือก)

  const pickPhoto = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { setPhoto(await attShrinkImage(f, 640)); }
    catch (er) { setToast({ kind: "err", text: er.message }); }
  };

  const doPunch = async (type) => {
    if (busy) return;
    if (type === "in" && !photo) { setToast({ kind: "err", text: "ถ่ายรูปก่อนกดเข้างาน" }); return; }
    setBusy(type); setToast(null);
    try {
      // ขอพิกัดสด ณ ตอนกด (ค่าที่ขอไว้ตอนเปิดหน้าอาจเก่าแล้ว)
      const p = gps.state === "ok" ? gps : await attGetPosition(8000);
      const d = await attPost({
        action: "punch", type,
        lat: p ? p.lat : null, lng: p ? p.lng : null, accuracy: p ? p.accuracy : null,
        clientTs: Date.now(),
        photoBase64: type === "in" ? photo : null,
        source: "web",
      });
      if (d && d.success) {
        setToday(d.data.today);
        setPhoto(null);
        if (fileRef.current) fileRef.current.value = "";
        const dist = d.data.distM;
        setToast({
          kind: "ok",
          text: `บันทึก "${d.data.punched}" แล้ว` +
                (dist != null ? (d.data.inArea ? ` · อยู่ที่${d.data.siteName}` : ` · ⚠️ ห่าง${d.data.siteName} ${dist} ม.`) : ""),
        });
      } else {
        setToast({ kind: "err", text: (d && d.error) || "บันทึกไม่สำเร็จ" });
      }
    } catch (e) {
      setToast({ kind: "err", text: "บันทึกไม่สำเร็จ: " + e.message });
    } finally { setBusy(null); }
  };

  const sum = today && today.summary;

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Seg value={mode} onChange={setMode} options={[
          { value: "today", label: "⏱️ วันนี้" },
          { value: "month", label: "📅 เวลาของฉัน" },
        ]} />
      </div>

      {mode === "month" ? <MyAttendanceMonth /> : (
      <>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: "var(--g-700)", letterSpacing: "-.02em", lineHeight: 1.1 }}>
          {clock.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
          {clock.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}
          {today && today.shift ? ` · กะ ${today.shift.start}-${today.shift.end}` : " · ไม่มีกะวันนี้"}
        </div>
        {today && today.staffName && (
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginTop: 6 }}>{today.staffName}</div>
        )}
      </div>

      {err && (
        <div style={{ background: "#fff0f0", border: "1px solid var(--dang)", borderRadius: 10, padding: "10px 14px", color: "var(--dang)", marginBottom: 12, fontSize: 13 }}>
          ⚠️ {err}
        </div>
      )}

      {loading && !today ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
          <span className="spin" style={{ width: 24, height: 24, borderWidth: 3, display: "inline-block" }} />
          <div style={{ marginTop: 8, fontSize: 13 }}>กำลังโหลด…</div>
        </div>
      ) : today && (
        <>
          {/* ── ① ถ่ายรูป (เฉพาะตอนเข้างาน) ── */}
          {needPhoto && (
            <div style={{
              background: "var(--paper)", border: "1.5px solid " + (photo ? "var(--g-500)" : "var(--bdr)"),
              borderRadius: 14, padding: 14, marginBottom: 12,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>
                📷 ถ่ายรูปยืนยันก่อนเข้างาน {photo ? "✅" : ""}
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={pickPhoto}
                style={{ display: "none" }} id="attphoto" />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {photo && <img src={photo} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover" }} />}
                <label htmlFor="attphoto" style={{
                  flex: 1, textAlign: "center", padding: "12px", borderRadius: 10, cursor: "pointer",
                  background: photo ? "var(--g-50)" : "var(--g-600)", color: photo ? "var(--g-700)" : "#fff",
                  fontWeight: 700, fontSize: 14, border: photo ? "1.5px solid var(--g-500)" : "none",
                }}>{photo ? "ถ่ายใหม่" : "เปิดกล้อง"}</label>
              </div>
            </div>
          )}

          {/* ── ② ปุ่มสลับสถานะ 3 ปุ่ม (เข้า/ออกงาน ใหญ่ด้านบน · พัก/ห้องน้ำ คู่กันด้านล่าง) ── */}
          {/* แต่ละปุ่มอยู่ตำแหน่งเดิมเสมอ สลับป้าย/สีไปมาตามสถานะ (ไม่ใช่ปุ่มแยกที่จางลงเวลากดไม่ได้) */}
          <AttToggleButton group={ATT_TOGGLE_GROUPS[0]} allowed={allowed} busy={busy} onPunch={doPunch} big />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10, marginTop: 10, marginBottom: 14 }}>
            <AttToggleButton group={ATT_TOGGLE_GROUPS[1]} allowed={allowed} busy={busy} onPunch={doPunch} />
            <AttToggleButton group={ATT_TOGGLE_GROUPS[2]} allowed={allowed} busy={busy} onPunch={doPunch} />
          </div>

          {allowed.length === 0 && (
            <div style={{ textAlign: "center", fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
              ✅ ลงเวลาออกงานครบแล้ววันนี้
            </div>
          )}

          {toast && (
            <div style={{
              borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, fontWeight: 600,
              background: toast.kind === "ok" ? "#e8f5e9" : "#fff0f0",
              color: toast.kind === "ok" ? "#1b5e20" : "var(--dang)",
              border: "1px solid " + (toast.kind === "ok" ? "#a5d6a7" : "var(--dang)"),
            }}>{toast.kind === "ok" ? "✅ " : "⚠️ "}{toast.text}</div>
          )}

          {/* ── ③ สถานะ GPS / รูป ── */}
          <div style={{ background: "var(--paper)", border: "1.5px solid var(--bdr)", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", fontSize: 13, borderBottom: "1px solid var(--bdr)" }}>
              <span style={{ color: "var(--muted)" }}>📍 ตำแหน่ง</span>
              <span style={{ fontWeight: 700, color: gps.state === "ok" ? "var(--g-700)" : "#a07417" }}>
                {gps.state === "loading" ? "กำลังหา…" : gps.state === "ok" ? `พร้อม (±${Math.round(gps.accuracy)} ม.)` : "ไม่ได้เปิด GPS"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", fontSize: 13 }}>
              <span style={{ color: "var(--muted)" }}>⏱ ทำงานวันนี้</span>
              <span style={{ fontWeight: 700 }}>
                {sum && sum.workedMin != null ? attMinLabel(sum.workedMin) : (sum && sum.inTime ? "กำลังทำงาน" : "—")}
              </span>
            </div>
          </div>

          {gps.state === "denied" && (
            <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#7a5a00", marginBottom: 14 }}>
              ยังลงเวลาได้ตามปกติ แต่ระบบจะบันทึกว่า "ไม่มีพิกัด" — ถ้าอยากเปิด ให้ไปที่
              ตั้งค่ามือถือ → เบราว์เซอร์ → ตำแหน่ง → อนุญาต แล้วเปิดหน้านี้ใหม่
            </div>
          )}

          {/* ── ④ ไทม์ไลน์วันนี้ ── */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>วันนี้</div>
          {today.events.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 13 }}>ยังไม่ได้ลงเวลาวันนี้</div>
          ) : (
            <div style={{ background: "var(--paper)", border: "1.5px solid var(--bdr)", borderRadius: 12, overflow: "hidden" }}>
              {today.events.map((e, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                  borderTop: i ? "1px solid var(--bdr)" : "none",
                }}>
                  <span style={{ fontSize: 16 }}>{(ATT_TYPE_META[e.type] || {}).emoji}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{e.typeTh}</span>
                  {e.inArea === false && <span title="อยู่นอกพื้นที่ร้าน" style={{ fontSize: 12 }}>⚠️</span>}
                  {e.hasPhoto && <span title="มีรูป" style={{ fontSize: 12 }}>📷</span>}
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--g-700)" }}>{String(e.time).slice(0, 5)}</span>
                </div>
              ))}
            </div>
          )}

          {sum && (sum.lateMin > 0 || sum.breakMin > 0 || sum.bathroomMin > 0 || sum.forgotBreakEnd || sum.forgotBathroomEnd) && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
              {sum.lateMin > 0 && <div>⏰ เข้างานสาย {sum.lateMin} นาที</div>}
              {sum.breakMin > 0 && <div>🍽️ พักรวม {attMinLabel(sum.breakMin)}</div>}
              {sum.bathroomMin > 0 && <div>🚻 ห้องน้ำรวม {attMinLabel(sum.bathroomMin)}</div>}
              {sum.forgotBreakEnd && <div style={{ color: "#a07417" }}>⚠️ ลืมกด "กลับจากพัก" — แจ้งเจ้าของให้แก้ให้</div>}
              {sum.forgotBathroomEnd && <div style={{ color: "#a07417" }}>⚠️ ลืมกด "กลับจากห้องน้ำ" — แจ้งเจ้าของให้แก้ให้</div>}
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}

const ATT_MONTH_NAMES = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const ATT_DOW_TH = ["อา","จ","อ","พ","พฤ","ศ","ส"];
function attMonthLabel(ym) {
  const p = String(ym || "").split("-");
  return (ATT_MONTH_NAMES[parseInt(p[1], 10) - 1] || p[1]) + " " + p[0];
}
// เดือนถัดจาก ym แบบ "yyyy-MM" (delta: -1 ก่อนหน้า, +1 ถัดไป)
function attShiftMonth(ym, delta) {
  const p = String(ym || "").split("-");
  const d = new Date(Number(p[0]), Number(p[1]) - 1 + delta, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

// ═══════════════════════════════════════════════
// MyAttendanceMonth — "เวลาของฉัน" สรุปเดือนนี้ (ทุก role)
// ───────────────────────────────────────────────
// ให้พนักงานเช็คชั่วโมง/สาย/ขาดของตัวเองได้เอง ก่อนที่เจ้าของจะเอาไปใช้ที่ไหน —
// เห็นตัวเลขเดียวกับที่เจ้าของเห็นในแท็บ "สรุปลงเวลา" ไม่ใช่รู้ทีหลังว่าโดนนับว่าสาย
// ═══════════════════════════════════════════════
function MyAttendanceMonth() {
  const [month, setMonth] = uS(attTodayKey().slice(0, 7));
  const [data, setData] = uS(null);
  const [loading, setLoading] = uS(true);
  const [err, setErr] = uS(null);

  const load = uC(async (m) => {
    setLoading(true); setErr(null);
    try {
      const d = await attPost({ action: "myAttendanceSummary", month: m || month });
      if (d && d.success) setData(d.data);
      else setErr((d && d.error) || "โหลดไม่สำเร็จ");
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [month]);

  uE(() => { load(month); }, [month]);

  const isCurrentMonth = month === attTodayKey().slice(0, 7);
  const t = data && data.totals;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button className="btn ghost" onClick={() => setMonth(m => attShiftMonth(m, -1))} style={{ padding: "8px 14px" }}>◀</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--g-700)" }}>{attMonthLabel(month)}</div>
        <button className="btn ghost" onClick={() => setMonth(m => attShiftMonth(m, 1))} disabled={isCurrentMonth} style={{ padding: "8px 14px", opacity: isCurrentMonth ? .4 : 1 }}>▶</button>
      </div>

      {err && (
        <div style={{ background: "#fff0f0", border: "1px solid var(--dang)", borderRadius: 10, padding: "10px 14px", color: "var(--dang)", marginBottom: 12, fontSize: 13 }}>⚠️ {err}</div>
      )}

      {loading && !data ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
          <span className="spin" style={{ width: 24, height: 24, borderWidth: 3, display: "inline-block" }} />
        </div>
      ) : t && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8, marginBottom: 16 }}>
            <div style={{ background: "var(--paper)", border: "1.5px solid var(--bdr)", borderRadius: 12, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--g-700)" }}>{attMinLabel(t.workedMin)}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>ทำงานรวม ({t.daysWorked} วัน)</div>
            </div>
            <div style={{ background: "var(--paper)", border: "1.5px solid var(--bdr)", borderRadius: 12, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: t.lateDays > 0 ? "#a07417" : "var(--g-700)" }}>{t.lateDays} วัน</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>สาย{t.lateMin > 0 ? ` (รวม ${attMinLabel(t.lateMin)})` : ""}</div>
            </div>
            {t.daysAbsent > 0 && (
              <div style={{ background: "#fff0f0", border: "1.5px solid var(--dang)", borderRadius: 12, padding: 12, textAlign: "center", gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--dang)" }}>⚠️ ขาด {t.daysAbsent} วัน</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>มีกะแต่ไม่ได้ลงเวลา — ถ้าลาไว้แล้วแจ้งเจ้าของให้แก้ให้</div>
              </div>
            )}
          </div>

          <div style={{ background: "var(--paper)", border: "1.5px solid var(--bdr)", borderRadius: 12, overflow: "hidden" }}>
            {[...data.days].reverse().map(d => (
              <div key={d.date} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderTop: "1px solid var(--bdr)",
                background: d.isToday ? "var(--g-50)" : "transparent",
              }}>
                <div style={{ width: 44, flexShrink: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{d.date.slice(8, 10)}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{ATT_DOW_TH[d.dow]}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {d.inTime ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {String(d.inTime).slice(0, 5)} – {d.outTime ? String(d.outTime).slice(0, 5) : (d.isToday ? "ยังทำงานอยู่" : "ไม่ได้กดออกงาน")}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        {d.workedMin != null ? `ทำงาน ${attMinLabel(d.workedMin)}` : ""}
                        {!d.shift ? " · ไม่มีกะกำหนด" : ""}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: d.isPast && d.shift ? "var(--dang)" : "var(--muted)" }}>
                      {d.isPast && d.shift ? "❌ ขาด" : d.shift ? "ยังไม่ลงเวลา" : "ไม่มีกะ"}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {d.lateMin > 0 && <div style={{ fontSize: 11, color: "#a07417", fontWeight: 700 }}>สาย {d.lateMin} น.</div>}
                  {d.forgotBreakEnd && <div style={{ fontSize: 11, color: "#a07417" }}>⚠️ ลืมกลับจากพัก</div>}
                  {d.forgotBathroomEnd && <div style={{ fontSize: 11, color: "#a07417" }}>⚠️ ลืมกลับจากห้องน้ำ</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// AttendanceTodayView — เจ้าของดูว่าใครเข้างานบ้างวันนี้
// ═══════════════════════════════════════════════
const ATT_STATE_STYLE = {
  "ทำงานอยู่":   { background: "#e8f5e9", color: "#1b5e20" },
  "พักอยู่":     { background: "#fff3e0", color: "#e65100" },
  "ไปห้องน้ำ":   { background: "#f3e5f5", color: "#6a1b9a" },
  "ออกงานแล้ว":  { background: "#e3f2fd", color: "#0d47a1" },
  "ยังไม่มา":    { background: "#f5f5f5", color: "#757575" },
};
// role ที่มีอยู่จริงตอนนี้ = อยู่ที่ร้าน (ไม่นับ "ยังไม่มา"/"ออกงานแล้ว")
const ATT_HERE_STATES = new Set(["ทำงานอยู่", "พักอยู่", "ไปห้องน้ำ"]);

function AttendanceTodayView() {
  const [rows, setRows] = uS([]);
  const [date, setDate] = uS(attTodayKey());
  const [loading, setLoading] = uS(true);
  const [err, setErr] = uS(null);
  const [openId, setOpenId] = uS(null);
  const [photo, setPhoto] = uS(null); // {loading, src}
  const [fix, setFix] = uS(null);     // {mode:"add"|"edit", staff, event}
  const [toast, setToast] = uS(null);

  const load = uC(async (d0) => {
    setLoading(true); setErr(null);
    try {
      const d = await attPost({ action: "attendanceToday", date: d0 || date });
      if (d && d.success) { setRows(d.data.rows || []); setDate(d.data.date || ""); }
      else setErr((d && d.error) || "โหลดไม่สำเร็จ");
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [date]);

  uE(() => { load(); }, [load]);

  // รูปเก็บใน Drive แบบไม่แชร์สาธารณะ → ต้องดึงผ่าน proxy ที่ตรวจ session ก่อน
  const viewPhoto = async (id) => {
    setPhoto({ loading: true });
    try {
      const url = new URL(SHEET_DEPLOY_URL);
      url.searchParams.set("action", "attendancePhoto");
      url.searchParams.set("id", id);
      url.searchParams.set("sessionToken", localStorage.getItem("dmj_session_token") || "");
      const r = await fetch(url.toString());
      const d = await r.json();
      if (d && d.d) setPhoto({ src: d.d });
      else setPhoto(null);
    } catch (e) { setPhoto(null); }
  };

  const here = rows.filter(r => ATT_HERE_STATES.has(r.state));
  const frontstoreHere = here.filter(r => r.role === "frontstore");
  const warehouseHere = here.filter(r => r.role === "warehouse");
  const late = rows.filter(r => r.summary && r.summary.lateMin > 0);
  const came = rows.filter(r => r.summary && r.summary.inTime);
  const noOut = came.filter(r => !r.summary.outTime);
  const isToday = date === attTodayKey();

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--g-700)" }}>
            🕐 {isToday ? "ใครเข้างานวันนี้" : "ย้อนดูการลงเวลา"}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {isToday
              ? `🏪 หน้าร้าน ${frontstoreHere.length} คน · 📦 คลังสินค้า ${warehouseHere.length} คน`
              : `มาทำงาน ${came.length} คน`}
            {late.length ? ` · สาย ${late.length} คน` : ""}
            {!isToday && noOut.length ? ` · ⚠️ ไม่ได้กดออกงาน ${noOut.length} คน` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="date" value={date} max={attTodayKey()} onChange={e => setDate(e.target.value)}
            style={{ padding: "7px 9px", borderRadius: 9, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 13, minWidth: 0 }} />
          <button className="btn ghost" onClick={() => load()} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {loading ? <span className="spin" style={{ width: 14, height: 14, borderWidth: 2 }} /> : "🔄"}
          </button>
        </div>
      </div>

      {!isToday && (
        <div style={{ background: "var(--g-50)", border: "1px solid var(--g-500)", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "var(--g-700)", marginBottom: 12 }}>
          กำลังดูย้อนหลังวันที่ {date} · <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => setDate(attTodayKey())}>กลับมาวันนี้</span>
        </div>
      )}

      {toast && (
        <div style={{
          borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, fontWeight: 600,
          background: toast.kind === "ok" ? "#e8f5e9" : "#fff0f0",
          color: toast.kind === "ok" ? "#1b5e20" : "var(--dang)",
          border: "1px solid " + (toast.kind === "ok" ? "#a5d6a7" : "var(--dang)"),
        }}>{toast.kind === "ok" ? "✅ " : "⚠️ "}{toast.text}</div>
      )}

      {err && (
        <div style={{ background: "#fff0f0", border: "1px solid var(--dang)", borderRadius: 8, padding: "10px 14px", color: "var(--dang)", marginBottom: 12, fontSize: 13 }}>⚠️ {err}</div>
      )}

      {loading && rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
          <span className="spin" style={{ width: 24, height: 24, borderWidth: 3, display: "inline-block" }} />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 14 }}>ยังไม่มีพนักงานในระบบ</div>
      ) : rows.map(r => (
        <div key={r.staffId} style={{ background: "var(--paper)", border: "1.5px solid var(--bdr)", borderRadius: 14, marginBottom: 10, overflow: "hidden" }}>
          <div onClick={() => setOpenId(openId === r.staffId ? null : r.staffId)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, cursor: "pointer" }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, overflow: "hidden", flexShrink: 0, background: "#eee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              {r.pictureUrl ? <img src={r.pictureUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "👤"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {ROLE_TH_ATT[r.role] || r.role}
                {r.summary && r.summary.inTime ? ` · เข้า ${String(r.summary.inTime).slice(0, 5)}` : ""}
                {r.summary && r.summary.outTime ? ` · ออก ${String(r.summary.outTime).slice(0, 5)}` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, ...(ATT_STATE_STYLE[r.state] || {}) }}>{r.state}</span>
              {r.summary && r.summary.lateMin > 0 && (
                <div style={{ fontSize: 11, color: "var(--dang)", fontWeight: 700, marginTop: 3 }}>สาย {r.summary.lateMin} น.</div>
              )}
            </div>
          </div>

          {openId === r.staffId && (
            <div style={{ borderTop: "1px solid var(--bdr)", padding: "10px 14px", background: "var(--g-50)" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                กะ {r.shift ? `${r.shift.start}-${r.shift.end} (${r.shift.name})` : "— ไม่มีกะวันนี้"}
                {r.summary && r.summary.breakMin > 0 ? ` · พัก ${attMinLabel(r.summary.breakMin)}` : ""}
                {r.summary && r.summary.bathroomMin > 0 ? ` · ห้องน้ำ ${attMinLabel(r.summary.bathroomMin)}` : ""}
                {r.summary && r.summary.workedMin != null ? ` · ทำงาน ${attMinLabel(r.summary.workedMin)}` : ""}
              </div>
              {r.events.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>ยังไม่ได้ลงเวลา</div>
              ) : r.events.map((e, i) => (
                <div key={e.id || i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "5px 0" }}>
                  <span style={{ fontWeight: 700, minWidth: 46 }}>{String(e.time).slice(0, 5)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {e.typeTh}
                    {e.fixed && <span title={e.note || "เจ้าของแก้เอง"} style={{ fontSize: 11, color: "#a07417", marginLeft: 5 }}>✏️ แก้แล้ว</span>}
                  </span>
                  {e.distM !== "" && e.distM != null && (
                    <span style={{ color: e.inArea ? "var(--muted)" : "var(--dang)", fontSize: 11.5 }}>
                      {e.inArea ? `${e.siteName}` : `⚠️ ห่าง ${e.distM} ม.`}
                    </span>
                  )}
                  {e.photo && (
                    <button className="btn ghost" onClick={() => viewPhoto(e.photo)} style={{ fontSize: 11, padding: "3px 8px" }}>📷</button>
                  )}
                  <button className="btn ghost" title="แก้เวลา/ลบรายการนี้"
                    onClick={() => setFix({ mode: "edit", staff: r, event: e })}
                    style={{ fontSize: 11, padding: "3px 8px" }}>✏️</button>
                </div>
              ))}
              {r.summary && r.summary.forgotBreakEnd && (
                <div style={{ fontSize: 11.5, color: "#a07417", marginTop: 6 }}>⚠️ ลืมกด "กลับจากพัก" — เวลาพักอาจไม่ตรงจริง</div>
              )}
              {r.summary && r.summary.forgotBathroomEnd && (
                <div style={{ fontSize: 11.5, color: "#a07417", marginTop: 6 }}>⚠️ ลืมกด "กลับจากห้องน้ำ" — เวลาห้องน้ำอาจไม่ตรงจริง</div>
              )}
              {/* วันนี้คนที่ยังทำงานอยู่ก็ยังไม่มี "ออกงาน" เป็นเรื่องปกติ — เตือนเฉพาะตอนย้อนดูวันเก่า */}
              {!isToday && r.summary && r.summary.inTime && !r.summary.outTime && (
                <div style={{ fontSize: 11.5, color: "#a07417", marginTop: 6 }}>
                  ⚠️ ไม่ได้กด "ออกงาน" วันนี้ — ชั่วโมงทำงานคำนวณไม่ได้จนกว่าจะเติมเวลาออก
                </div>
              )}
              <button className="btn ghost" onClick={() => setFix({ mode: "add", staff: r, event: null })}
                style={{ marginTop: 8, fontSize: 12, padding: "7px 12px", width: "100%" }}>
                ➕ เพิ่มการลงเวลาให้ {r.name}
              </button>
            </div>
          )}
        </div>
      ))}

      {photo && (
        <div onClick={() => setPhoto(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 2000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          {photo.loading
            ? <span className="spin" style={{ width: 30, height: 30, borderWidth: 3, borderTopColor: "#fff" }} />
            : <img src={photo.src} alt="" style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 12 }} />}
        </div>
      )}

      {fix && (
        <AttFixModal
          mode={fix.mode} staff={fix.staff} event={fix.event} date={date}
          onClose={() => setFix(null)}
          onSaved={(msg) => { setFix(null); setToast({ kind: "ok", text: msg }); load(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// AttFixModal — เจ้าของแก้/เพิ่ม/ลบการลงเวลาย้อนหลัง
// ───────────────────────────────────────────────
// บังคับกรอกเหตุผลก่อนบันทึกเสมอ (ฝั่ง GAS ก็เช็คซ้ำ) — แถวที่แก้จะถูกมาร์คว่า
// "แก้โดยเจ้าของ" + เขียน Audit Log ทุกครั้ง เพื่อให้ตัวเลขชั่วโมงทำงานตรวจสอบย้อนหลังได้
// ═══════════════════════════════════════════════
function AttFixModal({ mode, staff, event, date, onClose, onSaved }) {
  const [type, setType] = uS(event ? event.type : "out");
  const [time, setTime] = uS(event ? String(event.time).slice(0, 5) : attHm());
  const [reason, setReason] = uS("");
  const [busy, setBusy] = uS(null);   // "save" | "delete"
  const [err, setErr] = uS(null);

  const submit = async (op) => {
    if (!reason.trim()) { setErr("ต้องกรอกเหตุผลก่อนบันทึก"); return; }
    setBusy(op === "delete" ? "delete" : "save"); setErr(null);
    try {
      const d = await attPost({
        action: "fixAttendance", op,
        id: event ? event.id : null,
        staffId: staff.staffId, date, type, time, reason: reason.trim(),
      });
      if (d && d.success) {
        const w = d.data && d.data.warning;
        onSaved((op === "delete" ? "ลบรายการแล้ว" : op === "add" ? "เพิ่มการลงเวลาแล้ว" : "แก้เวลาแล้ว") +
                (w ? " · ⚠️ " + w : ""));
      } else setErr((d && d.error) || "บันทึกไม่สำเร็จ");
    } catch (e) { setErr("บันทึกไม่สำเร็จ: " + e.message); }
    finally { setBusy(null); }
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 2100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--paper)", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 480,
        padding: 18, maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--g-700)", marginBottom: 3 }}>
          {mode === "add" ? "➕ เพิ่มการลงเวลา" : "✏️ แก้การลงเวลา"}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>{staff.name} · {date}</div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>ประเภท</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8, marginBottom: 14 }}>
          {Object.keys(ATT_TYPE_META).map(t => (
            <button key={t} onClick={() => setType(t)} disabled={!!busy}
              style={{
                padding: "12px 8px", borderRadius: 11, fontFamily: "inherit", fontSize: 14, fontWeight: 700,
                border: type === t ? `2px solid ${ATT_TYPE_META[t].color}` : "1.5px solid var(--bdr)",
                background: type === t ? ATT_TYPE_META[t].color : "var(--paper)",
                color: type === t ? "#fff" : "var(--text)", cursor: "pointer",
              }}>{ATT_TYPE_META[t].emoji} {ATT_TYPE_META[t].label}</button>
          ))}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>เวลา</div>
        <input type="time" value={time} onChange={e => setTime(e.target.value)} disabled={!!busy}
          style={{ width: "100%", padding: "12px", borderRadius: 11, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 16, marginBottom: 14, boxSizing: "border-box" }} />

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>
          เหตุผล <span style={{ color: "var(--dang)" }}>*</span>
        </div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} disabled={!!busy}
          placeholder="เช่น ลืมกดออกงาน แจ้งทางไลน์ว่ากลับ 18:00"
          style={{ width: "100%", minHeight: 68, padding: 11, borderRadius: 11, border: "1.5px solid var(--bdr)", fontFamily: "inherit", fontSize: 14, marginBottom: 6, boxSizing: "border-box", resize: "vertical" }} />
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
          รายการนี้จะถูกทำเครื่องหมายว่า "แก้โดยเจ้าของ" และบันทึกลงประวัติการใช้งาน
        </div>

        {err && (
          <div style={{ background: "#fff0f0", border: "1px solid var(--dang)", borderRadius: 9, padding: "9px 12px", color: "var(--dang)", fontSize: 12.5, marginBottom: 12 }}>⚠️ {err}</div>
        )}

        <div style={{ display: "flex", gap: 9 }}>
          <button className="btn ghost" onClick={onClose} disabled={!!busy} style={{ flex: 1, padding: "13px" }}>ยกเลิก</button>
          <button onClick={() => submit(mode === "add" ? "add" : "edit")} disabled={!!busy}
            style={{
              flex: 2, padding: "13px", borderRadius: 11, border: "none", fontFamily: "inherit",
              background: "var(--g-600)", color: "#fff", fontSize: 15, fontWeight: 800,
              cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1,
            }}>
            {busy === "save" ? <span className="spin" style={{ width: 16, height: 16, borderWidth: 2 }} /> : "บันทึก"}
          </button>
        </div>

        {mode === "edit" && (
          <button onClick={() => submit("delete")} disabled={!!busy}
            style={{
              width: "100%", marginTop: 10, padding: "11px", borderRadius: 11, fontFamily: "inherit",
              border: "1.5px solid var(--dang)", background: "transparent", color: "var(--dang)",
              fontSize: 13.5, fontWeight: 700, cursor: busy ? "default" : "pointer",
            }}>
            {busy === "delete" ? <span className="spin" style={{ width: 14, height: 14, borderWidth: 2 }} /> : "🗑 ลบรายการนี้"}
          </button>
        )}
      </div>
    </div>
  );
}

const ROLE_TH_ATT = { owner: "เจ้าของ", saler: "Sale", warehouse: "คลังสินค้า", frontstore: "หน้าร้าน", employee: "พนักงาน" };
