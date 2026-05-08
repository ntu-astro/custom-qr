# Contributing

This is an internal NTU Astronomical Society project (see [LICENSE](LICENSE)). The flow below is for society members or invited contributors.

## Getting started

```bash
git clone <this-repo>
cd custom-qr
npm install
npm run dev          # http://localhost:5173
```

## Before you submit

The CI workflow runs **all six** of these on push and pull request. Run them locally first:

```bash
npm run typecheck         # tsc -b --noEmit
npm run lint              # eslint . --max-warnings=0
npm run test:coverage     # vitest run with 80%/70% thresholds
npm run build             # vite production build
                          # + bundle-size budget (gzipped JS < 350 KB)
npm run test:e2e          # Playwright chromium + webkit
```

A green `main` reflects all six gates. We treat lint warnings as errors — if eslint complains, fix the code, don't disable the rule (unless there's a real reason and you leave a one-line comment explaining why).

If you're touching the halftone pipeline, also run the perf regression test:

```bash
npm test -- src/lib/pipelineIntegration.perf.test.ts
```

It measures the V10 halftone-mono wall-clock (target median < 500 ms) and auto-skips on CI.

## Adding code

- **New halftone pipeline change** → read [`docs/PIPELINE.md`](docs/PIPELINE.md) for the data-flow diagram, then [`CLAUDE.md`](CLAUDE.md) under "Touching the halftone pipeline" for the agent-orientation notes. Pipeline stages are interdependent — every stage assumes specific shapes from the previous one.
- **New template** → drop the asset in `public/templates/`, add an entry to `src/templates/presets.ts`. See `public/templates/README.md` for asset rules.
- **New advanced setting** → extend `AdvancedSettings` in `src/appReducer.ts`; the type flows to `Controls.tsx` / `AdvancedOptions.tsx` automatically. Persist by adding the field to `getInitialState`'s rehydration block (most fields are intentionally NOT persisted — see the existing pattern).
- **New render mode** → mirror the `compositeRenderer.ts` shape: a single `render(matrix, predicted, opts)` function that paints from a `PredictedCanvas`. Update `useQrPipeline`'s dispatch in the same change.
- **New utility** → if it's pure image/canvas math (rasterise, dither, blend, luminosity), it belongs in `src/lib/imageOps.ts`. Don't create one-off helper files.
- **Tuning ART-UP coefficients** → run `npm run calibrate:flip-budget`. See `scripts/calibrate-flip-budget.ts` header for re-run conditions and AUC gate. The generated `src/lib/flipBudget.calibration.ts` IS checked into source — commit it with the run.

Before opening a PR for a non-trivial change, scan [`docs/FOLLOWUPS.md`](docs/FOLLOWUPS.md) — there may be a tracked item your work supersedes or unblocks. Update the tracker when an item ships.

## Tests

- **Unit tests** live next to the code they test as `*.test.ts` under `src/`. Vitest picks them up automatically.
- **E2E tests** live in `e2e/*.spec.ts`. Playwright runs against the production-built preview server, not the dev server.

We require unit tests for any new module in `src/lib/`. UI changes don't need unit tests but should be smoke-tested via the existing E2E suite — extend it if your change touches a critical user flow.

## Commit messages

Conventional-commit prefix:
```
feat:    new user-visible behaviour
fix:     bug fix
chore:   tooling, config, deps, refactor with no behaviour change
docs:    README / inline docs only
test:    test-only changes
```

Body explains *why*, not *what* — the diff already shows what changed.

## Questions

Open an issue on the repo or ping @zhunhao.
