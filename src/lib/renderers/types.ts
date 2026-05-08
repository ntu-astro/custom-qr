/** Renderer registry types. A `Renderer` adapts the existing `render(...)`
 *  exports of `halftoneRenderer` and `compositeRenderer` behind a single
 *  uniform interface so `useQrPipeline` can dispatch via lookup instead of
 *  an if/else and adding a third render mode = drop a file + register it. */

import type { QRMatrix, RenderOptions, RenderMode } from '../../types';
import type { PredictedCanvas } from '../predictedCanvas';

/** Inputs shared by all renderers. The underlying functions take subsets:
 *  - `renderHalftone(matrix, predicted, source, opts)` uses all four.
 *  - `renderComposite(matrix, predicted, opts)` ignores `source`.
 *
 *  Including `source` here unconditionally keeps the call site uniform; the
 *  composite adapter simply doesn't forward it. */
export interface RendererInputs {
  matrix: QRMatrix;
  predicted: PredictedCanvas;
  /** Original raster source (silhouette or custom upload). Halftone uses it
   *  for dominant-ink colour picking; composite ignores it (the predicted
   *  canvas already carries everything composite needs). */
  source: ImageData;
  opts: RenderOptions;
}

export interface Renderer {
  readonly id: RenderMode;
  /** Produce the final QR canvas. Pure with respect to inputs (no global
   *  state). Adapters forward to the existing `render(...)` exports —
   *  signatures of those functions are intentionally NOT changed by this
   *  refactor so existing tests keep working without modification. */
  render(inputs: RendererInputs): HTMLCanvasElement;
}
