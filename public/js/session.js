// MyScene — shared session helpers (Batch 2 auth).
//
// The API sets an httpOnly myscene_session cookie on /login; this script
// never sees the cookie value itself — it only calls GET /me (the browser
// sends the cookie) and caches the account in sessionStorage so the nav
// can render before the /me round-trip finishes.
//
// Exposes window.mysceneSession:
//   getMe()    -> Promise<{username, is_admin, artist_status} | null>
//   logout()   -> Promise<void> (POST /logout + clears the cache + nav)
//   cachedMe() -> {username, ...} | null  (sessionStorage cache)
//
// Loaded as a plain script (like ui.js and track.js) BEFORE each page's
// main script. It must never break the page: every failure path is
// swallowed.
(function () {
    "use strict";

    // Same convention as track.js/status.js: an override hook, then the
    // production host.
    var API_BASE = (typeof window !== "undefined" && window.MYSCENE_API_BASE)
        ? String(window.MYSCENE_API_BASE).replace(/\/+$/, "")
        : "https://api.myscene.live";

    var CACHE_KEY = "myscene_me";

    function cachedMe() {
        try {
            var raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var me = JSON.parse(raw);
            return me && typeof me.username === "string" ? me : null;
        } catch (err) {
            return null;
        }
    }

    function cacheMe(me) {
        try {
            if (me) sessionStorage.setItem(CACHE_KEY, JSON.stringify(me));
            else sessionStorage.removeItem(CACHE_KEY);
        } catch (err) { /* storage unavailable (private mode) — degrade to no cache */ }
    }

    /**
     * GET /me with the session cookie; null when logged out. On a network
     * failure (API unreachable) the cache is the fallback so a flaky
     * network does not log the user out of the UI.
     */
    function getMe() {
        return fetch(API_BASE + "/me", { credentials: "include" })
            .then(function (response) {
                if (response.status === 401 || response.status === 404) {
                    cacheMe(null);
                    return null;
                }
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.json().then(function (me) {
                    cacheMe(me);
                    return me;
                });
            })
            .catch(function () {
                return cachedMe();
            });
    }

    function logout() {
        var done = fetch(API_BASE + "/logout", {
            method: "POST",
            credentials: "include",
        }).catch(function () { /* the cookie is cleared client-side anyway */ });
        cacheMe(null);
        return done.then(function () { renderNav(cachedMe()); });
    }

    // ---------- nav rendering ----------
    // Every "Log In" link (navRight + mobile navMenu) is replaced with
    // "Hi, {username}" + a Log out button when logged in, and restored to
    // the plain link otherwise.

    var slots = [];
    var rendered = [];

    function collectSlots() {
        document.querySelectorAll("a.loginLink").forEach(function (link) {
            slots.push({
                parent: link.parentElement,
                next: link.nextElementSibling,
                href: link.getAttribute("href") || "login.html",
            });
            link.remove();
        });
    }

    function navNode(me, slot) {
        if (!me) {
            var a = document.createElement("a");
            a.className = "loginLink";
            a.href = slot.href;
            a.textContent = "Log In";
            return a;
        }
        var wrap = document.createElement("span");
        wrap.className = "navUser";

        var hi = document.createElement("span");
        hi.className = "navUserHi";
        hi.textContent = "Hi, " + me.username;

        var out = document.createElement("button");
        out.type = "button";
        out.className = "loginLink logoutLink";
        out.textContent = "Log out";
        out.addEventListener("click", function () {
            var menu = document.querySelector(".navMenu");
            if (menu) menu.classList.remove("open");
            out.disabled = true;
            logout().finally(function () { out.disabled = false; });
        });

        wrap.appendChild(hi);
        wrap.appendChild(out);
        return wrap;
    }

    function renderNav(me) {
        rendered.forEach(function (node) { node.remove(); });
        rendered = [];
        slots.forEach(function (slot) {
            var node = navNode(me, slot);
            if (slot.next && slot.next.parentNode === slot.parent) {
                slot.parent.insertBefore(node, slot.next);
            } else {
                slot.parent.appendChild(node);
            }
            rendered.push(node);
        });
    }

    // ---------- admin link (Batch 3) ----------
    // The footer "Admin" link (a.adminLink) is hidden by default in the
    // HTML and only revealed when /me says is_admin:true — the dashboard
    // is invisible to everyone else (no nav link, and the page itself
    // redirects non-admins home).
    function renderAdminLinks(me) {
        document.querySelectorAll("a.adminLink").forEach(function (link) {
            link.hidden = !(me && me.is_admin === true);
        });
    }

    function boot() {
        if (slots.length === 0) collectSlots();
        renderAdminLinks(cachedMe()); // instant from the sessionStorage cache
        if (slots.length === 0) {
            // Page without a login link: still refresh the admin link.
            getMe().then(renderAdminLinks);
            return;
        }
        renderNav(cachedMe()); // instant from the sessionStorage cache
        getMe().then(function (me) { // authoritative refresh
            renderNav(me);
            renderAdminLinks(me);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }

    window.mysceneSession = {
        getMe: getMe,
        logout: logout,
        cachedMe: cachedMe,
        renderNav: renderNav,
    };
})();
