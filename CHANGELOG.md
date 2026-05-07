# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Coverage thresholds, CHANGELOG, .nvmrc, bundle-size budget added in tech-debt sweep.
- Removed the GitHub Pages secondary deployment workflow — Cloudflare Pages is the
  sole deploy target. Vite `base` path env support reverted (no longer needed).
- Bumped Node to 24.15.0 LTS (Krypton) in `.nvmrc` and `package.json#engines` to
  `>=22.0.0`. Wrangler ≥4.88, miniflare, and `@cloudflare/kv-asset-handler` all
  require Node ≥22; the prior `.nvmrc=20` blocked `npm run deploy` on Cloudflare Pages.
- Migrated `wrangler.toml` from Pages-style (`pages_build_output_dir`) to a
  Workers static-assets config (`[assets]` directory + SPA `not_found_handling`).
  The Cloudflare project is a Worker named `custom-qr`, not a Pages project, and
  CF Builds calls `wrangler deploy` (not `wrangler pages deploy`). Updated the
  npm `deploy` script accordingly. README + CLAUDE.md follow.

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

[Unreleased]: https://github.com/wongzhunhao/custom-qr/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/wongzhunhao/custom-qr/releases/tag/v0.1.0
