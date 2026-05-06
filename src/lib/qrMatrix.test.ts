import { describe, it, expect } from 'vitest';
import { buildMatrix } from './qrMatrix';

describe('buildMatrix', () => {
  it('returns square modules and a same-sized importance map', () => {
    const m = buildMatrix('https://ntuastro.com');
    expect(m.size).toBeGreaterThan(20);
    expect(m.modules.length).toBe(m.size);
    expect(m.modules[0].length).toBe(m.size);
    expect(m.importance.length).toBe(m.size);
    expect(m.importance[0].length).toBe(m.size);
  });

  it('marks the three finder-pattern regions with importance 0', () => {
    const m = buildMatrix('https://ntuastro.com');
    const corners = [
      [0, 0],
      [m.size - 1, 0],
      [0, m.size - 1],
    ];
    for (const [x, y] of corners) {
      expect(m.importance[y][x]).toBe(0);
    }
  });

  it('marks timing-pattern row 6 and column 6 with importance 0', () => {
    const m = buildMatrix('https://ntuastro.com');
    for (let i = 8; i < m.size - 8; i++) {
      expect(m.importance[6][i]).toBe(0);
      expect(m.importance[i][6]).toBe(0);
    }
  });

  it('marks data modules with positive importance (default 1.0)', () => {
    const m = buildMatrix('https://ntuastro.com');
    // The module at the very centre of the matrix is always a data module
    // for any version that doesn't have a centre alignment pattern (V1 doesn't,
    // V2+ usually does). Pick a position safely inside the data area but
    // outside common alignment-pattern positions: (m.size - 3, m.size - 3) is
    // in the bottom-right data quadrant for any version >= 2.
    const x = m.size - 3;
    const y = m.size - 3;
    expect(m.importance[y][x]).toBeGreaterThan(0);
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
