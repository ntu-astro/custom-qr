import { describe, it, expect } from 'vitest';
import { buildMatrix } from './qrMatrix';

describe('buildMatrix', () => {
  it('returns square modules and reservedMask', () => {
    const m = buildMatrix('https://ntuastro.com');
    expect(m.size).toBeGreaterThan(20);
    expect(m.modules.length).toBe(m.size);
    expect(m.modules[0].length).toBe(m.size);
    expect(m.reservedMask.length).toBe(m.size);
    expect(m.reservedMask[0].length).toBe(m.size);
  });

  it('marks the three finder-pattern regions as reserved', () => {
    const m = buildMatrix('https://ntuastro.com');
    const corners = [
      [0, 0],                       // top-left finder
      [m.size - 1, 0],              // top-right finder
      [0, m.size - 1],              // bottom-left finder
    ];
    for (const [x, y] of corners) {
      expect(m.reservedMask[y][x]).toBe(true);
    }
  });

  it('marks timing-pattern row 6 and column 6 as reserved', () => {
    const m = buildMatrix('https://ntuastro.com');
    for (let i = 8; i < m.size - 8; i++) {
      expect(m.reservedMask[6][i]).toBe(true);
      expect(m.reservedMask[i][6]).toBe(true);
    }
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
