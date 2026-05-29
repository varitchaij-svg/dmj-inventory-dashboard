# Zortout Open API V4 — API Reference

> **Base URL:** `https://open-api.zortout.com/v4`
> **Official Docs:** https://developers.zortout.com

---

## 🔐 Required Headers (ทุก Endpoint)

| Header         | Required | Description                              |
|----------------|----------|------------------------------------------|
| `storename`    | ✅        | Store Name                               |
| `apikey`       | ✅        | API Key                                  |
| `apisecret`    | ✅        | API Secret                               |
| `X-Request-ID` | ❌        | Unique ID สำหรับ tracking/debugging (optional) |

---

## 📦 BUNDLE

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/Bundle/GetBundles`      | ดึงรายการ Bundle |
| GET  | `/Bundle/GetBundleDetail` | ดึงรายละเอียด Bundle และรายการสินค้าใน Bundle |
| POST | `/Bundle/AddBundle`       | สร้าง Bundle ใหม่ |
| POST | `/Bundle/UpdateBundle`    | แก้ไขข้อมูล Bundle |
| POST | `/Bundle/ActiveBundle`    | เปิดใช้งาน Bundle |
| POST | `/Bundle/DeleteBundle`    | ลบ Bundle |

---

## 📦 PRODUCT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/Product/GetProducts`                    | ดึงรายการสินค้าทั้งหมด |
| GET  | `/Product/GetProductDetail`               | ดึงรายละเอียดสินค้าตาม ID |
| GET  | `/Product/GetVariations`                  | ดึงรายการ Variation |
| GET  | `/Product/GetCategorys`                   | ดึงรายการหมวดหมู่ |
| POST | `/Product/AddProduct`                     | เพิ่มสินค้าใหม่ |
| POST | `/Product/UpdateProduct`                  | แก้ไขข้อมูลสินค้า |
| POST | `/Product/UpdateProductImage`             | อัปเดตรูปภาพสินค้า |
| POST | `/Product/UpdateProductStockList`         | ปรับสต็อก (ตั้งค่าใหม่) |
| POST | `/Product/IncreaseProductStockList`       | เพิ่มสต็อก |
| POST | `/Product/DecreaseProductStockList`       | ลดสต็อก |
| POST | `/Product/UpdateProductAvailableStockList`| ปรับ Available Stock |
| POST | `/Product/ActiveProduct`                  | เปิดใช้งานสินค้า |
| POST | `/Product/DisableProduct`                 | ปิดใช้งานสินค้า |
| POST | `/Product/DeleteProduct`                  | ลบสินค้า |
| POST | `/Product/AddSerialNo`                    | เพิ่ม Serial Number |
| POST | `/Product/DeleteSerialNo`                 | ลบ Serial Number |

---

## 🏭 WAREHOUSE

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/Warehouse/GetWarehouses` | ดึงรายการคลังสินค้า |
| POST | `/Warehouse/AddWarehouse`  | เพิ่มคลังสินค้าใหม่ |

---

## 👤 CONTACT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/Contact/GetContacts`      | ดึงรายการ Contact |
| GET  | `/Contact/GetContactDetail` | ดึงรายละเอียด Contact |
| POST | `/Contact/AddContact`       | เพิ่ม Contact |
| POST | `/Contact/UpdateContact`    | แก้ไข Contact |

---

## 🛒 ORDER

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/Order/GetOrders`                | ดึงรายการ Order |
| GET  | `/Order/GetOrderDetail`           | ดึงรายละเอียด Order |
| GET  | `/Order/GetVoucherOrderDetail`    | ดึงข้อมูล Voucher ของ Order |
| GET  | `/Order/GetExpenseOrderDetail`    | ดึงค่าใช้จ่ายของ Order |
| GET  | `/Order/GetMovementOrderDetail`   | ดึง Movement ของสินค้าใน Order |
| GET  | `/Order/GetMovementOrders`        | ดึง Movement ของ Orders (ช่วงวันที่) |
| GET  | `/Order/GetShipmentLabels`        | ดึง Shipment Label |
| POST | `/Order/AddOrder`                 | สร้าง Order ใหม่ |
| POST | `/Order/UpdateOrderStatus`        | อัปเดตสถานะ Order |
| POST | `/Order/UpdateOrderPayment`       | อัปเดตการชำระเงิน |
| POST | `/Order/VerifyOrderSlip`          | ยืนยัน Slip ชำระเงิน |
| POST | `/Order/UpdatePartialOrder`       | อัปเดตสินค้าบางส่วนของ Order |
| POST | `/Order/EditOrderInfo`            | แก้ไขข้อมูล Order |
| POST | `/Order/EditOrder`                | แก้ไข Order (รวมรายการสินค้า) |
| POST | `/Order/VoidOrder`                | ยกเลิก Order |
| POST | `/Order/VoidOrderPayment`         | ลบการชำระเงิน |
| POST | `/Order/ReadyToShip`              | เปลี่ยนสถานะเป็น Waiting/Ready to Ship |
| POST | `/Order/BookOrderShipment`        | เรียกขนส่ง (Flash, J&T, Kerry, DHL ฯลฯ) |
| POST | `/Order/UpdateOrderSerialNo`      | อัปเดต Serial No ของ Order |
| POST | `/Order/UpdateOrderExpiryLot`     | อัปเดต Expiry/Lot ของ Order |
| POST | `/Order/AddExpenseWithOrder`      | เพิ่มค่าใช้จ่ายใน Order |
| POST | `/Order/AddOrderTag`              | เพิ่ม Tag ใน Order |
| POST | `/Order/DeleteOrderTag`           | ลบ Tag ของ Order |
| POST | `/Order/AddVoucherOrder`          | เพิ่ม Voucher ใน Order |
| POST | `/Order/DeleteVoucherOrder`       | ลบ Voucher ของ Order |

---

## 📋 PURCHASE ORDER

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/PurchaseOrder/GetPurchaseOrders`                | ดึงรายการ Purchase Order |
| GET  | `/PurchaseOrder/GetPurchaseOrderDetail`           | ดึงรายละเอียด Purchase Order |
| GET  | `/PurchaseOrder/GetMovementPurchaseOrderDetail`   | ดึง Movement ของสินค้าใน PO |
| GET  | `/PurchaseOrder/GetMovementPurchaseOrders`        | ดึง Movement ของ POs (ช่วงวันที่) |
| GET  | `/PurchaseOrder/GetExpensePurchaseOrderDetail`    | ดึงค่าใช้จ่ายของ PO |
| POST | `/PurchaseOrder/AddPurchaseOrder`                 | สร้าง Purchase Order ใหม่ |
| POST | `/PurchaseOrder/UpdatePurchaseOrderStatus`        | อัปเดตสถานะ PO |
| POST | `/PurchaseOrder/UpdatePurchaseOrderPayment`       | อัปเดตการชำระเงิน PO |
| POST | `/PurchaseOrder/UpdatePartialPurchaseOrder`       | อัปเดตสินค้าบางส่วนของ PO |
| POST | `/PurchaseOrder/EditPurchaseOrderInfo`            | แก้ไขข้อมูล PO |
| POST | `/PurchaseOrder/EditPurchaseOrder`                | แก้ไข PO (รวมรายการสินค้า) |
| POST | `/PurchaseOrder/VoidPurchaseOrder`                | ยกเลิก PO |
| POST | `/PurchaseOrder/VoidPurchaseOrderPayment`         | ลบการชำระเงิน PO |
| POST | `/PurchaseOrder/UpdatePurchaseOrderSerialNo`      | อัปเดต Serial No ของ PO |
| POST | `/PurchaseOrder/UpdatePurchaseOrderExpiryLot`     | อัปเดต Expiry/Lot ของ PO |
| POST | `/PurchaseOrder/AddExpensePurchaseOrder`          | เพิ่มค่าใช้จ่ายใน PO |
| POST | `/PurchaseOrder/AddPurchaseOrderTag`              | เพิ่ม Tag ใน PO |
| POST | `/PurchaseOrder/DeletePurchaseOrderTag`           | ลบ Tag ของ PO |

---

## 🔄 RETURN ORDER

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/ReturnOrder/GetReturnOrders`                | ดึงรายการ Return Order |
| GET  | `/ReturnOrder/GetReturnOrderDetail`           | ดึงรายละเอียด Return Order |
| GET  | `/ReturnOrder/GetMovementReturnOrderDetail`   | ดึง Movement ของสินค้าใน Return Order |
| GET  | `/ReturnOrder/GetMovementReturnOrders`        | ดึง Movement ของ Return Orders (ช่วงวันที่) |
| POST | `/ReturnOrder/AddReturnOrder`                 | สร้าง Return Order |
| POST | `/ReturnOrder/UpdateReturnOrderStatus`        | อัปเดตสถานะ Return Order |
| POST | `/ReturnOrder/UpdateReturnOrderPayment`       | อัปเดตการชำระเงิน |
| POST | `/ReturnOrder/VoidReturnOrder`                | ยกเลิก Return Order |
| POST | `/ReturnOrder/VoidReturnOrderPayment`         | ลบการชำระเงิน |
| POST | `/ReturnOrder/AddReturnOrderTag`              | เพิ่ม Tag |
| POST | `/ReturnOrder/DeleteReturnOrderTag`           | ลบ Tag |

---

## 🔙 RETURN PURCHASE ORDER

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/ReturnPurchaseOrder/GetReturnPurchaseOrders`              | ดึงรายการ Return PO |
| GET  | `/ReturnPurchaseOrder/GetReturnPurchaseOrderDetail`         | ดึงรายละเอียด Return PO |
| GET  | `/ReturnPurchaseOrder/GetMovementReturnPurchaseOrderDetail` | ดึง Movement ของสินค้าใน Return PO |
| GET  | `/ReturnPurchaseOrder/GetMovementReturnPurchaseOrders`      | ดึง Movement ของ Return POs (ช่วงวันที่) |
| POST | `/ReturnPurchaseOrder/AddReturnPurchaseOrder`               | สร้าง Return PO |
| POST | `/ReturnPurchaseOrder/UpdateReturnPurchaseOrderStatus`      | อัปเดตสถานะ |
| POST | `/ReturnPurchaseOrder/UpdateReturnPurchaseOrderPayment`     | อัปเดตการชำระเงิน |
| POST | `/ReturnPurchaseOrder/VoidReturnPurchaseOrder`              | ยกเลิก |
| POST | `/ReturnPurchaseOrder/VoidReturnPurchaseOrderPayment`       | ลบการชำระเงิน |
| POST | `/ReturnPurchaseOrder/AddReturnPurchaseOrderTag`            | เพิ่ม Tag |
| POST | `/ReturnPurchaseOrder/DeleteReturnPurchaseOrderTag`         | ลบ Tag |

---

## 🔃 TRANSFER

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/Transfer/GetTransfers`             | ดึงรายการ Transfer (filter ตามวันที่, ประเภท, คลัง) |
| GET  | `/Transfer/GetTransferDetail`        | ดึงรายละเอียด Transfer ตาม ID |
| GET  | `/Transfer/GetMovementTransferDetail`| ดึง Movement ของสินค้าใน Transfer |
| GET  | `/Transfer/GetMovementTransfers`     | ดึง Movement ของ Transfers (ช่วงวันที่) |
| POST | `/Transfer/AddTransfer`              | สร้าง Transfer ใหม่ |
| POST | `/Transfer/UpdateTransferStatus`     | อัปเดตสถานะ Transfer เป็น Success |
| POST | `/Transfer/UpdatePartialTransfer`    | อัปเดตสินค้าบางส่วนของ Transfer |
| POST | `/Transfer/EditTransfer`             | แก้ไข Transfer (รวมรายการสินค้า) |
| POST | `/Transfer/VoidTransfer`             | ยกเลิก Transfer |

**Transfer Types** (query param: `transferType`): `Transfer` · `Initial` · `Adjust` · `Assembly` · `Disassembly` · `Reserve`

---

## 📝 QUOTATION

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/Quotation/GetQuotations`      | ดึงรายการ Quotation |
| GET  | `/Quotation/GetQuotationDetail` | ดึงรายละเอียด Quotation |
| POST | `/Quotation/AddQuotation`       | สร้าง Quotation |
| POST | `/Quotation/ApproveQuotation`   | อนุมัติ Quotation |
| POST | `/Quotation/EditQuotationInfo`  | แก้ไขข้อมูล Quotation |
| POST | `/Quotation/EditQuotation`      | แก้ไข Quotation (รวมรายการสินค้า) |
| POST | `/Quotation/VoidQuotation`      | ยกเลิก Quotation |

---

## 💰 FINANCE

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/Finance/GetIncomes`            | ดึงรายการรายรับ |
| GET  | `/Finance/GetIncomeDetail`       | ดึงรายละเอียดรายรับ |
| POST | `/Finance/AddIncome`             | สร้างรายรับ |
| POST | `/Finance/UpdateIncomePayment`   | อัปเดตการชำระเงินของรายรับ |
| GET  | `/Finance/GetExpenses`           | ดึงรายการรายจ่าย |
| GET  | `/Finance/GetExpenseDetail`      | ดึงรายละเอียดรายจ่าย |
| POST | `/Finance/AddExpense`            | สร้างรายจ่าย |
| POST | `/Finance/UpdateExpensePayment`  | อัปเดตการชำระเงินของรายจ่าย |
| GET  | `/Finance/GetMoneyTransfers`     | ดึงรายการโอนเงิน |
| GET  | `/Finance/GetMoneyTransferDetail`| ดึงรายละเอียดการโอนเงิน |
| POST | `/Finance/AddMoneyTransfer`      | สร้างรายการโอนเงิน |

---

## 📁 FILE UPLOAD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/Order/GetOrderFiles`                      | ดึงรายการไฟล์ของ Order |
| GET  | `/Order/GetOrderFileDetail`                 | ดึงรายละเอียดและ Binary data ของไฟล์ใน Order |
| POST | `/Order/AddOrderFile`                       | อัปโหลดไฟล์แนบไปยัง Order |
| GET  | `/PurchaseOrder/GetPurchaseOrderFiles`      | ดึงรายการไฟล์ของ Purchase Order |
| GET  | `/PurchaseOrder/GetPurchaseOrderFileDetail` | ดึงรายละเอียดและ Binary data ของไฟล์ใน PO |
| POST | `/PurchaseOrder/AddPurchaseOrderFile`       | อัปโหลดไฟล์แนบไปยัง Purchase Order |
| GET  | `/Quotation/GetQuotationFiles`              | ดึงรายการไฟล์ของ Quotation |
| GET  | `/Quotation/GetQuotationFileDetail`         | ดึงรายละเอียดและ Binary data ของไฟล์ใน Quotation |
| POST | `/Quotation/AddQuotationFile`               | อัปโหลดไฟล์แนบไปยัง Quotation |

---

## 📄 DOCUMENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/Document/GetDocuments`      | ดึงรายการเอกสารทั้งหมด (Receipt, Tax Invoice, Invoice, Quotation, Withholding Tax) |
| GET  | `/Document/GetDocumentOrders` | ดึงรายการเอกสารของ Order |
| POST | `/Document/AddDocumentOrder`  | สร้างเอกสารให้ Order |

**Document Types** (param: `documenttype`): `1`=Receipt · `2`=Tax Invoice · `3`=Invoice · `4`=Quotation · `5`=Withholding Tax

---

## 🏪 MERCHANT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/Merchant/GetSalesChannels`   | ดึงรายการช่องทางขาย |
| GET | `/Merchant/GetPaymentMethods`  | ดึงรายการวิธีชำระเงิน |
| GET | `/Merchant/GetShippingChannels`| ดึงรายการช่องทางจัดส่ง |
| GET | `/Merchant/GetMerchantProfile` | ดึงข้อมูลร้านค้า |

---

## 🤝 PARTNER AUTHENTICATION

ใช้สำหรับ Partner ที่ต้องการให้ผู้ใช้ Login และรับ API credentials กลับมา

**Step 1:** POST ไปที่ `https://secure.zortout.com/Connect/Register` พร้อม params:

| Param | Description |
|-------|-------------|
| `partnersecretkey` | Partner Secret Key (ได้รับจาก Zortout) |
| `token` | Reference key ของคุณ |
| `returnurl` | URL ที่รับ callback หลัง login สำเร็จ |

**Step 2:** ระบบจะ POST กลับมาที่ `{returnurl}` พร้อม:

| Param | Description |
|-------|-------------|
| `token1` | storename |
| `token2` | apikey |
| `token3` | apisecret |
| `token4` | Account name |
| `token5` | Your token (reference key) |

---

## 📌 Notes สำคัญ

| หัวข้อ | รายละเอียด |
|--------|-----------|
| Date format | `yyyy-MM-dd` |
| DateTime format | `yyyy-MM-dd HH:mm` |
| Discount format | `5.00` (fixed amount) หรือ `10%` (percentage) |
| id/number | ทุก POST ที่เกี่ยวกับ Order/PO/Transfer สามารถใช้ `id` หรือ `number` แทนกันได้ |
| uniquenumber | ใส่ใน query param เพื่อป้องกัน duplicate transaction |
| warehousecode | Stock API ต้องระบุ warehousecode เป็น query parameter |
| Response Code | `200` = Success |
| Limit | ส่วนใหญ่ Max = 500 per page ยกเว้น Document Max = 200 |
| File Upload | ส่งเป็น Binary Data (multipart/form-data) |
| File Download | Response เป็น Base64 Encoded Data |
