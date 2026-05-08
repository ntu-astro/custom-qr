/**
 * Pipeline geometric constants. The renderer relies on the divisibility
 * invariant CELL_PX = SUBPX_PER_CELL * SUBPX_SIZE_PX (18 = 3 * 6).
 * Changing one without the others will silently mis-align halftone stamps.
 */
export const CELL_PX = 18;
export const SUBPX_PER_CELL = 3;
export const SUBPX_SIZE_PX = CELL_PX / SUBPX_PER_CELL;
