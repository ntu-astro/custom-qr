# Halftone QR Pipeline

This file describes the end-to-end pipeline that turns a URL + template into a
rendered halftone (or composite) QR code. It is the canonical reference for
agents touching `src/lib/*`.

## Data flow

```
URL  +  template image  +  render options
                │
                ▼
   ┌────────────────────────┐
   │ buildMatrix (qrMatrix) │   ECC-H matrix with reserved/data bits
   └────────────┬───────────┘
                │
                ▼
   ┌────────────────────────────────┐
   │ computeHalftoneTarget          │   per-module target ∈ {dark,light}
   │ (halftoneTarget)               │   importance ∈ [0, 1]
   └────────────┬───────────────────┘
                │
                ▼
   ┌────────────────────────────────┐
   │ buildPredictedCanvas           │   subpixel-resolution ImageData
   │ (predictedCanvas)              │   + raster + reserved checksum
   └────────────┬───────────────────┘
                │
                ▼
   ┌────────────────────────────────┐
   │ pickBestMask (maskOptimizer)   │   chooses 1 of 8 mask patterns
   │   ↳ buildSamplingContext × 8   │   via Sampling-Sim total score
   │   ↳ totalScore × 8             │
   └────────────┬───────────────────┘
                │
                ▼
   ┌────────────────────────────────┐
   │ flipModulesByCodeword          │   per-RS-block greedy flips,
   │ (moduleFlipper)                │   gated by FlipBudgetPolicy
   │   ↳ buildSamplingContext       │     (fixed | probabilistic ART-UP)
   │   ↳ scoreCodewordDelta         │
   │   ↳ shouldAcceptFlip × N       │
   │   ↳ applyModuleFlip × N        │
   └────────────┬───────────────────┘
                │
                ▼
   ┌────────────────────────────────┐
   │ render (halftoneRenderer)      │
   │   OR                           │
   │ render (compositeRenderer)     │
   └────────────┬───────────────────┘
                │
                ▼
        HTMLCanvasElement
                │
                ▼
   ┌────────────────────────────────┐
   │ verify (scanVerifier)          │   jsqr decode at 1+ sizes
   └────────────────────────────────┘
                │
                ▼
        composePoster (if poster)
```

## Stage-by-stage

### 1. `buildMatrix(text)` → `QRMatrix`
Source: `src/lib/qrMatrix.ts`. Wraps the `qrcode` library to produce an
ECC-level-H matrix. `matrix.modules` carries the boolean grid; `matrix.reserved`
carries the structurally-reserved-cell mask (1 = reserved). ECC level is
**hardcoded** (see `CLAUDE.md` "Locked decisions").

### 2. `computeHalftoneTarget(source, size, reserved, silhouetteScale)` → `HalftoneTarget`
Source: `src/lib/halftoneTarget.ts`. Rasterises the source image to a
size×size canvas, blends against white, runs Floyd–Steinberg dither, and
emits per-module `target ∈ {true, false}` (the source's vote for each
module's bit) and `importance ∈ [0, 1]` (the fidelity weight — 0 for
reserved cells, 0.1 for non-silhouette data modules, 1.0 for silhouette
data modules).

### 3. `buildPredictedCanvas(source, matrix, marginCells, silhouetteScale, renderMode, filter)` → `PredictedCanvas`
Source: `src/lib/predictedCanvas.ts`. The subpixel-resolution image data
the renderer will paint everywhere except module centres of data cells.
For halftone modes: rasterise → liftMargin → blendAgainstWhite → dither.
For composite modes: rasterise → liftMargin → (threshold for mono /
pass-through for color). Carries a 32-bit FNV-1a checksum of `matrix.reserved`
that the renderer asserts in dev to guard the lifecycle invariant
(flips must touch only data modules).

### 4. `pickBestMask(text, target, predicted)` → `{ best, scores }`
Source: `src/lib/maskOptimizer.ts`. Builds the 8 candidate matrices
(`maskPattern: 0..7`), for each one builds a `SamplingSimContext` against
the shared `predicted`, and ranks them by `totalScore`. Lower score = better
fidelity to the dithered target under the camera's expected readback model.

### 5. `flipModulesByCodeword(matrix, target, options)` → `{ matrix, report }`
Source: `src/lib/moduleFlipper.ts`. Applies per-RS-block greedy codeword
flips paid for by ECC slack. Key knobs:
- **Sampling-Sim Δ-score** (Phase 2): each candidate codeword is scored by
  the change in `totalScore` if its modules were set to the target — i.e. the
  optimisation gain.
- **FlipBudgetPolicy** (Phase 3): `'fixed'` accepts up to `floor(ratio · ecCount)`
  flips per block; `'probabilistic'` (ART-UP) accepts each flip iff the
  cumulative block-failure probability stays under `DEFAULT_FAILURE_TOLERANCE`,
  hard-capped at `floor(ecCount/2)`. The default policy resolves to `'probabilistic'`
  iff `CALIBRATION_AUC >= 0.85`, else `'fixed'`. See
  `src/lib/flipBudget.calibration.ts`.

### 6. `render(matrix, predicted, [source,] opts)` → `HTMLCanvasElement`
Two implementations:
- `src/lib/halftoneRenderer.ts` — Chu et al. 2013 halftone (3×3 subpixel
  per module; centre carries QR data, surround carries dithered illustration).
  Takes `source` for `pickInkColor` (mono filter dominant tone).
- `src/lib/compositeRenderer.ts` — qart.js-style (centre 1/9 = QR data,
  surround 8/9 = cover image). Reserved cells always paint
  `STRUCTURAL_INK_RGB` (intentional divergence from halftone-mono's
  silhouette-tinted reserved fill).

### 7. `verify(canvas, sizes)` → `ScanResult[]`
Source: `src/lib/scanVerifier.ts`. Runs jsqr against the rendered canvas at
the given sizes. The "✓ Scannable" badge in the UI surfaces this.

## Shared image-conditioning helpers (Phase 1b)

`src/lib/imageOps.ts` is the canonical home for:
- Constants: `MAX_INK_LUM`, `SILHOUETTE_ALPHA_THRESHOLD`,
  `SILHOUETTE_MAX_LUM`, `STRUCTURAL_INK`, `STRUCTURAL_INK_HEX`,
  `STRUCTURAL_INK_RGB`, `DARK_PIXEL_LUMA_CUTOFF`.
- Helpers: `blendAgainstWhite`, `liftMarginBrightness`,
  `isOutsideSilhouette`, `clampLuminosity`, plus pre-existing
  `rasterizeSource`, `ditherFloydSteinberg`, `loadImageData`,
  `readFileAsDataUrl`.

Renderers import from `imageOps.ts`. Do not duplicate these into renderer
private scope.

## Lifecycle invariant (the one rule)

The `PredictedCanvas` holds a checksum of `matrix.reserved` at the moment it
was built. Every renderer (and Sampling-Sim) asserts the matrix's reserved
mask still matches. Therefore: **flips applied via Sampling-Sim or moduleFlipper
must touch only data modules** (`matrix.reserved[idx] === 0`). Reserved-cell
flips break finder/timing/alignment patterns and the dev-mode assertion
fires.

## When to re-derive

- **ECC tables** (`src/lib/codewordLayout.ts`): only when QR ECC level changes
  away from H (currently locked to H — see `src/types.ts` `QR_ECC_LEVEL`).
- **Calibration coefficients** (`src/lib/flipBudget.calibration.ts`): when
  jsqr is upgraded, when the renderer pipeline changes meaningfully, or when
  the shipped template set changes its distribution. See
  `scripts/calibrate-flip-budget.ts`.

## References

- Chu, H.-K., Chang, C.-S., Lee, R.-R., Mitra, N. (2013). "Halftone QR
  Codes". SIGGRAPH Asia.
- Cox, R. (2014). "QArt Codes" — composite-renderer technique.
- Zhang et al. (2021). "ArtCoder: An End-to-End Method for Generating
  Scanning-Robust Stylized QR Codes". CVPR — Sampling-Sim scoring.
