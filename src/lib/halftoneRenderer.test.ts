import { describe, it, expect } from 'vitest';
import { render } from './halftoneRenderer';
import { buildMatrix } from './qrMatrix';
import { toLuminance } from './colorUtils';

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

/** Composite the (transparent-output) QR canvas over white, since the renderer
 *  always emits transparent "light" pixels and tests want to assert the visible
 *  result. */
function flattenOnWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

describe('render', () => {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');

  it('produces a square canvas sized for the matrix plus margin', () => {
    const canvas = render(matrix, blackImageData(512, 512), { marginPx: 32 });
    expect(canvas.width).toBe(canvas.height);
    expect(canvas.width).toBeGreaterThanOrEqual(matrix.size + 2 * 4);
  });

  it('preserves dark data modules: a known dark module pixel is dark', () => {
    const canvas = render(matrix, whiteImageData(512, 512), { marginPx: 0 });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    const cx = Math.floor(cellPx * 0.5);
    const cy = Math.floor(cellPx * 0.5);
    const px = ctx.getImageData(cx, cy, 1, 1).data;
    const lum = (px[0] + px[1] + px[2]) / 3;
    expect(px[3]).toBe(255);
    expect(lum).toBeLessThan(80);
  });

  it('leaves the canvas margin transparent under a fully-light source', () => {
    // Margin is part of the dithered illustration (Chu et al. full-canvas halftone).
    // An all-white source dithers to all-white, so margin sub-pixels never get inked.
    const canvas = render(matrix, whiteImageData(512, 512), { marginPx: 16 });
    const ctx = canvas.getContext('2d')!;
    const px = ctx.getImageData(2, 2, 1, 1).data;
    expect(px[3]).toBe(0);
  });
});

describe('render — reserved-cell suppression', () => {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');

  // Module (1, 3) sits inside the top-left finder's white ring — both reserved AND
  // a light cell. Without suppression a fully-black source at high density would
  // fill that ring with halftone dots and merge it with adjacent dark cells,
  // breaking the finder.
  it('keeps reserved-but-light cells transparent under a dark source', () => {
    expect(matrix.reserved[3 * matrix.size + 1]).toBe(1);
    expect(matrix.modules[3][1]).toBe(false);

    const canvas = render(matrix, blackImageData(256, 256), { marginPx: 0 });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    const cx = Math.floor(cellPx * 1.5);
    const cy = Math.floor(cellPx * 3.5);
    const px = ctx.getImageData(cx, cy, 1, 1).data;
    expect(px[3]).toBe(0);
  });
});

describe('render — sub-pixel halftone (Chu et al. 2013)', () => {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');

  function findNonReservedLightModule(): [number, number] {
    for (let my = 9; my < matrix.size - 9; my++) {
      for (let mx = 9; mx < matrix.size - 9; mx++) {
        if (!matrix.modules[my][mx] && matrix.reserved[my * matrix.size + mx] === 0) {
          return [mx, my];
        }
      }
    }
    throw new Error('no non-reserved light module found');
  }

  function findNonReservedDarkModule(): [number, number] {
    for (let my = 9; my < matrix.size - 9; my++) {
      for (let mx = 9; mx < matrix.size - 9; mx++) {
        if (matrix.modules[my][mx] && matrix.reserved[my * matrix.size + mx] === 0) {
          return [mx, my];
        }
      }
    }
    throw new Error('no non-reserved dark module found');
  }

  it('shows the silhouette in 8/9 sub-pixels of non-reserved data-light cells', () => {
    const canvas = render(matrix, blackImageData(256, 256), { marginPx: 0 });
    const flat = flattenOnWhite(canvas);
    const ctx = flat.getContext('2d')!;
    const cellPx = flat.width / matrix.size;
    const subPx = cellPx / 3;
    const [mx, my] = findNonReservedLightModule();
    const cx = Math.floor(mx * cellPx + subPx * 0.5);
    const cy = Math.floor(my * cellPx + subPx * 0.5);
    const corner = ctx.getImageData(cx, cy, 1, 1).data;
    const cornerLum = (corner[0] + corner[1] + corner[2]) / 3;
    expect(cornerLum).toBeLessThan(80);

    const ccx = Math.floor(mx * cellPx + subPx * 1.5);
    const ccy = Math.floor(my * cellPx + subPx * 1.5);
    const centre = ctx.getImageData(ccx, ccy, 1, 1).data;
    const centreLum = (centre[0] + centre[1] + centre[2]) / 3;
    expect(centreLum).toBeGreaterThan(200);
  });

  it('keeps the QR centre stamp dark in non-reserved data-dark cells under a bright source', () => {
    const canvas = render(matrix, whiteImageData(256, 256), { marginPx: 0 });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    const subPx = cellPx / 3;
    const [mx, my] = findNonReservedDarkModule();
    const ccx = Math.floor(mx * cellPx + subPx * 1.5);
    const ccy = Math.floor(my * cellPx + subPx * 1.5);
    const centre = ctx.getImageData(ccx, ccy, 1, 1).data;
    const centreLum = (centre[0] + centre[1] + centre[2]) / 3;
    expect(centreLum).toBeLessThan(80);
  });
});

describe('render — scan survival', () => {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');

  it('decodes via jsqr (light source)', async () => {
    const { verify } = await import('./scanVerifier');
    const canvas = render(matrix, whiteImageData(256, 256), { marginPx: 32 });
    const results = verify(canvas, [canvas.width]);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe('https://www.instagram.com/ntu_astro/');
  });

  it('decodes via jsqr (dark source — silhouette stress)', async () => {
    const { verify } = await import('./scanVerifier');
    const canvas = render(matrix, blackImageData(256, 256), { marginPx: 32 });
    const results = verify(canvas, [canvas.width]);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe('https://www.instagram.com/ntu_astro/');
  });
});

describe('render — color halftone', () => {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');

  function colorImageData(w: number, h: number, r: number, g: number, b: number): ImageData {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    return new ImageData(data, w, h);
  }

  it('paints dark sub-pixels in the source colour (clamped) when enabled', () => {
    // Bright red source — single-ink mode would tint with the dominant clamped
    // tone; colour halftone keeps the per-pixel red, just darkened enough for
    // contrast.
    const canvas = render(matrix, colorImageData(256, 256, 220, 40, 40), {
      marginPx: 0,
      filter: 'color',
    });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    const subPx = cellPx / 3;
    // Find a non-reserved dark module and inspect the centre stamp colour.
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
    expect(px[3]).toBe(255);
    expect(px[0]).toBeGreaterThan(px[1]);
    expect(px[0]).toBeGreaterThan(px[2]);
    const lum = toLuminance(px[0], px[1], px[2]) / 255;
    expect(lum).toBeLessThanOrEqual(0.46);
  });

  it('still decodes via jsqr in colour mode', async () => {
    const { verify } = await import('./scanVerifier');
    const canvas = render(matrix, colorImageData(256, 256, 220, 40, 40), {
      marginPx: 32,
      filter: 'color',
    });
    const results = verify(canvas, [canvas.width]);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe('https://www.instagram.com/ntu_astro/');
  });
});
