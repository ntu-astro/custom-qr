import { describe, it, expect } from 'vitest';
import { buildMatrix } from './qrMatrix';

describe('buildMatrix', () => {
  it('returns square modules and a same-sized reserved mask', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    expect(m.size).toBeGreaterThan(20);
    expect(m.modules.length).toBe(m.size);
    expect(m.modules[0].length).toBe(m.size);
    expect(m.reserved).toBeInstanceOf(Uint8Array);
    expect(m.reserved.length).toBe(m.size * m.size);
  });

  it('marks the three finder-pattern regions as reserved', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    const corners: Array<[number, number]> = [
      [0, 0],
      [m.size - 1, 0],
      [0, m.size - 1],
    ];
    for (const [x, y] of corners) {
      expect(m.reserved[y * m.size + x]).toBe(1);
    }
  });

  it('marks timing-pattern row 6 and column 6 as reserved', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    for (let i = 8; i < m.size - 8; i++) {
      expect(m.reserved[6 * m.size + i]).toBe(1);
      expect(m.reserved[i * m.size + 6]).toBe(1);
    }
  });

  it('leaves data modules unreserved', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    // The module at (m.size - 3, m.size - 3) sits in the bottom-right data
    // quadrant for any version >= 2 — outside any common alignment-pattern
    // position.
    const x = m.size - 3;
    const y = m.size - 3;
    expect(m.reserved[y * m.size + x]).toBe(0);
  });

  it('throws on input exceeding ECC level H capacity', () => {
    const huge = 'x'.repeat(2000);
    expect(() => buildMatrix(huge)).toThrow();
  });

  it('always uses ECC level H', () => {
    const m = buildMatrix('A'.repeat(100));
    expect(m.size).toBeGreaterThanOrEqual(33);
  });
});
