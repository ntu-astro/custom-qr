export type PosterSize =
  | { kind: 'igPost'; width: 1080; height: 1080 }
  | { kind: 'igStory'; width: 1080; height: 1920 }
  | { kind: 'a4'; width: 2480; height: 3508 }
  | { kind: 'custom'; width: number; height: number };

export interface Palette {
  /** Hex color used for the halo + accents around the safe zone. */
  accent: string;
  /** Hex color used for fallback module fill if source image is fully transparent. */
  fallbackDark: string;
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
  /** Per-module importance weight (Chu et al. 2013):
   *   - 0 = structurally reserved (finder/timing/alignment/format/version);
   *         excluded from optimisation, full-cell stamp in the renderer.
   *   - 0..1 = data module — higher means "preserve this position's
   *         agreement with the source image". Used by mask scoring and the
   *         per-block flip selector. Default 1.0 before image-weighting. */
  importance: number[][];
}

export interface ScanResult {
  size: number;
  ok: boolean;
  decoded?: string;
}

export interface RenderOptions {
  /** 0..60 — pixels of extra dithered canvas around the QR data area. */
  marginPx: number;
  /** Hex string or 'transparent'. */
  background: string;
}

export const DEFAULT_PLACEHOLDER_URL = 'https://ntuastro.com';
export const QR_ECC_LEVEL = 'H' as const;
