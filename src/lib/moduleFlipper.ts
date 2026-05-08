/** Stage 3a of Chu et al. 2013: per-block greedy module flipping with ECC slack.
 *
 *  After Stage 2 has picked the best mask, some QR modules still disagree with
 *  the dithered target. We can FLIP those modules — corrupting the codeword
 *  they belong to — and rely on Reed-Solomon to recover the data. ECC level H
 *  carries floor(ecCount/2) of recoverable codeword errors per RS block; the
 *  paper budgets up to ~0.49 × ecCount per block, leaving 1 unit of safety.
 *
 *  Algorithm (Phase 2 — Sampling-Sim scoring):
 *    1. Build module → (block, codeword, bit) inverse map (codewordLayout).
 *    2. For each candidate codeword, compute the Δ in Sampling-Sim total score
 *       if we set its modules to the target values. Δ is computed locally
 *       (over the codeword's modules + 1-cell halo) using applyModuleFlip's
 *       incremental readback recompute. After scoring, the flips are reverted
 *       so subsequent codewords score against the original state.
 *    3. For each RS block, sort its codewords by Δ-score (highest gain
 *       first), flip the top K codewords where K = floor(0.15 × ecCount).
 *       "Flip" = rewrite every module of that codeword to whatever the target
 *       wants there, propagating into the SamplingSimContext via
 *       applyModuleFlip so its readback stays consistent.
 *    4. Return the new matrix.
 *
 *  Phase 2 deliberately keeps the per-block budget loop unchanged — only the
 *  per-codeword scoring metric switches. The "lazy re-score after each
 *  accepted flip" optimisation is deferred (see plan §Phase 2 open questions). */

import type { QRMatrix } from '../types';
import type { HalftoneTarget } from './halftoneTarget';
import {
  getEccLayoutForH,
  buildStreamIndexToBlockTable,
  buildModuleStreamMap,
} from './codewordLayout';
import type { SamplingSimContext } from './samplingSim';
import { applyModuleFlip, scoreModuleAgainstTarget } from './samplingSim';

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
  /** floor(budgetRatio × ecCount); same for every block. */
  perBlockBudget: number;
}

export interface FlipResult {
  matrix: QRMatrix;
  report: FlipReport;
}

export interface FlipOptions {
  /** Override the per-block flip budget as a fraction of ecCount.
   *  Range 0..0.49. Default DEFAULT_ECC_BUDGET_RATIO (0.15). */
  budgetRatio?: number;
  /** Sampling-Sim context for the post-mask matrix. Required since Phase 2 —
   *  the flipper needs the readback to compute per-codeword Δ-scores and to
   *  propagate accepted flips into the context (so any downstream scorer
   *  sees the post-flip readback). The caller should pass a context built via
   *  `buildSamplingContext(predicted, matrix)` AFTER mask selection. */
  samplingContext: SamplingSimContext;
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

export function flipModulesByCodeword(
  matrix: QRMatrix,
  target: HalftoneTarget,
  options: FlipOptions,
): FlipResult {
  const budgetRatio = Math.max(0, Math.min(0.49, options.budgetRatio ?? DEFAULT_ECC_BUDGET_RATIO));
  const ctx = options.samplingContext;
  const layout = getEccLayoutForH(matrix.size);
  const cwTable = buildStreamIndexToBlockTable(layout);
  const moduleMap = buildModuleStreamMap(matrix);

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
  // available to downstream consumers.
  const perBlockBudget = Math.floor(budgetRatio * layout.ecCount);
  const flipsPerBlock = new Array<number>(layout.ecTotalBlocks).fill(0);
  let modulesChanged = 0;

  for (let b = 0; b < layout.ecTotalBlocks; b++) {
    const cws = candidatesByBlock[b];
    for (let k = 0; k < perBlockBudget && k < cws.length; k++) {
      const cw = cws[k];
      if (cw.delta <= 0) break; // no further gain in this block
      for (const { y, x } of cw.modules) {
        const desired = target.target[y][x];
        if (ctx.matrix.modules[y][x] !== desired) {
          applyModuleFlip(ctx, x, y, desired);
          modulesChanged++;
        }
      }
      flipsPerBlock[b]++;
    }
  }

  // The matrix returned shares its modules array with `options.samplingContext.matrix`
  // (applyModuleFlip mutated it in place). Callers may continue to use the
  // sampling context — its readback now reflects the post-flip state.
  return {
    matrix: ctx.matrix,
    report: { flipsPerBlock, modulesChanged, perBlockBudget },
  };
}
