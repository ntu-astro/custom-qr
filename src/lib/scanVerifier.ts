import jsQR from 'jsqr';
import type { ScanResult } from '../types';

function downscale(source: HTMLCanvasElement, targetSize: number): HTMLCanvasElement {
  if (source.width === targetSize && source.height === targetSize) return source;
  const out = document.createElement('canvas');
  out.width = targetSize;
  out.height = targetSize;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetSize, targetSize);
  return out;
}

function decodeAt(canvas: HTMLCanvasElement, size: number): ScanResult {
  const scaled = downscale(canvas, size);
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
