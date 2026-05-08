# Halftone QR Pipeline Extensions — Implementation Plan

**Date:** 2026-05-08
**Status:** Draft
**Spec:** [`docs/superpowers/specs/2026-05-08-pipeline-extensions-design.md`](../specs/2026-05-08-pipeline-extensions-design.md)
**Branch convention:** each phase is a separate PR off `main`. Sub-phases inside Phase 1 are also separate PRs (mergeable independently per [design spec §2](../specs/2026-05-08-pipeline-extensions-design.md#2-sequencing)).

---

## How to read this document

The spec describes **5 PRs**. The user-facing roadmap groups them into **3 phases** keyed off the user-visible feature each one ships:

| Phase | User-visible feature | Spec PRs included |
|---|---|---|
| **Phase 1 — Composite renderer** | New "Render style: Halftone / Composite" toggle | spec PR 1 (filter rename), PR 2 (subpixel canvas + image-conditioning helpers refactor), PR 3 (composite renderer) |
| **Phase 2 — Sampling-Sim scoring** | Higher decode rate at same fidelity (no UI change) | spec PR 4 |
| **Phase 3 — ART-UP probabilistic flip budget** | Stronger fidelity at same decode rate (advanced setting) | spec PR 5 |

Sub-phases inside Phase 1 are labelled **1a / 1b / 1c** and map 1:1 to spec PRs 1 / 2 / 3. Each sub-phase is independently mergeable; do not collapse them into a single PR — the spec is explicit that the prep refactors must land first.

The shared **image-conditioning helpers refactor** (move `liftMarginBrightness`, `isOutsideSilhouette`, `clampLuminosity`, and the new `blendAgainstWhite` from `halftoneRenderer.ts` private scope into `imageOps.ts`) lands inside Phase 1b alongside the predicted-canvas refactor — **not** as a fourth standalone PR. See [design spec §6 "Why the helper extraction is required (not optional)"](../specs/2026-05-08-pipeline-extensions-design.md#6-spec--pr-2--subpixel-canvas-extraction) for the rationale.

---

## Sequencing & dependencies

```
Phase 1a (filter rename) ─────────┐
   │                              │
   ▼                              │
Phase 1b (subpixel canvas +       │
          imageOps helper move) ──┼─── unblocks Phase 1c, Phase 2
   │                              │
   ▼                              │
Phase 1c (composite renderer) ────┘
   │
   ▼
Phase 2  (Sampling-Sim) ──────────────── unblocks Phase 3
   │
   ▼
Phase 3  (ART-UP, optional)
```

**Hard sequencing constraints:**

1. Phase 1a must land before 1b — 1b's `buildPredictedCanvas` accepts a `FilterMode` value; the rename is the cleanest way to introduce that type.
2. Phase 1b must land before 1c — composite renderer imports `liftMarginBrightness`, `isOutsideSilhouette`, `clampLuminosity`, `blendAgainstWhite`, `STRUCTURAL_INK*`, `MAX_INK_LUM`, `SILHOUETTE_*` from `imageOps.ts`. Without 1b they're still private to `halftoneRenderer.ts`.
3. Phase 1b must land before Phase 2 — Sampling-Sim consumes the `PredictedCanvas` and operates on subpixel data. Without the canvas extraction, Sampling-Sim would need to re-rasterise inside the optimiser.
4. Phase 1c is **not** a Sampling-Sim prerequisite — Sampling-Sim works against the halftone renderer too. Phase 2 may land before Phase 1c if the team prefers, but the order shown is what the spec recommends.
5. Phase 3 is optional and depends entirely on Phase 2 (it scores ΔP(failure) using the `SamplingSimContext`).

**Shared helpers land first.** Phase 1b is the consolidation point: every subsequent phase imports from `imageOps.ts` rather than from `halftoneRenderer.ts`. No subsequent PR should reach into the private scope of `halftoneRenderer.ts`.

---

## Cross-cutting concerns

### Performance budget

[Design spec §10.2](../specs/2026-05-08-pipeline-extensions-design.md#102-performance-budget) sets the per-version targets. Concretely:

- **Hard ceiling**: pipeline must complete under **500 ms at V10** on M-class hardware.
- **Per-phase gate**: each phase adds an `isSlow` developer-only check (>500 ms wall-clock) before declaring done. Implementation: a `console.warn` gated on `import.meta.env.DEV` inside `useQrPipeline`'s `buildQr` async fn, measuring `performance.now()` start-to-end.
- **Phase 2 is the highest-risk addition** (60–100 ms typical). Profile before merge using the existing `pipelineIntegration.test.ts` matrix — record total time per case and abort merge if any case exceeds 500 ms.
- **Phase 3 is a near-zero cost** (~5–10 ms) but its calibration script (`scripts/calibrate-flip-budget.ts`) takes minutes to run; that runtime is outside the pipeline budget.

### Determinism

The seeded PRNG in `composer.ts` (`mulberry32` keyed off `caption.length + size.width + size.height`) is **untouched** by all three phases. New random behaviour is deliberately avoided:

- **Phase 1c (composite renderer)**: deterministic — pure paint-from-canvas.
- **Phase 2 (Sampling-Sim)**: deterministic — Gaussian kernel coefficients are constants. The incremental-update test (see Phase 2 test plan) explicitly asserts that flip-then-unflip restores the original state byte-for-byte.
- **Phase 3 (ART-UP)**: deterministic — the logistic-regression coefficients in `flipBudget.calibration.ts` are static at runtime. The calibration script itself is non-deterministic (samples random flip subsets) but its output is checked into source.

### Backward compatibility

Locked decisions in `CLAUDE.md` that **must not be violated** without explicit spec override:

| Locked decision | Affected phase | Plan stance |
|---|---|---|
| ECC level H, hardcoded | All | Untouched. Sampling-Sim and ART-UP both assume `getEccLayoutForH`. |
| No quiet zone (`CANVAS_MARGIN_PX = 0`) | All | Untouched. The `marginCells` parameter to `buildPredictedCanvas` accepts whatever the renderer was already using. |
| `qrcode@1.5.4` exact-pinned | All | Untouched. No new reliance on `qr.modules` private API beyond what `qrMatrix.ts` already does. |
| `canvas` (node-canvas) devDep stays | All | Untouched. Sampling-Sim's incremental algorithm operates on `Float32Array`/`Uint8ClampedArray` directly, not via `getContext('2d')` — so Sampling-Sim adds no new jsdom-canvas dependency in tests. |
| Tailwind v4 with Vite plugin, no `tailwind.config.ts` | Phase 1c (UI control) | Honoured — new `renderMode` radio uses existing utility classes only. |
| `useQrPipeline` hook / poster `useMemo` split | Phase 1c, Phase 2 | Preserved. New deps (`renderMode`, `filter`) added to the existing pipeline hook's deps array; no new poster recompute trigger. |
| Immutable reducer pattern | Phase 1c (advanced settings) | Preserved. New `renderMode` field flows through existing `PATCH_ADVANCED` action. |

**Persisted state:** `getInitialState` in `appReducer.ts` only rehydrates `url`, `templateId`, `caption`. `renderMode` is **not** persisted — it stays at the `'halftone'` default on every reload. This is intentional (matches the existing pattern for `multiSize` / `silhouetteScale`) and preserves the existing localStorage schema, so no `PERSIST_KEY` bump is needed.

**Existing templates:** the 6 entries in `src/templates/presets.ts` (`earth`, `orion`, `scorpius`, `crux`, `sagittarius-teapot`, `ntuas`) work in both `halftone` and `composite` modes without modification. No changes to `TemplatePreset` shape.

### Accessibility / UX of the new "Render style" control

Phase 1c adds the only new user-visible control. Constraints:

- **Radio group** in `AdvancedOptions.tsx` (the design space already has the silhouette-scale slider and multi-size checkbox; render mode fits the same advanced surface).
- Label copy: **"Render style"** with options "Halftone" (default) and "Composite". One-line helper text below: *"Halftone diffuses the image across all modules; Composite paints a clean QR centre with the image as surround."* (≤ 100 chars to fit alongside the existing slider.)
- Keyboard navigation: native `<input type="radio" name="renderMode">` works with arrow keys.
- ARIA: a `<fieldset>` + `<legend>` wraps the two radios so screen readers announce the group.
- Default visually emphasised: "Halftone" radio gets the existing `font-semibold` styling used elsewhere when default-selected.
- No additional Tailwind tokens needed.

---

## Out of scope

The spec mentions these but the plan **defers** them. Cite spec section when objecting.

1. **Phone-camera tolerance test** — [spec §12](../specs/2026-05-08-pipeline-extensions-design.md#12-what-to-revisit-later). Manual harness, post-Phase 3.
2. **Web Worker offload** — spec §12. Only triggered if perceived latency >500 ms; not on the critical path.
3. **Retiring `NON_SILHOUETTE_FLOOR`** — [spec §8 "Side change"](../specs/2026-05-08-pipeline-extensions-design.md#8-spec--pr-4--samplingsim-scoring) and §12. Phase 2 keeps the floor; a follow-up PR retires after empirical confirmation.
4. **Cox QArt mode / additional render modes** — spec §12.
5. **Multi-resolution Sampling-Sim** — spec §12. Kernel size stays fixed at 5×5 in Phase 2.
6. **`isSlow` UI surface** — [spec §10.3](../specs/2026-05-08-pipeline-extensions-design.md#103-telemetry) describes it as dev-only. The plan implements it as a `console.warn` only; no user-visible badge.
7. **Re-deriving codeword/ECC tables** — locked decision. ART-UP works at the existing block granularity.
8. **`CLAUDE.md` author typo fix (Hsu → Mitra)** — [spec §10.5](../specs/2026-05-08-pipeline-extensions-design.md#105-documentation). Bundled into the Phase 3 documentation pass, not its own PR.

---

# Phase 1 — Composite renderer (and prep refactors)

This phase is **three separately-merged PRs** (1a → 1b → 1c). Each sub-phase has its own goal, file list, tests, and verification. Do not merge them as a single PR.

---

## Phase 1a — Filter rename

**Spec:** [§5 PR 1 · Filter rename](../specs/2026-05-08-pipeline-extensions-design.md#5-spec--pr-1--filter-rename)

### Goal & success criteria

Replace the boolean `colorHalftone` flag with a string union `filter: 'mono' | 'color'`, threaded as a top-level pipeline input rather than inferred inside the renderer. Pure rename — zero behaviour change.

**Done when:**
- [ ] `RenderOptions.colorHalftone` is gone; `RenderOptions.filter: FilterMode` is its replacement.
- [ ] `FilterMode` type is exported from `src/types.ts`.
- [ ] All references compile (`npm run typecheck` passes with zero errors).
- [ ] Snapshot test in `halftoneRenderer.test.ts` produces byte-identical output for both `'mono'` (was `colorHalftone: false`) and `'color'` (was `colorHalftone: true`) paths.
- [ ] `npm run lint` passes with zero warnings.
- [ ] All existing tests pass without modification beyond the rename find-and-replace. (`filter` stays **optional** with a `'mono'` default — preserving today's `?? false` semantics — so call sites that omit the field do not need to be touched.)

### File-by-file changes

| File | Change |
|---|---|
| `src/types.ts` | Add `export type FilterMode = 'mono' \| 'color';`. Replace `colorHalftone?: boolean` in `RenderOptions` with `filter?: FilterMode` (**optional**, default `'mono'` — preserves today's `?? false` semantics so existing call sites that omit the field still compile). |
| `src/lib/halftoneRenderer.ts` | Rename function param `colorHalftone: boolean` → `filter: FilterMode` at lines 172–282. Replace every `if (colorHalftone)` / `colorHalftone ?` with `if (filter === 'color')` / `filter === 'color' ?`. Update the `render()` entry point at line 260 to read `const filter = opts.filter ?? 'mono'` (mirrors the previous `?? false` default; the field stays optional in `RenderOptions`). Phase 1c may promote it to required if the new `renderMode` toggle warrants. |
| `src/hooks/useQrPipeline.ts` | Stop inferring `colorHalftone: templateId === 'custom'` at line 92. Read `filter` from `QrPipelineInput` and pass through. |
| `src/hooks/useQrPipeline.ts` (interface) | Extend `QrPipelineInput` with `filter: FilterMode`. |
| `src/App.tsx` | Compute `filter = templateId === 'custom' ? 'color' : 'mono'` and pass to `useQrPipeline`. (This preserves today's heuristic; Phase 1c may move it elsewhere if the new `renderMode` toggle warrants.) |
| `src/lib/halftoneRenderer.test.ts` | Find-and-replace `colorHalftone: false` → `filter: 'mono'`, `colorHalftone: true` → `filter: 'color'`. |
| `src/lib/pipeline.integration.test.ts` | Same find-and-replace at lines 42 + 73. |
| Any other test referencing the old field | Find-and-replace. Run `grep -r 'colorHalftone' src/ e2e/` to enumerate. |

### Type / data-shape changes

```typescript
// src/types.ts
export type FilterMode = 'mono' | 'color';

export interface RenderOptions {
  marginPx: number;
  silhouetteScale?: number;
  filter?: FilterMode;         // was: colorHalftone?: boolean — stays optional, default 'mono'
}

// src/hooks/useQrPipeline.ts
export interface QrPipelineInput {
  url: string;
  templateId: string;
  customSource: CustomSource | null;
  silhouetteScale: number;
  multiSize: boolean;
  filter: FilterMode;          // NEW
}
```

### Algorithm sketch

None — pure rename.

### Test plan

**Add:**
- *No new test files.* Optionally add a one-off snapshot assertion in `halftoneRenderer.test.ts` that compares `filter: 'mono'` and `filter: 'color'` outputs to known-good `toDataURL()` strings captured before the rename. Drop the snapshot once 1a merges (purpose is to gate the rename, not lock the bytes for the long term).

**Update:**
- All test files referencing `colorHalftone` (mechanical).

**Must keep passing without modification:**
- `composer.test.ts`, `qrMatrix.test.ts`, `halftoneTarget.test.ts`, `maskOptimizer.test.ts`, `moduleFlipper.test.ts`, `codewordLayout.test.ts`, `decodeQrImage.test.ts`, `posterSize.test.ts`, `scanVerifier.test.ts`, `imageOps.test.ts` — none of these touch the renamed field.

### Verification

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
```

All five must pass per [`CLAUDE.md` § Verifying changes](../../../CLAUDE.md).

### Risks & rollback

- **Risk:** missed consumer in a place `grep` doesn't catch (e.g., a string-templated test fixture). *Detection:* `tsc` will catch type errors; lint will catch unused variables; the snapshot assertion above catches behaviour drift.
- **Rollback:** single revert. No data migrations, no persisted state changes.

### Open questions

- *None* — mechanical refactor. The only judgement call is the `App.tsx` heuristic, which is preserved verbatim and will be revisited in Phase 1c.

---

## Phase 1b — Subpixel canvas extraction + shared image-conditioning helpers refactor

**Spec:** [§6 PR 2 · Subpixel canvas extraction](../specs/2026-05-08-pipeline-extensions-design.md#6-spec--pr-2--subpixel-canvas-extraction)

### Goal & success criteria

Split into two simultaneous changes that ship as one PR (the spec is explicit they share scope per [§6 "Why the helper extraction is required (not optional)"](../specs/2026-05-08-pipeline-extensions-design.md#6-spec--pr-2--subpixel-canvas-extraction)):

1. **Extract** the rasterise / lift-margin / dither work from `halftoneRenderer.ts:185–187` into a new `buildPredictedCanvas` step that runs once before the optimiser.
2. **Promote** `liftMarginBrightness`, `isOutsideSilhouette`, `clampLuminosity`, and the new `blendAgainstWhite` from `halftoneRenderer.ts` private scope to `imageOps.ts` named exports — together with the constants they depend on.

Output of the renderer must remain **byte-identical** to pre-refactor for the existing halftone pipeline.

**Done when:**
- [ ] `src/lib/predictedCanvas.ts` exists; exports `PredictedCanvas` interface + `buildPredictedCanvas` function.
- [ ] `src/lib/imageOps.ts` exports the four helpers + their supporting constants.
- [ ] `src/lib/halftoneRenderer.ts` no longer rasterises / dithers internally; it accepts a `PredictedCanvas` and paints from it.
- [ ] Reserved-mask checksum invariant assertion fires in dev builds; no-op in production.
- [ ] New test `predictedCanvas.test.ts` covers both `renderMode` × both `filter` combinations.
- [ ] New test in `halftoneRenderer.test.ts`: build canvas with un-flipped matrix, flip 20 modules, paint with flipped matrix; assert byte-equality with build-after-flip path. (Proves the [§6 "Lifecycle decision (B)"](../specs/2026-05-08-pipeline-extensions-design.md#6-spec--pr-2--subpixel-canvas-extraction) invariant.)
- [ ] `imageOps.test.ts` extended with focused unit tests for each newly-exported helper.
- [ ] Existing `halftoneRenderer.test.ts` snapshot tests still pass byte-identically.
- [ ] All five `npm` verification gates pass.

### File-by-file changes

| File | Action | Description |
|---|---|---|
| `src/lib/imageOps.ts` | **Modify** | Add named exports: `liftMarginBrightness`, `isOutsideSilhouette`, `clampLuminosity`, `blendAgainstWhite`. Add named export of constants: `MAX_INK_LUM`, `SILHOUETTE_ALPHA_THRESHOLD`, `SILHOUETTE_MAX_LUM`, `STRUCTURAL_INK`, `STRUCTURAL_INK_HEX`, `STRUCTURAL_INK_RGB`, `DARK_PIXEL_LUMA_CUTOFF`. Refactor `ditherFloydSteinberg` to call `blendAgainstWhite` rather than inline the alpha-blend at lines 51–58. **Contract change:** `ditherFloydSteinberg` now expects pre-blended input — every caller must call `blendAgainstWhite` first. Three call sites today: `halftoneRenderer.ts` (existing), `halftoneTarget.ts:46` (existing — see below), and the new `predictedCanvas.ts`. |
| `src/lib/predictedCanvas.ts` | **Create** | New module. Exports `PredictedCanvas` interface and `buildPredictedCanvas(source, matrix, marginCells, silhouetteScale, renderMode, filter): PredictedCanvas`. |
| `src/lib/halftoneTarget.ts` | **Modify** | At line 46, pipeline `blendAgainstWhite` before `ditherFloydSteinberg(rasterised)` to match the new contract. Without this update, `rasterizeSource`'s alpha-0 letterbox pixels (where `silhouetteScale < 1` clears outside-silhouette regions) will read as luma=0 instead of luma=255, **inverting the silhouette target** for every transparent-background template (5 of 6 shipped). Update the docstring at lines 38–44 — it currently references the dither's internal alpha blend. |
| `src/lib/halftoneRenderer.ts` | **Modify** | Delete the four helpers (now imported from `imageOps.ts`). Delete the supporting constants. Change `render(matrix, source, opts)` signature to `render(matrix, predicted, opts)`. Remove internal rasterise/lift/dither calls — those are in `predictedCanvas.ts` now. Add dev-mode `assert(predicted.reservedChecksum === computeChecksum(matrix.reserved))` at the top of `render`. Keep `pickInkColor`, `eachCell`, `readPixel`, `subSampleInkRgb`, the painting loop — all unchanged. |
| `src/lib/halftoneRenderer.ts` | **Re-export** | Keep `STRUCTURAL_INK_HEX` re-export from this file (it is consumed elsewhere — verify with `grep`). If still used, re-export from `halftoneRenderer.ts` as `export { STRUCTURAL_INK_HEX } from './imageOps';`. |
| `src/hooks/useQrPipeline.ts` | **Modify** | Insert `const predicted = buildPredictedCanvas(imageData, baseMatrix, marginCells, silhouetteScale, 'halftone', filter);` between `loadImageData` and `pickBestMask`. Pass `predicted` to `renderHalftone` instead of `imageData`. (`marginCells` derived from `CANVAS_MARGIN_PX` exactly as the renderer did.) |
| `src/lib/predictedCanvas.test.ts` | **Create** | Unit tests; see Test plan below. |
| `src/lib/imageOps.test.ts` | **Modify** | Append focused test cases for each newly-exported helper. |
| `src/lib/halftoneRenderer.test.ts` | **Modify** | Adapt call sites to pass `PredictedCanvas` instead of raw `ImageData`. Add the "build pre-flip, paint post-flip == build post-flip, paint post-flip" invariant test. Existing snapshot tests must still pass byte-identically. |
| `src/lib/pipeline.integration.test.ts` | **Modify** | Adapt to construct a `PredictedCanvas` between `loadImageData` and `renderHalftone`. |

### Type / data-shape changes

```typescript
// src/lib/predictedCanvas.ts
import type { QRMatrix, FilterMode, RenderMode } from '../types';

export interface PredictedCanvas {
  /** Subpixel-resolution image data — what the renderer WILL paint everywhere
   *  except the centre subpixel of data modules, which the renderer overrides
   *  using the (post-flip) matrix at paint time. */
  data: ImageData;
  /** Equals (matrix.size + 2 * marginCells) * 3. */
  width: number;
  height: number;
  /** Module side length in canvas pixels. Equals 18 in the current pipeline. */
  cellPx: number;
  marginCells: number;
  /** Cheap fingerprint of the matrix.reserved mask used to construct this canvas.
   *  Both renderers verify this matches `computeChecksum(matrix.reserved)` at
   *  paint time, in dev builds only — guards the §6 lifecycle-decision-B
   *  invariant that flips never mutate reserved-cell topology. */
  reservedChecksum: number;
  /** Stash of the rasterised-but-undithered subpixel data, retained for the
   *  composite renderer's colour sampling and for Sampling-Sim's "what would
   *  the camera read" calculations. For halftone+mono this equals
   *  `liftMarginBrightness(rasterised)` pre-blend. */
  raster: ImageData;
}

export function buildPredictedCanvas(
  source: ImageData,
  matrix: QRMatrix,
  marginCells: number,
  silhouetteScale: number,
  renderMode: RenderMode,        // accepts 'halftone' | 'composite' (Phase 1c uses both)
  filter: FilterMode,
): PredictedCanvas;
```

`RenderMode` is introduced here in 1b (not 1c) so the function signature is final from day one. The renderer dispatch (1c) imports it from `src/types.ts`.

```typescript
// src/types.ts (added in 1b)
export type RenderMode = 'halftone' | 'composite';
```

The `imageOps.ts` exports add **no new types** — they expose existing implementations.

### Algorithm sketch — `buildPredictedCanvas`

Reference: [spec §6 step 3](../specs/2026-05-08-pipeline-extensions-design.md#6-spec--pr-2--subpixel-canvas-extraction).

```
function buildPredictedCanvas(source, matrix, marginCells, silhouetteScale, renderMode, filter):
    cellPx = 18
    totalCells = matrix.size + 2 * marginCells
    canvasSubSize = totalCells * 3   // subpixel grid edge

    rasterised = rasterizeSource(source, canvasSubSize, silhouetteScale)
    lifted = liftMarginBrightness(rasterised, marginCells, matrix.size)

    if renderMode == 'halftone':
        // Existing halftone pipeline — moved verbatim from halftoneRenderer.
        blended = blendAgainstWhite(lifted)
        binary = ditherFloydSteinberg(blended)   // Uint8Array of 0/255
        data = expandBinaryToImageData(binary, canvasSubSize)
    else if renderMode == 'composite':
        if filter == 'mono':
            blended = blendAgainstWhite(lifted)
            // Threshold against the same MAX_INK_LUM the colour path uses;
            // see spec §7 risk note about consistent thresholding.
            data = thresholdToImageData(blended, MAX_INK_LUM)
        else:  // filter == 'color'
            data = lifted    // pass-through, composite renderer does its own
                             // per-subpixel colour sampling

    return {
        data,
        width: canvasSubSize,
        height: canvasSubSize,
        cellPx,
        marginCells,
        reservedChecksum: computeChecksum(matrix.reserved),
        raster: rasterised,
    }
```

`computeChecksum` is a 32-bit FNV-1a (or similar — anything cheap and collision-free at this scale) over `matrix.reserved`. Implementation lives in `predictedCanvas.ts` as a private `computeReservedChecksum(reserved: Uint8Array): number`.

`expandBinaryToImageData` and `thresholdToImageData` are private helpers inside `predictedCanvas.ts` — they take a Uint8Array luma map and emit an `ImageData` whose pixels are either pure white or pure black at alpha 255, suitable for the renderer's existing paint loop to sample.

### Test plan

**New tests in `src/lib/predictedCanvas.test.ts`:**

1. `buildPredictedCanvas(halftone, mono)` — opaque-grey source produces non-empty dithered ImageData; dimensions match `(matrix.size + 2*marginCells) * 3`.
2. `buildPredictedCanvas(halftone, color)` — same as above but `data.data` is byte-identical to `halftoneRenderer`'s pre-refactor intermediate (capture once, snapshot).
3. `buildPredictedCanvas(composite, mono)` — output is a binary threshold (every pixel is 0 or 255 in luma).
4. `buildPredictedCanvas(composite, color)` — output is the lifted raster pass-through.
5. `reservedChecksum` is deterministic for the same matrix; differs between two matrices with different `reserved` masks.

**New tests in `src/lib/imageOps.test.ts`:**

6. `liftMarginBrightness` — pixel inside matrix region unchanged; pixel at outermost edge of margin is near-white; mid-margin pixel is interpolated.
7. `isOutsideSilhouette` — fully transparent pixel returns `true`; fully opaque dark pixel returns `false`; opaque white pixel returns `true`.
8. `clampLuminosity` — pixel below `maxBrightness` unchanged; pixel above is scaled down proportionally.
9. `blendAgainstWhite` — fully opaque source returns identical bytes; fully transparent returns pure white; 50% alpha interpolates 50/50.

**New tests in `src/lib/halftoneRenderer.test.ts`:**

10. **Lifecycle invariant test (non-negotiable, [spec §6 lifecycle decision B](../specs/2026-05-08-pipeline-extensions-design.md#6-spec--pr-2--subpixel-canvas-extraction))**:
    ```
    1. Build matrix M0 (un-flipped).
    2. predicted0 = buildPredictedCanvas(source, M0, ...)
    3. M1 = flip 20 random data modules in M0.
    4. canvas_a = renderHalftone(M1, predicted0, opts)
    5. predicted1 = buildPredictedCanvas(source, M1, ...)
    6. canvas_b = renderHalftone(M1, predicted1, opts)
    7. assert canvas_a.toDataURL() == canvas_b.toDataURL()
    ```
    Caveat: only valid because flips touch only data-module bits (not `reserved`). The test must use modules where `reserved[idx] === 0`.

**Must keep passing without modification:**

- All existing `halftoneRenderer.test.ts` byte-snapshot assertions (the whole point of the refactor is byte-identical output).
- `halftoneTarget.test.ts` — including the existing "silhouetteScale propagates" assertion (`darkHalf < darkFull`), which is the regression gate for the `halftoneTarget.ts` call-site update above. Add a new assertion that `HalftoneTarget.target` and `HalftoneTarget.importance` are byte-identical to the pre-refactor output for at least one transparent-background template.
- All other `*.test.ts` and `e2e/*.spec.ts`.

### Verification

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
```

### Risks & rollback

- **Risk (high):** the [§6 "matrix change doesn't invalidate predicted canvas"](../specs/2026-05-08-pipeline-extensions-design.md#6-spec--pr-2--subpixel-canvas-extraction) invariant breaks under some edge case (e.g., a future code path mutates `reserved` after `buildPredictedCanvas`). *Mitigation:* the dev-mode checksum assertion in `render()` catches it deterministically. *Detection:* the lifecycle invariant test (#10 above) fails before any regression ships.
- **Risk:** existing snapshot bytes drift because of subtle floating-point reordering when `liftMarginBrightness` runs against the lifted-then-blended path vs. lifted-only path. *Detection:* the existing renderer snapshot tests catch byte drift. *Mitigation:* `buildPredictedCanvas` for halftone mode runs `blendAgainstWhite` on the lifted output before dithering, exactly mirroring the original `ditherFloydSteinberg` behaviour. The refactor of `ditherFloydSteinberg` to expect pre-blended input must be paired with the call-site updates atomically in the same PR.
- **Risk:** circular import (`imageOps` ↔ `halftoneRenderer`) if `halftoneRenderer` accidentally still imports something from itself via `imageOps`. *Mitigation:* `halftoneRenderer` imports from `imageOps` only, never the reverse.
- **Rollback:** single revert. The dev assertion is gated on `import.meta.env.DEV` so production code paths are unchanged when reverted.

### Open questions

- **`STRUCTURAL_INK_HEX` re-export consumers:** verify with `grep -r STRUCTURAL_INK_HEX src/` whether consumers expect the symbol from `halftoneRenderer.ts` or accept it from `imageOps.ts`. If consumers exist, decide between (a) re-exporting from `halftoneRenderer.ts`, (b) updating the import sites. Either is fine; pick whichever is fewer touched files.
- **Should `predictedCanvas.raster` be lazily computed?** The composite renderer needs it (Phase 1c); the halftone renderer doesn't. If memory pressure becomes a concern at V15, gate `raster` retention on a renderer-aware flag. Not blocking 1b.

---

## Phase 1c — Composite renderer mode

**Spec:** [§7 PR 3 · Composite renderer mode](../specs/2026-05-08-pipeline-extensions-design.md#7-spec--pr-3--composite-renderer-mode-qartjs-style)

### Goal & success criteria

Add a second render mode (qart.js-style) — each cell paints centre subpixel from QR data + 8 surround subpixels from the cover image (thresholded for `filter: 'mono'`, raw for `filter: 'color'`). Wire a UI toggle to swap between halftone and composite at runtime.

**Done when:**
- [ ] `src/lib/compositeRenderer.ts` exists; exports `render(matrix, predicted, opts): HTMLCanvasElement`.
- [ ] Composite renderer reuses `STRUCTURAL_INK`, `STRUCTURAL_INK_RGB`, `isOutsideSilhouette`, `clampLuminosity` from `imageOps.ts` — **no re-implementation**.
- [ ] `useQrPipeline` dispatches on `renderMode`: `renderHalftone` vs `renderComposite`.
- [ ] `AdvancedSettings` includes `renderMode: RenderMode`; default `'halftone'`.
- [ ] `AdvancedOptions.tsx` exposes a "Render style" radio group.
- [ ] New test `compositeRenderer.test.ts` exercises centre/surround subpixel painting and reserved cells.
- [ ] New file `pipelineIntegration.test.ts` (lives alongside `pipeline.integration.test.ts`, distinct file per [spec §10.1](../specs/2026-05-08-pipeline-extensions-design.md#101-test-matrix-lives-in-pipelineintegrationtestts)) implements the 48-case matrix and asserts jsqr decode passes for the halftone-mono baseline. (Composite + Sampling-Sim assertions are added incrementally in their respective phases.)
- [ ] All five verification gates pass.

> **Filename note:** the spec uses `pipelineIntegration.test.ts` (camelCase) while the codebase has `pipeline.integration.test.ts` (dot-separated). Plan calls for **a new file** named `pipelineIntegration.test.ts` per the spec, kept distinct from the existing inter-stage glue test.

### File-by-file changes

| File | Action | Description |
|---|---|---|
| `src/types.ts` | **Modify** | (`RenderMode` was added in 1b — no new change here.) |
| `src/lib/compositeRenderer.ts` | **Create** | New file. Exports `render(matrix, predicted, opts): HTMLCanvasElement`. Header citation comment per [spec §7 "Citation note in code"](../specs/2026-05-08-pipeline-extensions-design.md#7-spec--pr-3--composite-renderer-mode-qartjs-style). |
| `src/hooks/useQrPipeline.ts` | **Modify** | Add `renderMode` and (already present from 1a) `filter` to `QrPipelineInput`. Destructure both. Dispatch `const renderFn = renderMode === 'composite' ? renderComposite : renderHalftone;`. Pass `renderMode` into `buildPredictedCanvas`. Extend deps array: add `renderMode`, `filter`. |
| `src/appReducer.ts` | **Modify** | Add `renderMode: RenderMode` to `AdvancedSettings`. Add `renderMode: 'halftone'` to `DEFAULT_STATE`. No change to `getInitialState` (intentionally not persisted). |
| `src/components/AdvancedOptions.tsx` | **Modify** | Add a `<fieldset>` with two radio buttons inside the existing `flex flex-col gap-4` container. Pull `renderMode` from props; emit `onChange({ renderMode: ... })` patches. |
| `src/components/AdvancedOptions.test.tsx` | **Modify** | Add a test that selects "Composite" and asserts the `onChange` callback receives `{ renderMode: 'composite' }`. |
| `src/App.tsx` | **Modify** | Pass `state.renderMode` to `useQrPipeline`. |
| `src/lib/compositeRenderer.test.ts` | **Create** | Unit tests; see Test plan. |
| `src/lib/pipelineIntegration.test.ts` | **Create** | New file: the 48-case test matrix from [spec §10.1](../specs/2026-05-08-pipeline-extensions-design.md#101-test-matrix-lives-in-pipelineintegrationtestts). In 1c, only halftone-mono cases are asserted; the test scaffolding is in place for Phase 2/3 to extend. |

### Type / data-shape changes

```typescript
// src/appReducer.ts
export interface AdvancedSettings {
  multiSize: boolean;
  silhouetteScale: number;
  renderMode: RenderMode;       // NEW
}

// src/hooks/useQrPipeline.ts
export interface QrPipelineInput {
  url: string;
  templateId: string;
  customSource: CustomSource | null;
  silhouetteScale: number;
  multiSize: boolean;
  filter: FilterMode;           // already added in 1a
  renderMode: RenderMode;       // NEW
}
```

`DEFAULT_STATE` gets `renderMode: 'halftone'`. Per [spec §10.4](../specs/2026-05-08-pipeline-extensions-design.md#104-backwards-compatibility) the default preserves today's behaviour.

### Algorithm sketch — `compositeRenderer.render`

Reference: [spec §7 touch list](../specs/2026-05-08-pipeline-extensions-design.md#7-spec--pr-3--composite-renderer-mode-qartjs-style). Mirrors `halftoneRenderer` structure for symmetry.

```
function render(matrix, predicted, opts):
    assert(predicted.reservedChecksum == computeChecksum(matrix.reserved))   // dev only
    cellPx = predicted.cellPx        // == 18
    marginCells = predicted.marginCells
    totalCells = matrix.size + 2 * marginCells
    canvas = HTMLCanvasElement(totalCells * cellPx, totalCells * cellPx)
    ctx = canvas.getContext('2d')

    // Stamp the predicted canvas (subpixel-res) onto the output canvas at
    // module-pixel resolution. nearest-neighbour upscaling preserves the
    // 3×3 subpixel structure.
    paintCanvas = offscreenCanvas(predicted.width, predicted.height)
    paintCanvas.putImageData(predicted.data, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(paintCanvas, 0, 0, totalCells * cellPx, totalCells * cellPx)

    // For each cell, override the centre subpixel with the QR module value.
    // Reserved cells get full-cell paint as in halftoneRenderer.
    eachCell(matrix, marginCells, cellPx, cell -> {
        if not cell.inMatrix: return
        if cell.isReserved:
            // INTENTIONAL DIVERGENCE from halftoneRenderer: composite always uses
            // STRUCTURAL_INK_RGB for reserved-dark cells, even when filter='mono'.
            // halftoneRenderer's mono branch tints reserved cells with
            // silhouetteInkRgb (= pickInkColor(source)) for visual cohesion;
            // composite mode prioritises decode contrast — finder/timing/alignment
            // patterns must read as cleanly as possible against a photo-coloured
            // surround, and that means structural ink everywhere.
            if cell.isModuleDark:
                ctx.fillStyle = STRUCTURAL_INK_RGB
                ctx.fillRect(cell.px, cell.py, cellPx, cellPx)
            else:
                ctx.clearRect(cell.px, cell.py, cellPx, cellPx)
            return

        // Data cell: only the centre subpixel is overridden.
        cx = cell.px + cellPx/3
        cy = cell.py + cellPx/3
        if cell.isModuleDark:
            ctx.fillStyle = STRUCTURAL_INK_RGB
            ctx.fillRect(cx, cy, cellPx/3, cellPx/3)
        else:
            ctx.clearRect(cx, cy, cellPx/3, cellPx/3)

        // For filter='color', the surround subpixels were already painted from
        // predicted.data — but we must overlay STRUCTURAL_INK on any surround
        // subpixel marked outside-silhouette, mirroring halftoneRenderer's
        // colour fallback. This requires a per-subpixel pass over the 8
        // surround positions if filter=='color'. For filter=='mono', the
        // predicted canvas was already thresholded so no per-subpixel fallback
        // is needed.
        if opts.filter == 'color':
            for each (dx, dy) in 8 surround subpixel offsets:
                idx4 = subpixelIdx4(predicted.raster, cell.mx, cell.my, dx, dy, marginCells)
                if isOutsideSilhouette(predicted.raster.data, idx4):
                    sx = cell.px + dx * cellPx/3
                    sy = cell.py + dy * cellPx/3
                    ctx.fillStyle = STRUCTURAL_INK_RGB
                    ctx.fillRect(sx, sy, cellPx/3, cellPx/3)
    })

    return canvas
```

**Helper extraction note:** the reserved-cell branches in `halftoneRenderer.ts` and `compositeRenderer.ts` are **not** identical — composite always paints reserved-dark cells with `STRUCTURAL_INK_RGB`, while halftone uses `silhouetteInkRgb` (`pickInkColor(source)`) when `filter === 'mono'` (see "INTENTIONAL DIVERGENCE" comment in the algorithm sketch above). Do **not** extract to a shared helper. Keep the small duplication; it makes the divergence locally readable in each renderer. If a future render mode shares composite's contract (e.g. a Cox QArt mode with the same decode-contrast prioritisation), revisit then.

### Test plan

**New tests in `src/lib/compositeRenderer.test.ts`:**

1. Render a tiny matrix with all reserved cells: every reserved cell paints fully (no centre-subpixel override visible).
2. Render a matrix with one data module dark and surrounding source pixels light: assert the centre subpixel is `STRUCTURAL_INK` and the 8 surround subpixels match the `predicted.data` colours.
3. Render a matrix with one data module light: assert the centre subpixel is cleared (alpha 0), surround subpixels still painted from predicted.
4. Reserved-mask checksum mismatch raises in dev mode (when `import.meta.env.DEV`).
5. `filter: 'color'` + transparent source pixel inside the silhouette: surround subpixel falls back to `STRUCTURAL_INK_RGB` per the colour-fallback rule.

**New tests in `src/lib/pipelineIntegration.test.ts`:**

6. Test matrix scaffolding: a parameterised `describe.each` over `versions × renderModes × filters × sources × sizes` per [spec §10.1](../specs/2026-05-08-pipeline-extensions-design.md#101-test-matrix-lives-in-pipelineintegrationtestts). In 1c, only halftone-mono cases assert jsqr decode success. Other axes run end-to-end without `expect(decoded.ok).toBe(true)`. (Phase 2 enables those assertions.)
7. Visual regression snapshot for one composite + halftone case each (toDataURL hash).

**New tests in `src/components/AdvancedOptions.test.tsx`:**

8. Render the component, click the "Composite" radio, assert `onChange` fires with `{ renderMode: 'composite' }`.

**Must keep passing without modification:**

- All Phase 1a tests.
- All Phase 1b tests.
- `pipeline.integration.test.ts` (the existing inter-stage glue file — distinct from the new `pipelineIntegration.test.ts`).

### Verification

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
```

E2E coverage in 1c: extend `e2e/flows.spec.ts` (or add a new spec) to toggle the render-style radio and assert the QR canvas re-renders without error. The existing `smoke.spec.ts` does not need modification.

### Risks & rollback

- **Risk:** composite mode's mono threshold value diverges from halftone's luminance assumptions. *Mitigation per [spec §7 risk](../specs/2026-05-08-pipeline-extensions-design.md#7-spec--pr-3--composite-renderer-mode-qartjs-style):* thread `MAX_INK_LUM` into the threshold; reuse `toLuminance` from `colorUtils`. *Detection:* the 48-case integration matrix.
- **Risk:** composite mode's centre subpixel surrounded by image-coloured surroundings produces lower decode rate than halftone in worst cases. *Mitigation:* the matrix test gates merge; if it fails, narrow the silhouette band or escalate the filter aggression. *Rollback:* if composite mode ships and breaks decode in the wild, the `'halftone'` default keeps existing users on the working path; users can simply not toggle the radio.
- **Risk:** the new `renderMode` field in `AdvancedSettings` reaches a downstream surface (e.g. analytics, URL-state encoding) that doesn't know about it. *Detection:* `tsc` flags missing exhaustiveness checks in any `switch (mode)` consumer. None known today.
- **Rollback:** revert `useQrPipeline` dispatch to always call `renderHalftone`; remove the radio. Keep `compositeRenderer.ts` in tree (dead code) so the next attempt doesn't have to rewrite it.

### Open questions

- **Filter heuristic move.** Phase 1a left the `templateId === 'custom' ? 'color' : 'mono'` heuristic in `App.tsx`. With composite mode now exposed, do we (a) keep the heuristic, (b) also expose `filter` as an explicit user setting, or (c) couple `filter` to `renderMode`? Spec is silent; recommend (a) for 1c and revisit if user feedback warrants. Flag in PR description for sign-off.
- ~~**Reserved-cell helper extraction.**~~ **Resolved** — see "Helper extraction note" above. Composite intentionally diverges from halftone-mono on reserved cells (decode-contrast priority); no shared helper, small duplication kept.
- **`predicted.raster` lifetime.** Composite-color uses it for surround-subpixel silhouette fallback. If memory becomes a concern, consider lazy retention or pre-compute the fallback mask inside `buildPredictedCanvas`. Not blocking 1c.

---

# Phase 2 — Sampling-Sim scoring

**Spec:** [§8 PR 4 · Sampling-Sim scoring](../specs/2026-05-08-pipeline-extensions-design.md#8-spec--pr-4--samplingsim-scoring)

### Goal & success criteria

Replace the binary mismatch metric in `pickBestMask` and the importance-weighted disagreement score in `flipModulesByCodeword` with an ArtCoder-style sampling simulation that scores modules by their camera-readable value (Gaussian-weighted average over a 5×5 subpixel kernel on the predicted canvas) vs. the target.

The change must be **decode-rate-neutral or better** vs. Phase 1c — every QR that decoded with the binary score must still decode with Sampling-Sim. The total Sampling-Sim score should monotonically decrease across PRs (validates the metric does something).

**Done when:**
- [ ] `src/lib/samplingSim.ts` exists with the four exported functions in [spec §4](../specs/2026-05-08-pipeline-extensions-design.md#4-shared-types-changes) shape.
- [ ] `pickBestMask` accepts a `predicted` argument (per-mask) and uses `samplingSim.totalScore` as its objective.
- [ ] `flipModulesByCodeword` keeps per-block iteration; per-codeword scoring switches to Sampling-Sim Δ-score using `applyModuleFlip`'s incremental updates.
- [ ] Incremental update is **provably equivalent** to a full rebuild — gated by a non-negotiable golden test.
- [ ] The 48-case integration matrix from [spec §10.1](../specs/2026-05-08-pipeline-extensions-design.md#101-test-matrix-lives-in-pipelineintegrationtestts) gates merge: zero decode-rate regressions vs. the post-1c baseline.
- [ ] V10 wall-clock stays under **500 ms** end-to-end (target ~310 ms halftone, ~280 ms composite per [spec §10.2](../specs/2026-05-08-pipeline-extensions-design.md#102-performance-budget)).
- [ ] `target.importance` shape unchanged ([spec §8 "Side change"](../specs/2026-05-08-pipeline-extensions-design.md#8-spec--pr-4--samplingsim-scoring)).
- [ ] All five verification gates pass.

### File-by-file changes

| File | Action | Description |
|---|---|---|
| `src/lib/samplingSim.ts` | **Create** | New module. Exports `SamplingSimContext`, `buildSamplingContext`, `scoreModuleAgainstTarget`, `applyModuleFlip`, `totalScore`. Internal: `gaussianKernel`, `recomputeReadback`, `computeReadbackForModule`. |
| `src/lib/maskOptimizer.ts` | **Modify** | Replace `scoreMask` body. New signature: `scoreMask(matrix: QRMatrix, target: HalftoneTarget, predicted: PredictedCanvas): number`. Implementation: `const ctx = buildSamplingContext(predicted, matrix); return totalScore(ctx, target);`. Update `pickBestMask(text, target, predicted: PredictedCanvas)` to take **the canvas built once outside** — *not* a per-mask callback or factory. Justification: across the 8 mask candidates of a fixed QR version, `matrix.size` is identical and `matrix.reserved` is byte-identical (masking only flips data-module bits), so `buildPredictedCanvas`'s output is independent of the mask choice. Per-candidate variance lives in `SamplingSimContext.readback` — `lumaAt` reads `matrix.modules` at sample time, overriding `predicted.data`'s centre-subpixel value (see Phase 2 algorithm sketch / `lumaAt` below). Building the canvas 8× would waste ~80–200 ms of rasterise + `liftMarginBrightness` + Floyd–Steinberg + checksum work at V10 against the 500 ms ceiling, and would not match spec §8's perf accounting (which budgets `8 × buildSamplingContext`, not `8 × buildPredictedCanvas`). |
| `src/lib/moduleFlipper.ts` | **Modify** | Inject a `SamplingSimContext` (via new option `samplingContext: SamplingSimContext` in `FlipOptions`). Per-codeword scoring: replace `target.importance[y][x]` weighted disagreement with the Sampling-Sim Δ-score: "if I set this codeword's modules to `target.target[y][x]`, what's the cumulative drop in `totalScore`?" Use `applyModuleFlip` to apply accepted flips and rely on its returned affected-module list to update the per-codeword scoring deltas of neighbouring codewords. Keep the per-block budget loop unchanged. |
| `src/hooks/useQrPipeline.ts` | **Modify** | After `buildPredictedCanvas`, pass the single `predicted` canvas into `pickBestMask(text, target, predicted)`. `pickBestMask` internally calls `buildSamplingContext(predicted, candidateMatrix)` per candidate (8× cheap kernel work). After mask selection, build `samplingContext = buildSamplingContext(predicted, baseMatrix)` for the chosen mask and pass to `flipModulesByCodeword`. |
| `src/lib/samplingSim.test.ts` | **Create** | Unit tests; see Test plan. |
| `src/lib/maskOptimizer.test.ts` | **Modify** | Update `scoreMask` call sites to pass the new `predicted` argument. Existing semantic tests (mask 0..7, lower score wins) must still pass — assertions about *which* mask wins may need to be replaced with structural assertions ("returns one of the 8 candidates", "scores are monotonic in the chosen objective") if the scoring change picks a different mask. |
| `src/lib/moduleFlipper.test.ts` | **Modify** | Inject a stub `SamplingSimContext` for the existing tests. The tests should assert the per-block budget loop terminates and `flipsPerBlock` reflects the budget — not the specific modules flipped, since Sampling-Sim chooses differently. |
| `src/lib/pipelineIntegration.test.ts` | **Modify** | Enable jsqr decode assertions for all 48 cases (was halftone-mono-only in Phase 1c). |
| `src/lib/pipeline.integration.test.ts` | **Modify** | Adapt to thread the sampling context through. |

### Type / data-shape changes

```typescript
// src/lib/samplingSim.ts
import type { QRMatrix } from '../types';
import type { PredictedCanvas } from './predictedCanvas';
import type { HalftoneTarget } from './halftoneTarget';

export interface SamplingSimContext {
  /** Borrowed reference, not cloned. Centre subpixel of every data module is
   *  the live state owned by this context (mutated by applyModuleFlip).
   *  Reserved subpixels and surround subpixels are immutable inputs. */
  predicted: PredictedCanvas;
  matrix: QRMatrix;
  /** Per-module readback, size*size. Values 0..1 represent the Gaussian-
   *  weighted luma average over the module's receptive field. */
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

`HalftoneTarget` shape is **unchanged** ([spec §8 "Side change"](../specs/2026-05-08-pipeline-extensions-design.md#8-spec--pr-4--samplingsim-scoring)). `NON_SILHOUETTE_FLOOR` stays at 0.1 — retiring it is deferred (see "Out of scope" #3).

### Algorithm sketch — Sampling-Sim core

Reference: [spec §8 algorithm](../specs/2026-05-08-pipeline-extensions-design.md#8-spec--pr-4--samplingsim-scoring) and [spec §8 incremental update](../specs/2026-05-08-pipeline-extensions-design.md#8-spec--pr-4--samplingsim-scoring).

```
// Kernel parameters per spec §8 "Kernel parameters"
KERNEL_SIZE = 5            // 5×5 subpixel window
KERNEL_SIGMA = 1.0
WEIGHTS = gaussian2D(KERNEL_SIZE, KERNEL_SIGMA)   // 5×5 Float32; sums to 1
DARK_LUMA = 0.0    // 0..1
LIGHT_LUMA = 1.0   // 0..1
RECEPTIVE_RADIUS_MODULES = ceil(KERNEL_SIZE / 2 / 3)   // == 1 for 5×5

function buildSamplingContext(predicted, matrix):
    size = matrix.size
    readback = new Float32Array(size * size)
    for my in 0..size-1:
        for mx in 0..size-1:
            readback[my * size + mx] = computeReadbackForModule(predicted, matrix, mx, my)
    return { predicted, matrix, readback }

function computeReadbackForModule(predicted, matrix, mx, my):
    // Centre subpixel of the module, in subpixel coordinates.
    csx = (mx + predicted.marginCells) * 3 + 1
    csy = (my + predicted.marginCells) * 3 + 1
    sum = 0
    for dy in -2..2:
        for dx in -2..2:
            sx = clamp(csx + dx, 0, predicted.width - 1)
            sy = clamp(csy + dy, 0, predicted.height - 1)
            // Effective luma: for the centre subpixel of any data module the
            // value is determined by matrix.modules[my][mx] (DARK or LIGHT),
            // overriding whatever predicted.data carries. For all other
            // subpixels read from predicted.data directly.
            luma = lumaAt(predicted, matrix, sx, sy)
            sum += WEIGHTS[(dy+2)*5 + (dx+2)] * luma
    return sum

function totalScore(ctx, target):
    // Sum: importance · |readback - target_value|
    sum = 0
    for my in 0..size-1:
        for mx in 0..size-1:
            w = target.importance[my][mx]
            if w == 0: continue
            tval = target.target[my][mx] ? DARK_LUMA : LIGHT_LUMA
            sum += w * abs(ctx.readback[my * size + mx] - tval)
    return sum

function applyModuleFlip(ctx, mx, my, newValue):
    // Mutate the centre subpixel of the predicted canvas to reflect the new
    // module value (DARK_LUMA or LIGHT_LUMA). Reserved cells must NOT be
    // flipped — caller is responsible for that gate.
    csx = (mx + ctx.predicted.marginCells) * 3 + 1
    csy = (my + ctx.predicted.marginCells) * 3 + 1
    setPixelLuma(ctx.predicted.data, csx, csy, newValue ? DARK_LUMA : LIGHT_LUMA)
    ctx.matrix.modules[my][mx] = newValue

    // Recompute readback for every module within RECEPTIVE_RADIUS_MODULES of
    // (mx, my). For 5×5 / cellPx=18, that's the 3×3 module neighbourhood
    // centred on the flipped module — 9 modules. (Spec §8 says ~25; we round
    // down because a 5-subpixel kernel only reaches into the immediate
    // neighbours, not 5×5 modules.)
    affected = []
    for ny in (my-1)..(my+1):
        for nx in (mx-1)..(mx+1):
            if not inBounds(nx, ny, size): continue
            ctx.readback[ny * size + nx] = computeReadbackForModule(ctx.predicted, ctx.matrix, nx, ny)
            affected.push({ x: nx, y: ny })
    return { affected }
```

> **Sub-question:** the spec says "every module within the receptive radius (~5×5 = 25 modules)". The math actually depends on `cellPx` and `KERNEL_SIZE`: with `cellPx=18` and a 5-subpixel kernel, the kernel reaches at most 2 subpixels = 0.67 modules from centre, so the 3×3 module neighbourhood covers the receptive field. **Flag in PR description for sign-off** before locking the constant. The "incremental matches full rebuild" test catches mistakes either way.

**Module-flipper integration.** The existing per-codeword greedy structure stays:

```
1. Build candidates per block (modulesByCodeword, score).
2. For each block: sort codewords by score descending; flip top K = floor(0.15 × ecCount).
```

Replacement scoring:

```
Per codeword score = sum over its modules of:
    Δscore_if_flipped = totalScore_after - totalScore_before
where the "after" is computed by:
    1. Tentatively call applyModuleFlip(mx, my, target.target[my][mx]).
    2. Sum |readback - target_value| · importance over the affected modules only.
    3. Subtract the corresponding "before" sum.
    4. Revert with applyModuleFlip(mx, my, original_value).
```

**Performance optimisation:** scoring all codewords up front means O(codewords × moduleFlipsPerCodeword × kernelSize²) work. To stay within the 60–100 ms budget, score lazily per block (sort once at start, re-score the block's remaining codewords after each accepted flip — neighbour-affected codewords' scores change). This is the "lazy re-score" pattern; it's not in the spec but is necessary to hit the perf target. Document the trade-off in the PR.

### Test plan

**New tests in `src/lib/samplingSim.test.ts`:**

1. Empty matrix (all light) over uniform-light source → readback ≈ LIGHT_LUMA everywhere.
2. Empty matrix over uniform-dark source → readback ≈ DARK_LUMA everywhere (reserved subpixels are not the centre, so they dominate).
3. Single dark module surrounded by light subpixels → readback at that module is close to LIGHT_LUMA (centre subpixel small relative to 24 light surround subpixels) — confirms the kernel weights reasonably.
4. **`applyModuleFlip` then `applyModuleFlip` (un-flip) → readback identical to initial** (deterministic, exact byte equality on the Float32Array).
5. **Incremental-update equality (NON-NEGOTIABLE):** build context A, apply 50 random flips via `applyModuleFlip`. Build context B from scratch with the same final matrix. Assert `A.readback` equals `B.readback` element-wise. Spec [§8 risk](../specs/2026-05-08-pipeline-extensions-design.md#8-spec--pr-4--samplingsim-scoring) calls this out as the safety net for the highest-risk mitigation.
6. Reserved-cell flip is rejected (or asserts) — caller invariant; document.

**Modify `src/lib/pipelineIntegration.test.ts`:**

7. Enable jsqr decode assertions across the full 48-case matrix. Assert `result.ok === true` for every case. Document expected runtimes per case (sanity check on the 500 ms budget).

**Performance regression test (new, optional but recommended):**

8. `pipelineIntegration.perf.test.ts` — measure `performance.now()` end-to-end for the V10 halftone-mono case and assert < 500 ms. Skipped on CI under load if environment-flagged; runs locally as a gate.

**Must keep passing without modification:**

- All Phase 1a/1b/1c tests (modulo the maskOptimizer/moduleFlipper test changes listed in the file table).
- `composer.test.ts`, `qrMatrix.test.ts`, `halftoneTarget.test.ts`, `codewordLayout.test.ts`, `decodeQrImage.test.ts`, `posterSize.test.ts`, `scanVerifier.test.ts`, `imageOps.test.ts`.

### Verification

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
```

Plus a manual jsqr-pass-rate diff vs. Phase 1c baseline: capture the per-case decode results before merging Phase 2, compare in the PR description. **Zero regressions allowed** per [spec §8 risk](../specs/2026-05-08-pipeline-extensions-design.md#8-spec--pr-4--samplingsim-scoring).

### Risks & rollback

- **Risk (highest of all phases):** naive (non-incremental) flip evaluation scales O(flips × modules × kernel²) → seconds. *Mitigation:* incremental update is non-negotiable. *Detection:* the pipeline timing test (#8 above) and the lazy-re-score implementation. *Fallback:* if the lazy re-score is buggy, ship Phase 2 with full re-score per block and accept ~150 ms penalty (still under 500 ms).
- **Risk:** kernel parameters (σ=1, 5×5) untuned for our pipeline; may not actually improve decode rate. *Mitigation:* `pipelineIntegration.test.ts` zero-regression gate. *Fallback:* tweak σ in 0.5/2 increments until the gate passes.
- **Risk:** retiring `NON_SILHOUETTE_FLOOR` later changes visual output. *Mitigation:* don't retire it in Phase 2 (out of scope #3).
- **Risk:** the `applyModuleFlip` mutation of `predicted.data` is a side effect that bleeds into other consumers (e.g. composite renderer reading `predicted.data` after Sampling-Sim has finished). *Detection:* the lifecycle invariant test from Phase 1b — but only if it's adapted to run after Sampling-Sim. *Mitigation:* document that `predicted.data` is owned by Sampling-Sim once `buildSamplingContext` is called; the renderer consumes the post-flip state, which is the desired behaviour. **Add a comment in `predictedCanvas.ts`** explaining the ownership transfer.
- **Rollback:** revert `samplingSim.ts` and the call-site changes. The pipeline returns to the binary-disagreement metric. No persisted-state migration needed.

### Open questions

- **Receptive radius constant.** Spec says ~25 modules; algorithm derivation says 9. Resolve before locking the constant in `samplingSim.ts`. The "incremental matches full rebuild" test will catch a mistake but a bigger radius is wasted work. **Flag in PR description for reviewer sign-off.**
- ~~**`pickBestMask` callback shape.**~~ **Resolved** — `pickBestMask(text, target, predicted: PredictedCanvas)` takes the canvas built once outside, not a per-mask callback. Per-candidate variance lives in `SamplingSimContext.readback` via `lumaAt(matrix, …)`, not in `predicted.data`. Avoids 8× canvas rebuild (~80–200 ms at V10) against the 500 ms ceiling and matches spec §8's perf accounting. See file-table justification above.
- **Lazy re-score complexity.** If lazy re-score adds >100 LoC, consider a simpler "re-score only after each block finishes" approximation. Document trade-off in PR.

---

# Phase 3 — ART-UP probabilistic flip budget

**Spec:** [§9 PR 5 · ART-UP probabilistic flip budget](../specs/2026-05-08-pipeline-extensions-design.md#9-spec--pr-5--art-up-probabilistic-flip-budget)

### Goal & success criteria

Replace the hardcoded `floor(0.15 × ecCount)` per-block flip budget with a per-flip acceptance gate driven by a calibrated logistic-regression model of decode failure. Each flip is accepted only if the cumulative probability of *any* module in the affected RS block becoming uncorrectable stays under `DEFAULT_FAILURE_TOLERANCE` (default 0.05).

The change must be **decode-rate-neutral or better** vs. Phase 2 *and* produce a measurably lower (better) total Sampling-Sim score across the integration matrix — otherwise the calibration is not adding value and we should ship the `'fixed'` policy as default per the [spec §9 backward-compat fallback](../specs/2026-05-08-pipeline-extensions-design.md#9-spec--pr-5--art-up-probabilistic-flip-budget).

**Done when:**
- [ ] `scripts/calibrate-flip-budget.ts` runnable via `tsx`. Emits `src/lib/flipBudget.calibration.ts`.
- [ ] Calibration AUC > 0.85 (model fit gate per [spec §9 risk](../specs/2026-05-08-pipeline-extensions-design.md#9-spec--pr-5--art-up-probabilistic-flip-budget)).
- [ ] `src/lib/flipBudget.ts` exports `FlipBudgetPolicy`, `decodeFailureProb`, `shouldAcceptFlip`.
- [ ] `flipModulesByCodeword` consumes `FlipBudgetPolicy`; default `{ kind: 'probabilistic', failureTolerance: DEFAULT_FAILURE_TOLERANCE }` if AUC > 0.85, else `{ kind: 'fixed', ratio: DEFAULT_ECC_BUDGET_RATIO }`.
- [ ] Optional `flipBudgetPolicy` advanced setting wired into `useQrPipeline` (allows runtime fallback to `'fixed'`).
- [ ] 48-case integration matrix: zero decode-rate regression vs. Phase 2.
- [ ] V10 wall-clock stays under 500 ms.
- [ ] `CLAUDE.md` "Touching the halftone pipeline" section updated; author typo (Hsu → Mitra) fixed.
- [ ] `docs/PIPELINE.md` created with the data-flow diagram from [spec §3](../specs/2026-05-08-pipeline-extensions-design.md#3-pipeline-shape--before-and-after).

### File-by-file changes

| File | Action | Description |
|---|---|---|
| `scripts/calibrate-flip-budget.ts` | **Create** | New file (~250 LoC). Generates 120 QR codes (V5 / V10 / V15 × halftone / composite × mono / color × 2 templates × 5 flip-count buckets), captures features, runs jsqr at native + 200×200, fits logistic regression, emits the coefficient file. Outputs goodness-of-fit (R², AUC) to stdout. |
| `src/lib/flipBudget.calibration.ts` | **Create (generated)** | Output of the calibration script. Exports `ART_UP_COEFFICIENTS` and `DEFAULT_FAILURE_TOLERANCE`. Marked `// generated by scripts/calibrate-flip-budget.ts — do not edit by hand`. |
| `src/lib/flipBudget.ts` | **Create** | Exports `FlipBudgetPolicy` discriminated union, `decodeFailureProb(features, coeffs): number`, `shouldAcceptFlip(policy, blockState, candidate, ctx): boolean`. ~80 LoC. |
| `src/lib/moduleFlipper.ts` | **Modify** | Block-level loop changes from "flip top-K codewords until budget exhausted" to "flip top-N codewords (sorted by Sampling-Sim Δ-score) until cumulative failure probability exceeds tolerance". `DEFAULT_ECC_BUDGET_RATIO` stays in code as the `'fixed'` default. |
| `src/hooks/useQrPipeline.ts` | **Modify** | Optionally accept `flipBudgetPolicy?: FlipBudgetPolicy` in `QrPipelineInput`. Default to `'probabilistic'` (or `'fixed'` if calibration didn't pass the AUC gate — decided at the time the calibration file is generated). |
| `src/appReducer.ts` | **Modify (optional)** | Add `flipBudgetPolicy?: FlipBudgetPolicy` to `AdvancedSettings` if exposing in UI. **Recommendation:** *don't* expose in 1.0 — keep it as a code-level constant, expose later only if regressions surface. |
| `src/lib/flipBudget.test.ts` | **Create** | Unit tests; see Test plan. |
| `src/lib/moduleFlipper.test.ts` | **Modify** | Adapt to inject a `FlipBudgetPolicy`. Add a test for `'fixed'` (preserves Phase 2 behaviour) and `'probabilistic'` (accepts more / fewer flips depending on tolerance). |
| `CLAUDE.md` | **Modify** | Update "Touching the halftone pipeline" stage diagram to include `buildPredictedCanvas` and Sampling-Sim. Fix author typo (Hsu → Mitra) per [spec §10.5](../specs/2026-05-08-pipeline-extensions-design.md#105-documentation). Note the new locked decision: `DEFAULT_FAILURE_TOLERANCE = 0.05`. |
| `docs/PIPELINE.md` | **Create** | New file with the data-flow diagram from [spec §3](../specs/2026-05-08-pipeline-extensions-design.md#3-pipeline-shape--before-and-after) and a brief overview of each stage. |
| `package.json` | **Modify** | Add `"calibrate:flip-budget": "tsx scripts/calibrate-flip-budget.ts"` to `scripts`. (`tsx` is in dev deps already — check; if not, add it.) |

### Type / data-shape changes

```typescript
// src/lib/flipBudget.ts
export type FlipBudgetPolicy =
  | { kind: 'fixed'; ratio: number }                      // existing behaviour
  | { kind: 'probabilistic'; failureTolerance: number };  // ART-UP

export interface ArtUpCoefficients {
  intercept: number;
  surroundContrast: number;
  centreCorrelation: number;
  finderDistance: number;
}

export interface CodewordCandidate {
  /* re-export from moduleFlipper.ts; or move to a shared module */
}

export interface BlockFlipState {
  /** Cumulative product term: prod(1 - p_i) for accepted flips so far. */
  cumulativeSurvivalProb: number;
  /** Number of flips accepted so far in this block. Hard cap at floor(ecCount/2). */
  flipsAccepted: number;
  /** Per-block error-correction count (from `codewordLayout.ecCount`), copied
   *  in once at block-loop entry so `shouldAcceptFlip` doesn't have to reach
   *  through `ctx` or thread an extra parameter. */
  ecCount: number;
}

export function decodeFailureProb(
  features: { surroundContrast: number; centreCorrelation: number; finderDistance: number },
  coeffs: ArtUpCoefficients,
): number;

export function shouldAcceptFlip(
  policy: FlipBudgetPolicy,
  blockState: BlockFlipState,
  candidate: CodewordCandidate,
  ctx: SamplingSimContext,
): { accepted: boolean; pNew: number };
```

```typescript
// src/lib/flipBudget.calibration.ts (generated)
import type { ArtUpCoefficients } from './flipBudget';

export const ART_UP_COEFFICIENTS: ArtUpCoefficients = {
  intercept: -3.21,
  surroundContrast: 0.84,
  centreCorrelation: 1.12,
  finderDistance: -0.07,
};
export const DEFAULT_FAILURE_TOLERANCE = 0.05;
```

### Algorithm sketch — runtime acceptance gate

Reference: [spec §9 runtime usage](../specs/2026-05-08-pipeline-extensions-design.md#9-spec--pr-5--art-up-probabilistic-flip-budget).

```
function decodeFailureProb(features, coeffs):
    z = coeffs.intercept
      + coeffs.surroundContrast  * features.surroundContrast
      + coeffs.centreCorrelation * features.centreCorrelation
      + coeffs.finderDistance    * features.finderDistance
    return 1 / (1 + exp(-z))

function shouldAcceptFlip(policy, blockState, candidate, ctx):
    // ecCount is read from blockState (copied in once at block-loop entry, see
    // outer loop below). Returns { accepted, pNew } so the caller can update
    // blockState.cumulativeSurvivalProb without re-running extractFeatures /
    // decodeFailureProb.
    if policy.kind == 'fixed':
        accepted = blockState.flipsAccepted < floor(policy.ratio * blockState.ecCount)
        return { accepted, pNew: 0 }   // pNew unused under 'fixed'

    // 'probabilistic': accept if the new cumulative failure probability stays
    // under the tolerance. Per spec §9: P(block-fails) = 1 - prod(1 - p_i).
    // Hard cap by floor(ecCount/2) regardless of probability — RS-H cannot
    // recover more than that even in the best case.
    if blockState.flipsAccepted >= floor(blockState.ecCount / 2):
        return { accepted: false, pNew: 0 }

    pNew = max(p_i for i in candidate.modules):
        features_i = extractFeatures(ctx, candidate.modules[i])
        decodeFailureProb(features_i, ART_UP_COEFFICIENTS)
    survival = blockState.cumulativeSurvivalProb * (1 - pNew)
    cumulativeFailure = 1 - survival
    return { accepted: cumulativeFailure < policy.failureTolerance, pNew }

// Module-flipper outer loop becomes:
for each block b:
    state = {
        cumulativeSurvivalProb: 1,
        flipsAccepted: 0,
        ecCount: layout.ecCountForBlock(b),   // from existing codewordLayout
    }
    candidates = sort_by_sampling_sim_delta(candidatesInBlock[b])
    for cw in candidates:
        { accepted, pNew } = shouldAcceptFlip(policy, state, cw, ctx)
        if not accepted: break
        applyFlip(cw)
        state.flipsAccepted += 1
        state.cumulativeSurvivalProb *= (1 - pNew)   // pNew = 0 under 'fixed' → no-op
```

`extractFeatures(ctx, module)` reads:

- `surroundContrast`: avg luma of 8 surround subpixels minus centre subpixel luma.
- `centreCorrelation`: 1.0 if centre matches `target.target[my][mx]`, 0.0 otherwise (proxy for "is this flip working with or against the dither?").
- `finderDistance`: Chebyshev distance in modules to the nearest of the 3 finder corners (precomputable per matrix-size).

### Algorithm sketch — calibration script

Reference: [spec §9 calibration tooling](../specs/2026-05-08-pipeline-extensions-design.md#9-spec--pr-5--art-up-probabilistic-flip-budget).

```
1. Generate corpus: 120 QR codes across versions × modes × filters × templates × flip-buckets.
   For each render:
       a. Build matrix.
       b. Apply random flips (count = bucket * ecCount per block, distributed randomly).
       c. Render canvas via Phase 1c renderer (no Sampling-Sim — calibration runs against
          pre-Sampling-Sim flips so the model captures decode behaviour, not optimiser bias).
       d. Capture per-flipped-module features (surroundContrast, centreCorrelation, finderDistance).
       e. Run jsqr at native + 200×200; record per-block decode failure (true/false).

2. For each (qr, block), gather: features per flipped module + binary outcome.
3. Fit logistic regression on the pooled dataset:
       P(decode_failure | features) = sigmoid(intercept + sum(coeff_i * feature_i))
   Implementation: simple gradient descent (no scipy in node — implement in TS, ~30 LoC).

4. Compute goodness-of-fit metrics:
       R² (McFadden's pseudo-R² or similar)
       AUC (ROC area under curve via trapezoid sum on sorted probabilities)
   Print to stdout.

5. If AUC > 0.85: write src/lib/flipBudget.calibration.ts with fitted coefficients and
                   DEFAULT_FAILURE_TOLERANCE = 0.05.
   Else: write the file with placeholder coefficients (zeros) and DEFAULT_FAILURE_TOLERANCE = 1.0
         (effectively disables ART-UP — falls back to fixed cap). Print a warning.
```

The script is **dev-only**. Re-run only when jsqr is upgraded or rendering parameters change materially (per spec §9). Add to `package.json` as `npm run calibrate:flip-budget` for discoverability.

### Test plan

**New tests in `src/lib/flipBudget.test.ts`:**

1. `decodeFailureProb` — sigmoid math: at z=0, returns 0.5; at large negative z, returns ~0; at large positive z, returns ~1.
2. `shouldAcceptFlip` for `kind: 'fixed'` — accepts up to floor(ratio × ecCount), rejects beyond.
3. `shouldAcceptFlip` for `kind: 'probabilistic'` — monotonicity: more accepted flips → higher cumulative failure → eventual rejection.
4. Hard cap: `shouldAcceptFlip` returns false once `flipsAccepted >= floor(ecCount / 2)` regardless of probability.
5. Edge: zero candidates in a block → state unchanged, no flips.
6. Edge: failure probability of a candidate is exactly 0 → cumulative survival product unchanged.

**Modify `src/lib/moduleFlipper.test.ts`:**

7. Inject `FlipBudgetPolicy.fixed` and assert the flips-per-block matches the existing budget formula (Phase 2 baseline preserved under fixed policy).
8. Inject `FlipBudgetPolicy.probabilistic` with `failureTolerance: 0` and assert zero flips occur.
9. Inject `FlipBudgetPolicy.probabilistic` with `failureTolerance: 0.5` and assert more flips than `fixed` (loosened).

**Modify `src/lib/pipelineIntegration.test.ts`:**

10. Run the 48-case matrix under both policies; assert zero decode regression vs. Phase 2; assert total Sampling-Sim score is ≤ Phase 2 (preferably strictly less in ≥ 60 % of cases).

**New test (calibration script integration, dev-only):**

11. `scripts/calibrate-flip-budget.test.ts` — exercises the script's logistic-regression core with a tiny synthetic dataset (10 datapoints, known coefficients). Asserts the fit recovers the planted coefficients within tolerance. **Not** part of the main `npm test` run — gated behind `vitest --run scripts/`. Optional but recommended.

**Must keep passing without modification:**

- All Phase 1 / Phase 2 tests (modulo the file-table modifications).
- `composer.test.ts`, `qrMatrix.test.ts`, `halftoneTarget.test.ts`, `codewordLayout.test.ts`, `decodeQrImage.test.ts`, `posterSize.test.ts`, `scanVerifier.test.ts`, `imageOps.test.ts`, `samplingSim.test.ts`, `compositeRenderer.test.ts`, `predictedCanvas.test.ts`.

### Verification

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
npm run calibrate:flip-budget   # one-time, before merging Phase 3
```

The calibration script must be run **before** the PR is opened — the generated coefficients file is part of the PR. CI does not re-run the script.

### Risks & rollback

- **Risk:** calibration corpus too small / unrepresentative → coefficients fit jsqr noise rather than true decode behaviour. *Mitigation per [spec §9 risk](../specs/2026-05-08-pipeline-extensions-design.md#9-spec--pr-5--art-up-probabilistic-flip-budget):* AUC > 0.85 gate; ship `'fixed'` policy as default if not met. *Detection:* AUC printed by the script.
- **Risk:** jsqr ≠ phone cameras. *Mitigation:* jsqr is *stricter* than phones, so calibrating against jsqr is conservative. *Manual check:* phone-camera spot-check on 5–10 QRs after merge (deferred per "Out of scope" #1).
- **Risk:** hard cap interacts badly with cumulative-probability cap (one or the other always dominates → calibration is unused). *Detection:* during integration testing, log which cap fires per block. If `flipsAccepted >= floor(ecCount/2)` ever fires before the probability cap, the calibration is too lax.
- **Risk:** the FlipBudgetPolicy default change breaks an existing user's saved settings. *Mitigation:* `flipBudgetPolicy` is **not** persisted (`getInitialState` doesn't rehydrate it); every reload uses the code-default. *No PERSIST_KEY bump needed.*
- **Risk:** the calibration script bit-rots between runs (jsqr API change, render pipeline shift). *Mitigation per [spec §11](../specs/2026-05-08-pipeline-extensions-design.md#11-risk-register-summary):* document re-run conditions in the script's header comment. CI does not run it; document it as "owner runs once per release cycle if jsqr is upgraded".
- **Rollback:** flip the runtime default from `'probabilistic'` to `'fixed'`. The fixed policy is identical to Phase 2 behaviour (same `DEFAULT_ECC_BUDGET_RATIO = 0.15`). One-line change in `useQrPipeline.ts`.

### Open questions

- **AUC threshold value (0.85).** Spec [§9 risk](../specs/2026-05-08-pipeline-extensions-design.md#9-spec--pr-5--art-up-probabilistic-flip-budget) sets it; confirm with reviewer that this is acceptable. Alternative: ship `'probabilistic'` as default at AUC > 0.75 with a console warning, only fall back to `'fixed'` at AUC < 0.65.
- **Should `flipBudgetPolicy` be exposed in `AdvancedOptions`?** Plan recommends *no* (keep it as a code-level constant for the v1 release). Confirm with reviewer.
- **Calibration corpus selection.** "2 source templates" per spec — which two? Recommend (a) `ntuas` (the default, monochrome silhouette) and (b) one custom photo (representative of `filter: 'color'` workloads). Document the choice in the script's header.
- **Hard-cap behaviour at the boundary.** When `flipsAccepted == floor(ecCount/2) - 1` and the next candidate has `p_new ≈ 0`, the cumulative-prob test passes but the hard-cap test rejects on the *next* iteration. Is that the intended behaviour? Spec is silent; recommend "yes — RS-H cannot recover more than half-ecCount errors per block, so the hard cap is a correctness floor". Document in `flipBudget.ts` header.

---

## Final documentation pass (folded into Phase 3 PR)

- [ ] Update `CLAUDE.md` "Touching the halftone pipeline" section: stage diagram updated; new files listed; author typo fixed.
- [ ] Create `docs/PIPELINE.md` per [spec §10.5](../specs/2026-05-08-pipeline-extensions-design.md#105-documentation).
- [ ] Inline JSDoc on every public type added in this plan (`PredictedCanvas`, `SamplingSimContext`, `FlipBudgetPolicy`, `FilterMode`, `RenderMode`).
- [ ] Spot-check that no `colorHalftone` references remain anywhere (`grep -r colorHalftone .`).

---

## Appendix — Risk register reconciliation

Cross-reference with [design spec §11 risk register](../specs/2026-05-08-pipeline-extensions-design.md#11-risk-register-summary):

| Spec risk | Plan phase / mitigation |
|---|---|
| Predicted canvas drifts when matrix changes between build and render | Phase 1b — checksum invariant + lifecycle test |
| Sampling-Sim incremental update bug | Phase 2 — incremental-vs-full equality test (#5) |
| ART-UP coefficients overfit to jsqr noise | Phase 3 — AUC > 0.85 gate; fallback to `'fixed'` |
| Composite mode decode rate worse than halftone | Phase 1c — 48-case matrix gate |
| Performance regression past 500 ms | Phase 2 — perf test (#8); per-phase isSlow dev warning |
| `colorHalftone` rename misses a consumer | Phase 1a — tsc + lint catch refs |
| Calibration script bit-rots | Phase 3 — header doc; one-shot opt-in CI run (deferred) |

**End of plan.**
