import jsQR from 'jsqr';
import type { ScanResult } from '../types';

/** Flatten the (possibly transparent) QR canvas onto white at the requested
 *  size. jsqr inspects RGB without using alpha, so transparent "light" pixels
 *  would otherwise read as pure black. */
function flattenOnWhite(source: HTMLCanvasElement, targetSize: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = targetSize;
  out.height = targetSize;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetSize, targetSize);
  return out;
}

function decodeAt(canvas: HTMLCanvasElement, size: number): ScanResult {
  const scaled = flattenOnWhite(canvas, size);
  const ctx = scaled.getContext('2d')!;
  const { data, width, height } = ctx.getImageData(0, 0, scaled.width, scaled.height);
  const result = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  return {
    size,
    ok: !!result,
    decoded: result?.data,
  };
}

export function verify(canvas: HTMLCanvasElement, sizes: number[]): ScanResult[] {
  return sizes.map((s) => decodeAt(canvas, s));
}
