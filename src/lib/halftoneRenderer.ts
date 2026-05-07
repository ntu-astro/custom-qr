import type { QRMatrix, RenderOptions } from '../types';
import { rasterizeSource, ditherFloydSteinberg, parseHexColor } from './imageOps';

// 18 = 3 × 6, so each module subdivides cleanly into a 3×3 grid of 6-pixel sub-pixels.
// Implements Chu et al. 2013 ("Halftone QR Codes", SIGGRAPH Asia): paint a Floyd–Steinberg
// dithered version of the source illustration across the whole canvas (including the
// margin around the QR data area), then stamp the centre 1/9 sub-pixel of each module
// with the QR bit. A graduated brightness lift in the margin band keeps the outermost
// ring near-white so jsqr-style decoders can still lock onto the finder patterns.
const CELL_PX = 18;

interface InkColor { r: number; g: number; b: number }

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

/** Pick a dominant non-background "ink" colour out of the source so the silhouette
 *  can be tinted. Falls back to plum-black for plain monochrome silhouettes or
 *  fully transparent sources. */
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

interface CellContext {
  px: number;
  py: number;
  inMatrix: boolean;
  isReserved: boolean;
  isModuleDark: boolean;
}

function eachCell(
  matrix: QRMatrix,
  marginCells: number,
  cellPx: number,
  visit: (cell: CellContext) => void,
) {
  const totalCells = matrix.size + 2 * marginCells;
  for (let y = 0; y < totalCells; y++) {
    for (let x = 0; x < totalCells; x++) {
      const px = x * cellPx;
      const py = y * cellPx;
      const inMatrix =
        x >= marginCells && x < marginCells + matrix.size &&
        y >= marginCells && y < marginCells + matrix.size;
      const mx = x - marginCells;
      const my = y - marginCells;
      const isReserved = inMatrix && matrix.importance[my][mx] === 0;
      const isModuleDark = inMatrix && matrix.modules[my][mx];
      visit({ px, py, inMatrix, isReserved, isModuleDark });
    }
  }
}

/** Maximum fraction of original darkness retained at the inner edge of the
 *  margin (immediately adjacent to the QR data area). The factor falls off
 *  linearly to 0 at the canvas edge — so the outermost ring is essentially
 *  white, which protects finder-pattern detection in lenient decoders, while
 *  still allowing the silhouette to echo softly outward from the QR. */
const MARGIN_INNER_INK_FACTOR = 0.25;

/** Return a copy of `rasterised` with margin sub-pixels graduated toward white.
 *  Sub-pixels at the matrix boundary keep MARGIN_INNER_INK_FACTOR of their ink;
 *  density tapers linearly to 0 at the canvas edge. Channels are alpha-blended
 *  against white first so transparent sources behave the same as white sources. */
function liftMarginBrightness(rasterised: ImageData, marginCells: number, matrixCells: number): ImageData {
  const out = new ImageData(rasterised.width, rasterised.height);
  out.data.set(rasterised.data);
  if (marginCells <= 0) return out;
  const marginSub = marginCells * 3;
  const matrixSubStart = marginSub;
  const matrixSubEnd = matrixSubStart + matrixCells * 3;
  const w = out.width;
  const h = out.height;
  for (let y = 0; y < h; y++) {
    const dy = y < matrixSubStart ? matrixSubStart - 1 - y
             : y >= matrixSubEnd ? y - matrixSubEnd
             : -1;
    for (let x = 0; x < w; x++) {
      const dx = x < matrixSubStart ? matrixSubStart - 1 - x
               : x >= matrixSubEnd ? x - matrixSubEnd
               : -1;
      if (dx < 0 && dy < 0) continue;
      const d = Math.max(dx, dy);
      const factor = MARGIN_INNER_INK_FACTOR * (1 - d / marginSub);
      const j = (y * w + x) * 4;
      const a = out.data[j + 3] / 255;
      for (let c = 0; c < 3; c++) {
        const blended = out.data[j + c] * a + 255 * (1 - a);
        out.data[j + c] = Math.round(255 - (255 - blended) * factor);
      }
      out.data[j + 3] = 255;
    }
  }
  return out;
}

function renderHalftone(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  marginCells: number,
  cellPx: number,
  background: string,
  silhouetteScale: number,
) {
  const subPx = cellPx / 3;
  const totalCells = matrix.size + 2 * marginCells;
  const canvasSubSize = totalCells * 3;

  const rasterised = rasterizeSource(source, canvasSubSize, background, silhouetteScale);
  const lifted = liftMarginBrightness(rasterised, marginCells, matrix.size);
  const binary = ditherFloydSteinberg(lifted);
  const ink = pickInkColor(source);
  const inkRgb = `rgb(${ink.r},${ink.g},${ink.b})`;

  const isTransparentBg = background === 'transparent';
  const bgRgb = isTransparentBg ? null : parseHexColor(background);
  const colored = new ImageData(canvasSubSize, canvasSubSize);
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
  }
  const tmp = document.createElement('canvas');
  tmp.width = canvasSubSize;
  tmp.height = canvasSubSize;
  tmp.getContext('2d')!.putImageData(colored, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const canvasSidePx = totalCells * cellPx;
  ctx.drawImage(tmp, 0, 0, canvasSidePx, canvasSidePx);

  eachCell(matrix, marginCells, cellPx, (cell) => {
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
  renderHalftone(ctx, matrix, source, marginCells, cellPx, opts.background, opts.silhouetteScale ?? 1);
  return canvas;
}
