export type HalftoneStyle = 'hybrid' | 'variable' | 'stippling' | 'qrgrid';

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
  modules: boolean[][];
  reservedMask: boolean[][];
}

export interface ScanResult {
  size: number;
  ok: boolean;
  decoded?: string;
}

export interface RenderOptions {
  style: HalftoneStyle;
  /** 30..80 — non-data fill density, where higher = denser dots. */
  density: number;
  /** 0..60 — pixels of quiet zone in the output canvas. */
  marginPx: number;
  /** Hex string or 'transparent'. */
  background: string;
}

export const DEFAULT_PLACEHOLDER_URL = 'https://ntuastro.com';
export const QR_ECC_LEVEL = 'H' as const;
