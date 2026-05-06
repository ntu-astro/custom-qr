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

function nearlyWhite(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 250; data[i + 1] = 250; data[i + 2] = 250; data[i + 3] = 255;
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

describe('render — variable', () => {
  const matrix = buildMatrix('https://ntuastro.com');

  it('keeps dark data modules visibly filled even when source is bright', () => {
    const canvas = render(matrix, nearlyWhite(256, 256), {
      style: 'variable',
      density: 55,
      marginPx: 0,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    const cx = Math.floor(cellPx * 0.5);
    const cy = Math.floor(cellPx * 0.5);
    const px = ctx.getImageData(cx, cy, 1, 1).data;
    const lum = (px[0] + px[1] + px[2]) / 3;
    expect(lum).toBeLessThan(120);
  });
});

describe('render — stippling', () => {
  const matrix = buildMatrix('https://ntuastro.com');

  it('produces uniform-size stipples in dark source areas', () => {
    const canvas = render(matrix, blackImageData(256, 256), {
      style: 'stippling',
      density: 70,
      marginPx: 16,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    const block = ctx.getImageData(0, 0, 16, 16).data;
    let sum = 0;
    for (let i = 0; i < block.length; i += 4) sum += (block[i] + block[i + 1] + block[i + 2]) / 3;
    const avg = sum / (16 * 16);
    expect(avg).toBeLessThan(220);
  });
});

describe('render — qrgrid', () => {
  const matrix = buildMatrix('https://ntuastro.com');

  it('renders cells as solid blocks (no sub-cell halftone)', () => {
    const canvas = render(matrix, blackImageData(256, 256), {
      style: 'qrgrid',
      density: 50,
      marginPx: 0,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    const a = ctx.getImageData(2, 2, 1, 1).data;
    const b = ctx.getImageData(Math.floor(cellPx) - 2, Math.floor(cellPx) - 2, 1, 1).data;
    expect(a[0]).toBe(b[0]);
    expect(a[1]).toBe(b[1]);
    expect(a[2]).toBe(b[2]);
  });
});

describe('render — reserved-cell suppression', () => {
  const matrix = buildMatrix('https://ntuastro.com');

  // The top-left finder pattern occupies modules (0..6, 0..6). Inside it, the white
  // ring at module (1, 3) is BOTH structurally reserved AND a light cell. Without
  // suppression, a fully-black source image at high density would fill that ring
  // with halftone dots and merge it with adjacent dark cells, breaking the finder.
  it('keeps reserved-but-light cells as background under a dark source (hybrid)', () => {
    expect(matrix.reservedMask[3][1]).toBe(true);
    expect(matrix.modules[3][1]).toBe(false);

    const canvas = render(matrix, blackImageData(256, 256), {
      style: 'hybrid',
      density: 80,
      marginPx: 0,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    // Sample the centre of module (1, 3) — column 1, row 3.
    const cx = Math.floor(cellPx * 1.5);
    const cy = Math.floor(cellPx * 3.5);
    const px = ctx.getImageData(cx, cy, 1, 1).data;
    const lum = (px[0] + px[1] + px[2]) / 3;
    expect(lum).toBeGreaterThan(200);
  });

  it('keeps reserved-but-light cells as background under a dark source (qrgrid)', () => {
    const canvas = render(matrix, blackImageData(256, 256), {
      style: 'qrgrid',
      density: 80,
      marginPx: 0,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    const cx = Math.floor(cellPx * 1.5);
    const cy = Math.floor(cellPx * 3.5);
    const px = ctx.getImageData(cx, cy, 1, 1).data;
    const lum = (px[0] + px[1] + px[2]) / 3;
    expect(lum).toBeGreaterThan(200);
  });
});
