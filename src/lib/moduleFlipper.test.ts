import { describe, it, expect } from 'vitest';
import { buildMatrix } from './qrMatrix';
import { computeHalftoneTarget } from './halftoneTarget';
import { pickBestMask } from './maskOptimizer';
import { flipModulesByCodeword } from './moduleFlipper';
import { getEccLayoutForH } from './codewordLayout';

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

function whiteImageData(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0;
  }
  return new ImageData(data, w, h);
}

describe('flipModulesByCodeword', () => {
  const text = 'https://ntuastro.com';

  it('does nothing when target perfectly matches the QR (score 0 everywhere)', () => {
    const matrix = buildMatrix(text);
    const layout = getEccLayoutForH(matrix.size);
    const target = {
      size: matrix.size,
      target: matrix.modules.map((row) => [...row]),
      importance: matrix.importance.map((row) => [...row]),
    };
    const { matrix: result, report } = flipModulesByCodeword(matrix, target);
    expect(report.modulesChanged).toBe(0);
    expect(report.flipsPerBlock).toEqual(new Array(layout.ecTotalBlocks).fill(0));
    // matrix bits unchanged
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) {
        expect(result.modules[y][x]).toBe(matrix.modules[y][x]);
      }
    }
  });

  it('respects the per-block flip budget', () => {
    const baseMatrix = buildMatrix(text);
    const target = computeHalftoneTarget(
      silhouetteImageData(256, 256), baseMatrix.size, '#ffffff', baseMatrix.importance,
    );
    const matrix = pickBestMask(text, target).best.matrix;
    const layout = getEccLayoutForH(matrix.size);

    const { report } = flipModulesByCodeword(matrix, target, { budgetRatio: 0.30 });

    expect(report.perBlockBudget).toBe(Math.floor(0.30 * layout.ecCount));
    for (const flips of report.flipsPerBlock) {
      expect(flips).toBeLessThanOrEqual(report.perBlockBudget);
      expect(flips).toBeGreaterThanOrEqual(0);
    }
  });

  it('reduces matrix-vs-target disagreement (importance-weighted)', () => {
    const baseMatrix = buildMatrix(text);
    const target = computeHalftoneTarget(
      silhouetteImageData(256, 256), baseMatrix.size, '#ffffff', baseMatrix.importance,
    );
    const matrix = pickBestMask(text, target).best.matrix;

    function disagreement(m: typeof matrix.modules): number {
      let score = 0;
      for (let y = 0; y < matrix.size; y++) {
        for (let x = 0; x < matrix.size; x++) {
          const w = target.importance[y][x];
          if (w === 0) continue;
          if (m[y][x] !== target.target[y][x]) score += w;
        }
      }
      return score;
    }

    const before = disagreement(matrix.modules);
    const { matrix: flipped } = flipModulesByCodeword(matrix, target);
    const after = disagreement(flipped.modules);
    expect(after).toBeLessThan(before);
  });

  it('still produces a scannable QR after flips (silhouette source)', async () => {
    const { verify } = await import('./scanVerifier');
    const { render } = await import('./halftoneRenderer');
    const baseMatrix = buildMatrix(text);
    const source = silhouetteImageData(256, 256);
    const target = computeHalftoneTarget(source, baseMatrix.size, '#ffffff', baseMatrix.importance);
    const masked = pickBestMask(text, target).best.matrix;
    const { matrix } = flipModulesByCodeword(masked, target);

    const canvas = render(matrix, source, { marginPx: 32, background: '#ffffff' });
    const results = verify(canvas, [canvas.width]);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe(text);
  });

  it('still produces a scannable QR after flips (white source — no silhouette)', async () => {
    const { verify } = await import('./scanVerifier');
    const { render } = await import('./halftoneRenderer');
    const baseMatrix = buildMatrix(text);
    const source = whiteImageData(256, 256);
    const target = computeHalftoneTarget(source, baseMatrix.size, '#ffffff', baseMatrix.importance);
    const masked = pickBestMask(text, target).best.matrix;
    const { matrix } = flipModulesByCodeword(masked, target);

    const canvas = render(matrix, source, { marginPx: 32, background: '#ffffff' });
    const results = verify(canvas, [canvas.width]);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe(text);
  });
});
