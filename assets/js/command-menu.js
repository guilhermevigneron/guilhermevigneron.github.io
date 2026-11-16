(() => {
  const D = document;
  const PANEL_URL = '/assets/js/command-menu-panel.js';
  const PANEL_CSS_URL = '/assets/css/command-menu.css';
  const WEBMCP_URL = '/assets/js/webmcp.js';
  const webMcpMod =
    typeof D.modelContext?.registerTool === 'function'
      ? import(WEBMCP_URL).catch(() => null)
      : null;

  function showLoadError() {
    if (!D.body) return;
    let toast = D.getElementById('cmd-toast');
    if (!toast) {
      toast = D.createElement('div');
      toast.id = 'cmd-toast';
      toast.className = 'cmd-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      D.body.appendChild(toast);
    }
    toast.textContent = 'Command menu unavailable';
    toast.hidden = false;
    window.setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  function loadPanelStyles() {
    if (D.querySelector(`link[href="${PANEL_CSS_URL}"]`)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const link = D.createElement('link');
      link.rel = 'stylesheet';
      link.href = PANEL_CSS_URL;
      link.onload = resolve;
      link.onerror = resolve;
      D.head.appendChild(link);
    });
  }

  function initLoader() {
    if (!D.body) return;
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
        panelPromise = Promise.all([import(PANEL_URL), loadPanelStyles()])
          .then(([mod]) => {
            panelApi = mod.initCommandMenuPanel();
            return panelApi;
          })
          .catch((err) => {
            panelPromise = null;
            throw err;
          });
      }
      return panelPromise;
    }

    if (webMcpMod) {
      webMcpMod.then((mod) => {
        mod?.initWebMcp?.({
          openCommandMenu(query) {
            return ensureLoaded().then((api) => api.open(D.activeElement, query));
          },
        });
      });
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
          showLoadError();
        });
    }

    D.querySelectorAll('#command-trigger,#command-trigger-mobile').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleFromLoader(btn);
      });
    });

    D.addEventListener('keydown', (event) => {
      const k = event.key?.toLowerCase();
      if (
        (k === 'j' || k === 'k') &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        toggleFromLoader(D.activeElement);
      }
    });
  }

  if (D.readyState === 'loading') {
    D.addEventListener('DOMContentLoaded', initLoader);
  } else {
    initLoader();
  }
})();
