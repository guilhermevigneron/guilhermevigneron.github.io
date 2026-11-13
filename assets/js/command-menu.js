(function () {
  'use strict';

  var backdrop = document.getElementById('command-backdrop');
  var dialog = document.getElementById('command-dialog');
  var trigger = document.getElementById('command-trigger');
  var closeBtn = document.getElementById('command-close');
  var input = document.getElementById('command-input');
  var emptyState = document.getElementById('command-empty');
  var modifierEl = document.getElementById('command-modifier');

  if (!backdrop || !dialog || !input || !emptyState) {
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

  function getVisibleItems() {
    return items.filter(function (item) {
      return !item.hidden;
    });
  }

  function setSelected(index) {
    var visible = getVisibleItems();
    items.forEach(function (item) {
      item.setAttribute('aria-selected', 'false');
    });

    if (visible.length === 0) {
      activeIndex = -1;
      return;
    }

    var clamped = ((index % visible.length) + visible.length) % visible.length;
    activeIndex = clamped;
    visible[clamped].setAttribute('aria-selected', 'true');
    visible[clamped].scrollIntoView({ block: 'nearest' });
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
    setSelected(0);
  }

  function openMenu() {
    lastFocused = document.activeElement;
    input.value = '';
    filterItems('');
    backdrop.hidden = false;
    dialog.hidden = false;
    document.body.style.overflow = 'hidden';
    input.focus();
  }

  function closeMenu(restoreFocus) {
    if (!isOpen()) {
      return;
    }
    backdrop.hidden = true;
    dialog.hidden = true;
    document.body.style.overflow = '';
    if (restoreFocus && lastFocused instanceof HTMLElement) {
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

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected(activeIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(activeIndex - 1);
      return;
    }

    if (event.key === 'Enter') {
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

  items.forEach(function (item) {
    item.addEventListener('mouseenter', function () {
      var visible = getVisibleItems();
      var idx = visible.indexOf(item);
      if (idx !== -1) {
        setSelected(idx);
      }
    });

    item.addEventListener('click', function () {
      runItem(item);
    });
  });

  if (trigger) {
    trigger.addEventListener('click', openMenu);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      closeMenu(true);
    });
  }

  backdrop.addEventListener('click', function () {
    closeMenu(true);
  });
})();
