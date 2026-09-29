import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const ANALYTICS = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const UI = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');

function sourceFunction(source, name) {
  const re = new RegExp(`^function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\}`, 'm');
  const match = source.match(re);
  if (!match) throw new Error(`Function not found in source: ${name}`);
  return match[0];
}

function loadFunctions(source, names, args = [], values = []) {
  const declarations = names.map(name => sourceFunction(source, name)).join('\n');
  return new Function(...args, `${declarations}\nreturn { ${names.join(', ')} };`)(...values);
}

describe('order compare-and-set baseline', () => {
  const { normalizeOrderStateField_, checkOrderStateBaseline_, requestedOrderStateMatches_ } =
    loadFunctions(GAS, ['normalizeOrderStateField_', 'checkOrderStateBaseline_', 'requestedOrderStateMatches_']);

  it('accepts a write only when every touched field still matches the client baseline', () => {
    const current = { status:'รอ', preparedQty:0, printFlag:null, carryMode:'truck', toCentral:false };
    expect(checkOrderStateBaseline_(current, { expectedState:{ preparedQty:0 } }, ['preparedQty']))
      .toEqual({ ok:true, missing:[], changed:[] });
  });

  it('rejects a stale prepared quantity even when the other order fields are untouched', () => {
    const current = { status:'รอ', preparedQty:5, printFlag:null, carryMode:'truck', toCentral:false };
    const result = checkOrderStateBaseline_(current, { expectedState:{ preparedQty:2 } }, ['preparedQty']);
    expect(result).toEqual({ ok:false, missing:[], changed:['preparedQty'] });
    expect(requestedOrderStateMatches_(current, { preparedQty:3 }, ['preparedQty'])).toBe(false);
  });

  it('fails closed if an older client omitted the expected baseline', () => {
    const current = { status:'รอ', preparedQty:0, printFlag:null, carryMode:'truck', toCentral:false };
    expect(checkOrderStateBaseline_(current, {}, ['status'])).toEqual({ ok:false, missing:['status'], changed:[] });
  });

  it('normalizes blank sheet values and the carry-mode representation consistently', () => {
    expect(normalizeOrderStateField_('status', '')).toBe('รอ');
    expect(normalizeOrderStateField_('carryMode', 'หิ้ว')).toBe('carry');
    expect(normalizeOrderStateField_('toCentral', '1')).toBe(true);
  });
});

describe('shipment receive compare-and-set baseline', () => {
  const { checkShipmentReceiveBaseline_ } = loadFunctions(GAS, ['checkShipmentReceiveBaseline_']);

  it('accepts the exact receipt snapshot and treats an empty receipt as null quantity', () => {
    expect(checkShipmentReceiveBaseline_(
      { sentQty:10, receivedAt:'', receivedQty:null, receivedStatus:'' },
      { sentQty:10, receivedAt:'', receivedQty:null, receivedStatus:'' },
    )).toEqual({ ok:true, missing:[], changed:[] });
  });

  it('rejects a receipt quantity or timestamp changed by another user', () => {
    const current = { sentQty:10, receivedAt:'29/09/2026 10:15', receivedQty:4, receivedStatus:'รับไม่ครบ' };
    expect(checkShipmentReceiveBaseline_(current,
      { sentQty:10, receivedAt:'', receivedQty:null, receivedStatus:'' }))
      .toEqual({ ok:false, missing:[], changed:['receivedAt','receivedQty','receivedStatus'] });
  });

  it('rejects a stale sent quantity because it changes the derived receive status', () => {
    expect(checkShipmentReceiveBaseline_(
      { sentQty:12, receivedAt:'', receivedQty:null, receivedStatus:'' },
      { sentQty:10, receivedAt:'', receivedQty:null, receivedStatus:'' },
    )).toEqual({ ok:false, missing:[], changed:['sentQty'] });
  });

  it('fails closed when an older client does not send the baseline', () => {
    expect(checkShipmentReceiveBaseline_(
      { sentQty:10, receivedAt:'', receivedQty:null, receivedStatus:'' }, null))
      .toEqual({ ok:false, missing:['sentQty','receivedAt','receivedQty','receivedStatus'], changed:[] });
  });
});

describe('GET session authorization', () => {
  const functions = [
    sourceFunction(GAS, 'authorizeOrderGet_'),
    sourceFunction(GAS, 'orderGetGate_'),
  ].join('\n');

  function gates({ loginRequired = false, sessions = {} } = {}) {
    return new Function(
      'resolveSession_', 'SpreadsheetApp', 'SHEET_ID', 'isAdminRole_', 'forbidden_',
      'unauthorized_', 'requireLoginEnabled_',
      `var ORDER_GET_COMMON_ROLES_ = ["saler", "storedevice", "frontstore", "warehouse", "employee"];\n${functions}\nreturn { authorizeOrderGet_, orderGetGate_ };`,
    )(
      (_ss, token) => sessions[token] || null,
      { openById:() => ({}) },
      'sheet',
      role => role === 'owner' || role === 'dev',
      error => ({ kind:'forbidden', error }),
      () => ({ kind:'unauthorized' }),
      () => loginRequired,
    );
  }

  it('allows anonymous migration traffic only while login is optional', () => {
    expect(gates().authorizeOrderGet_({}, ['warehouse'], false)).toBe(null);
    expect(gates({ loginRequired:true }).authorizeOrderGet_({}, ['warehouse'], false).kind).toBe('forbidden');
  });

  it('rejects invalid and inactive supplied sessions instead of downgrading to anonymous', () => {
    const g = gates({ sessions:{ inactive:{ role:'warehouse', status:'disabled' } } });
    expect(g.authorizeOrderGet_({ sessionToken:'invalid' }, ['warehouse'], false).kind).toBe('unauthorized');
    expect(g.authorizeOrderGet_({ sessionToken:'inactive' }, ['warehouse'], false).kind).toBe('unauthorized');
  });

  it('enforces endpoint roles even during migration and reserves repair GETs for owner/dev', () => {
    const g = gates({ sessions:{
      sales:{ role:'saler', status:'active' },
      front:{ role:'frontstore', status:'active' },
      owner:{ role:'owner', status:'active' },
    } });
    expect(g.orderGetGate_({ sessionToken:'sales' }, 'recentIntake')).toBe(null);
    expect(g.orderGetGate_({ sessionToken:'front' }, 'billCheck').kind).toBe('forbidden');
    expect(g.orderGetGate_({ sessionToken:'front' }, 'applyTransferReceipts').kind).toBe('forbidden');
    expect(g.orderGetGate_({ sessionToken:'owner' }, 'applyTransferReceipts')).toBe(null);
    expect(g.orderGetGate_({}, 'applyTransferReceipts').kind).toBe('forbidden');
  });
});

describe('frontend snapshot ordering', () => {
  const { shouldApplyOrdersSnapshot, protectFullSnapshotSections } =
    loadFunctions(APP, ['shouldApplyOrdersSnapshot', 'protectFullSnapshotSections']);

  it('drops out-of-order, mutation-crossing, pending-write, and older-than-write polls', () => {
    const base = { requestSeq:3, appliedSeq:2, pendingAtStart:0, pendingNow:0,
      revisionAtStart:4, revisionNow:4, generatedAt:300, latestServerAt:200, lastWriteAt:250 };
    expect(shouldApplyOrdersSnapshot(base)).toBe(true);
    expect(shouldApplyOrdersSnapshot({ ...base, requestSeq:1 })).toBe(false);
    expect(shouldApplyOrdersSnapshot({ ...base, pendingNow:1 })).toBe(false);
    expect(shouldApplyOrdersSnapshot({ ...base, revisionNow:5 })).toBe(false);
    expect(shouldApplyOrdersSnapshot({ ...base, generatedAt:249 })).toBe(false);
  });

  it('keeps newer order and shipment sections when an older full payload arrives', () => {
    const live = { orders:[{ id:'R8', status:'สำเร็จ' }], ordersServerAt:400, ordersFetchedAt:99,
      shipments:[{ id:'S9', receivedQty:2 }], shipmentsServerAt:450 };
    const incoming = { orders:[{ id:'R8', status:'รอ' }], shipments:[{ id:'S9', receivedQty:null }] };
    const merged = protectFullSnapshotSections(incoming, live, { preserveOrders:true, preserveShipments:true });
    expect(merged.orders).toBe(live.orders);
    expect(merged.ordersServerAt).toBe(400);
    expect(merged.shipments).toBe(live.shipments);
    expect(merged.shipmentsServerAt).toBe(450);
  });
});

describe('order local overlays', () => {
  const funcs = loadFunctions(ANALYTICS, ['orderSig', 'reconcileOrderState']);
  const order = { sku:'SKU1', date:'29/09/26', orderQty:3, status:'รอ', preparedQty:0 };
  const writeAt = '2026-09-29T10:00:00.000Z';
  const local = { preparedQty:2, sig:funcs.orderSig(order), serverConfirmedAt:{ preparedQty:writeAt } };

  it('retains a confirmed value until the server snapshot is newer', () => {
    expect(funcs.reconcileOrderState({ ...order, _ordersServerAt:Date.parse(writeAt) - 1 }, local).preparedQty).toBe(2);
  });

  it('drops the local overlay after a newer server snapshot lands', () => {
    const merged = funcs.reconcileOrderState({ ...order, _ordersServerAt:Date.parse(writeAt) + 1 }, local);
    expect(merged).toEqual({});
  });
});

describe('session URL helper', () => {
  const helper = sourceFunction(UI, 'dmjSessionUrl');
  const withToken = new Function('localStorage', `${helper}\nreturn dmjSessionUrl;`)({ getItem:() => 'session token' });
  const withoutToken = new Function('localStorage', `${helper}\nreturn dmjSessionUrl;`)({ getItem:() => null });

  it('adds the active session to a GET URL and preserves an existing token', () => {
    expect(withToken('/api?action=orders')).toBe('/api?action=orders&sessionToken=session%20token');
    expect(withToken('/api?action=orders&sessionToken=existing')).toBe('/api?action=orders&sessionToken=existing');
    expect(withoutToken('/api?action=orders')).toBe('/api?action=orders');
  });
});
