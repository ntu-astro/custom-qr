# Halftone QR Pipeline Extensions — Design Spec

**Date:** 2026-05-08
**Status:** Draft, awaiting implementation sign-off
**Scope:** Three additions to the halftone QR pipeline — composite renderer (qart.js-style), Sampling-Sim scoring, ART-UP probabilistic flip budget — plus two enabling refactors.

---

## 1. Decisions accepted (closed open questions)

| # | Question | Decision |
|---|---|---|
| Q1 | ART-UP path | **A — real calibration** via fitted logistic regression against jsqr-pass-rate |
| Q2 | Sampling-Sim canvas | **A — predict subpixel canvas with incremental updates** |
| Q3 | Render mode plumbing | **Add `renderMode` to `QrPipelineInput`** (rebuilds pipeline on change) |
| Q4 | Filter API | **Unify into `filter: 'mono' \| 'color'`** at input level; remove `colorHalftone` |
| Q5 | Test ground truth | **jsqr-pass-rate is the integration oracle**; matrix tests across versions × modes × filters |
| Predicted canvas lifecycle | **B — build once with un-flipped matrix**; flips only modify centre-subpixel values, which the renderer overrides at paint time. Reserved-cell topology is invariant under flipping. |

---

## 2. Sequencing

Five PRs, each independently mergeable. Earlier PRs unblock later ones.

```
PR 1 ── filter rename                    [prep, ~1h]
   │
PR 2 ── subpixel canvas extraction       [prep, ~half day]
   │
   ├── PR 3 ── composite renderer        [feature, ~1 day]
   │
   └── PR 4 ── Sampling-Sim scoring      [feature, ~2 days]
            │
            └── PR 5 ── ART-UP budget    [feature, ~1.5 days, optional]
```

Cumulative LoC estimate: ~1,200 added (mostly in `src/lib/`), ~200 modified, ~400 in tests.

---

## 3. Pipeline shape — before and after

### Today

```
buildMatrix ──▶ loadImageData ──▶ computeHalftoneTarget ──▶ pickBestMask ──▶ flipModulesByCodeword ──▶ renderHalftone ──▶ verify
                                  (module-res dither)        (binary score)   (greedy, fixed budget 0.15)   (subpix dither inside)
```

### After all 5 PRs

```
buildMatrix ──▶ loadImageData ──┬──▶ computeHalftoneTarget    ──┐
                                │   (module-res dither)         │
                                └──▶ buildPredictedCanvas ──────┤  (subpix res, mode-aware,
                                                                │   built ONCE from un-flipped matrix —
                                                                │   reserved topology is flip-invariant)
                                                                ▼
                                                         pickBestMask
                                                         (Sampling-Sim score)
                                                                │
                                                                ▼
                                                       flipModulesByCodeword
                                                       (Sampling-Sim Δ-score
                                                        + ART-UP probability gate)
                                                                │
                                                                ▼
                                                       renderHalftone | renderComposite
                                                       (consume predictedCanvas;
                                                        OVERRIDE centre subpixels for flipped modules)
                                                                │
                                                                ▼
                                                              verify
```

Two stages added (`buildPredictedCanvas`); two stages enhanced (`pickBestMask`, `flipModulesByCodeword`); renderer simplified (no longer rasterises/dithers internally).

---

## 4. Shared types changes

### `src/types.ts`

```typescript
export type RenderMode = 'halftone' | 'composite';
export type FilterMode = 'mono' | 'color';

export interface RenderOptions {
  marginPx: number;
  silhouetteScale?: number;
  filter: FilterMode;          // was: colorHalftone: boolean
}
```

### `src/hooks/useQrPipeline.ts`

```typescript
export interface QrPipelineInput {
  url: string;
  templateId: string;
  customSource: CustomSource | null;
  silhouetteScale: number;
  multiSize: boolean;
  renderMode: RenderMode;      // NEW
  filter: FilterMode;          // NEW (replaces inferred-from-templateId logic)
}
```

### `src/lib/predictedCanvas.ts` (new, PR 2)

```typescript
export interface PredictedCanvas {
  /** Subpixel-resolution image data — what the renderer WILL paint everywhere
   *  except for centre subpixels of data modules, which the renderer overrides
   *  using the (post-flip) matrix at paint time. */
  data: ImageData;
  width: number;     // == (matrix.size + 2 * marginCells) * 3
  height: number;
  cellPx: number;    // == 18 in current pipeline
  marginCells: number;
}

export function buildPredictedCanvas(
  source: ImageData,
  matrix: QRMatrix,
  marginCells: number,
  silhouetteScale: number,
  renderMode: RenderMode,
  filter: FilterMode,
): PredictedCanvas;
```

### `src/lib/samplingSim.ts` (new, PR 4)

```typescript
export interface SamplingSimContext {
  predicted: PredictedCanvas;
  matrix: QRMatrix;
  /** Per-module readback value cache, updated incrementally on flips.
   *  size*size; values 0..1 represent averaged camera-readable luma. */
  readback: Float32Array;
}

export function buildSamplingContext(
  predicted: PredictedCanvas,
  matrix: QRMatrix,
): SamplingSimContext;

export function scoreModuleAgainstTarget(
  ctx: SamplingSimContext,
  target: HalftoneTarget,
  mx: number,
  my: number,
): number;

export function applyModuleFlip(
  ctx: SamplingSimContext,
  mx: number,
  my: number,
  newValue: boolean,
): { affected: Array<{ x: number; y: number }> };

export function totalScore(
  ctx: SamplingSimContext,
  target: HalftoneTarget,
): number;
```

### `src/lib/flipBudget.ts` (new, PR 5)

```typescript
export type FlipBudgetPolicy =
  | { kind: 'fixed'; ratio: number }                      // existing behaviour, default until calibration
  | { kind: 'probabilistic'; failureTolerance: number };  // ART-UP

export function shouldAcceptFlip(
  policy: FlipBudgetPolicy,
  blockState: BlockFlipState,
  candidate: CodewordCandidate,
  ctx: SamplingSimContext,
): boolean;
```

---

## 5. Spec — PR 1 · Filter rename

**Goal.** Replace renderer-internal `colorHalftone: boolean` with input-level `filter: 'mono' | 'color'`. Decouples filter intent from render mode (composite mode honours the same flag).

**Touch list.**
- `src/types.ts` — change `RenderOptions.colorHalftone?: boolean` → `RenderOptions.filter: FilterMode`
- `src/lib/halftoneRenderer.ts` (lines 172–282) — rename param and `if (colorHalftone)` checks to `if (filter === 'color')`
- `src/hooks/useQrPipeline.ts` (line 92) — `colorHalftone: templateId === 'custom'` becomes input-level `filter` derived in caller (`App.tsx`) via the same heuristic
- `src/App.tsx` — derive `filter` from `templateId === 'custom' ? 'color' : 'mono'` and pass through
- All `*.test.ts` referencing `colorHalftone` — find-and-replace

**Tests.**
- Existing render tests pass with renamed flag
- Snapshot test confirms identical output bytes for both `'mono'` and `'color'` paths vs. pre-refactor

**Performance.** Zero delta — pure rename.

**Risk.** Low. Mechanical refactor. tsc + lint catch any missed consumer.

---

## 6. Spec — PR 2 · Subpixel canvas extraction

**Goal.** Lift `rasterizeSource` + `liftMarginBrightness` + `ditherFloydSteinberg` calls out of `halftoneRenderer.ts:185–187` into a new `buildPredictedCanvas` step that runs once before the optimiser. Renderer becomes pure paint-from-canvas. As part of the same refactor, **promote four pre-render image-conditioning helpers from `halftoneRenderer.ts` private scope to shared `imageOps.ts` exports** so PR 3's composite renderer can reuse them rather than duplicate.

This is a refactor — same output bytes, work just moved earlier in the pipeline.

### Why the helper extraction is required (not optional)

The four conditioning helpers currently inside `halftoneRenderer.ts` (or inlined inside `imageOps.ts:51–58`) are **not halftone-specific** — they are input-compatibility steps that any renderer accepting our existing input formats (PNG/SVG with transparency, JPEG, WebP, etc.) must run. The walkthrough in §7 of the implementation discussion confirmed this: every JPEG-and-SVG × mono-and-color combination in composite mode hits at least one of these helpers.

Without extraction, PR 3 has only bad choices:
- **Duplicate** the helpers in `compositeRenderer.ts` → drift risk forever (constants like `MAX_INK_LUM = 0.45`, `SILHOUETTE_ALPHA_THRESHOLD = 0.4` would diverge over time)
- **Re-export** them from `halftoneRenderer.ts` just so composite can import → wrong dependency direction; the two renderers are peers
- **Skip** them in composite → user-facing regression (transparent SVG regions paint as black blocks under composite mono; partial-alpha pixels paint random faded colour under composite color; finder patterns lose their margin protection)

So the extraction lands in PR 2 alongside the predicted-canvas refactor. Both renderers in PR 3 onward import from `imageOps.ts`.

### Lifecycle decision (B)

The predicted canvas is **built once before mask selection**, using the un-flipped matrix produced by `buildMatrix`.

**Why this is safe:**

1. The renderer's reserved-cell topology depends only on `matrix.reserved`, which is determined by QR version + ECC level — **invariant under module flipping**. (Flipping changes data-bit values, never which positions are structural.)
2. `liftMarginBrightness` operates on subpixel positions inside the margin band — also independent of which data modules are dark vs. light.
3. The dither / threshold step in `buildPredictedCanvas` does not look at module values at all — it operates on the source image only.
4. The only thing flips change is the centre subpixel value of data modules. The renderer **overrides** the centre subpixel of every data module at paint time using `matrix.modules[my][mx]`, so the predicted canvas's centre-subpixel values for data cells are *unused at render time*. Sampling-Sim uses them as the live state of "what the camera would currently read", and updates them via `applyModuleFlip`.

**Invariant the renderer must enforce:**

> For every data cell `(mx, my)` where `matrix.reserved[my * size + mx] === 0`, the renderer paints the centre subpixel using `matrix.modules[my][mx]`, NOT the value in `predicted.data` at that subpixel position. The centre subpixel of `predicted.data` is owned by Sampling-Sim's incremental state.

A dev-mode assertion will verify `matrix.reserved` topology is unchanged between `buildPredictedCanvas` and renderer entry: both renderers will compute a checksum of the reserved mask at canvas-build time, capture it on the canvas object, and verify it matches the matrix passed to `render()`.

### Touch list

**Step 1 — Promote shared image-conditioning helpers (`src/lib/imageOps.ts`):**

Move the following from `halftoneRenderer.ts` private scope into `imageOps.ts` as named exports. Behaviour-preserving — no semantic changes, just visibility:

| Symbol | Current location | Why composite needs it |
|---|---|---|
| `liftMarginBrightness(rasterised, marginCells, matrixCells)` | `halftoneRenderer.ts:99` | Margin-band white-graduation; required for finder-pattern detection in either renderer |
| `isOutsideSilhouette(data, idx4)` | `halftoneRenderer.ts:162` | Alpha/luma threshold for silhouette detection; composite-color uses it to decide between sampled colour vs. STRUCTURAL_INK fallback |
| `clampLuminosity(r, g, b, max)` | `halftoneRenderer.ts:19` | Caps surround colours below `MAX_INK_LUM = 0.45` so dark/light contrast survives camera read |
| `blendAgainstWhite(rgba): ImageData` | **new** — extracts the inlined `r * a + 255 * (1-a)` blend from `imageOps.ts:51–58` (`ditherFloydSteinberg`) | Without it, composite-mono would threshold transparent regions as black (luma=0), breaking SVG silhouettes |

Existing constants — `MAX_INK_LUM`, `SILHOUETTE_ALPHA_THRESHOLD`, `SILHOUETTE_MAX_LUM`, `STRUCTURAL_INK`, `STRUCTURAL_INK_HEX`, `STRUCTURAL_INK_RGB`, `DARK_PIXEL_LUMA_CUTOFF` — also move with their helpers. `ditherFloydSteinberg` updated to call the new `blendAgainstWhite` helper instead of the inlined version (one-line change, no behaviour delta).

**Step 2 — Refactor `ditherFloydSteinberg` to operate on pre-blended ImageData.**

Currently it does the white-blend internally. After Step 1 it expects pre-blended input. Callers (currently only `halftoneRenderer`) pipeline `blendAgainstWhite` → `ditherFloydSteinberg`. PR 2's `buildPredictedCanvas` for halftone mode does the same. PR 3's composite-mono path calls `blendAgainstWhite` then thresholds.

**Step 3 — `src/lib/predictedCanvas.ts` (new):**

- `buildPredictedCanvas(source, matrix, marginCells, silhouetteScale, renderMode, filter)` returns `PredictedCanvas`
- For `renderMode: 'halftone'`: rasterise at subpixel resolution → `liftMarginBrightness` → `blendAgainstWhite` → `ditherFloydSteinberg` (existing behaviour, just composed from the now-public helpers)
- For `renderMode: 'composite'`: rasterise at subpixel resolution → `liftMarginBrightness` → `blendAgainstWhite` → threshold (`filter: 'mono'`) or pass-through (`filter: 'color'`)
- Stores reserved-mask checksum on the returned object for the renderer's invariant check

**Step 4 — `src/lib/halftoneRenderer.ts`:**

- Remove internal rasterise/dither (work moved to `predictedCanvas.ts`)
- Remove the four helpers/constants that moved to `imageOps.ts`; import them from there instead
- Accept `predicted: PredictedCanvas` instead of `source: ImageData`
- Paint loop unchanged otherwise; centre subpixel of every data cell is sourced from `matrix.modules[my][mx]` (already true)
- On entry: assert `predicted.reservedChecksum === computeChecksum(matrix.reserved)` in dev builds

**Step 5 — `src/hooks/useQrPipeline.ts`:**

- Insert `buildPredictedCanvas` call between `loadImageData` and `pickBestMask`
- Pass the canvas through `flipModulesByCodeword` → `render`

### Tests

- `imageOps.test.ts` — extend with unit tests for the newly-exported helpers (`liftMarginBrightness`, `isOutsideSilhouette`, `clampLuminosity`, `blendAgainstWhite`). Each helper gets a small focused test. No behaviour change but the tests pin contracts so PR 3 + PR 4 can rely on them.
- `predictedCanvas.test.ts` — unit tests for both modes, both filters
- Existing renderer tests must still pass byte-identically (snapshot via `canvas.toDataURL()`)
- New test: build canvas with un-flipped matrix, flip 20 modules, paint via renderer with the flipped matrix; assert output matches a render that built canvas after flipping (proves the topology invariant)

### Performance

Zero net delta. Work moved earlier; renderer faster by exactly the amount the predicted-canvas step costs.

### Risk

**Medium.** The "matrix change doesn't invalidate predicted canvas" invariant must hold.

- *Mitigation:* dev-build assertion (reserved-mask checksum)
- *Mitigation:* test that builds, flips, renders, and compares to "build-after-flip" — caught by the test before any regression ships

---

## 7. Spec — PR 3 · Composite renderer mode (qart.js-style)

**Goal.** Add a second render mode that paints each cell with a centre QR-data subpixel surrounded by 8 cover-image subpixels (thresholded for mono, raw RGB for color). Reuses everything except the paint pass.

### Citation note in code

```typescript
// src/lib/compositeRenderer.ts
/**
 * Composite renderer — binary special case of Chu et al. 2013's module structure
 * (3×3 subpixels, centre preserved). No halftone diffusion, no flipping target.
 * Implementation pattern follows kciter/qart.js (MIT) which is in turn derived
 * from chinuno-usami/CuteR. Reserved-cell handling matches halftoneRenderer
 * (stricter than literal qart.js, which only protects finder corners).
 */
```

### Touch list

`src/lib/compositeRenderer.ts` (new):
- `render(matrix, predicted, opts): HTMLCanvasElement`
- Imports `STRUCTURAL_INK`, `STRUCTURAL_INK_RGB`, `isOutsideSilhouette`, `clampLuminosity` from `imageOps.ts` (promoted in PR 2). No re-implementation, no halftoneRenderer dependency.
- For each cell:
  - **Reserved cell**: full-cell paint with structural ink if `isModuleDark`, clear otherwise. (Matches `halftoneRenderer`'s reserved branch — extract a shared helper if size warrants.)
  - **Data cell**: sample `predicted` at the cell's 9 subpixel positions. Centre subpixel painted with QR module value (structural ink or clear). Surrounding 8 painted with `predicted` values directly. In `filter: 'color'` mode, surround subpixels falling outside the silhouette (per `isOutsideSilhouette`) fall back to `STRUCTURAL_INK` instead of the sampled colour, mirroring halftoneRenderer's treatment.
- Honours `silhouetteScale` and `filter` exactly as `halftoneRenderer` does (predictedCanvas already encodes both).

`src/hooks/useQrPipeline.ts`:
- Dispatch on `renderMode`:
  ```typescript
  const renderFn = renderMode === 'composite' ? renderComposite : renderHalftone;
  const qr = renderFn(matrix, predicted, opts);
  ```
- Extend the effect's deps array: `[..., renderMode, filter]`

`src/components/`:
- One control surface change to expose `renderMode` toggle. Recommend: radio group in `AdvancedOptions.tsx` with values `Halftone | Composite`. UI copy: "Render style".

`src/appReducer.ts`:
- Extend `AdvancedSettings` with `renderMode: RenderMode`
- Extend `initialState` with `renderMode: 'halftone'` (preserve current default)

### Tests

- `compositeRenderer.test.ts` — renders matrix; asserts centre subpixels match QR, surrounding subpixels match predicted canvas, reserved cells fully painted
- Pipeline integration test (`pipelineIntegration.test.ts`, see PR 4): jsqr decode passes for matrix `{V5, V10, V15} × renderMode {halftone, composite} × filter {mono, color}` for at least 2 source images each
- Snapshot test for visual regression

### Performance

Composite renderer: ~30–50 ms vs halftone ~50–100 ms. Net pipeline faster in composite mode because no subpixel dither needed in `buildPredictedCanvas` either.

### Risk

**Medium-low.**

- *Risk:* Composite mode's mono-filter threshold value (currently fixed at 127 in qart.js) may not match the rest of the pipeline's luminance assumptions.
- *Mitigation:* Thread the same `MAX_INK_LUM = 0.45` and `SILHOUETTE_MAX_LUM` constants through composite's threshold logic; reuse `toLuminance` from `colorUtils`.
- *Risk:* Composite mode's centre subpixel against image-coloured surroundings produces lower decode rate than halftone in worst cases.
- *Mitigation:* jsqr matrix test will catch this; if it fails, reduce filter aggressiveness or allow a wider `silhouetteScale` band.

### Out of scope for this PR

Sampling-Sim is *not* required to land composite mode. Composite mode works with today's binary scoring and today's fixed flip budget. PR 3 is shippable on its own.

---

## 8. Spec — PR 4 · Sampling-Sim scoring

**Goal.** Replace the binary mismatch metric in `pickBestMask` and `flipModulesByCodeword` with an ArtCoder-style sampling simulation that scores modules by their camera-readable value (Gaussian-weighted average over the receptive field on the predicted canvas) vs. the target.

### Algorithm

```
For each module (mx, my):
  centre subpixel = matrix.modules[my][mx] ? DARK : LIGHT
  surrounding 8 subpixels = predicted.data values at corresponding subpixel coords
  readback[my * size + mx] = Gaussian-weighted average over 5×5 subpixel window
                             (centred on the module's centre subpixel)

Score for module = importance[my][mx] · |readback[my][mx] - target_value|
  where target_value = target.target[my][mx] ? DARK : LIGHT (in 0..1 luma)

Sum over all modules = total score. Lower = better.
```

### Kernel parameters (initial defaults)

- 5×5 subpixel window (= ~5/3 modules across, supports modest blur)
- Gaussian σ = 1 subpixel
- Centre weight ~0.4, edge weight ~0.05

These are starting values. Will be tuned during the calibration script for ART-UP (PR 5) — same data captures both.

### Incremental update

When a module flips:

1. Toggle `predicted.data` at the module's centre subpixel (this is the only subpixel whose value depends on the matrix)
2. Recompute `readback[]` for every module within the receptive radius (~5×5 = 25 modules) of the flipped module
3. Recompute the contribution of those modules to the total score

Each flip → ~25 readbacks recomputed × ~25 weighted ops = ~625 ops per flip. 150 flips → ~100k ops total, single-digit ms.

### Touch list

`src/lib/samplingSim.ts` (new):
- `buildSamplingContext(predicted, matrix)` — initial full pass
- `scoreModuleAgainstTarget(ctx, target, mx, my)` — single-module score
- `applyModuleFlip(ctx, mx, my, newValue)` — toggles predicted centre subpixel, returns affected module list for re-scoring
- `totalScore(ctx, target)` — sum across all modules

`src/lib/maskOptimizer.ts`:
- Replace `scoreMask` with a Sampling-Sim-aware variant that takes `predicted` (per-mask) and uses `samplingSim.totalScore`
- Each mask candidate produces a different matrix → different centre-subpixel values in predicted canvas. Build `SamplingSimContext` per mask: 8 × `buildSamplingContext` ≈ ~50 ms, plus 8 × `totalScore` ≈ ~30 ms ≈ +60–80 ms total in mask scoring

`src/lib/moduleFlipper.ts`:
- Keep the per-block iteration structure
- Replace per-codeword `score` (importance × disagreement) with Sampling-Sim Δ-score: "if I flip this codeword's modules, how much does total score improve?"
- Use `applyModuleFlip` to apply accepted flips and update incremental state

`src/hooks/useQrPipeline.ts`:
- Build `SamplingSimContext` after `buildPredictedCanvas`
- Pass to `pickBestMask` and `flipModulesByCodeword`

### Tests

- `samplingSim.test.ts` — unit tests:
  - Empty matrix → uniform readback
  - Single dark module surrounded by light subpixels → readback < threshold (camera reads light-ish)
  - Single light module surrounded by dark subpixels → readback > threshold
  - Flip then unflip → state matches initial (deterministic)
  - **Incremental update matches full rebuild (golden test)** — non-negotiable
- `pipelineIntegration.test.ts` — jsqr decode rate **must not regress** vs PR 3 baseline. Specifically: across the test matrix, every QR that decodes pre-PR-4 must still decode post-PR-4. Optionally: at least N% of cases see lower total Sampling-Sim score (validates the metric is doing something).

### Performance

+60–100 ms typical (V10). Reaches ~310 ms total halftone, ~280 ms composite.

### Risk

**Highest of the three PRs.**

- *Risk:* Naive (non-incremental) flip evaluation scales O(flips × modules × kernel) → blows up to seconds.
- *Mitigation:* Incremental update is non-negotiable. The "incremental matches full rebuild" test is the safety net.
- *Risk:* Kernel parameters (σ, window size) untuned → may not actually improve decode rate.
- *Mitigation:* PR 5's calibration script will tune these. PR 4 ships with conservative defaults that empirically don't regress jsqr decode rate (test gate).
- *Risk:* Sampling-Sim retiring `NON_SILHOUETTE_FLOOR` could subtly change visual output.
- *Mitigation:* Don't retire it in PR 4. Keep both; assess in a follow-up.

### Side change

The `target.importance` field stays as-is (per-module weight × Sampling-Sim contrast = combined score). No data shape change.

---

## 9. Spec — PR 5 · ART-UP probabilistic flip budget

**Goal.** Replace the hardcoded `0.15 × ecCount` per-block flip budget with a per-flip acceptance gate driven by a calibrated decode-failure probability. Each flip is accepted only if the cumulative probability of *any* module in the affected RS block becoming uncorrectable stays under a tolerance.

### Calibration tooling

`scripts/calibrate-flip-budget.ts` (new, run via `tsx`):

1. Generate a corpus: ~120 QR codes across (V5, V10, V15) × {halftone, composite} × {mono, color} × 2 source templates × 5 flip-count buckets (0%, 5%, 15%, 30%, 49% of ecCount per block, randomly distributed).
2. For each rendered QR, capture per-flipped-module features:
   - Surround-luma contrast (avg luma of surrounding 8 subpixels — DARK or LIGHT)
   - Centre-subpixel value
   - Distance to nearest finder pattern (modules)
   - RS block id and codeword position
3. For each QR, run jsqr at native size and 200×200. Record decode success/failure per block.
4. Fit a logistic regression: `P(decode_failure | features)`. Pool blocks across versions → single coefficient set.
5. Output `src/lib/flipBudget.calibration.ts`:
   ```typescript
   export const ART_UP_COEFFICIENTS = {
     intercept: -3.21,
     surroundContrast: 0.84,
     centreCorrelation: 1.12,
     finderDistance: -0.07,
   } as const;
   export const DEFAULT_FAILURE_TOLERANCE = 0.05;  // 5% per-block decode failure budget
   ```

This script runs once. Re-run only if jsqr is upgraded or rendering parameters change materially.

### Runtime usage

`src/lib/flipBudget.ts` (new):
- `decodeFailureProb(features, coeffs): number` — sigmoid eval, ~10 flops
- `shouldAcceptFlip(blockState, candidate, ctx): boolean`
  - Compute per-flipped-module features from `ctx`
  - Aggregate per-block: `1 - prod(1 - p_i)` → cumulative failure probability for the block
  - Accept if cumulative < `DEFAULT_FAILURE_TOLERANCE`

`src/lib/moduleFlipper.ts`:
- Block-level loop changes from "flip top-K codewords until budget exhausted" to "flip top-N codewords (sorted by Sampling-Sim Δ-score) until cumulative failure probability exceeds tolerance"

### Touch list

- `src/lib/flipBudget.ts` (new, ~80 LoC)
- `src/lib/flipBudget.calibration.ts` (new, ~20 LoC, generated)
- `scripts/calibrate-flip-budget.ts` (new, ~250 LoC, dev-only)
- `src/lib/moduleFlipper.ts` — replace budget loop
- `src/hooks/useQrPipeline.ts` — optionally expose `FlipBudgetPolicy` from input (otherwise default to ART-UP)

### Backwards-compat fallback

- `FlipBudgetPolicy` union exposes both `'fixed'` and `'probabilistic'`
- Default ships as `'probabilistic'` once calibrated
- Advanced setting `flipBudgetPolicy` lets us switch back to `{ kind: 'fixed', ratio: 0.15 }` if a regression appears in production
- Old constant `DEFAULT_ECC_BUDGET_RATIO` stays in code as the `'fixed'` default (no rip-out)

### Tests

- `flipBudget.test.ts` — sigmoid math, monotonicity (more flips → higher P(failure)), edge cases (no flips, full ecCount flips)
- Integration: jsqr decode rate across test matrix must not regress vs PR 4. With `failureTolerance = 0.05`, at least the PR 4 jsqr-pass set still passes; ideally a measurably larger image-fidelity score (Sampling-Sim total) than PR 4's fixed-ratio output.

### Performance

+5–10 ms typical (V10). Logistic regression eval is essentially free.

### Risk

Calibration quality drives everything.

- *Risk:* Calibration corpus too small / unrepresentative → coefficients fit jsqr noise rather than true decode behaviour.
- *Mitigation:* Calibration script outputs goodness-of-fit metrics (R², AUC). Only accept calibration with AUC > 0.85. If it doesn't fit, ship with `'fixed'` policy and document as a known limitation.
- *Risk:* jsqr ≠ phone cameras, so even good jsqr calibration may not generalise to real-world.
- *Mitigation:* jsqr is *stricter*, so calibrating against jsqr is conservative — phones should decode at higher rates than the model predicts. Test-the-claim by manual phone-camera spot-check on 5–10 QRs after PR 5 lands.

---

## 10. Cross-cutting concerns

### 10.1 Test matrix (lives in `pipelineIntegration.test.ts`)

```
versions:    [V5, V10, V15]
renderModes: [halftone, composite]
filters:     [mono, color]
sources:     [astro silhouette, sample colour photo]
sizes:       [native, 200×200]
```

= 3 × 2 × 2 × 2 × 2 = **48 jsqr decode assertions**. All must pass.

Re-runs on every PR. PR 3 lands the matrix structure (with halftone-only behaviour as the baseline). Subsequent PRs add their assertions.

### 10.2 Performance budget

Wall-clock targets at V10 on M-class hardware:

| Mode | Today | After PR 3 | After PR 4 | After PR 5 |
|---|---|---|---|---|
| Halftone | ~230 ms | ~225 ms | ~310 ms | ~315 ms |
| Composite | n/a | ~210 ms | ~280 ms | ~285 ms |

**Hard limit:** pipeline must complete under **500 ms at V10**. If a PR breaches that, hold and profile before landing.

### 10.3 Telemetry

Client-side app, no backend → no telemetry. The visible feedback loop is:

- `pipelineError` surfaced in UI (existing)
- `scanResults` from `verify` rendered as the scan badge (existing)
- Add: `isSlow` boolean (>500 ms) surfaced as a yellow notice in dev mode only — purely a developer-feedback signal, not user-facing

### 10.4 Backwards compatibility

- All public APIs of `useQrPipeline` are extended with optional fields where possible (`renderMode` defaults to `'halftone'`, `filter` derived from `templateId === 'custom'` if not specified)
- `RenderOptions.colorHalftone` is removed (breaking) — no public consumers besides this codebase
- `DEFAULT_ECC_BUDGET_RATIO` and `flipModulesByCodeword`'s `FlipOptions.budgetRatio` remain (used by `FlipBudgetPolicy: 'fixed'`)

### 10.5 Documentation

After all PRs:

- Update `CLAUDE.md` "Touching the halftone pipeline" section with new stages
- Update `CLAUDE.md` author typo (Hsu → Mitra)
- Add a short `docs/PIPELINE.md` with the data-flow diagram from §3
- Inline JSDoc on new public types

---

## 11. Risk register (summary)

| Risk | Severity | PR | Mitigation |
|---|---|---|---|
| Predicted canvas drifts when matrix changes between build and render | High | PR 2 | Reserved-mask checksum + dev-mode invariant assertion + test that proves render-after-flip == build-after-flip |
| Sampling-Sim incremental update bug → wrong scores → bad QR | High | PR 4 | Incremental-vs-full rebuild equality test |
| ART-UP coefficients overfit to jsqr noise | Medium | PR 5 | AUC > 0.85 gate; fallback to fixed policy |
| Composite mode decode rate worse than halftone | Medium | PR 3 | jsqr matrix test must pass |
| Performance regression past 500 ms | Medium | PR 4 | Profile before landing; hard hold if breached |
| `colorHalftone` rename misses a consumer | Low | PR 1 | tsc + lint catch refs |
| Calibration script bit-rots between calibration runs | Low | PR 5 | Document re-run conditions; CI runs script in dry-mode periodically |

---

## 12. What to revisit later

Things deliberately deferred — design them now in your head, decide later if they justify their own work.

- **Phone-camera tolerance test.** Current oracle is jsqr (strict). If users report scan failures despite jsqr passing, build a manual phone-test harness (visual review of N QRs printed at known sizes).
- **Web Worker offload.** If the 310–315 ms total pipeline ever feels sluggish on a slider drag (silhouette scale, etc.), move `pickBestMask` + `flipModulesByCodeword` + `verify` into a Worker. ~300 LoC, blocks UI for postMessage round-trips, worth it past ~500 ms perceived latency.
- **Retire `NON_SILHOUETTE_FLOOR`.** Once PR 4 lands and Sampling-Sim is contributing context-aware scores, the 0.1 floor is probably redundant. Remove only after empirical confirmation that decode rate doesn't regress without it.
- **More render modes.** Cox-style QArt (linear-algebra over GF(2)) is the natural next mode. Different algorithm, different code path, doesn't conflict with this work — would slot in alongside `renderHalftone` / `renderComposite` as a third option, with its own optimiser branch (no `pickBestMask` / `flipModulesByCodeword` needed; Cox's encoding *is* the optimisation).
- **Multi-resolution Sampling-Sim.** Current kernel is fixed 5×5. A real camera's effective kernel size depends on viewing distance — at large distances, more blur, more module-merging. Could parameterise `kernel size` by intended print size.

---

## 13. References

### Implementations referenced

- **kciter/qart.js** ([github.com/kciter/qart.js](https://github.com/kciter/qart.js)) — composite renderer reference, MIT licensed
- **chinuno-usami/CuteR** ([github.com/chinuno-usami/CuteR](https://github.com/chinuno-usami/CuteR)) — earlier Python tool, qart.js's stated inspiration
- **rsc.io/qr** ([research.swtch.com/qart](https://research.swtch.com/qart)) — Cox QArt, considered for "More render modes" follow-up

### Academic references

- **Chu, Chang, Lee, Mitra** (2013). "Halftone QR Codes." *SIGGRAPH Asia* — the project's foundational paper. [DOI 10.1145/2508363.2508408](https://dl.acm.org/doi/10.1145/2508363.2508408)
- **Su, Lin, Jin, Liu, Zhao** (2021). "ArtCoder: An End-to-End Method for Generating Scanning-Robust Stylized QR Codes." *CVPR* — source of Sampling-Simulation scoring approach. [PDF](https://openaccess.thecvf.com/content/CVPR2021/papers/Su_ArtCoder_An_End-to-End_Method_for_Generating_Scanning-Robust_Stylized_QR_Codes_CVPR_2021_paper.pdf)
- **Xu, Su, Lin, Lin, Yang, Jin, Liu** (2018). "ART-UP: A Novel Method for Generating Scanning-Robust Aesthetic QR Codes." *ACM TOMM* — source of probabilistic flip-budget approach. [arXiv:1803.02280](https://arxiv.org/abs/1803.02280)

---

**End of spec.** Awaiting sign-off to begin PR 1.
