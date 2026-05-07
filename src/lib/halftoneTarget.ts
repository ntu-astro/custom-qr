/** Stage-2 prep: turn the source illustration into the per-module data the
 *  optimiser needs.
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

import { rasterizeSource, ditherFloydSteinberg } from './imageOps';

export interface HalftoneTarget {
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

export function computeHalftoneTarget(
  source: ImageData,
  size: number,
  background: string,
  baseImportance: number[][],
  silhouetteScale: number = 1,
): HalftoneTarget {
  // The dither pass is the canonical signal of "where the source wants ink".
  // We rasterise with the user-chosen background composited in (so transparent
  // SVG silhouettes dither against e.g. white as intended) and then derive
  // both the per-module target AND its importance weight from the dithered
  // bitmap: dark modules of the target carry full weight (1.0) because that's
  // the silhouette; light modules drop to the floor.
  const rasterised = rasterizeSource(source, size, background, silhouetteScale);
  const binary = ditherFloydSteinberg(rasterised);

  const target: boolean[][] = [];
  const importance: number[][] = [];
  for (let y = 0; y < size; y++) {
    const tRow: boolean[] = [];
    const iRow: number[] = [];
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const isDark = binary[idx] === 0;
      tRow.push(isDark);
      const base = baseImportance[y][x];
      iRow.push(base === 0 ? 0 : (isDark ? 1.0 : NON_SILHOUETTE_FLOOR));
    }
    target.push(tRow);
    importance.push(iRow);
  }
  return { size, target, importance };
}
