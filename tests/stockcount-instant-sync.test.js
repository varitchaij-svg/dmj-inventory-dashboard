// Regression coverage for immediate inventory updates and explicit ZORT results.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const MAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const VIEWS = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grabTopLevelFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Function not found: ' + name);
  const end = src.indexOf('\n}\n', start);
  if (end < 0) throw new Error('Function end not found: ' + name);
  return src.slice(start, end + 2);
}

const UPDATE_FRONTSTORE = grabTopLevelFunction(GAS, 'updateFrontStore');
const PUSH_STOCK = grabTopLevelFunction(GAS, 'pushStockToZort_');
const RETAIN_EDITS = grabTopLevelFunction(VIEWS, 'retainUnsavedFrontStoreEdits_');
const BUILD_FS_PATCH = grabTopLevelFunction(VIEWS, 'frontStorePatchFromSave_');
const PATCH_MODAL_RESULT = grabTopLevelFunction(MAIN, 'patchFrontStoreProductFromResult_');

function makeSheet(rows) {
  return {
    rows,
    getDataRange() {
      return { getValues: () => this.rows.map(row => row.slice()) };
    },
    getLastRow() { return this.rows.length; },
    getRange(row, col, numRows) {
      const thisSheet = this;
      return {
        getValues() {
          return thisSheet.rows.slice(row - 1, row - 1 + numRows)
            .map(valuesRow => [valuesRow[col - 1]]);
        },
        setValue(value) { thisSheet.rows[row - 1][col - 1] = value; },
        setValues(values) {
          values.forEach((valuesRow, i) => {
            valuesRow.forEach((value, j) => {
              thisSheet.rows[row - 1 + i][col - 1 + j] = value;
            });
          });
        },
      };
    },
    appendRow(row) { this.rows.push(row.slice()); },
  };
}

function runUpdateFrontStore({ pushSucceeds, frontRows, productRows }) {
  let cacheInvalidations = 0;
  let pushed = [];
  const source = `
    const SHEET_FRONTSTORE_QTY = "จำนวนหน้าร้าน";
    const SHEET_PRODUCTS = "อัพเดทจำนวนสินค้า";
    const COL_PROD_SKU = 2;
    const COL_PROD_QTYFS = 7;
    const WH_FRONTSTORE = "W0001";
    const LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
    const SpreadsheetApp = { flush: () => {} };
    const Logger = { log: () => {} };
    const ok = data => ({ success: true, data });
    const error = message => ({ success: false, error: message });
    const auditDetail_ = value => JSON.stringify(value);
    const writeAuditLog_ = () => {};
    const invalidateCache_ = () => { __invalidate(); };
    const pushStockToZort_ = items => { __pushed(items); return __pushSucceeds; };
    ${UPDATE_FRONTSTORE}
    return updateFrontStore;
  `;
  const update = new Function('__invalidate', '__pushed', '__pushSucceeds', source)(
    () => { cacheInvalidations++; },
    items => { pushed = items; },
    pushSucceeds
  );
  const front = makeSheet(frontRows.map(row => row.slice()));
  const products = makeSheet(productRows.map(row => row.slice()));
  const ss = { getSheetByName(name) {
    if (name === 'จำนวนหน้าร้าน') return front;
    if (name === 'อัพเดทจำนวนสินค้า') return products;
    return null;
  }};
  const result = update(ss, [{ sku: ' sku-1 ', qty: 8 }], '23/09/2026 10:00', 'staff');
  return { result, front, products, pushed, cacheInvalidations };
}

function runPushStock(code) {
  const source = `
    const ZORT_BASE = "https://zort.invalid";
    const WH_SAI5 = "W0001";
    const Logger = { log: () => {} };
    const zortHeaders_ = () => ({});
    const zortRespError_ = res => res.getResponseCode() === 200 ? null : "HTTP " + res.getResponseCode();
    const logZortFailure_ = () => {};
    const UrlFetchApp = { fetch: () => ({
      getResponseCode: () => __code,
      getContentText: () => "{}",
    }) };
    ${PUSH_STOCK}
    return pushStockToZort_;
  `;
  const push = new Function('__code', source)(code);
  return push([{ sku: 'SKU-1', qty: 4 }]);
}

describe('front-store inventory writes', () => {
  const frontRows = [new Array(11).fill('header')];
  const productHeader = new Array(10).fill('header');
  const productRow = new Array(10).fill('');
  productRow[1] = 'SKU-1';
  productRow[6] = 3;

  it('writes the ZORT-confirmed quantity into the product sheet and returns a patchable result', () => {
    const { result, products, pushed, cacheInvalidations } = runUpdateFrontStore({
      pushSucceeds: true, frontRows, productRows: [productHeader, productRow],
    });
    expect(result.success).toBe(true);
    expect(result.data.zortSynced).toBe(true);
    expect(result.data.stockUpdated).toBe(true);
    expect(result.data.items).toEqual([
      { sku: 'SKU-1', qty: 8, at: '23/09/2026 10:00', stockUpdated: true },
    ]);
    expect(products.rows[1][6]).toBe(8);
    expect(pushed).toEqual([{ sku: 'SKU-1', qty: 8, warehousecode: 'W0001' }]);
    expect(cacheInvalidations).toBe(1);
  });

  it('retains a failed ZORT count for review without claiming product stock changed', () => {
    const { result, front, products } = runUpdateFrontStore({
      pushSucceeds: false, frontRows, productRows: [productHeader, productRow],
    });
    expect(result.success).toBe(true);
    expect(result.data.zortSynced).toBe(false);
    expect(result.data.stockUpdated).toBe(false);
    expect(result.data.warning).toMatch(/ZORT/);
    expect(front.rows[1][3]).toBe(8);
    expect(products.rows[1][6]).toBe(3);
    expect(result.data.items[0].stockUpdated).toBe(false);
  });

  it('reports a missing product SKU rather than patching another row', () => {
    const { result, products } = runUpdateFrontStore({
      pushSucceeds: true, frontRows, productRows: [productHeader],
    });
    expect(result.data.zortSynced).toBe(true);
    expect(result.data.stockUpdated).toBe(false);
    expect(result.data.missingSkus).toEqual(['SKU-1']);
    expect(products.rows).toHaveLength(1);
  });

  it('returns the ZORT response status instead of silently treating a rejected push as success', () => {
    expect(runPushStock(200)).toBe(true);
    expect(runPushStock(503)).toBe(false);
  });
});

describe('immediate UI stock patches', () => {
  it('retains edits typed while an earlier save is in flight', () => {
    const retain = new Function(RETAIN_EDITS + '\nreturn retainUnsavedFrontStoreEdits_;')();
    const remaining = retain(new Set(['SKU-1', 'SKU-2']),
      { 'SKU-1': 4, 'SKU-2': 7 }, { 'SKU-1': 4, 'SKU-2': 8 });
    expect([...remaining]).toEqual(['SKU-2']);
  });

  it('updates checked fields immediately and visible store stock only after ZORT confirmation', () => {
    const build = new Function(BUILD_FS_PATCH + '\nreturn frontStorePatchFromSave_;')();
    expect(build([{ sku: 'sku-1', qty: 8, at: 'now', stockUpdated: true }])).toEqual({
      'SKU-1': { frontStoreCheckedQty: 8, frontStoreCheckedAt: 'now', qtyStore: 8 },
    });
    expect(build([{ sku: 'sku-1', qty: 8, at: 'now', stockUpdated: false }])).toEqual({
      'SKU-1': { frontStoreCheckedQty: 8, frontStoreCheckedAt: 'now' },
    });
  });

  it('patches the product modal from the server result, even when only the check record was saved', () => {
    const apply = new Function(PATCH_MODAL_RESULT + '\nreturn patchFrontStoreProductFromResult_;')();
    let patch;
    const patcher = value => { patch = value; };
    expect(apply(patcher, { success: true, data: { items: [
      { sku: 'sku-1', qty: 8, at: 'now', stockUpdated: true },
    ] } }, 'SKU-1')).toBe(true);
    expect(patch).toEqual({
      'SKU-1': { frontStoreCheckedQty: 8, frontStoreCheckedAt: 'now', qtyStore: 8 },
    });
    apply(patcher, { success: true, data: { items: [
      { sku: 'SKU-1', qty: 9, at: 'later', stockUpdated: false },
    ] } }, 'SKU-1');
    expect(patch).toEqual({
      'SKU-1': { frontStoreCheckedQty: 9, frontStoreCheckedAt: 'later' },
    });
  });

  it('wires server-confirmed patches into store views and immediate count flows', () => {
    expect(APP).toMatch(/<FrontStoreView[^>]*[\s\S]*?patchProductQtys=\{patchProductQtys\}/);
    expect(APP).toMatch(/<StockCountView[^>]*[\s\S]*?patchProductQtys=\{patchProductQtys\}/);
    expect(APP).toMatch(/<OverviewView[^>]*patchProductQtys=\{patchProductQtys\}/);
    expect(APP).toMatch(/<StockView[^>]*patchProductQtys=\{patchProductQtys\}/);
    expect(APP).toMatch(/<TrendsView[^>]*patchProductQtys=\{patchProductQtys\}/);
    expect(APP).toMatch(/<AddProductView[^>]*patchProductQtys=\{patchProductQtys\}/);
    expect(MAIN).toContain('patchProductQtys={patchProductQtys}');
    expect(MAIN).toContain('patchFrontStoreProductFromResult_(patchProductQtys, res, product.sku)');
    expect(MAIN).toContain('.then(res => patchFrontStoreProductFromResult_(patchProductQtys, res, f.sku))');
  });

  it('keeps front-store retries visible and refuses to finish a request before ZORT confirms', () => {
    const front = VIEWS.slice(VIEWS.indexOf('function FrontStoreView'), VIEWS.indexOf('function FrontStoreView') + 52000);
    expect(front).toContain('applyFrontStoreServerPatch(result.data)');
    expect(front).toContain('retainUnsavedFrontStoreEdits_(prev, savedRevisions, editRevisionRef.current)');
    expect(front).toContain('res.zortSynced === false');
    expect(front).toContain('↻ ส่งยอดซ้ำ');
    const confirm = GAS.slice(GAS.indexOf('function confirmStockCount('), GAS.indexOf('function deleteOrderRow'));
    expect(confirm).toContain('pushStockToZort_(zortItems) && zortSynced');
    expect(confirm).toContain('warning: zortSynced ? null');
    const wh = VIEWS.slice(VIEWS.indexOf('function StockCountView'), VIEWS.indexOf('function StockCountView') + 180000);
    expect(wh).toContain('markZortRetry(confirmEntries, zortSynced)');
    expect(wh).toContain('zortRetrySkus.has(String(e.sku).toUpperCase())');
    expect(wh).toContain('res.zortSynced === false');
    expect(wh).toContain('↻ ส่ง ZORT ซ้ำ');
  });
});
