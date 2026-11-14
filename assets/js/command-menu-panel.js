/* RESUME_META_START */
const RESUME_META = {
  email: 'email@gvo.simplelogin.com',
  siteUrl: 'https://guilhermevigneron.dev',
  host: 'guilhermevigneron.dev',
  githubUrl: 'https://github.com/guilhermevigneron',
  linkedinUrl: 'https://www.linkedin.com/in/guilherme-vigneron-de-oliveira',
  hasLanguages: true,
};
/* RESUME_META_END */

const COPIED = ' copied to clipboard';

function formatDisplayUrl(url) {
  return String(url || '').replace(/^https?:\/\/(www\.)?/, '');
}

export function initCommandMenuPanel() {
  const D = document;
  const W = window;
  const { email, siteUrl, host, githubUrl, linkedinUrl, hasLanguages } = RESUME_META;

  const byId = (id) => D.getElementById(id);
  const qa = (root, sel) => [...root.querySelectorAll(sel)];
  const sa = (node, attrs) => {
    for (const k in attrs) {
      if (attrs[k] != null) node.setAttribute(k, String(attrs[k]));
    }
    return node;
  };
  const el = (tag, cls, text, attrs) => {
    const node = D.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return attrs ? sa(node, attrs) : node;
  };

  function iconSvg(cls, size, pathD) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = sa(D.createElementNS(ns, 'svg'), {
      class: cls || null,
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    svg.appendChild(sa(D.createElementNS(ns, 'path'), { d: pathD }));
    return svg;
  }

  function ensureDom() {
    let backdrop = byId('command-backdrop');
    if (!backdrop) {
      backdrop = el('div', 'cmd-backdrop', null, { id: 'command-backdrop' });
      backdrop.hidden = true;
      D.body.appendChild(backdrop);
    }

    let dialog = byId('command-dialog');
    if (!dialog) {
      dialog = el('div', 'cmd-dialog', null, { id: 'command-dialog' });
      dialog.hidden = true;
      D.body.appendChild(dialog);
    }

    let input = byId('command-input');
    let closeBtn = byId('command-close');
    let list = byId('command-list');
    let emptyState = byId('command-empty');
    let statusEl = byId('command-status');

    if (!input) {
      sa(dialog, {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'command-dialog-title',
      });
      dialog.textContent = '';

      const title = el('h2', 'sr-only', 'Command menu', { id: 'command-dialog-title' });
      const row = el('div', 'cmd-input-row');
      row.appendChild(
        iconSvg('cmd-search-icon', 18, 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm10 18-4.3-4.3')
      );

      input = el('input', 'cmd-input', null, {
        id: 'command-input',
        type: 'text',
        placeholder: 'Type a command or search...',
        'aria-label': 'Search commands and links',
        autocomplete: 'off',
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-expanded': 'false',
        'aria-controls': 'command-list',
      });
      row.appendChild(input);

      closeBtn = el('button', 'cmd-close', null, {
        type: 'button',
        id: 'command-close',
        'aria-label': 'Close command menu',
      });
      closeBtn.appendChild(iconSvg('', 16, 'M18 6 6 18M6 6l12 12'));
      row.appendChild(closeBtn);

      list = el('div', 'cmd-list', null, {
        id: 'command-list',
        role: 'listbox',
        'aria-label': 'Commands and links',
      });

      emptyState = el('p', 'cmd-empty', 'No results found.', {
        id: 'command-empty',
        role: 'status',
      });
      emptyState.hidden = true;

      statusEl = el('div', 'sr-only', '', {
        id: 'command-status',
        role: 'status',
        'aria-live': 'polite',
      });

      dialog.append(title, row, list, emptyState, statusEl);
    }

    let toast = byId('cmd-toast');
    if (!toast) {
      toast = el('div', 'cmd-toast', null, {
        id: 'cmd-toast',
        role: 'status',
        'aria-live': 'polite',
      });
      toast.hidden = true;
      D.body.appendChild(toast);
    }

    return { backdrop, dialog, toast, closeBtn, input, list, emptyState, statusEl };
  }

  function getGroups(isHome) {
    const nav = isHome
      ? [
          ['Summary', 'Section', '#about', 'jump about me'],
          ['Professional Experience', 'Section', '#experience', 'jump work'],
          ['Selected Projects', 'Section', '#projects', 'jump open source'],
          ['Skills', 'Section', '#skills', 'jump core competencies'],
          ['Publications & Awards', 'Section', '#publications', 'jump'],
          ['Education', 'Section', '#education', 'jump'],
          ...(hasLanguages ? [['Languages', 'Section', '#languages', 'jump']] : []),
        ]
      : [
          ['Portfolio Home', '/', '/', 'main cv'],
          ['Professional Experience', '/#experience', '/#experience', 'jump portfolio'],
          ['Selected Projects', '/#projects', '/#projects', 'jump portfolio'],
          ['Skills', '/#skills', '/#skills', 'jump portfolio core competencies'],
        ];

    const links = [];
    if (githubUrl) {
      links.push(['GitHub', formatDisplayUrl(githubUrl), `>${githubUrl}`, 'profile']);
    }
    if (linkedinUrl) {
      links.push(['LinkedIn', formatDisplayUrl(linkedinUrl), `>${linkedinUrl}`, 'profile']);
    }
    links.push(
      ['Email', email, `mailto:${email}`],
      ['Architecture Overview', '/architecture/', '/architecture/', 'diagram pipeline'],
      ['Live Quality Report', '/quality/', '/quality/', 'verification ci'],
      ['Quality Telemetry (JSON)', '/quality/report.json', '/quality/report.json', 'api'],
      ['JSON Resume', '/resume.json', '/resume.json', 'schema'],
      ['llms.txt', '/llms.txt', '/llms.txt', 'markdown profile']
    );

    return [
      [
        'Actions',
        [
          ['Print / Save as PDF', 'A4 layout', ':print'],
          ['Download Resume (PDF)', 'resume.pdf', '/resume.pdf', 'my'],
          [
            'Save Contact (vCard)',
            'contact.vcf',
            '/contact.vcf',
            'vcf download',
            'guilherme-vigneron.vcf',
          ],
          ['Copy Email Address', email, ':copy-email', 'clipboard contact'],
          ['Copy Profile URL', host, ':copy-url', 'link share clipboard'],
          ['Copy Markdown Resume', 'llms.txt', ':copy-llms', 'plain text clipboard'],
          ['Toggle Light / Dark Theme', 'Appearance', ':toggle-theme', 'mode'],
        ],
      ],
      ['Navigate', nav],
      ['Links & Endpoints', links],
    ];
  }

  const dom = ensureDom();
  const { backdrop, dialog, toast, closeBtn, input, list, emptyState, statusEl } = dom;
  const triggers = qa(D, '#command-trigger,#command-trigger-mobile');

  qa(list, '.cmd-group').forEach((g) => {
    g.remove();
  });

  const itemActions = new WeakMap();
  let itemCounter = 0;
  getGroups(Boolean(byId('about'))).forEach(([heading, rows], groupIdx) => {
    const headingId = `cmd-group-${groupIdx}`;
    const group = el('div', 'cmd-group', null, {
      role: 'group',
      'aria-labelledby': headingId,
    });
    group.appendChild(
      el('div', 'cmd-group-heading', heading, { id: headingId, role: 'presentation' })
    );
    rows.forEach(([title, hint, target, extras, dl]) => {
      const itemId = `cmd-item-${itemCounter}`;
      itemCounter += 1;
      const meta = {
        action: target[0] === ':' ? target.slice(1) : null,
        href: target[0] === ':' ? null : target[0] === '>' ? target.slice(1) : target,
        external: target[0] === '>',
        dl: dl || null,
      };
      const attrs = {
        id: itemId,
        type: 'button',
        role: 'option',
        'aria-selected': 'false',
        'data-selected': 'false',
        'data-label': `${title} ${hint} ${extras || ''}`.trim(),
        'data-download': meta.dl,
      };
      if (meta.action) {
        attrs['data-action'] = meta.action;
      } else {
        attrs['data-href'] = meta.href;
        attrs['data-external'] = String(meta.external);
      }
      const btn = el('button', 'cmd-item', null, attrs);
      itemActions.set(btn, meta);
      btn.append(el('span', '', title), el('span', 'cmd-item-hint', hint));
      group.appendChild(btn);
    });
    list.appendChild(group);
  });

  const items = qa(dialog, '.cmd-item');
  const groups = qa(dialog, '.cmd-group');
  let lastFocused = null;
  let activeIndex = -1;
  let toastTimer = null;
  let statusTimer = null;
  let cachedLlms = '';
  let llmsPromise = null;

  const showToast = (msg) => {
    if (!toast) return;
    if (toastTimer) W.clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.hidden = false;
    toastTimer = W.setTimeout(() => {
      toast.hidden = true;
      toastTimer = null;
    }, 2400);
  };

  const fetchLlms = () => {
    if (cachedLlms) return Promise.resolve(cachedLlms);
    if (llmsPromise) return llmsPromise;
    if (typeof W.fetch !== 'function') return Promise.reject(new Error('Fetch unavailable'));
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? W.setTimeout(() => ctrl.abort(), 5000) : null;
    llmsPromise = W.fetch('/llms.txt', ctrl ? { signal: ctrl.signal } : undefined)
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      })
      .then((txt) => {
        if (!txt) throw new Error('Empty');
        cachedLlms = txt;
        return txt;
      })
      .finally(() => {
        if (timer) W.clearTimeout(timer);
        llmsPromise = null;
      });
    return llmsPromise;
  };

  const copyFallback = (text) => {
    const a = el('textarea', 'sr-only', null, { readonly: '' });
    a.value = text;
    D.body.appendChild(a);
    a.select();
    a.setSelectionRange?.(0, text.length);
    let ok = false;
    try {
      ok = D.execCommand('copy');
    } catch {
      ok = false;
    }
    a.remove();
    return ok;
  };

  const copyText = (text, label, failMsg = 'Copy unavailable in this browser') => {
    const msg = `${label}${COPIED}`;
    const finish = (ok) => showToast(ok ? msg : failMsg);
    let res = null;
    try {
      res = navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : null;
    } catch {
      res = null;
    }
    if (res && typeof res.then === 'function') {
      res.then(
        () => finish(true),
        () => finish(copyFallback(text))
      );
      return;
    }
    finish(copyFallback(text));
  };

  const isOpen = () => !dialog.hidden;
  const setExpanded = (v) => {
    input.setAttribute('aria-expanded', String(v));
    triggers.forEach((b) => {
      b.setAttribute('aria-expanded', String(v));
    });
  };
  const getVisible = () => items.filter((item) => !item.hidden);
  const getFocusables = () => [
    input,
    ...(closeBtn && !closeBtn.hidden ? [closeBtn] : []),
    ...getVisible(),
  ];

  const setSelected = (index, scroll) => {
    const visible = getVisible();
    items.forEach((item) => {
      item.setAttribute('data-selected', 'false');
      item.setAttribute('aria-selected', 'false');
    });
    if (!visible.length) {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    const clamped = ((index % visible.length) + visible.length) % visible.length;
    activeIndex = clamped;
    const activeItem = visible[clamped];
    activeItem.setAttribute('data-selected', 'true');
    activeItem.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', activeItem.id);
    if (scroll) activeItem.scrollIntoView({ block: 'nearest' });
  };

  const setBackgroundInert = (inertState) => {
    [...D.body.children].forEach((child) => {
      if (child === backdrop || child === dialog || child === toast) return;
      if (inertState) {
        child.setAttribute('inert', '');
        child.setAttribute('aria-hidden', 'true');
      } else {
        child.removeAttribute('inert');
        child.removeAttribute('aria-hidden');
      }
    });
  };

  const filterItems = (query, announce = false) => {
    const q = query.trim().toLowerCase();
    let total = 0;
    groups.forEach((group) => {
      let count = 0;
      qa(group, '.cmd-item').forEach((item) => {
        const text =
          `${item.getAttribute('data-label') || ''} ${item.textContent || ''}`.toLowerCase();
        const match = !q || text.includes(q);
        item.hidden = !match;
        if (match) {
          count += 1;
          total += 1;
        }
      });
      group.hidden = count === 0;
    });
    const any = total > 0;
    list.hidden = !any;
    emptyState.hidden = any;
    setSelected(0, false);
    if (statusEl) {
      if (statusTimer) W.clearTimeout(statusTimer);
      if (announce) {
        statusTimer = W.setTimeout(() => {
          statusEl.textContent = any
            ? `${total} ${total === 1 ? 'result' : 'results'} available.`
            : '';
          statusTimer = null;
        }, 150);
      } else {
        statusEl.textContent = '';
      }
    }
  };

  const openMenu = (triggerEl = D.activeElement) => {
    lastFocused = triggerEl instanceof HTMLElement ? triggerEl : D.activeElement;
    input.value = '';
    filterItems('', false);
    list.scrollTop = 0;
    setBackgroundInert(true);
    backdrop.hidden = false;
    dialog.hidden = false;
    setExpanded(true);
    D.documentElement.style.overflow = 'hidden';
    D.body.style.overflow = 'hidden';
    input.focus({ preventScroll: true });
    fetchLlms().catch(() => {});
  };

  const closeMenu = (restore) => {
    if (!isOpen()) return;
    if (statusTimer) {
      W.clearTimeout(statusTimer);
      statusTimer = null;
    }
    setBackgroundInert(false);
    backdrop.hidden = true;
    dialog.hidden = true;
    setExpanded(false);
    input.removeAttribute('aria-activedescendant');
    D.documentElement.style.overflow = '';
    D.body.style.overflow = '';
    if (restore && lastFocused instanceof HTMLElement && lastFocused.isConnected) {
      lastFocused.focus({ preventScroll: true });
    }
  };

  const runItem = (item) => {
    const meta = item ? itemActions.get(item) : null;
    if (!meta) return;
    const { action, href, dl, external } = meta;

    if (action === 'print') {
      const target = lastFocused;
      closeMenu(false);
      if (target instanceof HTMLElement && target.isConnected) {
        W.addEventListener(
          'afterprint',
          () => {
            if (target.isConnected) target.focus({ preventScroll: true });
          },
          { once: true }
        );
      }
      W.setTimeout(() => {
        W.print();
      }, 20);
      return;
    }

    if (action === 'toggle-theme') {
      const wasDark = D.documentElement.classList.contains('dark');
      byId('theme-toggle')?.click();
      closeMenu(true);
      const isDark = D.documentElement.classList.contains('dark');
      showToast(
        isDark === wasDark
          ? 'Theme toggle unavailable'
          : `Switched to ${isDark ? 'dark' : 'light'} theme`
      );
    } else if (action === 'copy-email') {
      closeMenu(true);
      copyText(email, 'Email');
    } else if (action === 'copy-url') {
      closeMenu(true);
      copyText(siteUrl, 'Profile URL');
    } else if (action === 'copy-llms') {
      closeMenu(true);
      if (cachedLlms) {
        copyText(cachedLlms, 'Markdown resume');
      } else {
        fetchLlms()
          .then((txt) =>
            copyText(txt, 'Markdown resume', 'Markdown resume ready — select Copy again')
          )
          .catch(() => showToast('Unable to fetch Markdown resume'));
      }
    } else if (href) {
      if (href[0] === '#') {
        closeMenu(false);
        const target = byId(href.slice(1));
        if (target) {
          let reduced = false;
          try {
            reduced = Boolean(W.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
          } catch {
            reduced = false;
          }
          target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
          if (!target.hasAttribute('tabindex')) {
            target.setAttribute('tabindex', '-1');
          }
          target.focus({ preventScroll: true });
          W.history?.replaceState?.(null, '', href);
        }
      } else if (dl && href.startsWith('/')) {
        closeMenu(true);
        const link = el('a', '', null, { href, download: dl });
        D.body.appendChild(link);
        link.click();
        link.remove();
        showToast('Downloading contact vCard');
      } else {
        closeMenu(true);
        if (external && /^https?:\/\//i.test(href)) {
          if (!W.open(href, '_blank', 'noopener,noreferrer')) showToast('Pop-up blocked');
        } else if (href.startsWith('/') || href.startsWith('mailto:')) {
          W.location.assign(href);
        }
      }
    }
  };

  const syncHoveredOrFocused = (event) => {
    const item = event.target instanceof Element ? event.target.closest('.cmd-item') : null;
    if (!item || item.hidden) return;
    const idx = getVisible().indexOf(item);
    if (idx !== -1 && idx !== activeIndex) setSelected(idx, false);
  };

  D.addEventListener('keydown', (event) => {
    if (!isOpen()) return;

    if (event.key === 'Tab') {
      const focusables = getFocusables();
      if (!focusables.length) return;
      const cur = focusables.indexOf(D.activeElement);
      const next = event.shiftKey
        ? cur <= 0
          ? focusables.length - 1
          : cur - 1
        : cur === -1 || cur >= focusables.length - 1
          ? 0
          : cur + 1;
      event.preventDefault();
      focusables[next].focus();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Home' ||
      event.key === 'End'
    ) {
      const onItem =
        D.activeElement instanceof Element && Boolean(D.activeElement.closest('.cmd-item'));
      if ((event.key === 'Home' || event.key === 'End') && !onItem && D.activeElement !== input) {
        return;
      }
      if ((event.key === 'Home' || event.key === 'End') && D.activeElement === input && !onItem) {
        return;
      }
      event.preventDefault();
      const visible = getVisible();
      if (!visible.length) return;
      const targetIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? visible.length - 1
            : activeIndex + (event.key === 'ArrowDown' ? 1 : -1);
      setSelected(targetIndex, true);
      if (onItem && activeIndex >= 0 && visible[activeIndex]) {
        visible[activeIndex].focus({ preventScroll: true });
      }
      return;
    }

    if (event.key === 'Enter' && D.activeElement === input) {
      const visible = getVisible();
      if (activeIndex >= 0 && visible[activeIndex]) {
        event.preventDefault();
        runItem(visible[activeIndex]);
      }
    }
  });

  input.addEventListener('input', () => {
    filterItems(input.value, true);
  });
  list.addEventListener('focusin', syncHoveredOrFocused);
  list.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'touch') syncHoveredOrFocused(e);
  });
  list.addEventListener('click', (e) => {
    const item = e.target instanceof Element ? e.target.closest('.cmd-item') : null;
    if (item && !item.hidden) runItem(item);
  });
  closeBtn?.addEventListener('click', () => {
    closeMenu(true);
  });
  backdrop.addEventListener('click', () => {
    closeMenu(true);
  });

  return {
    isOpen,
    open: openMenu,
    close: closeMenu,
    toggle(triggerEl) {
      if (isOpen()) closeMenu(true);
      else openMenu(triggerEl);
    },
  };
}
