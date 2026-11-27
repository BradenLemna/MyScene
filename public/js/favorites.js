// Server-side favorites (Batch 5).
//
// This module owns the whole favorite feature for any page:
//   - loads the signed-in user's favorites once per page-load (cached in memory),
//   - syncs every .cardHeart button (and the profile heart) against that cache,
//   - toggles a favorite through the API (session-gated by the server),
//   - redirects to login when a guest clicks a heart (never fails silently),
//   - fires the existing `fav_toggle` analytics event on every successful toggle.
//
// Cards render their heart markup inline (see index.js / pages/myFavorites.html)
// by using the .cardHeart class + data-heart-artist="<artist name>".
import * as apiCalls from "./api.js";

const FAV_TOGGLE_DETAIL = (name) => `artist:${name}`;

let favoriteNames = new Set(); // names of the current user's favorites
let favoriteArtists = [];      // the cached full rows (for the favorites page)
let loadOk = null;             // null until the first load settles
let loadStatus = null;         // the HTTP status of a failed load (null when ok)
let loadPromise = null;        // shared in-flight load (cached for the page)

// Relative path to the login page from wherever this page lives.
function loginHref() {
    return window.location.pathname.includes("/pages/") ? "login.html" : "pages/login.html";
}

function toast(message, kind = "info") {
    if (typeof window.showToast === "function") window.showToast(message, kind);
    else alert(message);
}

function track(event, detail) {
    if (typeof window.trackEvent === "function") window.trackEvent(event, detail);
}

async function loadFavorites() {
    try {
        const list = await apiCalls.getFavorites();
        favoriteArtists = Array.isArray(list) ? list : [];
        favoriteNames = new Set(
            favoriteArtists.map((a) => a?.artist_name).filter(Boolean)
        );
        loadOk = true;
    } catch (err) {
        // 401/404/network — not logged in or offline. Clicking a heart still
        // redirects to login (see toggleFavorite).
        console.warn("Favorites unavailable:", err);
        favoriteArtists = [];
        favoriteNames = new Set();
        loadOk = false;
        loadStatus = err?.status ?? null;
    }
    return favoriteNames;
}

// Kick off the load as soon as the module boots; everyone awaits the same
// promise so a page doesn't fetch favorites twice.
loadPromise = loadFavorites();

/** Promise — resolves once the shared load settles. */
export function getFavoritesReady() {
    return loadPromise.then(() => loadOk);
}

/** The HTTP status that doomed the load (guest 401, 404, null) — null when ok. */
export function getLoadStatus() {
    return loadStatus;
}

/** The cached full artist rows (cheap — already loaded by this module). */
export function getCachedFavoriteArtists() {
    return favoriteArtists;
}

/** Whether the page is signed in (the load succeeded). Used by the favorites page. */
export function isSignedIn() {
    return loadOk === true;
}

/** Promise<Set<string>> — the current user's favorited artist names. */
export function getFavoriteNames() {
    return loadPromise;
}

/** Sync every .cardHeart button (and the profile heart) against the cache. */
export function syncHeartButtons(root = document) {
    const scope = root ?? document;
    scope.querySelectorAll("[data-heart-artist]").forEach((btn) => {
        const isFav = favoriteNames.has(btn.dataset.heartArtist);
        btn.classList.toggle("active", isFav);
        btn.setAttribute("aria-pressed", String(isFav));
    });
}

/**
 * Toggles one favorite; fires the fav_toggle analytics event on success and
 * syncs every heart on the page. Guests are redirected to login.
 * Returns the new state (true/false), or null if the click was not handled
 * (guest redirect or request failure).
 */
export async function toggleFavorite(name) {
    await loadPromise;
    try {
        const result = await apiCalls.toggleFavorite(name);
        const favorited = result?.favorited === true;
        if (favorited) favoriteNames.add(name);
        else favoriteNames.delete(name);
        // Keep the cached rows in step with the toggle (used by the favorites page).
        if (favorited && !favoriteArtists.some((a) => a?.artist_name === name)) {
            favoriteArtists = [...favoriteArtists, { artist_name: name }];
        } else if (!favorited) {
            favoriteArtists = favoriteArtists.filter((a) => a?.artist_name !== name);
        }
        track("fav_toggle", FAV_TOGGLE_DETAIL(name));
        syncHeartButtons();
        return favorited;
    } catch (err) {
        if (err?.status === 401) {
            // Guests: redirect to login — never a silent failure.
            window.location.href = loginHref();
            return null;
        }
        console.error("Couldn't toggle favorite:", err);
        toast("Couldn't update the favorite — check your connection and try again.", "error");
        return null;
    }
}

/** Attach click handling to every .cardHeart button under `root`. */
export function wireHeartButtons(root = document) {
    const scope = root ?? document;
    scope.querySelectorAll("[data-heart-artist]").forEach((btn) => {
        if (btn.dataset.wired === "1") return;
        btn.dataset.wired = "1";
        btn.addEventListener("click", async (e) => {
            // The card behind the heart must not open the modal/profile.
            e.stopPropagation();
            const name = btn.dataset.heartArtist;
            if (!name) return;
            btn.disabled = true; // until the API answers (single-flight)
            try {
                await toggleFavorite(name);
            } finally {
                btn.disabled = false;
            }
        });
    });
    syncHeartButtons(scope);
}

/** Whether the current user has favorited `name` (from the cached load). */
export async function isFavorite(name) {
    await loadPromise;
    return favoriteNames.has(name);
}

// After the initial load resolves, sync every heart already on the page
// (cards rendered before the cache finished loading).
loadPromise.then(() => syncHeartButtons());
