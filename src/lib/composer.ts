import type { Palette, PosterSize } from '../types';
import { FONT_STACK_CANVAS } from '../types';

const SAFE_ZONE_FRACTION = 0.75;
const QR_BAND_FRACTION = 0.75;
const CAPTION_BAND_FRACTION = 0.25;

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  startSize: number,
): number {
  let size = startSize;
  while (size > 12) {
    ctx.font = `600 ${size}px ${ctx.canvas.dataset.fontFamily ?? 'sans-serif'}`;
    const m = ctx.measureText(text);
    if (m.width <= maxWidth && size <= maxHeight) return size;
    size -= 2;
  }
  return size;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawAccentHalo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  accent: string,
  seed: number,
) {
  const dotCount = 280;
  const rand = mulberry32(seed);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < dotCount; i++) {
    const angle = (i / dotCount) * Math.PI * 2 + rand() * 0.1;
    const r = innerRadius + rand() * (outerRadius - innerRadius);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const size = 2 + rand() * 6;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function composePoster(
  qrCanvas: HTMLCanvasElement,
  caption: string,
  size: PosterSize,
  palette: Palette,
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = size.width;
  out.height = size.height;
  out.dataset.fontFamily = FONT_STACK_CANVAS;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.width, size.height);

  const minDim = Math.min(size.width, size.height);
  const safe = minDim * SAFE_ZONE_FRACTION;
  const safeX = (size.width - safe) / 2;
  const safeY = (size.height - safe) / 2;

  const haloSeed = (caption.length + size.width + size.height) >>> 0;
  drawAccentHalo(
    ctx,
    size.width / 2,
    size.height / 2,
    safe * 0.55,
    safe * 0.85,
    palette.accent,
    haloSeed,
  );

  const qrBandHeight = safe * QR_BAND_FRACTION;
  const captionBandHeight = safe * CAPTION_BAND_FRACTION;
  const qrSide = Math.min(safe, qrBandHeight);
  const qrX = safeX + (safe - qrSide) / 2;
  const qrY = safeY + (qrBandHeight - qrSide) / 2;

  ctx.drawImage(qrCanvas, qrX, qrY, qrSide, qrSide);

  if (caption) {
    const trimmed = caption.trim();
    const maxFontSize = captionBandHeight * 0.55;
    const fontSize = fitFontSize(ctx, trimmed, safe * 0.95, maxFontSize, maxFontSize);
    ctx.fillStyle = '#211922';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fontSize}px ${out.dataset.fontFamily}`;
    const cx = safeX + safe / 2;
    const cy = safeY + qrBandHeight + captionBandHeight / 2;
    ctx.fillText(trimmed, cx, cy);
  }

  return out;
}
