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

/**
 * Render a structurally reserved QR cell (finder pattern, separator, timing pattern,
 * alignment pattern, format-info band, version-info band).
 *
 * These positions are what QR decoders lock onto first. Halftone variation here would
 * merge a "light" reserved cell with its dark neighbours (or vice versa) and break the
 * scanner's structural read. We therefore ignore the source illustration entirely:
 *   - dark module → solid filled square (with luminosity-clamped colour from the source
 *     so hue continuity is preserved across the QR; or pure black if the source pixel
 *     is fully transparent)
 *   - light module → leave the background untouched
 */
function renderReservedCell(
  ctx: CanvasRenderingContext2D,
  isDark: boolean,
  sample: PixelSample,
  px: number,
  py: number,
  cellPx: number,
) {
  if (!isDark) return;
  const c = sample.a < 0.05
    ? { r: 0, g: 0, b: 0 }
    : clampLuminosity(sample.r, sample.g, sample.b);
  ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
  ctx.fillRect(px, py, cellPx, cellPx);
}

interface CellContext {
  px: number;
  py: number;
  sample: PixelSample;
  inMatrix: boolean;
  mx: number;
  my: number;
  isReserved: boolean;
  isModuleDark: boolean;
}

function eachCell(
  matrix: QRMatrix,
  source: ImageData,
  marginCells: number,
  cellPx: number,
  visit: (cell: CellContext) => void,
) {
  const totalCells = matrix.size + 2 * marginCells;
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
      const isReserved = inMatrix && matrix.reservedMask[my][mx];
      const isModuleDark = inMatrix && matrix.modules[my][mx];
      visit({ px, py, sample, inMatrix, mx, my, isReserved, isModuleDark });
    }
  }
}

function renderHybrid(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  density: number,
  marginCells: number,
  cellPx: number,
) {
  const densityFactor = density / 100;

  eachCell(matrix, source, marginCells, cellPx, (cell) => {
    if (cell.isReserved) {
      renderReservedCell(ctx, cell.isModuleDark, cell.sample, cell.px, cell.py, cellPx);
      return;
    }

    if (cell.isModuleDark) {
      // Dark data module — preserve square geometry, clamp luminosity for color.
      // Fully transparent source pixels have no usable color, so we fall back
      // to a near-black fill to keep the QR scannable on light/empty regions.
      const c = cell.sample.a < 0.05
        ? { r: 0, g: 0, b: 0 }
        : clampLuminosity(cell.sample.r, cell.sample.g, cell.sample.b);
      ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
      ctx.fillRect(cell.px, cell.py, cellPx, cellPx);
      return;
    }

    // Non-data (light QR cell or quiet zone): variable-radius halftone dot
    const darkness = 1 - cell.sample.brightness;
    const fill = darkness * densityFactor;
    if (fill <= 0.02) return;
    const radius = (cellPx / 2) * Math.min(1, Math.sqrt(fill));
    ctx.fillStyle = `rgb(${cell.sample.r},${cell.sample.g},${cell.sample.b})`;
    ctx.beginPath();
    ctx.arc(cell.px + cellPx / 2, cell.py + cellPx / 2, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function renderStippling(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  density: number,
  marginCells: number,
  cellPx: number,
) {
  const densityFactor = density / 100;
  const STIPPLE_RADIUS = Math.max(1, Math.round(cellPx * 0.12));
  const MAX_STIPPLES_PER_CELL = 16;
  const rand = mulberry32(0xa57e3);

  eachCell(matrix, source, marginCells, cellPx, (cell) => {
    if (cell.isReserved) {
      renderReservedCell(ctx, cell.isModuleDark, cell.sample, cell.px, cell.py, cellPx);
      return;
    }

    if (cell.isModuleDark) {
      const c = cell.sample.a < 0.05
        ? { r: 0, g: 0, b: 0 }
        : clampLuminosity(cell.sample.r, cell.sample.g, cell.sample.b);
      ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
      ctx.fillRect(cell.px, cell.py, cellPx, cellPx);
      return;
    }

    const darkness = 1 - cell.sample.brightness;
    const count = Math.round(darkness * densityFactor * MAX_STIPPLES_PER_CELL);
    if (count <= 0) return;
    ctx.fillStyle = `rgb(${cell.sample.r},${cell.sample.g},${cell.sample.b})`;
    for (let i = 0; i < count; i++) {
      const sx = cell.px + rand() * cellPx;
      const sy = cell.py + rand() * cellPx;
      ctx.beginPath();
      ctx.arc(sx, sy, STIPPLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function renderQrGrid(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  density: number,
  marginCells: number,
  cellPx: number,
) {
  const threshold = 1 - density / 100;

  eachCell(matrix, source, marginCells, cellPx, (cell) => {
    if (cell.isReserved) {
      renderReservedCell(ctx, cell.isModuleDark, cell.sample, cell.px, cell.py, cellPx);
      return;
    }

    const fill = cell.isModuleDark || cell.sample.brightness < threshold;
    if (!fill) return;

    let { r, g, b } = cell.sample;
    if (cell.isModuleDark) {
      if (cell.sample.a < 0.05) {
        r = 0; g = 0; b = 0;
      } else {
        ({ r, g, b } = clampLuminosity(r, g, b));
      }
    }
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(cell.px, cell.py, cellPx, cellPx);
  });
}

function renderVariable(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  density: number,
  marginCells: number,
  cellPx: number,
) {
  const densityFactor = density / 100;
  const dataMinRadiusFactor = 0.6;

  eachCell(matrix, source, marginCells, cellPx, (cell) => {
    if (cell.isReserved) {
      // Reserved cells render as squares (not circles) so finder/alignment patterns
      // remain detectable. This is the same geometry the QR-grid style uses.
      renderReservedCell(ctx, cell.isModuleDark, cell.sample, cell.px, cell.py, cellPx);
      return;
    }

    const darkness = 1 - cell.sample.brightness;
    let radiusFactor = Math.sqrt(darkness * densityFactor);
    if (cell.isModuleDark) {
      radiusFactor = Math.max(radiusFactor, dataMinRadiusFactor);
    }
    if (radiusFactor <= 0.02) return;

    const radius = (cellPx / 2) * Math.min(1, radiusFactor);
    let { r, g, b } = cell.sample;
    if (cell.isModuleDark) {
      if (cell.sample.a < 0.05) {
        r = 0; g = 0; b = 0;
      } else {
        ({ r, g, b } = clampLuminosity(r, g, b));
      }
    }
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(cell.px + cellPx / 2, cell.py + cellPx / 2, radius, 0, Math.PI * 2);
    ctx.fill();
  });
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
      renderStippling(ctx, matrix, source, opts.density, marginCells, cellPx);
      break;
    case 'qrgrid':
      renderQrGrid(ctx, matrix, source, opts.density, marginCells, cellPx);
      break;
    default: {
      const _exhaust: never = opts.style;
      void _exhaust;
    }
  }

  return canvas;
}

// Re-exports for tests
export const __internals = { samplePixel, clampLuminosity, renderReservedCell };
export type { HalftoneStyle };
