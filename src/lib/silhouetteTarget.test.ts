import { describe, it, expect } from 'vitest';
import { computeSilhouetteTarget } from './silhouetteTarget';

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

/** Build a flat (size × size) reserved mask with all cells initialised to
 *  `value`. 1 = reserved, 0 = data. */
function uniformReserved(size: number, value: 0 | 1): Uint8Array {
  const out = new Uint8Array(size * size);
  if (value === 1) out.fill(1);
  return out;
}

// ---------------------------------------------------------------------------
// computeSilhouetteTarget
// ---------------------------------------------------------------------------

describe('computeSilhouetteTarget', () => {
  const SIZE = 12;

  it('reserved cells (reserved=1) always have importance 0', () => {
    // Build a 3×3 mask with [1][1] reserved.
    const size = 3;
    const reserved = uniformReserved(size, 0);
    reserved[1 * size + 1] = 1;

    const source = opaqueBlack(size, size);
    const result = computeSilhouetteTarget(source, size, reserved);

    expect(result.importance[1][1]).toBe(0);
    expect(result.size).toBe(size);
  });

  it('returns arrays of the correct dimensions', () => {
    const reserved = uniformReserved(SIZE, 0);
    const source = opaqueBlack(SIZE, SIZE);
    const result = computeSilhouetteTarget(source, SIZE, reserved);

    expect(result.size).toBe(SIZE);
    expect(result.target.length).toBe(SIZE);
    expect(result.importance.length).toBe(SIZE);
    for (let y = 0; y < SIZE; y++) {
      expect(result.target[y].length).toBe(SIZE);
      expect(result.importance[y].length).toBe(SIZE);
    }
  });

  it('opaque black source → silhouette-dark cells have importance 1.0', () => {
    // An all-black image dithers entirely to dark (binary 0).
    // Every non-reserved cell where target===true should get importance 1.0.
    const reserved = uniformReserved(SIZE, 0);
    const source = opaqueBlack(SIZE, SIZE);
    const result = computeSilhouetteTarget(source, SIZE, reserved);

    let foundDark = false;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (reserved[y * SIZE + x] === 0 && result.target[y][x]) {
          expect(result.importance[y][x]).toBe(1.0);
          foundDark = true;
        }
      }
    }
    // Sanity: an all-black source must produce at least some dark modules.
    expect(foundDark).toBe(true);
  });

  it('opaque white source → light cells have importance 0.1 (NON_SILHOUETTE_FLOOR)', () => {
    // An all-white image dithers entirely to light (binary 255).
    // Every non-reserved cell where target===false should get importance 0.1.
    const reserved = uniformReserved(SIZE, 0);
    const source = opaqueWhite(SIZE, SIZE);
    const result = computeSilhouetteTarget(source, SIZE, reserved);

    let foundLight = false;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (reserved[y * SIZE + x] === 0 && !result.target[y][x]) {
          expect(result.importance[y][x]).toBe(0.1);
          foundLight = true;
        }
      }
    }
    // Sanity: an all-white source must produce at least some light modules.
    expect(foundLight).toBe(true);
  });

  it('importance is strictly 0 or 0.1 or 1.0 — no other values', () => {
    const reserved = uniformReserved(SIZE, 0);
    // Mix: mark a few cells as reserved.
    reserved[0] = 1;
    reserved[(SIZE - 1) * SIZE + (SIZE - 1)] = 1;
    const source = opaqueBlack(SIZE, SIZE);
    const result = computeSilhouetteTarget(source, SIZE, reserved);

    const allowed = new Set([0, 0.1, 1.0]);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = result.importance[y][x];
        expect(allowed.has(v)).toBe(true);
      }
    }
  });

  it('silhouetteScale propagates — a scaled source produces a smaller dark region', () => {
    // At scale 1 the black source fills the entire canvas → all modules dark.
    // At scale 0.5 only the centre is filled → fewer dark modules.
    const reserved = uniformReserved(SIZE, 0);
    const source = opaqueBlack(SIZE, SIZE);

    const fullScale = computeSilhouetteTarget(source, SIZE, reserved, 1);
    const halfScale = computeSilhouetteTarget(source, SIZE, reserved, 0.5);

    const darkFull = fullScale.target.flat().filter(Boolean).length;
    const darkHalf = halfScale.target.flat().filter(Boolean).length;

    // Smaller scale → fewer dark modules.
    expect(darkHalf).toBeLessThan(darkFull);
  });
});
