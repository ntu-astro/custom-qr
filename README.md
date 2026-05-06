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

- `src/lib/qrMatrix.ts` — QR module matrix + reserved mask
- `src/lib/halftoneRenderer.ts` — 4 halftone styles, pure function
- `src/lib/composer.ts` — poster layout
- `src/lib/scanVerifier.ts` — `jsqr` at multiple sizes
- `src/templates/presets.ts` — 7-template registry
- `src/components/*` — React UI
- `src/App.tsx` + `src/appReducer.ts` — state + pipeline orchestration

## License

Internal NTU Astronomical Society project. Logo assets © NTU Astronomical Society.
