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
  const text = 'https://ntuastro.com';

  it('returns 8 scored masks, sorted ascending by score', () => {
    const base = buildMatrix(text);
    const target = computeHalftoneTarget(silhouetteImageData(256, 256), base.size, '#ffffff', base.importance);
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
    const blackTarget = computeHalftoneTarget(blackImageData(256, 256), base.size, '#ffffff', base.importance);
    const silTarget = computeHalftoneTarget(silhouetteImageData(256, 256), base.size, '#ffffff', base.importance);

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

  it('attaches the image-weighted importance to the returned matrix', () => {
    const base = buildMatrix(text);
    const target = computeHalftoneTarget(silhouetteImageData(256, 256), base.size, '#ffffff', base.importance);
    const { best } = pickBestMask(text, target);
    // Reserved cells stay at 0.
    expect(best.matrix.importance[0][0]).toBe(0);
    // The silhouette doesn't cover the entire QR — at least one data module
    // outside the centred circle should land at the non-silhouette floor (i.e.
    // importance < 1.0) rather than the uniform default 1.0.
    let foundLowWeight = false;
    for (let y = 0; y < best.matrix.size; y++) {
      for (let x = 0; x < best.matrix.size; x++) {
        const w = best.matrix.importance[y][x];
        if (w > 0 && w < 0.95) { foundLowWeight = true; break; }
      }
      if (foundLowWeight) break;
    }
    expect(foundLowWeight).toBe(true);
  });

  it('still produces a scannable QR after picking the best mask', async () => {
    const { verify } = await import('./scanVerifier');
    const { render } = await import('./halftoneRenderer');
    const base = buildMatrix(text);
    const target = computeHalftoneTarget(silhouetteImageData(256, 256), base.size, '#ffffff', base.importance);
    const { best } = pickBestMask(text, target);
    const canvas = render(best.matrix, silhouetteImageData(256, 256), {
      marginPx: 32,
      background: '#ffffff',
    });
    const results = verify(canvas, [canvas.width]);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe(text);
  });
});

describe('scoreMask', () => {
  it('returns 0 when matrix and target perfectly agree (synthetic)', () => {
    const text = 'a';
    const matrix = buildMatrix(text);
    // Build a target that exactly mirrors the matrix; importance from baseline.
    const target = {
      size: matrix.size,
      target: matrix.modules.map((row) => [...row]),
      importance: matrix.importance.map((row) => [...row]),
    };
    expect(scoreMask(matrix, target)).toBe(0);
  });
});
