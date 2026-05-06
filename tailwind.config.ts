import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        warmwhite: '#ffffff',
        plumblack: '#211922',
        olivegray: '#62625b',
        warmsilver: '#91918c',
        sandgray: '#e5e5e0',
        warmlight: '#e0e0d9',
        fog: '#f6f6f3',
        focusblue: '#435ee5',
        pinred: '#e60023',
        errorred: '#9e0a0a',
        successgreen: '#103c25',
        darksurface: '#33332e',
      },
      fontFamily: {
        sans: [
          '"Pin Sans"',
          '-apple-system',
          'system-ui',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Helvetica',
          '"ヒラギノ角ゴ Pro W3"',
          'メイリオ',
          'Meiryo',
          '"ＭＳ Ｐゴシック"',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        button: '16px',
        card: '20px',
        section: '32px',
        hero: '40px',
      },
      letterSpacing: {
        heading: '-1.2px',
      },
    },
  },
  plugins: [],
} satisfies Config;
