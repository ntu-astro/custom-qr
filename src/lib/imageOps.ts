/** Shared canvas / image-data helpers for the halftone renderer, the composite
 *  renderer, the predicted-canvas builder, and the Stage-2 mask optimiser.
 *  Pure, no React, no QR knowledge. */

import { toLuminance } from './colorUtils';
import { SUBPX_PER_CELL } from './pipelineConstants';
import { MAX_INK_LUM, MARGIN_INNER_INK_FACTOR } from './halftoneTunables';

// ---------------------------------------------------------------------------
// Image-conditioning constants (shared between halftone + composite renderers)
// ---------------------------------------------------------------------------

/** Re-exported from `halftoneTunables.ts`. Maximum normalised luminance (0..1)
 *  any silhouette ink sub-pixel may carry. jsqr only locks on if dark modules
 *  read clearly darker than light modules, so per-pixel colour samples are
 *  clamped down to this ceiling. */
export { MAX_INK_LUM };

/** A source sub-pixel is treated as "outside the silhouette" when its alpha
 *  is below this fraction. Used to decide when to fall back to structural ink
 *  (PNG/SVG cases). */
export const SILHOUETTE_ALPHA_THRESHOLD = 0.4;

/** A source sub-pixel is treated as "outside the silhouette" when its
 *  white-blended luminance exceeds this fraction. Used to detect near-white
 *  backgrounds in JPEG/photo sources without alpha. */
export const SILHOUETTE_MAX_LUM = 0.85;

/** Plum-black used for finders, timing, alignment, and any QR data stamps that
 *  fall outside the silhouette while colour halftone is on. */
export const STRUCTURAL_INK = { r: 33, g: 25, b: 34 } as const;

/** Hex form of `STRUCTURAL_INK`, used by the poster compositor's halo accent. */
export const STRUCTURAL_INK_HEX = '#211922';

/** `rgb(...)` form of `STRUCTURAL_INK`, used by the renderers' fillStyle. */
export const STRUCTURAL_INK_RGB = `rgb(${STRUCTURAL_INK.r},${STRUCTURAL_INK.g},${STRUCTURAL_INK.b})`;

/** Luma (0..255) above which a source pixel is considered too bright to
 *  contribute to the dominant ink-colour average. Empirically tuned. */
export const DARK_PIXEL_LUMA_CUTOFF = 200;

// MARGIN_INNER_INK_FACTOR is imported from `halftoneTunables.ts`. It controls
// the maximum fraction of original darkness retained at the inner edge of the
// margin (immediately adjacent to the QR data area). The factor falls off
// linearly to 0 at the canvas edge — so the outermost ring is essentially
// white, which protects finder-pattern detection in lenient decoders, while
// still allowing the silhouette to echo softly outward from the QR.

// ---------------------------------------------------------------------------
// Image-conditioning helpers
// ---------------------------------------------------------------------------

/** Alpha-blend a source ImageData against an opaque white background, returning
 *  a new ImageData whose every pixel is fully opaque. Required pre-step for
 *  `ditherFloydSteinberg` and any luma-based downstream consumer. */
export function blendAgainstWhite(rgba: ImageData): ImageData {
  const out = new ImageData(rgba.width, rgba.height);
  for (let i = 0; i < rgba.data.length; i += 4) {
    const a = rgba.data[i + 3] / 255;
    out.data[i] = Math.round(rgba.data[i] * a + 255 * (1 - a));
    out.data[i + 1] = Math.round(rgba.data[i + 1] * a + 255 * (1 - a));
    out.data[i + 2] = Math.round(rgba.data[i + 2] * a + 255 * (1 - a));
    out.data[i + 3] = 255;
  }
  return out;
}

/** Return a copy of `rasterised` with margin sub-pixels graduated toward white.
 *  Sub-pixels at the matrix boundary keep MARGIN_INNER_INK_FACTOR of their ink;
 *  density tapers linearly to 0 at the canvas edge. Channels are alpha-blended
 *  against white first so transparent sources behave the same as white sources. */
export function liftMarginBrightness(
  rasterised: ImageData,
  marginCells: number,
  matrixCells: number,
): ImageData {
  const out = new ImageData(rasterised.width, rasterised.height);
  out.data.set(rasterised.data);
  if (marginCells <= 0) return out;
  const marginSub = marginCells * SUBPX_PER_CELL;
  const matrixSubStart = marginSub;
  const matrixSubEnd = matrixSubStart + matrixCells * SUBPX_PER_CELL;
  const w = out.width;
  const h = out.height;
  for (let y = 0; y < h; y++) {
    const dy = y < matrixSubStart ? matrixSubStart - 1 - y
             : y >= matrixSubEnd ? y - matrixSubEnd
             : -1;
    for (let x = 0; x < w; x++) {
      const dx = x < matrixSubStart ? matrixSubStart - 1 - x
               : x >= matrixSubEnd ? x - matrixSubEnd
               : -1;
      if (dx < 0 && dy < 0) continue;
      const d = Math.max(dx, dy);
      const factor = MARGIN_INNER_INK_FACTOR * (1 - d / marginSub);
      const j = (y * w + x) * 4;
      const a = out.data[j + 3] / 255;
      for (let c = 0; c < 3; c++) {
        const blended = out.data[j + c] * a + 255 * (1 - a);
        out.data[j + c] = Math.round(255 - (255 - blended) * factor);
      }
      out.data[j + 3] = 255;
    }
  }
  return out;
}

/** A source sub-pixel is treated as "outside the silhouette" when it is either
 *  largely transparent (PNG/SVG) or near-white (JPEG/photo with white
 *  background). In both cases colour halftoning falls back to the structural
 *  ink so the QR's dark-module stamps stay pure dark instead of fading toward
 *  whatever neutral the photo's background happens to be. */
export function isOutsideSilhouette(data: Uint8ClampedArray, idx4: number): boolean {
  const a = data[idx4 + 3] / 255;
  if (a < SILHOUETTE_ALPHA_THRESHOLD) return true;
  const r = data[idx4] * a + 255 * (1 - a);
  const g = data[idx4 + 1] * a + 255 * (1 - a);
  const b = data[idx4 + 2] * a + 255 * (1 - a);
  const lum = toLuminance(r, g, b) / 255;
  return lum > SILHOUETTE_MAX_LUM;
}

/** Scale an RGB colour down so its normalised luminance does not exceed
 *  `maxBrightness`. Used to keep silhouette ink dark enough that dark modules
 *  read clearly under jsqr. */
export function clampLuminosity(
  r: number,
  g: number,
  b: number,
  maxBrightness = 0.45,
): { r: number; g: number; b: number } {
  const lum = toLuminance(r, g, b) / 255;
  if (lum <= maxBrightness) return { r, g, b };
  const k = maxBrightness / Math.max(lum, 1e-6);
  return {
    r: Math.round(r * k),
    g: Math.round(g * k),
    b: Math.round(b * k),
  };
}

/** Render the source illustration into a `targetSize × targetSize` transparent
 *  canvas, then return the resulting ImageData. Letterboxes a non-square source
 *  to preserve aspect ratio.
 *
 *  `silhouetteScale` (0 < s ≤ 1, default 1) shrinks the drawn silhouette
 *  toward the canvas centre. The surrounding padding stays transparent — those
 *  modules dither to the importance floor and render as a regular QR. */
export function rasterizeSource(
  source: ImageData,
  targetSize: number,
  silhouetteScale: number = 1,
): ImageData {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = source.width;
  srcCanvas.height = source.height;
  srcCanvas.getContext('2d')!.putImageData(source, 0, 0);

  const tgtCanvas = document.createElement('canvas');
  tgtCanvas.width = targetSize;
  tgtCanvas.height = targetSize;
  const ctx = tgtCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, targetSize, targetSize);
  const clampedScale = Math.min(1, Math.max(0.3, silhouetteScale));
  const innerSize = targetSize * clampedScale;
  const srcAspect = source.width / source.height;
  let drawW = innerSize, drawH = innerSize;
  if (srcAspect > 1) {
    drawH = innerSize / srcAspect;
  } else if (srcAspect < 1) {
    drawW = innerSize * srcAspect;
  }
  const drawX = (targetSize - drawW) / 2;
  const drawY = (targetSize - drawH) / 2;
  ctx.drawImage(srcCanvas, drawX, drawY, drawW, drawH);
  return ctx.getImageData(0, 0, targetSize, targetSize);
}

/** Floyd–Steinberg dither a luma-converted ImageData to a binary 0/255 grid.
 *  Caller must pass pre-blended (fully opaque) input — pipe `blendAgainstWhite`
 *  before this if the source has any transparent pixels. */
export function ditherFloydSteinberg(rgba: ImageData): Uint8Array {
  const w = rgba.width;
  const h = rgba.height;
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    luma[i] = toLuminance(rgba.data[j], rgba.data[j + 1], rgba.data[j + 2]);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = luma[i];
      const newPx = old < 128 ? 0 : 255;
      luma[i] = newPx;
      const err = old - newPx;
      if (x + 1 < w) luma[i + 1] += (err * 7) / 16;
      if (x - 1 >= 0 && y + 1 < h) luma[i + w - 1] += (err * 3) / 16;
      if (y + 1 < h) luma[i + w] += (err * 5) / 16;
      if (x + 1 < w && y + 1 < h) luma[i + w + 1] += (err * 1) / 16;
    }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    out[i] = luma[i] > 127 ? 255 : 0;
  }
  return out;
}

/** Pure geometry for `loadImageData`: returns the 9-arg `drawImage` rectangle
 *  pair (source crop + destination paint) for a `srcW × srcH` image into a
 *  `targetSide × targetSide` canvas.
 *
 *  - `cropToSquare === false` (default, "Original"): source is drawn whole,
 *    centred with transparent letterboxing — preserves the entire user image
 *    and lets the QR pipeline render gutter modules as regular QR squares.
 *  - `cropToSquare === true` ("Square"): source is centre-cropped to its
 *    largest centred square, then scaled to fill the canvas — no transparent
 *    gutters, the silhouette covers the full QR area. */
export function computeLoadDrawRect(
  srcW: number,
  srcH: number,
  targetSide: number,
  cropToSquare: boolean,
): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } {
  if (cropToSquare && srcW > 0 && srcH > 0) {
    const cropSide = Math.min(srcW, srcH);
    return {
      sx: (srcW - cropSide) / 2,
      sy: (srcH - cropSide) / 2,
      sw: cropSide,
      sh: cropSide,
      dx: 0,
      dy: 0,
      dw: targetSide,
      dh: targetSide,
    };
  }
  const ratio = Math.min(targetSide / srcW, targetSide / srcH);
  const w = srcW * ratio;
  const h = srcH * ratio;
  return {
    sx: 0,
    sy: 0,
    sw: srcW,
    sh: srcH,
    dx: (targetSide - w) / 2,
    dy: (targetSide - h) / 2,
    dw: w,
    dh: h,
  };
}

/** Options for `loadImageData`. */
export interface LoadImageOpts {
  /** When true, centre-crop the source to a square that fills the 1024² canvas
   *  instead of letterboxing. Defaults to false (preserve aspect ratio). */
  cropToSquare?: boolean;
}

/** Load an image from a URL or data URL into a 1024×1024 ImageData. By default
 *  preserves aspect ratio with transparent letterboxing; pass
 *  `{ cropToSquare: true }` to centre-crop to a square that fills the canvas. */
export async function loadImageData(src: string, opts: LoadImageOpts = {}): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
  const canvas = document.createElement('canvas');
  // 1024² balances detail (sub-pixel importance maps stay smooth) against
  // memory and dither cost. Distinct from `MAX_DECODE_SIDE` in
  // `decodeQrImage.ts` — they share a value but solve different problems.
  const targetSide = 1024;
  canvas.width = targetSide;
  canvas.height = targetSide;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, targetSide, targetSide);
  const r = computeLoadDrawRect(img.width, img.height, targetSide, opts.cropToSquare === true);
  ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
  return ctx.getImageData(0, 0, targetSide, targetSide);
}

/** Read a File (e.g. from an `<input type="file">`) as a base64 data URL. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}
