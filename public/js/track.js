// Lightweight privacy-friendly analytics (EXP-002).
//
// One small beacon per event to our own API — no cookies, no persistent
// identifiers, no cross-site tracking, no third-party tracker domains.
// The backend stores only {page, event, detail, timestamp} (see
// api/db/track_event.php) and the query cookbook lives in docs/METRICS.md.
//
// Loaded as a plain script BEFORE each page's main script, so
// window.trackEvent is available to modules and classic scripts alike.
// It must never break the page: every failure path is swallowed.
(function () {
    "use strict";

    // Same convention as status.js: an override hook, then the production host.
    var API_BASE = (typeof window !== "undefined" && window.MYSCENE_API_BASE)
        ? String(window.MYSCENE_API_BASE).replace(/\/+$/, "")
        : "https://api.myscene.live";

    var TRACK_URL = API_BASE + "/track";
    var PAGE = document.body
        ? (document.body.dataset.page || "unknown")
        : "unknown";

    function send(payload) {
        var body = JSON.stringify(payload);
        try {
            if (navigator.sendBeacon &&
                navigator.sendBeacon(TRACK_URL,
                    new Blob([body], { type: "application/json" }))) {
                return;
            }
        } catch (err) { /* fall through to the fetch fallback */ }
        try {
            fetch(TRACK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: body,
                keepalive: true,
            }).catch(function () { /* analytics must never break the page */ });
        } catch (err) { /* same */ }
    }

    window.trackEvent = function trackEvent(event, detail) {
        send({
            page: PAGE,
            event: String(event),
            detail: detail ? String(detail).slice(0, 60) : "",
        });
    };

    // One pageview per load, as early as the DOM is available.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            window.trackEvent("pageview");
        });
    } else {
        window.trackEvent("pageview");
    }
})();
