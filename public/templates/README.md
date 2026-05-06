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
| `orion.svg` | hand-authored | full asterism, 10 stars (head, shoulders, belt, sword, legs) |
| `scorpius.svg` | hand-authored | constellation, 13 stars in J-curve, routed clear of QR finders + alignment |
| `crux.svg` | hand-authored | constellation, 5-star Southern Cross |
| `sagittarius-teapot.svg` | hand-authored | asterism within Sagittarius, 8-star teapot |
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
