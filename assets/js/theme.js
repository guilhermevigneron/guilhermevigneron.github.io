(() => {
  const STORAGE_KEY = 'theme';
  const LIGHT_COLOR = '#fafaf8';
  const DARK_COLOR = '#0d0c0a';
  const root = document.documentElement;

  function getMediaQuery() {
    try {
      return typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    } catch {
      return null;
    }
  }

  function readStoredTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch {
      return null;
    }
  }

  function syncThemeColorMeta(isDark) {
    const color = isDark ? DARK_COLOR : LIGHT_COLOR;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute('content', color);
    });
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
    syncThemeColorMeta(isDark);
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
      toggle.setAttribute('aria-pressed', String(isDark));
      toggle.setAttribute('aria-label', label);
    }
  }

  function initThemeToggle() {
    const mediaQuery = getMediaQuery();
    const initial = root.classList.contains('dark')
      ? 'dark'
      : root.classList.contains('light')
        ? 'light'
        : readStoredTheme() || (mediaQuery?.matches ? 'dark' : 'light');
    applyTheme(initial);

    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const nextTheme = root.classList.contains('dark') ? 'light' : 'dark';
        try {
          localStorage.setItem(STORAGE_KEY, nextTheme);
        } catch {
          // Ignore storage errors in restricted browsing modes
        }
        applyTheme(nextTheme);
      });
    }

    if (mediaQuery) {
      const onChange = (event) => {
        if (readStoredTheme()) return;
        applyTheme(event.matches ? 'dark' : 'light');
      };
      try {
        if (typeof mediaQuery.addEventListener === 'function') {
          mediaQuery.addEventListener('change', onChange);
        } else if (typeof mediaQuery.addListener === 'function') {
          mediaQuery.addListener(onChange);
        }
      } catch {
        // Ignore media query listener errors in restricted browsing modes
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
  } else {
    initThemeToggle();
  }
})();
