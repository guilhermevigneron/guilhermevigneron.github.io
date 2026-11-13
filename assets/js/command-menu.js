(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const backdrop = byId('command-backdrop');
  const dialog = byId('command-dialog');
  const triggers = [...document.querySelectorAll('#command-trigger, #command-trigger-mobile')];
  const closeBtn = byId('command-close');
  const input = byId('command-input');
  const list = dialog?.querySelector('.cmd-list');
  const emptyState = byId('command-empty');
  const modifierEl = byId('command-modifier');

  if (!backdrop || !dialog || !input || !list || !emptyState) return;

  const items = [...dialog.querySelectorAll('.cmd-item')];
  const groups = [...dialog.querySelectorAll('.cmd-group')];
  let lastFocused = null;
  let activeIndex = -1;

  if (modifierEl && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)) {
    modifierEl.textContent = '\u2318';
  }

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
      group.querySelectorAll('.cmd-item').forEach((item) => {
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
    lastFocused = document.activeElement;
    input.value = '';
    filterItems('');
    list.scrollTop = 0;
    backdrop.hidden = false;
    dialog.hidden = false;
    setExpanded(true);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    input.focus({ preventScroll: true });
  };

  const closeMenu = (restore) => {
    if (!isOpen()) return;
    backdrop.hidden = true;
    dialog.hidden = true;
    setExpanded(false);
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    if (restore && lastFocused instanceof HTMLElement && document.contains(lastFocused)) {
      lastFocused.focus({ preventScroll: true });
    }
  };

  const runItem = (item) => {
    if (!item) return;
    const action = item.getAttribute('data-action');
    const href = item.getAttribute('data-href');
    const external = item.getAttribute('data-external') === 'true';

    if (action === 'print') {
      const target = lastFocused;
      closeMenu(false);
      if (target instanceof HTMLElement && document.contains(target)) {
        window.addEventListener(
          'afterprint',
          () => document.contains(target) && target.focus({ preventScroll: true }),
          { once: true }
        );
      }
      setTimeout(() => window.print(), 20);
      return;
    }

    if (action === 'toggle-theme') {
      byId('theme-toggle')?.click();
      closeMenu(true);
      return;
    }

    if (href) {
      closeMenu(true);
      if (external) {
        window.open(href, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = href;
      }
    }
  };

  const syncHoveredOrFocused = (event) => {
    const item = event.target instanceof Element ? event.target.closest('.cmd-item') : null;
    if (!item || item.hidden) return;
    const idx = getVisible().indexOf(item);
    if (idx !== -1 && idx !== activeIndex) setSelected(idx, false);
  };

  document.addEventListener('keydown', (event) => {
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
      const cur = focusables.indexOf(document.activeElement);
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
      const onItem =
        document.activeElement instanceof Element && Boolean(document.activeElement.closest('.cmd-item'));
      setSelected(activeIndex + (event.key === 'ArrowDown' ? 1 : -1), true);
      if (onItem) {
        const visible = getVisible();
        if (activeIndex >= 0 && visible[activeIndex]) {
          visible[activeIndex].focus({ preventScroll: true });
        }
      }
      return;
    }

    if (event.key === 'Enter' && document.activeElement === input) {
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
