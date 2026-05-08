/**
 * Pipeline performance regression test (V10 halftone-mono).
 *
 * Guards the perf budget defined in
 * docs/superpowers/plans/2026-05-08-pipeline-extensions-plan.md
 * (cross-cutting concerns §10.2): the full pipeline must complete in < 500 ms
 * at QR version 10 (matrix size 57). Phase 2 (Sampling-Sim) is the most
 * expensive stage (~60–100 ms typical); this test catches regressions if
 * future changes push us over the wall-clock ceiling.
 *
 * --- CI flakiness mitigation ---
 *
 * GitHub Actions runners are noisy and significantly slower than local M-class
 * hardware. To keep this test useful as a developer-facing gate without
 * flaking CI:
 *
 *   - Skipped automatically when `process.env.CI === 'true'` (set by GitHub
 *     Actions, GitLab CI, CircleCI, etc.) or when `SKIP_PERF === 'true'`.
 *   - Locally, runs N iterations and asserts the *median* < 500 ms. The
 *     median is robust against the first-iteration warm-up cost (JIT, cold
 *     module-graph caches) and against transient OS scheduling noise.
 *
 * To run locally as a one-off:
 *   npm test -- src/lib/pipelineIntegration.perf.test.ts
 *
 * To force-skip locally (e.g. battery-powered laptop, thermal throttling):
 *   SKIP_PERF=true npm test
 */

import { describe, it, expect } from 'vitest';
import { buildMatrix } from './qrMatrix';
import { computeHalftoneTarget } from './halftoneTarget';
import { pickBestMask } from './maskOptimizer';
import { flipModulesByCodeword } from './moduleFlipper';
import { render as renderHalftone } from './halftoneRenderer';
import { buildPredictedCanvas } from './predictedCanvas';
import { buildSamplingContext } from './samplingSim';

// V10 has a 57×57 module matrix. URL length 116 (with 75 chars of padding
// after the base prefix) lands cleanly inside V10 at ECC level H — verified
// against `qrcode` 1.5.4 at test-write time. Lengths >116 spill into V11
// (size 61); lengths <101 fit into V9 (size 53).
const V10_MATRIX_SIZE = 57;
const V10_PAD_CHARS = 75;
const V10_URL = 'https://www.instagram.com/ntu_astro/?tag=' + 'x'.repeat(V10_PAD_CHARS);

// Number of iterations: enough to wash out warm-up + scheduling noise without
// making the test slow. With ~250 ms/iter on M-class hardware, 7 iterations
// is ~1.75 s — comparable to the existing integration test.
const ITERATIONS = 7;

// 500 ms per the design spec §10.2 perf budget. NOT a soft limit — if this
// fires locally, do NOT raise the threshold; investigate the regression.
const WALL_CLOCK_BUDGET_MS = 500;

const SKIP_PERF = process.env.CI === 'true' || process.env.SKIP_PERF === 'true';

/** Build a synthetic silhouette source (opaque black filled circle on a
 *  transparent background, mimicking a typical built-in template SVG once
 *  rasterised). Returned at 1024² — the canonical template asset size. */
function makeBlackCircleSource(side: number): ImageData {
  const data = new Uint8ClampedArray(side * side * 4);
  const cx = (side - 1) / 2;
  const cy = (side - 1) / 2;
  // Radius leaves a small margin so the silhouette doesn't touch the edges.
  const radius = side * 0.45;
  const r2 = radius * radius;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const idx = (y * side + x) * 4;
      if (dx * dx + dy * dy <= r2) {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 255;
      } else {
        // Transparent — matches the typical PNG/SVG template asset shape.
        data[idx + 3] = 0;
      }
    }
  }
  return new ImageData(data, side, side);
}

/** Run the full V10 halftone-mono pipeline once. Mirrors `useQrPipeline`'s
 *  buildQr stage order verbatim (minus the React state plumbing and the
 *  scan-verify step, which is not part of the perf-budgeted hot path). */
function runV10Pipeline(url: string, source: ImageData): { width: number } {
  const matrix = buildMatrix(url);
  const target = computeHalftoneTarget(source, matrix.size, matrix.reserved, 1);
  const predicted = buildPredictedCanvas(source, matrix, 0, 1, 'halftone', 'mono');
  const { best } = pickBestMask(url, target, predicted);
  const samplingContext = buildSamplingContext(predicted, best.matrix);
  const { matrix: flipped } = flipModulesByCodeword(best.matrix, target, {
    samplingContext,
  });
  const canvas = renderHalftone(flipped, predicted, source, {
    marginPx: 0,
    silhouetteScale: 1,
    filter: 'mono',
  });
  return { width: canvas.width };
}

/** Sorted-array median. */
function median(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

describe.skipIf(SKIP_PERF)('pipeline perf regression — V10 halftone-mono', () => {
  it(
    `median wall-clock over ${ITERATIONS} iterations stays under ${WALL_CLOCK_BUDGET_MS} ms`,
    () => {
      // Sanity: the chosen URL lands in V10. If a future qrcode version
      // changes the version-selection thresholds, this assertion catches it
      // before the timing assertion fires with a confusing message.
      const matrix = buildMatrix(V10_URL);
      expect(matrix.size).toBe(V10_MATRIX_SIZE);

      const source = makeBlackCircleSource(1024);

      const samples: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        const { width } = runV10Pipeline(V10_URL, source);
        const elapsed = performance.now() - start;
        // Defensive: ensure the pipeline actually produced a sized canvas
        // (catches a no-op pipeline that would trivially pass the budget).
        expect(width).toBeGreaterThan(0);
        samples.push(elapsed);
      }

      const med = median(samples);
      const min = Math.min(...samples);
      const max = Math.max(...samples);
      // Surface timings on success too — useful when triaging future
      // regressions from CI logs / local runs.
      console.log(
        `[perf] V10 halftone-mono pipeline: median=${med.toFixed(1)} ms ` +
          `min=${min.toFixed(1)} ms max=${max.toFixed(1)} ms ` +
          `(n=${ITERATIONS}, budget=${WALL_CLOCK_BUDGET_MS} ms)`,
      );

      expect(med).toBeLessThan(WALL_CLOCK_BUDGET_MS);
    },
    // Vitest test-level timeout: budget × iterations + slack for warm-up.
    // Keeps the test from hanging if the pipeline gets pathologically slow.
    WALL_CLOCK_BUDGET_MS * ITERATIONS * 4,
  );
});
