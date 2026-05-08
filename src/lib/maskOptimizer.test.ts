import { describe, it, expect } from 'vitest';
import { buildMatrix } from './qrMatrix';
import { computeHalftoneTarget } from './halftoneTarget';
import { pickBestMask, scoreMask } from './maskOptimizer';
import { buildPredictedCanvas } from './predictedCanvas';

function blackImageData(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
  }
  return new ImageData(data, w, h);
}

function silhouetteImageData(w: number, h: number): ImageData {
  // Black filled circle in the centre, transparent elsewhere — a silhouette.
  const data = new Uint8ClampedArray(w * h * 4);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.4;
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

describe('pickBestMask', () => {
  const text = 'https://www.instagram.com/ntu_astro/';

  it('returns 8 scored masks, sorted ascending by score', () => {
    const base = buildMatrix(text);
    const source = silhouetteImageData(256, 256);
    const target = computeHalftoneTarget(source, base.size, base.reserved);
    const predicted = buildPredictedCanvas(source, base, 0, 1, 'halftone', 'mono');
    const { best, scores } = pickBestMask(text, target, predicted);

    expect(scores).toHaveLength(8);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i].score).toBeGreaterThanOrEqual(scores[i - 1].score);
    }
    expect(best.maskPattern).toBe(scores[0].maskPattern);
    expect(best.matrix.size).toBe(base.size);
  });

  it('mask scores depend on the target — different targets produce different score vectors', () => {
    const base = buildMatrix(text);
    const blackSrc = blackImageData(256, 256);
    const silSrc = silhouetteImageData(256, 256);
    const blackTarget = computeHalftoneTarget(blackSrc, base.size, base.reserved);
    const silTarget = computeHalftoneTarget(silSrc, base.size, base.reserved);
    const blackPred = buildPredictedCanvas(blackSrc, base, 0, 1, 'halftone', 'mono');
    const silPred = buildPredictedCanvas(silSrc, base, 0, 1, 'halftone', 'mono');

    const blackScores = pickBestMask(text, blackTarget, blackPred).scores.map((s) => s.score);
    const silScores = pickBestMask(text, silTarget, silPred).scores.map((s) => s.score);
    const totalDiff = blackScores.reduce((acc, s, i) => acc + Math.abs(s - silScores[i]), 0);
    expect(totalDiff).toBeGreaterThan(0);
  });

  it('preserves the reserved mask on the returned matrix', () => {
    const base = buildMatrix(text);
    const source = silhouetteImageData(256, 256);
    const target = computeHalftoneTarget(source, base.size, base.reserved);
    const predicted = buildPredictedCanvas(source, base, 0, 1, 'halftone', 'mono');
    const { best } = pickBestMask(text, target, predicted);
    // Reserved mask must round-trip — the renderer and Stage 3 read it from
    // matrix.reserved to identify finder/timing/alignment cells.
    expect(best.matrix.reserved).toEqual(base.reserved);
  });
});

describe('scoreMask', () => {
  it('returns a finite, non-negative number for a representative input', () => {
    const text = 'a';
    const matrix = buildMatrix(text);
    const source = blackImageData(64, 64);
    const target = computeHalftoneTarget(source, matrix.size, matrix.reserved);
    const predicted = buildPredictedCanvas(source, matrix, 0, 1, 'halftone', 'mono');
    const score = scoreMask(matrix, target, predicted);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
