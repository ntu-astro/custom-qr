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
| `ntuas.svg` | text-only, Archivo Black (Google Fonts, OFL), glyphs converted to paths | wordmark "NTUAS" centered in a 512×512 viewBox; halftones to a horizontal silhouette band |

## Re-generating club assets

### `ntuas.svg` (Archivo Black wordmark → SVG paths)

```bash
# Download Archivo Black (OFL)
curl -sSL -o /tmp/ArchivoBlack.ttf \
  "https://github.com/google/fonts/raw/main/ofl/archivoblack/ArchivoBlack-Regular.ttf"
pip install fonttools

# Convert glyphs to centered SVG paths (Python)
python3 - <<'PY'
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
font = TTFont("/tmp/ArchivoBlack.ttf")
cmap, glyphs, hmtx = font.getBestCmap(), font.getGlyphSet(), font['hmtx']
TEXT, VB, PAD = "NTUAS", 512, 0.06
items, total_adv = [], 0
for ch in TEXT:
    g = glyphs[cmap[ord(ch)]]; pen = SVGPathPen(glyphs); g.draw(pen)
    adv = hmtx[cmap[ord(ch)]][0]
    items.append((pen.getCommands(), adv, cmap[ord(ch)])); total_adv += adv
glyf = font['glyf']
y_min = min(glyf[n].yMin for _,_,n in items if glyf[n].numberOfContours)
y_max = max(glyf[n].yMax for _,_,n in items if glyf[n].numberOfContours)
avail = VB * (1 - 2*PAD)
scale = min(avail/total_adv, avail/(y_max-y_min))
bw, bh = total_adv*scale, (y_max-y_min)*scale
tx, ty = (VB-bw)/2, (VB-bh)/2 + scale*y_max
parts, cum = [], 0
for d, adv, _ in items:
    parts.append(f'    <path transform="translate({tx+cum*scale:.4f} {ty:.4f}) '
                 f'scale({scale:.6f} -{scale:.6f})" d="{d}"/>')
    cum += adv
open('ntuas.svg','w').write(
  f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB} {VB}" '
  f'width="{VB}" height="{VB}">\n  <g fill="#211922">\n' +
  '\n'.join(parts) + '\n  </g>\n</svg>\n')
PY
```

## Adding new templates

1. Drop the file under `public/templates/`.
2. Add an entry to `src/templates/presets.ts`.
3. Restart the dev server. The new template appears in the gallery.
