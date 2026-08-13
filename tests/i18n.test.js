// tests/i18n.test.js — ระบบหลายภาษา (i18n.jsx)
// eval ไฟล์จริง (ไม่ copy) ด้วย window/localStorage/document ปลอม — เหมือน auth.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'i18n.jsx'), 'utf8');

// สร้าง sandbox ใหม่ทุกครั้ง (window/localStorage สะอาด) แล้ว eval i18n.jsx จริง
function loadI18n(stored) {
  const store = {};
  if (stored != null) store.dmj_lang = stored;
  const win = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const document = { documentElement: { setAttribute() {} } };
  const React = { useState: () => [null, () => {}], useEffect: () => {} };
  win.Event = class { constructor(n) { this.type = n; } };
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'localStorage', 'document', 'React', 'module', 'Event', SRC);
  fn(win, localStorage, document, React, mod, win.Event);
  return { ...mod.exports, _win: win, _store: store };
}

describe('i18n — โครงสร้างภาษา', () => {
  it('มี 3 ภาษา: th, en, my', () => {
    const { DMJ_LANG_CODES } = loadI18n();
    expect(DMJ_LANG_CODES).toEqual(['th', 'en', 'my']);
  });
  it('default = th เมื่อไม่มีค่าใน localStorage', () => {
    const { getLang } = loadI18n();
    expect(getLang()).toBe('th');
  });
  it('อ่านภาษาที่เก็บไว้ตอนโหลด', () => {
    const { getLang } = loadI18n('my');
    expect(getLang()).toBe('my');
  });
  it('ค่าภาษาที่ไม่รู้จักใน localStorage → fallback th', () => {
    const { getLang } = loadI18n('xx');
    expect(getLang()).toBe('th');
  });
});

describe('t() — แปล + fallback', () => {
  it('ภาษา th → คืนข้อความไทยเดิม (key = ไทย)', () => {
    const { t } = loadI18n('th');
    expect(t('เข้าสู่ระบบด้วย LINE')).toBe('เข้าสู่ระบบด้วย LINE');
  });
  it('ภาษา en → คืนคำแปลอังกฤษเมื่อมีใน dictionary', () => {
    const { t } = loadI18n('en');
    expect(t('ออกจากระบบ')).toBe('Log out');
  });
  it('ภาษา my → คืนคำแปลพม่าเมื่อมี', () => {
    const { t, DMJ_I18N } = loadI18n('my');
    expect(t('ออกจากระบบ')).toBe(DMJ_I18N['ออกจากระบบ'].my);
  });
  it('key ที่ยังไม่มีคำแปล → คืนไทยเสมอ (ไม่พังบน production)', () => {
    const { t } = loadI18n('en');
    expect(t('ข้อความที่ยังไม่ได้แปลเลย')).toBe('ข้อความที่ยังไม่ได้แปลเลย');
  });
  it('key เป็น null → ไม่ throw', () => {
    const { t } = loadI18n('en');
    expect(() => t(null)).not.toThrow();
  });
});

describe('t() — แทนที่ตัวแปร {var}', () => {
  it('แทน {n} ด้วยค่าที่ส่งมา (ทั้งใน th ที่คืน key เดิม)', () => {
    const { t } = loadI18n('th');
    expect(t('สั่งแล้ว {n}', { n: 5 })).toBe('สั่งแล้ว 5');
  });
  it('ตัวแปรที่ไม่ได้ส่งมา → คงรูป {var} ไว้', () => {
    const { t } = loadI18n('th');
    expect(t('ของ {name}', {})).toBe('ของ {name}');
  });
});

describe('setLang()', () => {
  it('เปลี่ยนภาษา + เขียน localStorage + dispatch event', () => {
    let fired = false;
    const inst = loadI18n('th');
    inst._win.dispatchEvent = () => { fired = true; return true; };
    inst.setLang('en');
    expect(inst.getLang()).toBe('en');
    expect(inst._store.dmj_lang).toBe('en');
    expect(fired).toBe(true);
  });
  it('ภาษาที่ไม่รู้จัก → ไม่เปลี่ยน (กันค่าเพี้ยน)', () => {
    const inst = loadI18n('th');
    inst.setLang('zz');
    expect(inst.getLang()).toBe('th');
  });
});

describe('dictionary — คำแปลครบทั้ง en และ my ทุก key (ไม่ตกหล่นภาษาใดภาษาหนึ่ง)', () => {
  it('ทุก key มีทั้ง en และ my', () => {
    const { DMJ_I18N } = loadI18n();
    const missing = [];
    for (const k of Object.keys(DMJ_I18N)) {
      const e = DMJ_I18N[k];
      if (!e.en) missing.push(k + ' (en)');
      if (!e.my) missing.push(k + ' (my)');
    }
    expect(missing).toEqual([]);
  });
});
