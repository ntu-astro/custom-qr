import { describe, it, expect } from 'vitest';
import { render } from './halftoneRenderer';
import { buildMatrix } from './qrMatrix';

function blackImageData(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
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

describe('render — hybrid', () => {
  const matrix = buildMatrix('https://ntuastro.com');

  it('produces a square canvas sized for the matrix plus margin', () => {
    const canvas = render(matrix, blackImageData(512, 512), {
      style: 'hybrid',
      density: 55,
      marginPx: 32,
      background: 'transparent',
    });
    expect(canvas.width).toBe(canvas.height);
    expect(canvas.width).toBeGreaterThanOrEqual(matrix.size + 2 * 4);
  });

  it('preserves dark data modules: a known dark module pixel is dark', () => {
    const canvas = render(matrix, whiteImageData(512, 512), {
      style: 'hybrid',
      density: 55,
      marginPx: 0,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    // Top-left finder: every module 0..6 in both axes is dark.
    const cellPx = canvas.width / matrix.size;
    const cx = Math.floor(cellPx * 0.5);
    const cy = Math.floor(cellPx * 0.5);
    const px = ctx.getImageData(cx, cy, 1, 1).data;
    const lum = (px[0] + px[1] + px[2]) / 3;
    expect(lum).toBeLessThan(80);
  });

  it('renders sparse dots in non-data positions when source is light', () => {
    const canvas = render(matrix, whiteImageData(512, 512), {
      style: 'hybrid',
      density: 55,
      marginPx: 16,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    const px = ctx.getImageData(2, 2, 1, 1).data;
    expect(px[0]).toBeGreaterThan(200);
  });
});
