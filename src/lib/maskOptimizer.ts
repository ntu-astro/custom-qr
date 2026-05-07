/** Stage 2 of Chu et al. 2013: choose the QR mask pattern (0..7) whose
 *  module bit pattern, after masking, best matches the dithered target image.
 *
 *  Score for mask k:
 *      sum over all modules (mx, my) of
 *          importance[my][mx] · (1 if modules_k[my][mx] != target[my][mx] else 0)
 *
 *  Lower score = better image fidelity. Reserved modules (importance 0) drop
 *  out of the sum.
 *
 *  Cost: 8 calls to QRCode.create() — ~10 ms total at version 5-H. The base
 *  matrix produced for the chosen mask is returned ready to feed into the
 *  renderer (or into Stage 3 once we add it).
 */

import type { QRMatrix } from '../types';
import { buildMatrix } from './qrMatrix';
import type { HalftoneTarget } from './halftoneTarget';

const ALL_MASKS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export interface MaskScore {
  maskPattern: number;
  /** Importance-weighted disagreement count. Lower is better. */
  score: number;
  matrix: QRMatrix;
}

export function scoreMask(matrix: QRMatrix, target: HalftoneTarget): number {
  let score = 0;
  const size = matrix.size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const w = target.importance[y][x];
      if (w === 0) continue;
      if (matrix.modules[y][x] !== target.target[y][x]) {
        score += w;
      }
    }
  }
  return score;
}

export interface PickBestMaskResult {
  best: MaskScore;
  scores: MaskScore[];
}

export function pickBestMask(text: string, target: HalftoneTarget): PickBestMaskResult {
  const scores: MaskScore[] = [];
  for (const maskPattern of ALL_MASKS) {
    const matrix = buildMatrix(text, { maskPattern });
    scores.push({ maskPattern, score: scoreMask(matrix, target), matrix });
  }
  scores.sort((a, b) => a.score - b.score);
  return { best: scores[0], scores };
}
