# Astro QR — Custom QR Generator

A small, polished web app that turns any URL into a custom QR code with an astronomy-themed silhouette. Two render styles ship out of the box — **Composite** (qart.js-style, default) and **Halftone** (Chu et al. 2013). Built for [NTU Astronomical Society](https://www.instagram.com/ntu_astro/).

**Live:** [custom-qr.ntuas.com](https://custom-qr.ntuas.com)

## Features
- 6 built-in templates (Earth, Orion, Scorpius, Crux (Southern Cross), Sagittarius Teapot, NTUAS)
- Upload your own PNG/SVG silhouette (≤ 10MB)
- Two render styles: **Halftone** (Chu et al. 2013, image diffused across all modules) or **Composite** (qart.js-style, clean QR centre with image as surround)
- Image-derived dot color with luminosity-clamped QR data modules
- Auto-color halftone for uploaded silhouettes (per-pixel hue preserved, contrast-clamped)
- Decode QR: upload an existing QR image to recover its URL/text and re-stylise it
- Adjustable silhouette scale + optional print-size scan check
- Live scan verification (screen-size, optional print-size 200×200px)
- Three exports: QR-only PNG, QR-only SVG (PNG-embedded wrapper), Poster PNG (1080², 1080×1920, A4, custom)
- Fully client-side. No tracking. No backend.

## Local development

```bash
npm install
npm run dev               # vite dev server on :5173
npm test                  # vitest run (238 tests across 27 files)
npm run test:coverage     # vitest with coverage (CI gates: 80% lines, 70% branches)
npm run test:e2e          # playwright chromium + webkit (26 tests, builds first)
npm run typecheck         # tsc -b --noEmit
npm run lint              # eslint . --max-warnings=0
npm run build             # → dist/

# Dev-only — re-run when jsqr or rendering pipeline changes materially:
npm run calibrate:flip-budget  # tsx scripts/calibrate-flip-budget.ts
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs **all six gates** on every push and pull request:

1. `npm run typecheck` (tsc --noEmit)
2. `npm run lint` (eslint, zero warnings)
3. `npm run test:coverage` (vitest with 80%/70% thresholds)
4. `npm run build`
5. **Bundle-size budget** — gzipped JS must stay under 350 KB (currently ~127 KB)
6. `npm run test:e2e` (Playwright chromium + webkit)

A green `main` reflects all six. Branch protection is **not** currently enforced — see [`docs/FOLLOWUPS.md`](docs/FOLLOWUPS.md) for the manual repo-settings step needed to require these checks before merge.

## Asset prep

Two NTU templates ship as best-effort placeholders. Maintainers can regenerate them from updated source logos — see [`public/templates/README.md`](public/templates/README.md).

## Deploy

Deployed as a Cloudflare Worker with [static assets](https://developers.cloudflare.com/workers/static-assets/) (`assets.directory` in [`wrangler.jsonc`](wrangler.jsonc), SPA fallback). Cloudflare Workers Builds auto-deploys from `main` via the GitHub integration (configured in the dashboard, not in this repo). For one-off manual deploys:

```bash
npx wrangler login        # one-time
npm run build
npm run deploy            # wrangler deploy
```

### Domains & routes

| Type | URL |
|---|---|
| Custom domain (primary) | [custom-qr.ntuas.com](https://custom-qr.ntuas.com) |
| `workers.dev` | [custom-qr.ntuas.workers.dev](https://custom-qr.ntuas.workers.dev) |
| Preview URLs | `*-custom-qr.ntuas.workers.dev` (per Workers Build) |

## Project layout

```
src/
  App.tsx                  # state + pipeline orchestration
  appReducer.ts            # state machine (URL, template, advanced settings, renderMode)
  hooks/useQrPipeline.ts   # async pipeline orchestration hook
  index.css                # Tailwind v4 entrypoint + @theme tokens
  main.tsx                 # React root + ErrorBoundary
  types.ts                 # shared types (FilterMode, RenderMode, QRMatrix, RenderOptions, …)
  components/              # React UI (Controls, QrPreview, AdvancedOptions, etc.)
  lib/                     # pure pipeline modules
  templates/presets.ts     # template registry (id → asset + palette)
public/templates/          # built-in silhouette source assets (svg/png)
scripts/                   # dev-only tooling (calibrate-flip-budget.ts)
e2e/                       # Playwright smoke + flow tests (chromium + webkit)
docs/                      # PIPELINE.md, FOLLOWUPS.md, superpowers/{plans,specs}
.github/workflows/ci.yml   # CI pipeline
```

See [`CLAUDE.md`](CLAUDE.md) for orientation if you're a Claude Code agent landing in this repo, [`docs/PIPELINE.md`](docs/PIPELINE.md) for the canonical pipeline data-flow reference, [`docs/FOLLOWUPS.md`](docs/FOLLOWUPS.md) for tracked-but-deferred work, and [`CONTRIBUTING.md`](CONTRIBUTING.md) for the human contributor flow.

## Architecture

Canonical Chu et al. 2013 ("Halftone QR Codes", SIGGRAPH Asia) pipeline, extended in 2026-05 with composite render mode (Cox/qart.js style), Sampling-Sim scoring (ArtCoder, CVPR 2021), and probabilistic ART-UP flip budget. See [`docs/PIPELINE.md`](docs/PIPELINE.md) for the full data-flow diagram.

**Pipeline modules** (`src/lib/*`):

- `qrMatrix.ts` — QR module matrix build + reserved-cell mask
- `imageOps.ts` — pure canvas/image-data helpers + shared image-conditioning (rasterise, Floyd–Steinberg dither, lift margin, blend against white, silhouette detection, luminosity clamp, structural-ink constants)
- `halftoneTarget.ts` — Stage 1: dither the source to per-module targets + importance weights
- `predictedCanvas.ts` — Stage 2 prep: subpixel-resolution canvas built once per pipeline run; consumed by both renderers and Sampling-Sim
- `maskOptimizer.ts` — Stage 2: pick the QR mask whose post-mask matrix best matches the target under Sampling-Sim scoring
- `codewordLayout.ts` — module ↔ codeword inverse map for ECC-H symbols (used by Stage 3 to budget flips per RS block)
- `samplingSim.ts` — ArtCoder-style Gaussian-weighted readback model (5×5 subpixel kernel, σ=1) used by mask scoring + flip Δ-scoring
- `flipBudget.ts` + `flipBudget.calibration.ts` — Stage 3 acceptance gate; `'fixed'` (Phase 2 default) or `'probabilistic'` (ART-UP, activates when calibration AUC > 0.85)
- `moduleFlipper.ts` — Stage 3a: per-RS-block greedy flips with lazy re-score, paid for by ECC slack (default budget 0.15 × ecCount under `'fixed'`)
- `halftoneRenderer.ts` — Chu et al. 2013 sub-pixel halftone (3×3 grid per module, centre 1/9 stamp); diffuses image across all modules
- `compositeRenderer.ts` — qart.js-style composite (centre 1/9 = QR data, surround 8/9 = cover image); reserved cells always paint structural ink for decode contrast
- `composer.ts` — poster layout (separate from QR rendering itself)
- `scanVerifier.ts` — jsqr-based in-browser scan check at multiple sizes
- `decodeQrImage.ts` — decode an uploaded QR image back to its URL/text (the "Decode QR" button feature)

**Other src/ surfaces:**
- `src/templates/presets.ts` — template registry
- `src/components/*` — React UI (`AdvancedOptions.tsx` carries the new render-style radio)
- `src/App.tsx` + `src/appReducer.ts` — state + pipeline orchestration
- `src/hooks/useQrPipeline.ts` — orchestrates the pipeline; rebuilds on `[url, templateId, customSource, silhouetteScale, multiSize, filter, renderMode]`

**Calibration tooling** (`scripts/calibrate-flip-budget.ts`): generates a 120-QR corpus, fits logistic regression on per-flipped-module features, writes `src/lib/flipBudget.calibration.ts`. Re-run when jsqr is upgraded or the rendering pipeline changes meaningfully.

QRs are checked live in the browser via the jsqr scan verifier (`scanVerifier.ts`), which feeds the on-screen ScanBadge. Note that jsqr is stricter than real phone cameras — canonical halftone QRs intentionally have no quiet zone, which can trip pure-JS decoders even when phones decode fine, so the "may not scan" warning is conservative.

## License

Internal NTU Astronomical Society project. Logo assets © NTU Astronomical Society.
