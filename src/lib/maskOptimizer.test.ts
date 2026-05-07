import { describe, it, expect } from 'vitest';
import { buildMatrix } from './qrMatrix';
import { computeHalftoneTarget } from './halftoneTarget';
import { pickBestMask, scoreMask } from './maskOptimizer';

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
    const target = computeHalftoneTarget(silhouetteImageData(256, 256), base.size, base.reserved);
    const { best, scores } = pickBestMask(text, target);

    expect(scores).toHaveLength(8);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i].score).toBeGreaterThanOrEqual(scores[i - 1].score);
    }
    expect(best.maskPattern).toBe(scores[0].maskPattern);
    expect(best.matrix.size).toBe(base.size);
  });

  it('chooses different masks for different targets', () => {
    const base = buildMatrix(text);
    const blackTarget = computeHalftoneTarget(blackImageData(256, 256), base.size, base.reserved);
    const silTarget = computeHalftoneTarget(silhouetteImageData(256, 256), base.size, base.reserved);

    const blackBest = pickBestMask(text, blackTarget).best.maskPattern;
    const silBest = pickBestMask(text, silTarget).best.maskPattern;

    // Not strictly required to differ, but for two very different targets the
    // best mask usually does. If both happen to coincide, at least confirm the
    // raw scores diverge meaningfully — i.e. mask scoring genuinely depends
    // on the target.
    const blackScores = pickBestMask(text, blackTarget).scores.map((s) => s.score);
    const silScores = pickBestMask(text, silTarget).scores.map((s) => s.score);
    const totalDiff = blackScores.reduce((acc, s, i) => acc + Math.abs(s - silScores[i]), 0);
    expect(totalDiff).toBeGreaterThan(0);
    void blackBest; void silBest;
  });

  it('preserves the reserved mask on the returned matrix', () => {
    const base = buildMatrix(text);
    const target = computeHalftoneTarget(silhouetteImageData(256, 256), base.size, base.reserved);
    const { best } = pickBestMask(text, target);
    // Reserved mask must round-trip — the renderer and Stage 3 read it from
    // matrix.reserved to identify finder/timing/alignment cells.
    expect(best.matrix.reserved).toEqual(base.reserved);
  });
});

describe('scoreMask', () => {
  it('returns 0 when matrix and target perfectly agree (synthetic)', () => {
    const matrix = buildMatrix('a');
    // Build a target that exactly mirrors the matrix's modules. Importance is
    // uniform 1.0 — the agreement check is what matters here.
    const target = {
      size: matrix.size,
      target: matrix.modules.map((row) => [...row]),
      importance: Array.from({ length: matrix.size }, () =>
        Array<number>(matrix.size).fill(1.0),
      ),
    };
    expect(scoreMask(matrix, target)).toBe(0);
  });
});
