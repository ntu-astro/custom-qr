/** ArtCoder-style Sampling Simulation for QR module scoring.
 *
 *  Models what a phone camera would actually read at each module's centre
 *  region: a Gaussian-weighted average over a small subpixel window. This
 *  replaces the binary "matches target / doesn't" metric with a continuous
 *  score that captures how strongly each module is "voted" toward dark or
 *  light by its 3×3 module neighbourhood after halftone diffusion.
 *
 *  Spec: 2026-05-08-pipeline-extensions-design.md §8 PR 4 — Sampling-Sim
 *  scoring. Used by maskOptimizer (per-mask total score) and moduleFlipper
 *  (per-codeword Δ-score for the per-block budget loop). */

import type { QRMatrix } from '../types';
import type { PredictedCanvas } from './predictedCanvas';
import type { HalftoneTarget } from './halftoneTarget';

// ---------------------------------------------------------------------------
// Kernel parameters
// ---------------------------------------------------------------------------

/** Side length of the Gaussian receptive field, in subpixels. 5 means a 5×5
 *  window centred on the module's centre subpixel. */
const KERNEL_SIZE = 5;

/** Gaussian σ in subpixels. Empirical pick: σ=1 with a 5×5 kernel keeps the
 *  effective receptive field tight enough that flips don't bleed into modules
 *  more than 1 cell away (cellPx=18, subPx=6, kernel reaches 2 subpixels). */
const KERNEL_SIGMA = 1.0;

/** Module-distance the kernel can reach. With KERNEL_SIZE=5 and a 3-subpixel
 *  module, the kernel touches the immediately adjacent modules only — a 3×3
 *  module neighbourhood centred on the flipped module. */
const RECEPTIVE_RADIUS_MODULES = 1;

const DARK_LUMA = 0.0;
const LIGHT_LUMA = 1.0;

const KERNEL_WEIGHTS: Float32Array = (() => {
  const weights = new Float32Array(KERNEL_SIZE * KERNEL_SIZE);
  const half = (KERNEL_SIZE - 1) / 2;
  let total = 0;
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * KERNEL_SIGMA * KERNEL_SIGMA));
      weights[(dy + half) * KERNEL_SIZE + (dx + half)] = w;
      total += w;
    }
  }
  // Normalise so weights sum to 1 — readback values stay in [DARK_LUMA, LIGHT_LUMA].
  for (let i = 0; i < weights.length; i++) weights[i] /= total;
  return weights;
})();

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SamplingSimContext {
  /** Borrowed reference, not cloned. The centre subpixel of every module is
   *  the live state owned by this context (mutated by applyModuleFlip).
   *  Surround subpixels and margin are immutable inputs. */
  predicted: PredictedCanvas;
  /** Borrowed reference. `applyModuleFlip` mutates `matrix.modules`. */
  matrix: QRMatrix;
  /** Per-module Gaussian-weighted readback luma, size×size, indexed
   *  `[my*size+mx]`, values 0..1. */
  readback: Float32Array;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Read the effective luma at subpixel (sx, sy). For data-module centre
 *  subpixels we override predicted.data with the matrix value (DARK or LIGHT)
 *  — the renderer will paint that value, so the camera will read it.
 *  Reserved cells: every subpixel reads the matrix value (whole cell painted).
 *  Margin / surround subpixels: read predicted.data directly. */
function lumaAt(predicted: PredictedCanvas, matrix: QRMatrix, sx: number, sy: number): number {
  const marginCells = predicted.marginCells;
  const cx = Math.floor(sx / 3) - marginCells;
  const cy = Math.floor(sy / 3) - marginCells;

  if (cx >= 0 && cy >= 0 && cx < matrix.size && cy < matrix.size) {
    const isReserved = matrix.reserved[cy * matrix.size + cx] === 1;
    const subX = sx - (cx + marginCells) * 3;
    const subY = sy - (cy + marginCells) * 3;
    const isCentre = subX === 1 && subY === 1;
    if (isReserved || isCentre) {
      return matrix.modules[cy][cx] ? DARK_LUMA : LIGHT_LUMA;
    }
  }

  // Margin or surround subpixel — read predicted.data. predicted.data is
  // greyscale (R=G=B for halftone-mono and composite-mono; raw raster for
  // composite-color where we still take the luma channel as a proxy).
  const idx4 = (sy * predicted.width + sx) * 4;
  return predicted.data.data[idx4] / 255;
}

function computeReadbackForModule(
  predicted: PredictedCanvas,
  matrix: QRMatrix,
  mx: number,
  my: number,
): number {
  const csx = (mx + predicted.marginCells) * 3 + 1;
  const csy = (my + predicted.marginCells) * 3 + 1;
  const half = (KERNEL_SIZE - 1) / 2;
  let sum = 0;
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const sx = clamp(csx + dx, 0, predicted.width - 1);
      const sy = clamp(csy + dy, 0, predicted.height - 1);
      sum += KERNEL_WEIGHTS[(dy + half) * KERNEL_SIZE + (dx + half)] * lumaAt(predicted, matrix, sx, sy);
    }
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build a SamplingSimContext for a specific (predicted, matrix) pair. The
 *  predicted canvas is borrowed, not cloned — callers must not pass the same
 *  predicted to multiple concurrent contexts that mutate. */
export function buildSamplingContext(predicted: PredictedCanvas, matrix: QRMatrix): SamplingSimContext {
  const size = matrix.size;
  const readback = new Float32Array(size * size);
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      readback[my * size + mx] = computeReadbackForModule(predicted, matrix, mx, my);
    }
  }
  return { predicted, matrix, readback };
}

/** Score a single module against the halftone target — importance-weighted
 *  L1 distance between readback and target value. Used as a building block
 *  for the per-codeword Δ-score in moduleFlipper. */
export function scoreModuleAgainstTarget(
  ctx: SamplingSimContext,
  target: HalftoneTarget,
  mx: number,
  my: number,
): number {
  const w = target.importance[my][mx];
  if (w === 0) return 0;
  const tval = target.target[my][mx] ? DARK_LUMA : LIGHT_LUMA;
  return w * Math.abs(ctx.readback[my * ctx.matrix.size + mx] - tval);
}

/** Apply a single module flip in place. Mutates `matrix.modules[my][mx]` to
 *  `newValue`, returns the list of modules whose readback was recomputed
 *  (always the 3×3 module neighbourhood, clipped to the matrix bounds).
 *
 *  Caller invariant: `(mx, my)` MUST be a non-reserved (data) module.
 *  Reserved-cell flips break the QR's structural patterns and are rejected
 *  via `matrix.reserved[my*size+mx] === 1` in the calling code path. */
export function applyModuleFlip(
  ctx: SamplingSimContext,
  mx: number,
  my: number,
  newValue: boolean,
): { affected: Array<{ x: number; y: number }> } {
  if (import.meta.env?.DEV && ctx.matrix.reserved[my * ctx.matrix.size + mx] === 1) {
    throw new Error(`samplingSim.applyModuleFlip: cannot flip reserved module (${mx}, ${my})`);
  }
  ctx.matrix.modules[my][mx] = newValue;

  const size = ctx.matrix.size;
  const affected: Array<{ x: number; y: number }> = [];
  for (let ny = my - RECEPTIVE_RADIUS_MODULES; ny <= my + RECEPTIVE_RADIUS_MODULES; ny++) {
    for (let nx = mx - RECEPTIVE_RADIUS_MODULES; nx <= mx + RECEPTIVE_RADIUS_MODULES; nx++) {
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      ctx.readback[ny * size + nx] = computeReadbackForModule(ctx.predicted, ctx.matrix, nx, ny);
      affected.push({ x: nx, y: ny });
    }
  }
  return { affected };
}

/** Sum the per-module scores over all non-reserved modules. Used as the
 *  per-mask objective in maskOptimizer. */
export function totalScore(ctx: SamplingSimContext, target: HalftoneTarget): number {
  const size = ctx.matrix.size;
  let sum = 0;
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const w = target.importance[my][mx];
      if (w === 0) continue;
      const tval = target.target[my][mx] ? DARK_LUMA : LIGHT_LUMA;
      sum += w * Math.abs(ctx.readback[my * size + mx] - tval);
    }
  }
  return sum;
}
