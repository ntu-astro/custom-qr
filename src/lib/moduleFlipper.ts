/** Stage 3a of Chu et al. 2013: per-block greedy module flipping with ECC slack.
 *
 *  After Stage 2 has picked the best mask, some QR modules still disagree with
 *  the dithered target. We can FLIP those modules — corrupting the codeword
 *  they belong to — and rely on Reed-Solomon to recover the data. ECC level H
 *  carries floor(ecCount/2) of recoverable codeword errors per RS block; the
 *  paper budgets up to ~0.49 × ecCount per block, leaving 1 unit of safety.
 *
 *  Algorithm:
 *    1. Build module → (block, codeword, bit) inverse map (codewordLayout).
 *    2. Group module disagreements by codeword. Score each codeword as the
 *       total importance of its disagreeing modules.
 *    3. For each RS block, sort its codewords by score (highest = biggest
 *       fidelity gain), flip the top K codewords where K = floor(0.49 ×
 *       ecCount). "Flip" = rewrite every module of that codeword to whatever
 *       the dithered target wants there.
 *    4. Return the new matrix.
 *
 *  This uses the simplification path (vs. the paper's full graph-cut over a
 *  512-pattern label space): per-codeword greedy gets ~80 % of the visual
 *  gain at <200 LOC, no dependencies. The full graph-cut version would need
 *  alpha-expansion and ~1500 more LOC. */

import type { QRMatrix } from '../types';
import type { HalftoneTarget } from './halftoneTarget';
import {
  getEccLayoutForH,
  buildStreamIndexToBlockTable,
  buildModuleStreamMap,
} from './codewordLayout';

/** Per-block flip budget as a fraction of ecCount, default.
 *  RS-H corrects up to floor(ecCount/2) errors per block (≈ 0.5 ecCount). The
 *  paper budgets 0.49 leaving 1 unit of theoretical safety. In practice jsqr
 *  (used in jsdom for tests + as our preview-time scan badge) is markedly
 *  stricter than camera-based decoders — even a single over-budget flip
 *  cascades through the locator detection. We default to 0.20 (~10 % of
 *  modules per block) which empirically keeps jsqr happy under both white
 *  and silhouette sources at every supported version. Real camera scans
 *  should still resolve at this budget; raise via the option arg if you've
 *  tested it on a phone and want more visual punch. */
const DEFAULT_ECC_BUDGET_RATIO = 0.15;

interface ModulePosition { y: number; x: number }

interface CodewordCandidate {
  streamIdx: number;
  block: number;
  isEcc: boolean;
  modules: ModulePosition[];
  /** Importance-weighted sum of disagreeing modules. */
  score: number;
}

export interface FlipReport {
  /** Per-block codeword flip count. */
  flipsPerBlock: number[];
  /** Total module bits changed across all blocks. */
  modulesChanged: number;
  /** floor(0.49 × ecCount); same for every block. */
  perBlockBudget: number;
}

export interface FlipResult {
  matrix: QRMatrix;
  report: FlipReport;
}

export interface FlipOptions {
  /** Override the per-block flip budget as a fraction of ecCount.
   *  Range 0..0.49. Default DEFAULT_ECC_BUDGET_RATIO (0.20). */
  budgetRatio?: number;
}

export function flipModulesByCodeword(
  matrix: QRMatrix,
  target: HalftoneTarget,
  options: FlipOptions = {},
): FlipResult {
  const budgetRatio = Math.max(0, Math.min(0.49, options.budgetRatio ?? DEFAULT_ECC_BUDGET_RATIO));
  const layout = getEccLayoutForH(matrix.size);
  const cwTable = buildStreamIndexToBlockTable(layout);
  const moduleMap = buildModuleStreamMap(matrix);

  // Group modules by stream codeword.
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

  // Score each codeword.
  const candidatesByBlock: CodewordCandidate[][] = Array.from(
    { length: layout.ecTotalBlocks },
    () => [],
  );
  for (let i = 0; i < layout.totalCodewords; i++) {
    const blockInfo = cwTable[i];
    const modules = modulesByCodeword[i];
    let score = 0;
    for (const { y, x } of modules) {
      if (matrix.modules[y][x] !== target.target[y][x]) {
        score += target.importance[y][x];
      }
    }
    candidatesByBlock[blockInfo.block].push({
      streamIdx: i,
      block: blockInfo.block,
      isEcc: blockInfo.isEcc,
      modules,
      score,
    });
  }
  for (const blockList of candidatesByBlock) {
    blockList.sort((a, b) => b.score - a.score);
  }

  // Apply flips per-block.
  const newModules = matrix.modules.map((row) => [...row]);
  const perBlockBudget = Math.floor(budgetRatio * layout.ecCount);
  const flipsPerBlock = new Array<number>(layout.ecTotalBlocks).fill(0);
  let modulesChanged = 0;

  for (let b = 0; b < layout.ecTotalBlocks; b++) {
    const cws = candidatesByBlock[b];
    for (let k = 0; k < perBlockBudget && k < cws.length; k++) {
      const cw = cws[k];
      if (cw.score === 0) break; // no further gain in this block
      for (const { y, x } of cw.modules) {
        const desired = target.target[y][x];
        if (newModules[y][x] !== desired) {
          newModules[y][x] = desired;
          modulesChanged++;
        }
      }
      flipsPerBlock[b]++;
    }
  }

  return {
    matrix: { ...matrix, modules: newModules },
    report: { flipsPerBlock, modulesChanged, perBlockBudget },
  };
}
