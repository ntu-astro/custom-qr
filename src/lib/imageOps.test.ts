import { describe, it, expect, vi } from 'vitest';
import {
  rasterizeSource,
  ditherFloydSteinberg,
  loadImageData,
  readFileAsDataUrl,
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
