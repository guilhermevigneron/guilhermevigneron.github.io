(() => {
  const root = document.documentElement;
  root.classList.add('js');

  let stored = null;
  try {
    stored = localStorage.getItem('theme');
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

  const color = isDark ? '#0d0c0a' : '#fafaf8';
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', color);
  });
})();
