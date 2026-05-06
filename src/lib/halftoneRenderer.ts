import type { QRMatrix, RenderOptions, HalftoneStyle } from '../types';

// 18 = 3 × 6, so each module subdivides cleanly into a 3×3 grid of 6-pixel sub-pixels.
// The hybrid renderer uses the Chu et al. 2013 ("Halftone QR Codes", SIGGRAPH Asia)
// technique: paint a Floyd–Steinberg-dithered version of the source illustration across
// the whole canvas, then stamp just the 1/9 centre sub-pixel of each module with the QR
// bit. Decoders sample module centres, so the QR remains scannable while the silhouette
// occupies 8/9 of every cell — an 8× increase in visual real estate vs. one-sample-per
// -module rendering.
const CELL_PX = 18;
const SUB_PX = CELL_PX / 3;

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

interface InkColor { r: number; g: number; b: number }

/** Pick a dominant non-background "ink" colour out of the source so the silhouette
 *  can be tinted (e.g. NTU scene's moon-blue). Falls back to plum-black for plain
 *  monochrome silhouettes or fully transparent sources. */
function pickInkColor(source: ImageData): InkColor {
  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (let i = 0; i < source.data.length; i += 4) {
    const a = source.data[i + 3] / 255;
    if (a < 0.5) continue;
    const r = source.data[i];
    const g = source.data[i + 1];
    const b = source.data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 200) {
      sumR += r; sumG += g; sumB += b; count++;
    }
  }
  if (count === 0) return { r: 33, g: 25, b: 34 };
  const avg = {
    r: Math.round(sumR / count),
    g: Math.round(sumG / count),
    b: Math.round(sumB / count),
  };
  return clampLuminosity(avg.r, avg.g, avg.b, 0.35);
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim()) ?? /^#([0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return { r: 255, g: 255, b: 255 };
  if (m[1].length === 3) {
    const r = parseInt(m[1][0] + m[1][0], 16);
    const g = parseInt(m[1][1] + m[1][1], 16);
    const b = parseInt(m[1][2] + m[1][2], 16);
    return { r, g, b };
  }
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  };
}

/** Render the source illustration into a target-sized canvas with the given background
 *  filled in, then return the resulting ImageData. Letterboxes a non-square source
 *  to preserve aspect ratio. */
function rasterizeSource(source: ImageData, targetSize: number, background: string): ImageData {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = source.width;
  srcCanvas.height = source.height;
  srcCanvas.getContext('2d')!.putImageData(source, 0, 0);

  const tgtCanvas = document.createElement('canvas');
  tgtCanvas.width = targetSize;
  tgtCanvas.height = targetSize;
  const ctx = tgtCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (background === 'transparent') {
    ctx.clearRect(0, 0, targetSize, targetSize);
  } else {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, targetSize, targetSize);
  }
  const srcAspect = source.width / source.height;
  let drawW = targetSize, drawH = targetSize;
  if (srcAspect > 1) {
    drawH = targetSize / srcAspect;
  } else if (srcAspect < 1) {
    drawW = targetSize * srcAspect;
  }
  const drawX = (targetSize - drawW) / 2;
  const drawY = (targetSize - drawH) / 2;
  ctx.drawImage(srcCanvas, drawX, drawY, drawW, drawH);
  return ctx.getImageData(0, 0, targetSize, targetSize);
}

/** Floyd–Steinberg dither a luma-converted ImageData to a binary 0/255 grid.
 *  Transparent regions blend against white so silhouettes dither as intended. */
function ditherFloydSteinberg(rgba: ImageData): Uint8Array {
  const w = rgba.width;
  const h = rgba.height;
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    const a = rgba.data[j + 3] / 255;
    const r = rgba.data[j] * a + 255 * (1 - a);
    const g = rgba.data[j + 1] * a + 255 * (1 - a);
    const b = rgba.data[j + 2] * a + 255 * (1 - a);
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = luma[i];
      const newPx = old < 128 ? 0 : 255;
      luma[i] = newPx;
      const err = old - newPx;
      if (x + 1 < w) luma[i + 1] += (err * 7) / 16;
      if (x - 1 >= 0 && y + 1 < h) luma[i + w - 1] += (err * 3) / 16;
      if (y + 1 < h) luma[i + w] += (err * 5) / 16;
      if (x + 1 < w && y + 1 < h) luma[i + w + 1] += (err * 1) / 16;
    }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    out[i] = luma[i] > 127 ? 255 : 0;
  }
  return out;
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

/** Hybrid (default) — Chu et al. 2013 sub-pixel halftone:
 *  1. Rasterise the source at sub-pixel resolution (totalCells × 3).
 *  2. Floyd–Steinberg dither it to a binary 0/255 grid.
 *  3. Paint that as the base layer of the output canvas, tinted with the source's
 *     dominant ink colour.
 *  4. For each non-reserved module, stamp the centre 1/9 sub-pixel with the QR bit
 *     (dark module → ink fill; light module → background fill). The 8 surrounding
 *     sub-pixels show the dithered silhouette.
 *  5. Reserved modules (finder/timing/alignment/format/version) get a full-cell stamp
 *     so QR decoders can lock onto them reliably. The silhouette is suppressed there.
 */
function renderHybrid(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  marginCells: number,
  cellPx: number,
  background: string,
) {
  const subPx = cellPx / 3;
  // Dither only the QR DATA area (matrix.size × 3 sub-pixels). The margin / quiet
  // zone stays at the canvas background colour so QR decoders can find the boundary.
  const dataSubSize = matrix.size * 3;

  const rasterised = rasterizeSource(source, dataSubSize, background);
  const binary = ditherFloydSteinberg(rasterised);
  const ink = pickInkColor(source);
  const inkRgb = `rgb(${ink.r},${ink.g},${ink.b})`;

  // Paint dithered base. Dark dither pixels → ink colour; light dither pixels →
  // background (transparent stays transparent).
  const isTransparentBg = background === 'transparent';
  const bgRgb = isTransparentBg ? null : parseHex(background);
  const colored = new ImageData(dataSubSize, dataSubSize);
  for (let i = 0; i < binary.length; i++) {
    const j = i * 4;
    if (binary[i] === 0) {
      colored.data[j] = ink.r;
      colored.data[j + 1] = ink.g;
      colored.data[j + 2] = ink.b;
      colored.data[j + 3] = 255;
    } else if (bgRgb !== null) {
      colored.data[j] = bgRgb.r;
      colored.data[j + 1] = bgRgb.g;
      colored.data[j + 2] = bgRgb.b;
      colored.data[j + 3] = 255;
    }
    // else: alpha stays 0 (transparent)
  }
  // Scale up via temp canvas + nearest-neighbour drawImage so each dither pixel
  // becomes exactly subPx × subPx on the output. Position it inside the matrix
  // area; the surrounding margin / quiet zone stays at canvas background.
  const tmp = document.createElement('canvas');
  tmp.width = dataSubSize;
  tmp.height = dataSubSize;
  tmp.getContext('2d')!.putImageData(colored, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const matrixOffset = marginCells * cellPx;
  const matrixSidePx = matrix.size * cellPx;
  ctx.drawImage(tmp, matrixOffset, matrixOffset, matrixSidePx, matrixSidePx);

  // Stamp module centres (or full reserved cells).
  eachCell(matrix, source, marginCells, cellPx, (cell) => {
    if (!cell.inMatrix) return;
    if (cell.isReserved) {
      if (cell.isModuleDark) {
        ctx.fillStyle = inkRgb;
        ctx.fillRect(cell.px, cell.py, cellPx, cellPx);
      } else if (isTransparentBg) {
        ctx.clearRect(cell.px, cell.py, cellPx, cellPx);
      } else {
        ctx.fillStyle = background;
        ctx.fillRect(cell.px, cell.py, cellPx, cellPx);
      }
      return;
    }
    const cx = cell.px + subPx;
    const cy = cell.py + subPx;
    if (cell.isModuleDark) {
      ctx.fillStyle = inkRgb;
      ctx.fillRect(cx, cy, subPx, subPx);
    } else if (isTransparentBg) {
      ctx.clearRect(cx, cy, subPx, subPx);
    } else {
      ctx.fillStyle = background;
      ctx.fillRect(cx, cy, subPx, subPx);
    }
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
      renderHybrid(ctx, matrix, source, marginCells, cellPx, opts.background);
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
export const __internals = {
  samplePixel,
  clampLuminosity,
  renderReservedCell,
  ditherFloydSteinberg,
  pickInkColor,
  parseHex,
  rasterizeSource,
  CELL_PX,
  SUB_PX,
};
export type { HalftoneStyle };
