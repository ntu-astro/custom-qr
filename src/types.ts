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
  /** 0.3..1 — fraction of the QR canvas covered by the silhouette source.
   *  Values < 1 inset the silhouette toward the centre; the surrounding
   *  padding renders as a regular QR. Defaults to 1 (full canvas). */
  silhouetteScale?: number;
  /** When true, the silhouette's "ink" sub-pixels carry the source's per-pixel
   *  colour (clamped for darkness) instead of a single dominant tone.
   *  Best with colourful uploaded photos. Defaults to false. */
  colorHalftone?: boolean;
}

export const DEFAULT_PLACEHOLDER_URL = 'https://www.instagram.com/ntu_astro/';
export const QR_ECC_LEVEL = 'H' as const;

export type MaskPattern = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const FONT_STACK_CANVAS =
  '"Inter Variable", "Inter", "Pin Sans", -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif';
