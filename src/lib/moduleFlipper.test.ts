import { describe, it, expect } from 'vitest';
import { buildMatrix } from './qrMatrix';
import { computeHalftoneTarget } from './halftoneTarget';
import { pickBestMask } from './maskOptimizer';
import { flipModulesByCodeword } from './moduleFlipper';
import { getEccLayoutForH } from './codewordLayout';
import { buildPredictedCanvas } from './predictedCanvas';
import { buildSamplingContext } from './samplingSim';
import type { QRMatrix } from '../types';

function silhouetteImageData(w: number, h: number, radiusFactor = 0.4): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * radiusFactor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
      }
    }
  }
  return new ImageData(data, w, h);
}

function cloneMatrix(m: QRMatrix): QRMatrix {
  return {
    size: m.size,
    reserved: new Uint8Array(m.reserved),
    modules: m.modules.map((row) => row.slice()),
  };
}

describe('flipModulesByCodeword', () => {
  const text = 'https://www.instagram.com/ntu_astro/';

  it('does nothing when target perfectly matches the QR (delta 0 everywhere)', () => {
    const matrix = buildMatrix(text);
    const layout = getEccLayoutForH(matrix.size);
    const source = silhouetteImageData(64, 64);
    const target = {
      size: matrix.size,
      target: matrix.modules.map((row) => [...row]),
      importance: Array.from({ length: matrix.size }, (_, y) =>
        Array.from({ length: matrix.size }, (_, x) =>
          matrix.reserved[y * matrix.size + x] === 1 ? 0 : 1,
        ),
      ),
    };
    const predicted = buildPredictedCanvas(source, matrix, 0, 1, 'halftone', 'mono');
    const matCopy = cloneMatrix(matrix);
    const ctx = buildSamplingContext(predicted, matCopy);
    const { report } = flipModulesByCodeword(matCopy, target, { samplingContext: ctx });
    expect(report.modulesChanged).toBe(0);
    expect(report.flipsPerBlock).toEqual(new Array(layout.ecTotalBlocks).fill(0));
    // matrix bits unchanged
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) {
        expect(matCopy.modules[y][x]).toBe(matrix.modules[y][x]);
      }
    }
  });

  it('respects the per-block flip budget', () => {
    const baseMatrix = buildMatrix(text);
    const source = silhouetteImageData(256, 256);
    const target = computeHalftoneTarget(source, baseMatrix.size, baseMatrix.reserved);
    const predicted = buildPredictedCanvas(source, baseMatrix, 0, 1, 'halftone', 'mono');
    const matrix = pickBestMask(text, target, predicted).best.matrix;
    const layout = getEccLayoutForH(matrix.size);

    const ctx = buildSamplingContext(predicted, matrix);
    const { report } = flipModulesByCodeword(matrix, target, {
      budgetRatio: 0.30,
      samplingContext: ctx,
    });

    expect(report.perBlockBudget).toBe(Math.floor(0.30 * layout.ecCount));
    expect(report.policy.kind).toBe('fixed');
    for (const flips of report.flipsPerBlock) {
      expect(flips).toBeLessThanOrEqual(report.perBlockBudget);
      expect(flips).toBeGreaterThanOrEqual(0);
    }
  });

  it('probabilistic policy with failureTolerance=0 produces zero flips', () => {
    const baseMatrix = buildMatrix(text);
    const source = silhouetteImageData(256, 256);
    const target = computeHalftoneTarget(source, baseMatrix.size, baseMatrix.reserved);
    const predicted = buildPredictedCanvas(source, baseMatrix, 0, 1, 'halftone', 'mono');
    const matrix = pickBestMask(text, target, predicted).best.matrix;
    const ctx = buildSamplingContext(predicted, matrix);
    const { report } = flipModulesByCodeword(matrix, target, {
      samplingContext: ctx,
      policy: { kind: 'probabilistic', failureTolerance: 0 },
    });
    expect(report.modulesChanged).toBe(0);
    for (const flips of report.flipsPerBlock) expect(flips).toBe(0);
  });

  it('reduces sampling-sim total score', () => {
    const baseMatrix = buildMatrix(text);
    const source = silhouetteImageData(256, 256);
    const target = computeHalftoneTarget(source, baseMatrix.size, baseMatrix.reserved);
    const predicted = buildPredictedCanvas(source, baseMatrix, 0, 1, 'halftone', 'mono');
    const matrix = pickBestMask(text, target, predicted).best.matrix;

    // Score before: build a fresh sampling context for the un-flipped matrix.
    const ctxBefore = buildSamplingContext(predicted, cloneMatrix(matrix));
    let scoreBefore = 0;
    for (let my = 0; my < matrix.size; my++) {
      for (let mx = 0; mx < matrix.size; mx++) {
        const w = target.importance[my][mx];
        if (w === 0) continue;
        const tval = target.target[my][mx] ? 0 : 1;
        scoreBefore += w * Math.abs(ctxBefore.readback[my * matrix.size + mx] - tval);
      }
    }

    const ctx = buildSamplingContext(predicted, matrix);
    flipModulesByCodeword(matrix, target, { samplingContext: ctx });

    // ctx.readback now reflects the post-flip state (applyModuleFlip mutated
    // it during the flip loop).
    let scoreAfter = 0;
    for (let my = 0; my < matrix.size; my++) {
      for (let mx = 0; mx < matrix.size; mx++) {
        const w = target.importance[my][mx];
        if (w === 0) continue;
        const tval = target.target[my][mx] ? 0 : 1;
        scoreAfter += w * Math.abs(ctx.readback[my * matrix.size + mx] - tval);
      }
    }

    expect(scoreAfter).toBeLessThan(scoreBefore);
  });
});
