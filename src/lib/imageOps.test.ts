import { describe, it, expect, vi } from 'vitest';
import {
  rasterizeSource,
  ditherFloydSteinberg,
  loadImageData,
  readFileAsDataUrl,
  liftMarginBrightness,
  isOutsideSilhouette,
  clampLuminosity,
  blendAgainstWhite,
} from './imageOps';

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

// ---------------------------------------------------------------------------
// loadImageData (error path)
// ---------------------------------------------------------------------------

describe('loadImageData', () => {
  it('rejects with a descriptive error when the image fails to load', async () => {
    // Stub global.Image so the constructed instance fires onerror asynchronously
    // when src is assigned. This mirrors the browser behaviour for a 404 / bad
    // URL without actually performing a network request in jsdom.
    const originalImage = globalThis.Image;
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin: string | null = null;
      width = 0;
      height = 0;
      private _src = '';
      get src(): string {
        return this._src;
      }
      set src(value: string) {
        this._src = value;
        // Fire onerror on the next tick so the awaiting Promise observes it.
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    (globalThis as unknown as { Image: typeof FailingImage }).Image = FailingImage;
    try {
      await expect(loadImageData('bad-url')).rejects.toThrow(/Failed to load image/);
    } finally {
      (globalThis as unknown as { Image: typeof originalImage }).Image = originalImage;
    }
  });
});

// ---------------------------------------------------------------------------
// readFileAsDataUrl
// ---------------------------------------------------------------------------

describe('readFileAsDataUrl', () => {
  it('resolves with a data: URL on success', async () => {
    const file = new File(['hello world'], 'greeting.txt', { type: 'text/plain' });
    const dataUrl = await readFileAsDataUrl(file);
    // Loose-but-meaningful: must be a data: URL, must include the MIME type
    // we passed to File, and must be base64-encoded.
    expect(dataUrl.startsWith('data:text/plain')).toBe(true);
    expect(dataUrl).toMatch(/;base64,/);
  });

  it('rejects when FileReader fires onerror', async () => {
    // Spy on readAsDataURL so the underlying read is replaced with an immediate
    // error event. We touch the FileReader prototype rather than constructing
    // a fake to keep the resolution path inside readFileAsDataUrl identical.
    const spy = vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(
      function (this: FileReader) {
        // Pretend the underlying read errored.
        Object.defineProperty(this, 'error', {
          configurable: true,
          value: new DOMException('boom', 'NotReadableError'),
        });
        setTimeout(() => {
          this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>);
        }, 0);
      },
    );
    try {
      const file = new File(['ignored'], 'broken.txt', { type: 'text/plain' });
      await expect(readFileAsDataUrl(file)).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// blendAgainstWhite
// ---------------------------------------------------------------------------

describe('blendAgainstWhite', () => {
  it('fully opaque source returns identical RGB and alpha 255', () => {
    const input = makeImageData(2, 2, () => [50, 100, 150, 255]);
    const out = blendAgainstWhite(input);
    expect(out.data[0]).toBe(50);
    expect(out.data[1]).toBe(100);
    expect(out.data[2]).toBe(150);
    expect(out.data[3]).toBe(255);
  });

  it('fully transparent source returns pure white', () => {
    const input = makeImageData(2, 2, () => [0, 0, 0, 0]);
    const out = blendAgainstWhite(input);
    expect(out.data[0]).toBe(255);
    expect(out.data[1]).toBe(255);
    expect(out.data[2]).toBe(255);
    expect(out.data[3]).toBe(255);
  });

  it('50% alpha interpolates 50/50 against white', () => {
    const input = makeImageData(2, 2, () => [0, 0, 0, 128]);
    const out = blendAgainstWhite(input);
    // 0 * (128/255) + 255 * (1 - 128/255) ≈ 127.5 → 128
    expect(out.data[0]).toBeGreaterThanOrEqual(127);
    expect(out.data[0]).toBeLessThanOrEqual(128);
    expect(out.data[3]).toBe(255);
  });
});

// ---------------------------------------------------------------------------
// liftMarginBrightness
// ---------------------------------------------------------------------------

describe('liftMarginBrightness', () => {
  it('marginCells=0 returns a copy with identical bytes', () => {
    const input = makeImageData(9, 9, () => [50, 50, 50, 255]);
    const out = liftMarginBrightness(input, 0, 3);
    expect(Array.from(out.data)).toEqual(Array.from(input.data));
    // It should be a copy, not the same reference.
    expect(out).not.toBe(input);
  });

  it('matrix-region pixels stay at original luma; margin pixels lift toward white', () => {
    // 5x5 canvas with marginCells=1 and matrixCells=1 means subgrid is 3x3.
    // marginSub = 3, matrixSub region = [3, 6), but width is 9 = 3*3 (marginCells=1
    // implies marginSub=3, so total = 3 + 3 + 3 = 9).
    const w = 9, h = 9;
    const input = makeImageData(w, h, () => [0, 0, 0, 255]);
    const out = liftMarginBrightness(input, 1, 1);
    // Centre subpixel of the matrix region (4, 4) is unchanged.
    const centreIdx = (4 * w + 4) * 4;
    expect(out.data[centreIdx]).toBe(0);
    // Outermost ring (e.g. (0, 0)) is heavily lifted toward white.
    const cornerIdx = 0;
    expect(out.data[cornerIdx]).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// isOutsideSilhouette
// ---------------------------------------------------------------------------

describe('isOutsideSilhouette', () => {
  it('fully transparent pixel returns true', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 0]);
    expect(isOutsideSilhouette(data, 0)).toBe(true);
  });

  it('fully opaque dark pixel returns false', () => {
    const data = new Uint8ClampedArray([20, 20, 20, 255]);
    expect(isOutsideSilhouette(data, 0)).toBe(false);
  });

  it('opaque white pixel returns true (above SILHOUETTE_MAX_LUM)', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    expect(isOutsideSilhouette(data, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// clampLuminosity
// ---------------------------------------------------------------------------

describe('clampLuminosity', () => {
  it('pixel below maxBrightness is unchanged', () => {
    const out = clampLuminosity(20, 20, 20, 0.45);
    expect(out).toEqual({ r: 20, g: 20, b: 20 });
  });

  it('pixel above maxBrightness is scaled down proportionally', () => {
    const out = clampLuminosity(255, 255, 255, 0.45);
    // After clamping, the result should have luma <= 0.45 * 255 ≈ 115.
    const lum = (out.r + out.g + out.b) / 3;
    expect(lum).toBeLessThanOrEqual(120);
  });

  it('preserves colour ratios when clamping', () => {
    const out = clampLuminosity(200, 100, 50, 0.3);
    // Ratios r:g:b should stay close to 4:2:1 (the input ratios).
    const total = out.r + out.g + out.b;
    expect(out.r / total).toBeCloseTo(200 / 350, 1);
    expect(out.g / total).toBeCloseTo(100 / 350, 1);
  });
});
