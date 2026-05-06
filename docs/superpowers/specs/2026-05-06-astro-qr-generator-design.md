# Astro-Themed QR Code Generator — Design Spec

**Date:** 2026-05-06
**Status:** — Approved (auto mode)
**Owner:** zhunhao
**Audience:** NTU Astronomical Society club members

## Goal

A small, polished web app where club members paste a URL (or any text), pick an astronomy-themed art template (or upload their own silhouette), and download a halftone-style QR code that reads as a branded illustration rather than a plain QR. Outputs available as bare PNG/SVG or as a poster-format PNG with an optional caption. No backend, no signup, fully client-side, deployed to Cloudflare Pages.

## Non-goals

- No analytics, tracking, or telemetry
- No URL shortening or QR scanning utility for end users
- No multi-user accounts or saved history (everything is ephemeral in the browser)
- No server-side rendering
- No AI / generative ML
## Stack

- **Vite + React 18 + TypeScript** — fast SPA, tiny bundle
- **Tailwind CSS** — utility-first styling for the dark astronomy theme
- **`qrcode`** — battle-tested QR generator; we consume the raw module matrix, not its rendered image
- **`jsqr`** — pure-JS QR scanner used for in-browser scan verification
- **Custom halftone-QR renderer** — `src/lib/halftoneRenderer.ts`, canvas-based, no extra deps
- **Cloudflare Pages** — static deploy via `dist/` folder
- **Vitest** — unit tests for pure rendering logic
- **`potrace`** — build-time only (one-shot logo prep), not a runtime dependency

We deliberately drop `qr-code-styling` (used in v1 of this spec) — its dot-styling model cannot produce halftone-art QR codes.

## Feature scope

### Always-visible controls

1. **Input** — single text field for URL or arbitrary text. Accepts up to ~2000 chars (QR capacity limit).
2. **Template picker** — 7 art templates (gallery thumbnails):
   - **Saturn** — ringed planet silhouette
   - **Telescope** — reflector telescope on tripod
   - **Galaxy Spiral** — top-down spiral
   - **Comet** — comet with diagonal tail
   - **Observatory Dome** — domed building silhouette
   - **NTU Astro (mark)** — uses `public/templates/ntu-astro-mark.svg`, vectorized from the club's NTUAS monogram (logo-1)
   - **NTU Astro (scene)** — uses `public/templates/ntu-astro-scene.png` (2048×2048 transparent), processed from the moon-and-rocket scene logo (logo-2)
3. **Caption (optional)** — text rendered below the QR in poster export only
4. **Download** — three buttons:
   - **QR only (PNG)** — bare halftone QR at 1024×1024 (raster)
   - **QR only (SVG)** — SVG wrapper containing the rasterized halftone QR as an embedded `<image>` (base64 PNG). The wrapper carries the correct `viewBox` and dimensions so designers can drop it into Figma/Illustrator and scale it without re-exporting. Halftone with image-derived color cannot be cleanly rendered as pure vector primitives at acceptable file size, so v1 takes this honest hybrid approach.
   - **Poster (PNG only)** — composited poster (size + layout per Poster Mode below). PNG only because the poster frame uses raster rendering for the starfield/gradient background.

### Poster mode

When the user picks "Poster (PNG)", a size dropdown selects the output dimensions:

| Option | Dimensions | Default |
|---|---|---|
| Instagram Post | 1080×1080 | ✓ |
| Instagram Story | 1080×1920 | |
| A4 Portrait (300 DPI, printable) | 2480×3508 | |
| Custom | user-entered width/height | |

**Layout: single template with a centered square safe zone.**

- Safe zone size = `min(width, height) * 0.75`, centered in the frame
- Inside the safe zone:
  - QR fills top ~75% of the safe zone
  - Caption fills bottom ~25% (1–2 lines, auto-shrinks if longer)
- Outside the safe zone: warm white background. A subtle halo of `palette.accent`-colored dots radiates around the safe zone (≤15% opacity) — the QR remains the hero.

This single layout function works across all aspect ratios — no per-format branching.

### Advanced options (collapsed by default, behind a disclosure)

1. **Custom illustration upload** — file picker, accepts PNG/SVG ≤ 2MB. Raster uploads are alpha-extracted and viewport-normalized; SVG uploads are viewBox-normalized. Stored as a data URL in memory only.
2. **Halftone style** — Hybrid (default) / Variable dot size / Stippling / QR-grid dithered (definitions below)
3. **Halftone density** — slider, 30–80%, default 55%. Controls the brightness threshold at which a non-data position renders a halftone dot: lower values = sparser fill (only the darkest source pixels become dots), higher values = denser fill (more pixels become dots). Affects only non-data regions; QR data modules are always rendered.
4. **Margin (quiet zone)** — slider 0–60px, default 32px. Pixels of empty (transparent or background-colored) padding around the halftone QR in the rendered output canvas. Larger than a plain QR's quiet zone because halftone dots bleed visually beyond the QR's data bounds.
5. **Multi-size scan check** — toggle (off by default; on shows a print-size scan badge in addition to the screen-size badge)
6. **Background color** — color picker, defaults to transparent. Applied to the negative-space background of the exported PNG/SVG (the area outside halftone dots and QR modules). The source image dictates dot color; this control sets only what's *behind* the dots in the export. The page preview always shows the starfield page background regardless of this setting.

## Halftone QR rendering — core technique

This is the heart of the app. The renderer composes a scannable QR with a halftoned brand illustration so the result reads as a stylized image, not a plain QR.

### The four halftone styles

- **Hybrid (default)** — required QR data modules render as proper square cells (scannability is non-negotiable); non-data positions render as variable-size halftone dots that follow the source illustration. Best balance of scan reliability and artistic freedom.
- **Variable dot size** — dot size scales with source-pixel darkness; classic comic/newspaper look. QR data modules still preserve a minimum-contrast guarantee.
- **Stippling** — uniform-size dots, density varies with source darkness. Reads as a starfield, naturally on-theme.
- **QR-grid dithered** — every cell in the QR module grid is filled or empty based on source brightness; no sub-module halftone. Cleanest scan but flattest aesthetic.

### Color treatment — image-derived

Each halftone dot inherits its color from the corresponding pixel in the source image. The QR data modules apply a luminosity-floor adjustment to maintain contrast for scanning (e.g., a dot whose source pixel is bright yellow will be darkened just enough to keep the QR pattern readable, while preserving hue).

### Conflict resolution (QR vs source)

When a position is both a required QR data module AND has a bright source pixel:
1. Module geometry: render as a proper square (data wins on shape)
2. Module color: keep the source pixel hue, but clamp luminosity so the module reads as "dark" against the background

Non-data positions: full halftone freedom; the source image dictates dot size/density/color.

### Scan verification

Every render runs through `jsqr` after composition. Two checks:
- **Screen-size check (always on):** scan the canvas at full render resolution. Updates the "✓ Scannable" / "⚠ May not scan reliably" badge next to the download buttons.
- **Print-size check (advanced toggle):** scale the rendered image down to 200×200px and re-scan. Updates a second badge: "✓ Scannable when printed small" / "✗ Won't scan at print size — try a bolder silhouette or higher contrast".

The badges never block download — they inform. Image-derived color is a deliberate creative tradeoff; the user decides whether the result is acceptable.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  App.tsx (state: input, template, caption, advanced)    │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │  Controls.tsx       │  │  QrPreview.tsx           │  │
│  │  - URL input        │  │  - canvas render         │  │
│  │  - TemplatePicker   │  │  - ScanBadge             │  │
│  │  - caption          │  │  - download buttons      │  │
│  │  - <details>        │  │                          │  │
│  │   AdvancedOptions   │  │                          │  │
│  └─────────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
        ↓ form state
   lib/qrMatrix.ts ────→ raw QR module matrix
   lib/halftoneRenderer.ts ──→ halftoned canvas
   lib/composer.ts ──────────→ poster frame + caption
   lib/scanVerifier.ts ──────→ jsqr scan results
```

### Component tree

- `App.tsx` — owns form state via `useReducer`; lays out the two-column layout with starfield background
- `TemplatePicker.tsx` — 7 thumbnail cards (radio behavior); shows "upload custom" tile that opens the file picker
- `Controls.tsx` — URL input, template picker, caption input, `<details>` advanced section
- `AdvancedOptions.tsx` — file upload, halftone style selector, density/margin sliders, multi-size toggle, background color
- `QrPreview.tsx` — canvas mount, runs the render pipeline on state change, exposes download handlers
- `ScanBadge.tsx` — reads scan-verifier output, renders "✓ Scannable" / "⚠ May not scan" / print-size variants

### Pure-logic library

- `lib/qrMatrix.ts` — wraps `qrcode` to return `{ size: number, modules: boolean[][], reservedMask: boolean[][] }`. The reserved mask flags positions that are part of the QR data, separator, or finder patterns and must not be tampered with by the halftone pass.
- `lib/halftoneRenderer.ts` — pure function `render(matrix, sourceImage, style, density) → HTMLCanvasElement`. Implements the four halftone styles. Reads source image as `ImageData` for pixel sampling.
- `lib/composer.ts` — pure function `composePoster(qrCanvas, caption, size, palette) → HTMLCanvasElement`. Implements the centered safe-zone layout.
- `lib/scanVerifier.ts` — pure function `verify(canvas, sizes: number[]) → ScanResult[]`. Runs `jsqr` at each requested size.
- `templates/presets.ts` — the 7 templates, each = `{ id, displayName, sourcePath, palette }`.

### Data flow

1. User edits any control → reducer dispatches an action → state updates
2. `useEffect` runs the pipeline: build matrix → load source image → render halftone → (optional) compose poster → verify scan
3. Canvas updates in the preview
4. Download buttons export from the appropriate canvas (`qrCanvas` for QR-only modes, `posterCanvas` for poster mode)

### File layout

```
custom-qr/
├── public/
│   └── templates/
│       ├── saturn.svg
│       ├── telescope.svg
│       ├── galaxy-spiral.svg
│       ├── comet.svg
│       ├── observatory-dome.svg
│       ├── ntu-astro-mark.svg          # vectorized from logo-1
│       ├── ntu-astro-scene.png         # 2048×2048 transparent, from logo-2
│       └── README.md                    # how to update club assets
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css                        # Tailwind + custom starfield
│   ├── components/
│   │   ├── TemplatePicker.tsx
│   │   ├── Controls.tsx
│   │   ├── AdvancedOptions.tsx
│   │   ├── QrPreview.tsx
│   │   └── ScanBadge.tsx
│   ├── lib/
│   │   ├── qrMatrix.ts
│   │   ├── halftoneRenderer.ts
│   │   ├── composer.ts
│   │   ├── scanVerifier.ts
│   │   └── *.test.ts
│   ├── templates/
│   │   └── presets.ts
│   └── types.ts
├── logo-1.jpeg                          # source asset (kept for reference)
├── logo-2.jpeg                          # source asset (kept for reference)
├── index.html
├── package.json
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## NTU Astro branding & logo strategy

Two NTU templates ship, derived from the club's existing assets:

- **NTU Astro (mark)** — vectorized from `logo-1.jpeg` via `potrace` (or equivalent monochrome tracer) during a one-time build-prep step. Output is a clean SVG (~1–2KB) with smooth Bezier curves. Halftones beautifully and scans reliably. This is the recommended default for club use.
- **NTU Astro (scene)** — processed from `logo-2.jpeg`: background-removed, exported as a 2048×2048 transparent PNG. Cannot be cleanly vectorized due to photographic moon-surface texture. PNG is fine for halftone QR — pixel sampling works regardless of source format. This is the "expressive" option; image-derived color picks up the blue moon and produces a richer halftone.

The README will document the build-prep step so future maintainers can re-export these from updated logo files. Power users can always upload an arbitrary illustration via the advanced options panel.

## Visual theming

Follows the Pinterest-inspired design system in [DESIGN.md](../../../DESIGN.md).letting the halftone QR (the user's actual content) carry the visual interest.

- **Page background:** warm white `#ffffff`, no patterned overlay
- **Brand accent:** Pinterest Red `#e60023` for the primary download CTA only — never subtle, always confident
- **Text:** plum black `#211922` primary, olive gray `#62625b` secondary/labels, warm silver `#91918c` muted/disabled
- **Surfaces:** fog `#f6f6f3` for elevated panels, sand gray `#e5e5e0` for secondary buttons, warm light `#e0e0d9` for input surfaces
- **Borders:** warm silver `#91918c` at low opacity, focus blue `#435ee5` on focus
- **Typography:** Pin Sans with the DESIGN.md fallback stack (`-apple-system, system-ui, … ヒラギノ角ゴ Pro W3, メイリオ, … Arial`); monospace for the URL input field
- **Border radius:** 16px on buttons + inputs (Tailwind `rounded-2xl`), 20px+ on the preview panel — generous but not pill
- **Depth:** flat. Preview panel uses a 1px sand border, not a shadow/glow. Pinterest is flat by design; depth comes from content.

> Note: the halftone *dots* still inherit color from the source illustration (image-derived), so each template's palette continues to determine QR color. The Pinterest theme governs only the page chrome — controls, buttons, panels, poster background.

## UX flow & copy

- **Empty state:** preview shows the logo template rendered for a placeholder URL (default `https://ntuastro.com`, defined as `DEFAULT_PLACEHOLDER_URL` in `templates/presets.ts` so maintainers can swap in the club's actual primary URL with a one-line edit) so the page is never blank
- **Loading state:** halftone render takes ~100–300ms on input change — show a subtle shimmer on the preview canvas during regen
- **Scan badge copy:**
  - `✓ Scannable`
  - `⚠ May not scan reliably — try a bolder silhouette or higher contrast`
- **Multi-size badge copy (when enabled):**
  - `✓ Scannable on screen`
  - `✓ Scannable when printed small (200×200px)`
  - `✗ Won't scan at print size`
- **Download buttons:** three side-by-side — `QR only (PNG)` / `QR only (SVG)` / `Poster (PNG)`. Poster button is paired with the size dropdown and an inline caption preview.

## Error handling

- **Empty input:** preview shows the placeholder render so the page never looks blank
- **Upload validation failure** (non-image, > 2MB, corrupt SVG): inline error, fall back to current template, do not lose other state
- **QR capacity exceeded** (input > ~1500 chars at ECC H): the QR generator throws; preview shows a clear inline error ("Input too long for ECC level H — shorten the URL or text"). Last-known-good preview is retained until the user edits the input. We never silently truncate or render a broken QR.
- **Custom poster size invalid** (negative, zero, > 8000px): inline validation, snap to nearest valid bounds
- **Scan verification failure:** badge updates; download is never blocked

## Testing

- **`qrMatrix.test.ts`** — module matrix shape, reservedMask correctness, ECC level forced to H
- **`halftoneRenderer.test.ts`** — each halftone style produces a canvas with expected pixel-density signature; data modules preserved against source-image interference
- **`composer.test.ts`** — safe-zone math; caption auto-shrink behavior; poster sizes match dropdown values
- **`scanVerifier.test.ts`** — known-good QR scans at full and 200px sizes; known-bad inputs return failure
- **Manual smoke check** — open dev server, generate halftone QR with each template, download all three formats, scan with phone (front and rear cameras) to confirm
- No E2E framework for — the surface area is small enough to verify by hand in 60 seconds

## Deploy

- `npm run build` → `dist/` folder of static files
- Cloudflare Pages: connect GitHub repo OR `wrangler pages deploy dist`
- No environment variables, no secrets, no build-time config beyond a one-time logo-prep step (potrace on logo-1, background-removal on logo-2)