import type { TemplatePreset } from '../types';

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

export const DEFAULT_TEMPLATE_ID = 'ntu-astro-mark';

export function findTemplate(id: string): TemplatePreset {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}
