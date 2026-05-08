import { describe, it, expect } from 'vitest';
import {
  buildSamplingContext,
  scoreModuleAgainstTarget,
  applyModuleFlip,
  totalScore,
} from './samplingSim';
import { buildPredictedCanvas } from './predictedCanvas';
import { computeSilhouetteTarget } from './silhouetteTarget';
import { buildMatrix } from './qrMatrix';

function whiteImageData(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
  }
  return new ImageData(data, w, h);
}

function blackImageData(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
  }
  return new ImageData(data, w, h);
}

function buildContextFor(source: ImageData, url = 'https://www.instagram.com/ntu_astro/') {
  const matrix = buildMatrix(url);
  const predicted = buildPredictedCanvas(source, matrix, 0, 1, 'halftone', 'mono');
  return { matrix, predicted, ctx: buildSamplingContext(predicted, matrix) };
}

describe('buildSamplingContext', () => {
  it('readback values stay in [0, 1] for a halftone canvas', () => {
    const { ctx, matrix } = buildContextFor(whiteImageData(256, 256));
    for (let i = 0; i < ctx.readback.length; i++) {
      expect(ctx.readback[i]).toBeGreaterThanOrEqual(0);
      expect(ctx.readback[i]).toBeLessThanOrEqual(1);
    }
    expect(ctx.readback.length).toBe(matrix.size * matrix.size);
  });

  it('a dark module reads as low luma; a light module reads as high luma', () => {
    const { ctx, matrix } = buildContextFor(whiteImageData(256, 256));
    let darkSum = 0, darkCount = 0, lightSum = 0, lightCount = 0;
    for (let my = 0; my < matrix.size; my++) {
      for (let mx = 0; mx < matrix.size; mx++) {
        if (matrix.reserved[my * matrix.size + mx] === 1) continue;
        const v = ctx.readback[my * matrix.size + mx];
        if (matrix.modules[my][mx]) {
          darkSum += v; darkCount++;
        } else {
          lightSum += v; lightCount++;
        }
      }
    }
    expect(darkCount).toBeGreaterThan(0);
    expect(lightCount).toBeGreaterThan(0);
    const avgDark = darkSum / darkCount;
    const avgLight = lightSum / lightCount;
    // Dark modules should average measurably darker than light modules. With
    // a uniform-light source the surround subpixels are all ~1.0; only the
    // centre subpixel of dark modules drops to 0, so dark readback < light.
    expect(avgDark).toBeLessThan(avgLight);
  });
});

describe('totalScore', () => {
  it('returns a finite, non-negative number', () => {
    const source = whiteImageData(256, 256);
    const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');
    const target = computeSilhouetteTarget(source, matrix.size, matrix.reserved, 1);
    const predicted = buildPredictedCanvas(source, matrix, 0, 1, 'halftone', 'mono');
    const ctx = buildSamplingContext(predicted, matrix);
    const score = totalScore(ctx, target);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('scoreModuleAgainstTarget', () => {
  it('returns 0 for reserved modules (importance 0)', () => {
    const source = whiteImageData(256, 256);
    const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');
    const target = computeSilhouetteTarget(source, matrix.size, matrix.reserved, 1);
    const predicted = buildPredictedCanvas(source, matrix, 0, 1, 'halftone', 'mono');
    const ctx = buildSamplingContext(predicted, matrix);
    // (0, 0) is reserved (top-left finder corner).
    expect(matrix.reserved[0]).toBe(1);
    expect(scoreModuleAgainstTarget(ctx, target, 0, 0)).toBe(0);
  });
});

describe('applyModuleFlip', () => {
  it('flip-then-unflip restores the readback element-wise', () => {
    const source = whiteImageData(256, 256);
    const { matrix, predicted, ctx } = buildContextFor(source);
    const before = new Float32Array(ctx.readback);

    // Find a non-reserved module to flip.
    let target: [number, number] | null = null;
    for (let my = 0; my < matrix.size && !target; my++) {
      for (let mx = 0; mx < matrix.size && !target; mx++) {
        if (matrix.reserved[my * matrix.size + mx] === 0) target = [mx, my];
      }
    }
    expect(target).not.toBeNull();
    const [fx, fy] = target!;
    const original = matrix.modules[fy][fx];
    applyModuleFlip(ctx, fx, fy, !original);
    applyModuleFlip(ctx, fx, fy, original);
    for (let i = 0; i < before.length; i++) {
      expect(ctx.readback[i]).toBeCloseTo(before[i], 6);
    }
    // Predicted is borrowed (not cloned) — the underlying ImageData is back to
    // its initial state because the same module was unflipped.
    expect(predicted.width).toBeGreaterThan(0); // sanity reference
  });

  it('NON-NEGOTIABLE: incremental updates equal a full rebuild after 50 random flips', () => {
    const source = whiteImageData(256, 256);
    const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');
    const cloneMatrix = (m: typeof matrix) => ({
      size: m.size,
      reserved: new Uint8Array(m.reserved),
      modules: m.modules.map((row) => row.slice()),
    });

    const matA = cloneMatrix(matrix);
    const matB = cloneMatrix(matrix);
    const predA = buildPredictedCanvas(source, matA, 0, 1, 'halftone', 'mono');
    const predB = buildPredictedCanvas(source, matB, 0, 1, 'halftone', 'mono');

    const ctxA = buildSamplingContext(predA, matA);

    // Apply 50 random non-reserved flips to ctxA and mirror them on matB.
    const candidates: Array<[number, number]> = [];
    for (let my = 0; my < matrix.size; my++) {
      for (let mx = 0; mx < matrix.size; mx++) {
        if (matrix.reserved[my * matrix.size + mx] === 0) candidates.push([mx, my]);
      }
    }
    // Deterministic pick: first 50 candidates.
    for (let i = 0; i < 50 && i < candidates.length; i++) {
      const [mx, my] = candidates[i];
      const newVal = !matA.modules[my][mx];
      applyModuleFlip(ctxA, mx, my, newVal);
      matB.modules[my][mx] = newVal;
    }

    const ctxB = buildSamplingContext(predB, matB);

    // Element-wise equality (within float tolerance) — proves the incremental
    // recomputation visits the right set of affected modules.
    expect(ctxA.readback.length).toBe(ctxB.readback.length);
    for (let i = 0; i < ctxA.readback.length; i++) {
      expect(ctxA.readback[i]).toBeCloseTo(ctxB.readback[i], 5);
    }
  });

  it('rejects reserved-cell flips in dev mode', () => {
    const source = blackImageData(256, 256);
    const { matrix, ctx } = buildContextFor(source);
    // Find a reserved cell.
    let target: [number, number] | null = null;
    for (let my = 0; my < matrix.size && !target; my++) {
      for (let mx = 0; mx < matrix.size && !target; mx++) {
        if (matrix.reserved[my * matrix.size + mx] === 1) target = [mx, my];
      }
    }
    expect(target).not.toBeNull();
    const [mx, my] = target!;
    expect(() => applyModuleFlip(ctx, mx, my, !matrix.modules[my][mx])).toThrow();
  });
});
