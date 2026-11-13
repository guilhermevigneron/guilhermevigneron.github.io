(() => {
  const STORAGE_KEY = 'theme';
  const root = document.documentElement;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function getActiveTheme() {
    return root.classList.contains('dark') ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    root.classList.toggle('dark', isDark);
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(isDark));
      toggle.setAttribute(
        'aria-label',
        isDark ? 'Switch to light theme' : 'Switch to dark theme'
      );
      toggle.setAttribute(
        'title',
        isDark ? 'Switch to light theme' : 'Switch to dark theme'
      );
    }
  }

  function initThemeToggle() {
    applyTheme(getActiveTheme());

    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const nextTheme = getActiveTheme() === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem(STORAGE_KEY, nextTheme);
        } catch {
          // Ignore storage errors in restricted browsing modes
        }
        applyTheme(nextTheme);
      });
    }

    mediaQuery.addEventListener('change', (event) => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return;
      } catch {
        // Ignore storage errors
      }
      applyTheme(event.matches ? 'dark' : 'light');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
  } else {
    initThemeToggle();
  }
})();
