/** Shared cell-iteration helper used by both `halftoneRenderer` and
 *  `compositeRenderer`. Walks the canvas grid (matrix interior + margin band)
 *  and yields a `CellContext` per cell with all the derived flags both
 *  renderers need. Centralising avoids two copies drifting out of sync. */

import type { QRMatrix } from '../types';

/** Per-cell context yielded during a `eachCell` walk. All consumers currently
 *  use every field — kept as a flat shape so V8 inlines the visit callback. */
export interface CellContext {
  /** Top-left x of this cell in canvas pixels. */
  px: number;
  /** Top-left y of this cell in canvas pixels. */
  py: number;
  /** True iff this cell falls inside the QR matrix (i.e. not part of the
   *  margin band). When false, the `mx`/`my`/`isReserved`/`isModuleDark`
   *  fields are not meaningful and most renderers early-return. */
  inMatrix: boolean;
  /** True iff this is a structurally reserved cell (finder / timing /
   *  alignment / format / version). Only meaningful when `inMatrix` is true. */
  isReserved: boolean;
  /** Post-flip module value at this cell. Only meaningful when `inMatrix`. */
  isModuleDark: boolean;
  /** Matrix x-coordinate. `mx = x - marginCells`. Only meaningful when
   *  `inMatrix`; outside the matrix it is negative or out-of-range. */
  mx: number;
  /** Matrix y-coordinate. `my = y - marginCells`. */
  my: number;
}

/** Walk every cell of a `(matrix.size + 2*marginCells)` grid and call `visit`
 *  with the per-cell context. The iteration order is row-major, top-to-bottom,
 *  left-to-right — renderers that paint sub-pixels rely on this order to keep
 *  drawImage/fillRect calls coalesced.
 *
 *  Pure: does not allocate per-cell objects beyond the single visit-arg shape
 *  V8 will hidden-class together. */
export function eachCell(
  matrix: QRMatrix,
  marginCells: number,
  cellPx: number,
  visit: (cell: CellContext) => void,
): void {
  const totalCells = matrix.size + 2 * marginCells;
  for (let y = 0; y < totalCells; y++) {
    for (let x = 0; x < totalCells; x++) {
      const px = x * cellPx;
      const py = y * cellPx;
      const inMatrix =
        x >= marginCells && x < marginCells + matrix.size &&
        y >= marginCells && y < marginCells + matrix.size;
      const mx = x - marginCells;
      const my = y - marginCells;
      const isReserved = inMatrix && matrix.reserved[my * matrix.size + mx] === 1;
      const isModuleDark = inMatrix && matrix.modules[my][mx];
      visit({ px, py, inMatrix, isReserved, isModuleDark, mx, my });
    }
  }
}
