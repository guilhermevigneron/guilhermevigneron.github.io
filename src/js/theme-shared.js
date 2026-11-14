import {
  dark as DARK_COLOR,
  light as LIGHT_COLOR,
  storageKey as THEME_STORAGE_KEY,
  toggleEvent as THEME_TOGGLE_EVENT,
} from '../theme-tokens.json';

export { DARK_COLOR, LIGHT_COLOR, THEME_STORAGE_KEY, THEME_TOGGLE_EVENT };

export function syncThemeColorMeta(isDark) {
  const color = isDark ? DARK_COLOR : LIGHT_COLOR;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', color);
  }
}
