# Astro QR — Halftone QR Generator

A small, polished web app that turns any URL into a halftone-style QR code with an astronomy-themed silhouette. Built for [NTU Astronomical Society](https://ntuastro.com).

## Features
- 7 built-in templates (Saturn, Telescope, Galaxy Spiral, Comet, Observatory Dome, NTU Astro mark, NTU Astro scene)
- Upload your own PNG/SVG silhouette (≤ 2MB)
- 4 halftone styles: Hybrid (default), Variable dot size, Stippling, QR-grid dithered
- Adjustable density and margin
- Image-derived dot color with luminosity-clamped QR data modules
- Live scan verification (screen-size, optional print-size 200×200px)
- Three exports: QR-only PNG, QR-only SVG (PNG-embedded wrapper), Poster PNG (1080², 1080×1920, A4, custom)
- Fully client-side. No tracking. No backend.

## Local development

```bash
npm install
npm run dev         # vite dev server on :5173
npm test            # vitest run, ~18 tests
npm run lint        # tsc --noEmit
npm run build       # → dist/
```

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

## Architecture

Canonical Chu et al. 2013 ("Halftone QR Codes", SIGGRAPH Asia) pipeline:

- `src/lib/qrMatrix.ts` — QR module matrix + reserved-cell importance map
- `src/lib/halftoneTarget.ts` — dither the source illustration to per-module targets
- `src/lib/maskOptimizer.ts` — Stage 2: pick the QR mask whose post-mask bits best match the silhouette
- `src/lib/moduleFlipper.ts` — Stage 3a: per-RS-block greedy module flips paid for by ECC slack (paper budget 0.49 × ecCount)
- `src/lib/halftoneRenderer.ts` — sub-pixel halftone (3×3 grid per module, centre 1/9 stamp), pure black-on-white, no quiet zone
- `src/lib/composer.ts` — poster layout (separate from the QR rendering itself)
- `src/templates/presets.ts` — template registry
- `src/components/*` — React UI
- `src/App.tsx` + `src/appReducer.ts` — state + pipeline orchestration

QRs are tested with a real smartphone camera — there is no in-browser scan verifier (canonical halftone QRs intentionally have no quiet zone, which trips strict pure-JS decoders even though phone cameras decode them fine).

## License

Internal NTU Astronomical Society project. Logo assets © NTU Astronomical Society.
