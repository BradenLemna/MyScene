// Global API health probe (EXP-001b / UX-13).
//
// One shared check per page load: if the API host is unreachable (the 502
// the site shipped on 2026-10-19), the page shows a single offline banner
// and each section renders an honest offline state instead of failing
// silently or falling back to fake data.
//
// Probes GET / on the API base, which returns
// {"status":"ok","service":"myscene-api"} when the Node service is up.
const API_BASE = (typeof window !== "undefined" && window.MYSCENE_API_BASE)
    ? String(window.MYSCENE_API_BASE).replace(/\/+$/, "")
    : "https://api.myscene.live";

let healthPromise = null;

// EXP-002: count the offline notice once per page load, even if the banner
// function is called more than once.
let bannerTracked = false;

export function checkApiHealth() {
    if (!healthPromise) {
        healthPromise = fetch(`${API_BASE}/`, { method: "GET" })
            .then(res => res.ok)
            .catch(() => false);
    }
    return healthPromise;
}

export function showOfflineBanner() {
    const banner = document.getElementById("apiOfflineBanner");
    if (banner) banner.hidden = false;

    // EXP-002: one offline_notice_shown event per page load.
    if (!bannerTracked) {
        bannerTracked = true;
        if (typeof window.trackEvent === "function") {
            window.trackEvent("offline_notice_shown");
        }
    }
}
