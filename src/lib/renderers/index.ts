/** Renderer registry. To add a new render mode:
 *   1. Extend the `RenderMode` union in `src/types.ts`.
 *   2. Implement a `Renderer` (see `src/lib/renderers/types.ts`).
 *   3. Add it to `RENDERERS` below.
 *  No other call sites need updating — `useQrPipeline` dispatches via
 *  `getRenderer(mode).render(...)`. */

import type { RenderMode } from '../../types';
import type { Renderer } from './types';
import { halftoneRenderer } from '../halftoneRenderer';
import { compositeRenderer } from '../compositeRenderer';

export const RENDERERS: Readonly<Record<RenderMode, Renderer>> = Object.freeze({
  halftone: halftoneRenderer,
  composite: compositeRenderer,
});

/** Look up the renderer for a given render mode. Throws on unknown modes —
 *  this is a programmer error (the `RenderMode` union should make it
 *  unreachable at the type level), but the runtime guard makes the error
 *  obvious if someone widens the union without registering a renderer. */
export function getRenderer(mode: RenderMode): Renderer {
  const renderer = RENDERERS[mode];
  if (!renderer) {
    throw new Error(`Unknown render mode: ${String(mode)}`);
  }
  return renderer;
}

export type { Renderer, RendererInputs } from './types';
