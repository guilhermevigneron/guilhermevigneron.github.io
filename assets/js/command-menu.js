(() => {
  const D = document;
  const PANEL_URL = '/assets/js/command-menu-panel.js';
  const modifierEl = D.getElementById('command-modifier');
  if (modifierEl && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)) {
    modifierEl.textContent = '\u2318';
  }

  let dialog = D.getElementById('command-dialog');
  if (!dialog) {
    dialog = D.createElement('div');
    dialog.id = 'command-dialog';
    dialog.className = 'cmd-dialog';
    dialog.hidden = true;
    D.body.appendChild(dialog);
  }

  let panelPromise = null;
  let panelApi = null;
  let loading = false;

  function ensureLoaded() {
    if (!panelPromise) {
      panelPromise = import(PANEL_URL).then((mod) => {
        panelApi = mod.initCommandMenuPanel();
        return panelApi;
      });
    }
    return panelPromise;
  }

  function toggleFromLoader(triggerEl) {
    if (panelApi) {
      panelApi.toggle(triggerEl);
      return;
    }
    if (loading) return;
    loading = true;
    ensureLoaded()
      .then((api) => {
        loading = false;
        api.open(triggerEl);
      })
      .catch(() => {
        loading = false;
        panelPromise = null;
      });
  }

  D.querySelectorAll('#command-trigger,#command-trigger-mobile').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleFromLoader(btn);
    });
  });

  D.addEventListener('keydown', (event) => {
    if (
      event.key.toLowerCase() === 'j' &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      toggleFromLoader(D.activeElement);
    }
  });
})();
