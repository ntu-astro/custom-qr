/** Stage between source rasterisation and rendering. Builds the subpixel-
 *  resolution "predicted canvas" once per pipeline run; the renderer paints
 *  from it by overriding the centre subpixel of each data module with the
 *  post-flip QR matrix value.
 *
 *  Phase 2 (Sampling-Sim) will mutate the centre subpixels of `data` in place
 *  via `applyModuleFlip` — once `buildSamplingContext` is called the canvas's
 *  ownership effectively transfers to the sampling context until the renderer
 *  consumes it. */

import type { QRMatrix, FilterMode, RenderMode } from '../types';
import {
  rasterizeSource,
  ditherFloydSteinberg,
  liftMarginBrightness,
  blendAgainstWhite,
  MAX_INK_LUM,
} from './imageOps';
import { toLuminance } from './colorUtils';
import { CELL_PX, SUBPX_PER_CELL } from './pipelineConstants';

export interface PredictedCanvas {
  /** Subpixel-resolution image data — what the renderer will paint everywhere
   *  except the centre subpixel of data modules, which the renderer overrides
   *  using the (post-flip) matrix at paint time. */
  data: ImageData;
  /** Equals `(matrix.size + 2 * marginCells) * SUBPX_PER_CELL`. */
  width: number;
  height: number;
  /** Module side length in canvas pixels. Equals 18 in the current pipeline. */
  cellPx: number;
  marginCells: number;
  /** Cheap fingerprint of the matrix.reserved mask used to construct this
   *  canvas. Renderers verify this matches `computeReservedChecksum(matrix.reserved)`
   *  at paint time, in dev builds only — guards the invariant that flips
   *  never mutate reserved-cell topology. */
  reservedChecksum: number;
  /** The lifted (margin-graduated) raster, retained for the composite
   *  renderer's per-subpixel colour sampling and for Sampling-Sim's "what
   *  would the camera read" calculations. */
  raster: ImageData;
}

/** 32-bit FNV-1a hash over the reserved mask. Cheap, collision-free at this
 *  scale, deterministic across runs. */
export function computeReservedChecksum(reserved: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < reserved.length; i++) {
    h ^= reserved[i];
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned 32-bit
  return h >>> 0;
}

/** Threshold a blended ImageData against MAX_INK_LUM, returning a fully-opaque
 *  ImageData whose pixels are pure white (above threshold) or pure black (at
 *  or below). Used by the composite + mono renderer path so the renderer can
 *  sample binary luma values directly. */
function thresholdToImageData(blended: ImageData): ImageData {
  const out = new ImageData(blended.width, blended.height);
  for (let i = 0; i < blended.data.length; i += 4) {
    const lum = toLuminance(blended.data[i], blended.data[i + 1], blended.data[i + 2]) / 255;
    const v = lum > MAX_INK_LUM ? 255 : 0;
    out.data[i] = v;
    out.data[i + 1] = v;
    out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return out;
}

/** Expand a binary 0/255 luma map into a fully-opaque ImageData. */
function expandBinaryToImageData(binary: Uint8Array, side: number): ImageData {
  const out = new ImageData(side, side);
  for (let i = 0; i < binary.length; i++) {
    const j = i * 4;
    const v = binary[i];
    out.data[j] = v;
    out.data[j + 1] = v;
    out.data[j + 2] = v;
    out.data[j + 3] = 255;
  }
  return out;
}

/** Build the predicted canvas for a single pipeline run. Pure — produces the
 *  same output for the same inputs. */
export function buildPredictedCanvas(
  source: ImageData,
  matrix: QRMatrix,
  marginCells: number,
  silhouetteScale: number,
  renderMode: RenderMode,
  filter: FilterMode,
): PredictedCanvas {
  const cellPx = CELL_PX;
  const totalCells = matrix.size + 2 * marginCells;
  const canvasSubSize = totalCells * SUBPX_PER_CELL;

  const rasterised = rasterizeSource(source, canvasSubSize, silhouetteScale);
  const lifted = liftMarginBrightness(rasterised, marginCells, matrix.size);

  let data: ImageData;
  if (renderMode === 'halftone') {
    const blended = blendAgainstWhite(lifted);
    const binary = ditherFloydSteinberg(blended);
    data = expandBinaryToImageData(binary, canvasSubSize);
  } else if (filter === 'mono') {
    // composite + mono: threshold the lifted raster to a binary luma map so the
    // renderer can sample white/black directly. Threshold against MAX_INK_LUM
    // for consistency with halftone mode's ink darkness ceiling.
    const blended = blendAgainstWhite(lifted);
    data = thresholdToImageData(blended);
  } else {
    // composite + color: pass the lifted raster through unchanged. The
    // composite renderer samples per-subpixel from `data` directly.
    data = lifted;
  }

  return {
    data,
    width: canvasSubSize,
    height: canvasSubSize,
    cellPx,
    marginCells,
    reservedChecksum: computeReservedChecksum(matrix.reserved),
    raster: rasterised,
  };
}
