/** qart.js-style composite renderer. Paints a clean QR centre-subpixel grid
 *  on top of the source image painted as the surround. Each data module's
 *  centre 1/9 sub-pixel carries the QR data; the 8 surround sub-pixels carry
 *  the cover image. Reserved cells (finder/timing/alignment/format/version)
 *  paint at full cell size for decode contrast.
 *
 *  Citation: technique attributed to Cox 2014 "QArt Codes" and the qart.js
 *  port by Kazuhiko Arase. This implementation reads from a PredictedCanvas
 *  (built by `buildPredictedCanvas` with renderMode='composite') so the
 *  centre-subpixel override and surround paint are the only renderer-side
 *  responsibilities. */

import type { QRMatrix, RenderOptions, FilterMode } from '../types';
import {
  isOutsideSilhouette,
  STRUCTURAL_INK_RGB,
} from './imageOps';
import type { PredictedCanvas } from './predictedCanvas';
import { computeReservedChecksum } from './predictedCanvas';
import { SUBPX_PER_CELL } from './pipelineConstants';
import { eachCell } from './cellIteration';
import type { Renderer } from './renderers/types';

/** Paint the predicted subpixel canvas (which already carries the cover image
 *  thresholded for mono / pass-through for colour) onto `ctx` at module-pixel
 *  resolution using nearest-neighbour scaling. */
function paintSurround(ctx: CanvasRenderingContext2D, predicted: PredictedCanvas, sizePx: number) {
  const tmp = document.createElement('canvas');
  tmp.width = predicted.width;
  tmp.height = predicted.height;
  tmp.getContext('2d')!.putImageData(predicted.data, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, sizePx, sizePx);
}

export function render(
  matrix: QRMatrix,
  predicted: PredictedCanvas,
  opts: RenderOptions,
): HTMLCanvasElement {
  if (import.meta.env?.DEV) {
    const expected = computeReservedChecksum(matrix.reserved);
    if (expected !== predicted.reservedChecksum) {
      throw new Error(
        `compositeRenderer: predicted canvas reservedChecksum mismatch ` +
        `(expected ${expected}, got ${predicted.reservedChecksum}). ` +
        `The matrix.reserved mask changed after buildPredictedCanvas — flips ` +
        `must touch only data modules.`,
      );
    }
  }

  const cellPx = predicted.cellPx;
  const subPx = cellPx / 3;
  const marginCells = predicted.marginCells;
  const totalCells = matrix.size + 2 * marginCells;
  const sizePx = totalCells * cellPx;
  const filter: FilterMode = opts.filter ?? 'mono';

  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, sizePx, sizePx);

  // Surround paint: the cover image at sub-pixel resolution.
  paintSurround(ctx, predicted, sizePx);

  // Per-cell overrides:
  //   - reserved cells: clear, then paint full-cell with structural ink (dark)
  //     or clearRect (light). Reserved cells need high decode contrast so
  //     composite always uses STRUCTURAL_INK_RGB regardless of filter, even
  //     though halftone-mono tints with silhouetteInkRgb. The intentional
  //     divergence keeps finder/timing/alignment patterns sharp against a
  //     photo-coloured surround.
  //   - data cells: override the centre subpixel only.
  eachCell(matrix, marginCells, cellPx, (cell) => {
    if (!cell.inMatrix) return;
    if (cell.isReserved) {
      ctx.clearRect(cell.px, cell.py, cellPx, cellPx);
      if (cell.isModuleDark) {
        ctx.fillStyle = STRUCTURAL_INK_RGB;
        ctx.fillRect(cell.px, cell.py, cellPx, cellPx);
      }
      return;
    }
    // Centre subpixel override.
    const cx = cell.px + subPx;
    const cy = cell.py + subPx;
    ctx.clearRect(cx, cy, subPx, subPx);
    if (cell.isModuleDark) {
      ctx.fillStyle = STRUCTURAL_INK_RGB;
      ctx.fillRect(cx, cy, subPx, subPx);
    }

    // For filter='color': any surround subpixel that reads as outside the
    // silhouette (transparent or near-white) gets overlaid with structural ink
    // so finder-pattern detection still has dark anchors when the photo
    // doesn't fill the canvas. For filter='mono', the predicted canvas was
    // already thresholded — no per-subpixel fallback needed.
    if (filter === 'color') {
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          if (dx === 1 && dy === 1) continue; // centre subpixel handled above
          const sx = (cell.mx + marginCells) * SUBPX_PER_CELL + dx;
          const sy = (cell.my + marginCells) * SUBPX_PER_CELL + dy;
          const idx4 = (sy * predicted.width + sx) * 4;
          if (isOutsideSilhouette(predicted.raster.data, idx4)) {
            const ssx = cell.px + dx * subPx;
            const ssy = cell.py + dy * subPx;
            ctx.fillStyle = STRUCTURAL_INK_RGB;
            ctx.fillRect(ssx, ssy, subPx, subPx);
          }
        }
      }
    }
  });

  return canvas;
}

/** Registry-friendly adapter around `render`. The function-style `render`
 *  export is preserved unchanged so existing tests (compositeRenderer.test.ts,
 *  pipelineIntegration.test.ts) keep working. The composite path ignores the
 *  `source` field on `RendererInputs`. */
export const compositeRenderer: Renderer = {
  id: 'composite',
  render: ({ matrix, predicted, opts }) => render(matrix, predicted, opts),
};
