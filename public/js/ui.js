/*
  File Name: ui.js
  MyScene — shared UI helpers.
  Toasts, ambient starfield, mobile nav toggle, and scroll reveals.
  Plain classic script (no imports) so it works on both module and
  non-module pages. Loaded before the page script on every page.
*/
(function () {
  'use strict';

  // Mark JS availability so CSS can safely gate progressive-enhancement
  // styles (e.g. hidden-until-revealed sections).
  document.documentElement.classList.add('js');

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

  // ---------- ambient starfield ----------
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

  // ---------- mobile nav toggle ----------
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

  // ---------- boot ----------
  function boot() {
    spawnStars();
    initNav();
    initReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
