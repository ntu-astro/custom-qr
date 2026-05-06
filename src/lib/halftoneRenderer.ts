import type { QRMatrix, RenderOptions } from '../types';
import { rasterizeSource, ditherFloydSteinberg, parseHexColor } from './imageOps';

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
      const isReserved = inMatrix && matrix.importance[my][mx] === 0;
      const isModuleDark = inMatrix && matrix.modules[my][mx];
      visit({ px, py, sample, inMatrix, mx, my, isReserved, isModuleDark });
    }
  }
}

/** Chu et al. 2013 sub-pixel halftone (the only render mode):
 *  1. Rasterise the source at sub-pixel resolution (matrix.size × 3).
 *  2. Floyd–Steinberg dither it to a binary 0/255 grid.
 *  3. Paint that as the base layer inside the QR data area, tinted with the source's
 *     dominant ink colour.
 *  4. For each non-reserved module, stamp the centre 1/9 sub-pixel with the QR bit
 *     (dark module → ink fill; light module → background fill). The 8 surrounding
 *     sub-pixels show the dithered silhouette.
 *  5. Reserved modules (finder/timing/alignment/format/version) get a full-cell stamp
 *     so QR decoders can lock onto them reliably. The silhouette is suppressed there.
 */
function renderHalftone(
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
  const bgRgb = isTransparentBg ? null : parseHexColor(background);
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
  renderHalftone(ctx, matrix, source, marginCells, cellPx, opts.background);
  return canvas;
}

// Re-exports for tests
export const __internals = {
  samplePixel,
  clampLuminosity,
  renderReservedCell,
  pickInkColor,
  CELL_PX,
  SUB_PX,
};
