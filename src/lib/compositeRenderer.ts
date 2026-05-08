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

import type { QRMatrix, RenderOptions } from '../types';
import { STRUCTURAL_INK_RGB } from './imageOps';
import type { PredictedCanvas } from './predictedCanvas';
import { computeReservedChecksum } from './predictedCanvas';
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
  // `opts` is part of the render() signature for symmetry with
  // halftoneRenderer and the Renderer adapter, but the composite path now
  // derives everything it needs from `predicted` — `filter` is baked into
  // `predicted.data` by `buildPredictedCanvas`. Reference it explicitly so
  // future tunables (border colour, accent overrides) drop in here without
  // the parameter triggering an unused-arg lint.
  void opts;
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
  //     composite always uses STRUCTURAL_INK_RGB regardless of filter. The
  //     intentional divergence from halftone-mono (which tints with
  //     silhouetteInkRgb) keeps finder/timing/alignment patterns sharp
  //     against a photo-coloured surround.
  //   - data cells: override the centre subpixel only. Surround subpixels
  //     are already correct from `paintSurround` — `predicted.data` is opaque
  //     RGB in both filter modes (composite-mono thresholds; composite-color
  //     blends transparent regions onto white in `predictedCanvas.ts`), so
  //     there's no longer an alpha-fallback to apply.
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
