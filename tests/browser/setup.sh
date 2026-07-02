#!/usr/bin/env bash
# ติดตั้ง lib UMD + playwright-core สำหรับ headless browser test (ครั้งเดียว)
# CDN (unpkg/cdnjs) มักถูกบล็อกในสภาพแวดล้อม CI/agent → ดึงผ่าน npm registry แทนแล้ว self-host
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
CACHE="$DIR/.cache"
mkdir -p "$DIR/vendor"

echo "[setup] npm install libs (react/react-dom/prop-types/recharts/babel) + playwright-core…"
npm install --no-save --prefix "$CACHE" \
  react@18.3.1 react-dom@18.3.1 prop-types@15.8.1 recharts@2.12.7 \
  @babel/standalone@7.29.0 playwright-core@1.47.0 >/dev/null 2>&1

cp "$CACHE/node_modules/react/umd/react.production.min.js"        "$DIR/vendor/react.js"
cp "$CACHE/node_modules/react-dom/umd/react-dom.production.min.js" "$DIR/vendor/react-dom.js"
cp "$CACHE/node_modules/prop-types/prop-types.min.js"             "$DIR/vendor/prop-types.js"
cp "$CACHE/node_modules/recharts/umd/Recharts.js"                 "$DIR/vendor/recharts.js"
cp "$CACHE/node_modules/@babel/standalone/babel.min.js"           "$DIR/vendor/babel.js"

echo "[setup] เสร็จ — vendor/ พร้อมใช้"
