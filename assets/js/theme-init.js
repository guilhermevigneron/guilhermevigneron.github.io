import { syncThemeColorMeta, THEME_STORAGE_KEY } from '../../src/js/theme-shared.js';

const root = document.documentElement;
root.classList.add('js');

let stored = null;
try {
  stored = localStorage.getItem(THEME_STORAGE_KEY);
} catch {
  // Ignore storage errors in restricted browsing modes
}

let prefersDark = false;
try {
  prefersDark = Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
} catch {
  // Ignore matchMedia errors in restricted environments
}

const isDark = stored === 'dark' || (stored !== 'light' && prefersDark);
root.classList.toggle('dark', isDark);
root.classList.toggle('light', !isDark);
syncThemeColorMeta(isDark);
