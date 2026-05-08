/**
 * Empirically tuned luminance, ink, flip-budget, and Sampling-Sim constants
 * shared across the QR rendering pipeline. Some are halftone-only (the inner-
 * margin lift, the dominant-ink luma ceiling); others are mode-agnostic and
 * apply to both halftone and composite render paths (MAX_INK_LUM, the DARK/
 * LIGHT readback targets, the ECC budget ratios).
 *
 * These values were validated against the jsqr decoder via the 48-case
 * integration matrix. Changing any of them WITHOUT re-running the matrix
 * AND `npm run calibrate:flip-budget` is likely to regress decode rates.
 *
 * See docs/PIPELINE.md for the role of each constant in the pipeline.
 */

/** Maximum luminance allowed for an "ink" colour pixel (data modules clamp to this). */
export const MAX_INK_LUM = 0.45;

/** Tighter cap used when picking a dominant ink colour from a coloured source. */
export const DOMINANT_INK_LUM_CEILING = 0.35;

/** Inner-margin brightness lift factor (silhouette padding fade). */
export const MARGIN_INNER_INK_FACTOR = 0.25;

/** Sampling-Sim readback target for an ideally-dark module. */
export const DARK_LUMA = 0.0;
/** Sampling-Sim readback target for an ideally-light module. */
export const LIGHT_LUMA = 1.0;

/** Default per-RS-block flip-budget ratio (fixed policy). Paper uses 0.49. */
export const DEFAULT_ECC_BUDGET_RATIO = 0.15;
/** Hard cap for any user-supplied / dynamic ECC budget ratio. */
export const MAX_ECC_BUDGET_RATIO = 0.49;
