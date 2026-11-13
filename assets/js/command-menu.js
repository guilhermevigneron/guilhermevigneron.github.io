(function () {
  'use strict';

  var backdrop = document.getElementById('command-backdrop');
  var dialog = document.getElementById('command-dialog');
  var triggers = Array.prototype.slice.call(
    document.querySelectorAll('#command-trigger, #command-trigger-mobile')
  );
  var closeBtn = document.getElementById('command-close');
  var input = document.getElementById('command-input');
  var list = dialog ? dialog.querySelector('.cmd-list') : null;
  var emptyState = document.getElementById('command-empty');
  var modifierEl = document.getElementById('command-modifier');

  if (!backdrop || !dialog || !input || !list || !emptyState) {
    return;
  }

  var items = Array.prototype.slice.call(dialog.querySelectorAll('.cmd-item'));
  var groups = Array.prototype.slice.call(dialog.querySelectorAll('.cmd-group'));
  var lastFocused = null;
  var activeIndex = -1;

  if (modifierEl && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)) {
    modifierEl.textContent = '\u2318';
  }

  function isOpen() {
    return !dialog.hidden;
  }

  function setExpanded(expanded) {
    triggers.forEach(function (btn) {
      btn.setAttribute('aria-expanded', String(expanded));
    });
  }

  function getVisibleItems() {
    return items.filter(function (item) {
      return !item.hidden;
    });
  }

  function getFocusableElements() {
    var focusables = [input];
    if (closeBtn && !closeBtn.hidden) {
      focusables.push(closeBtn);
    }
    return focusables.concat(getVisibleItems());
  }

  function setSelected(index, shouldScroll) {
    var visible = getVisibleItems();
    items.forEach(function (item) {
      item.setAttribute('data-selected', 'false');
    });

    if (visible.length === 0) {
      activeIndex = -1;
      return;
    }

    var clamped = ((index % visible.length) + visible.length) % visible.length;
    activeIndex = clamped;
    visible[clamped].setAttribute('data-selected', 'true');
    if (shouldScroll) {
      visible[clamped].scrollIntoView({ block: 'nearest' });
    }
  }

  function filterItems(query) {
    var normalized = query.trim().toLowerCase();
    var anyVisible = false;

    groups.forEach(function (group) {
      var groupItems = Array.prototype.slice.call(group.querySelectorAll('.cmd-item'));
      var groupVisibleCount = 0;

      groupItems.forEach(function (item) {
        var label = (item.getAttribute('data-label') || item.textContent || '').toLowerCase();
        var match = !normalized || label.indexOf(normalized) !== -1;
        item.hidden = !match;
        if (match) {
          groupVisibleCount += 1;
          anyVisible = true;
        }
      });

      group.hidden = groupVisibleCount === 0;
    });

    emptyState.hidden = anyVisible;
    setSelected(0, false);
  }

  function openMenu() {
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
  }

  function closeMenu(restoreFocus) {
    if (!isOpen()) {
      return;
    }
    backdrop.hidden = true;
    dialog.hidden = true;
    setExpanded(false);
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    if (restoreFocus && lastFocused instanceof HTMLElement && document.contains(lastFocused)) {
      lastFocused.focus({ preventScroll: true });
    }
  }

  function runItem(item) {
    if (!item) {
      return;
    }
    var action = item.getAttribute('data-action');
    var href = item.getAttribute('data-href');
    var external = item.getAttribute('data-external') === 'true';

    if (action === 'print') {
      closeMenu(false);
      window.setTimeout(function () {
        window.print();
      }, 20);
      return;
    }

    if (action === 'toggle-theme') {
      var themeToggle = document.getElementById('theme-toggle');
      if (themeToggle) {
        themeToggle.click();
      }
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
  }

  document.addEventListener('keydown', function (event) {
    if (event.key.toLowerCase() === 'j' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (isOpen()) {
        closeMenu(true);
      } else {
        openMenu();
      }
      return;
    }

    if (!isOpen()) {
      return;
    }

    if (event.key === 'Tab') {
      var focusables = getFocusableElements();
      if (focusables.length === 0) {
        return;
      }
      var currentIdx = focusables.indexOf(document.activeElement);
      var nextIdx;
      if (event.shiftKey) {
        nextIdx = currentIdx <= 0 ? focusables.length - 1 : currentIdx - 1;
      } else {
        nextIdx = currentIdx === -1 || currentIdx >= focusables.length - 1 ? 0 : currentIdx + 1;
      }
      event.preventDefault();
      focusables[nextIdx].focus();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected(activeIndex + 1, true);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(activeIndex - 1, true);
      return;
    }

    if (event.key === 'Enter' && document.activeElement === input) {
      var visible = getVisibleItems();
      if (activeIndex >= 0 && visible[activeIndex]) {
        event.preventDefault();
        runItem(visible[activeIndex]);
      }
    }
  });

  input.addEventListener('input', function () {
    filterItems(input.value);
  });

  list.addEventListener('pointerover', function (event) {
    if (event.pointerType === 'touch') {
      return;
    }
    var item = event.target instanceof Element ? event.target.closest('.cmd-item') : null;
    if (!item || item.hidden) {
      return;
    }
    var visible = getVisibleItems();
    var idx = visible.indexOf(item);
    if (idx !== -1 && idx !== activeIndex) {
      setSelected(idx, false);
    }
  });

  list.addEventListener('click', function (event) {
    var item = event.target instanceof Element ? event.target.closest('.cmd-item') : null;
    if (item && !item.hidden) {
      runItem(item);
    }
  });

  triggers.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (isOpen()) {
        closeMenu(true);
      } else {
        openMenu();
      }
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      closeMenu(true);
    });
  }

  backdrop.addEventListener('click', function () {
    closeMenu(true);
  });
})();
