/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './404.html',
    './scripts/**/*.mjs',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Geist Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
        mono: [
          '"Geist Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
        pixel: [
          '"Geist Pixel Square"',
          '"Geist Mono"',
          'ui-monospace',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};
