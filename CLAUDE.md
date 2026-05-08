# CLAUDE.md — Orientation for Claude Code Agents

This file gives an agent enough context to make non-obvious decisions in this repo without re-deriving them from scratch. Read [README.md](README.md) first for the user-facing description; this doc covers the things that aren't obvious from the code.

## What this is

A small client-only React app that turns a URL into a halftone-style QR code. Implementation follows Chu, Chang, Lee, Mitra 2013 ("Halftone QR Codes", SIGGRAPH Asia), with Phase-2 Sampling-Sim scoring per Zhang et al. 2021 ("ArtCoder", CVPR) and an optional qart.js-style composite render mode. Deployed as a Cloudflare Worker with static assets (SPA mode). No backend, no tracking, no auth — pure browser code.

## Technology snapshot

- **React 19 + TypeScript + Vite 8** — single-page app
- **Tailwind CSS v4** via `@tailwindcss/vite` (no `tailwind.config.ts`; tokens live in `src/index.css` as `@theme` variables)
- **vitest + jsdom** for unit tests; **Playwright (chromium + webkit)** for E2E
- **ESLint flat config** (`eslint.config.js`); CI runs both `typecheck` (tsc) and `lint` (eslint)
- **`canvas` (node-canvas)** is a devDep that polyfills jsdom's 2D context for tests — see "Locked decisions" below

## Key design constraints (don't relitigate without strong evidence)

1. **No quiet zone around the QR.** Canonical halftone QRs intentionally fill the whole canvas. Phone cameras decode them fine but pure-JS decoders (jsqr) are stricter — the in-browser ScanBadge is conservative.
2. **ECC level H, hardcoded.** See `QR_ECC_LEVEL` in `src/types.ts`. The mask-optimiser and module-flipper assume H. Don't change without re-deriving the codeword/ECC tables in `src/lib/codewordLayout.ts`.
3. **Per-RS-block flip budget = 0.15 × ecCount** (`DEFAULT_ECC_BUDGET_RATIO` in `moduleFlipper.ts`) under the default `'fixed'` `FlipBudgetPolicy`. The paper uses 0.49; we're conservative because jsqr is strict. Empirically tuned — bump only if you've tested on a phone. The alternative `'probabilistic'` policy (ART-UP) is enabled iff calibration has been run with AUC > 0.85; until then it's disabled via `DEFAULT_FAILURE_TOLERANCE = 1.0` in `src/lib/flipBudget.calibration.ts` and the runtime falls through to `'fixed'`.
4. **`useQrPipeline` hook / poster `useMemo` split is load-bearing.** The hook (`src/hooks/useQrPipeline.ts`) rebuilds the QR (expensive: builds 8 mask candidates, scores, flips) and re-runs only on `[url, templateId, customSource, silhouetteScale, multiSize]`. The poster is a `useMemo` in `App.tsx` that depends on `[qrCanvas, caption, posterSize, palette]`. Don't recouple — typing in the caption shouldn't re-run mask optimisation.
5. **Composer halo uses a seeded PRNG.** `composer.ts` uses `mulberry32` seeded from `caption.length + size.width + size.height` so the same inputs produce the same poster. Don't reintroduce `Math.random`.

## Locked decisions (verified, don't redo)

- **`canvas` (native node-canvas) cannot be removed** even though it's heavyweight. jsdom delegates every `getContext('2d')`, `putImageData`, `drawImage` call to it, AND its native binding does an `instanceof` check on its own ImageData type that rejects polyfill objects. Tried in commit history; reverted. If you want to drop it, you'd have to refactor every test+source path that touches a 2D context.
- **Tailwind stays on v4 with the Vite plugin** (`@tailwindcss/vite`), no `tailwind.config.ts`, no `postcss.config.js`, no `autoprefixer`. Theme tokens live in `src/index.css` `@theme` block.
- **`qrcode` private API, exact-pinned at `1.5.4`.** `src/lib/qrMatrix.ts` reads `qr.modules.reservedBit` to identify structurally-reserved cells. There's a runtime assertion that throws a clear error if the field shape changes. The pin is exact (no caret) — never bump it without re-running the full test suite, including the pipeline integration test, against the new version. Don't try to vendor `qrcode` — the runtime guard is enough.
- **Internal/proprietary license.** This is NOT an MIT/open-source project. Logo assets are © NTU Astronomical Society. See `LICENSE`.

## Repo layout

See README's "Project layout" section. Important non-obvious things:

- `src/lib/imageOps.ts` holds image utilities used by both the renderer and `App.tsx` (rasterise, dither, image loading, file → data URL). Don't fork these into individual files.
- `src/types.ts` is the shared types module. New cross-cutting types (`Palette`, `MaskPattern`, `FONT_STACK_CANVAS`) go here. Reducer-specific types (`AdvancedSettings`, `AppState`, `AppAction`) live in `src/appReducer.ts`.
- `src/components/QrIcon.tsx` is the only iconographic component — currently a single QR-grid SVG used by the "Decode QR" button.
- `e2e/` is Playwright tests, kept out of vitest's `include` glob. Don't move test files between dirs without checking both runners.

## Running things

```bash
npm install
npm run dev                    # vite dev :5173
npm run typecheck              # tsc -b --noEmit
npm run lint                   # eslint . --max-warnings=0  (zero warnings tolerated)
npm test                       # vitest run (238 tests across 27 files)
npm run test:coverage          # vitest run --coverage (CI gate: 80% lines, 70% branches)
npm run test:e2e               # Playwright chromium + webkit (26 tests; builds first, runs against vite preview :4173)
npm run test:e2e:ui            # Playwright UI mode
npm run build                  # → dist/
npm run deploy                 # wrangler deploy (Cloudflare Worker w/ static assets)

# Dev-only:
npm run calibrate:flip-budget  # tsx scripts/calibrate-flip-budget.ts
                               # — re-run when jsqr is upgraded or the rendering pipeline changes materially.
```

## Common tasks

### Adding a new template
1. Drop the asset under `public/templates/` (1024² PNG or SVG, transparent or solid black).
2. Add an entry to `src/templates/presets.ts` with `id`, `displayName`, `sourcePath`, and a `palette` (only `accent` is required).
3. Restart the dev server. The TemplatePicker auto-renders it.
4. See `public/templates/README.md` for the asset rules and how to regenerate the wordmark templates.

### Adding an "advanced" setting
1. Extend `AdvancedSettings` in `src/appReducer.ts` (interface).
2. Update `initialState` to include the default.
3. Both `Controls.tsx` and `AdvancedOptions.tsx` already type their patches as `Partial<AdvancedSettings>`, so the new field flows through automatically.
4. Add UI for it in `AdvancedOptions.tsx`.

### Touching the halftone pipeline
The pipeline has six stages — never short-circuit one without understanding the next:

```
buildMatrix (qrMatrix.ts)
  → computeHalftoneTarget (halftoneTarget.ts)
  → buildPredictedCanvas (predictedCanvas.ts)
  → pickBestMask (maskOptimizer.ts)         [Sampling-Sim totalScore × 8]
  → flipModulesByCodeword (moduleFlipper.ts) [Sampling-Sim Δ-score + FlipBudgetPolicy]
  → render (halftoneRenderer.ts | compositeRenderer.ts)
```

Stage 1 produces a flat `Uint8Array` `reserved` mask (`QRMatrix.reserved`, 1 = reserved/0 = data, indexed `[y * size + x]`). Stage 2 takes that mask and the source ImageData and produces a `HalftoneTarget` whose `importance: number[][]` carries the fractional fidelity weights (0 / 0.1 / 1.0). Stage 3 builds the subpixel-resolution `PredictedCanvas` once per pipeline run; renderers and Sampling-Sim both consume it. Stage 4 (mask) builds 8 `SamplingSimContext` objects against `predicted` and ranks by `totalScore`. Stage 5 (flip) reads `target.importance`, `target.target`, `codewordLayout.ts` for the module ↔ codeword inverse map, and the post-mask `SamplingSimContext` for Δ-score + per-block acceptance gating. Don't conflate the matrix `reserved` mask (binary) with the target `importance` (weighted). Tests in `src/lib/*.test.ts` exercise each stage individually; `docs/PIPELINE.md` has the full data-flow diagram.

### Verifying changes
Always run **all of**: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`. CI enforces all five plus a bundle-size budget (gzipped JS < 350 KB; currently ~127 KB).

**Perf regression test:** `src/lib/pipelineIntegration.perf.test.ts` measures V10 halftone-mono wall-clock (median of 7 iterations) and asserts < 500 ms. Auto-skips when `CI=true` or `SKIP_PERF=true`. If you touch `samplingSim.ts` or `moduleFlipper.ts`, run it locally before merging.

**48-case integration matrix:** `src/lib/pipelineIntegration.test.ts` exercises the full pipeline across 3 versions × 2 render modes × 2 filters × 2 source types × 2 multiSize options. Strict decode assertions are scoped to empirically 100%-passing axes (halftone-mono / halftone-color silhouette at native size for V5/V10/V15); composite axes are observational. If you touch the pipeline, run it.

**Pipeline reference:** [`docs/PIPELINE.md`](docs/PIPELINE.md) has the canonical data-flow diagram and stage-by-stage description. Always check this first before touching multiple stages.

**Tracked-but-deferred work:** [`docs/FOLLOWUPS.md`](docs/FOLLOWUPS.md). Trigger conditions, file pointers, and "what needs to happen first" are recorded there. Update (don't replace) the tracker when an item ships, gets re-scoped, or is permanently dropped.

## Gotchas

- **`useQrPipeline` deps are exhaustive on purpose.** The eslint `react-hooks/exhaustive-deps` rule is enforced. The hook input is destructured at the top so the deps array lists specific fields. Don't pass an `input` object as a dep — eslint will flag it, and a fresh object each render would re-run the pipeline every render.
- **`set-state-in-effect`** is also enforced. Don't put synchronous `setState` calls in an effect body — defer to an async function or a microtask. The hook's `buildQr` async fn demonstrates the pattern.
- **`react-refresh/only-export-components`** triggers when a component file exports non-component values. Move shared constants/types to `src/types.ts` or a non-component file.
- **The `canvas` jsdom polyfill needs care in tests.** If you write a new test that constructs `ImageData` or calls `getContext('2d')`, the existing setup (`vitest.setup.ts`) covers it. If you need to mock `URL.createObjectURL` or `Image`, see `src/lib/decodeQrImage.test.ts` for the established pattern.
- **CSS theme tokens are scanned from class usage.** Tailwind v4 won't generate `bg-newcolor` unless `--color-newcolor` is in `@theme` AND a class uses it. After adding a token, check the build CSS isn't missing classes.

## When in doubt

- For pipeline math: read `docs/superpowers/specs/2026-05-06-astro-qr-generator-design.md` (the original Chu-paper-derivation doc).
- For visual tokens: look at `src/index.css` `@theme` block. `DESIGN.md` is the *inspiration source* (Pinterest), not the implementation spec.
- For asset prep: `public/templates/README.md` documents the regeneration scripts for wordmark/constellation templates.
