import { describe, it, expect } from 'vitest';
import { rasterizeSource, ditherFloydSteinberg } from './imageOps';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImageData(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b, a] = fill(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return new ImageData(data, width, height);
}

function opaqueBlack(width: number, height: number): ImageData {
  return makeImageData(width, height, () => [0, 0, 0, 255]);
}

function opaqueWhite(width: number, height: number): ImageData {
  return makeImageData(width, height, () => [255, 255, 255, 255]);
}

/** Count pixels in a rasterised result whose alpha channel is > 0. */
function countOpaquePixels(result: ImageData): number {
  let count = 0;
  for (let i = 3; i < result.data.length; i += 4) {
    if (result.data[i] > 0) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// rasterizeSource
// ---------------------------------------------------------------------------

describe('rasterizeSource', () => {
  it('square source at scale 1 produces a non-empty opaque result', () => {
    const source = opaqueBlack(16, 16);
    const result = rasterizeSource(source, 16, 1);
    expect(result.width).toBe(16);
    expect(result.height).toBe(16);
    expect(countOpaquePixels(result)).toBeGreaterThan(0);
  });

  it('wide 2:1 source letterboxes vertically — top row transparent, middle row opaque', () => {
    // 16×8 source into a 16×16 canvas. The image fills only the middle band.
    const source = opaqueBlack(16, 8);
    const result = rasterizeSource(source, 16, 1);

    // Top row (y=0) should be fully transparent (letterbox padding).
    const topRowAlpha = result.data[3]; // alpha of pixel (0,0)
    expect(topRowAlpha).toBe(0);

    // Middle row (y=8) should contain at least one opaque pixel.
    let midHasOpaque = false;
    const midY = 8;
    for (let x = 0; x < 16; x++) {
      const i = (midY * 16 + x) * 4 + 3;
      if (result.data[i] > 0) { midHasOpaque = true; break; }
    }
    expect(midHasOpaque).toBe(true);
  });

  it('silhouetteScale=2 is clamped to 1 — result matches scale=1', () => {
    const source = opaqueBlack(16, 16);
    const atOne = rasterizeSource(source, 16, 1);
    const atTwo = rasterizeSource(source, 16, 2);
    // Both should produce the same number of opaque pixels because 2 clamps to 1.
    expect(countOpaquePixels(atTwo)).toBe(countOpaquePixels(atOne));
  });

  it('silhouetteScale=0.1 clamps to 0.3 — visible area is significantly smaller than scale=1', () => {
    // Use a solid black square so the drawn area is exactly the scaled region.
    const source = opaqueBlack(64, 64);
    const atOne = rasterizeSource(source, 64, 1);
    const atFloor = rasterizeSource(source, 64, 0.1); // clamps to 0.3

    const opaqueAtOne = countOpaquePixels(atOne);
    const opaqueAtFloor = countOpaquePixels(atFloor);

    // At scale 0.3 the drawn area is 0.3² = 9% of the full canvas,
    // so significantly fewer pixels should be opaque than at scale 1.
    expect(opaqueAtFloor).toBeLessThan(opaqueAtOne * 0.5);
  });
});

// ---------------------------------------------------------------------------
// ditherFloydSteinberg
// ---------------------------------------------------------------------------

describe('ditherFloydSteinberg', () => {
  it('all-white opaque input produces all-255 output', () => {
    const input = opaqueWhite(8, 8);
    const result = ditherFloydSteinberg(input);
    expect(result.length).toBe(64);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBe(255);
    }
  });

  it('all-black opaque input produces all-0 output', () => {
    const input = opaqueBlack(8, 8);
    const result = ditherFloydSteinberg(input);
    expect(result.length).toBe(64);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBe(0);
    }
  });

  it('50/50 horizontal split — first column is 255, last column is 0', () => {
    // Left half: white (luma 255). Right half: black (luma 0).
    // Floyd-Steinberg propagates error left-to-right so the first column
    // (all white) dithers to 255, and the last column (all black) dithers to 0.
    const w = 8;
    const h = 8;
    const input = makeImageData(w, h, (x) =>
      x < w / 2 ? [255, 255, 255, 255] : [0, 0, 0, 255],
    );
    const result = ditherFloydSteinberg(input);

    // First column (x=0): all rows should be 255.
    for (let y = 0; y < h; y++) {
      expect(result[y * w + 0]).toBe(255);
    }
    // Last column (x=w-1): all rows should be 0.
    for (let y = 0; y < h; y++) {
      expect(result[y * w + (w - 1)]).toBe(0);
    }
  });
});
