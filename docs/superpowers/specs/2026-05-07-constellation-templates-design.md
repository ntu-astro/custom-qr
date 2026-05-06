# Constellation Templates — Design

**Date:** 2026-05-07
**Status:** Design (awaiting user approval before plan)

## Goal

Replace four generic astronomy templates with four constellation templates visible from Singapore (1.35° N), keeping the gallery focused on subjects that connect to the NTU Astronomy Club's local observing context.

## Scope

### Remove

| ID | File |
|---|---|
| `telescope` | `public/templates/telescope.svg` |
| `galaxy-spiral` | `public/templates/galaxy-spiral.svg` |
| `comet` | `public/templates/comet.svg` |
| `observatory-dome` | `public/templates/observatory-dome.svg` |

Each removal touches three places:
1. Delete the SVG file under `public/templates/`.
2. Remove the preset entry from `src/templates/presets.ts`.
3. Remove the row from the `## Built-in templates` table in `public/templates/README.md`.

### Add

| ID | Display name | SG visibility | Stars (main) | Accent |
|---|---|---|---|---|
| `orion` | Orion | Nov–Apr, near zenith | 7 (incl. 3-star belt) | `#4b6fb5` |
| `scorpius` | Scorpius | May–Sep, passes near zenith | ~13 in J-curve | `#c0392b` |
| `crux` | Crux (Southern Cross) | Year-round, low south | 5 | `#e8e1c4` |
| `sagittarius-teapot` | Sagittarius Teapot | Jun–Sep, near zenith | 8 | `#c89055` |

`fallbackDark` for all four: `#211922` (matches existing convention).

### Out of scope

- No changes to halftone renderer, mask optimizer, composer, or UI logic.
- No new tests. `presets.ts` is a static list; no test imports any of the removed IDs (verified via grep — only references are in `src/templates/presets.ts` and historical plan docs under `docs/superpowers/plans/`, which are frozen history).
- No change to `DEFAULT_TEMPLATE_ID` (`'ntu-astro-mark'` is unaffected).

## SVG asset spec

All four constellation SVGs follow the same conventions to keep the halftone result consistent:

- **Canvas:** `viewBox="0 0 512 512"`, square, transparent background.
- **Color:** single fill/stroke `#211922` (renderer treats dark pixels as draw-a-dot; per-template `accent` colour applies in the gallery palette, not in the source SVG).
- **Stars:** filled `<circle>` elements, radius scaled by apparent magnitude:
  - mag ≤ 1.5 → r ≈ 9 (e.g. Antares, Rigel, Acrux)
  - mag 1.5–2.5 → r ≈ 7 (e.g. Belt stars, Mizar)
  - mag 2.5–3.5 → r ≈ 5 (fainter members)
  - mag > 3.5 → r ≈ 3.5 (only included when needed for shape recognition)
- **Connecting lines:** `<line>` elements, `stroke-width="5"`, square caps. Width is above the README's "~3px smear threshold" so connectors survive halftoning.
- **Composition:** layout the asterism centred in the viewBox with ≥40px padding on each side. Scale star coordinates from canonical sky positions (RA/Dec) so the constellation reads correctly when isolated.
- **Render order:** lines first, then stars (so star dots sit on top of line endpoints).

### Star + line lists per constellation

These are the working point lists I'll use when authoring each SVG. Coordinates are illustrative target positions in the 512×512 canvas (not RA/Dec); they capture the asterism's recognisable shape with the chosen padding.

#### `orion` (Orion the Hunter)
Stars: Betelgeuse (mag 0.5), Bellatrix (1.6), Mintaka (2.2), Alnilam (1.7), Alnitak (2.0), Saiph (2.1), Rigel (0.1).
Lines: shoulders (Betelgeuse–Bellatrix), torso (Betelgeuse–Alnilam, Bellatrix–Alnilam), belt (Mintaka–Alnilam–Alnitak), legs (Alnilam–Saiph, Alnilam–Rigel).

#### `scorpius` (Scorpius)
Stars: Antares (1.0) plus the curved tail down to Shaula and Lesath; head triangle (Dschubba, Pi Sco, Rho Sco) up top.
Lines: head triangle → body (Antares) → curved tail through Tau, Epsilon, Mu, Zeta, Eta, Theta, Iota, Kappa → stinger (Shaula, Lesath).

#### `crux` (Southern Cross)
Stars: Acrux (0.8), Mimosa (1.3), Gacrux (1.6), Delta Crucis (2.8), plus the small Epsilon Crucis (3.6) for the canonical "5-star" cross.
Lines: long axis (Gacrux–Acrux), short axis (Mimosa–Delta).

#### `sagittarius-teapot` (asterism within Sagittarius)
Stars: Kaus Borealis (lid), Kaus Media + Kaus Australis (base front), Phi Sgr (base back-bottom), Sigma Sgr (handle top), Tau Sgr (handle bottom), Zeta Sgr (handle back), and Alnasl (spout tip).
Lines: lid (Kaus Borealis–Phi), pot body (Kaus Borealis–Kaus Media–Kaus Australis–Phi closed), handle (Phi–Sigma–Tau–Zeta), spout (Kaus Media–Alnasl).

## File touch-list

```
src/templates/presets.ts                        edit (remove 4 entries, add 4)
public/templates/README.md                      edit (table rows)
public/templates/telescope.svg                  delete
public/templates/galaxy-spiral.svg              delete
public/templates/comet.svg                      delete
public/templates/observatory-dome.svg           delete
public/templates/orion.svg                      create
public/templates/scorpius.svg                   create
public/templates/crux.svg                       create
public/templates/sagittarius-teapot.svg         create
```

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Connecting lines render too thin after halftone | 5px stroke is above README's 3px threshold; verify visually after first SVG, adjust if needed before authoring the rest. |
| User had previously selected one of the removed templates (state persisted to localStorage / URL) | Out of scope here, but flag during plan: app should fall back to `DEFAULT_TEMPLATE_ID` on unknown id. Confirm this already happens in the loader; if not, add a small guard. |
| Constellation outlines too sparse to read at small QR sizes | Star radius scaling (3.5–9px) plus 5px connectors keeps the figure legible at 300px+ output; QR generator already targets larger output sizes. |

## Verification

After implementation:
1. `npm run build` (or equivalent) passes with no TypeScript errors.
2. Dev server: gallery shows 7 templates total (Saturn, Orion, Scorpius, Crux, Sagittarius Teapot, NTU Astro mark, NTU Astro scene). Old four are gone.
3. Each new constellation, when selected, renders a recognisable halftone QR.
4. README table matches the actual file list under `public/templates/`.

## Open questions

None — design is complete.
