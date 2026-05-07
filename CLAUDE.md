# CLAUDE.md — Orientation for Claude Code Agents

This file gives an agent enough context to make non-obvious decisions in this repo without re-deriving them from scratch. Read [README.md](README.md) first for the user-facing description; this doc covers the things that aren't obvious from the code.

## What this is

A small client-only React app that turns a URL into a halftone-style QR code. Implementation follows Chu et al. 2013 ("Halftone QR Codes", SIGGRAPH Asia). Deployed to Cloudflare Pages. No backend, no tracking, no auth — pure browser code.

## Technology snapshot

- **React 19 + TypeScript + Vite 8** — single-page app
- **Tailwind CSS v4** via `@tailwindcss/vite` (no `tailwind.config.ts`; tokens live in `src/index.css` as `@theme` variables)
- **vitest + jsdom** for unit tests; **Playwright (chromium-only)** for E2E
- **ESLint flat config** (`eslint.config.js`); CI runs both `typecheck` (tsc) and `lint` (eslint)
- **`canvas` (node-canvas)** is a devDep that polyfills jsdom's 2D context for tests — see "Locked decisions" below

## Key design constraints (don't relitigate without strong evidence)

1. **No quiet zone around the QR.** Canonical halftone QRs intentionally fill the whole canvas. Phone cameras decode them fine but pure-JS decoders (jsqr) are stricter — the in-browser ScanBadge is conservative.
2. **ECC level H, hardcoded.** See `QR_ECC_LEVEL` in `src/types.ts`. The mask-optimiser and module-flipper assume H. Don't change without re-deriving the codeword/ECC tables in `src/lib/codewordLayout.ts`.
3. **Per-RS-block flip budget = 0.15 × ecCount** (`DEFAULT_ECC_BUDGET_RATIO` in `moduleFlipper.ts`). The paper uses 0.49; we're conservative because jsqr is strict. Empirically tuned — bump only if you've tested on a phone.
4. **Effect A / `useMemo` split in App.tsx is load-bearing.** Effect A rebuilds the QR (expensive: builds 8 mask candidates, scores, flips). The poster is a `useMemo` that depends on the QR canvas + caption + posterSize + palette. Don't recouple — typing in the caption shouldn't re-run mask optimisation.
5. **Composer halo uses a seeded PRNG.** `composer.ts` uses `mulberry32` seeded from `caption.length + size.width + size.height` so the same inputs produce the same poster. Don't reintroduce `Math.random`.

## Locked decisions (verified, don't redo)

- **`canvas` (native node-canvas) cannot be removed** even though it's heavyweight. jsdom delegates every `getContext('2d')`, `putImageData`, `drawImage` call to it, AND its native binding does an `instanceof` check on its own ImageData type that rejects polyfill objects. Tried in commit history; reverted. If you want to drop it, you'd have to refactor every test+source path that touches a 2D context.
- **Tailwind stays on v4 with the Vite plugin** (`@tailwindcss/vite`), no `tailwind.config.ts`, no `postcss.config.js`, no `autoprefixer`. Theme tokens live in `src/index.css` `@theme` block.
- **`qrcode` private API.** `src/lib/qrMatrix.ts` reads `qr.modules.reservedBit` to identify structurally-reserved cells. There's a runtime assertion that throws a clear error if the field shape changes. Don't try to vendor `qrcode` — the runtime guard is enough.
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
npm run dev           # vite dev :5173
npm run typecheck     # tsc -b --noEmit
npm run lint          # eslint . --max-warnings=0  (zero warnings tolerated)
npm test              # vitest run (38 tests across 8 files)
npm run test:e2e      # Playwright chromium (builds first, runs against vite preview :4173)
npm run test:e2e:ui   # Playwright UI mode
npm run build         # → dist/
npm run deploy        # wrangler pages deploy dist
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
The pipeline has four stages — never short-circuit one without understanding the next:

```
buildMatrix (qrMatrix.ts)
  → computeHalftoneTarget (halftoneTarget.ts)
  → pickBestMask (maskOptimizer.ts)
  → flipModulesByCodeword (moduleFlipper.ts)
  → render (halftoneRenderer.ts)
```

Stage 2 (mask) and Stage 3a (flip) both depend on the importance map produced by Stage 1. Stage 3a additionally depends on `codewordLayout.ts` for the module ↔ codeword inverse map. Tests in `src/lib/*.test.ts` exercise each stage individually.

### Verifying changes
Always run **all of**: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`. CI enforces all five.

## Gotchas

- **Effect-A deps are exhaustive on purpose.** The eslint `react-hooks/exhaustive-deps` rule is enforced. The state slice is destructured at the top of `App.tsx` so the deps array can list specific fields. Don't pass `state` or `state.url` as a dep when `url` is already destructured — eslint will flag it.
- **`set-state-in-effect`** is also enforced. Don't put synchronous `setState` calls in the effect body — defer to an async function or a microtask. The current Effect A demonstrates the pattern.
- **`react-refresh/only-export-components`** triggers when a component file exports non-component values. Move shared constants/types to `src/types.ts` or a non-component file.
- **The `canvas` jsdom polyfill needs care in tests.** If you write a new test that constructs `ImageData` or calls `getContext('2d')`, the existing setup (`vitest.setup.ts`) covers it. If you need to mock `URL.createObjectURL` or `Image`, see `src/lib/decodeQrImage.test.ts` for the established pattern.
- **CSS theme tokens are scanned from class usage.** Tailwind v4 won't generate `bg-newcolor` unless `--color-newcolor` is in `@theme` AND a class uses it. After adding a token, check the build CSS isn't missing classes.

## When in doubt

- For pipeline math: read `docs/superpowers/specs/2026-05-06-astro-qr-generator-design.md` (the original Chu-paper-derivation doc).
- For visual tokens: look at `src/index.css` `@theme` block. `DESIGN.md` is the *inspiration source* (Pinterest), not the implementation spec.
- For asset prep: `public/templates/README.md` documents the regeneration scripts for wordmark/constellation templates.
