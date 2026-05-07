/** Shared canvas / image-data helpers for the halftone renderer and the
 *  Stage-2 mask optimiser. Pure, no React, no QR knowledge. */

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
  const clampedScale = Math.min(1, Math.max(0.05, silhouetteScale));
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
 *  Transparent regions blend against white so silhouettes dither as intended. */
export function ditherFloydSteinberg(rgba: ImageData): Uint8Array {
  const w = rgba.width;
  const h = rgba.height;
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    const a = rgba.data[j + 3] / 255;
    const r = rgba.data[j] * a + 255 * (1 - a);
    const g = rgba.data[j + 1] * a + 255 * (1 - a);
    const b = rgba.data[j + 2] * a + 255 * (1 - a);
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
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

