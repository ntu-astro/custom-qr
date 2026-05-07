# Astro-Themed QR Code Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, client-side React SPA that turns a URL into a halftone-style, astronomy-themed QR code with PNG/SVG/poster export, deployable to Cloudflare Pages.

**Architecture:** Vite + React + TypeScript SPA. Pure-logic libraries (`qrMatrix`, `halftoneRenderer`, `composer`, `scanVerifier`) are TDD'd with Vitest. UI components are uncovered by unit tests but verified by manual smoke-check. Form state lives in a single `useReducer` in `App.tsx`; a `useEffect` pipeline runs matrix → halftone → poster → scan-verify on every state change.

**Tech Stack:** Vite, React 18, TypeScript 5, Tailwind CSS, `qrcode`, `jsqr`, Vitest, Cloudflare Pages.

---

## File Structure

```
custom-qr/
├── public/
│   └── templates/
│       ├── saturn.svg                 # Task 6
│       ├── telescope.svg              # Task 6
│       ├── galaxy-spiral.svg          # Task 6
│       ├── comet.svg                  # Task 6
│       ├── observatory-dome.svg       # Task 6
│       ├── ntu-astro-mark.svg         # Task 7
│       ├── ntu-astro-scene.png        # Task 8
│       └── README.md                  # Task 9
├── src/
│   ├── App.tsx                        # Tasks 23, 24
│   ├── main.tsx                       # Task 25
│   ├── index.css                      # Task 25
│   ├── types.ts                       # Task 5
│   ├── components/
│   │   ├── ScanBadge.tsx              # Task 18
│   │   ├── TemplatePicker.tsx         # Task 19
│   │   ├── Controls.tsx               # Task 20
│   │   ├── AdvancedOptions.tsx        # Task 21
│   │   └── QrPreview.tsx              # Task 22
│   ├── lib/
│   │   ├── qrMatrix.ts                # Task 10
│   │   ├── qrMatrix.test.ts           # Task 10
│   │   ├── scanVerifier.ts            # Task 11
│   │   ├── scanVerifier.test.ts       # Task 11
│   │   ├── halftoneRenderer.ts        # Tasks 12-15
│   │   ├── halftoneRenderer.test.ts   # Tasks 12-15
│   │   ├── composer.ts                # Task 16
│   │   └── composer.test.ts           # Task 16
│   └── templates/
│       └── presets.ts                 # Task 17
├── logo-1.jpeg                        # source asset (kept, used by Task 7)
├── logo-2.jpeg                        # source asset (kept, used by Task 8)
├── index.html                         # Task 1
├── package.json                       # Task 1
├── tailwind.config.ts                 # Task 3
├── postcss.config.js                  # Task 3
├── tsconfig.json                      # Task 1
├── tsconfig.node.json                 # Task 1
├── vite.config.ts                     # Tasks 1, 4
├── vitest.setup.ts                    # Task 4
├── .gitignore                         # Task 1
├── README.md                          # Task 27
└── wrangler.toml                      # Task 26
```

Each file has one responsibility. Pure logic lives under `lib/`; UI under `components/`; only `App.tsx` and `main.tsx` glue them together. The `templates/` folder owns asset registration. This split keeps every file small (mostly < 200 lines) and supports the test boundaries described in the spec.

---

## Task 1: Initialize the Vite + React + TS project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`
- Create: `src/main.tsx` (placeholder)
- Create: `src/App.tsx` (placeholder)

- [ ] **Step 1: Run `npm create vite` non-interactively**

Run:
```bash
cd /Users/zhunhao/Documents/Projects/custom-qr
npm create vite@latest . -- --template react-ts
```
If prompted because the directory is not empty, choose "Ignore files and continue".

Expected: scaffolds `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`, plus React/Vite dev deps.

- [ ] **Step 2: Install runtime + base dev deps**

Run:
```bash
npm install qrcode jsqr
npm install -D @types/qrcode @types/jsqr vitest @vitest/ui jsdom @testing-library/jest-dom
```

Expected: `package-lock.json` written, no errors.

- [ ] **Step 3: Set the page title and lang in `index.html`**

Replace the `<title>` line and add `lang` attribute. Open `index.html` and overwrite with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/templates/ntu-astro-mark.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Astro QR · NTU Astronomical Society</title>
  </head>
  <body class="bg-warmwhite text-plumblack">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Replace placeholder `src/App.tsx`**

```tsx
export default function App() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">Astro QR — scaffolding</h1>
    </main>
  );
}
```

- [ ] **Step 5: Replace placeholder `src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: Verify the dev server boots**

Run:
```bash
npm run dev -- --port 5173 &
sleep 3
curl -s http://localhost:5173 | head -5
kill %1
```
Expected: HTML response containing `<div id="root"></div>`.

- [ ] **Step 7: Commit**

```bash
git init 2>/dev/null || true
git add -A
git commit -m "chore: scaffold Vite React TS project"
```

---

## Task 2: Add `.gitignore` and pin `qrcode`/`jsqr` types

**Files:**
- Create/Modify: `.gitignore`
- Modify: `package.json` (add `"engines"` and lock scripts)

- [ ] **Step 1: Write `.gitignore`**

Overwrite `.gitignore` with:

```gitignore
node_modules
dist
dist-ssr
.DS_Store
*.local
.vscode/*
!.vscode/extensions.json
.idea
coverage
.npm
*.log
```

- [ ] **Step 2: Add scripts and engines block to `package.json`**

Open `package.json`. In the `"scripts"` block ensure these entries exist (replace the equivalents Vite scaffolded):

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "lint": "tsc -b --noEmit"
}
```

Add at the top level next to `"type": "module"`:
```json
"engines": { "node": ">=18.18.0" }
```

- [ ] **Step 3: Verify**

Run:
```bash
npm run lint
```
Expected: exits 0 (no type errors on the placeholder files).

- [ ] **Step 4: Commit**

```bash
git add .gitignore package.json
git commit -m "chore: lock scripts, engines, and gitignore"
```

---

## Task 3: Tailwind CSS + Pinterest design tokens

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Modify: `src/index.css`

- [ ] **Step 1: Install Tailwind**

Run:
```bash
npm install -D tailwindcss@^3.4 postcss autoprefixer
npx tailwindcss init -p
```
This creates `tailwind.config.js` and `postcss.config.js`. Delete `tailwind.config.js` (we will write a TS one).

```bash
rm -f tailwind.config.js
```

- [ ] **Step 2: Write `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pinterest-inspired tokens (DESIGN.md)
        warmwhite: '#ffffff',
        plumblack: '#211922',
        olivegray: '#62625b',
        warmsilver: '#91918c',
        sandgray: '#e5e5e0',
        warmlight: '#e0e0d9',
        fog: '#f6f6f3',
        focusblue: '#435ee5',
        pinred: '#e60023',
        errorred: '#9e0a0a',
        successgreen: '#103c25',
        darksurface: '#33332e',
      },
      fontFamily: {
        sans: [
          '"Pin Sans"',
          '-apple-system',
          'system-ui',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Helvetica',
          '"ヒラギノ角ゴ Pro W3"',
          'メイリオ',
          'Meiryo',
          '"ＭＳ Ｐゴシック"',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        // Per DESIGN.md scale
        button: '16px',
        card: '20px',
        section: '32px',
        hero: '40px',
      },
      letterSpacing: {
        heading: '-1.2px',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: Write `postcss.config.js`**

Overwrite the auto-generated file:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Replace `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: theme('fontFamily.sans');
    color: theme('colors.plumblack');
    background: theme('colors.warmwhite');
  }
  body {
    min-height: 100vh;
  }
  :focus-visible {
    outline: 2px solid theme('colors.focusblue');
    outline-offset: 2px;
  }
}

@layer components {
  .btn-primary {
    @apply bg-pinred text-black rounded-button px-4 py-2 font-medium hover:opacity-90 transition;
  }
  .btn-secondary {
    @apply bg-sandgray text-black rounded-button px-4 py-2 font-medium hover:bg-warmlight transition;
  }
  .btn-ghost {
    @apply rounded-button px-4 py-2 font-medium hover:bg-fog transition;
  }
  .input-base {
    @apply bg-white rounded-button border border-warmsilver px-4 py-2 outline-none focus:border-focusblue;
  }
  .panel {
    @apply rounded-card border border-sandgray bg-fog p-6;
  }
}
```

- [ ] **Step 5: Update `App.tsx` to confirm Tailwind is wired**

Replace contents:
```tsx
export default function App() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold tracking-heading">Astro QR</h1>
      <p className="text-olivegray mt-2">scaffold OK</p>
      <button className="btn-primary mt-4">Test CTA</button>
    </main>
  );
}
```

- [ ] **Step 6: Verify**

Run:
```bash
npm run dev -- --port 5173 &
sleep 3
curl -s http://localhost:5173/src/index.css | grep -c "tailwindcss"
kill %1
```
Expected: a non-zero count (Tailwind directives are present in the served CSS).

- [ ] **Step 7: Commit**

```bash
git add tailwind.config.ts postcss.config.js src/index.css src/App.tsx package.json package-lock.json
git commit -m "feat: tailwind theme with Pinterest design tokens"
```

---

## Task 4: Configure Vitest

**Files:**
- Modify: `vite.config.ts`
- Create: `vitest.setup.ts`

- [ ] **Step 1: Replace `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

- [ ] **Step 2: Write `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Add a sanity test**

Create `src/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run it**

Run:
```bash
npm test
```
Expected: 1 test passes.

- [ ] **Step 5: Delete the sanity test and commit config**

```bash
rm src/sanity.test.ts
git add vite.config.ts vitest.setup.ts
git commit -m "chore: configure vitest with jsdom"
```

---

## Task 5: Shared types in `src/types.ts`

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write the types**

```ts
export type HalftoneStyle = 'hybrid' | 'variable' | 'stippling' | 'qrgrid';

export type PosterSize =
  | { kind: 'igPost'; width: 1080; height: 1080 }
  | { kind: 'igStory'; width: 1080; height: 1920 }
  | { kind: 'a4'; width: 2480; height: 3508 }
  | { kind: 'custom'; width: number; height: number };

export interface Palette {
  /** Hex color used for the halo + accents around the safe zone. */
  accent: string;
  /** Hex color used for fallback module fill if source image is fully transparent. */
  fallbackDark: string;
}

export interface TemplatePreset {
  id: string;
  displayName: string;
  /** Resolved at runtime via `new URL(sourcePath, import.meta.url)`-style fetch. */
  sourcePath: string;
  palette: Palette;
}

export interface QRMatrix {
  size: number;
  modules: boolean[][];
  reservedMask: boolean[][];
}

export interface ScanResult {
  size: number;
  ok: boolean;
  decoded?: string;
}

export interface RenderOptions {
  style: HalftoneStyle;
  /** 30..80 — non-data fill density, where higher = denser dots. */
  density: number;
  /** 0..60 — pixels of quiet zone in the output canvas. */
  marginPx: number;
  /** Hex string or 'transparent'. */
  background: string;
}

export const DEFAULT_PLACEHOLDER_URL = 'https://www.instagram.com/ntu_astro/';
export const QR_ECC_LEVEL = 'H' as const;
```

- [ ] **Step 2: Verify type-check**

Run:
```bash
npm run lint
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: shared types and constants"
```

---

## Task 6: Five built-in art template SVGs

**Files:**
- Create: `public/templates/saturn.svg`
- Create: `public/templates/telescope.svg`
- Create: `public/templates/galaxy-spiral.svg`
- Create: `public/templates/comet.svg`
- Create: `public/templates/observatory-dome.svg`

Each SVG is a 512×512 monochrome silhouette on a transparent background, centered, with strokes converted to fills so halftone sampling gets clean alpha values. Color is `#211922` (plum black) — the palette accent in `presets.ts` will tint the halo, but the dot color is sampled from these silhouettes (mostly black → produces dark dots, which is what we want for a scannable QR base).

- [ ] **Step 1: Saturn**

Write `public/templates/saturn.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="#211922">
    <ellipse cx="256" cy="256" rx="120" ry="120"/>
    <path d="M 60 256 Q 256 180 452 256 Q 256 332 60 256 Z M 256 220 Q 200 256 256 292 Q 312 256 256 220 Z" fill-rule="evenodd" opacity="0.85"/>
  </g>
</svg>
```

- [ ] **Step 2: Telescope**

Write `public/templates/telescope.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="#211922">
    <rect x="200" y="60" width="60" height="220" rx="12" transform="rotate(-25 230 170)"/>
    <rect x="170" y="290" width="172" height="22" rx="6"/>
    <rect x="246" y="312" width="20" height="120"/>
    <polygon points="180,432 332,432 280,460 232,460"/>
    <circle cx="320" cy="120" r="18"/>
  </g>
</svg>
```

- [ ] **Step 3: Galaxy spiral**

Write `public/templates/galaxy-spiral.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="none" stroke="#211922" stroke-width="22" stroke-linecap="round">
    <path d="M 256 256 m -8 0 a 8 8 0 1 1 16 0 a 8 8 0 1 1 -16 0" fill="#211922" stroke="none"/>
    <path d="M 256 256 Q 320 176 380 220 Q 420 280 360 360 Q 280 412 192 360 Q 100 290 160 188 Q 230 100 320 132"/>
    <path d="M 256 256 Q 192 336 132 292 Q 92 232 152 152 Q 232 100 320 152" opacity="0.7"/>
  </g>
</svg>
```

- [ ] **Step 4: Comet**

Write `public/templates/comet.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="#211922">
    <circle cx="380" cy="140" r="50"/>
    <path d="M 360 160 L 80 432 L 60 412 L 340 140 Z" opacity="0.85"/>
    <path d="M 380 200 L 120 432 L 100 412 L 360 180 Z" opacity="0.55"/>
    <circle cx="200" cy="320" r="6"/>
    <circle cx="160" cy="380" r="4"/>
    <circle cx="240" cy="280" r="4"/>
  </g>
</svg>
```

- [ ] **Step 5: Observatory dome**

Write `public/templates/observatory-dome.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="#211922">
    <path d="M 100 280 a 156 156 0 0 1 312 0 Z"/>
    <rect x="244" y="140" width="24" height="140"/>
    <rect x="80" y="280" width="352" height="40" rx="6"/>
    <rect x="140" y="320" width="232" height="120" rx="6"/>
    <rect x="220" y="370" width="72" height="70" rx="4" fill="#f6f6f3"/>
  </g>
</svg>
```

- [ ] **Step 6: Verify the SVGs serve at dev time**

Run:
```bash
npm run dev -- --port 5173 &
sleep 3
for f in saturn telescope galaxy-spiral comet observatory-dome; do
  curl -sI "http://localhost:5173/templates/$f.svg" | head -1
done
kill %1
```
Expected: each request returns `HTTP/1.1 200 OK`.

- [ ] **Step 7: Commit**

```bash
git add public/templates/saturn.svg public/templates/telescope.svg public/templates/galaxy-spiral.svg public/templates/comet.svg public/templates/observatory-dome.svg
git commit -m "feat: five built-in astronomy template silhouettes"
```

---

## Task 7: NTU Astro mark template SVG

**Files:**
- Create: `public/templates/ntu-astro-mark.svg`

The ideal pipeline is `potrace` on `logo-1.jpeg`, but that requires external tools. We ship a hand-traced placeholder (a faithful crescent + NTUAS wordmark approximation) so the build is self-contained. The `templates/README.md` (Task 9) documents how to regenerate the high-fidelity SVG.

- [ ] **Step 1: Write the placeholder SVG**

`public/templates/ntu-astro-mark.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="#211922">
    <!-- Crescent: outer disc minus inner disc offset right -->
    <path d="M 256 32 a 224 224 0 1 0 0 448 a 224 224 0 1 0 0 -448 Z M 296 56 a 200 200 0 1 1 0 400 a 200 200 0 1 1 0 -400 Z" fill-rule="evenodd"/>
    <!-- NTUAS wordmark, geometric block letters -->
    <g transform="translate(108 232) scale(1)">
      <!-- N -->
      <path d="M 0 0 h 16 l 24 36 V 0 h 16 v 56 h -16 l -24 -36 v 36 h -16 z"/>
      <!-- T -->
      <path d="M 64 0 h 56 v 12 h -20 v 44 h -16 v -44 h -20 z"/>
      <!-- U -->
      <path d="M 128 0 h 16 v 36 a 8 8 0 0 0 16 0 V 0 h 16 v 36 a 24 24 0 0 1 -48 0 z"/>
      <!-- A -->
      <path d="M 184 56 l 16 -56 h 16 l 16 56 h -16 l -3 -10 h -10 l -3 10 z M 204 32 h 8 l -4 -16 z"/>
      <!-- S -->
      <path d="M 240 12 a 16 12 0 0 1 32 0 h -14 a 4 4 0 0 0 -8 0 c 0 8 24 6 24 22 a 16 12 0 0 1 -32 0 h 14 a 4 4 0 0 0 8 0 c 0 -8 -24 -6 -24 -22 z"/>
    </g>
  </g>
</svg>
```

- [ ] **Step 2: Verify it renders**

Run:
```bash
npm run dev -- --port 5173 &
sleep 3
curl -sI "http://localhost:5173/templates/ntu-astro-mark.svg" | head -1
kill %1
```
Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 3: Commit**

```bash
git add public/templates/ntu-astro-mark.svg
git commit -m "feat: NTU Astro mark template (placeholder vectorization)"
```

---

## Task 8: NTU Astro scene PNG template

**Files:**
- Create: `public/templates/ntu-astro-scene.png`

We need a 2048×2048 transparent PNG of the moon-and-rocket scene. The ideal pipeline is `rembg i logo-2.jpeg logo-2-cutout.png` then resize to 2048×2048. To keep this plan self-contained we use `sips` (built into macOS) to produce a usable approximation; the README documents the higher-fidelity path.

- [ ] **Step 1: Generate from `logo-2.jpeg` with `sips`**

Run:
```bash
sips -s format png -z 2048 2048 logo-2.jpeg --out public/templates/ntu-astro-scene.png
```
Expected: a 2048×2048 PNG file is created.

- [ ] **Step 2: Verify dimensions**

Run:
```bash
sips -g pixelWidth -g pixelHeight public/templates/ntu-astro-scene.png
```
Expected output contains `pixelWidth: 2048` and `pixelHeight: 2048`.

> Note: this PNG retains the original black background. The halftone renderer treats dark pixels as "draw a dot" and light pixels as "skip", so the rocket silhouette + moon disc will halftone correctly even with the black backdrop. The README (Task 9) explains how a maintainer can run `rembg` to swap in a transparent-background version.

- [ ] **Step 3: Commit**

```bash
git add public/templates/ntu-astro-scene.png
git commit -m "feat: NTU Astro scene template (raster, 2048x2048)"
```

---

## Task 9: Templates README

**Files:**
- Create: `public/templates/README.md`

- [ ] **Step 1: Write the README**

`public/templates/README.md`:
```markdown
# Template assets

Each file here is a halftone *source* for the QR generator. They are sampled per-pixel by the halftone renderer; the **alpha channel and luminance** decide where dots appear.

## Asset rules
- Aspect ratio: square (1:1).
- Background: transparent (PNG/SVG) or solid `#000` (renderer treats dark pixels as "draw a dot").
- Subject: high-contrast silhouette. Avoid fine line art under ~3px — halftones smear it.
- Resolution: SVG preferred (resolution-independent). PNG: 1024×1024 minimum, 2048×2048 ideal.

## Built-in templates

| File | Source | Notes |
|---|---|---|
| `saturn.svg` | hand-drawn | ringed planet silhouette |
| `telescope.svg` | hand-drawn | reflector on tripod |
| `galaxy-spiral.svg` | hand-drawn | top-down spiral |
| `comet.svg` | hand-drawn | comet with diagonal tail |
| `observatory-dome.svg` | hand-drawn | dome + base |
| `ntu-astro-mark.svg` | hand-traced from `logo-1.jpeg` | club monogram, halftones cleanly |
| `ntu-astro-scene.png` | resized from `logo-2.jpeg` | moon + rocket scene |

## Re-generating club assets

The two NTU files are committed as best-effort placeholders. To produce higher-fidelity versions from updated logo files:

### `ntu-astro-mark.svg` (vectorize from `logo-1.jpeg`)

```bash
# Install once
brew install potrace imagemagick

# Convert and trace
magick ../../logo-1.jpeg -threshold 50% -negate ntu-astro-mark.bmp
potrace ntu-astro-mark.bmp -s -o ntu-astro-mark.svg
rm ntu-astro-mark.bmp
```

### `ntu-astro-scene.png` (background-remove `logo-2.jpeg`)

```bash
# Install once (Python 3.10+)
pipx install rembg[cli]

# Remove background and resize
rembg i ../../logo-2.jpeg ntu-astro-scene.png
sips -z 2048 2048 ntu-astro-scene.png
```

## Adding new templates

1. Drop the file under `public/templates/`.
2. Add an entry to `src/templates/presets.ts`.
3. Restart the dev server. The new template appears in the gallery.
```

- [ ] **Step 2: Commit**

```bash
git add public/templates/README.md
git commit -m "docs: how to regenerate template assets"
```

---

## Task 10: `lib/qrMatrix.ts` (TDD)

**Files:**
- Create: `src/lib/qrMatrix.ts`
- Create: `src/lib/qrMatrix.test.ts`

The `qrcode` module exposes `QRCode.create(text, opts).modules` as a `BitMatrix` with `.size` and `.get(x, y)`. It does not expose a reserved-position API, so we compute the reserved mask geometrically: finder + separator (top-left, top-right, bottom-left), timing rows (row 6 + col 6), alignment patterns, format-info bands, and version-info bands (version ≥ 7).

- [ ] **Step 1: Write the failing test**

`src/lib/qrMatrix.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildMatrix } from './qrMatrix';

describe('buildMatrix', () => {
  it('returns square modules and reservedMask', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    expect(m.size).toBeGreaterThan(20);
    expect(m.modules.length).toBe(m.size);
    expect(m.modules[0].length).toBe(m.size);
    expect(m.reservedMask.length).toBe(m.size);
    expect(m.reservedMask[0].length).toBe(m.size);
  });

  it('marks the three finder-pattern regions as reserved', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    const corners = [
      [0, 0],                       // top-left finder
      [m.size - 1, 0],              // top-right finder
      [0, m.size - 1],              // bottom-left finder
    ];
    for (const [x, y] of corners) {
      expect(m.reservedMask[y][x]).toBe(true);
    }
  });

  it('marks timing-pattern row 6 and column 6 as reserved', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    for (let i = 8; i < m.size - 8; i++) {
      expect(m.reservedMask[6][i]).toBe(true);
      expect(m.reservedMask[i][6]).toBe(true);
    }
  });

  it('throws on input exceeding ECC level H capacity', () => {
    const huge = 'x'.repeat(2000);
    expect(() => buildMatrix(huge)).toThrow();
  });

  it('always uses ECC level H', () => {
    // Smoke check: an input of length 100 ASCII fits ECC H at version 8.
    const m = buildMatrix('A'.repeat(100));
    expect(m.size).toBeGreaterThanOrEqual(33);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- src/lib/qrMatrix.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `qrMatrix.ts`**

`src/lib/qrMatrix.ts`:
```ts
import QRCode from 'qrcode';
import type { QRMatrix } from '../types';
import { QR_ECC_LEVEL } from '../types';

const FINDER_SIZE = 7;
const SEPARATOR = 1;

const ALIGNMENT_PATTERN_TABLE: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62],
  [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74],
  [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
  [6, 34, 62, 90],
];

function versionFromSize(size: number): number {
  return (size - 17) / 4;
}

function setReservedRect(mask: boolean[][], x: number, y: number, w: number, h: number) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const yy = y + dy;
      const xx = x + dx;
      if (yy >= 0 && yy < mask.length && xx >= 0 && xx < mask[0].length) {
        mask[yy][xx] = true;
      }
    }
  }
}

function buildReservedMask(size: number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );

  // Three finder patterns + their separators (one-pixel quiet ring)
  const span = FINDER_SIZE + SEPARATOR;
  setReservedRect(mask, 0, 0, span, span);                       // top-left
  setReservedRect(mask, size - span, 0, span, span);             // top-right
  setReservedRect(mask, 0, size - span, span, span);             // bottom-left

  // Timing patterns (row 6 and column 6)
  for (let i = 0; i < size; i++) {
    mask[6][i] = true;
    mask[i][6] = true;
  }

  // Format-info bands (15 modules each, around top-left and split between top-right + bottom-left)
  for (let i = 0; i <= 8; i++) {
    mask[8][i] = true;
    mask[i][8] = true;
    mask[8][size - 1 - i] = true;
    mask[size - 1 - i][8] = true;
  }

  const version = versionFromSize(size);
  // Alignment patterns
  if (version >= 2 && version < ALIGNMENT_PATTERN_TABLE.length) {
    const positions = ALIGNMENT_PATTERN_TABLE[version];
    for (const r of positions) {
      for (const c of positions) {
        // Skip alignment patterns that overlap finder patterns
        const overlapsFinder =
          (r <= 8 && c <= 8) ||
          (r <= 8 && c >= size - 9) ||
          (r >= size - 9 && c <= 8);
        if (overlapsFinder) continue;
        setReservedRect(mask, c - 2, r - 2, 5, 5);
      }
    }
  }

  // Version-info bands for v7+
  if (version >= 7) {
    setReservedRect(mask, size - 11, 0, 3, 6);
    setReservedRect(mask, 0, size - 11, 6, 3);
  }

  return mask;
}

export function buildMatrix(text: string): QRMatrix {
  if (!text) {
    // QRCode would still produce a matrix for the empty string but that's not useful.
    text = ' ';
  }
  const qr = QRCode.create(text, { errorCorrectionLevel: QR_ECC_LEVEL });
  const size: number = qr.modules.size;
  const get = qr.modules.get
    ? (x: number, y: number) => Boolean(qr.modules.get(x, y))
    : (x: number, y: number) => Boolean((qr.modules as unknown as { data: Uint8Array }).data[y * size + x]);

  const modules: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) {
      row.push(get(x, y));
    }
    modules.push(row);
  }

  return {
    size,
    modules,
    reservedMask: buildReservedMask(size),
  };
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `npm test -- src/lib/qrMatrix.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/qrMatrix.ts src/lib/qrMatrix.test.ts
git commit -m "feat(lib): qrMatrix wrapper with geometric reserved mask"
```

---

## Task 11: `lib/scanVerifier.ts` (TDD)

**Files:**
- Create: `src/lib/scanVerifier.ts`
- Create: `src/lib/scanVerifier.test.ts`

`jsqr` takes a `Uint8ClampedArray` of RGBA pixels with `width` and `height`. We render a known QR via `qrcode.toCanvas` to a jsdom canvas, downscale it, and verify that `jsqr` decodes both the full and downscaled versions.

- [ ] **Step 1: Add a canvas polyfill for jsdom**

Run:
```bash
npm install -D canvas
```
Vitest's jsdom env will pick up `canvas` automatically when `getContext('2d')` is called. If `canvas` fails to compile on the host, the README documents a fallback (skipping these tests with `vitest run --exclude src/lib/scanVerifier.test.ts`); we expect a clean install on macOS.

- [ ] **Step 2: Write the failing test**

`src/lib/scanVerifier.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import { verify } from './scanVerifier';

async function renderKnownQr(text: string, modulePx = 8): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: 'H',
    margin: 4,
    scale: modulePx,
    color: { dark: '#000000', light: '#ffffff' },
  });
  return canvas;
}

describe('verify', () => {
  it('decodes a clean QR at full size', async () => {
    const canvas = await renderKnownQr('https://www.instagram.com/ntu_astro/', 8);
    const results = verify(canvas, [canvas.width]);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe('https://www.instagram.com/ntu_astro/');
  });

  it('decodes when downscaled to 200px', async () => {
    const canvas = await renderKnownQr('https://www.instagram.com/ntu_astro/', 12);
    const results = verify(canvas, [200]);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe('https://www.instagram.com/ntu_astro/');
  });

  it('returns ok:false for a noise canvas', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;
    const data = ctx.createImageData(200, 200);
    for (let i = 0; i < data.data.length; i += 4) {
      const v = Math.random() < 0.5 ? 0 : 255;
      data.data[i] = v;
      data.data[i + 1] = v;
      data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const results = verify(canvas, [200]);
    expect(results[0].ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

Run: `npm test -- src/lib/scanVerifier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `scanVerifier.ts`**

```ts
import jsQR from 'jsqr';
import type { ScanResult } from '../types';

function downscale(source: HTMLCanvasElement, targetSize: number): HTMLCanvasElement {
  if (source.width === targetSize && source.height === targetSize) return source;
  const out = document.createElement('canvas');
  out.width = targetSize;
  out.height = targetSize;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetSize, targetSize);
  return out;
}

function decodeAt(canvas: HTMLCanvasElement, size: number): ScanResult {
  const scaled = downscale(canvas, size);
  const ctx = scaled.getContext('2d')!;
  const { data, width, height } = ctx.getImageData(0, 0, scaled.width, scaled.height);
  const result = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  return {
    size,
    ok: !!result,
    decoded: result?.data,
  };
}

export function verify(canvas: HTMLCanvasElement, sizes: number[]): ScanResult[] {
  return sizes.map((s) => decodeAt(canvas, s));
}
```

- [ ] **Step 5: Run, expect PASS**

Run: `npm test -- src/lib/scanVerifier.test.ts`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scanVerifier.ts src/lib/scanVerifier.test.ts package.json package-lock.json
git commit -m "feat(lib): jsqr-backed scan verifier with multi-size support"
```

---

## Task 12: `lib/halftoneRenderer.ts` — scaffold + Hybrid style (TDD)

**Files:**
- Create: `src/lib/halftoneRenderer.ts`
- Create: `src/lib/halftoneRenderer.test.ts`

The renderer is a pure function: `render(matrix, sourceImageData, options) → HTMLCanvasElement`. Hybrid mode renders dark QR modules as filled squares and light positions as halftone dots whose radius is proportional to source-pixel darkness.

- [ ] **Step 1: Write the failing test**

`src/lib/halftoneRenderer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { render } from './halftoneRenderer';
import { buildMatrix } from './qrMatrix';

function blackImageData(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
  }
  return new ImageData(data, w, h);
}

function whiteImageData(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0;
  }
  return new ImageData(data, w, h);
}

describe('render — hybrid', () => {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');

  it('produces a square canvas sized for the matrix plus margin', () => {
    const canvas = render(matrix, blackImageData(512, 512), {
      style: 'hybrid',
      density: 55,
      marginPx: 32,
      background: 'transparent',
    });
    expect(canvas.width).toBe(canvas.height);
    expect(canvas.width).toBeGreaterThanOrEqual(matrix.size + 2 * 4);
  });

  it('preserves dark data modules: a known dark module pixel is dark', () => {
    const canvas = render(matrix, whiteImageData(512, 512), {
      style: 'hybrid',
      density: 55,
      marginPx: 0,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    // Top-left finder: every module 0..6 in both axes is dark.
    const cellPx = canvas.width / matrix.size;
    const cx = Math.floor(cellPx * 0.5);
    const cy = Math.floor(cellPx * 0.5);
    const px = ctx.getImageData(cx, cy, 1, 1).data;
    const lum = (px[0] + px[1] + px[2]) / 3;
    expect(lum).toBeLessThan(80);
  });

  it('renders sparse dots in non-data positions when source is light', () => {
    const canvas = render(matrix, whiteImageData(512, 512), {
      style: 'hybrid',
      density: 55,
      marginPx: 16,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    // Sample a margin pixel (clearly outside the QR)
    const px = ctx.getImageData(2, 2, 1, 1).data;
    expect(px[0]).toBeGreaterThan(200); // mostly white in the quiet zone with white source
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- src/lib/halftoneRenderer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement scaffold + hybrid style**

`src/lib/halftoneRenderer.ts`:
```ts
import type { QRMatrix, RenderOptions, HalftoneStyle } from '../types';

const CELL_PX = 16; // 16 output pixels per QR module — gives room for halftone variation

interface PixelSample {
  r: number;
  g: number;
  b: number;
  a: number;
  /** 0 (black) .. 1 (white). */
  brightness: number;
}

function samplePixel(image: ImageData, u: number, v: number): PixelSample {
  const x = Math.min(image.width - 1, Math.max(0, Math.floor(u * image.width)));
  const y = Math.min(image.height - 1, Math.max(0, Math.floor(v * image.height)));
  const i = (y * image.width + x) * 4;
  const r = image.data[i];
  const g = image.data[i + 1];
  const b = image.data[i + 2];
  const a = image.data[i + 3] / 255;
  // Luma 601, then weight by alpha (transparent → bright)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const brightness = a < 0.05 ? 1 : lum;
  return { r, g, b, a, brightness };
}

function clampLuminosity(r: number, g: number, b: number, maxBrightness = 0.45) {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum <= maxBrightness) return { r, g, b };
  const k = maxBrightness / Math.max(lum, 1e-6);
  return {
    r: Math.round(r * k),
    g: Math.round(g * k),
    b: Math.round(b * k),
  };
}

function fillBackground(ctx: CanvasRenderingContext2D, w: number, h: number, bg: string) {
  if (bg === 'transparent') {
    ctx.clearRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
}

function renderHybrid(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  density: number,
  marginCells: number,
  cellPx: number,
) {
  const totalCells = matrix.size + 2 * marginCells;
  const densityFactor = density / 100;

  for (let y = 0; y < totalCells; y++) {
    for (let x = 0; x < totalCells; x++) {
      const px = x * cellPx;
      const py = y * cellPx;
      const u = (x + 0.5) / totalCells;
      const v = (y + 0.5) / totalCells;
      const sample = samplePixel(source, u, v);

      const inMatrix =
        x >= marginCells && x < marginCells + matrix.size &&
        y >= marginCells && y < marginCells + matrix.size;
      const mx = x - marginCells;
      const my = y - marginCells;

      if (inMatrix && matrix.modules[my][mx]) {
        // Dark data module — preserve square geometry, clamp luminosity for color
        const c = clampLuminosity(sample.r, sample.g, sample.b);
        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        ctx.fillRect(px, py, cellPx, cellPx);
      } else {
        // Non-data (light QR cell or quiet zone): variable-radius halftone dot
        const darkness = 1 - sample.brightness; // 0 = white, 1 = black
        const fill = darkness * densityFactor;
        if (fill <= 0.02) continue;
        const radius = (cellPx / 2) * Math.min(1, Math.sqrt(fill));
        ctx.fillStyle = `rgb(${sample.r},${sample.g},${sample.b})`;
        ctx.beginPath();
        ctx.arc(px + cellPx / 2, py + cellPx / 2, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

export function render(matrix: QRMatrix, source: ImageData, opts: RenderOptions): HTMLCanvasElement {
  const cellPx = CELL_PX;
  const marginCells = Math.max(0, Math.round(opts.marginPx / cellPx));
  const totalCells = matrix.size + 2 * marginCells;
  const sizePx = totalCells * cellPx;

  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  fillBackground(ctx, sizePx, sizePx, opts.background);

  switch (opts.style) {
    case 'hybrid':
      renderHybrid(ctx, matrix, source, opts.density, marginCells, cellPx);
      break;
    case 'variable':
    case 'stippling':
    case 'qrgrid':
      // Implemented in subsequent tasks; fall back to hybrid for now.
      renderHybrid(ctx, matrix, source, opts.density, marginCells, cellPx);
      break;
    default: {
      const _exhaust: never = opts.style;
      void _exhaust;
    }
  }

  return canvas;
}

// Re-exports for tests
export const __internals = { samplePixel, clampLuminosity };
export type { HalftoneStyle };
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- src/lib/halftoneRenderer.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/halftoneRenderer.ts src/lib/halftoneRenderer.test.ts
git commit -m "feat(lib): halftone renderer with hybrid style"
```

---

## Task 13: Halftone — Variable dot size style

**Files:**
- Modify: `src/lib/halftoneRenderer.ts`
- Modify: `src/lib/halftoneRenderer.test.ts`

In Variable mode, EVERY module (data and non-data) is rendered as a circle whose radius scales with source darkness. Data modules enforce a minimum radius so the QR pattern survives.

- [ ] **Step 1: Add the failing test**

Append to `src/lib/halftoneRenderer.test.ts`:
```ts
import { render as render2 } from './halftoneRenderer';

describe('render — variable', () => {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');

  it('keeps dark data modules visibly filled even when source is bright', () => {
    const canvas = render2(matrix, whiteImageData(256, 256), {
      style: 'variable',
      density: 55,
      marginPx: 0,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    // Center of the top-left finder dark module
    const cx = Math.floor(cellPx * 0.5);
    const cy = Math.floor(cellPx * 0.5);
    const px = ctx.getImageData(cx, cy, 1, 1).data;
    const lum = (px[0] + px[1] + px[2]) / 3;
    expect(lum).toBeLessThan(120); // dark enough
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- src/lib/halftoneRenderer.test.ts`
Expected: 4 tests, 1 failing (the new one — minimum radius not enforced yet because variable falls back to hybrid which would actually pass; if it passes here, replace the white image with a `near-white` source `(254,254,254,255)` to break it).

If it passes already: change `whiteImageData(256, 256)` in the new test to a near-white source where the data module would render with a tiny halftone dot in hybrid mode but a guaranteed-min-size dot in variable mode. Use:
```ts
function nearlyWhite(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 240; data[i+1] = 240; data[i+2] = 240; data[i+3] = 255;
  }
  return new ImageData(data, w, h);
}
```
and use `nearlyWhite(256, 256)` in the test. Then re-run: expect FAIL.

- [ ] **Step 3: Implement variable style**

In `src/lib/halftoneRenderer.ts`, add:

```ts
function renderVariable(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  density: number,
  marginCells: number,
  cellPx: number,
) {
  const totalCells = matrix.size + 2 * marginCells;
  const densityFactor = density / 100;
  const dataMinRadiusFactor = 0.6; // ≥60% of cell radius for QR data modules

  for (let y = 0; y < totalCells; y++) {
    for (let x = 0; x < totalCells; x++) {
      const px = x * cellPx;
      const py = y * cellPx;
      const u = (x + 0.5) / totalCells;
      const v = (y + 0.5) / totalCells;
      const sample = samplePixel(source, u, v);

      const inMatrix =
        x >= marginCells && x < marginCells + matrix.size &&
        y >= marginCells && y < marginCells + matrix.size;
      const mx = x - marginCells;
      const my = y - marginCells;
      const isDarkData = inMatrix && matrix.modules[my][mx];

      const darkness = 1 - sample.brightness;
      let radiusFactor = Math.sqrt(darkness * densityFactor);
      if (isDarkData) {
        radiusFactor = Math.max(radiusFactor, dataMinRadiusFactor);
      }
      if (radiusFactor <= 0.02) continue;

      const radius = (cellPx / 2) * Math.min(1, radiusFactor);
      let { r, g, b } = sample;
      if (isDarkData) ({ r, g, b } = clampLuminosity(r, g, b));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(px + cellPx / 2, py + cellPx / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
```

Wire it into the switch:
```ts
case 'variable':
  renderVariable(ctx, matrix, source, opts.density, marginCells, cellPx);
  break;
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- src/lib/halftoneRenderer.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/halftoneRenderer.ts src/lib/halftoneRenderer.test.ts
git commit -m "feat(lib): variable dot-size halftone style"
```

---

## Task 14: Halftone — Stippling style

**Files:**
- Modify: `src/lib/halftoneRenderer.ts`
- Modify: `src/lib/halftoneRenderer.test.ts`

Stippling places uniform-size dots; density (count per cell) varies with darkness. Data modules render as solid filled squares (so scannability survives).

- [ ] **Step 1: Add the failing test**

Append to `src/lib/halftoneRenderer.test.ts`:
```ts
describe('render — stippling', () => {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');

  it('produces uniform-size stipples in dark source areas', () => {
    const canvas = render2(matrix, blackImageData(256, 256), {
      style: 'stippling',
      density: 70,
      marginPx: 16,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    // The margin region is fully outside the matrix and source is fully black,
    // so stippling should fill it densely.
    const px = ctx.getImageData(4, 4, 1, 1).data;
    // Either we hit a stipple (dark) or the gap (white). Sample a 16x16 block;
    // average should not be pure white because density is 70.
    const block = ctx.getImageData(0, 0, 16, 16).data;
    let sum = 0;
    for (let i = 0; i < block.length; i += 4) sum += (block[i] + block[i + 1] + block[i + 2]) / 3;
    const avg = sum / (16 * 16);
    expect(avg).toBeLessThan(220);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- src/lib/halftoneRenderer.test.ts`
Expected: 5 tests, 1 failing (the new one).

- [ ] **Step 3: Implement stippling**

Add to `halftoneRenderer.ts`:
```ts
// Deterministic PRNG so renders are reproducible across reloads
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function renderStippling(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  density: number,
  marginCells: number,
  cellPx: number,
) {
  const totalCells = matrix.size + 2 * marginCells;
  const densityFactor = density / 100;
  const STIPPLE_RADIUS = Math.max(1, Math.round(cellPx * 0.12));
  const MAX_STIPPLES_PER_CELL = 16;
  const rand = mulberry32(0xa57e3);

  for (let y = 0; y < totalCells; y++) {
    for (let x = 0; x < totalCells; x++) {
      const px = x * cellPx;
      const py = y * cellPx;
      const u = (x + 0.5) / totalCells;
      const v = (y + 0.5) / totalCells;
      const sample = samplePixel(source, u, v);

      const inMatrix =
        x >= marginCells && x < marginCells + matrix.size &&
        y >= marginCells && y < marginCells + matrix.size;
      const mx = x - marginCells;
      const my = y - marginCells;

      if (inMatrix && matrix.modules[my][mx]) {
        const c = clampLuminosity(sample.r, sample.g, sample.b);
        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        ctx.fillRect(px, py, cellPx, cellPx);
        continue;
      }

      const darkness = 1 - sample.brightness;
      const count = Math.round(darkness * densityFactor * MAX_STIPPLES_PER_CELL);
      if (count <= 0) continue;
      ctx.fillStyle = `rgb(${sample.r},${sample.g},${sample.b})`;
      for (let i = 0; i < count; i++) {
        const sx = px + rand() * cellPx;
        const sy = py + rand() * cellPx;
        ctx.beginPath();
        ctx.arc(sx, sy, STIPPLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
```

Wire in:
```ts
case 'stippling':
  renderStippling(ctx, matrix, source, opts.density, marginCells, cellPx);
  break;
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- src/lib/halftoneRenderer.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/halftoneRenderer.ts src/lib/halftoneRenderer.test.ts
git commit -m "feat(lib): stippling halftone style"
```

---

## Task 15: Halftone — QR-grid dithered style

**Files:**
- Modify: `src/lib/halftoneRenderer.ts`
- Modify: `src/lib/halftoneRenderer.test.ts`

In QR-grid mode every cell is filled or empty as one unit. Source brightness alone decides fill vs empty for non-data positions; data modules always render to match the QR.

- [ ] **Step 1: Add the failing test**

Append to `src/lib/halftoneRenderer.test.ts`:
```ts
describe('render — qrgrid', () => {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');

  it('renders cells as solid blocks (no sub-cell halftone)', () => {
    const canvas = render2(matrix, blackImageData(256, 256), {
      style: 'qrgrid',
      density: 50,
      marginPx: 0,
      background: '#ffffff',
    });
    const ctx = canvas.getContext('2d')!;
    const cellPx = canvas.width / matrix.size;
    // Sample two pixels within the same cell — they should be the same color
    const a = ctx.getImageData(2, 2, 1, 1).data;
    const b = ctx.getImageData(Math.floor(cellPx) - 2, Math.floor(cellPx) - 2, 1, 1).data;
    expect(a[0]).toBe(b[0]);
    expect(a[1]).toBe(b[1]);
    expect(a[2]).toBe(b[2]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- src/lib/halftoneRenderer.test.ts`
Expected: 6 tests, 1 failing.

- [ ] **Step 3: Implement qrgrid style**

```ts
function renderQrGrid(
  ctx: CanvasRenderingContext2D,
  matrix: QRMatrix,
  source: ImageData,
  density: number,
  marginCells: number,
  cellPx: number,
) {
  const totalCells = matrix.size + 2 * marginCells;
  const threshold = 1 - density / 100; // density=80 → threshold=0.2 (only brightest fifth left empty)

  for (let y = 0; y < totalCells; y++) {
    for (let x = 0; x < totalCells; x++) {
      const px = x * cellPx;
      const py = y * cellPx;
      const u = (x + 0.5) / totalCells;
      const v = (y + 0.5) / totalCells;
      const sample = samplePixel(source, u, v);

      const inMatrix =
        x >= marginCells && x < marginCells + matrix.size &&
        y >= marginCells && y < marginCells + matrix.size;
      const mx = x - marginCells;
      const my = y - marginCells;

      const fill =
        (inMatrix && matrix.modules[my][mx]) ||
        sample.brightness < threshold;
      if (!fill) continue;

      const isDark = inMatrix && matrix.modules[my][mx];
      let { r, g, b } = sample;
      if (isDark) ({ r, g, b } = clampLuminosity(r, g, b));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(px, py, cellPx, cellPx);
    }
  }
}
```

Wire in:
```ts
case 'qrgrid':
  renderQrGrid(ctx, matrix, source, opts.density, marginCells, cellPx);
  break;
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- src/lib/halftoneRenderer.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/halftoneRenderer.ts src/lib/halftoneRenderer.test.ts
git commit -m "feat(lib): qrgrid dithered halftone style"
```

---

## Task 16: `lib/composer.ts` — poster layout (TDD)

**Files:**
- Create: `src/lib/composer.ts`
- Create: `src/lib/composer.test.ts`

`composePoster` takes the rendered QR canvas, a caption, a poster size, and a palette, and produces a final poster canvas with the centered safe-zone layout.

- [ ] **Step 1: Write the failing test**

`src/lib/composer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { composePoster } from './composer';
import type { Palette, PosterSize } from '../types';

const palette: Palette = { accent: '#435ee5', fallbackDark: '#211922' };

function makeQrCanvas(size = 200): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fff';
  ctx.fillRect(20, 20, size - 40, size - 40);
  return c;
}

describe('composePoster', () => {
  it('produces a canvas matching the requested dimensions', () => {
    const sizes: PosterSize[] = [
      { kind: 'igPost', width: 1080, height: 1080 },
      { kind: 'igStory', width: 1080, height: 1920 },
      { kind: 'a4', width: 2480, height: 3508 },
      { kind: 'custom', width: 1500, height: 800 },
    ];
    for (const s of sizes) {
      const out = composePoster(makeQrCanvas(), 'NTU Astro 2026', s, palette);
      expect(out.width).toBe(s.width);
      expect(out.height).toBe(s.height);
    }
  });

  it('places the QR within a centered safe zone (75% of min dimension)', () => {
    const out = composePoster(makeQrCanvas(), '', { kind: 'igPost', width: 1080, height: 1080 }, palette);
    const ctx = out.getContext('2d')!;
    // Center pixel should fall inside the QR's white inner frame
    const px = ctx.getImageData(out.width / 2, out.height / 2, 1, 1).data;
    expect(px[0]).toBeGreaterThan(200); // light from QR's white inner area
  });

  it('renders without throwing when caption is omitted', () => {
    expect(() =>
      composePoster(makeQrCanvas(), '', { kind: 'igPost', width: 1080, height: 1080 }, palette),
    ).not.toThrow();
  });

  it('shrinks long captions to fit the caption band', () => {
    const long = 'NTU Astronomical Society Stargazing Workshop — Saturday, August 16th, 2026, MAS Auditorium';
    expect(() =>
      composePoster(makeQrCanvas(), long, { kind: 'igPost', width: 1080, height: 1080 }, palette),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- src/lib/composer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `composer.ts`**

```ts
import type { Palette, PosterSize } from '../types';

const SAFE_ZONE_FRACTION = 0.75;
const QR_BAND_FRACTION = 0.75;     // top of safe zone
const CAPTION_BAND_FRACTION = 0.25; // bottom of safe zone

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  startSize: number,
): number {
  let size = startSize;
  while (size > 12) {
    ctx.font = `600 ${size}px ${ctx.canvas.dataset.fontFamily ?? 'sans-serif'}`;
    const m = ctx.measureText(text);
    if (m.width <= maxWidth && size <= maxHeight) return size;
    size -= 2;
  }
  return size;
}

function drawAccentHalo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  accent: string,
) {
  const dotCount = 280;
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < dotCount; i++) {
    const angle = (i / dotCount) * Math.PI * 2 + Math.random() * 0.1;
    const r = innerRadius + Math.random() * (outerRadius - innerRadius);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const size = 2 + Math.random() * 6;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function composePoster(
  qrCanvas: HTMLCanvasElement,
  caption: string,
  size: PosterSize,
  palette: Palette,
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = size.width;
  out.height = size.height;
  out.dataset.fontFamily =
    '"Pin Sans", -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif';
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Warm white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.width, size.height);

  const minDim = Math.min(size.width, size.height);
  const safe = minDim * SAFE_ZONE_FRACTION;
  const safeX = (size.width - safe) / 2;
  const safeY = (size.height - safe) / 2;

  // Halo
  drawAccentHalo(
    ctx,
    size.width / 2,
    size.height / 2,
    safe * 0.55,
    safe * 0.85,
    palette.accent,
  );

  const qrBandHeight = safe * QR_BAND_FRACTION;
  const captionBandHeight = safe * CAPTION_BAND_FRACTION;
  const qrSide = Math.min(safe, qrBandHeight);
  const qrX = safeX + (safe - qrSide) / 2;
  const qrY = safeY + (qrBandHeight - qrSide) / 2;

  ctx.drawImage(qrCanvas, qrX, qrY, qrSide, qrSide);

  if (caption) {
    const trimmed = caption.trim();
    const maxFontSize = captionBandHeight * 0.55;
    const fontSize = fitFontSize(ctx, trimmed, safe * 0.95, maxFontSize, maxFontSize);
    ctx.fillStyle = '#211922';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fontSize}px ${out.dataset.fontFamily}`;
    const cx = safeX + safe / 2;
    const cy = safeY + qrBandHeight + captionBandHeight / 2;
    ctx.fillText(trimmed, cx, cy);
  }

  return out;
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- src/lib/composer.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/composer.ts src/lib/composer.test.ts
git commit -m "feat(lib): poster composer with centered safe zone"
```

---

## Task 17: Templates registry `src/templates/presets.ts`

**Files:**
- Create: `src/templates/presets.ts`

- [ ] **Step 1: Write the registry**

```ts
import type { TemplatePreset } from '../types';

export const TEMPLATES: TemplatePreset[] = [
  {
    id: 'saturn',
    displayName: 'Saturn',
    sourcePath: '/templates/saturn.svg',
    palette: { accent: '#d8a36b', fallbackDark: '#211922' },
  },
  {
    id: 'telescope',
    displayName: 'Telescope',
    sourcePath: '/templates/telescope.svg',
    palette: { accent: '#62625b', fallbackDark: '#211922' },
  },
  {
    id: 'galaxy-spiral',
    displayName: 'Galaxy Spiral',
    sourcePath: '/templates/galaxy-spiral.svg',
    palette: { accent: '#7e238b', fallbackDark: '#211922' },
  },
  {
    id: 'comet',
    displayName: 'Comet',
    sourcePath: '/templates/comet.svg',
    palette: { accent: '#435ee5', fallbackDark: '#211922' },
  },
  {
    id: 'observatory-dome',
    displayName: 'Observatory Dome',
    sourcePath: '/templates/observatory-dome.svg',
    palette: { accent: '#103c25', fallbackDark: '#211922' },
  },
  {
    id: 'ntu-astro-mark',
    displayName: 'NTU Astro (mark)',
    sourcePath: '/templates/ntu-astro-mark.svg',
    palette: { accent: '#211922', fallbackDark: '#211922' },
  },
  {
    id: 'ntu-astro-scene',
    displayName: 'NTU Astro (scene)',
    sourcePath: '/templates/ntu-astro-scene.png',
    palette: { accent: '#6f8fc7', fallbackDark: '#211922' },
  },
];

export const DEFAULT_TEMPLATE_ID = 'ntu-astro-mark';

export function findTemplate(id: string): TemplatePreset {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}
```

- [ ] **Step 2: Verify type-check**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/templates/presets.ts
git commit -m "feat: 7-template registry with palettes"
```

---

## Task 18: `components/ScanBadge.tsx`

**Files:**
- Create: `src/components/ScanBadge.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { ScanResult } from '../types';

interface Props {
  results: ScanResult[];
  multiSize: boolean;
}

const SCREEN_SIZE_THRESHOLD = 320;

function pickResult(results: ScanResult[], predicate: (s: number) => boolean): ScanResult | undefined {
  return results.find((r) => predicate(r.size));
}

export function ScanBadge({ results, multiSize }: Props) {
  const screen = pickResult(results, (s) => s >= SCREEN_SIZE_THRESHOLD);
  const print = pickResult(results, (s) => s < SCREEN_SIZE_THRESHOLD);

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <ScreenBadge ok={!!screen?.ok} multi={multiSize} />
      {multiSize && <PrintBadge ok={!!print?.ok} />}
    </div>
  );
}

function ScreenBadge({ ok, multi }: { ok: boolean; multi: boolean }) {
  if (ok) {
    return (
      <span className="rounded-button bg-fog px-3 py-1 text-plumblack">
        ✓ Scannable{multi ? ' on screen' : ''}
      </span>
    );
  }
  return (
    <span className="rounded-button bg-warmlight px-3 py-1 text-errorred">
      ⚠ May not scan reliably — try a bolder silhouette or higher contrast
    </span>
  );
}

function PrintBadge({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <span className="rounded-button bg-fog px-3 py-1 text-plumblack">
        ✓ Scannable when printed small (200×200px)
      </span>
    );
  }
  return (
    <span className="rounded-button bg-warmlight px-3 py-1 text-errorred">
      ✗ Won&apos;t scan at print size
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/ScanBadge.tsx
git commit -m "feat(ui): scan badge with screen+print variants"
```

---

## Task 19: `components/TemplatePicker.tsx`

**Files:**
- Create: `src/components/TemplatePicker.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { TEMPLATES } from '../templates/presets';
import type { TemplatePreset } from '../types';

interface Props {
  selectedId: string;
  customSourceLabel?: string;
  onSelect: (id: string) => void;
  onUploadClick: () => void;
}

function Tile({
  preset,
  selected,
  onClick,
}: {
  preset: TemplatePreset;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={
        'flex aspect-square flex-col items-center justify-between rounded-card border bg-white p-3 text-left transition ' +
        (selected
          ? 'border-pinred shadow-[0_0_0_1px_#e60023]'
          : 'border-sandgray hover:border-warmsilver')
      }
    >
      <img
        src={preset.sourcePath}
        alt=""
        className="aspect-square w-full object-contain"
        loading="lazy"
      />
      <span className="mt-1 text-xs text-olivegray">{preset.displayName}</span>
    </button>
  );
}

export function TemplatePicker({ selectedId, customSourceLabel, onSelect, onUploadClick }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {TEMPLATES.map((p) => (
        <Tile
          key={p.id}
          preset={p}
          selected={selectedId === p.id}
          onClick={() => onSelect(p.id)}
        />
      ))}
      <button
        type="button"
        aria-pressed={selectedId === 'custom'}
        onClick={onUploadClick}
        className={
          'flex aspect-square flex-col items-center justify-center rounded-card border-dashed bg-fog p-3 text-center text-xs text-olivegray transition ' +
          (selectedId === 'custom'
            ? 'border-2 border-pinred text-plumblack'
            : 'border-2 border-warmsilver hover:border-plumblack')
        }
      >
        <span className="text-2xl leading-none">+</span>
        <span className="mt-2">{customSourceLabel ?? 'Upload'}</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TemplatePicker.tsx
git commit -m "feat(ui): template picker gallery with upload tile"
```

---

## Task 20: `components/Controls.tsx`

**Files:**
- Create: `src/components/Controls.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { ChangeEvent } from 'react';
import { TemplatePicker } from './TemplatePicker';
import { AdvancedOptions } from './AdvancedOptions';
import type { HalftoneStyle, PosterSize } from '../types';

export interface ControlsProps {
  url: string;
  onUrlChange: (v: string) => void;

  templateId: string;
  onTemplateSelect: (id: string) => void;
  customSourceLabel?: string;

  caption: string;
  onCaptionChange: (v: string) => void;

  posterSize: PosterSize;
  onPosterSizeChange: (s: PosterSize) => void;

  style: HalftoneStyle;
  density: number;
  marginPx: number;
  multiSize: boolean;
  background: string;
  onAdvancedChange: (
    patch: Partial<{
      style: HalftoneStyle;
      density: number;
      marginPx: number;
      multiSize: boolean;
      background: string;
    }>,
  ) => void;

  onCustomUpload: (file: File) => void;
}

export function Controls(props: ControlsProps) {
  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) props.onCustomUpload(file);
    e.target.value = '';
  };

  const fileInputId = 'custom-source-upload';

  return (
    <div className="flex flex-col gap-6">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-plumblack">Link or text</span>
        <input
          type="text"
          value={props.url}
          onChange={(e) => props.onUrlChange(e.target.value)}
          placeholder="https://www.instagram.com/ntu_astro/"
          className="input-base w-full font-mono"
          spellCheck={false}
        />
      </label>

      <div>
        <span className="mb-2 block text-sm font-medium text-plumblack">Template</span>
        <TemplatePicker
          selectedId={props.templateId}
          customSourceLabel={props.customSourceLabel}
          onSelect={props.onTemplateSelect}
          onUploadClick={() => document.getElementById(fileInputId)?.click()}
        />
        <input
          id={fileInputId}
          type="file"
          accept="image/png,image/svg+xml"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-plumblack">Caption (poster only)</span>
        <input
          type="text"
          value={props.caption}
          onChange={(e) => props.onCaptionChange(e.target.value)}
          placeholder="NTU Astro · 2026"
          className="input-base w-full"
          maxLength={120}
        />
      </label>

      <details className="rounded-card border border-sandgray bg-fog p-4">
        <summary className="cursor-pointer select-none text-sm font-medium text-plumblack">
          Advanced options
        </summary>
        <div className="mt-4">
          <AdvancedOptions
            style={props.style}
            density={props.density}
            marginPx={props.marginPx}
            multiSize={props.multiSize}
            background={props.background}
            onChange={props.onAdvancedChange}
          />
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Controls.tsx
git commit -m "feat(ui): main controls panel"
```

---

## Task 21: `components/AdvancedOptions.tsx`

**Files:**
- Create: `src/components/AdvancedOptions.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { HalftoneStyle } from '../types';

interface Props {
  style: HalftoneStyle;
  density: number;
  marginPx: number;
  multiSize: boolean;
  background: string;
  onChange: (
    patch: Partial<{
      style: HalftoneStyle;
      density: number;
      marginPx: number;
      multiSize: boolean;
      background: string;
    }>,
  ) => void;
}

const STYLE_OPTIONS: Array<{ value: HalftoneStyle; label: string }> = [
  { value: 'hybrid', label: 'Hybrid (default)' },
  { value: 'variable', label: 'Variable dot size' },
  { value: 'stippling', label: 'Stippling' },
  { value: 'qrgrid', label: 'QR-grid dithered' },
];

export function AdvancedOptions({ style, density, marginPx, multiSize, background, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1 block text-sm text-olivegray">Halftone style</span>
        <select
          value={style}
          onChange={(e) => onChange({ style: e.target.value as HalftoneStyle })}
          className="input-base w-full"
        >
          {STYLE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-olivegray">Halftone density: {density}%</span>
        <input
          type="range"
          min={30}
          max={80}
          value={density}
          onChange={(e) => onChange({ density: Number(e.target.value) })}
          className="w-full"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-olivegray">Margin (quiet zone): {marginPx}px</span>
        <input
          type="range"
          min={0}
          max={60}
          value={marginPx}
          onChange={(e) => onChange({ marginPx: Number(e.target.value) })}
          className="w-full"
        />
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={multiSize}
          onChange={(e) => onChange({ multiSize: e.target.checked })}
        />
        <span className="text-sm text-olivegray">Multi-size scan check (also test print size)</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-olivegray">
          Background color {background === 'transparent' ? '(transparent)' : ''}
        </span>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={background === 'transparent' ? '#ffffff' : background}
            onChange={(e) => onChange({ background: e.target.value })}
            className="h-10 w-14 rounded-button border border-warmsilver"
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onChange({ background: 'transparent' })}
          >
            Make transparent
          </button>
        </div>
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AdvancedOptions.tsx
git commit -m "feat(ui): advanced options disclosure panel"
```

---

## Task 22: `components/QrPreview.tsx`

**Files:**
- Create: `src/components/QrPreview.tsx`

This component owns the canvas. It receives the latest `qrCanvas` and `posterCanvas` from `App.tsx` and provides three download buttons. Crucially it does not run the pipeline itself; it just displays and exports.

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useRef } from 'react';
import type { PosterSize, ScanResult } from '../types';
import { ScanBadge } from './ScanBadge';

interface Props {
  qrCanvas: HTMLCanvasElement | null;
  posterCanvas: HTMLCanvasElement | null;
  scanResults: ScanResult[];
  multiSize: boolean;
  posterSize: PosterSize;
  onPosterSizeChange: (s: PosterSize) => void;
  isRendering: boolean;
  errorMessage?: string;
}

const POSTER_OPTIONS: Array<{ label: string; size: PosterSize }> = [
  { label: 'Instagram Post (1080×1080)', size: { kind: 'igPost', width: 1080, height: 1080 } },
  { label: 'Instagram Story (1080×1920)', size: { kind: 'igStory', width: 1080, height: 1920 } },
  { label: 'A4 Portrait (2480×3508)', size: { kind: 'a4', width: 2480, height: 3508 } },
];

function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function svgWrap(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL('image/png');
  const w = canvas.width;
  const h = canvas.height;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <image href="${dataUrl}" width="${w}" height="${h}"/>
</svg>`;
}

export function QrPreview({
  qrCanvas,
  posterCanvas,
  scanResults,
  multiSize,
  posterSize,
  onPosterSizeChange,
  isRendering,
  errorMessage,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    mount.replaceChildren();
    if (qrCanvas) {
      qrCanvas.style.maxWidth = '100%';
      qrCanvas.style.height = 'auto';
      qrCanvas.style.imageRendering = 'pixelated';
      qrCanvas.style.borderRadius = '20px';
      mount.appendChild(qrCanvas);
    }
  }, [qrCanvas]);

  const handlePng = () => {
    if (!qrCanvas) return;
    downloadDataUrl('astro-qr.png', qrCanvas.toDataURL('image/png'));
  };

  const handleSvg = () => {
    if (!qrCanvas) return;
    const blob = new Blob([svgWrap(qrCanvas)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    downloadDataUrl('astro-qr.svg', url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePoster = () => {
    if (!posterCanvas) return;
    downloadDataUrl('astro-qr-poster.png', posterCanvas.toDataURL('image/png'));
  };

  return (
    <section className="panel flex flex-col gap-4 bg-white">
      <div
        ref={mountRef}
        className={
          'relative aspect-square w-full overflow-hidden rounded-card border border-sandgray bg-fog ' +
          (isRendering ? 'animate-pulse' : '')
        }
        aria-live="polite"
      />
      {errorMessage ? (
        <p className="rounded-button bg-warmlight px-4 py-2 text-sm text-errorred" role="alert">
          {errorMessage}
        </p>
      ) : (
        <ScanBadge results={scanResults} multiSize={multiSize} />
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={handlePng} disabled={!qrCanvas}>
            QR only (PNG)
          </button>
          <button type="button" className="btn-secondary" onClick={handleSvg} disabled={!qrCanvas}>
            QR only (SVG)
          </button>
          <button type="button" className="btn-primary" onClick={handlePoster} disabled={!posterCanvas}>
            Poster (PNG)
          </button>
        </div>
        <PosterSizePicker value={posterSize} onChange={onPosterSizeChange} />
      </div>
    </section>
  );
}

function PosterSizePicker({
  value,
  onChange,
}: {
  value: PosterSize;
  onChange: (s: PosterSize) => void;
}) {
  const isCustom = value.kind === 'custom';
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-olivegray">
      <label className="flex items-center gap-2">
        Poster size:
        <select
          value={value.kind}
          onChange={(e) => {
            const k = e.target.value as PosterSize['kind'];
            const preset = POSTER_OPTIONS.find((p) => p.size.kind === k);
            if (preset) onChange(preset.size);
            else onChange({ kind: 'custom', width: value.width, height: value.height });
          }}
          className="input-base"
        >
          {POSTER_OPTIONS.map((p) => (
            <option key={p.size.kind} value={p.size.kind}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>
      {isCustom && (
        <>
          <input
            type="number"
            min={64}
            max={8000}
            value={value.width}
            onChange={(e) =>
              onChange({ kind: 'custom', width: clampSide(Number(e.target.value)), height: value.height })
            }
            className="input-base w-24"
          />
          <span>×</span>
          <input
            type="number"
            min={64}
            max={8000}
            value={value.height}
            onChange={(e) =>
              onChange({ kind: 'custom', width: value.width, height: clampSide(Number(e.target.value)) })
            }
            className="input-base w-24"
          />
        </>
      )}
    </div>
  );
}

function clampSide(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1080;
  return Math.min(8000, Math.max(64, Math.round(v)));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/QrPreview.tsx
git commit -m "feat(ui): qr preview canvas + download buttons"
```

---

## Task 23: `App.tsx` — state reducer

**Files:**
- Modify: `src/App.tsx` (state-only first pass; layout follows in Task 24)

- [ ] **Step 1: Write the reducer + state shape**

Replace `src/App.tsx`:
```tsx
import { useReducer } from 'react';
import type { HalftoneStyle, PosterSize } from './types';
import { DEFAULT_PLACEHOLDER_URL } from './types';
import { DEFAULT_TEMPLATE_ID } from './templates/presets';

interface CustomSource {
  dataUrl: string;
  filename: string;
}

export interface AppState {
  url: string;
  templateId: string;
  customSource: CustomSource | null;
  caption: string;
  posterSize: PosterSize;
  style: HalftoneStyle;
  density: number;
  marginPx: number;
  multiSize: boolean;
  background: string;
}

export type AppAction =
  | { type: 'SET_URL'; value: string }
  | { type: 'SELECT_TEMPLATE'; id: string }
  | { type: 'SET_CUSTOM_SOURCE'; source: CustomSource }
  | { type: 'CLEAR_CUSTOM_SOURCE' }
  | { type: 'SET_CAPTION'; value: string }
  | { type: 'SET_POSTER_SIZE'; size: PosterSize }
  | {
      type: 'PATCH_ADVANCED';
      patch: Partial<{
        style: HalftoneStyle;
        density: number;
        marginPx: number;
        multiSize: boolean;
        background: string;
      }>;
    };

export const initialState: AppState = {
  url: '',
  templateId: DEFAULT_TEMPLATE_ID,
  customSource: null,
  caption: '',
  posterSize: { kind: 'igPost', width: 1080, height: 1080 },
  style: 'hybrid',
  density: 55,
  marginPx: 32,
  multiSize: false,
  background: 'transparent',
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_URL':
      return { ...state, url: action.value };
    case 'SELECT_TEMPLATE':
      return { ...state, templateId: action.id, customSource: action.id === 'custom' ? state.customSource : null };
    case 'SET_CUSTOM_SOURCE':
      return { ...state, templateId: 'custom', customSource: action.source };
    case 'CLEAR_CUSTOM_SOURCE':
      return { ...state, templateId: DEFAULT_TEMPLATE_ID, customSource: null };
    case 'SET_CAPTION':
      return { ...state, caption: action.value };
    case 'SET_POSTER_SIZE':
      return { ...state, posterSize: action.size };
    case 'PATCH_ADVANCED':
      return { ...state, ...action.patch };
  }
}

export function effectiveUrl(state: AppState): string {
  return state.url.trim() || DEFAULT_PLACEHOLDER_URL;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold tracking-heading">Astro QR</h1>
      <p className="text-olivegray mt-2">URL: {effectiveUrl(state)}</p>
      <button
        type="button"
        className="btn-primary mt-4"
        onClick={() => dispatch({ type: 'SET_URL', value: 'https://www.instagram.com/ntu_astro//events' })}
      >
        Test reducer
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: app state reducer + initial state"
```

---

## Task 24: `App.tsx` — pipeline + layout

**Files:**
- Modify: `src/App.tsx`

This wires the pure-logic libraries into a `useEffect` pipeline triggered by state changes. It also lays out the two-column UI: Controls on the left, QrPreview on the right.

- [ ] **Step 1: Add image-loading + pipeline helper**

Replace `src/App.tsx` (keeping the reducer block from Task 23, expanding `App()`):
```tsx
import { useEffect, useReducer, useRef, useState } from 'react';
import type { ScanResult } from './types';
import { DEFAULT_PLACEHOLDER_URL } from './types';
import { DEFAULT_TEMPLATE_ID, findTemplate } from './templates/presets';
import { Controls } from './components/Controls';
import { QrPreview } from './components/QrPreview';
import { buildMatrix } from './lib/qrMatrix';
import { render as renderHalftone } from './lib/halftoneRenderer';
import { composePoster } from './lib/composer';
import { verify } from './lib/scanVerifier';
// reducer block from Task 23 lives below — keep types/initialState/reducer/effectiveUrl
import { reducer, initialState, effectiveUrl } from './appReducer';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

async function loadImageData(src: string): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
  const canvas = document.createElement('canvas');
  const targetSide = 1024;
  canvas.width = targetSide;
  canvas.height = targetSide;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, targetSide, targetSide);
  // Letterbox so non-square sources still center
  const ratio = Math.min(targetSide / img.width, targetSide / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  ctx.drawImage(img, (targetSide - w) / 2, (targetSide - h) / 2, w, h);
  return ctx.getImageData(0, 0, targetSide, targetSide);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [qrCanvas, setQrCanvas] = useState<HTMLCanvasElement | null>(null);
  const [posterCanvas, setPosterCanvas] = useState<HTMLCanvasElement | null>(null);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const lastGoodCanvasesRef = useRef<{ qr: HTMLCanvasElement | null; poster: HTMLCanvasElement | null }>({
    qr: null,
    poster: null,
  });

  useEffect(() => {
    let cancelled = false;
    setIsRendering(true);

    async function pipeline() {
      try {
        const url = effectiveUrl(state);
        const matrix = buildMatrix(url);

        const sourcePath =
          state.templateId === 'custom' && state.customSource
            ? state.customSource.dataUrl
            : findTemplate(state.templateId).sourcePath;
        const imageData = await loadImageData(sourcePath);

        const qr = renderHalftone(matrix, imageData, {
          style: state.style,
          density: state.density,
          marginPx: state.marginPx,
          background: state.background,
        });

        const palette =
          state.templateId === 'custom'
            ? { accent: '#435ee5', fallbackDark: '#211922' }
            : findTemplate(state.templateId).palette;
        const poster = composePoster(qr, state.caption, state.posterSize, palette);

        const sizes = state.multiSize ? [qr.width, 200] : [qr.width];
        const results = verify(qr, sizes);

        if (cancelled) return;
        setQrCanvas(qr);
        setPosterCanvas(poster);
        setScanResults(results);
        setErrorMessage(undefined);
        lastGoodCanvasesRef.current = { qr, poster };
      } catch (err) {
        if (cancelled) return;
        const last = lastGoodCanvasesRef.current;
        setQrCanvas(last.qr);
        setPosterCanvas(last.poster);
        setScanResults([]);
        const msg = err instanceof Error ? err.message : 'Render failed';
        // Friendly translation for the most common failure mode
        if (/too long/i.test(msg) || /not enough|no version|cannot encode/i.test(msg)) {
          setErrorMessage('Input too long for ECC level H — shorten the URL or text.');
        } else {
          setErrorMessage(msg);
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }

    pipeline();
    return () => {
      cancelled = true;
    };
  }, [state]);

  const handleCustomUpload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrorMessage('File is larger than 2MB. Pick a smaller PNG or SVG.');
      return;
    }
    if (!/^image\/(png|svg\+xml)$/i.test(file.type)) {
      setErrorMessage('Only PNG and SVG uploads are supported.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      dispatch({ type: 'SET_CUSTOM_SOURCE', source: { dataUrl, filename: file.name } });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-6 sm:p-10">
      <header className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-heading">Astro QR</h1>
        <p className="text-sm text-olivegray">NTU Astronomical Society · {DEFAULT_PLACEHOLDER_URL}</p>
      </header>

      <div className="grid gap-8 md:grid-cols-2">
        <Controls
          url={state.url}
          onUrlChange={(v) => dispatch({ type: 'SET_URL', value: v })}
          templateId={state.templateId}
          onTemplateSelect={(id) => dispatch({ type: 'SELECT_TEMPLATE', id })}
          customSourceLabel={state.customSource?.filename}
          caption={state.caption}
          onCaptionChange={(v) => dispatch({ type: 'SET_CAPTION', value: v })}
          posterSize={state.posterSize}
          onPosterSizeChange={(s) => dispatch({ type: 'SET_POSTER_SIZE', size: s })}
          style={state.style}
          density={state.density}
          marginPx={state.marginPx}
          multiSize={state.multiSize}
          background={state.background}
          onAdvancedChange={(patch) => dispatch({ type: 'PATCH_ADVANCED', patch })}
          onCustomUpload={handleCustomUpload}
        />
        <QrPreview
          qrCanvas={qrCanvas}
          posterCanvas={posterCanvas}
          scanResults={scanResults}
          multiSize={state.multiSize}
          posterSize={state.posterSize}
          onPosterSizeChange={(s) => dispatch({ type: 'SET_POSTER_SIZE', size: s })}
          isRendering={isRendering}
          errorMessage={errorMessage}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Move the reducer to its own module**

`src/App.tsx` now imports from `./appReducer`. Create `src/appReducer.ts` with the contents extracted from Task 23 (everything from the `interface CustomSource` block down through `effectiveUrl`):

```ts
import type { HalftoneStyle, PosterSize } from './types';
import { DEFAULT_PLACEHOLDER_URL } from './types';
import { DEFAULT_TEMPLATE_ID } from './templates/presets';

export interface CustomSource {
  dataUrl: string;
  filename: string;
}

export interface AppState {
  url: string;
  templateId: string;
  customSource: CustomSource | null;
  caption: string;
  posterSize: PosterSize;
  style: HalftoneStyle;
  density: number;
  marginPx: number;
  multiSize: boolean;
  background: string;
}

export type AppAction =
  | { type: 'SET_URL'; value: string }
  | { type: 'SELECT_TEMPLATE'; id: string }
  | { type: 'SET_CUSTOM_SOURCE'; source: CustomSource }
  | { type: 'CLEAR_CUSTOM_SOURCE' }
  | { type: 'SET_CAPTION'; value: string }
  | { type: 'SET_POSTER_SIZE'; size: PosterSize }
  | {
      type: 'PATCH_ADVANCED';
      patch: Partial<{
        style: HalftoneStyle;
        density: number;
        marginPx: number;
        multiSize: boolean;
        background: string;
      }>;
    };

export const initialState: AppState = {
  url: '',
  templateId: DEFAULT_TEMPLATE_ID,
  customSource: null,
  caption: '',
  posterSize: { kind: 'igPost', width: 1080, height: 1080 },
  style: 'hybrid',
  density: 55,
  marginPx: 32,
  multiSize: false,
  background: 'transparent',
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_URL':
      return { ...state, url: action.value };
    case 'SELECT_TEMPLATE':
      return {
        ...state,
        templateId: action.id,
        customSource: action.id === 'custom' ? state.customSource : null,
      };
    case 'SET_CUSTOM_SOURCE':
      return { ...state, templateId: 'custom', customSource: action.source };
    case 'CLEAR_CUSTOM_SOURCE':
      return { ...state, templateId: DEFAULT_TEMPLATE_ID, customSource: null };
    case 'SET_CAPTION':
      return { ...state, caption: action.value };
    case 'SET_POSTER_SIZE':
      return { ...state, posterSize: action.size };
    case 'PATCH_ADVANCED':
      return { ...state, ...action.patch };
  }
}

export function effectiveUrl(state: AppState): string {
  return state.url.trim() || DEFAULT_PLACEHOLDER_URL;
}
```

- [ ] **Step 3: Type-check + run unit tests**

Run:
```bash
npm run lint
npm test
```
Expected: exits 0; all 18 tests still pass.

- [ ] **Step 4: Smoke test in the browser**

Run:
```bash
npm run dev -- --port 5173 &
sleep 3
curl -s http://localhost:5173 | grep -c '<div id="root">'
kill %1
```
Expected: 1.

Then open `http://localhost:5173` in the browser. Manually verify:
- Empty input shows the default placeholder render
- Each of the 7 templates produces a different halftone result
- Density slider visibly changes dot density
- Multi-size toggle adds the print-size badge
- Three download buttons produce valid files (PNG, SVG, poster PNG)
- Scan one of the downloaded PNGs with a phone camera — it should resolve to `https://www.instagram.com/ntu_astro/`

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/appReducer.ts
git commit -m "feat: full pipeline + two-column layout"
```

---

## Task 25: Polish — fonts, starfield-free background, focus styles

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.tsx` (header copy)

The spec calls for a flat warm-white page (no patterned background — the spec line "starfield/gradient background" applies to the *poster frame*, not the page chrome). This task verifies typography and CTA hierarchy match DESIGN.md.

- [ ] **Step 1: Tighten `index.css`**

Append to `src/index.css`:
```css
@layer base {
  h1, h2, h3 { letter-spacing: -1.2px; font-weight: 700; }
  h1 { font-size: 28px; line-height: 1.2; }
  h2 { font-size: 20px; line-height: 1.3; }
}

@layer utilities {
  .panel-elevated {
    @apply rounded-card border border-sandgray bg-white p-6;
  }
}
```

- [ ] **Step 2: Update header copy in `App.tsx`**

Find the `<header>` block and replace with:
```tsx
<header className="mb-8 flex flex-col gap-1">
  <h1 className="text-2xl font-semibold tracking-heading">Astro QR</h1>
  <p className="text-sm text-olivegray">
    Halftone-style QR codes for NTU Astronomical Society. No backend, no tracking.
  </p>
</header>
```

- [ ] **Step 3: Smoke test**

Run dev server, confirm Pinterest Red CTA stands out and surface colors are warm.

- [ ] **Step 4: Commit**

```bash
git add src/index.css src/App.tsx
git commit -m "style: tighten typography and header copy"
```

---

## Task 26: Cloudflare Pages config

**Files:**
- Create: `wrangler.toml`
- Modify: `package.json` (add deploy script)

- [ ] **Step 1: Write `wrangler.toml`**

```toml
name = "astro-qr"
compatibility_date = "2026-05-06"
pages_build_output_dir = "dist"
```

- [ ] **Step 2: Add deploy script**

In `package.json`, in the `"scripts"` block, add:
```json
"deploy": "wrangler pages deploy dist --project-name=astro-qr"
```

Also add `wrangler` as a devDependency:
```bash
npm install -D wrangler
```

- [ ] **Step 3: Verify the build**

Run:
```bash
npm run build
```
Expected: `dist/` directory exists with `index.html`, hashed JS/CSS bundles, and the templates/ folder copied.

```bash
ls dist
ls dist/templates
```

- [ ] **Step 4: Commit**

```bash
git add wrangler.toml package.json package-lock.json
git commit -m "chore: cloudflare pages deploy config"
```

> **Deploy is a manual step.** Run `npm run deploy` once `wrangler` is authenticated (`npx wrangler login`). Do not run automated deploys from this plan — the user has not authorized publishing.

---

## Task 27: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# Astro QR — Halftone QR Generator

A small, polished web app that turns any URL into a halftone-style QR code with an astronomy-themed silhouette. Built for [NTU Astronomical Society](https://www.instagram.com/ntu_astro/).

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
npm test            # vitest run, ~20 tests
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
```

- [ ] **Step 2: Final verification — full test + build**

Run:
```bash
npm test
npm run build
```
Expected: all tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: project README"
```

---

## Final checklist

- [ ] All 27 tasks complete
- [ ] `npm test` passes — at least 18 tests across 4 lib files
- [ ] `npm run build` succeeds with no type errors
- [ ] `dist/` includes `index.html` and all 7 template assets
- [ ] Manual smoke check: open dev server, generate one QR per template, download all three formats, scan with phone — every QR resolves
- [ ] All commits pushed (when ready) — do **not** push without user approval
