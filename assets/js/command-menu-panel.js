import SITE_CFG from 'site-config';
import { matchResumeEvidence, parseLlmsEvidence } from '../../src/js/resume-search.mjs';

const COPIED = ' copied to clipboard';
const ARIA_SEL = 'aria-selected';
const DATA_SEL = 'data-selected';
const ARIA_EXP = 'aria-expanded';
const NO_SCROLL = { preventScroll: true };

const { email, host, siteUrl, toggleEvent, profiles, sections, ep } = SITE_CFG;
const [pdfPath, jsonPath, vcfPath, vcfDl, archPath, qualPath, qJsonPath, llmsPath] = ep;

export function initCommandMenuPanel() {
  const D = document;
  const W = window;

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
  const iconSvg = (cls, size, d) => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = sa(D.createElementNS(ns, 'svg'), {
      class: cls,
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
    svg.appendChild(sa(D.createElementNS(ns, 'path'), { d }));
    return svg;
  };

  function ensureDom() {
    const ensureRoot = (id, cls, attrs) => {
      let n = byId(id);
      if (!n) {
        n = el('div', cls, null, { id, ...attrs });
        n.hidden = true;
        D.body.appendChild(n);
      }
      return n;
    };
    const backdrop = ensureRoot('command-backdrop', 'cmd-backdrop');
    const dialog = ensureRoot('command-dialog', 'cmd-dialog');

    if (!byId('command-input')) {
      sa(dialog, {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'command-dialog-title',
      });
      dialog.textContent = '';

      const row = el('div', 'cmd-input-row');
      const closeBtn = el('button', 'cmd-close', null, {
        type: 'button',
        id: 'command-close',
        'aria-label': 'Close command menu',
      });
      closeBtn.appendChild(iconSvg(null, 16, 'M18 6 6 18M6 6l12 12'));
      row.append(
        iconSvg('cmd-search-icon', 18, 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm10 18-4.3-4.3'),
        el('input', 'cmd-input', null, {
          id: 'command-input',
          type: 'text',
          placeholder: 'Search commands, skills, or experience...',
          'aria-label': 'Search commands and links',
          autocomplete: 'off',
          role: 'combobox',
          'aria-autocomplete': 'list',
          [ARIA_EXP]: 'false',
          'aria-controls': 'command-list',
        }),
        closeBtn
      );

      const emptyState = el('p', 'cmd-empty', 'No results found.', {
        id: 'command-empty',
        role: 'status',
      });
      emptyState.hidden = true;
      dialog.append(
        el('h2', 'sr-only', 'Command menu', { id: 'command-dialog-title' }),
        row,
        el('div', 'cmd-list', null, {
          id: 'command-list',
          role: 'listbox',
          'aria-label': 'Commands and links',
        }),
        emptyState,
        el('div', 'sr-only', '', {
          id: 'command-status',
          role: 'status',
          'aria-live': 'polite',
        })
      );
    }

    return [
      backdrop,
      dialog,
      ensureRoot('cmd-toast', 'cmd-toast', { role: 'status', 'aria-live': 'polite' }),
      ...['command-close', 'command-input', 'command-list', 'command-empty', 'command-status'].map(
        byId
      ),
    ];
  }

  function getGroups(isHome) {
    const nav = isHome
      ? sections.map(([id, title, extras]) => [title, 'Section', `#${id}`, extras])
      : [
          ['Portfolio Home', '/', '/', 'main cv'],
          ...sections
            .filter(([id]) => id === 'experience' || id === 'projects' || id === 'skills')
            .map(([id, title, extras]) => [title, `/#${id}`, `/#${id}`, `${extras} portfolio`]),
        ];

    const links = [
      ...profiles.map(([network, display, url]) => [network, display, `>${url}`, 'profile']),
      ['Email', email, `mailto:${email}`],
      ['Architecture Overview', archPath, archPath, 'diagram pipeline'],
      ['Live Quality Report', qualPath, qualPath, 'verification ci'],
      ['Quality Telemetry (JSON)', qJsonPath, qJsonPath, 'api'],
      ['JSON Resume', jsonPath, jsonPath, 'schema'],
      ['llms.txt', llmsPath, llmsPath, 'markdown profile'],
    ];

    return [
      [
        'Actions',
        [
          ['Print / Save as PDF', 'A4 layout', ':print'],
          ['Download Resume (PDF)', 'resume.pdf', pdfPath, 'my'],
          ['Save Contact (vCard)', 'contact.vcf', vcfPath, 'vcf download', vcfDl],
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

  const [backdrop, dialog, toast, closeBtn, input, list, emptyState, statusEl] = ensureDom();
  const triggers = qa(D, '#command-trigger,#command-trigger-mobile');
  const isHome = Boolean(byId('about'));

  qa(list, '.cmd-group').forEach((g) => {
    g.remove();
  });

  const itemActions = new WeakMap();
  let itemCounter = 0;

  const createBtn = (title, hint, target, extras, dl, isEvidence = false) => {
    const isAct = target[0] === ':';
    const external = target[0] === '>';
    const href = isAct ? null : external ? target.slice(1) : target;
    const btn = el('button', isEvidence ? 'cmd-item cmd-item--match' : 'cmd-item', null, {
      id: `cmd-item-${itemCounter++}`,
      type: 'button',
      role: 'option',
      [ARIA_SEL]: 'false',
      [DATA_SEL]: 'false',
      'data-href': href,
      'data-download': dl || null,
    });
    itemActions.set(btn, [
      isAct ? target.slice(1) : null,
      href,
      external,
      dl || null,
      `${title} ${hint} ${extras || ''}`.toLowerCase(),
    ]);
    btn.append(el('span', '', title), el('span', 'cmd-item-hint', hint));
    return btn;
  };

  const makeGroup = (heading, idx) => {
    const id = `cmd-group-${idx}`;
    const g = el('div', 'cmd-group', null, { role: 'group', 'aria-labelledby': id });
    g.appendChild(el('div', 'cmd-group-heading', heading, { id, role: 'presentation' }));
    list.appendChild(g);
    return g;
  };

  const staticGroups = getGroups(isHome).map(([heading, rows], idx) => {
    const group = makeGroup(heading, idx);
    rows.forEach(([title, hint, target, extras, dl]) => {
      group.appendChild(createBtn(title, hint, target, extras, dl));
    });
    return group;
  });

  const evidenceGroup = makeGroup('Resume Matches', staticGroups.length);
  evidenceGroup.hidden = true;

  let evidenceItems = [];
  const evidenceBtns = [];
  let lastFocused = null;
  let activeIndex = -1;
  let toastTimer = null;
  let statusTimer = null;
  let cachedLlms = '';
  let llmsPromise = null;

  const hydrateEvidence = (txt) => {
    if (evidenceItems.length || !txt) return;
    evidenceItems = parseLlmsEvidence(txt);
    evidenceItems.forEach(([title, cite, sec]) => {
      const btn = createBtn(title, cite, isHome ? `#${sec}` : `/#${sec}`, '', null, true);
      btn.hidden = true;
      evidenceBtns.push(btn);
      evidenceGroup.appendChild(btn);
    });
    if (isOpen() && input.value.trim()) filterItems(input.value, true);
  };

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
    llmsPromise = W.fetch(llmsPath)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then((txt) => {
        if (!txt) throw new Error();
        cachedLlms = txt;
        hydrateEvidence(txt);
        return txt;
      })
      .finally(() => {
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
    } catch {}
    a.remove();
    return ok;
  };

  const copyText = (text, label, failMsg = 'Copy unavailable in this browser') => {
    const finish = (ok) => showToast(ok ? `${label}${COPIED}` : failMsg);
    let res = null;
    try {
      res = navigator.clipboard?.writeText?.(text);
    } catch {}
    if (res?.then) {
      res.then(
        () => finish(true),
        () => finish(copyFallback(text))
      );
      return;
    }
    finish(copyFallback(text));
  };

  const isOpen = () => !dialog.hidden;
  const getAllItems = () => qa(list, '.cmd-item');
  const getVisible = () => getAllItems().filter((item) => !item.hidden);
  const getFocusables = () => [
    input,
    ...(closeBtn && !closeBtn.hidden ? [closeBtn] : []),
    ...getVisible(),
  ];

  const markItem = (item, v) => {
    item.setAttribute(DATA_SEL, v);
    item.setAttribute(ARIA_SEL, v);
  };

  const setSelected = (index, scroll) => {
    const visible = getVisible();
    getAllItems().forEach((item) => {
      markItem(item, 'false');
    });
    if (!visible.length) {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    activeIndex = ((index % visible.length) + visible.length) % visible.length;
    const activeItem = visible[activeIndex];
    markItem(activeItem, 'true');
    input.setAttribute('aria-activedescendant', activeItem.id);
    if (scroll) activeItem.scrollIntoView({ block: 'nearest' });
  };

  const setModalState = (open) => {
    [...D.body.children].forEach((c) => {
      if (c !== backdrop && c !== dialog && c !== toast) {
        c.toggleAttribute('inert', open);
        if (open) c.setAttribute('aria-hidden', 'true');
        else c.removeAttribute('aria-hidden');
      }
    });
    backdrop.hidden = !open;
    dialog.hidden = !open;
    [input, ...triggers].forEach((b) => {
      b.setAttribute(ARIA_EXP, String(open));
    });
    const ov = open ? 'hidden' : '';
    D.documentElement.style.overflow = ov;
    D.body.style.overflow = ov;
  };

  const filterItems = (query, announce = false) => {
    const q = query.trim().toLowerCase();
    let total = 0;
    staticGroups.forEach((group) => {
      let count = 0;
      qa(group, '.cmd-item').forEach((item) => {
        const match = !q || itemActions.get(item)[4].includes(q);
        item.hidden = !match;
        if (match) {
          count += 1;
          total += 1;
        }
      });
      group.hidden = count === 0;
    });

    evidenceBtns.forEach((btn) => {
      btn.hidden = true;
    });
    const matches = q && evidenceItems.length ? matchResumeEvidence(evidenceItems, q, 6) : [];
    matches.forEach(({ index }) => {
      const btn = evidenceBtns[index];
      if (btn) {
        btn.hidden = false;
        evidenceGroup.appendChild(btn);
        total += 1;
      }
    });
    evidenceGroup.hidden = matches.length === 0;

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
    lastFocused = triggerEl?.focus ? triggerEl : D.activeElement;
    input.value = '';
    filterItems('', false);
    list.scrollTop = 0;
    setModalState(true);
    input.focus(NO_SCROLL);
    fetchLlms().catch(() => {});
  };

  const closeMenu = (restore) => {
    if (!isOpen()) return;
    if (statusTimer) {
      W.clearTimeout(statusTimer);
      statusTimer = null;
    }
    setModalState(false);
    input.removeAttribute('aria-activedescendant');
    if (restore && lastFocused?.isConnected) {
      lastFocused.focus(NO_SCROLL);
    }
  };

  const runItem = (item) => {
    const meta = item ? itemActions.get(item) : null;
    if (!meta) return;
    const [action, href, external, dl] = meta;

    if (action === 'print') {
      const target = lastFocused;
      closeMenu(false);
      if (target?.isConnected) {
        W.addEventListener(
          'afterprint',
          () => {
            if (target.isConnected) target.focus(NO_SCROLL);
          },
          { once: true }
        );
      }
      W.setTimeout(() => {
        W.print();
      }, 20);
      return;
    }

    if (href?.[0] === '#') {
      closeMenu(false);
      const target = byId(href.slice(1));
      if (target) {
        let reduced = false;
        try {
          reduced = Boolean(W.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
        } catch {}
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus(NO_SCROLL);
        W.history?.replaceState?.(null, '', href);
      }
      return;
    }

    const wasDark = D.documentElement.classList.contains('dark');
    if (action === 'toggle-theme') D.dispatchEvent(new CustomEvent(toggleEvent));
    closeMenu(true);

    if (action === 'toggle-theme') {
      const isDark = D.documentElement.classList.contains('dark');
      showToast(
        isDark === wasDark
          ? 'Theme toggle unavailable'
          : `Switched to ${isDark ? 'dark' : 'light'} theme`
      );
    } else if (action === 'copy-email') {
      copyText(email, 'Email');
    } else if (action === 'copy-url') {
      copyText(siteUrl, 'Profile URL');
    } else if (action === 'copy-llms') {
      if (cachedLlms) {
        copyText(cachedLlms, 'Markdown resume');
      } else {
        fetchLlms()
          .then((txt) =>
            copyText(txt, 'Markdown resume', 'Markdown resume ready — select Copy again')
          )
          .catch(() => showToast('Unable to fetch Markdown resume'));
      }
    } else if (dl && href?.startsWith('/')) {
      const link = el('a', '', null, { href, download: dl });
      D.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Downloading contact vCard');
    } else if (href) {
      if (external && /^https?:\/\//i.test(href)) {
        if (!W.open(href, '_blank', 'noopener,noreferrer')) showToast('Pop-up blocked');
      } else if (href.startsWith('/') || href.startsWith('mailto:')) {
        W.location.assign(href);
      }
    }
  };

  const findItem = (e) => e.target?.closest?.('.cmd-item');
  const syncHoveredOrFocused = (e) => {
    const item = findItem(e);
    if (!item || item.hidden) return;
    const idx = getVisible().indexOf(item);
    if (idx !== -1 && idx !== activeIndex) setSelected(idx, false);
  };

  D.addEventListener('keydown', (event) => {
    if (!isOpen()) return;
    const k = event.key;

    if (k === 'Tab') {
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

    if (k === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End') {
      const onItem = Boolean(D.activeElement?.closest?.('.cmd-item'));
      if ((k === 'Home' || k === 'End') && !onItem) return;
      event.preventDefault();
      const visible = getVisible();
      if (!visible.length) return;
      const targetIndex =
        k === 'Home'
          ? 0
          : k === 'End'
            ? visible.length - 1
            : activeIndex + (k === 'ArrowDown' ? 1 : -1);
      setSelected(targetIndex, true);
      if (onItem && activeIndex >= 0 && visible[activeIndex]) {
        visible[activeIndex].focus(NO_SCROLL);
      }
      return;
    }

    if (k === 'Enter' && D.activeElement === input) {
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
    const item = findItem(e);
    if (item && !item.hidden) runItem(item);
  });
  const closeTrue = () => closeMenu(true);
  closeBtn?.addEventListener('click', closeTrue);
  backdrop.addEventListener('click', closeTrue);

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
