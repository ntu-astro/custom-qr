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
  /** The rasterised source, retained for the composite renderer's per-subpixel
   *  colour sampling and for Sampling-Sim's "what would the camera read"
   *  calculations. Halftone and composite-mono branches build `data` from a
   *  margin-lifted copy; composite-color leaves both `raster` and `data`
   *  un-lifted so the photo's outer ring stays intact. */
  raster: ImageData;
  /** True when `data` carries greyscale pixels (R=G=B, alpha=255) — i.e. the
   *  halftone dither output or the composite-mono threshold output. False for
   *  composite-color where `data` is the raw raster. Sampling-Sim uses this to
   *  skip the toLuminance call on the hot path. */
  dataIsGreyscale: boolean;
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

  // Margin brightness lift fades the source toward white in the margin band so
  // finder patterns stay locator-detectable under Floyd-Steinberg dithering or
  // a binary threshold. This is the right semantics for halftone (dither across
  // the whole canvas) and for composite+mono (the surround is binarised), but
  // it is wrong for composite+color: bleaching the photo's outer ring would
  // strip artistic content. The composite-color renderer encodes data in the
  // centre subpixel and doesn't depend on the margin being light, so we skip
  // the lift in that branch.
  const needsMarginLift = renderMode === 'halftone' || filter === 'mono';
  const lifted = needsMarginLift
    ? liftMarginBrightness(rasterised, marginCells, matrix.size)
    : rasterised;

  let data: ImageData;
  let dataIsGreyscale: boolean;
  if (renderMode === 'halftone') {
    const blended = blendAgainstWhite(lifted);
    const binary = ditherFloydSteinberg(blended);
    data = expandBinaryToImageData(binary, canvasSubSize);
    dataIsGreyscale = true;
  } else if (filter === 'mono') {
    // composite + mono: threshold the lifted raster to a binary luma map so the
    // renderer can sample white/black directly. Threshold against MAX_INK_LUM
    // for consistency with halftone mode's ink darkness ceiling.
    const blended = blendAgainstWhite(lifted);
    data = thresholdToImageData(blended);
    dataIsGreyscale = true;
  } else {
    // composite + color: alpha-blend the un-lifted raster against white so
    // transparent subpixels (PNG/SVG backgrounds, silhouetteScale<1 letterbox)
    // resolve to white instead of leaking alpha=0 into the renderer and
    // sampling-sim. Opaque sources are unaffected (blendAgainstWhite is
    // identity at alpha=255), so bright photo content is preserved verbatim.
    // RGB is preserved, so dataIsGreyscale stays false; sampling-sim still
    // runs toLuminance for accurate per-channel scoring.
    data = blendAgainstWhite(lifted);
    dataIsGreyscale = false;
  }

  return {
    data,
    width: canvasSubSize,
    height: canvasSubSize,
    cellPx,
    marginCells,
    reservedChecksum: computeReservedChecksum(matrix.reserved),
    raster: rasterised,
    dataIsGreyscale,
  };
}
