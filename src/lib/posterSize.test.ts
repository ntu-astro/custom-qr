import { describe, it, expect } from 'vitest';
import { clampSide } from './posterSize';

describe('clampSide', () => {
  it('returns 1080 for NaN', () => {
    expect(clampSide(NaN)).toBe(1080);
  });

  it('returns 1080 for negative values', () => {
    expect(clampSide(-10)).toBe(1080);
  });

  it('returns 1080 for zero', () => {
    expect(clampSide(0)).toBe(1080);
  });

  it('clamps up to 64 when value is below minimum', () => {
    expect(clampSide(50)).toBe(64);
  });

  it('passes through values in the valid range', () => {
    expect(clampSide(2500)).toBe(2500);
  });

  it('clamps down to 8000 when value exceeds maximum', () => {
    expect(clampSide(99999)).toBe(8000);
  });

  it('rounds fractional values', () => {
    expect(clampSide(2500.7)).toBe(2501);
  });
});
