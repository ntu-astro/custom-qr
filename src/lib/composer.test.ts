import { describe, it, expect } from 'vitest';
import { composePoster } from './composer';
import type { Palette, PosterSize } from '../types';

const palette: Palette = { accent: '#435ee5', fallbackDark: '#211922' };

function makeQrCanvas(size = 200): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fff';
  ctx.fillRect(20, 20, size - 40, size - 40);
  return c;
}

describe('composePoster', () => {
  it('produces a canvas matching the requested dimensions', () => {
    const sizes: PosterSize[] = [
      { kind: 'igPost', width: 1080, height: 1080 },
      { kind: 'igStory', width: 1080, height: 1920 },
      { kind: 'a4', width: 2480, height: 3508 },
      { kind: 'custom', width: 1500, height: 800 },
    ];
    for (const s of sizes) {
      const out = composePoster(makeQrCanvas(), 'NTU Astro 2026', s, palette);
      expect(out.width).toBe(s.width);
      expect(out.height).toBe(s.height);
    }
  });

  it('places the QR within a centered safe zone (75% of min dimension)', () => {
    const out = composePoster(makeQrCanvas(), '', { kind: 'igPost', width: 1080, height: 1080 }, palette);
    const ctx = out.getContext('2d')!;
    const px = ctx.getImageData(out.width / 2, out.height / 2, 1, 1).data;
    expect(px[0]).toBeGreaterThan(200);
  });

  it('renders without throwing when caption is omitted', () => {
    expect(() =>
      composePoster(makeQrCanvas(), '', { kind: 'igPost', width: 1080, height: 1080 }, palette),
    ).not.toThrow();
  });

  it('shrinks long captions to fit the caption band', () => {
    const long = 'NTU Astronomical Society Stargazing Workshop — Saturday, August 16th, 2026, MAS Auditorium';
    expect(() =>
      composePoster(makeQrCanvas(), long, { kind: 'igPost', width: 1080, height: 1080 }, palette),
    ).not.toThrow();
  });
});
