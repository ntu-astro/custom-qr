# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No unreleased changes._

## [0.2.0] - 2026-05-08

Pipeline-extensions release. Adds a second render mode, a stronger optimiser
metric, and the infrastructure for a probabilistic flip-budget policy.

### Added

- **Composite render mode** (qart.js / Cox 2014 style) alongside the existing
  Chu et al. 2013 halftone. Each non-reserved module's centre 1/9 sub-pixel
  carries the QR data; the surround paints the cover image. Reserved cells
  always paint structural ink for decode contrast. Surfaced as a new
  "Render style: Halftone / Composite" radio group in Advanced options.
  ([#11](https://github.com/ntu-astro/custom-qr/pull/11))
- **Sampling-Sim scoring** (Zhang et al. 2021, "ArtCoder", CVPR). Replaces
  the binary mismatch metric in `pickBestMask` and the importance-weighted
  disagreement score in `flipModulesByCodeword` with an importance-weighted
  L1 over a Gaussian (5×5 σ=1) subpixel readback. Decode-rate-neutral or
  better vs the previous metric. ([#11](https://github.com/ntu-astro/custom-qr/pull/11))
- **`predictedCanvas.ts`** — subpixel-resolution canvas built once per
  pipeline run, consumed by both renderers and Sampling-Sim. Carries an
  FNV-1a checksum of `matrix.reserved` that renderers assert in dev to guard
  the lifecycle invariant (flips must touch only data modules).
  ([#11](https://github.com/ntu-astro/custom-qr/pull/11))
- **ART-UP probabilistic flip-budget infrastructure**
  (`src/lib/flipBudget.ts`). Tagged-union `FlipBudgetPolicy = { kind: 'fixed'
  | 'probabilistic' }`. The probabilistic policy gates each candidate flip by
  cumulative block-failure probability under a calibrated logistic
  regression, hard-capped at `floor(ecCount/2)`. The default policy resolves
  to `'probabilistic'` iff `CALIBRATION_AUC ≥ 0.85`, else `'fixed'`.
  ([#11](https://github.com/ntu-astro/custom-qr/pull/11))
- **Calibration tooling** (`scripts/calibrate-flip-budget.ts`). Generates
  120-QR corpus, fits logistic regression, writes
  `src/lib/flipBudget.calibration.ts`. Initial run produced AUC 0.6763 (below
  the 0.85 gate), so 0.2.0 ships zero coefficients with
  `DEFAULT_FAILURE_TOLERANCE = 1.0` — the runtime stays on `'fixed'`.
  ([#15](https://github.com/ntu-astro/custom-qr/pull/15))
- **Lazy re-score in `moduleFlipper.ts`** — after every accepted flip,
  re-score the OTHER remaining codewords in the same block whose readback
  footprint overlaps the affected modules. Prevents double-spending budget
  on overlapping flips that don't compound.
  ([#14](https://github.com/ntu-astro/custom-qr/pull/14))
- **48-case integration matrix** (`src/lib/pipelineIntegration.test.ts`).
  Covers 3 versions × 2 render modes × 2 filters × 2 source types ×
  2 multiSize options. Strict decode assertions on the empirically
  100%-passing axes (halftone-mono + halftone-color silhouette at native
  size for V5/V10/V15); composite axes are observational pending Phase 3
  calibration improvements. ([#16](https://github.com/ntu-astro/custom-qr/pull/16))
- **V10 perf regression test** (`src/lib/pipelineIntegration.perf.test.ts`).
  Mirrors `useQrPipeline.buildQr` and asserts median wall-clock under 500 ms
  over 7 iterations. Auto-skips on CI. Local median: ~71 ms (~7× headroom).
  ([#13](https://github.com/ntu-astro/custom-qr/pull/13))
- **`docs/PIPELINE.md`** — canonical data-flow diagram + stage-by-stage
  reference for the post-extensions pipeline.
  ([#11](https://github.com/ntu-astro/custom-qr/pull/11))
- **`docs/FOLLOWUPS.md`** — tracker for deferred items (monitored,
  operational, known limitations, dropped from scope).
  ([#12](https://github.com/ntu-astro/custom-qr/pull/12))
- **`tsx`** added as a devDependency (^4.21.0) so
  `npm run calibrate:flip-budget` resolves.
  ([#12](https://github.com/ntu-astro/custom-qr/pull/12))
- Repo setting: `deleteBranchOnMerge: true`. Feature branches are now
  removed automatically after merge.
  ([#12](https://github.com/ntu-astro/custom-qr/pull/12))

### Changed

- `RenderOptions.colorHalftone: boolean` → `RenderOptions.filter: FilterMode`
  where `FilterMode = 'mono' | 'color'`. Threaded through `QrPipelineInput`
  as a top-level pipeline input rather than inferred inside the renderer.
  Pure rename — output is byte-identical for both modes.
  ([#6](https://github.com/ntu-astro/custom-qr/pull/6))
- `liftMarginBrightness`, `isOutsideSilhouette`, `clampLuminosity`,
  `blendAgainstWhite`, plus the `MAX_INK_LUM` / `SILHOUETTE_*` /
  `STRUCTURAL_INK*` / `DARK_PIXEL_LUMA_CUTOFF` constants promoted from
  `halftoneRenderer.ts` private scope to `imageOps.ts` named exports.
  Phase 1c (composite renderer) and Phase 2 (Sampling-Sim) consume these.
  ([#11](https://github.com/ntu-astro/custom-qr/pull/11))
- `ditherFloydSteinberg` now expects pre-blended (fully-opaque) input.
  All call sites pipe `blendAgainstWhite` first. The `halftoneTarget.ts`
  update fixes a latent bug where `silhouetteScale < 1` letterbox pixels
  inverted the silhouette target for transparent-background templates.
  ([#11](https://github.com/ntu-astro/custom-qr/pull/11))
- `pickBestMask(text, target, predicted)`, `scoreMask(matrix, target, predicted)` —
  new `predicted: PredictedCanvas` argument required. Built once outside;
  reserved-cell topology is identical across the 8 mask candidates so canvas
  reuse is safe. ([#11](https://github.com/ntu-astro/custom-qr/pull/11))
- `flipModulesByCodeword(matrix, target, options)` — new
  `options.samplingContext: SamplingSimContext` is required;
  `options.policy?: FlipBudgetPolicy` is optional (defaults to
  `DEFAULT_FLIP_BUDGET_POLICY` which resolves to `'fixed'` until calibration
  ships AUC ≥ 0.85 coefficients). ([#11](https://github.com/ntu-astro/custom-qr/pull/11),
  [#14](https://github.com/ntu-astro/custom-qr/pull/14))
- `AdvancedSettings` gains `renderMode: RenderMode`. Default `'halftone'`,
  not persisted in `localStorage`. ([#11](https://github.com/ntu-astro/custom-qr/pull/11))
- `useQrPipeline` rebuilds on the additional `[filter, renderMode]` deps.
  ([#11](https://github.com/ntu-astro/custom-qr/pull/11))
- `CLAUDE.md` "Touching the halftone pipeline" updated to the 6-stage
  diagram + canonical references to `docs/PIPELINE.md`. Author attribution
  corrected (Hsu typo → Mitra). ([#11](https://github.com/ntu-astro/custom-qr/pull/11))

## [0.1.1] - 2026-05-07 (tooling sweep, no functional changes)

### Added

- Coverage thresholds, CHANGELOG, .nvmrc, bundle-size budget added in tech-debt sweep.

### Changed

- Removed the GitHub Pages secondary deployment workflow — Cloudflare Pages
  is the sole deploy target. Vite `base` path env support reverted (no
  longer needed).
- Bumped Node to 24.15.0 LTS (Krypton) in `.nvmrc` and `package.json#engines`
  to `>=22.0.0`. Wrangler ≥4.88, miniflare, and `@cloudflare/kv-asset-handler`
  all require Node ≥22; the prior `.nvmrc=20` blocked `npm run deploy` on
  Cloudflare Pages.
- Migrated wrangler config from Pages-style (`pages_build_output_dir`) to a
  Workers static-assets shape (`assets.directory` + SPA `not_found_handling`).
  The Cloudflare project is a Worker named `custom-qr`, not a Pages project,
  and CF Builds calls `wrangler deploy` (not `wrangler pages deploy`).
  Updated the npm `deploy` script accordingly. README + CLAUDE.md follow.
- Renamed `wrangler.toml` → `wrangler.jsonc` per Cloudflare's recommendation
  for new projects ("some newer Wrangler features will only be available to
  projects using a JSON config file" — Wrangler configuration docs). The
  `$schema` ref to `node_modules/wrangler/config-schema.json` enables editor
  IntelliSense.

## [0.1.0] - 2026-05-07

### Added

- Initial release of the halftone QR code generator (React 19 + TypeScript + Vite SPA).
- Halftone QR pipeline implementing Chu et al. 2013: matrix build, halftone target, mask
  optimisation, codeword-aware module flipping, and final renderer.
- Constellation and wordmark template presets (Orion, Scorpius, Sagittarius Teapot, Crux,
  multi-color Earth, NTUAS wordmark) with auto-color halftone for uploaded images.
- Advanced controls: silhouette scale slider (30–100%), per-template palettes, no-quiet-zone
  rendering so the silhouette fills the full QR canvas.
- In-browser QR decoder for uploaded images (jsqr-based ScanBadge).
- Playwright E2E smoke suite (chromium-only) and vitest unit suite (jsdom + node-canvas).
- Cloudflare Pages deployment configuration via Wrangler.
- Repo documentation: README, DESIGN, CLAUDE.md (agent orientation), CONTRIBUTING.md.

### Changed

- Migrated to Tailwind CSS v4 via `@tailwindcss/vite` (no `tailwind.config.ts`,
  `@theme` tokens live in `src/index.css`).
- Tech-debt cleanup: split halftone pipeline into focused modules, added error boundary,
  enabled strict ESLint flat config (`--max-warnings=0`), deduped shared types into
  `src/types.ts`, bumped dependencies to latest.

[Unreleased]: https://github.com/ntu-astro/custom-qr/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ntu-astro/custom-qr/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/ntu-astro/custom-qr/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ntu-astro/custom-qr/releases/tag/v0.1.0
