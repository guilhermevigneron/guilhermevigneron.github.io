import SITE_CFG from 'site-config';
import { createWebMcpTools, registerWebMcpTools } from '../../src/js/webmcp-tools.mjs';

let activeCleanup = null;

export async function initWebMcp({ openCommandMenu } = {}) {
  const D = document;
  const W = window;
  const mc = D.modelContext;
  if (typeof mc?.registerTool !== 'function') return null;

  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  const tools = createWebMcpTools({
    siteConfig: SITE_CFG,
    env: {
      fetch: W.fetch.bind(W),
      getSectionElement: (id) => D.getElementById(id),
      scrollToSection(target, hash) {
        let reduced = false;
        try {
          reduced = Boolean(W.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
        } catch {}
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        W.history?.replaceState?.(null, '', hash);
      },
      dispatchTheme(eventName, theme) {
        D.dispatchEvent(new CustomEvent(eventName, { detail: { theme } }));
      },
      getActiveTheme: () => (D.documentElement.classList.contains('dark') ? 'dark' : 'light'),
      openCommandMenu,
      isCommandMenuOpen() {
        const dlg = D.getElementById('command-dialog');
        return Boolean(dlg && !dlg.hidden);
      },
      nextFrame: () =>
        new Promise((resolve) => {
          if (typeof W.requestAnimationFrame === 'function') {
            W.requestAnimationFrame(() => resolve());
          } else {
            W.setTimeout(resolve, 0);
          }
        }),
    },
  });

  try {
    const handle = await registerWebMcpTools(mc, tools, { lifecycleTarget: W });
    activeCleanup = handle.cleanup;
    return handle;
  } catch {
    return null;
  }
}
