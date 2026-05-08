import type { TemplatePreset } from '../types';

export const TEMPLATES: TemplatePreset[] = [
  {
    id: 'earth',
    displayName: 'Earth',
    sourcePath: '/templates/earth.svg',
    palette: { accent: '#2c6b9c' },
    category: 'astronomy',
  },
  {
    id: 'orion',
    displayName: 'Orion',
    sourcePath: '/templates/orion.svg',
    palette: { accent: '#4b6fb5' },
    category: 'astronomy',
  },
  {
    id: 'scorpius',
    displayName: 'Scorpius',
    sourcePath: '/templates/scorpius.svg',
    palette: { accent: '#c0392b' },
    category: 'astronomy',
  },
  {
    id: 'crux',
    displayName: 'Crux (Southern Cross)',
    sourcePath: '/templates/crux.svg',
    palette: { accent: '#e8e1c4' },
    category: 'astronomy',
  },
  {
    id: 'sagittarius-teapot',
    displayName: 'Sagittarius Teapot',
    sourcePath: '/templates/sagittarius-teapot.svg',
    palette: { accent: '#c89055' },
    category: 'astronomy',
  },
  {
    id: 'ntuas',
    displayName: 'NTUAS',
    sourcePath: '/templates/ntuas.svg',
    palette: { accent: '#211922' },
    category: 'astronomy',
  },
];

export const DEFAULT_TEMPLATE_ID = 'ntuas';

export function findTemplate(id: string): TemplatePreset {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}
