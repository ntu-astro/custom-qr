/** Stage-2 prep: turn the source illustration into the per-module data the
 *  mask optimiser and module flipper need. Used by BOTH render modes — the
 *  module-resolution dither produces a "where does the silhouette want dark
 *  modules" map that drives mask choice and codeword flips regardless of
 *  whether the final paint is halftone (ink across the whole canvas) or
 *  composite (the source painted around the centre subpixel).
 *
 *  Output:
 *    - target[my][mx]:    boolean — what the source wants this module to be
 *                         (true = dark) after dithering at module resolution
 *    - importance[my][mx]: number 0..1 — Chu et al. 2013 §4.1 fidelity weight.
 *                         0 means "structurally reserved, don't optimise here";
 *                         positive means data module, higher = more important.
 *                         Combines the base importance map (function-pattern
 *                         exclusion) with the source's alpha coverage at that
 *                         module's centre. */

import { rasterizeSource, ditherFloydSteinberg, blendAgainstWhite } from './imageOps';

export interface SilhouetteTarget {
  size: number;
  /** size×size; true = source wants dark module */
  target: boolean[][];
  /** size×size; 0 = reserved/excluded, 0..1 = data-module weight */
  importance: number[][];
}

/** Lower bound for any non-reserved module's importance. Without a floor,
 *  modules in the "background" half of the dithered target contribute zero to
 *  mask scoring; that lets the optimiser pick masks that are awful in
 *  QR-elegance terms just because they don't matter to the silhouette. The
 *  floor keeps every data module in play while still giving silhouette modules
 *  an order of magnitude more pull. */
const NON_SILHOUETTE_FLOOR = 0.1;

export function computeSilhouetteTarget(
  source: ImageData,
  size: number,
  reserved: Uint8Array,
  silhouetteScale: number = 1,
): SilhouetteTarget {
  // The dither pass is the canonical signal of "where the source wants ink".
  // We rasterise onto a transparent canvas, blend against white (so transparent
  // letterbox pixels read as luma 255 rather than 0 — without this, silhouettes
  // smaller than the canvas at silhouetteScale < 1 would invert the target),
  // then derive both the per-module target AND its importance weight from the
  // dithered bitmap: dark modules of the target carry full weight (1.0) because
  // that's the silhouette; light modules drop to the floor. Reserved modules
  // are excluded (importance 0) so the optimiser never tries to flip them.
  const rasterised = rasterizeSource(source, size, silhouetteScale);
  const blended = blendAgainstWhite(rasterised);
  const binary = ditherFloydSteinberg(blended);

  const target: boolean[][] = [];
  const importance: number[][] = [];
  for (let y = 0; y < size; y++) {
    const tRow: boolean[] = [];
    const iRow: number[] = [];
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const isDark = binary[idx] === 0;
      tRow.push(isDark);
      const isReserved = reserved[idx] === 1;
      iRow.push(isReserved ? 0 : (isDark ? 1.0 : NON_SILHOUETTE_FLOOR));
    }
    target.push(tRow);
    importance.push(iRow);
  }
  return { size, target, importance };
}
