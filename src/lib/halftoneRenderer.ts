import type { QRMatrix, RenderOptions, FilterMode } from '../types';
import {
  isOutsideSilhouette,
  clampLuminosity,
  STRUCTURAL_INK,
  STRUCTURAL_INK_RGB,
  MAX_INK_LUM,
  DARK_PIXEL_LUMA_CUTOFF,
} from './imageOps';
import type { PredictedCanvas } from './predictedCanvas';
import { computeReservedChecksum } from './predictedCanvas';
import { toLuminance } from './colorUtils';
import { SUBPX_PER_CELL } from './pipelineConstants';
import { DOMINANT_INK_LUM_CEILING } from './halftoneTunables';
import { eachCell } from './cellIteration';
import type { Renderer } from './renderers/types';

// 18 = 3 × 6, so each module subdivides cleanly into a 3×3 grid of 6-pixel sub-pixels.
// Implements Chu et al. 2013 ("Halftone QR Codes", SIGGRAPH Asia): paint a Floyd–Steinberg
// dithered version of the source illustration across the whole canvas (including the
// margin around the QR data area), then stamp the centre 1/9 sub-pixel of each module
// with the QR bit. A graduated brightness lift in the margin band keeps the outermost
// ring near-white so jsqr-style decoders can still lock onto the finder patterns.

interface InkColor { r: number; g: number; b: number }

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
  return clampLuminosity(avg.r, avg.g, avg.b, DOMINANT_INK_LUM_CEILING);
}

function readPixel(data: Uint8ClampedArray, idx4: number): { r: number; g: number; b: number } {
  const a = data[idx4 + 3] / 255;
  return {
    r: Math.round(data[idx4] * a + 255 * (1 - a)),
    g: Math.round(data[idx4 + 1] * a + 255 * (1 - a)),
    b: Math.round(data[idx4 + 2] * a + 255 * (1 - a)),
  };
}

function paintHalftone(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  predicted: PredictedCanvas,
  source: ImageData,
  filter: FilterMode,
) {
  const { cellPx, marginCells, width: canvasSubSize } = predicted;
  const subPx = cellPx / 3;
  const totalCells = matrix.size + 2 * marginCells;

  // The dithered subpixel canvas is the predicted state of every subpixel
  // (including margin and surround). Renderer overrides the centre subpixel
  // of each data module using the matrix value below.
  // Silhouette ink: tinted by the dominant photo tone for monochrome mode, or
  // pure plum-black for colour halftone (so the colour effect lives only inside
  // the silhouette, never in finders/timing/data-dot stamps).
  const silhouetteInk = filter === 'color' ? STRUCTURAL_INK : pickInkColor(source);
  const silhouetteInkRgb = filter === 'color'
    ? STRUCTURAL_INK_RGB
    : `rgb(${silhouetteInk.r},${silhouetteInk.g},${silhouetteInk.b})`;

  // Convert the binary halftone canvas into the coloured subpixel canvas the
  // renderer actually paints. predicted.data carries values 0/255 per pixel;
  // dark pixels become silhouette ink (per-pixel colour in 'color' mode,
  // single tone in 'mono' mode), light pixels are transparent.
  const colored = new ImageData(canvasSubSize, canvasSubSize);
  for (let i = 0; i < predicted.data.data.length; i += 4) {
    if (predicted.data.data[i] !== 0) continue;
    if (filter === 'color' && !isOutsideSilhouette(predicted.raster.data, i)) {
      const px = readPixel(predicted.raster.data, i);
      const { r, g, b } = clampLuminosity(px.r, px.g, px.b, MAX_INK_LUM);
      colored.data[i] = r;
      colored.data[i + 1] = g;
      colored.data[i + 2] = b;
    } else {
      colored.data[i] = silhouetteInk.r;
      colored.data[i + 1] = silhouetteInk.g;
      colored.data[i + 2] = silhouetteInk.b;
    }
    colored.data[i + 3] = 255;
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
    const sx = (mx + marginCells) * SUBPX_PER_CELL + 1;
    const sy = (my + marginCells) * SUBPX_PER_CELL + 1;
    const j = (sy * canvasSubSize + sx) * 4;
    if (isOutsideSilhouette(predicted.raster.data, j)) return STRUCTURAL_INK_RGB;
    const px = readPixel(predicted.raster.data, j);
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

export function render(
  matrix: QRMatrix,
  predicted: PredictedCanvas,
  source: ImageData,
  opts: RenderOptions,
): HTMLCanvasElement {
  if (import.meta.env?.DEV) {
    const expected = computeReservedChecksum(matrix.reserved);
    if (expected !== predicted.reservedChecksum) {
      throw new Error(
        `halftoneRenderer: predicted canvas reservedChecksum mismatch ` +
        `(expected ${expected}, got ${predicted.reservedChecksum}). ` +
        `The matrix.reserved mask changed after buildPredictedCanvas — flips ` +
        `must touch only data modules.`,
      );
    }
  }

  const cellPx = predicted.cellPx;
  const totalCells = matrix.size + 2 * predicted.marginCells;
  const sizePx = totalCells * cellPx;

  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, sizePx, sizePx);

  paintHalftone(ctx, matrix, predicted, source, opts.filter ?? 'mono');
  return canvas;
}

/** Registry-friendly adapter around `render`. The function-style `render`
 *  export is preserved unchanged so existing tests (halftoneRenderer.test.ts,
 *  pipelineIntegration.test.ts, scanVerifier.test.ts) keep working. */
export const halftoneRenderer: Renderer = {
  id: 'halftone',
  render: ({ matrix, predicted, source, opts }) =>
    render(matrix, predicted, source, opts),
};
