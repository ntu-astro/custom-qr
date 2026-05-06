import type { QRMatrix, RenderOptions, HalftoneStyle } from '../types';

const CELL_PX = 16; // 16 output pixels per QR module — gives room for halftone variation

interface PixelSample {
  r: number;
  g: number;
  b: number;
  a: number;
  /** 0 (black) .. 1 (white). */
  brightness: number;
}

function samplePixel(image: ImageData, u: number, v: number): PixelSample {
  const x = Math.min(image.width - 1, Math.max(0, Math.floor(u * image.width)));
  const y = Math.min(image.height - 1, Math.max(0, Math.floor(v * image.height)));
  const i = (y * image.width + x) * 4;
  const r = image.data[i];
  const g = image.data[i + 1];
  const b = image.data[i + 2];
  const a = image.data[i + 3] / 255;
  // Luma 601, then weight by alpha (transparent → bright)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const brightness = a < 0.05 ? 1 : lum;
  return { r, g, b, a, brightness };
}

function clampLuminosity(r: number, g: number, b: number, maxBrightness = 0.45) {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum <= maxBrightness) return { r, g, b };
  const k = maxBrightness / Math.max(lum, 1e-6);
  return {
    r: Math.round(r * k),
    g: Math.round(g * k),
    b: Math.round(b * k),
  };
}

function fillBackground(ctx: CanvasRenderingContext2D, w: number, h: number, bg: string) {
  if (bg === 'transparent') {
    ctx.clearRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
}

function renderHybrid(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  density: number,
  marginCells: number,
  cellPx: number,
) {
  const totalCells = matrix.size + 2 * marginCells;
  const densityFactor = density / 100;

  for (let y = 0; y < totalCells; y++) {
    for (let x = 0; x < totalCells; x++) {
      const px = x * cellPx;
      const py = y * cellPx;
      const u = (x + 0.5) / totalCells;
      const v = (y + 0.5) / totalCells;
      const sample = samplePixel(source, u, v);

      const inMatrix =
        x >= marginCells && x < marginCells + matrix.size &&
        y >= marginCells && y < marginCells + matrix.size;
      const mx = x - marginCells;
      const my = y - marginCells;

      if (inMatrix && matrix.modules[my][mx]) {
        // Dark data module — preserve square geometry, clamp luminosity for color.
        // Fully transparent source pixels have no usable color, so we fall back
        // to a near-black fill to keep the QR scannable on light/empty regions.
        const c = sample.a < 0.05
          ? { r: 0, g: 0, b: 0 }
          : clampLuminosity(sample.r, sample.g, sample.b);
        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        ctx.fillRect(px, py, cellPx, cellPx);
      } else {
        // Non-data (light QR cell or quiet zone): variable-radius halftone dot
        const darkness = 1 - sample.brightness;
        const fill = darkness * densityFactor;
        if (fill <= 0.02) continue;
        const radius = (cellPx / 2) * Math.min(1, Math.sqrt(fill));
        ctx.fillStyle = `rgb(${sample.r},${sample.g},${sample.b})`;
        ctx.beginPath();
        ctx.arc(px + cellPx / 2, py + cellPx / 2, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function renderVariable(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  density: number,
  marginCells: number,
  cellPx: number,
) {
  const totalCells = matrix.size + 2 * marginCells;
  const densityFactor = density / 100;
  const dataMinRadiusFactor = 0.6;

  for (let y = 0; y < totalCells; y++) {
    for (let x = 0; x < totalCells; x++) {
      const px = x * cellPx;
      const py = y * cellPx;
      const u = (x + 0.5) / totalCells;
      const v = (y + 0.5) / totalCells;
      const sample = samplePixel(source, u, v);

      const inMatrix =
        x >= marginCells && x < marginCells + matrix.size &&
        y >= marginCells && y < marginCells + matrix.size;
      const mx = x - marginCells;
      const my = y - marginCells;
      const isDarkData = inMatrix && matrix.modules[my][mx];

      const darkness = 1 - sample.brightness;
      let radiusFactor = Math.sqrt(darkness * densityFactor);
      if (isDarkData) {
        radiusFactor = Math.max(radiusFactor, dataMinRadiusFactor);
      }
      if (radiusFactor <= 0.02) continue;

      const radius = (cellPx / 2) * Math.min(1, radiusFactor);
      let { r, g, b } = sample;
      if (isDarkData) {
        if (sample.a < 0.05) {
          r = 0; g = 0; b = 0;
        } else {
          ({ r, g, b } = clampLuminosity(r, g, b));
        }
      }
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(px + cellPx / 2, py + cellPx / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function render(matrix: QRMatrix, source: ImageData, opts: RenderOptions): HTMLCanvasElement {
  const cellPx = CELL_PX;
  const marginCells = Math.max(0, Math.round(opts.marginPx / cellPx));
  const totalCells = matrix.size + 2 * marginCells;
  const sizePx = totalCells * cellPx;

  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  fillBackground(ctx, sizePx, sizePx, opts.background);

  switch (opts.style) {
    case 'hybrid':
      renderHybrid(ctx, matrix, source, opts.density, marginCells, cellPx);
      break;
    case 'variable':
      renderVariable(ctx, matrix, source, opts.density, marginCells, cellPx);
      break;
    case 'stippling':
    case 'qrgrid':
      // Implemented in subsequent tasks; fall back to hybrid for now.
      renderHybrid(ctx, matrix, source, opts.density, marginCells, cellPx);
      break;
    default: {
      const _exhaust: never = opts.style;
      void _exhaust;
    }
  }

  return canvas;
}

// Re-exports for tests
export const __internals = { samplePixel, clampLuminosity };
export type { HalftoneStyle };
