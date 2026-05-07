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

The CI workflow runs **all five** of these on push and pull request. Run them locally first:

```bash
npm run typecheck    # tsc -b --noEmit
npm run lint         # eslint . --max-warnings=0
npm test             # vitest run
npm run build        # vite production build
npm run test:e2e     # Playwright chromium smoke
```

A green `main` reflects all five gates. We treat lint warnings as errors — if eslint complains, fix the code, don't disable the rule (unless there's a real reason and you leave a one-line comment explaining why).

## Adding code

- **New halftone pipeline change** → read [`CLAUDE.md`](CLAUDE.md) under "Touching the halftone pipeline" first. Pipeline stages are interdependent.
- **New template** → drop the asset in `public/templates/`, add an entry to `src/templates/presets.ts`. See `public/templates/README.md` for asset rules.
- **New advanced setting** → extend `AdvancedSettings` in `src/appReducer.ts`; the type flows to `Controls.tsx` / `AdvancedOptions.tsx` automatically.
- **New utility** → if it's pure image/canvas math, it belongs in `src/lib/imageOps.ts`. Don't create one-off helper files.

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
