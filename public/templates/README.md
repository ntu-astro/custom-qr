# Template assets

Each file here is a *template source* for the QR generator. The renderer samples the **alpha channel and luminance** per-pixel — both render modes consume these files:

- **Composite** (`composite`, default): the file appears as a clean image surround with a small QR centre. Silhouette boundary follows alpha + luminance.
- **Halftone** (`halftone`, Chu et al. 2013): the file is dithered into per-module ink across the whole QR.

## Asset rules

- **Aspect ratio:** square (1:1). The composer and silhouette pipeline assume square sources.
- **Background:** transparent (PNG/SVG/WebP with alpha) or solid `#000`. The renderer treats dark / opaque pixels as "draw a dot".
- **Color space:** sRGB, 8-bit/channel.

### Format by content type

| Content | Format | Why |
|---|---|---|
| Silhouettes, wordmarks, line art (e.g. `ntuas`, constellations) | **SVG** preferred, **PNG-8** fallback | Resolution-independent; PNG-8 with alpha is tiny (<50 KB) for high-contrast art. |
| Photographic / continuous-tone art (e.g. nebulae, planet imagery) | **WebP**, quality 85 | 50–70% smaller than PNG-24, no visible compression artifacts at our render resolution. Supports alpha. |
| ❌ JPEG | **Never use** | 8×8 block artifacts get amplified by the halftone scoring stage (used by both render modes for mask selection) — visible faint grids in the final QR. |

### Resolution

- **SVG:** any (resolution-independent).
- **Raster (PNG/WebP):** **1024×1024** is the recommended target.
  - V5 needs ~296 px effective, V10 ~456 px, V15 ~616 px after the renderer's module-grid downsample. 1024 covers all of them with headroom.
  - 768×768 is the minimum if file size matters.
  - 2048×2048 is overkill — the render pipeline downsamples to module-grid × subpixels and discards the extra detail.

## Built-in templates

### Astronomy

| File | Source | Notes |
|---|---|---|
| `earth.svg` | hand-authored | Apollo Blue Marble — Africa-centered, multi-color (oceans, continents, ice cap) |
| `orion.svg` | J2000 positions, sky-correct, Stellarium "western" lines | 19 stars; closed body loop (no shoulder line, Saiph-Rigel chord), club arc east of Betelgeuse, two-arm bow from Bellatrix; **no sword** (per Stellarium) |
| `scorpius.svg` | J2000 positions, sky-correct, Stellarium "western" lines | 13 stars; single fishhook spine through zeta1 Sco; head as a 3-prong fork from Antares; **no Lesath / Alniyat** (per Stellarium) |
| `crux.svg` | hand-authored | constellation, 5-star Southern Cross |
| `sagittarius-teapot.svg` | J2000 positions, sky-correct, Stellarium "western" lines (teapot subset) | 8 stars: lid (lambda-delta-phi), body, gamma spout (west), Nunki/Tau/Ascella handle (east) |
| `ntuas.svg` | text-only, Archivo Black (Google Fonts, OFL), glyphs converted to paths | wordmark "NTUAS" centered in a 512×512 viewBox; halftones to a horizontal silhouette band |

### Art

Public-domain paintings used as template sources. Each accent color was picked to match the dominant tone of the piece (used as the halo around the QR safe zone in `composite` mode).

| File | Painting | Painter | Accent |
|---|---|---|---|
| `van-gogh-the-starry-night.webp` | The Starry Night (1889) | Vincent van Gogh | `#1e3a8a` |
| `hokusai-the-great-wave-off-kanagawa.webp` | The Great Wave off Kanagawa (c. 1831) | Katsushika Hokusai | `#1f3a5f` |
| `vermeer-girl-with-a-pearl-earring.webp` | Girl with a Pearl Earring (c. 1665) | Johannes Vermeer | `#1d4a7a` |
| `vermeer-the-astronomer.webp` | The Astronomer (1668) | Johannes Vermeer | `#c9924a` |
| `monet-impression-sunrise.webp` | Impression, Sunrise (1872) | Claude Monet | `#e85d3a` |
| `monet-water-lilies.webp` | Water Lilies (1916) | Claude Monet | `#5d7d4a` |
| `monet-woman-with-a-parasol-madame-monet-and-her-son.webp` | Woman with a Parasol — Madame Monet and Her Son (1875) | Claude Monet | `#7895b3` |
| `leonardo-da-vinci-the-last-supper.webp` | The Last Supper (c. 1495–1498) | Leonardo da Vinci | `#a87a4a` |
| `raphael-the-school-of-athens.webp` | The School of Athens (1509–1511) | Raphael | `#9b6f3e` |
| `rembrandt-the-night-watch.webp` | The Night Watch (1642) | Rembrandt | `#a87a3a` |
| `eugene-delacroix-liberty-leading-the-people.webp` | Liberty Leading the People (1830) | Eugène Delacroix | `#a8281f` |
| `canaletto-the-entrance-to-the-grand-canal-venice.webp` | The Entrance to the Grand Canal, Venice (c. 1730) | Canaletto | `#c9a96e` |
| `caillebotte-young-man-at-his-window.webp` | Young Man at His Window (1875) | Gustave Caillebotte | `#5b6b76` |
| `edgar-visit-to-a-museum.webp` | Visit to a Museum (c. 1879–1890) | Edgar Degas | `#8a6a44` |
| `hopper-nighthawks.webp` | Nighthawks (1942) | Edward Hopper | `#d4a93a` |

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
