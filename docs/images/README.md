# `docs/images/` — README visual assets

All assets the root [`README.md`](../../README.md) references are captured from the production app at [custom-qr.ntuas.com](https://custom-qr.ntuas.com). Filenames are referenced verbatim from the README; changing a name means updating the README.

## Source assets (inputs for capture)

These are not inlined in the README — they're inputs used to capture the demos.

| Filename | Purpose |
|---|---|
| `tom_lizard.png` | Custom-upload demo image (solid white background). Used for `hero.webp`. |
| `qr_code_apod_small.png` | Plain QR encoding `http://apod.gsfc.nasa.gov/`. Used for `decode.webp`. |

## Captured assets (referenced inline)

| Filename | Type | Captured how | README section |
|---|---|---|---|
| `hero.webp` | animated, 1024×576, 8.5 s @ 12 fps, 1.2 MB | Playwright `recordVideo` (Astronomy → Art/Starry Night → Custom/lizard upload) → `ffmpeg` (palettegen) → `gif2webp` | top of README |
| `compare-composite.png` | static, 666×666 | in-app "QR only (PNG)" export, Starry Night + composite + color | Two render styles |
| `compare-halftone.png` | static, 666×666 | in-app "QR only (PNG)" export, Starry Night + halftone + color | Two render styles |
| `app-ui.png` | static, 2560×1440, DPR 2 | Playwright `page.screenshot` at Astronomy + NTUAS state | Try it locally |
| `decode.webp` | animated, 1024×576, 7 s @ 12 fps, 928 KB | Playwright `recordVideo` (decode APOD QR → re-style with Starry Night) → `ffmpeg` → `gif2webp` | Decode & re-stylise |
| `pipeline.svg` | static, 1200×360 | hand-authored SVG (6 stages, NTUAS-purple cards, file paths to `src/lib/*.ts` modules) | How it works |
| `gallery-earth.png` | static, 666×666 | in-app PNG export, Earth template (mono default) | What it makes — Astronomy |
| `gallery-orion.png` | static, 666×666 | in-app PNG export, Orion (mono) | What it makes — Astronomy |
| `gallery-scorpius.png` | static, 666×666 | in-app PNG export, Scorpius (mono) | What it makes — Astronomy |
| `gallery-crux.png` | static, 666×666 | in-app PNG export, Crux (mono) | What it makes — Astronomy |
| `gallery-sagittarius-teapot.png` | static, 666×666 | in-app PNG export, Sagittarius Teapot (mono) | What it makes — Astronomy |
| `gallery-ntuas.png` | static, 666×666 | in-app PNG export, NTUAS (mono) | What it makes — Astronomy |
| `gallery-van-gogh-the-starry-night.png` | static, 666×666 | in-app PNG export, Starry Night (color) | What it makes — Art |
| `gallery-hokusai-the-great-wave-off-kanagawa.png` | static, 666×666 | in-app PNG export, Great Wave (color) | What it makes — Art |
| `gallery-vermeer-girl-with-a-pearl-earring.png` | static, 666×666 | in-app PNG export, Pearl Earring (color) | What it makes — Art |
| `gallery-monet-impression-sunrise.png` | static, 666×666 | in-app PNG export, Impression Sunrise (color) | What it makes — Art |
| `gallery-hopper-nighthawks.png` | static, 666×666 | in-app PNG export, Nighthawks (color) | What it makes — Art |
| `gallery-raphael-the-school-of-athens.png` | static, 666×666 | in-app PNG export, School of Athens (color) | What it makes — Art |

## Not yet captured (optional polish)

The README's `<details>` block lists 9 additional art templates that don't yet have inline gallery cells. If/when they're added, follow the pattern `gallery-{template-id}.png` at 666×666 (matching the in-app PNG export size). Template IDs are in [`src/templates/presets.ts`](../../src/templates/presets.ts). Re-run the same Playwright loop used for the existing 12 cells.

`app-ui.png` is captured clean. If you want annotated callouts (template tabs / render mode / color toggle / scan badge), drop it into Figma or Annotely and add 4 numbered overlays — see the prompt in the project root if available, or use the in-line spec from the visual proposal.

## Re-running the captures

The hero/decode/app-ui captures use Playwright (already installed for E2E). Animations are captured as `.webm` via `playwright.recordVideo`, then converted with `ffmpeg` (palettegen) → `gif2webp` for animated webp output. Animated webp is ~half the size of equivalent gif for the high-colour art templates and renders inline on GitHub. The static QR exports use the app's "QR only (PNG)" button. If the app's UI changes materially (new tab, render-mode reorganisation, control rename), re-shoot — the captures above are point-in-time snapshots of the deployed production site.
