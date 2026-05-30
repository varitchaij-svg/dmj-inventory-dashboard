# คู่มือ Deployment

## 1. เว็บ (Cloudflare Pages)

- เว็บเป็น static (ไม่มี build step) — push เข้า `master` แล้ว Cloudflare deploy อัตโนมัติ
- ไฟล์ที่เกี่ยวข้อง: `_headers`, `_redirects`, `netlify.toml`
- ทดสอบในเครื่อง: เปิด `Doomuenjing Dashboard.html` ผ่าน local server (เช่น `start-server.ps1`) — ต้องเป็น **HTTPS หรือ localhost** ไม่งั้นกล้องสแกนใช้ไม่ได้

---

## 2. Backend — Google Apps Script ⚠️

### ขั้นตอนทุกครั้งที่แก้ `appsscript_complete.gs`

1. เปิด **Apps Script Editor** ของไฟล์ Google Sheet
2. เลือกทั้งหมดในไฟล์โค้ด → paste โค้ดใหม่จาก `appsscript_complete.gs` ทับ
3. **กรอก ZORT credentials จริง** ที่ส่วนหัวของไฟล์ (ดูหัวข้อด้านล่าง)
4. กด **Deploy → Manage deployments → แก้ deployment เดิม (ดินสอ) → Version: New version → Deploy**
   - หรือ **New deployment** ถ้าต้องการ URL ใหม่
   - ตั้งค่า: **Execute as = Me**, **Who has access = Anyone**
5. คัดลอก **Web app URL** (`https://script.google.com/macros/s/AKfyc.../exec`)
6. วางใน `config.js` ทั้ง 2 ตัวแปร แล้ว push:
   ```js
   const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/.../exec";
   const SHEET_DEPLOY_URL = "https://script.google.com/macros/s/.../exec";
   ```

> 💡 ถ้าใช้ **New version** บน deployment เดิม URL จะไม่เปลี่ยน → ไม่ต้องแก้ `config.js`
> แนะนำวิธีนี้เพื่อลดงาน แต่บางครั้งต้องสร้างใหม่ถ้า cache ไม่อัปเดต

---

## 3. ZORT Credentials 🔒

### กฎเหล็ก
- **ห้าม commit ค่าจริงลง git โดยเด็ดขาด**
- ในไฟล์ `appsscript_complete.gs` ที่ commit ต้องเป็น `PLACEHOLDER_*` เสมอ:
  ```js
  const ZORT_STORE  = "PLACEHOLDER_STORENAME";
  const ZORT_APIKEY = "PLACEHOLDER_APIKEY";
  const ZORT_SECRET = "PLACEHOLDER_APISECRET";
  ```
- กรอกค่าจริง **เฉพาะใน Apps Script Editor** หลัง paste โค้ดทุกครั้ง

### ที่มาของ credentials
ZORT → ตั้งค่า → API → storename / apikey / apisecret

---

## 4. Checklist หลัง Deploy

- [ ] เปิด Web app URL ตรงๆ → ต้องเห็น JSON (ไม่ใช่ error/หน้าว่าง)
- [ ] เปิดเว็บ → ข้อมูล dashboard โหลดขึ้น (ไม่ค้างหมุน)
- [ ] ทดสอบกด Done ที่หน้าสั่งของ → สถานะเปลี่ยน
- [ ] ทดสอบส่งสินค้า → เกิด Transfer ใน ZORT (เลขที่ auto)
- [ ] ทดสอบสร้างงาน MTO → แสดงในรายการ

---

## 5. Troubleshooting

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| เว็บค้างหมุนโหลดตลอด | Apps Script URL ผิด/พัง → เปิด URL ตรงๆ ดู error, redeploy (มี timeout 15s กันค้าง) |
| กด Done/ส่ง แล้ว error | Apps Script ไม่ได้ deploy เวอร์ชันใหม่ หรือ CORS — ทุก fetch ต้องใช้ `Content-Type: text/plain;charset=utf-8` |
| ZORT ไม่ขึ้นรายการโอน | credentials ยังเป็น PLACEHOLDER หรือกรอกผิด → ดู Executions log ใน Apps Script |
| งาน MTO บันทึกแล้วไม่แสดง | ต้อง redeploy เวอร์ชันที่มี `readMtoJobs_` ล่าสุด |
| กล้องสแกนไม่เปิด | ต้องเป็น HTTPS + อนุญาตกล้องใน browser |
