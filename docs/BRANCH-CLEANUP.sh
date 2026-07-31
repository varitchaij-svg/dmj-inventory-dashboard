# branch ที่ merge เข้า master ครบแล้ว (git diff vs master = ไม่มีไฟล์ต่าง) — ลบได้ปลอดภัย
# สร้าง 2026-07-31 · ลบจากเครื่อง dev ที่ push ได้ หรือลบผ่านหน้าเว็บ GitHub
# (สภาพแวดล้อม agent ลบไม่ได้ — git proxy คืน HTTP 403 กับ delete ref)

git push origin --delete claude/agent-warehouse-system-zfrc08
git push origin --delete claude/cool-pasteur-VoXAR
git push origin --delete claude/count-items-location-nr9eok
git push origin --delete claude/customer-data-tax-invoice-4xyb21
git push origin --delete claude/doomuenjing-shop-setup-8p0p5d
git push origin --delete claude/elegant-archimedes-l4nqJ
git push origin --delete claude/eloquent-bell-gFEdL
git push origin --delete claude/eloquent-cerf-RoiQg
git push origin --delete claude/employee-login-plan-3tuvno
git push origin --delete claude/form-data-not-saving-6o16ia
git push origin --delete claude/gas-payload-perf
git push origin --delete claude/great-curie-sacv88
git push origin --delete claude/hopeful-ramanujan-2QTZe
git push origin --delete claude/ios-line-login-handoff-kxqggl
git push origin --delete claude/ios-login-issue-wmr2zo
git push origin --delete claude/line-bot-rate-limit-queue-6k9tba
git push origin --delete claude/list-reset-timing-ndtzcr
git push origin --delete claude/login-attendance-system-next-g2nlmd
git push origin --delete claude/loving-turing-Qxtkb
git push origin --delete claude/mobile-a4-print-adjust-55cefp
git push origin --delete claude/morning-bot-notification-check-kqdw8g
git push origin --delete claude/nice-galileo-Oy56k
git push origin --delete claude/order-status-display-bfl49z
git push origin --delete claude/procurement-demo-dashboard-6y1kji
git push origin --delete claude/quirky-brahmagupta-nim4e9
git push origin --delete claude/quotation-web-creation-hfia0x
git push origin --delete claude/review-adaptation-58zijn
git push origin --delete claude/review-github-updates-I9qko
git push origin --delete claude/sales-growth-strategy-kzg2dc
git push origin --delete claude/screen-font-size-adjust-kx45g6
git push origin --delete claude/storefront-inventory-check-sgla3b
git push origin --delete claude/supabase-backup-strategy-2y4ocj
git push origin --delete claude/supplier-inventory-analysis-cfcfdt
git push origin --delete claude/test-coverage-analysis-2xzzlg
git push origin --delete claude/test-coverage-analysis-df8wvx
git push origin --delete claude/test-coverage-analysis-fyenw1
git push origin --delete claude/todo-implementation-ErPwD
git push origin --delete claude/todo-implementation-w0qln4
git push origin --delete claude/trusting-ritchie-FOca7
git push origin --delete claude/ux-ui-tab-entry-anx7m3
git push origin --delete claude/warehouse-count-before-shelf-0jbx6r
git push origin --delete claude/website-evaluation-improvements-n4tj8x
git push origin --delete claude/wizardly-goldberg-8s0vml
git push origin --delete claude/youthful-cannon-5snq9g
git push origin --delete claude/zen-cerf-tdph9l
git push origin --delete claude/zort-data-mismatch-check-b5nf2u
git push origin --delete claude/zort-quotation-closure-yj84n1
git push origin --delete claude/zort-sales-list-creation-fy1pxr
git push origin --delete claude/zort-wl-products-missing-1yq425

# เพิ่ม 2026-07-31 (รอบ 2) — ตรวจแบบละเอียดกว่าเดิม (เทียบ function-level ไม่ใช่แค่ diff --stat)
# gas-batch-read: batchReadFormatted_ + ฟังก์ชันที่แก้ให้รับ param ทั้งหมดอยู่ใน master แล้ว
#   (ยืนยันด้วย diff เนื้อหาฟังก์ชันจริง = ว่างเปล่า ไม่ใช่แค่ชื่อเหมือนกัน)
git push origin --delete claude/gas-batch-read
# system-analysis-owner-saler-i4lp08: ทุกชื่อฟังก์ชันใน branch มีอยู่ใน master (comm -23 = ว่าง)
#   จุดที่ต่างกันจริง (เช่น salesRep ใน views-quote.jsx) master มีดีไซน์ใหม่กว่าแทนที่แล้ว
#   ("ผู้ทำใบเสนอราคาตามบัญชี" จาก window._currentUserName แทนกรอกเอง+จำใน sessionStorage)
git push origin --delete claude/system-analysis-owner-saler-i4lp08
