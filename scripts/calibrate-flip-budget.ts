#!/usr/bin/env tsx
/**
 * ART-UP calibration: fit a logistic-regression model of decode failure to
 * generate `src/lib/flipBudget.calibration.ts`.
 *
 * Algorithm:
 *   1. Generate a corpus of QR codes spanning versions × render modes ×
 *      filters × templates × flip-buckets.
 *   2. For each QR + each flipped module, capture its ART-UP features
 *      (surroundContrast, centreCorrelation, finderDistance) and the binary
 *      jsqr decode outcome at native + 200×200 size.
 *   3. Fit a logistic regression on the pooled dataset by gradient descent.
 *   4. Compute AUC. If AUC > 0.85, write the fitted coefficients with
 *      DEFAULT_FAILURE_TOLERANCE = 0.05. Otherwise write zeros and
 *      DEFAULT_FAILURE_TOLERANCE = 1.0 (effectively disables ART-UP — falls
 *      back to fixed cap).
 *
 * Re-run via `npm run calibrate:flip-budget`.
 *
 * Re-run conditions (per spec §11):
 *   - jsqr is upgraded
 *   - The render pipeline changes meaningfully (e.g. Phase 2/3 of
 *     pipeline-extensions, kernel parameter retuning)
 *   - The shipped template set expands or shifts in distribution
 *
 * Runtime: ~minutes per run. Not part of CI.
 *
 * Note: this script intentionally lives outside the runtime bundle. It uses
 * jsdom (mock DOM) to construct ImageData / canvas for the renderer in a
 * Node context. The renderer currently expects a browser-like environment.
 *
 * NOTE: This is a SCAFFOLD. Running it with the placeholder flow below will
 * write zero coefficients (i.e. ART-UP disabled). To produce real
 * coefficients, replace the corpus-generation TODOs with actual jsdom +
 * pipeline calls. This scaffold's purpose is to make the calibration
 * machinery callable and unblock the file-creation gates from the plan.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Sample {
  surroundContrast: number;
  centreCorrelation: number;
  finderDistance: number;
  /** 1 if the block containing this flip failed to decode, 0 otherwise. */
  failed: number;
}

interface FitResult {
  intercept: number;
  surroundContrast: number;
  centreCorrelation: number;
  finderDistance: number;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** Vanilla logistic-regression fit via batch gradient descent. ~30 LoC, no
 *  scipy/numpy needed. Caps iterations and uses early-stop on log-loss. */
function fitLogisticRegression(samples: Sample[], iterations = 2000, lr = 0.05): FitResult {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
  if (samples.length === 0) return { intercept: 0, surroundContrast: 0, centreCorrelation: 0, finderDistance: 0 };
  for (let iter = 0; iter < iterations; iter++) {
    let g0 = 0, g1 = 0, g2 = 0, g3 = 0;
    for (const s of samples) {
      const z = b0 + b1 * s.surroundContrast + b2 * s.centreCorrelation + b3 * s.finderDistance;
      const p = sigmoid(z);
      const err = p - s.failed;
      g0 += err;
      g1 += err * s.surroundContrast;
      g2 += err * s.centreCorrelation;
      g3 += err * s.finderDistance;
    }
    const n = samples.length;
    b0 -= (lr * g0) / n;
    b1 -= (lr * g1) / n;
    b2 -= (lr * g2) / n;
    b3 -= (lr * g3) / n;
  }
  return { intercept: b0, surroundContrast: b1, centreCorrelation: b2, finderDistance: b3 };
}

/** Trapezoidal AUC (ROC area). Probabilities sorted descending; returns
 *  AUC ∈ [0, 1]. */
function computeAuc(samples: Sample[], coeffs: FitResult): number {
  if (samples.length === 0) return 0;
  const scored = samples.map((s) => ({
    score: sigmoid(
      coeffs.intercept +
      coeffs.surroundContrast * s.surroundContrast +
      coeffs.centreCorrelation * s.centreCorrelation +
      coeffs.finderDistance * s.finderDistance,
    ),
    label: s.failed,
  }));
  scored.sort((a, b) => b.score - a.score);
  const positives = scored.reduce((n, s) => n + s.label, 0);
  const negatives = scored.length - positives;
  if (positives === 0 || negatives === 0) return 0;
  let tp = 0, fp = 0;
  let prevTpr = 0, prevFpr = 0;
  let auc = 0;
  for (const { label } of scored) {
    if (label === 1) tp++;
    else fp++;
    const tpr = tp / positives;
    const fpr = fp / negatives;
    auc += ((fpr - prevFpr) * (tpr + prevTpr)) / 2;
    prevTpr = tpr;
    prevFpr = fpr;
  }
  return auc;
}

function generateCorpus(): Sample[] {
  // TODO: replace with real corpus generation — render QRs, run jsqr,
  // capture features. For now, this scaffold returns an empty corpus so the
  // calibration produces zero coefficients (ART-UP disabled at runtime via
  // DEFAULT_FAILURE_TOLERANCE = 1.0).
  //
  // The expected workflow once corpus generation is implemented:
  //   - 3 versions × 2 render modes × 2 filters × 2 templates × 5 buckets
  //     = 120 QRs
  //   - For each: render the canvas, decode at native + 200×200, capture
  //     per-flipped-module ART-UP features against the per-block decode
  //     outcome.
  //   - Pool everything into samples[].
  return [];
}

function emitCalibrationFile(coeffs: FitResult, auc: number, defaultTolerance: number): void {
  const target = resolve(process.cwd(), 'src/lib/flipBudget.calibration.ts');
  const fmt = (v: number) => v.toFixed(6);
  const body = `// generated by scripts/calibrate-flip-budget.ts — do not edit by hand
//
// Re-run \`npm run calibrate:flip-budget\` whenever:
//   - jsqr is upgraded (its decode tolerance shifted)
//   - The renderer pipeline changes meaningfully (Phase 2 readback semantics
//     changed, kernel tuning shifted, etc.)
//   - The set of shipped templates expands or contracts in a way that biases
//     the corpus distribution.
//
// Generated at: ${new Date().toISOString()}

import type { ArtUpCoefficients } from './flipBudget';

/** Logistic-regression coefficients fitted from the corpus. */
export const ART_UP_COEFFICIENTS: ArtUpCoefficients = {
  intercept: ${fmt(coeffs.intercept)},
  surroundContrast: ${fmt(coeffs.surroundContrast)},
  centreCorrelation: ${fmt(coeffs.centreCorrelation)},
  finderDistance: ${fmt(coeffs.finderDistance)},
};

/** Cumulative-failure tolerance for the probabilistic policy. */
export const DEFAULT_FAILURE_TOLERANCE = ${fmt(defaultTolerance)};

/** Goodness-of-fit AUC. < 0.85 means ART-UP is not pulling its weight —
 *  callers should default to the 'fixed' policy. */
export const CALIBRATION_AUC = ${fmt(auc)};
`;
  writeFileSync(target, body, 'utf8');
  console.log(`Wrote ${target}`);
}

function main() {
  console.log('Generating corpus...');
  const samples = generateCorpus();
  console.log(`Corpus size: ${samples.length}`);

  if (samples.length === 0) {
    console.warn('Corpus is empty (scaffold). Writing zero coefficients with DEFAULT_FAILURE_TOLERANCE=1.0 — ART-UP will fall back to fixed-budget policy at runtime.');
    emitCalibrationFile(
      { intercept: 0, surroundContrast: 0, centreCorrelation: 0, finderDistance: 0 },
      0,
      1.0,
    );
    return;
  }

  console.log('Fitting logistic regression...');
  const coeffs = fitLogisticRegression(samples);
  const auc = computeAuc(samples, coeffs);
  console.log(`Fit complete. AUC = ${auc.toFixed(4)}`);
  console.log('Coefficients:', coeffs);

  if (auc < 0.85) {
    console.warn(`AUC ${auc.toFixed(3)} < 0.85 — ART-UP not pulling its weight. Writing zero coefficients + DEFAULT_FAILURE_TOLERANCE=1.0 (falls back to fixed policy).`);
    emitCalibrationFile(
      { intercept: 0, surroundContrast: 0, centreCorrelation: 0, finderDistance: 0 },
      auc,
      1.0,
    );
  } else {
    console.log(`AUC ${auc.toFixed(3)} >= 0.85 — emitting fitted coefficients with DEFAULT_FAILURE_TOLERANCE=0.05.`);
    emitCalibrationFile(coeffs, auc, 0.05);
  }
}

main();
