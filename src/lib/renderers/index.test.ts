import { describe, it, expect } from 'vitest';
import { getRenderer, RENDERERS } from './index';
import type { RenderMode } from '../../types';

describe('renderer registry', () => {
  it('returns the halftone renderer with id="halftone"', () => {
    const renderer = getRenderer('halftone');
    expect(renderer.id).toBe('halftone');
    expect(renderer).toBe(RENDERERS.halftone);
  });

  it('returns the composite renderer with id="composite"', () => {
    const renderer = getRenderer('composite');
    expect(renderer.id).toBe('composite');
    expect(renderer).toBe(RENDERERS.composite);
  });

  it('throws on an unknown render mode', () => {
    // Cast through `unknown` to bypass the compile-time RenderMode check —
    // the runtime guard exists exactly for this widening-without-registering
    // failure mode, so the test must exercise it explicitly.
    const bogus = 'wireframe' as unknown as RenderMode;
    expect(() => getRenderer(bogus)).toThrow(/Unknown render mode: wireframe/);
  });
});
