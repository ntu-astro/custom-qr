/// <reference types="vite/client" />

// Side-effect CSS imports (used to load @fontsource-variable/* packages
// that ship CSS @font-face declarations as their package entry).
declare module '*.css';
declare module '@fontsource-variable/*';
declare module '@fontsource/*';
