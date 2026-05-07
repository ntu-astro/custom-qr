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
| `earth.svg` | hand-authored | Apollo Blue Marble — Africa-centered, multi-color (oceans, continents, ice cap) |
| `orion.svg` | J2000 positions, sky-correct, Stellarium "western" lines | 19 stars; closed body loop (no shoulder line, Saiph-Rigel chord), club arc east of Betelgeuse, two-arm bow from Bellatrix; **no sword** (per Stellarium) |
| `scorpius.svg` | J2000 positions, sky-correct, Stellarium "western" lines | 13 stars; single fishhook spine through zeta1 Sco; head as a 3-prong fork from Antares; **no Lesath / Alniyat** (per Stellarium) |
| `crux.svg` | hand-authored | constellation, 5-star Southern Cross |
| `sagittarius-teapot.svg` | J2000 positions, sky-correct, Stellarium "western" lines (teapot subset) | 8 stars: lid (lambda-delta-phi), body, gamma spout (west), Nunki/Tau/Ascella handle (east) |
| `ntu-astro-mark.svg` | hand-traced from `logo-1.jpeg` | club monogram, halftones cleanly |

## Re-generating club assets

### `ntu-astro-mark.svg` (vectorize from `logo-1.jpeg`)

```bash
# Install once
brew install potrace imagemagick

# Convert and trace
magick ../../logo-1.jpeg -threshold 50% -negate ntu-astro-mark.bmp
potrace ntu-astro-mark.bmp -s -o ntu-astro-mark.svg
rm ntu-astro-mark.bmp
```

## Adding new templates

1. Drop the file under `public/templates/`.
2. Add an entry to `src/templates/presets.ts`.
3. Restart the dev server. The new template appears in the gallery.
