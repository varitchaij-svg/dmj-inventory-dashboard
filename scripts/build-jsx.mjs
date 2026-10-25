// scripts/build-jsx.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Precompile ไฟล์ .jsx → dist/*.js ตอน "deploy" (แทนการ Babel.transform ในเบราว์เซอร์)
//
// ทำไม: สถาปัตยกรรมนี้ compile JSX ~1.8MB ในเบราว์เซอร์ทุกครั้งที่ ETag เปลี่ยน (= ทุก deploy
// ที่แตะ .jsx) บน CPU มือถือ = คอขวดที่มองไม่เห็น · precompile ทีเดียวตอน build แล้ว ship .js
// → เบราว์เซอร์แค่ fetch+inject ไม่ต้อง compile และไม่ต้องโหลด Babel standalone 3MB เลย
//
// ⚠️ ต้องตรงกับ config ในเบราว์เซอร์เป๊ะ (Doomuenjing Dashboard.html — compileJsx):
//     Babel.transform(text, { presets: ['react'], sourceType: 'script', filename: src })
//   ไม่งั้น .js ที่ build ได้จะพฤติกรรมต่างจากที่เคย run = บั๊กเงียบทั้งระบบ
//
// ปลอดภัย (race-free) เมื่อรันเป็น "build command ของ Cloudflare Pages": ผลลัพธ์ถูก generate
//   จาก source ของ commit เดียวกันตอน deploy → dist/*.js ตรงกับ .jsx เสมอในทุก deploy
//   (ถ้าไม่ได้ตั้ง build command → dist/manifest.json ยังเป็น {enabled:false} → เบราว์เซอร์
//    ตกไปเส้นทางเดิม compile .jsx เอง — ไม่มีอะไรพัง)
// ─────────────────────────────────────────────────────────────────────────────
import { transformSync } from '@babel/core';
import presetReact from '@babel/preset-react';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

// ลำดับต้องตรงกับที่ HTML โหลด (i18n ก่อน ui ก่อน views… ก่อน app)
const FILES = [
  'i18n.jsx', 'ui.jsx', 'views-main.jsx', 'views-analytics.jsx',
  'views-quote.jsx', 'views-attendance.jsx', 'app.jsx',
];

mkdirSync(DIST, { recursive: true });

// Embed exact source identity in HTML, so even a missing dist cannot mix releases.
const htmlPath = join(ROOT, 'Doomuenjing Dashboard.html');
let html = readFileSync(htmlPath, 'utf8');
const release = html.match(/_dmjBootVersion = '([^']+)'/)[1];
const sourceHashes = Object.fromEntries(FILES.map(src => [src,
  createHash('sha1').update(readFileSync(join(ROOT, src))).digest('hex').slice(0, 12)]));
const buildId = createHash('sha256').update(JSON.stringify(sourceHashes)).digest('hex').slice(0, 16);
if (!html.includes('window._dmjSourceHashes = ') || !html.includes('window._dmjBuildId = ')) throw new Error('Missing HTML build identity markers');
html = html.replace(/window\._dmjBuildId = '[^']*';/, "window._dmjBuildId = '" + buildId + "';")
  .replace(/window\._dmjSourceHashes = \{[^\n]*\};/, 'window._dmjSourceHashes = ' + JSON.stringify(sourceHashes) + ';');
writeFileSync(htmlPath, html);
const manifest = { enabled: true, release, buildId, builtAt: new Date().toISOString(), files: {} };
let total = 0;

for (const src of FILES) {
  const code = readFileSync(join(ROOT, src), 'utf8');
  const out = transformSync(code, {
    presets: [presetReact],   // = presets:['react'] ในเบราว์เซอร์
    sourceType: 'script',     // ไฟล์ใช้ global scope ไม่มี import/export — ต้องตรงกับเบราว์เซอร์
    filename: src,
    babelrc: false,
    configFile: false,
    compact: false,
  }).code;

  // hash ของ "source" ไว้ผูกกับ .js — ให้ frontend/ตัวตรวจรู้ว่า .js นี้มาจาก .jsx เวอร์ชันไหน
  const hash = createHash('sha1').update(code).digest('hex').slice(0, 12);
  const outName = src.replace(/\.jsx$/, '.' + hash + '.js');
  writeFileSync(join(DIST, outName), out);
  // Older cached HTML ignores manifest.out and requests dist/<name>.js.
  // Keep aliases for rollout/rollback; the new loader fetches only the hashed file.
  writeFileSync(join(DIST, src.replace(/\.jsx$/, '.js')), out);
  const bytes = Buffer.byteLength(out);
  manifest.files[src] = { out: outName, srcHash: hash, bytes };
  total += bytes;
  console.log(`  ✓ ${src.padEnd(22)} → dist/${outName}  (${Math.round(bytes / 1024)}KB)`);
}

writeFileSync(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nprecompile เสร็จ: ${FILES.length} ไฟล์ · รวม ${Math.round(total / 1024)}KB → dist/`);
