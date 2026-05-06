# Constellation Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace four generic astronomy template SVGs (telescope, galaxy-spiral, comet, observatory-dome) with four constellation SVGs visible from Singapore (Orion, Scorpius, Crux, Sagittarius Teapot), all sized to render as clear silhouettes through the halftone QR renderer.

**Architecture:** Pure asset + config change. Author 4 new SVGs in `public/templates/`, swap entries in `src/templates/presets.ts`, delete 4 old SVGs, update `public/templates/README.md`. No code logic, no renderer changes, no test changes — `presets.ts` is a static list, no test suite imports any template id, and there is no persistence layer that could hold a stale id (verified via grep for `localStorage`/`sessionStorage`).

**Tech Stack:** SVG (hand-authored, single-fill `#211922`, 512×512 viewBox), TypeScript (`presets.ts`), Markdown (README). Verification via `npm run lint` (tsc), `npm test` (vitest), and visual check in `npm run dev`.

**Spec:** [docs/superpowers/specs/2026-05-07-constellation-templates-design.md](../specs/2026-05-07-constellation-templates-design.md)

---

## Task 1: Pre-flight baseline

Before changing anything, confirm the working tree is clean and the project builds + tests pass. This gives a known-good rollback point.

**Files:** none modified

- [ ] **Step 1: Confirm clean working tree**

Run: `git status`
Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Confirm baseline type-check passes**

Run: `npm run lint`
Expected: exits 0, no errors

- [ ] **Step 3: Confirm baseline tests pass**

Run: `npm test`
Expected: all suites pass

If any of these fail, stop and resolve before continuing.

---

## Task 2: Author `orion.svg`

Orion the Hunter — 7 main stars, 3-star belt as the focal feature. Brightest stars Betelgeuse (mag 0.5) and Rigel (mag 0.1) get r=32; mid-mag stars get r=24.

**Files:**
- Create: `public/templates/orion.svg`

- [ ] **Step 1: Write `public/templates/orion.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="#211922" stroke="#211922" stroke-width="18" stroke-linecap="round">
    <!-- connecting lines (drawn first so star circles cover endpoints) -->
    <line x1="170" y1="130" x2="350" y2="145"/>           <!-- shoulders: Betelgeuse - Bellatrix -->
    <line x1="170" y1="130" x2="210" y2="270"/>           <!-- left torso: Betelgeuse - Alnitak -->
    <line x1="350" y1="145" x2="305" y2="258"/>           <!-- right torso: Bellatrix - Mintaka -->
    <line x1="210" y1="270" x2="256" y2="264"/>           <!-- belt left: Alnitak - Alnilam -->
    <line x1="256" y1="264" x2="305" y2="258"/>           <!-- belt right: Alnilam - Mintaka -->
    <line x1="210" y1="270" x2="185" y2="405"/>           <!-- left leg: Alnitak - Saiph -->
    <line x1="305" y1="258" x2="355" y2="415"/>           <!-- right leg: Mintaka - Rigel -->
  </g>
  <g fill="#211922">
    <!-- stars (sized by apparent magnitude) -->
    <circle cx="170" cy="130" r="32"/>                    <!-- Betelgeuse, mag 0.5 -->
    <circle cx="350" cy="145" r="24"/>                    <!-- Bellatrix, mag 1.6 -->
    <circle cx="210" cy="270" r="24"/>                    <!-- Alnitak, mag 2.0 -->
    <circle cx="256" cy="264" r="24"/>                    <!-- Alnilam, mag 1.7 -->
    <circle cx="305" cy="258" r="24"/>                    <!-- Mintaka, mag 2.2 -->
    <circle cx="185" cy="405" r="24"/>                    <!-- Saiph, mag 2.1 -->
    <circle cx="355" cy="415" r="32"/>                    <!-- Rigel, mag 0.1 -->
  </g>
</svg>
```

- [ ] **Step 2: Verify SVG is well-formed XML**

Run: `xmllint --noout public/templates/orion.svg`
Expected: exits 0, no output (silent success). If `xmllint` is unavailable, run `node -e "console.log(require('fs').readFileSync('public/templates/orion.svg','utf8').includes('</svg>'))"` and expect `true`.

- [ ] **Step 3: Commit**

```bash
git add public/templates/orion.svg
git commit -m "feat(templates): add Orion constellation SVG"
```

---

## Task 3: Author `scorpius.svg`

Scorpius — distinctive J-curve / fishhook with head triangle, body, and curling tail ending in the stinger. 11 stars covering head → body → tail → stinger. Antares (mag 1.0) is the brightest body star.

**Files:**
- Create: `public/templates/scorpius.svg`

- [ ] **Step 1: Write `public/templates/scorpius.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="#211922" stroke="#211922" stroke-width="18" stroke-linecap="round">
    <!-- head -> body -->
    <line x1="60" y1="70" x2="130" y2="55"/>              <!-- Pi - Dschubba -->
    <line x1="130" y1="55" x2="140" y2="150"/>            <!-- Dschubba - Antares -->
    <!-- body chain -->
    <line x1="140" y1="150" x2="150" y2="220"/>           <!-- Antares - Tau -->
    <line x1="150" y1="220" x2="140" y2="290"/>           <!-- Tau - Epsilon -->
    <line x1="140" y1="290" x2="170" y2="350"/>           <!-- Epsilon - Mu -->
    <!-- tail curve -->
    <line x1="170" y1="350" x2="260" y2="420"/>           <!-- Mu - Eta -->
    <line x1="260" y1="420" x2="350" y2="430"/>           <!-- Eta - Theta -->
    <line x1="350" y1="430" x2="430" y2="380"/>           <!-- Theta - Kappa -->
    <!-- stinger -->
    <line x1="430" y1="380" x2="445" y2="305"/>           <!-- Kappa - Shaula -->
    <line x1="445" y1="305" x2="450" y2="270"/>           <!-- Shaula - Lesath -->
  </g>
  <g fill="#211922">
    <circle cx="60"  cy="70"  r="18"/>                    <!-- Pi Sco, mag 2.9 -->
    <circle cx="130" cy="55"  r="24"/>                    <!-- Dschubba, mag 2.3 -->
    <circle cx="140" cy="150" r="32"/>                    <!-- Antares, mag 1.0 -->
    <circle cx="150" cy="220" r="18"/>                    <!-- Tau, mag 2.8 -->
    <circle cx="140" cy="290" r="24"/>                    <!-- Epsilon, mag 2.3 -->
    <circle cx="170" cy="350" r="18"/>                    <!-- Mu, mag 3.0 -->
    <circle cx="260" cy="420" r="18"/>                    <!-- Eta, mag 3.3 -->
    <circle cx="350" cy="430" r="24"/>                    <!-- Theta, mag 1.9 -->
    <circle cx="430" cy="380" r="24"/>                    <!-- Kappa, mag 2.4 -->
    <circle cx="445" cy="305" r="24"/>                    <!-- Shaula, mag 1.6 -->
    <circle cx="450" cy="270" r="18"/>                    <!-- Lesath, mag 2.7 -->
  </g>
</svg>
```

- [ ] **Step 2: Verify SVG is well-formed XML**

Run: `xmllint --noout public/templates/scorpius.svg`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add public/templates/scorpius.svg
git commit -m "feat(templates): add Scorpius constellation SVG"
```

---

## Task 4: Author `crux.svg`

Crux (Southern Cross) — 5 stars forming a compact cross, with Epsilon Crucis as the small inner-quadrant 5th star. Long-axis brighter stars (Acrux, Mimosa) get r=32.

**Files:**
- Create: `public/templates/crux.svg`

- [ ] **Step 1: Write `public/templates/crux.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="#211922" stroke="#211922" stroke-width="18" stroke-linecap="round">
    <!-- long axis: Gacrux (top) - Acrux (bottom) -->
    <line x1="256" y1="80"  x2="256" y2="432"/>
    <!-- short axis: Mimosa (left) - Delta (right) -->
    <line x1="130" y1="280" x2="380" y2="250"/>
  </g>
  <g fill="#211922">
    <circle cx="256" cy="80"  r="24"/>                    <!-- Gacrux, mag 1.6 -->
    <circle cx="130" cy="280" r="32"/>                    <!-- Mimosa, mag 1.3 -->
    <circle cx="380" cy="250" r="18"/>                    <!-- Delta Crucis, mag 2.8 -->
    <circle cx="256" cy="432" r="32"/>                    <!-- Acrux, mag 0.8 -->
    <circle cx="290" cy="320" r="13"/>                    <!-- Epsilon Crucis, mag 3.6 (unconnected) -->
  </g>
</svg>
```

- [ ] **Step 2: Verify SVG is well-formed XML**

Run: `xmllint --noout public/templates/crux.svg`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add public/templates/crux.svg
git commit -m "feat(templates): add Crux constellation SVG"
```

---

## Task 5: Author `sagittarius-teapot.svg`

Sagittarius Teapot asterism — 8 stars forming a recognisable teapot: triangular lid on top, quadrilateral body, handle on the right, spout pointing lower-left. Kaus Australis (mag 1.9) is brightest at r=32.

**Files:**
- Create: `public/templates/sagittarius-teapot.svg`

- [ ] **Step 1: Write `public/templates/sagittarius-teapot.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="#211922" stroke="#211922" stroke-width="18" stroke-linecap="round">
    <!-- lid (triangle) -->
    <line x1="220" y1="95"  x2="170" y2="200"/>           <!-- Kaus Borealis - Kaus Media -->
    <line x1="220" y1="95"  x2="310" y2="200"/>           <!-- Kaus Borealis - Phi -->
    <line x1="170" y1="200" x2="310" y2="200"/>           <!-- Kaus Media - Phi (lid base / body top) -->
    <!-- body sides + bottom -->
    <line x1="170" y1="200" x2="200" y2="360"/>           <!-- Kaus Media - Kaus Australis (body left) -->
    <line x1="310" y1="200" x2="350" y2="340"/>           <!-- Phi - Ascella (body right) -->
    <line x1="200" y1="360" x2="350" y2="340"/>           <!-- Kaus Australis - Ascella (body bottom) -->
    <!-- spout -->
    <line x1="200" y1="360" x2="90"  y2="290"/>           <!-- Kaus Australis - Alnasl -->
    <!-- handle (Phi -> Nunki -> Tau -> Ascella) -->
    <line x1="310" y1="200" x2="430" y2="250"/>           <!-- Phi - Nunki -->
    <line x1="430" y1="250" x2="430" y2="320"/>           <!-- Nunki - Tau -->
    <line x1="430" y1="320" x2="350" y2="340"/>           <!-- Tau - Ascella -->
  </g>
  <g fill="#211922">
    <circle cx="220" cy="95"  r="18"/>                    <!-- Kaus Borealis (lambda), mag 2.8 -->
    <circle cx="170" cy="200" r="18"/>                    <!-- Kaus Media (delta), mag 2.7 -->
    <circle cx="310" cy="200" r="18"/>                    <!-- Phi Sgr, mag 3.2 -->
    <circle cx="200" cy="360" r="32"/>                    <!-- Kaus Australis (epsilon), mag 1.9 -->
    <circle cx="350" cy="340" r="18"/>                    <!-- Ascella (zeta), mag 2.6 -->
    <circle cx="90"  cy="290" r="18"/>                    <!-- Alnasl (gamma), mag 3.0 (spout tip) -->
    <circle cx="430" cy="250" r="24"/>                    <!-- Nunki (sigma), mag 2.0 (handle top) -->
    <circle cx="430" cy="320" r="18"/>                    <!-- Tau Sgr, mag 3.3 (handle bottom) -->
  </g>
</svg>
```

- [ ] **Step 2: Verify SVG is well-formed XML**

Run: `xmllint --noout public/templates/sagittarius-teapot.svg`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add public/templates/sagittarius-teapot.svg
git commit -m "feat(templates): add Sagittarius Teapot constellation SVG"
```

---

## Task 6: Atomic swap in `presets.ts`

Remove the four old preset entries and add the four new ones in a single edit. Done atomically so the gallery never references a non-existent SVG (the four new SVGs already exist on disk from Tasks 2–5; the old SVGs are still on disk and will be deleted in Task 7).

**Files:**
- Modify: `src/templates/presets.ts` (full replace of `TEMPLATES` array body)

- [ ] **Step 1: Replace the `TEMPLATES` array in `src/templates/presets.ts`**

Replace the entire `TEMPLATES` array (currently lines 3–46) with the following. Keep the `import`, `DEFAULT_TEMPLATE_ID`, and `findTemplate` definitions exactly as they are.

```typescript
export const TEMPLATES: TemplatePreset[] = [
  {
    id: 'saturn',
    displayName: 'Saturn',
    sourcePath: '/templates/saturn.svg',
    palette: { accent: '#d8a36b', fallbackDark: '#211922' },
  },
  {
    id: 'orion',
    displayName: 'Orion',
    sourcePath: '/templates/orion.svg',
    palette: { accent: '#4b6fb5', fallbackDark: '#211922' },
  },
  {
    id: 'scorpius',
    displayName: 'Scorpius',
    sourcePath: '/templates/scorpius.svg',
    palette: { accent: '#c0392b', fallbackDark: '#211922' },
  },
  {
    id: 'crux',
    displayName: 'Crux (Southern Cross)',
    sourcePath: '/templates/crux.svg',
    palette: { accent: '#e8e1c4', fallbackDark: '#211922' },
  },
  {
    id: 'sagittarius-teapot',
    displayName: 'Sagittarius Teapot',
    sourcePath: '/templates/sagittarius-teapot.svg',
    palette: { accent: '#c89055', fallbackDark: '#211922' },
  },
  {
    id: 'ntu-astro-mark',
    displayName: 'NTU Astro (mark)',
    sourcePath: '/templates/ntu-astro-mark.svg',
    palette: { accent: '#211922', fallbackDark: '#211922' },
  },
  {
    id: 'ntu-astro-scene',
    displayName: 'NTU Astro (scene)',
    sourcePath: '/templates/ntu-astro-scene.png',
    palette: { accent: '#6f8fc7', fallbackDark: '#211922' },
  },
];
```

- [ ] **Step 2: Confirm `DEFAULT_TEMPLATE_ID` and `findTemplate` are unchanged**

Run: `grep -n "DEFAULT_TEMPLATE_ID\|findTemplate" src/templates/presets.ts`
Expected: shows `DEFAULT_TEMPLATE_ID = 'ntu-astro-mark'` (still present) and `findTemplate` function (still present).

- [ ] **Step 3: Type-check passes**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 4: Tests still pass (no regression)**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 5: Confirm no orphan references remain in source**

Run: `grep -rn "telescope\|galaxy-spiral\|comet\|observatory-dome" src/`
Expected: no output. (References in `docs/superpowers/plans/` are historical and intentionally untouched.)

- [ ] **Step 6: Commit**

```bash
git add src/templates/presets.ts
git commit -m "feat(templates): swap 4 generic templates for SG-visible constellations"
```

---

## Task 7: Delete obsolete SVGs and update README

Remove the four SVG files no longer referenced by `presets.ts`, and update the built-in templates table in `public/templates/README.md`. These changes belong together — they describe the same removal.

**Files:**
- Delete: `public/templates/telescope.svg`
- Delete: `public/templates/galaxy-spiral.svg`
- Delete: `public/templates/comet.svg`
- Delete: `public/templates/observatory-dome.svg`
- Modify: `public/templates/README.md` (`## Built-in templates` table)

- [ ] **Step 1: Delete the four obsolete SVG files**

Run: `git rm public/templates/telescope.svg public/templates/galaxy-spiral.svg public/templates/comet.svg public/templates/observatory-dome.svg`
Expected: each line shows `rm 'public/templates/<file>.svg'`.

- [ ] **Step 2: Replace the `## Built-in templates` table in `public/templates/README.md`**

Find the existing table (currently lines 13–21) and replace it with this. Leave the surrounding sections (`## Asset rules`, `## Re-generating club assets`, `## Adding new templates`) untouched.

```markdown
## Built-in templates

| File | Source | Notes |
|---|---|---|
| `saturn.svg` | hand-drawn | ringed planet silhouette |
| `orion.svg` | hand-authored | constellation, 7 stars + belt + connectors |
| `scorpius.svg` | hand-authored | constellation, 11 stars in J-curve with stinger |
| `crux.svg` | hand-authored | constellation, 5-star Southern Cross |
| `sagittarius-teapot.svg` | hand-authored | asterism within Sagittarius, 8-star teapot |
| `ntu-astro-mark.svg` | hand-traced from `logo-1.jpeg` | club monogram, halftones cleanly |
| `ntu-astro-scene.png` | resized from `logo-2.jpeg` | moon + rocket scene |
```

- [ ] **Step 3: Confirm directory listing matches the new README**

Run: `ls public/templates/`
Expected (alphabetical): `README.md  crux.svg  ntu-astro-mark.svg  ntu-astro-scene.png  orion.svg  sagittarius-teapot.svg  saturn.svg  scorpius.svg`

- [ ] **Step 4: Commit**

```bash
git add public/templates/README.md public/templates/telescope.svg public/templates/galaxy-spiral.svg public/templates/comet.svg public/templates/observatory-dome.svg
git commit -m "chore(templates): delete obsolete generic templates, update README table"
```

---

## Task 8: Final verification

Production build + dev-server visual check. The visual check is the only way to confirm the constellation silhouettes render correctly through the halftone pipeline; type-checking can't catch a too-sparse SVG.

**Files:** none modified

- [ ] **Step 1: Production build passes**

Run: `npm run build`
Expected: exits 0, `dist/` produced, no TypeScript or Vite errors.

- [ ] **Step 2: All tests still pass**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 3: Dev server visual check**

Run: `npm run dev` (in a separate terminal so the next steps can continue).

In the browser:
1. Confirm the template gallery shows exactly 7 entries: Saturn, Orion, Scorpius, Crux (Southern Cross), Sagittarius Teapot, NTU Astro (mark), NTU Astro (scene). The four removed templates (Telescope, Galaxy Spiral, Comet, Observatory Dome) must NOT appear.
2. Click each new constellation in turn. For each, confirm the halftone-rendered QR shows a clearly recognisable constellation silhouette (stars + connecting lines visible as a unified figure, not a sparse star scatter). If any constellation looks too sparse, scale up its star radii and line stroke uniformly by ~25% and re-author the SVG before continuing.
3. Confirm no console errors in DevTools (especially no 404s for the deleted SVG paths).

- [ ] **Step 4: Stop dev server**

Stop the `npm run dev` process (Ctrl-C in its terminal).

- [ ] **Step 5: Confirm all changes are committed**

Run: `git status`
Expected: `nothing to commit, working tree clean`.

Run: `git log --oneline -8`
Expected: 6 new commits on top of the prior `master` HEAD — one per constellation SVG (Tasks 2–5), one for the `presets.ts` swap (Task 6), one for the deletion + README (Task 7).

---

## Done

The gallery now offers Saturn, four Singapore-visible constellations (Orion, Scorpius, Crux, Sagittarius Teapot), and the two NTU Astro templates. Halftone QR generation continues to work unchanged.
