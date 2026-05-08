export type PosterSize =
  | { kind: 'igPost'; width: 1080; height: 1080 }
  | { kind: 'igStory'; width: 1080; height: 1920 }
  | { kind: 'a4'; width: 2480; height: 3508 }
  | { kind: 'custom'; width: number; height: number };

export interface Palette {
  /** Hex color used for the halo + accents around the safe zone. */
  accent: string;
}

export interface TemplatePreset {
  id: string;
  displayName: string;
  /** Resolved at runtime via `new URL(sourcePath, import.meta.url)`-style fetch. */
  sourcePath: string;
  palette: Palette;
}

export interface QRMatrix {
  size: number;
  /** QR module values, true = dark. Mutated by mask optimisation + module flipping. */
  modules: boolean[][];
  /** Flat (size × size) mask: 1 = structurally reserved
   *  (finder/timing/alignment/format/version), 0 = data module. Indexed as
   *  `reserved[y * size + x]`. The fractional fidelity weights used by Stage 2
   *  / Stage 3 live on `HalftoneTarget.importance`, not here. */
  reserved: Uint8Array;
}

export interface ScanResult {
  size: number;
  ok: boolean;
  decoded?: string;
}

/** Filter mode for halftone ink rendering.
 *  - `'mono'`: silhouette ink collapses to a single dominant tone derived from
 *    the source. Best for monochrome silhouettes (built-in templates).
 *  - `'color'`: silhouette ink samples per-pixel from the source (clamped for
 *    darkness). Best for colourful uploaded photos. */
export type FilterMode = 'mono' | 'color';

/** Render mode chosen by the pipeline.
 *  - `'halftone'`: Chu et al. 2013 — diffuses the image across all modules.
 *  - `'composite'`: qart.js-style — paints a clean QR centre with the image as
 *    surround. */
export type RenderMode = 'halftone' | 'composite';

export interface RenderOptions {
  /** 0..60 — pixels of extra dithered canvas around the QR data area. */
  marginPx: number;
  /** 0.3..1 — fraction of the QR canvas covered by the silhouette source.
   *  Values < 1 inset the silhouette toward the centre; the surrounding
   *  padding renders as a regular QR. Defaults to 1 (full canvas). */
  silhouetteScale?: number;
  /** Halftone ink filter mode. Defaults to `'mono'` (preserves the previous
   *  `colorHalftone: false` behaviour). */
  filter?: FilterMode;
}

export const DEFAULT_PLACEHOLDER_URL = 'https://www.instagram.com/ntu_astro/';
export const QR_ECC_LEVEL = 'H' as const;

export type MaskPattern = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const FONT_STACK_CANVAS =
  '"Inter Variable", "Inter", "Pin Sans", -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif';
