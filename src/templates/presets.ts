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

  // --- Art ---------------------------------------------------------------
  // Public-domain paintings; accent picked to match the dominant tone of
  // each piece (used as the halo around the QR safe zone).
  {
    id: 'van-gogh-the-starry-night',
    displayName: 'The Starry Night',
    sourcePath: '/templates/van-gogh-the-starry-night.webp',
    palette: { accent: '#1e3a8a' },
    category: 'art',
  },
  {
    id: 'hokusai-the-great-wave-off-kanagawa',
    displayName: 'The Great Wave',
    sourcePath: '/templates/hokusai-the-great-wave-off-kanagawa.webp',
    palette: { accent: '#1f3a5f' },
    category: 'art',
  },
  {
    id: 'vermeer-girl-with-a-pearl-earring',
    displayName: 'Girl with a Pearl Earring',
    sourcePath: '/templates/vermeer-girl-with-a-pearl-earring.webp',
    palette: { accent: '#1d4a7a' },
    category: 'art',
  },
  {
    id: 'vermeer-the-astronomer',
    displayName: 'The Astronomer',
    sourcePath: '/templates/vermeer-the-astronomer.webp',
    palette: { accent: '#c9924a' },
    category: 'art',
  },
  {
    id: 'monet-impression-sunrise',
    displayName: 'Impression, Sunrise',
    sourcePath: '/templates/monet-impression-sunrise.webp',
    palette: { accent: '#e85d3a' },
    category: 'art',
  },
  {
    id: 'monet-water-lilies',
    displayName: 'Water Lilies',
    sourcePath: '/templates/monet-water-lilies.webp',
    palette: { accent: '#5d7d4a' },
    category: 'art',
  },
  {
    id: 'monet-woman-with-a-parasol',
    displayName: 'Woman with a Parasol',
    sourcePath: '/templates/monet-woman-with-a-parasol-madame-monet-and-her-son.webp',
    palette: { accent: '#7895b3' },
    category: 'art',
  },
  {
    id: 'leonardo-da-vinci-the-last-supper',
    displayName: 'The Last Supper',
    sourcePath: '/templates/leonardo-da-vinci-the-last-supper.webp',
    palette: { accent: '#a87a4a' },
    category: 'art',
  },
  {
    id: 'raphael-the-school-of-athens',
    displayName: 'The School of Athens',
    sourcePath: '/templates/raphael-the-school-of-athens.webp',
    palette: { accent: '#9b6f3e' },
    category: 'art',
  },
  {
    id: 'rembrandt-the-night-watch',
    displayName: 'The Night Watch',
    sourcePath: '/templates/rembrandt-the-night-watch.webp',
    palette: { accent: '#a87a3a' },
    category: 'art',
  },
  {
    id: 'eugene-delacroix-liberty-leading-the-people',
    displayName: 'Liberty Leading the People',
    sourcePath: '/templates/eugene-delacroix-liberty-leading-the-people.webp',
    palette: { accent: '#a8281f' },
    category: 'art',
  },
  {
    id: 'canaletto-the-entrance-to-the-grand-canal-venice',
    displayName: 'Grand Canal, Venice',
    sourcePath: '/templates/canaletto-the-entrance-to-the-grand-canal-venice.webp',
    palette: { accent: '#c9a96e' },
    category: 'art',
  },
  {
    id: 'caillebotte-young-man-at-his-window',
    displayName: 'Young Man at His Window',
    sourcePath: '/templates/caillebotte-young-man-at-his-window.webp',
    palette: { accent: '#5b6b76' },
    category: 'art',
  },
  {
    id: 'degas-visit-to-a-museum',
    displayName: 'Visit to a Museum',
    sourcePath: '/templates/edgar-visit-to-a-museum.webp',
    palette: { accent: '#8a6a44' },
    category: 'art',
  },
  {
    id: 'hopper-nighthawks',
    displayName: 'Nighthawks',
    sourcePath: '/templates/hopper-nighthawks.webp',
    palette: { accent: '#d4a93a' },
    category: 'art',
  },
];

export const DEFAULT_TEMPLATE_ID = 'ntuas';

export function findTemplate(id: string): TemplatePreset {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}
