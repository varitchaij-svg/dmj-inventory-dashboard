import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const SERVICE_WORKER = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');

function grab(re) {
  const match = SOURCE.match(re);
  if (!match) throw new Error('ไม่พบฟังก์ชันต้นทาง: ' + re);
  return match[0];
}

const LOAD_IMG = grab(/async function loadImgForCard\(imageUrl, attempt\) \{[\s\S]*?\n\}/);
const EXPORT_PDF = grab(/async function downloadSupplierCardsPdf\(groupName, items, accentColor, onProgress\) \{[\s\S]*?\n\}/);

function makeImageLoader({ fetch, dmjJson, Image = class {} }) {
  return new Function('window', 'GOOGLE_SHEET_URL', 'fetch', 'dmjJson', 'AbortController', 'URL', 'setTimeout', 'clearTimeout',
    LOAD_IMG + '\nreturn loadImgForCard;')(
    { Image }, 'https://script.google.com/macros/s/test/exec', fetch, dmjJson,
    AbortController, URL, setTimeout, clearTimeout
  );
}

describe('catalog PDF image loading', () => {
  it('retries a temporary proxy failure after a short pause and waits for the image to decode', async () => {
    let calls = 0;
    class FakeImage {
      naturalWidth = 0;
      set src(value) {
        this.url = value;
        this.naturalWidth = 640;
        queueMicrotask(() => this.onload());
      }
    }
    const loader = makeImageLoader({
      fetch: async () => {
        calls++;
        return calls === 1
          ? { ok: false, status: 503 }
          : { ok: true, status: 200, payload: { d: 'data:image/jpeg;base64,abc' } };
      },
      dmjJson: async response => response.payload,
      Image: FakeImage,
    });

    const image = await loader('https://cdn.example/product.jpg');
    expect(calls).toBe(2);
    expect(image.naturalWidth).toBe(640);
  });

  it('does not retry a permanent not-found image response', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, payload: { err: 'not_found' } }));
    const loader = makeImageLoader({ fetch, dmjJson: async response => response.payload });

    await expect(loader('https://cdn.example/gone.jpg')).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops before creating or saving a PDF when a listed product image is still missing', async () => {
    const loader = async () => null;
    const save = vi.fn();
    const exportPdf = new Function(
      'ensureJsPDF', 'loadImgForCard', 'window', 'drawSupplierPdfCard', 'drawPdfHeaderCanvas', 'drawPdfFooterCanvas',
      EXPORT_PDF + '\nreturn downloadSupplierCardsPdf;'
    )(
      async () => {}, loader, { jspdf: { jsPDF: vi.fn(() => ({ save })) } },
      vi.fn(), vi.fn(), vi.fn()
    );

    await expect(exportPdf('K', [
      { sku: 'OK001', imageUrl: 'https://cdn.example/ok.jpg' },
      { sku: 'MISS002', imageUrl: 'https://cdn.example/missing.jpg' },
    ])).rejects.toThrow(/MISS002/);
    expect(save).not.toHaveBeenCalled();
  });

  it('stops without saving when a loaded image cannot be rendered into its SKU card', async () => {
    const image = { naturalWidth: 640 };
    const loader = vi.fn(async () => image);
    const save = vi.fn();
    const doc = { addImage: vi.fn(), addPage: vi.fn(), save };
    const canvas = { toDataURL: vi.fn(() => 'data:image/jpeg;base64,card') };
    const drawCard = vi.fn((product, loadedImage) => {
      if (loadedImage) throw new Error('canvas failed');
      return canvas;
    });
    const exportPdf = new Function(
      'ensureJsPDF', 'loadImgForCard', 'window', 'drawSupplierPdfCard', 'drawPdfHeaderCanvas', 'drawPdfFooterCanvas',
      EXPORT_PDF + '\nreturn downloadSupplierCardsPdf;'
    )(
      async () => {}, loader, { jspdf: { jsPDF: vi.fn(() => doc) } }, drawCard,
      () => canvas, () => canvas
    );

    await expect(exportPdf('K', [
      { sku: 'DRAWFAIL003', imageUrl: 'https://cdn.example/product.jpg' },
    ])).rejects.toThrow(/DRAWFAIL003/);
    expect(drawCard).toHaveBeenCalledWith(expect.objectContaining({ sku: 'DRAWFAIL003' }), image, expect.any(String), expect.any(Number), expect.any(Number));
    expect(save).not.toHaveBeenCalled();
  });

  it('bumps the PWA cache so mobile devices receive the updated exporter immediately', () => {
    const match = SERVICE_WORKER.match(/const CACHE_NAME = "dmj-v(\d+)"/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(62);
  });
});
