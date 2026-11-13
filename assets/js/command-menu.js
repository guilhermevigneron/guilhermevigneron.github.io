(() => {
  'use strict';

  const D = document;
  const W = window;
  const EMAIL = 'email@gvo.simplelogin.com';
  const HOST = 'guilhermevigneron.dev';
  const SITE_URL = `https://${HOST}`;
  const GH_URL = 'https://github.com/guilhermevigneron';
  const LI_URL = 'https://www.linkedin.com/in/guilherme-vigneron-de-oliveira';
  const COPIED = ' copied to clipboard';

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
    let input = byId('command-input');
    let closeBtn = byId('command-close');
    let list = dialog?.querySelector('.cmd-list');
    let emptyState = byId('command-empty');

    if (!dialog) {
      dialog = el('div', 'cmd-dialog', null, {
        id: 'command-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'command-dialog-title',
      });
      dialog.hidden = true;

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
      });
      row.appendChild(input);

      closeBtn = el('button', 'cmd-close', null, {
        type: 'button',
        id: 'command-close',
        'aria-label': 'Close command menu',
      });
      closeBtn.appendChild(iconSvg('', 16, 'M18 6 6 18M6 6l12 12'));
      row.appendChild(closeBtn);

      list = el('div', 'cmd-list');
      emptyState = el('p', 'cmd-empty', 'No results found.', {
        id: 'command-empty',
        role: 'status',
      });
      emptyState.hidden = true;
      list.appendChild(emptyState);

      dialog.append(title, row, list);
      D.body.appendChild(dialog);
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

    return { backdrop, dialog, toast, closeBtn, input, list, emptyState };
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
        ]
      : [
          ['Portfolio Home', '/', '/', 'main cv'],
          ['Professional Experience', '/#experience', '/#experience', 'jump portfolio'],
          ['Selected Projects', '/#projects', '/#projects', 'jump portfolio'],
          ['Skills', '/#skills', '/#skills', 'jump portfolio core competencies'],
        ];

    return [
      [
        'Actions',
        [
          ['Print / Save as PDF', 'A4 layout', ':print'],
          ['Download Resume (PDF)', 'resume.pdf', '/resume.pdf', 'my'],
          ['Save Contact (vCard)', 'contact.vcf', '/contact.vcf', 'vcf download', 'guilherme-vigneron.vcf'],
          ['Copy Email Address', EMAIL, ':copy-email', 'clipboard contact'],
          ['Copy Profile URL', HOST, ':copy-url', 'link share clipboard'],
          ['Copy Markdown Resume', 'llms.txt', ':copy-llms', 'plain text clipboard'],
          ['Toggle Light / Dark Theme', 'Appearance', ':toggle-theme', 'mode'],
        ],
      ],
      ['Navigate', nav],
      [
        'Links & Endpoints',
        [
          ['GitHub', GH_URL.slice(8), `>${GH_URL}`, 'profile'],
          ['LinkedIn', LI_URL.slice(12), `>${LI_URL}`, 'profile'],
          ['Email', EMAIL, `mailto:${EMAIL}`],
          ['Live Quality Report', '/quality/', '/quality/', 'verification ci'],
          ['Quality Telemetry (JSON)', '/quality/report.json', '/quality/report.json', 'api'],
          ['JSON Resume', '/resume.json', '/resume.json', 'schema'],
          ['llms.txt', '/llms.txt', '/llms.txt', 'markdown profile'],
        ],
      ],
    ];
  }

  const dom = ensureDom();
  const { backdrop, dialog, toast, closeBtn, input, list, emptyState } = dom;
  const triggers = qa(D, '#command-trigger,#command-trigger-mobile');
  const modifierEl = byId('command-modifier');

  if (!backdrop || !dialog || !input || !list || !emptyState) return;

  qa(list, '.cmd-group').forEach((g) => g.remove());
  getGroups(Boolean(byId('about'))).forEach(([heading, rows]) => {
    const group = el('div', 'cmd-group');
    group.appendChild(el('div', 'cmd-group-heading', heading));
    rows.forEach(([title, hint, target, extras, dl]) => {
      const attrs = {
        type: 'button',
        'data-selected': 'false',
        'data-label': `${title} ${hint} ${extras || ''}`.trim(),
        'data-download': dl || null,
      };
      if (target[0] === ':') {
        attrs['data-action'] = target.slice(1);
      } else if (target[0] === '>') {
        attrs['data-href'] = target.slice(1);
        attrs['data-external'] = 'true';
      } else {
        attrs['data-href'] = target;
        attrs['data-external'] = 'false';
      }
      const btn = el('button', 'cmd-item', null, attrs);
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
  let cachedLlms = '';
  let llmsRequested = false;

  if (modifierEl && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)) {
    modifierEl.textContent = '\u2318';
  }

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

  const copyFallback = (text) => {
    const a = el('textarea', 'sr-only', null, { readonly: '' });
    a.value = text;
    D.body.appendChild(a);
    a.select();
    let ok = false;
    try {
      ok = D.execCommand('copy');
    } catch {
      ok = false;
    }
    a.remove();
    return ok;
  };

  const copyText = (text, label) => {
    const msg = `${label}${COPIED}`;
    const finish = (ok) => showToast(ok ? msg : 'Copy unavailable in this browser');
    const clip = navigator.clipboard;
    const res = clip?.writeText ? clip.writeText(text) : null;
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
  const setExpanded = (v) => triggers.forEach((b) => b.setAttribute('aria-expanded', String(v)));
  const getVisible = () => items.filter((item) => !item.hidden);
  const getFocusables = () => [input, ...(closeBtn && !closeBtn.hidden ? [closeBtn] : []), ...getVisible()];

  const setSelected = (index, scroll) => {
    const visible = getVisible();
    items.forEach((item) => item.setAttribute('data-selected', 'false'));
    if (!visible.length) {
      activeIndex = -1;
      return;
    }
    const clamped = ((index % visible.length) + visible.length) % visible.length;
    activeIndex = clamped;
    visible[clamped].setAttribute('data-selected', 'true');
    if (scroll) visible[clamped].scrollIntoView({ block: 'nearest' });
  };

  const filterItems = (query) => {
    const q = query.trim().toLowerCase();
    let any = false;
    groups.forEach((group) => {
      let count = 0;
      qa(group, '.cmd-item').forEach((item) => {
        const text = `${item.getAttribute('data-label') || ''} ${item.textContent || ''}`.toLowerCase();
        const match = !q || text.includes(q);
        item.hidden = !match;
        if (match) {
          count += 1;
          any = true;
        }
      });
      group.hidden = count === 0;
    });
    emptyState.hidden = any;
    setSelected(0, false);
  };

  const openMenu = () => {
    lastFocused = D.activeElement;
    input.value = '';
    filterItems('');
    list.scrollTop = 0;
    backdrop.hidden = false;
    dialog.hidden = false;
    setExpanded(true);
    D.documentElement.style.overflow = 'hidden';
    D.body.style.overflow = 'hidden';
    input.focus({ preventScroll: true });
    if (!llmsRequested && W.fetch) {
      llmsRequested = true;
      W.fetch('/llms.txt')
        .then((r) => (r.ok ? r.text() : ''))
        .then((t) => {
          if (t) cachedLlms = t;
        })
        .catch(() => {
          llmsRequested = false;
        });
    }
  };

  const closeMenu = (restore) => {
    if (!isOpen()) return;
    backdrop.hidden = true;
    dialog.hidden = true;
    setExpanded(false);
    D.documentElement.style.overflow = '';
    D.body.style.overflow = '';
    if (restore && lastFocused instanceof HTMLElement && D.contains(lastFocused)) {
      lastFocused.focus({ preventScroll: true });
    }
  };

  const runItem = (item) => {
    if (!item) return;
    const action = item.getAttribute('data-action');
    const href = item.getAttribute('data-href');
    const dl = item.getAttribute('data-download');
    const external = item.getAttribute('data-external') === 'true';

    if (action === 'print') {
      const target = lastFocused;
      closeMenu(false);
      if (target instanceof HTMLElement && D.contains(target)) {
        W.addEventListener(
          'afterprint',
          () => D.contains(target) && target.focus({ preventScroll: true }),
          { once: true }
        );
      }
      W.setTimeout(() => W.print(), 20);
      return;
    }

    if (action === 'toggle-theme') {
      byId('theme-toggle')?.click();
      closeMenu(true);
      showToast(
        D.documentElement.classList.contains('dark')
          ? 'Switched to dark theme'
          : 'Switched to light theme'
      );
    } else if (action === 'copy-email') {
      closeMenu(true);
      copyText(EMAIL, 'Email');
    } else if (action === 'copy-url') {
      closeMenu(true);
      copyText(SITE_URL, 'Profile URL');
    } else if (action === 'copy-llms') {
      closeMenu(true);
      if (cachedLlms) {
        copyText(cachedLlms, 'Markdown resume');
      } else {
        W.fetch('/llms.txt')
          .then((r) => {
            if (!r.ok) throw new Error(r.status);
            return r.text();
          })
          .then((txt) => {
            cachedLlms = txt;
            copyText(txt, 'Markdown resume');
          })
          .catch(() => showToast('Unable to fetch Markdown resume'));
      }
    } else if (href) {
      if (href[0] === '#') {
        closeMenu(false);
        const target = D.querySelector(href);
        if (target) {
          const reduced = W.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
          W.history?.replaceState?.(null, '', href);
        }
      } else if (dl) {
        closeMenu(true);
        const link = el('a', '', null, { href, download: dl });
        D.body.appendChild(link);
        link.click();
        link.remove();
        showToast('Downloading contact vCard');
      } else {
        closeMenu(true);
        if (external) W.open(href, '_blank', 'noopener,noreferrer');
        else W.location.href = href;
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
    if (
      event.key.toLowerCase() === 'j' &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      isOpen() ? closeMenu(true) : openMenu();
      return;
    }
    if (!isOpen()) return;

    if (event.key === 'Tab') {
      const focusables = getFocusables();
      if (!focusables.length) return;
      const cur = focusables.indexOf(D.activeElement);
      const next = event.shiftKey
        ? (cur <= 0 ? focusables.length - 1 : cur - 1)
        : (cur === -1 || cur >= focusables.length - 1 ? 0 : cur + 1);
      event.preventDefault();
      focusables[next].focus();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const onItem = D.activeElement instanceof Element && Boolean(D.activeElement.closest('.cmd-item'));
      setSelected(activeIndex + (event.key === 'ArrowDown' ? 1 : -1), true);
      if (onItem) {
        const visible = getVisible();
        if (activeIndex >= 0 && visible[activeIndex]) {
          visible[activeIndex].focus({ preventScroll: true });
        }
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

  input.addEventListener('input', () => filterItems(input.value));
  list.addEventListener('focusin', syncHoveredOrFocused);
  list.addEventListener('pointerover', (e) => e.pointerType !== 'touch' && syncHoveredOrFocused(e));
  list.addEventListener('click', (e) => {
    const item = e.target instanceof Element ? e.target.closest('.cmd-item') : null;
    if (item && !item.hidden) runItem(item);
  });
  triggers.forEach((btn) => btn.addEventListener('click', () => (isOpen() ? closeMenu(true) : openMenu())));
  closeBtn?.addEventListener('click', () => closeMenu(true));
  backdrop.addEventListener('click', () => closeMenu(true));
})();
