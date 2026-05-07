/** Clamp a poster side dimension to a valid pixel count.
 *  - Non-finite or non-positive values fall back to 1080.
 *  - Valid values are rounded and clamped to [64, 8000]. */
export function clampSide(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1080;
  return Math.min(8000, Math.max(64, Math.round(v)));
}
