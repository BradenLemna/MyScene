/*
  File Name: ui.js
  MyScene — shared UI helpers.
  Toasts, ambient starfield, mobile nav toggle, scroll reveals, and the
  Windows 98 desktop chrome (desktop icons, taskbar, Start menu, live
  clock, About dialog).
  Plain classic script (no imports) so it works on both module and
  non-module pages. Loaded before the page script on every page.
*/
(function () {
  'use strict';

  // Mark JS availability so CSS can safely gate progressive-enhancement
  // styles (e.g. hidden-until-revealed sections).
  document.documentElement.classList.add('js');

  // Root path prefix: '' on the homepage, '../' on pages/*.html. Pages set
  // data-root on <body>; the desktop chrome uses it to build correct links.
  var ROOT = (document.body && document.body.getAttribute('data-root')) || '';
  var PAGE = (document.body && document.body.getAttribute('data-page')) || 'index';

  // ---------- toasts ----------
  var stack = null;

  function ensureStack() {
    if (stack && document.body.contains(stack)) return stack;
    stack = document.createElement('div');
    stack.className = 'toastStack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
    return stack;
  }

  function dismissToast(toast) {
    if (toast.dataset.leaving) return;
    toast.dataset.leaving = '1';
    toast.classList.add('leaving');
    setTimeout(function () { toast.remove(); }, 320);
  }

  /**
   * showToast(message, kind) — kind: 'info' | 'success' | 'error'
   * Modern replacement for the old alert() calls.
   */
  function showToast(message, kind) {
    if (kind !== 'success' && kind !== 'error') kind = 'info';
    var el = ensureStack();
    var toast = document.createElement('div');
    toast.className = 'toast ' + kind;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    var msg = document.createElement('div');
    msg.className = 'toastMsg';
    msg.textContent = message;

    var close = document.createElement('button');
    close.className = 'toastClose';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.innerHTML = '&times;';
    close.addEventListener('click', function () { dismissToast(toast); });

    toast.appendChild(msg);
    toast.appendChild(close);
    el.appendChild(toast);

    // Cap the stack so rapid failures don't pile up.
    while (el.children.length > 4) {
      el.firstElementChild.remove();
    }
    setTimeout(function () { dismissToast(toast); }, 4600);
  }
  window.showToast = showToast;

  // ---------- ambient starfield (hidden in the Win98 theme, kept for parity) ----------
  function spawnStars() {
    var field = document.querySelector('.starfield');
    if (!field || field.dataset.spawned) return;
    field.dataset.spawned = '1';

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var count = window.innerWidth < 640 ? 34 : 64;

    for (var i = 0; i < count; i++) {
      var s = document.createElement('span');
      if (Math.random() < 0.18) s.classList.add('big');
      s.style.top = (Math.random() * 100).toFixed(2) + '%';
      s.style.left = (Math.random() * 100).toFixed(2) + '%';
      s.style.animationDelay = (Math.random() * 3.2).toFixed(2) + 's';
      s.style.opacity = (0.25 + Math.random() * 0.75).toFixed(2);
      var tint = Math.random();
      if (tint < 0.12) s.style.background = '#ff9fd8';
      else if (tint < 0.24) s.style.background = '#9deeff';
      if (reduce) s.style.animation = 'none';
      field.appendChild(s);
    }
  }
  window.spawnStars = spawnStars;

  // ---------- mobile nav toggle (kept for parity; the Win98 toolbar is always visible) ----------
  function initNav() {
    var toggle = document.querySelector('.navToggle');
    var menu = document.querySelector('.navMenu');
    if (!toggle || !menu) return;

    function setMenu(open) {
      menu.classList.toggle('open', open);
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
    }

    toggle.addEventListener('click', function () {
      setMenu(!menu.classList.contains('open'));
    });

    // Close after choosing a destination.
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  // ---------- scroll reveal ----------
  function initReveals() {
    var els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('revealed'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });

    els.forEach(function (el) { io.observe(el); });
  }

  // ---------- desktop icons ----------
  var DESKTOP_ICONS = [
    { href: ROOT + 'index.html', label: 'MyScene', img: ROOT + 'assets/icons/mySceneLogo.png', emoji: '\u{1F3B5}' },
    { href: ROOT + 'pages/addArtist.html', label: 'Add Artist', emoji: '\u{1F3B8}' },
    { href: ROOT + 'pages/login.html', label: 'Log In', emoji: '\u{1F511}' },
    { href: ROOT + 'pages/register.html', label: 'New Account', emoji: '\u270D\uFE0F' }
  ];

  function initDesktopIcons() {
    var desktop = document.querySelector('.desktop');
    if (!desktop || desktop.querySelector('.desktopIcons')) return;

    var wrap = document.createElement('div');
    wrap.className = 'desktopIcons';
    wrap.setAttribute('aria-label', 'Desktop');

    DESKTOP_ICONS.forEach(function (icon) {
      var a = document.createElement('a');
      a.className = 'deskIcon';
      a.href = icon.href;
      a.title = icon.label;

      var ico = document.createElement('span');
      if (icon.img) {
        var im = document.createElement('img');
        im.className = 'ico';
        im.src = icon.img;
        im.alt = '';
        im.onerror = function () {
          var sp = document.createElement('span');
          sp.className = 'ico emoji';
          sp.textContent = icon.emoji;
          im.replaceWith(sp);
        };
        ico = im;
      } else {
        ico.className = 'ico emoji';
        ico.textContent = icon.emoji;
      }

      var label = document.createElement('span');
      label.className = 'label';
      label.textContent = icon.label;

      a.appendChild(ico);
      a.appendChild(label);
      wrap.appendChild(a);
    });

    desktop.insertBefore(wrap, desktop.firstChild);
  }

  // ---------- taskbar + Start menu + clock ----------
  var PAGE_LABELS = {
    index: 'MyScene',
    login: 'Log In',
    register: 'Create Account',
    addArtist: 'Add Artist',
    viewArtist: 'Artist Profile'
  };

  function formatClock(d) {
    var h = d.getHours();
    var m = d.getMinutes();
    var ap = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    var mm = m < 10 ? '0' + m : '' + m;
    return h + ':' + mm + ' ' + ap;
  }

  function initTaskbar() {
    if (document.querySelector('.taskbar')) return;

    var bar = document.createElement('div');
    bar.className = 'taskbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Taskbar');

    // Start button
    var start = document.createElement('button');
    start.type = 'button';
    start.className = 'startBtn';
    start.setAttribute('aria-haspopup', 'true');
    start.setAttribute('aria-expanded', 'false');
    var startLogo = document.createElement('img');
    startLogo.className = 'startLogo';
    startLogo.src = ROOT + 'assets/icons/mySceneLogo.png';
    startLogo.alt = '';
    startLogo.onerror = function () {
      var sp = document.createElement('span');
      sp.className = 'startLogo';
      sp.textContent = '\u{1F3B5}';
      sp.style.fontSize = '14px';
      startLogo.replaceWith(sp);
    };
    var startLabel = document.createElement('span');
    startLabel.textContent = 'Start';
    start.appendChild(startLogo);
    start.appendChild(startLabel);

    // Task area (current page)
    var taskArea = document.createElement('div');
    taskArea.className = 'taskArea';
    var task = document.createElement('button');
    task.type = 'button';
    task.className = 'taskBtn active';
    task.setAttribute('aria-pressed', 'true');
    var taskIco = document.createElement('span');
    taskIco.className = 'trayIcon';
    taskIco.textContent = '\u{1F3B5}';
    var taskLabel = document.createElement('span');
    taskLabel.textContent = PAGE_LABELS[PAGE] || 'MyScene';
    task.appendChild(taskIco);
    task.appendChild(taskLabel);
    taskArea.appendChild(task);

    // System tray with live clock
    var tray = document.createElement('div');
    tray.className = 'tray';
    tray.setAttribute('role', 'status');
    var trayIco = document.createElement('span');
    trayIco.className = 'trayIcon';
    trayIco.textContent = '\u{1F50A}';
    var clock = document.createElement('span');
    clock.className = 'clock';
    clock.textContent = formatClock(new Date());
    tray.appendChild(trayIco);
    tray.appendChild(clock);

    bar.appendChild(start);
    bar.appendChild(taskArea);
    bar.appendChild(tray);
    document.body.appendChild(bar);

    // Live clock (Win98 shows HH:MM AM/PM; refresh every second so the
    // minute always rolls over on time).
    setInterval(function () {
      clock.textContent = formatClock(new Date());
    }, 1000);

    // Start menu
    var menu = document.createElement('div');
    menu.className = 'startMenu';
    menu.setAttribute('role', 'menu');

    var side = document.createElement('div');
    side.className = 'startMenuSide';
    side.textContent = 'MyScene 98';
    menu.appendChild(side);

    var items = document.createElement('div');
    items.className = 'startMenuItems';

    function addItem(href, ico, label, isAbout) {
      var a = document.createElement('a');
      a.className = 'startMenuItem';
      if (isAbout) { a.href = '#'; a.setAttribute('data-about', ''); }
      else { a.href = href; }
      var i = document.createElement('span');
      i.className = 'ico';
      i.textContent = ico;
      var t = document.createElement('span');
      t.textContent = label;
      a.appendChild(i);
      a.appendChild(t);
      items.appendChild(a);
      return a;
    }
    function addDivider() {
      var d = document.createElement('div');
      d.className = 'startMenuDivider';
      items.appendChild(d);
    }

    addItem(ROOT + 'index.html', '\u{1F3B5}', 'MyScene');
    addItem(ROOT + 'pages/addArtist.html', '\u{1F3B8}', 'Add Artist');
    addItem(ROOT + 'pages/login.html', '\u{1F511}', 'Log In');
    addDivider();
    addItem(ROOT + 'pages/register.html', '\u270D\uFE0F', 'Create Account');
    addDivider();
    addItem('#', '\u2139\uFE0F', 'About MyScene', true);

    menu.appendChild(items);
    document.body.appendChild(menu);

    function setStart(open) {
      menu.classList.toggle('open', open);
      start.classList.toggle('open', open);
      start.setAttribute('aria-expanded', String(open));
    }

    start.addEventListener('click', function (e) {
      e.stopPropagation();
      setStart(!menu.classList.contains('open'));
    });

    // Close on outside click / Escape / choosing an item.
    document.addEventListener('click', function (e) {
      if (menu.classList.contains('open') &&
          !menu.contains(e.target) && !start.contains(e.target)) {
        setStart(false);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        setStart(false);
        start.focus();
      }
    });
    items.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setStart(false); });
    });
  }

  // ---------- About dialog ----------
  function initAbout() {
    var aboutLinks = document.querySelectorAll('[data-about]');
    if (!aboutLinks.length) return;

    var dialog = null;

    function build() {
      if (dialog) return dialog;
      dialog = document.createElement('div');
      dialog.className = 'modalOverlay';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'aboutTitle');

      var card = document.createElement('div');
      card.className = 'modalCard';
      card.style.maxWidth = '400px';

      var tb = document.createElement('div');
      tb.className = 'titleBar';
      tb.innerHTML =
        '<span class="titleBarIcon emoji" aria-hidden="true">\u2139\uFE0F</span>' +
        '<span class="titleBarText" id="aboutTitle">About MyScene</span>' +
        '<span class="titleBarButtons"><button class="modalClose" type="button" aria-label="Close">&times;</button></span>';

      var body = document.createElement('div');
      body.className = 'dialogBody';
      body.style.textAlign = 'center';

      var logo = document.createElement('img');
      logo.src = ROOT + 'assets/icons/mySceneLogo.png';
      logo.alt = '';
      logo.style.cssText = 'width:64px;height:64px;image-rendering:pixelated;margin:0 auto 10px;display:block;';
      logo.onerror = function () { logo.style.display = 'none'; };

      var h = document.createElement('div');
      h.style.cssText = 'font-family:var(--font-pixel);font-size:22px;font-weight:700;color:var(--w98-navy);';
      h.textContent = 'MyScene';

      var p1 = document.createElement('p');
      p1.style.cssText = 'margin:10px 0 4px;font-size:12px;';
      p1.textContent = 'Find your people. Grow the scene.';

      var p2 = document.createElement('p');
      p2.style.cssText = 'margin:0 0 16px;font-family:var(--font-mono);font-size:11px;color:var(--w98-shadow-dark);';
      p2.textContent = 'A local-scene directory.';

      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'btn pink';
      ok.style.cssText = 'width:auto;min-width:120px;margin:0 auto;display:inline-flex;';
      ok.textContent = 'OK';
      ok.addEventListener('click', close);

      body.appendChild(logo);
      body.appendChild(h);
      body.appendChild(p1);
      body.appendChild(p2);
      body.appendChild(ok);
      card.appendChild(tb);
      card.appendChild(body);
      dialog.appendChild(card);

      tb.querySelector('.modalClose').addEventListener('click', close);
      dialog.addEventListener('click', function (e) {
        if (e.target === dialog) close();
      });

      function close() {
        dialog.classList.remove('open');
        document.body.style.overflow = '';
      }

      document.body.appendChild(dialog);
      return dialog;
    }

    function open() {
      var d = build();
      d.classList.add('open');
      document.body.style.overflow = 'hidden';
      var btn = d.querySelector('.modalClose');
      if (btn) btn.focus();
    }

    aboutLinks.forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        open();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dialog && dialog.classList.contains('open')) {
        dialog.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  }

  // ---------- boot ----------
  function boot() {
    spawnStars();
    initNav();
    initReveals();
    initDesktopIcons();
    initTaskbar();
    initAbout();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
