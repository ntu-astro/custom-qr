import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import QRCode from 'qrcode';
import { Image as CanvasImage } from 'canvas';
import { decodeQrImage } from './decodeQrImage';

/**
 * decodeQrImage uses URL.createObjectURL(file) and assigns the resulting URL
 * to a new Image(). Out of the box, the vitest jsdom environment does not
 * fire onload for blob: or data: URLs (its HTMLImageElement does not decode
 * resources), and it does not implement createObjectURL. To exercise the
 * function end-to-end we:
 *
 * 1. Override globalThis.Image with the `canvas` package's Image, which
 *    decodes data: URLs synchronously and is accepted by jsdom's
 *    canvas-backed drawImage (see vitest.setup.ts for the related ImageData
 *    shim that also leans on the canvas backend).
 * 2. Polyfill URL.createObjectURL to resolve to a data: URL of the blob's
 *    bytes — drop-in equivalent for this Image's purposes.
 */

const blobToDataUrlMap = new WeakMap<Blob, string>();

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  const base64 = btoa(binary);
  return `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
}

const originalImage = globalThis.Image;

beforeAll(() => {
  // Replace Image with the canvas package's implementation so data: URLs
  // assigned to img.src actually decode.
  (globalThis as unknown as { Image: typeof CanvasImage }).Image = CanvasImage;

  const URLCtor = globalThis.URL as unknown as {
    createObjectURL?: (b: Blob) => string;
    revokeObjectURL?: (u: string) => void;
  };
  URLCtor.createObjectURL = (blob: Blob): string => {
    const cached = blobToDataUrlMap.get(blob);
    if (!cached) {
      throw new Error('test polyfill: blob not pre-registered with registerBlob()');
    }
    return cached;
  };
  URLCtor.revokeObjectURL = (): void => {
    /* no-op for test */
  };
});

afterAll(() => {
  (globalThis as unknown as { Image: typeof originalImage }).Image = originalImage;
  const URLCtor = globalThis.URL as unknown as {
    createObjectURL?: (b: Blob) => string;
    revokeObjectURL?: (u: string) => void;
  };
  delete URLCtor.createObjectURL;
  delete URLCtor.revokeObjectURL;
});

async function registerBlob(blob: Blob): Promise<void> {
  const dataUrl = await blobToDataUrl(blob);
  blobToDataUrlMap.set(blob, dataUrl);
}

function dataUrlToBlobSync(dataUrl: string, type: string): Blob {
  const comma = dataUrl.indexOf(',');
  const base64 = dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function makeQrFile(text: string): Promise<File> {
  const dataUrl = await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 6,
  });
  const blob = dataUrlToBlobSync(dataUrl, 'image/png');
  const file = new File([blob], 'qr.png', { type: 'image/png' });
  await registerBlob(file);
  return file;
}

async function makeBlankPngFile(): Promise<File> {
  // 100x100 fully-white PNG via the same canvas backend.
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable in test setup');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 100, 100);
  const dataUrl = canvas.toDataURL('image/png');
  const blob = dataUrlToBlobSync(dataUrl, 'image/png');
  const file = new File([blob], 'blank.png', { type: 'image/png' });
  await registerBlob(file);
  return file;
}

describe('decodeQrImage', () => {
  it('decodes a generated QR image back to its source URL', async () => {
    const url = 'https://www.example.com/decode-test';
    const file = await makeQrFile(url);
    const decoded = await decodeQrImage(file);
    expect(decoded).toBe(url);
  });

  it('throws "No QR code" when the image contains no QR symbol', async () => {
    const file = await makeBlankPngFile();
    await expect(decodeQrImage(file)).rejects.toThrow(/No QR code/);
  });
});
