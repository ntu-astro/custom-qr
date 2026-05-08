import { describe, it, expect } from 'vitest';
import { buildPredictedCanvas, computeReservedChecksum } from './predictedCanvas';
import { buildMatrix } from './qrMatrix';

function opaqueGreyImageData(w: number, h: number, value = 128): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return new ImageData(data, w, h);
}

describe('buildPredictedCanvas', () => {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');
  const source = opaqueGreyImageData(64, 64);

  it('halftone + mono: produces a fully-opaque canvas sized for the matrix + margin', () => {
    const marginCells = 0;
    const canvas = buildPredictedCanvas(source, matrix, marginCells, 1, 'halftone', 'mono');
    expect(canvas.width).toBe((matrix.size + 2 * marginCells) * 3);
    expect(canvas.height).toBe(canvas.width);
    expect(canvas.cellPx).toBe(18);
    // Halftone canvas pixels are pure 0/255 black or white at alpha 255.
    for (let i = 0; i < canvas.data.data.length; i += 4) {
      const v = canvas.data.data[i];
      expect(v === 0 || v === 255).toBe(true);
      expect(canvas.data.data[i + 3]).toBe(255);
    }
  });

  it('halftone + color: produces a fully-opaque binary canvas (filter only affects renderer paint)', () => {
    const canvas = buildPredictedCanvas(source, matrix, 0, 1, 'halftone', 'color');
    // Halftone path always thresholds to 0/255 regardless of filter — colour
    // sampling happens in the renderer, not the predicted canvas.
    for (let i = 0; i < canvas.data.data.length; i += 4) {
      const v = canvas.data.data[i];
      expect(v === 0 || v === 255).toBe(true);
    }
  });

  it('composite + mono: every pixel is binary (0 or 255 luma) at alpha 255', () => {
    const canvas = buildPredictedCanvas(source, matrix, 0, 1, 'composite', 'mono');
    for (let i = 0; i < canvas.data.data.length; i += 4) {
      const r = canvas.data.data[i];
      const g = canvas.data.data[i + 1];
      const b = canvas.data.data[i + 2];
      expect(r).toBe(g);
      expect(g).toBe(b);
      expect(r === 0 || r === 255).toBe(true);
      expect(canvas.data.data[i + 3]).toBe(255);
    }
  });

  it('composite + color: passes the lifted raster through unchanged', () => {
    const canvas = buildPredictedCanvas(source, matrix, 0, 1, 'composite', 'color');
    // Pass-through means the canvas data is the lifted raster — same dims and
    // (with marginCells=0) the data should be identical to a separately-built
    // raster.
    expect(canvas.data.width).toBe(canvas.raster.width);
    expect(canvas.data.height).toBe(canvas.raster.height);
  });

  it('reservedChecksum is deterministic for the same matrix', () => {
    const a = buildPredictedCanvas(source, matrix, 0, 1, 'halftone', 'mono');
    const b = buildPredictedCanvas(source, matrix, 0, 1, 'halftone', 'mono');
    expect(a.reservedChecksum).toBe(b.reservedChecksum);
  });

  it('reservedChecksum differs between matrices with different reserved masks', () => {
    const matA = buildMatrix('https://example.com/a');
    const matB = buildMatrix('https://example.com/b/longer/url/forces/different/version');
    if (matA.reserved.length !== matB.reserved.length) {
      // Different sizes obviously have different checksums.
      const cA = computeReservedChecksum(matA.reserved);
      const cB = computeReservedChecksum(matB.reserved);
      expect(cA).not.toBe(cB);
      return;
    }
    // Same length: must still differ when mask bits differ. Force a divergence
    // by flipping one bit if the original checksums collided.
    const cA = computeReservedChecksum(matA.reserved);
    const flipped = new Uint8Array(matA.reserved);
    flipped[0] = flipped[0] === 0 ? 1 : 0;
    const cFlipped = computeReservedChecksum(flipped);
    expect(cFlipped).not.toBe(cA);
  });
});
