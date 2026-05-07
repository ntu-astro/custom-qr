# Astro QR — Halftone QR Generator

A small, polished web app that turns any URL into a halftone-style QR code with an astronomy-themed silhouette. Built for [NTU Astronomical Society](https://www.instagram.com/ntu_astro/).

## Features
- 6 built-in templates (Earth, Orion, Scorpius, Crux (Southern Cross), Sagittarius Teapot, NTUAS)
- Upload your own PNG/SVG silhouette (≤ 10MB)
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
npm run dev          # vite dev server on :5173
npm test             # vitest run, 36 unit + 2 decode tests
npm run test:e2e     # playwright chromium smoke (6 tests, builds first)
npm run typecheck    # tsc -b --noEmit
npm run lint         # eslint . --max-warnings=0
npm run build        # → dist/
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests, build, and the Playwright smoke suite on every push and pull request — a green `main` reflects all five gates.

## Asset prep

Two NTU templates ship as best-effort placeholders. Maintainers can regenerate them from updated source logos — see [`public/templates/README.md`](public/templates/README.md).

## Deploy

Hosted on Cloudflare Pages.

```bash
npx wrangler login        # one-time
npm run build
npm run deploy
```

Or connect this repo to a Cloudflare Pages project with build command `npm run build` and output directory `dist`.

## Project layout

```
src/
  App.tsx                  # state + pipeline orchestration
  appReducer.ts            # state machine (URL, template, advanced settings)
  index.css                # Tailwind v4 entrypoint + @theme tokens
  main.tsx                 # React root + ErrorBoundary
  types.ts                 # shared types and constants
  components/              # React UI (Controls, QrPreview, etc.)
  lib/                     # pure halftone-pipeline modules
  templates/presets.ts     # template registry (id → asset + palette)
public/templates/          # built-in silhouette source assets (svg/png)
e2e/                       # Playwright smoke tests
.github/workflows/ci.yml   # CI pipeline
```

See [`CLAUDE.md`](CLAUDE.md) for orientation if you're a Claude Code agent landing in this repo, and [`CONTRIBUTING.md`](CONTRIBUTING.md) for the human contributor flow.

## Architecture

Canonical Chu et al. 2013 ("Halftone QR Codes", SIGGRAPH Asia) pipeline:

- `src/lib/qrMatrix.ts` — QR module matrix + reserved-cell importance map
- `src/lib/imageOps.ts` — pure canvas / image-data helpers (rasterise + Floyd–Steinberg dither + image loading utils)
- `src/lib/halftoneTarget.ts` — dither the source illustration to per-module targets
- `src/lib/maskOptimizer.ts` — Stage 2: pick the QR mask whose post-mask bits best match the silhouette
- `src/lib/codewordLayout.ts` — module ↔ codeword inverse map for ECC-H QR symbols (used by Stage 3 to budget flips per RS block)
- `src/lib/moduleFlipper.ts` — Stage 3a: per-RS-block greedy module flips paid for by ECC slack (paper budget 0.49 × ecCount)
- `src/lib/halftoneRenderer.ts` — sub-pixel halftone (3×3 grid per module, centre 1/9 stamp), pure black-on-white, no quiet zone
- `src/lib/composer.ts` — poster layout (separate from the QR rendering itself)
- `src/lib/scanVerifier.ts` — jsqr-based in-browser scan check at multiple sizes
- `src/lib/decodeQrImage.ts` — decode an uploaded QR image back to its URL/text (the "Decode QR" button feature)
- `src/templates/presets.ts` — template registry
- `src/components/*` — React UI
- `src/App.tsx` + `src/appReducer.ts` — state + pipeline orchestration

QRs are also checked live in the browser via a jsqr-based scan verifier (`src/lib/scanVerifier.ts`), which feeds the on-screen ScanBadge. Note that jsqr is stricter than real phone cameras — canonical halftone QRs intentionally have no quiet zone, which can trip pure-JS decoders even when phone cameras decode them fine, so the "may not scan" warning is conservative.

## License

Internal NTU Astronomical Society project. Logo assets © NTU Astronomical Society.
