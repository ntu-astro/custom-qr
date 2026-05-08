/** Stage 2 of Chu et al. 2013: choose the QR mask pattern (0..7) whose
 *  module bit pattern, after masking, best matches the dithered target image.
 *
 *  Score (since 2026-05-08 pipeline-extensions Phase 2): ArtCoder-style
 *  Sampling Simulation. For each module, compute a Gaussian-weighted readback
 *  over a 5×5 subpixel kernel; the per-module L1 error against the target,
 *  importance-weighted, sums to a per-mask total score. Lower is better.
 *
 *  The previous "binary disagreement" score (before Phase 2) summed
 *  `importance · indicator(modules[y][x] != target[y][x])`. The Sampling-Sim
 *  metric subsumes that signal but also captures how strongly each module is
 *  voted dark/light by its 3×3 neighbourhood — closer to what a phone camera
 *  actually reads.
 *
 *  Cost: 8 calls to QRCode.create() + 8 cheap buildSamplingContext kernel
 *  passes. The PredictedCanvas is built once outside this function (the
 *  reserved-cell topology is identical across the 8 mask candidates, so the
 *  rasterise/lift/dither work doesn't repeat per-candidate). */

import type { QRMatrix } from '../types';
import { buildMatrix } from './qrMatrix';
import type { SilhouetteTarget } from './silhouetteTarget';
import type { PredictedCanvas } from './predictedCanvas';
import { buildSamplingContext, totalScore } from './samplingSim';

const ALL_MASKS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export interface MaskScore {
  maskPattern: number;
  /** Sampling-Sim total score (importance × |readback - target|). Lower is better. */
  score: number;
  matrix: QRMatrix;
}

export function scoreMask(
  matrix: QRMatrix,
  target: SilhouetteTarget,
  predicted: PredictedCanvas,
): number {
  const ctx = buildSamplingContext(predicted, matrix);
  return totalScore(ctx, target);
}

export interface PickBestMaskResult {
  best: MaskScore;
  scores: MaskScore[];
}

export function pickBestMask(
  text: string,
  target: SilhouetteTarget,
  predicted: PredictedCanvas,
): PickBestMaskResult {
  const scores: MaskScore[] = [];
  for (const maskPattern of ALL_MASKS) {
    const matrix = buildMatrix(text, { maskPattern });
    scores.push({ maskPattern, score: scoreMask(matrix, target, predicted), matrix });
  }
  scores.sort((a, b) => a.score - b.score);
  return { best: scores[0], scores };
}
