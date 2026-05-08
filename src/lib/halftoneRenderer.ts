import type { QRMatrix, RenderOptions, FilterMode } from '../types';
import { rasterizeSource, ditherFloydSteinberg } from './imageOps';
import { toLuminance } from './colorUtils';

// 18 = 3 × 6, so each module subdivides cleanly into a 3×3 grid of 6-pixel sub-pixels.
// Implements Chu et al. 2013 ("Halftone QR Codes", SIGGRAPH Asia): paint a Floyd–Steinberg
// dithered version of the source illustration across the whole canvas (including the
// margin around the QR data area), then stamp the centre 1/9 sub-pixel of each module
// with the QR bit. A graduated brightness lift in the margin band keeps the outermost
// ring near-white so jsqr-style decoders can still lock onto the finder patterns.
const CELL_PX = 18;

/** Luma (0..255) above which a source pixel is considered too bright to
 *  contribute to the dominant ink-colour average. Empirically tuned. */
const DARK_PIXEL_LUMA_CUTOFF = 200;

interface InkColor { r: number; g: number; b: number }

function clampLuminosity(r: number, g: number, b: number, maxBrightness = 0.45) {
  const lum = toLuminance(r, g, b) / 255;
  if (lum <= maxBrightness) return { r, g, b };
  const k = maxBrightness / Math.max(lum, 1e-6);
  return {
    r: Math.round(r * k),
    g: Math.round(g * k),
    b: Math.round(b * k),
  };
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
    const lum = toLuminance(r, g, b);
    if (lum < DARK_PIXEL_LUMA_CUTOFF) {
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
  mx: number;
  my: number;
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
      const isReserved = inMatrix && matrix.reserved[my * matrix.size + mx] === 1;
      const isModuleDark = inMatrix && matrix.modules[my][mx];
      visit({ px, py, inMatrix, isReserved, isModuleDark, mx, my });
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

/** When the user enables "color halftone", each ink sub-pixel keeps the source
 *  colour at that position rather than collapsing to a single dominant tone.
 *  Sub-pixel colours are clamped so their luminance stays under MAX_INK_LUM —
 *  jsqr only locks on if dark modules read clearly darker than light modules. */
const MAX_INK_LUM = 0.45;

function readPixel(data: Uint8ClampedArray, idx4: number): { r: number; g: number; b: number } {
  const a = data[idx4 + 3] / 255;
  return {
    r: Math.round(data[idx4] * a + 255 * (1 - a)),
    g: Math.round(data[idx4 + 1] * a + 255 * (1 - a)),
    b: Math.round(data[idx4 + 2] * a + 255 * (1 - a)),
  };
}

/** A source sub-pixel is treated as "outside the silhouette" when it is either
 *  largely transparent (PNG/SVG) or near-white (JPEG/photo with white
 *  background). In both cases colour halftoning falls back to the structural
 *  ink so the QR's dark-module stamps stay pure dark instead of fading toward
 *  whatever neutral the photo's background happens to be. */
const SILHOUETTE_ALPHA_THRESHOLD = 0.4;
const SILHOUETTE_MAX_LUM = 0.85;

/** Plum-black used for finders, timing, alignment, and any QR data stamps that
 *  fall outside the silhouette while colour halftone is on. Picking the
 *  dominant photo tint there would tint the corner squares (e.g. bronze for a
 *  rainbow photo) and hurt finder-pattern detection. */
const STRUCTURAL_INK: InkColor = { r: 33, g: 25, b: 34 };
export const STRUCTURAL_INK_HEX = '#211922';
const STRUCTURAL_INK_RGB = `rgb(${STRUCTURAL_INK.r},${STRUCTURAL_INK.g},${STRUCTURAL_INK.b})`;

function isOutsideSilhouette(data: Uint8ClampedArray, idx4: number): boolean {
  const a = data[idx4 + 3] / 255;
  if (a < SILHOUETTE_ALPHA_THRESHOLD) return true;
  const r = data[idx4] * a + 255 * (1 - a);
  const g = data[idx4 + 1] * a + 255 * (1 - a);
  const b = data[idx4 + 2] * a + 255 * (1 - a);
  const lum = toLuminance(r, g, b) / 255;
  return lum > SILHOUETTE_MAX_LUM;
}

function renderHalftone(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  marginCells: number,
  cellPx: number,
  silhouetteScale: number,
  filter: FilterMode,
) {
  const subPx = cellPx / 3;
  const totalCells = matrix.size + 2 * marginCells;
  const canvasSubSize = totalCells * 3;

  const rasterised = rasterizeSource(source, canvasSubSize, silhouetteScale);
  const lifted = liftMarginBrightness(rasterised, marginCells, matrix.size);
  const binary = ditherFloydSteinberg(lifted);
  // Silhouette ink: tinted by the dominant photo tone for monochrome mode, or
  // pure plum-black for colour halftone (so the colour effect lives only inside
  // the silhouette, never in finders/timing/data-dot stamps).
  const silhouetteInk = filter === 'color' ? STRUCTURAL_INK : pickInkColor(source);
  const silhouetteInkRgb = filter === 'color'
    ? STRUCTURAL_INK_RGB
    : `rgb(${silhouetteInk.r},${silhouetteInk.g},${silhouetteInk.b})`;

  const colored = new ImageData(canvasSubSize, canvasSubSize);
  for (let i = 0; i < binary.length; i++) {
    const j = i * 4;
    if (binary[i] !== 0) continue;
    if (filter === 'color' && !isOutsideSilhouette(rasterised.data, j)) {
      const px = readPixel(lifted.data, j);
      const { r, g, b } = clampLuminosity(px.r, px.g, px.b, MAX_INK_LUM);
      colored.data[j] = r;
      colored.data[j + 1] = g;
      colored.data[j + 2] = b;
    } else {
      colored.data[j] = silhouetteInk.r;
      colored.data[j + 1] = silhouetteInk.g;
      colored.data[j + 2] = silhouetteInk.b;
    }
    colored.data[j + 3] = 255;
  }
  const tmp = document.createElement('canvas');
  tmp.width = canvasSubSize;
  tmp.height = canvasSubSize;
  tmp.getContext('2d')!.putImageData(colored, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const canvasSidePx = totalCells * cellPx;
  ctx.drawImage(tmp, 0, 0, canvasSidePx, canvasSidePx);

  // For colour halftone, sample the source colour at each module centre — but
  // only if the source actually covers that module. Reserved (finder/timing/
  // alignment) cells always use the dominant ink so QR detection isn't softened
  // into mid-grey.
  const subSampleInkRgb = (mx: number, my: number): string => {
    if (filter !== 'color') return silhouetteInkRgb;
    const sx = (mx + marginCells) * 3 + 1;
    const sy = (my + marginCells) * 3 + 1;
    const j = (sy * canvasSubSize + sx) * 4;
    if (isOutsideSilhouette(rasterised.data, j)) return STRUCTURAL_INK_RGB;
    const px = readPixel(lifted.data, j);
    const { r, g, b } = clampLuminosity(px.r, px.g, px.b, MAX_INK_LUM);
    return `rgb(${r},${g},${b})`;
  };

  eachCell(matrix, marginCells, cellPx, (cell) => {
    if (!cell.inMatrix) return;
    if (cell.isReserved) {
      if (cell.isModuleDark) {
        // Reserved (finder/timing/alignment/format/version) cells must be high
        // contrast for scanability — never tint these with photo colour.
        ctx.fillStyle = filter === 'color' ? STRUCTURAL_INK_RGB : silhouetteInkRgb;
        ctx.fillRect(cell.px, cell.py, cellPx, cellPx);
      } else {
        ctx.clearRect(cell.px, cell.py, cellPx, cellPx);
      }
      return;
    }
    const cx = cell.px + subPx;
    const cy = cell.py + subPx;
    if (cell.isModuleDark) {
      ctx.fillStyle = subSampleInkRgb(cell.mx, cell.my);
      ctx.fillRect(cx, cy, subPx, subPx);
    } else {
      ctx.clearRect(cx, cy, subPx, subPx);
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
  ctx.clearRect(0, 0, sizePx, sizePx);

  renderHalftone(
    ctx,
    matrix,
    source,
    marginCells,
    cellPx,
    opts.silhouetteScale ?? 1,
    opts.filter ?? 'mono',
  );
  return canvas;
}
