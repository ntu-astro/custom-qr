/** Stage 3a of Chu et al. 2013: per-block greedy module flipping with ECC slack.
 *
 *  After Stage 2 has picked the best mask, some QR modules still disagree with
 *  the dithered target. We can FLIP those modules — corrupting the codeword
 *  they belong to — and rely on Reed-Solomon to recover the data. ECC level H
 *  carries floor(ecCount/2) of recoverable codeword errors per RS block; the
 *  paper budgets up to ~0.49 × ecCount per block, leaving 1 unit of safety.
 *
 *  Algorithm (Phase 2 — Sampling-Sim scoring + lazy re-score):
 *    1. Build module → (block, codeword, bit) inverse map (codewordLayout).
 *    2. For each candidate codeword, compute the Δ in Sampling-Sim total score
 *       if we set its modules to the target values. Δ is computed locally
 *       (over the codeword's modules + 1-cell halo) using applyModuleFlip's
 *       incremental readback recompute. After scoring, the flips are reverted
 *       so subsequent codewords score against the original state.
 *    3. For each RS block, repeat:
 *         a. pick the remaining codeword with the highest current Δ;
 *         b. if Δ ≤ 0 or shouldAcceptFlip rejects, stop the block;
 *         c. otherwise, flip the codeword's modules (propagating via
 *            applyModuleFlip so the readback stays consistent), then
 *            **lazily re-score** every other remaining codeword in the block
 *            whose modules' 1-halo intersects the readback-changed set.
 *            Re-sort the remaining list. Other codewords' Δ are unchanged
 *            (their readback didn't change), so we don't need to re-score them.
 *    4. Return the new matrix.
 *
 *  The lazy re-score keeps the algorithm coherent under sequential flips: the
 *  Δ-score of a codeword whose modules sit next to a just-flipped module is
 *  generally smaller (some of the gain has already been realised by the
 *  previous flip), so re-scoring prevents us from "double-spending" budget on
 *  overlapping flips that don't actually compound. */

import type { QRMatrix } from '../types';
import type { HalftoneTarget } from './halftoneTarget';
import {
  getEccLayoutForH,
  buildStreamIndexToBlockTable,
  buildModuleStreamMap,
} from './codewordLayout';
import type { SamplingSimContext } from './samplingSim';
import { applyModuleFlip, scoreModuleAgainstTarget } from './samplingSim';
import type { FlipBudgetPolicy, BlockFlipState } from './flipBudget';
import { shouldAcceptFlip, buildFinderDistanceMap } from './flipBudget';
import { ART_UP_COEFFICIENTS, DEFAULT_FAILURE_TOLERANCE, CALIBRATION_AUC } from './flipBudget.calibration';

/** Per-block flip budget as a fraction of ecCount, default.
 *  RS-H corrects up to floor(ecCount/2) errors per block (≈ 0.5 ecCount). The
 *  paper budgets 0.49 leaving 1 unit of theoretical safety. In practice jsqr
 *  (used in jsdom for tests + as our preview-time scan badge) is markedly
 *  stricter than camera-based decoders — even a single over-budget flip
 *  cascades through the locator detection. We default to 0.15 (~7.5 % of
 *  modules per block) which empirically keeps jsqr happy under both white
 *  and silhouette sources at every supported version. Raise via the option
 *  arg if you've tested it on a phone and want more visual punch. */
export const DEFAULT_ECC_BUDGET_RATIO = 0.15;

/** Default flip-budget policy. ART-UP probabilistic gating is enabled only
 *  when calibration has been run (AUC > 0.85 per spec §9) — otherwise the
 *  generated calibration file ships with DEFAULT_FAILURE_TOLERANCE = 1.0,
 *  which effectively disables ART-UP (no cumulative-failure cap can fire),
 *  AND we additionally fall through to 'fixed' here as a belt-and-braces
 *  guard. */
export const DEFAULT_FLIP_BUDGET_POLICY: FlipBudgetPolicy =
  CALIBRATION_AUC >= 0.85
    ? { kind: 'probabilistic', failureTolerance: DEFAULT_FAILURE_TOLERANCE }
    : { kind: 'fixed', ratio: DEFAULT_ECC_BUDGET_RATIO };

interface ModulePosition { y: number; x: number }

interface CodewordCandidate {
  streamIdx: number;
  block: number;
  isEcc: boolean;
  modules: ModulePosition[];
  /** Sampling-Sim Δ-score: positive = setting these modules to the target
   *  reduces total score by this amount. */
  delta: number;
}

export interface FlipReport {
  /** Per-block codeword flip count. */
  flipsPerBlock: number[];
  /** Total module bits changed across all blocks. */
  modulesChanged: number;
  /** floor(budgetRatio × ecCount) under the 'fixed' policy; an upper bound
   *  (floor(ecCount/2)) under 'probabilistic'. Same for every block. */
  perBlockBudget: number;
  /** Resolved policy actually used (echoes the input or the runtime default). */
  policy: FlipBudgetPolicy;
}

export interface FlipResult {
  matrix: QRMatrix;
  report: FlipReport;
}

export interface FlipOptions {
  /** Override the per-block flip budget as a fraction of ecCount.
   *  Range 0..0.49. Used by the 'fixed' policy only.
   *  Default DEFAULT_ECC_BUDGET_RATIO (0.15). Ignored under 'probabilistic'. */
  budgetRatio?: number;
  /** Sampling-Sim context for the post-mask matrix. Required since Phase 2 —
   *  the flipper needs the readback to compute per-codeword Δ-scores and to
   *  propagate accepted flips into the context (so any downstream scorer
   *  sees the post-flip readback). The caller should pass a context built via
   *  `buildSamplingContext(predicted, matrix)` AFTER mask selection. */
  samplingContext: SamplingSimContext;
  /** Optional override for the flip-budget policy. Defaults to
   *  DEFAULT_FLIP_BUDGET_POLICY which resolves to 'probabilistic' iff
   *  calibration has been run with AUC > 0.85, else 'fixed'. */
  policy?: FlipBudgetPolicy;
}

/** Compute the Sampling-Sim Δ-score for a codeword: how much the importance-
 *  weighted L1 error would drop if every module of this codeword were set to
 *  the target value. Mutation-and-revert on the SamplingSimContext keeps the
 *  per-codeword scoring independent (each codeword scored against the same
 *  baseline). */
function scoreCodewordDelta(
  ctx: SamplingSimContext,
  target: HalftoneTarget,
  modules: ModulePosition[],
): number {
  // The set of modules whose readback may change due to flipping this
  // codeword: every module in the codeword + its 1-cell halo. We score over
  // exactly that set — modules outside it have unchanged readback regardless.
  const size = ctx.matrix.size;
  const seen = new Uint8Array(size * size);
  const affected: ModulePosition[] = [];
  for (const { y, x } of modules) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ny = y + dy;
        const nx = x + dx;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const idx = ny * size + nx;
        if (seen[idx]) continue;
        seen[idx] = 1;
        affected.push({ y: ny, x: nx });
      }
    }
  }

  let before = 0;
  for (const { y, x } of affected) before += scoreModuleAgainstTarget(ctx, target, x, y);

  // Apply the flips, remembering originals so we can revert.
  const originals: boolean[] = new Array(modules.length);
  for (let i = 0; i < modules.length; i++) {
    const { y, x } = modules[i];
    originals[i] = ctx.matrix.modules[y][x];
    const desired = target.target[y][x];
    if (originals[i] !== desired) {
      applyModuleFlip(ctx, x, y, desired);
    }
  }

  let after = 0;
  for (const { y, x } of affected) after += scoreModuleAgainstTarget(ctx, target, x, y);

  // Revert.
  for (let i = 0; i < modules.length; i++) {
    const { y, x } = modules[i];
    if (ctx.matrix.modules[y][x] !== originals[i]) {
      applyModuleFlip(ctx, x, y, originals[i]);
    }
  }

  return before - after;
}

/** True iff any of `modules` (or its 1-cell halo) is flagged in `changedMask`.
 *  Used by the lazy re-score loop to decide whether a codeword's Δ has been
 *  invalidated by a just-accepted flip in the same block. The 1-cell halo is
 *  necessary because scoreCodewordDelta scores over `modules + 1-halo`. */
function codewordOverlapsChange(
  modules: ModulePosition[],
  changedMask: Uint8Array,
  size: number,
): boolean {
  for (const { y, x } of modules) {
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= size) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= size) continue;
        if (changedMask[ny * size + nx] === 1) return true;
      }
    }
  }
  return false;
}

export function flipModulesByCodeword(
  matrix: QRMatrix,
  target: HalftoneTarget,
  options: FlipOptions,
): FlipResult {
  // Resolve effective policy. If the caller passes a 'fixed' policy with a
  // budgetRatio, prefer that ratio; otherwise honour DEFAULT_ECC_BUDGET_RATIO.
  let policy: FlipBudgetPolicy = options.policy ?? DEFAULT_FLIP_BUDGET_POLICY;
  if (policy.kind === 'fixed' && options.budgetRatio !== undefined) {
    policy = { kind: 'fixed', ratio: Math.max(0, Math.min(0.49, options.budgetRatio)) };
  } else if (policy.kind === 'fixed') {
    policy = { kind: 'fixed', ratio: Math.max(0, Math.min(0.49, policy.ratio)) };
  }
  const ctx = options.samplingContext;
  const layout = getEccLayoutForH(matrix.size);
  const cwTable = buildStreamIndexToBlockTable(layout);
  const moduleMap = buildModuleStreamMap(matrix);
  const finderDistanceMap = policy.kind === 'probabilistic' ? buildFinderDistanceMap(matrix.size) : null;

  // Group modules by stream codeword. Reserved modules don't appear in the
  // moduleMap (it returns null for reserved cells), so codewords here only
  // contain flippable data modules.
  const modulesByCodeword: ModulePosition[][] = Array.from(
    { length: layout.totalCodewords },
    () => [],
  );
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      const pos = moduleMap[y][x];
      if (pos === null) continue;
      modulesByCodeword[pos.streamIdx].push({ y, x });
    }
  }

  // Score each codeword via Sampling-Sim Δ-score, then group by block.
  const candidatesByBlock: CodewordCandidate[][] = Array.from(
    { length: layout.ecTotalBlocks },
    () => [],
  );
  for (let i = 0; i < layout.totalCodewords; i++) {
    const blockInfo = cwTable[i];
    const modules = modulesByCodeword[i];
    if (modules.length === 0) {
      candidatesByBlock[blockInfo.block].push({
        streamIdx: i,
        block: blockInfo.block,
        isEcc: blockInfo.isEcc,
        modules,
        delta: 0,
      });
      continue;
    }
    const delta = scoreCodewordDelta(ctx, target, modules);
    candidatesByBlock[blockInfo.block].push({
      streamIdx: i,
      block: blockInfo.block,
      isEcc: blockInfo.isEcc,
      modules,
      delta,
    });
  }
  for (const blockList of candidatesByBlock) {
    blockList.sort((a, b) => b.delta - a.delta);
  }

  // Apply flips per-block. Each accepted flip propagates into the
  // SamplingSimContext via applyModuleFlip so the post-flip readback is
  // available to downstream consumers. After every accepted flip we re-score
  // the OTHER remaining codewords in the same block whose readback footprint
  // overlaps the flipped modules' halo (the "lazy re-score" optimisation).
  const fixedPerBlockBudget = policy.kind === 'fixed'
    ? Math.floor(policy.ratio * layout.ecCount)
    : Math.floor(layout.ecCount / 2);
  const flipsPerBlock = new Array<number>(layout.ecTotalBlocks).fill(0);
  let modulesChanged = 0;

  // Reusable scratch buffer for the readback-changed lookup. Sized once.
  const size = matrix.size;
  const changedMask = new Uint8Array(size * size);

  for (let b = 0; b < layout.ecTotalBlocks; b++) {
    const cws = candidatesByBlock[b];
    const blockState: BlockFlipState = {
      cumulativeSurvivalProb: 1,
      flipsAccepted: 0,
      ecCount: layout.ecCount,
    };
    // Track which codewords in this block are still unflipped. We pop the
    // chosen codeword each iteration; the array stays sorted-by-Δ-desc so
    // index 0 is always the best remaining candidate.
    const remaining: CodewordCandidate[] = cws.slice();
    while (remaining.length > 0) {
      const cw = remaining[0];
      if (cw.delta <= 0) break; // no further gain in this block
      const { accepted, pNew } = shouldAcceptFlip(
        policy,
        blockState,
        { modules: cw.modules },
        ctx,
        ART_UP_COEFFICIENTS,
        finderDistanceMap,
      );
      if (!accepted) break;

      // Apply the flip; collect the union of "affected" modules (modules
      // whose readback was recomputed) across all per-module flips in this
      // codeword. applyModuleFlip already returns this set per call.
      const changedCoords: ModulePosition[] = [];
      for (const { y, x } of cw.modules) {
        const desired = target.target[y][x];
        if (ctx.matrix.modules[y][x] !== desired) {
          const { affected } = applyModuleFlip(ctx, x, y, desired);
          for (const a of affected) {
            const idx = a.y * size + a.x;
            if (changedMask[idx] === 0) {
              changedMask[idx] = 1;
              changedCoords.push({ y: a.y, x: a.x });
            }
          }
          modulesChanged++;
        }
      }
      blockState.flipsAccepted++;
      blockState.cumulativeSurvivalProb *= 1 - pNew;
      flipsPerBlock[b]++;

      // Remove the just-flipped codeword from the candidate list.
      remaining.shift();

      // Lazy re-score: any remaining codeword C whose score footprint
      // (C's modules + 1-cell halo) overlaps the changed-readback set has a
      // stale Δ. The footprint check expands each of C's modules by 1 cell,
      // i.e. we ask whether any module within distance 1 of one of C's
      // modules is in changedMask. Equivalent to: "is any module of C
      // within Chebyshev distance ≤ 1 of a readback-changed cell".
      if (changedCoords.length > 0 && remaining.length > 0) {
        for (const candidate of remaining) {
          if (candidate.modules.length === 0) continue;
          if (codewordOverlapsChange(candidate.modules, changedMask, size)) {
            candidate.delta = scoreCodewordDelta(ctx, target, candidate.modules);
          }
        }
        // Re-sort: typically only a small fraction of `remaining` was
        // re-scored, but a full sort is O(N log N) with N ≈ ecCount (≤ 28
        // at V25), which is negligible compared to the readback recompute.
        remaining.sort((a, b) => b.delta - a.delta);
      }

      // Reset the scratch mask for the next iteration.
      for (const a of changedCoords) {
        changedMask[a.y * size + a.x] = 0;
      }
    }
  }

  // The matrix returned shares its modules array with `options.samplingContext.matrix`
  // (applyModuleFlip mutated it in place). Callers may continue to use the
  // sampling context — its readback now reflects the post-flip state.
  return {
    matrix: ctx.matrix,
    report: { flipsPerBlock, modulesChanged, perBlockBudget: fixedPerBlockBudget, policy },
  };
}
