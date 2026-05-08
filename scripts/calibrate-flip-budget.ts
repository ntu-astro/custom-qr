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
 * Note: this script uses jsdom + the `canvas` package to provide a browser-
 * like environment in Node so the renderer (which expects `document`,
 * `HTMLCanvasElement`, `ImageData`, etc.) can run unchanged.
 *
 * Calibration corpus: per spec §9 it runs against pre-Sampling-Sim flips so
 * the model captures decode behaviour, not optimiser bias. We pick random
 * codewords per RS block and flip every module in those codewords (bit
 * inversion, NOT alignment with the dithered target) — this isolates "did
 * this flip break the QR" from "did the optimiser pick the right flips".
 */

// ---------------------------------------------------------------------------
// jsdom + node-canvas browser polyfill (must run before any pipeline import).
// ---------------------------------------------------------------------------

import { JSDOM } from 'jsdom';
import {
  Canvas as NodeCanvas,
  Image as NodeImage,
  ImageData as NodeImageData,
} from 'canvas';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  pretendToBeVisual: true,
});

// Some properties on globalThis (e.g. `navigator` in modern Node) are
// non-writable getters. Use defineProperty so we can install our shims even
// when a default is in place. Skip read-only collisions silently — the
// renderers don't actually consult navigator.
function defineGlobal(name: string, value: unknown): void {
  try {
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Property is non-configurable on this Node version — leave the existing
    // value in place. The renderer doesn't depend on this global.
  }
}

defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('HTMLCanvasElement', dom.window.HTMLCanvasElement);
defineGlobal('HTMLImageElement', dom.window.HTMLImageElement);
defineGlobal('Image', NodeImage);
defineGlobal('ImageData', NodeImageData);

// Patch document.createElement('canvas') so it returns a node-canvas-backed
// element. jsdom's canvas implementation is a stub unless we delegate to the
// `canvas` package (same pattern node-canvas uses with jsdom in tests).
const origCreateElement = dom.window.document.createElement.bind(dom.window.document);
(dom.window.document.createElement as unknown) = function patchedCreateElement(
  tagName: string,
  options?: ElementCreationOptions,
) {
  if (tagName.toLowerCase() === 'canvas') {
    const canvas = new NodeCanvas(300, 150) as unknown as HTMLCanvasElement;
    return canvas;
  }
  return origCreateElement(tagName, options);
};

// ---------------------------------------------------------------------------
// Imports — only after the DOM polyfills are in place.
// ---------------------------------------------------------------------------

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildMatrix } from '../src/lib/qrMatrix';
import { buildPredictedCanvas } from '../src/lib/predictedCanvas';
import { buildSamplingContext } from '../src/lib/samplingSim';
import { extractFeatures, buildFinderDistanceMap } from '../src/lib/flipBudget';
import {
  getEccLayoutForH,
  buildModuleStreamMap,
  buildStreamIndexToBlockTable,
} from '../src/lib/codewordLayout';
import { render as renderHalftone } from '../src/lib/halftoneRenderer';
import { render as renderComposite } from '../src/lib/compositeRenderer';
import { verify } from '../src/lib/scanVerifier';
import type { QRMatrix, FilterMode, RenderMode, RenderOptions } from '../src/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Logistic regression / AUC (unchanged from scaffold)
// ---------------------------------------------------------------------------

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** Vanilla logistic-regression fit via batch gradient descent. */
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

/** Trapezoidal AUC (ROC area). */
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

// ---------------------------------------------------------------------------
// Corpus generation
// ---------------------------------------------------------------------------

/** Seeded PRNG for reproducible corpus runs. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** URL lengths that target V5 (37), V10 (57), V15 (77) at ECC-H, derived
 *  empirically (see `_check_versions.ts` helper). */
const TARGET_VERSIONS: Array<{ version: number; url: string }> = [
  { version: 5, url: 'https://x.io/' + 'a'.repeat(43 - 13) }, // total 43 chars → V5
  { version: 10, url: 'https://x.io/' + 'a'.repeat(110 - 13) }, // → V10
  { version: 15, url: 'https://x.io/' + 'a'.repeat(200 - 13) }, // → V15
];

const RENDER_MODES: RenderMode[] = ['halftone', 'composite'];
const FILTER_MODES: FilterMode[] = ['mono', 'color'];

const FLIP_BUCKETS: number[] = [0, 0.10, 0.20, 0.30, 0.40];

const SOURCE_SIZE = 256;

/** Build two synthetic "templates" so calibration covers a range of source
 *  shapes without filesystem fetches. (1) A black silhouette circle on
 *  transparent background — proxy for the wordmark/constellation templates.
 *  (2) A diagonal greyscale gradient — proxy for a colourful uploaded photo.
 *  Both fit comfortably in the 1024² rasterisation pipeline; we synthesise at
 *  256² for speed (rasterizeSource scales internally). */
function buildSyntheticTemplates(): Array<{ id: string; data: ImageData }> {
  const w = SOURCE_SIZE, h = SOURCE_SIZE;
  // Template A: black silhouette circle on transparent.
  const a = new ImageData(w, h);
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) * 0.42;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      if (inside) {
        a.data[idx] = 33; a.data[idx + 1] = 25; a.data[idx + 2] = 34; a.data[idx + 3] = 255;
      } else {
        a.data[idx] = 0; a.data[idx + 1] = 0; a.data[idx + 2] = 0; a.data[idx + 3] = 0;
      }
    }
  }
  // Template B: opaque red→blue diagonal gradient (proxy for a colourful photo).
  const b = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const t = (x + y) / (w + h);
      b.data[idx] = Math.round(220 * (1 - t) + 30 * t);
      b.data[idx + 1] = 40;
      b.data[idx + 2] = Math.round(30 * (1 - t) + 200 * t);
      b.data[idx + 3] = 255;
    }
  }
  return [
    { id: 'silhouette', data: a },
    { id: 'gradient', data: b },
  ];
}

function cloneMatrix(m: QRMatrix): QRMatrix {
  return {
    size: m.size,
    modules: m.modules.map((row) => row.slice()),
    reserved: new Uint8Array(m.reserved),
  };
}

interface FlipPlan {
  /** Module positions to flip (post-flip the matrix module bit is inverted). */
  modules: Array<{ x: number; y: number }>;
  /** Mapping each flipped module → block index, for per-block decode-outcome
   *  labelling. */
  blockByModule: Map<number, number>;
}

/** Choose `bucketRatio × ecCount` codewords per RS block, uniformly at random
 *  from the codewords whose modules are entirely non-reserved data. Returns
 *  the union of all module positions to flip, plus the (idx → block) lookup
 *  used at labelling time.
 *
 *  Module index key: `y * size + x`. */
function planRandomCodewordFlips(
  matrix: QRMatrix,
  bucketRatio: number,
  rng: () => number,
): FlipPlan {
  const size = matrix.size;
  const layout = getEccLayoutForH(size);
  const cwTable = buildStreamIndexToBlockTable(layout);
  const moduleMap = buildModuleStreamMap(matrix);

  // Group modules by codeword.
  const modulesByCodeword: Array<Array<{ x: number; y: number }>> = Array.from(
    { length: layout.totalCodewords },
    () => [],
  );
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pos = moduleMap[y][x];
      if (pos === null) continue;
      modulesByCodeword[pos.streamIdx].push({ x, y });
    }
  }

  // Group codewords by block.
  const codewordsByBlock: number[][] = Array.from({ length: layout.ecTotalBlocks }, () => []);
  for (let i = 0; i < layout.totalCodewords; i++) {
    if (modulesByCodeword[i].length === 0) continue;
    codewordsByBlock[cwTable[i].block].push(i);
  }

  // Per-block: pick floor(ratio * ecCount) codewords randomly (Fisher-Yates).
  const flipModules: Array<{ x: number; y: number }> = [];
  const blockByModule = new Map<number, number>();
  const target = Math.floor(bucketRatio * layout.ecCount);
  for (let b = 0; b < layout.ecTotalBlocks; b++) {
    const cws = codewordsByBlock[b].slice();
    // Fisher-Yates shuffle.
    for (let i = cws.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cws[i], cws[j]] = [cws[j], cws[i]];
    }
    const pick = Math.min(target, cws.length);
    for (let i = 0; i < pick; i++) {
      const cwIdx = cws[i];
      for (const m of modulesByCodeword[cwIdx]) {
        flipModules.push(m);
        blockByModule.set(m.y * size + m.x, b);
      }
    }
  }

  return { modules: flipModules, blockByModule };
}

/** Apply the planned flips in place: invert each listed module's bit. */
function applyFlipPlan(matrix: QRMatrix, plan: FlipPlan): void {
  for (const { x, y } of plan.modules) {
    matrix.modules[y][x] = !matrix.modules[y][x];
  }
}

interface CorpusCase {
  caseLabel: string;
  matrix: QRMatrix;
  source: ImageData;
  renderMode: RenderMode;
  filter: FilterMode;
  bucketRatio: number;
}

function renderCase(
  matrix: QRMatrix,
  source: ImageData,
  renderMode: RenderMode,
  filter: FilterMode,
): HTMLCanvasElement {
  const marginCells = 4;
  const opts: RenderOptions = { marginPx: marginCells * 18, filter, silhouetteScale: 1 };
  const predicted = buildPredictedCanvas(source, matrix, marginCells, 1, renderMode, filter);
  if (renderMode === 'halftone') {
    return renderHalftone(matrix, predicted, source, opts);
  }
  return renderComposite(matrix, predicted, opts);
}

function processCase(
  caseInfo: CorpusCase,
  rng: () => number,
  finderDistanceMap: Float32Array,
): Sample[] {
  const { matrix: baseMatrix, source, renderMode, filter, bucketRatio } = caseInfo;
  const matrix = cloneMatrix(baseMatrix);
  const plan = planRandomCodewordFlips(matrix, bucketRatio, rng);
  applyFlipPlan(matrix, plan);

  // Render the post-flip canvas.
  const canvas = renderCase(matrix, source, renderMode, filter);

  // Decode at native + 200; conservative read: failure if EITHER fails.
  const sizes = [canvas.width, 200];
  const results = verify(canvas, sizes);
  const blockFailed = !results[0].ok || !results[1].ok;

  // Build the post-flip predicted canvas + sampling context for feature
  // extraction. Note: must be built against the post-flip matrix so the
  // centre-subpixel votes match the rendered canvas.
  const predicted = buildPredictedCanvas(source, matrix, 4, 1, renderMode, filter);
  const ctx = buildSamplingContext(predicted, matrix);

  // Feature extraction expects a finderDistanceMap sized for this matrix.
  const expectedMapSize = matrix.size * matrix.size;
  const fdMap = finderDistanceMap.length === expectedMapSize
    ? finderDistanceMap
    : buildFinderDistanceMap(matrix.size);

  // Per-flipped-module sample. All flipped modules share the same per-block
  // outcome (whole-canvas decode is the conservative read; per-block decoding
  // requires a private RS pass that jsqr does not expose).
  const samples: Sample[] = [];
  for (const { x, y } of plan.modules) {
    const features = extractFeatures(ctx, x, y, fdMap);
    samples.push({
      surroundContrast: features.surroundContrast,
      centreCorrelation: features.centreCorrelation,
      finderDistance: features.finderDistance,
      failed: blockFailed ? 1 : 0,
    });
  }
  return samples;
}

function generateCorpus(): Sample[] {
  const rng = mulberry32(0xcafebabe);
  const templates = buildSyntheticTemplates();
  const baseMatrices: Array<{ version: number; matrix: QRMatrix }> = TARGET_VERSIONS.map(({ version, url }) => {
    const matrix = buildMatrix(url);
    const observedVersion = (matrix.size - 17) / 4;
    if (observedVersion !== version) {
      console.warn(`Expected V${version}, got V${observedVersion} for url len ${url.length} — using as-is.`);
    }
    return { version: observedVersion, matrix };
  });

  // Pre-build per-version finderDistanceMap to amortise.
  const fdMaps = new Map<number, Float32Array>();
  for (const { matrix } of baseMatrices) {
    if (!fdMaps.has(matrix.size)) fdMaps.set(matrix.size, buildFinderDistanceMap(matrix.size));
  }

  const samples: Sample[] = [];
  let casesProcessed = 0;
  let casesSkipped = 0;
  let nFailed = 0, nOk = 0;
  for (const { matrix } of baseMatrices) {
    const fdMap = fdMaps.get(matrix.size)!;
    for (const renderMode of RENDER_MODES) {
      for (const filter of FILTER_MODES) {
        for (const tpl of templates) {
          for (const bucketRatio of FLIP_BUCKETS) {
            const caseLabel = `V${(matrix.size - 17) / 4} ${renderMode}/${filter} ${tpl.id} bucket=${bucketRatio}`;
            try {
              const caseSamples = processCase(
                { caseLabel, matrix, source: tpl.data, renderMode, filter, bucketRatio },
                rng,
                fdMap,
              );
              samples.push(...caseSamples);
              casesProcessed++;
              if (caseSamples.length > 0) {
                if (caseSamples[0].failed === 1) nFailed++;
                else nOk++;
              }
              if (casesProcessed % 12 === 0) {
                console.log(`  processed ${casesProcessed}/120 — pooled samples: ${samples.length}`);
              }
            } catch (err) {
              casesSkipped++;
              console.warn(`  skipped ${caseLabel}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
      }
    }
  }
  console.log(`Corpus: ${casesProcessed} cases processed, ${casesSkipped} skipped`);
  console.log(`Per-case decode outcomes (cases with at least one flip): failed=${nFailed}, ok=${nOk}`);
  return samples;
}

// ---------------------------------------------------------------------------
// Emitter (unchanged)
// ---------------------------------------------------------------------------

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
    console.warn('Corpus is empty. Writing zero coefficients with DEFAULT_FAILURE_TOLERANCE=1.0 — ART-UP will fall back to fixed-budget policy at runtime.');
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
