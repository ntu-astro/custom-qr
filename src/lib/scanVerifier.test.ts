import { describe, it, expect } from 'vitest';
import { verify } from './scanVerifier';
import { buildMatrix } from './qrMatrix';
import { render } from './halftoneRenderer';
import { buildPredictedCanvas } from './predictedCanvas';

function whiteImageData(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0;
  }
  return new ImageData(data, w, h);
}

describe('verify', () => {
  it('decodes a rendered halftone QR back to the original text', () => {
    const text = 'https://www.instagram.com/ntu_astro/';
    const matrix = buildMatrix(text);
    const source = whiteImageData(256, 256);
    const marginCells = Math.round(32 / 18);
    const predicted = buildPredictedCanvas(source, matrix, marginCells, 1, 'halftone', 'mono');
    const canvas = render(matrix, predicted, source, {
      marginPx: 32,
    });
    const results = verify(canvas, [canvas.width]);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe(text);
  });
});
