import { describe, it, expect } from 'vitest';
import { render } from './compositeRenderer';
import { buildPredictedCanvas } from './predictedCanvas';
import { buildMatrix } from './qrMatrix';
import type { FilterMode, RenderOptions } from '../types';

const CELL_PX = 18;

function whiteImageData(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0;
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

function colorImageData(w: number, h: number, r: number, g: number, b: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return new ImageData(data, w, h);
}

function renderComposite(source: ImageData, opts: RenderOptions): HTMLCanvasElement {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');
  const filter: FilterMode = opts.filter ?? 'mono';
  const marginCells = Math.max(0, Math.round(opts.marginPx / CELL_PX));
  const predicted = buildPredictedCanvas(
    source,
    matrix,
    marginCells,
    opts.silhouetteScale ?? 1,
    'composite',
    filter,
  );
  return render(matrix, predicted, opts);
}

describe('compositeRenderer.render', () => {
  it('produces a square canvas sized for the matrix plus margin', () => {
    const canvas = renderComposite(blackImageData(256, 256), { marginPx: 0, filter: 'mono' });
    expect(canvas.width).toBe(canvas.height);
    expect(canvas.width).toBeGreaterThan(0);
  });

  it('paints a centre subpixel for each non-reserved dark module under a bright source', () => {
    // Bright source → composite-mono surround paints white. The centre subpixel
    // of dark data modules should still read as STRUCTURAL_INK (dark).
    const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');
    const canvas = renderComposite(whiteImageData(256, 256), { marginPx: 0, filter: 'mono' });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    const subPx = cellPx / 3;

    // Find a non-reserved dark module.
    let target: [number, number] | null = null;
    for (let my = 9; my < matrix.size - 9 && !target; my++) {
      for (let mx = 9; mx < matrix.size - 9 && !target; mx++) {
        if (matrix.modules[my][mx] && matrix.reserved[my * matrix.size + mx] === 0) {
          target = [mx, my];
        }
      }
    }
    expect(target).not.toBeNull();
    const [mx, my] = target!;
    const ccx = Math.floor(mx * cellPx + subPx * 1.5);
    const ccy = Math.floor(my * cellPx + subPx * 1.5);
    const px = ctx.getImageData(ccx, ccy, 1, 1).data;
    const lum = (px[0] + px[1] + px[2]) / 3;
    expect(px[3]).toBe(255);
    expect(lum).toBeLessThan(80);
  });

  it('keeps reserved dark cells fully painted (no centre subpixel override visible)', () => {
    const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');
    const canvas = renderComposite(whiteImageData(256, 256), { marginPx: 0, filter: 'mono' });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;

    // Find a reserved dark cell — top-left finder corner is always reserved + dark.
    expect(matrix.reserved[0]).toBe(1);
    expect(matrix.modules[0][0]).toBe(true);
    // Sample a corner subpixel (should be dark structural ink, not the white surround).
    const cx = Math.floor(cellPx * 0.1);
    const cy = Math.floor(cellPx * 0.1);
    const px = ctx.getImageData(cx, cy, 1, 1).data;
    const lum = (px[0] + px[1] + px[2]) / 3;
    expect(px[3]).toBe(255);
    expect(lum).toBeLessThan(80);
  });

  it('decodes via jsqr in mono mode under a representative source', async () => {
    const { verify } = await import('./scanVerifier');
    const canvas = renderComposite(whiteImageData(256, 256), { marginPx: 32, filter: 'mono' });
    const results = verify(canvas, [canvas.width]);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe('https://www.instagram.com/ntu_astro/');
  });

  it('color filter: surround subpixels carry the source colour', () => {
    // Bright red source — composite surround in colour mode should keep the
    // red (clamped) on surround subpixels of data-light modules.
    const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');
    const canvas = renderComposite(colorImageData(256, 256, 220, 40, 40), {
      marginPx: 0,
      filter: 'color',
    });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    const subPx = cellPx / 3;

    // Find a non-reserved light module — its surround subpixels should carry
    // the cover image colour. (For a uniform red source the corner of any data
    // cell — light or dark — paints the source's red.)
    let target: [number, number] | null = null;
    for (let my = 9; my < matrix.size - 9 && !target; my++) {
      for (let mx = 9; mx < matrix.size - 9 && !target; mx++) {
        if (!matrix.modules[my][mx] && matrix.reserved[my * matrix.size + mx] === 0) {
          target = [mx, my];
        }
      }
    }
    expect(target).not.toBeNull();
    const [mx, my] = target!;
    // Sample the top-left surround subpixel.
    const cornerX = Math.floor(mx * cellPx + subPx * 0.5);
    const cornerY = Math.floor(my * cellPx + subPx * 0.5);
    const px = ctx.getImageData(cornerX, cornerY, 1, 1).data;
    expect(px[3]).toBe(255);
    // The red channel should dominate.
    expect(px[0]).toBeGreaterThan(px[1]);
    expect(px[0]).toBeGreaterThan(px[2]);
  });
});
