import { describe, it, expect } from 'vitest';
import { verify } from './scanVerifier';
import { buildMatrix } from './qrMatrix';
import { render } from './halftoneRenderer';

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
    const canvas = render(matrix, whiteImageData(256, 256), {
      marginPx: 32,
    });
    const results = verify(canvas, [canvas.width]);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe(text);
  });
});
