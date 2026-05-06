import type { TemplatePreset } from '../types';

export const TEMPLATES: TemplatePreset[] = [
  {
    id: 'saturn',
    displayName: 'Saturn',
    sourcePath: '/templates/saturn.svg',
    palette: { accent: '#d8a36b', fallbackDark: '#211922' },
  },
  {
    id: 'telescope',
    displayName: 'Telescope',
    sourcePath: '/templates/telescope.svg',
    palette: { accent: '#62625b', fallbackDark: '#211922' },
  },
  {
    id: 'galaxy-spiral',
    displayName: 'Galaxy Spiral',
    sourcePath: '/templates/galaxy-spiral.svg',
    palette: { accent: '#7e238b', fallbackDark: '#211922' },
  },
  {
    id: 'comet',
    displayName: 'Comet',
    sourcePath: '/templates/comet.svg',
    palette: { accent: '#435ee5', fallbackDark: '#211922' },
  },
  {
    id: 'observatory-dome',
    displayName: 'Observatory Dome',
    sourcePath: '/templates/observatory-dome.svg',
    palette: { accent: '#103c25', fallbackDark: '#211922' },
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

export const DEFAULT_TEMPLATE_ID = 'ntu-astro-mark';

export function findTemplate(id: string): TemplatePreset {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}
