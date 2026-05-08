/** Per-block flip acceptance gate.
 *
 *  Two policies:
 *    - 'fixed' (default): Phase 2 behaviour — accept up to floor(ratio · ecCount)
 *      flips per block. ratio defaults to 0.15 (DEFAULT_ECC_BUDGET_RATIO).
 *    - 'probabilistic' (Phase 3 ART-UP): each candidate flip is fed through a
 *      logistic-regression model of decode failure; accept iff the cumulative
 *      block-failure probability stays under DEFAULT_FAILURE_TOLERANCE
 *      (typically 0.05). Hard-capped at floor(ecCount/2) regardless of
 *      probability since RS-H cannot recover beyond that limit.
 *
 *  Spec: docs/superpowers/specs/2026-05-08-pipeline-extensions-design.md §9
 *  Plan: docs/superpowers/plans/2026-05-08-pipeline-extensions-plan.md §Phase 3
 *
 *  Rationale on the hard-cap interaction with the cumulative-prob test:
 *  RS-H corrects up to floor(ecCount/2) codeword errors per block — beyond that
 *  the block is uncorrectable regardless of how confident the model is in any
 *  single flip. The hard cap is therefore a correctness floor, not just a
 *  belt-and-braces guard. If a calibrated model is well-fit it will reject
 *  before the hard cap fires; if calibration is too lax, the hard cap saves us
 *  from shipping unscannable QRs. */

import type { SamplingSimContext } from './samplingSim';

export type FlipBudgetPolicy =
  | { kind: 'fixed'; ratio: number }
  | { kind: 'probabilistic'; failureTolerance: number };

export interface ArtUpCoefficients {
  intercept: number;
  surroundContrast: number;
  centreCorrelation: number;
  finderDistance: number;
}

export interface ArtUpFeatures {
  /** Average luma of the 8 surround subpixels minus the centre subpixel luma.
   *  Range [-1, 1]; positive means the surround is lighter than the centre.
   *  Captures "is this module's centre stamp swimming against its
   *  surrounding"? */
  surroundContrast: number;
  /** 1.0 if the module's current bit matches the dithered target's vote at
   *  this position; 0.0 otherwise. Proxy for "is the flip working with or
   *  against the source's wishes". */
  centreCorrelation: number;
  /** Chebyshev distance in modules from this module to the nearest of the
   *  three finder corners. Smaller = closer to a finder = more sensitive to
   *  decode failure. */
  finderDistance: number;
}

export interface CodewordCandidate {
  modules: Array<{ y: number; x: number }>;
}

export interface BlockFlipState {
  /** prod(1 - p_i) over accepted flips so far. */
  cumulativeSurvivalProb: number;
  /** Number of flips already accepted in this block. Hard cap at
   *  floor(ecCount/2). */
  flipsAccepted: number;
  /** ecCount for this block (constant across blocks per ECC layout). */
  ecCount: number;
}

/** Logistic σ(z) = 1 / (1 + exp(-z)). Vanilla logistic regression head. */
export function decodeFailureProb(features: ArtUpFeatures, coeffs: ArtUpCoefficients): number {
  const z =
    coeffs.intercept +
    coeffs.surroundContrast * features.surroundContrast +
    coeffs.centreCorrelation * features.centreCorrelation +
    coeffs.finderDistance * features.finderDistance;
  return 1 / (1 + Math.exp(-z));
}

/** Per-flip acceptance. Returns the new pNew so the caller can update
 *  `cumulativeSurvivalProb` without re-extracting features and re-running
 *  the model. */
export function shouldAcceptFlip(
  policy: FlipBudgetPolicy,
  blockState: BlockFlipState,
  candidate: CodewordCandidate,
  ctx: SamplingSimContext,
  coeffs: ArtUpCoefficients,
  finderDistanceMap: Float32Array | null,
): { accepted: boolean; pNew: number } {
  if (policy.kind === 'fixed') {
    const accepted = blockState.flipsAccepted < Math.floor(policy.ratio * blockState.ecCount);
    return { accepted, pNew: 0 };
  }

  // Probabilistic: hard cap first.
  if (blockState.flipsAccepted >= Math.floor(blockState.ecCount / 2)) {
    return { accepted: false, pNew: 0 };
  }

  // Take the worst (highest-failure-prob) module across the codeword as pNew —
  // a single bad flip in the codeword fails the codeword.
  let pNew = 0;
  for (const { x, y } of candidate.modules) {
    const features = extractFeatures(ctx, x, y, finderDistanceMap);
    const p = decodeFailureProb(features, coeffs);
    if (p > pNew) pNew = p;
  }

  const survival = blockState.cumulativeSurvivalProb * (1 - pNew);
  const cumulativeFailure = 1 - survival;
  return { accepted: cumulativeFailure < policy.failureTolerance, pNew };
}

/** Extract per-module ART-UP features from a SamplingSimContext.
 *  finderDistanceMap is precomputable per matrix-size — pass null to skip
 *  the finder-distance feature (treated as 0). */
export function extractFeatures(
  ctx: SamplingSimContext,
  mx: number,
  my: number,
  finderDistanceMap: Float32Array | null,
): ArtUpFeatures {
  const size = ctx.matrix.size;
  const marginCells = ctx.predicted.marginCells;
  const subWidth = ctx.predicted.width;

  // Surround contrast: average of 8 surround subpixel luma minus centre.
  const csx = (mx + marginCells) * 3 + 1;
  const csy = (my + marginCells) * 3 + 1;
  const centreLuma = ctx.predicted.data.data[(csy * subWidth + csx) * 4] / 255;
  let surroundSum = 0, surroundCount = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const sx = csx + dx;
      const sy = csy + dy;
      if (sx < 0 || sy < 0 || sx >= subWidth || sy >= ctx.predicted.height) continue;
      surroundSum += ctx.predicted.data.data[(sy * subWidth + sx) * 4] / 255;
      surroundCount++;
    }
  }
  const surroundAvg = surroundCount > 0 ? surroundSum / surroundCount : 0;
  const surroundContrast = surroundAvg - centreLuma;

  // Centre correlation: 1 if matrix vote matches what the predicted (dithered)
  // value at this centre subpixel says, 0 otherwise.
  const matrixDark = ctx.matrix.modules[my][mx];
  const centreSays = centreLuma < 0.5; // dark
  const centreCorrelation = matrixDark === centreSays ? 1 : 0;

  const finderDistance = finderDistanceMap ? finderDistanceMap[my * size + mx] : 0;

  return { surroundContrast, centreCorrelation, finderDistance };
}

/** Compute the Chebyshev distance from each module to the nearest finder
 *  corner. Finder corners are at (0,0), (size-7, 0), (0, size-7) — the
 *  top-left, top-right, and bottom-left fixed-position 7×7 patterns. */
export function buildFinderDistanceMap(size: number): Float32Array {
  const out = new Float32Array(size * size);
  const corners: Array<[number, number]> = [
    [3, 3],            // centre of TL finder
    [size - 4, 3],      // centre of TR finder
    [3, size - 4],      // centre of BL finder
  ];
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      let best = Infinity;
      for (const [cx, cy] of corners) {
        const d = Math.max(Math.abs(mx - cx), Math.abs(my - cy));
        if (d < best) best = d;
      }
      out[my * size + mx] = best;
    }
  }
  return out;
}
