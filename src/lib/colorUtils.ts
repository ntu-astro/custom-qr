/** Shared colour helpers. Pure, no DOM/canvas/QR knowledge. */

/** ITU-R BT.601 luma coefficients — see e.g. https://en.wikipedia.org/wiki/Rec._601. */
export const LUMA_COEFFICIENTS = { R: 0.299, G: 0.587, B: 0.114 } as const;

/** Compute perceived luminance of an RGB triple in 0..255 → 0..255 range
 *  (ITU-R BT.601). Channels are NOT clamped or alpha-composited; do that
 *  beforehand if you need an alpha-aware result. */
export function toLuminance(r: number, g: number, b: number): number {
  return LUMA_COEFFICIENTS.R * r + LUMA_COEFFICIENTS.G * g + LUMA_COEFFICIENTS.B * b;
}
