// Dynamic view-artist page — loads the artist row and its events from the
// MyScene API (see api/server). The artist name comes from
// the ?artist= query parameter.
import * as apiCalls from "../js/api.js";
import { checkApiHealth, showOfflineBanner } from "./status.js";
import * as favorites from "./favorites.js";

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

// Toasts via shared ui.js (loaded first), with an alert() fallback.
function toast(message, kind = "info") {
    if (typeof window.showToast === "function") window.showToast(message, kind);
    else alert(message);
}

// EXP-002 analytics — see public/js/track.js. Guarded so the page still
// works if track.js is missing (analytics must never break the site).
function track(event, detail) {
    if (typeof window.trackEvent === "function") window.trackEvent(event, detail);
}

const artistParam = new URLSearchParams(window.location.search).get("artist");
const notFoundBox = document.getElementById("artistNotFound");
const artistHeader = document.getElementById("artistHeader");
const artistStats = document.getElementById("artistStats");

// Global API health probe (EXP-001b / UX-13) — see status.js.
const apiOnline = await checkApiHealth();
if (!apiOnline) showOfflineBanner();

// Show the artist's name before the fetch resolves (UX-07): URLSearchParams
// already decoded the parameter, so this is the real name, not a placeholder.
if (artistParam) {
    document.title = `${artistParam} (MyScene)`;
    document.getElementById("artistName").textContent = artistParam;
}

// Batch 5: "Fav Artist" is server-side (see public/js/favorites.js) — the
// heart reflects the signed-in user's real favorites, and guests are sent
// to the login page instead of failing silently.
const favButton = document.getElementById("favArtist");
function renderFavLabel(isFav) {
    favButton.classList.toggle("active", isFav);
    favButton.setAttribute("aria-pressed", String(isFav));
    favButton.innerHTML = isFav ? "&#9733; Favorited" : "&hearts; Fav Artist";
}

function renderFav(isFav) {
    renderFavLabel(isFav);
    favButton.disabled = false;
}

// Restore this artist's state as early as the name is known, so a returning
// visitor sees their favorite immediately (UX-06).
if (artistParam) {
    favButton.dataset.heartArtist = artistParam;
    favorites.isFavorite(artistParam).then((isFav) => renderFav(isFav));
}

favButton.addEventListener("click", async () => {
    const name = currentArtist?.artist_name ?? artistParam;
    if (!name) return;
    favButton.disabled = true;
    try {
        // toggleFavorite fires the fav_toggle event and syncs every heart on
        // the page; a guest click redirects to login (the promise never resolves).
        const favorited = await favorites.toggleFavorite(name);
        if (favorited !== null) renderFav(favorited);
    } finally {
        favButton.disabled = false;
    }
});

// "View Similar" -> homepage genre search for this artist's genre.
document.getElementById("viewSimilar").addEventListener("click", function() {
    const genre = document.getElementById("artistGenre").dataset.genre;
    if (!genre) {
        toast("This artist has no genre on file yet.", "error");
        return;
    }
    this.disabled = true;
    window.location.href = `../index.html?genre=${encodeURIComponent(genre)}`;
});

// ---------- concert tabs ----------
// Upcoming / Previous split the two old side-by-side boxes; "Add events"
// appears only for verified artists (Batch 2 gating — the API enforces the
// same rule on POST /add_event, so the tab is a UX hint, not the gate).
const tabs = {
    upcoming: { tab: document.getElementById("tabUpcoming"), panel: document.getElementById("panelUpcoming") },
    previous: { tab: document.getElementById("tabPrevious"), panel: document.getElementById("panelPrevious") },
    add: { tab: document.getElementById("tabAddEvent"), panel: document.getElementById("panelAddEvent") },
};

function selectTab(name) {
    for (const [key, entry] of Object.entries(tabs)) {
        const active = key === name;
        entry.tab.classList.toggle("active", active);
        entry.tab.setAttribute("aria-selected", String(active));
        entry.panel.hidden = !active;
    }
}

for (const [key, entry] of Object.entries(tabs)) {
    entry.tab.addEventListener("click", () => selectTab(key));
}

// Arrow-key navigation across the visible tabs (tablist a11y).
document.getElementById("concertTabs").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const visible = Object.keys(tabs).filter((key) => !tabs[key].tab.hidden);
    const current = visible.find((key) => tabs[key].tab.classList.contains("active"));
    let idx = visible.indexOf(current);
    if (e.key === "ArrowRight") idx = (idx + 1) % visible.length;
    else if (e.key === "ArrowLeft") idx = (idx - 1 + visible.length) % visible.length;
    else if (e.key === "Home") idx = 0;
    else if (e.key === "End") idx = visible.length - 1;
    const next = visible[idx];
    selectTab(next);
    tabs[next].tab.focus();
    e.preventDefault();
});

// Reveal the "Add events" tab once /me confirms a verified artist.
window.mysceneSession.getMe().then((me) => {
    if (me && me.artist_status === "verified") {
        tabs.add.tab.hidden = false;
    }
});

// ---------- add events (verified artists) ----------
// The loaded artist row the form submits for (set in loadPage).
let currentArtist = null;

const addEventForm = document.getElementById("addEventForm");
addEventForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentArtist) return;

    const venue = document.getElementById("eventVenue").value.trim();
    const city = document.getElementById("eventCity").value.trim();
    const state = document.getElementById("eventState").value.trim();
    const date = document.getElementById("eventDate").value;
    const time = document.getElementById("eventTime").value;
    const ticketUrl = document.getElementById("eventTicketUrl").value.trim();

    // Native validation (required attributes) usually catches this first;
    // the toast is the fallback for browsers that skip it.
    if (!venue || !city || !state || !date) {
        toast("Venue, city, state, and date are required.", "error");
        return;
    }

    const button = document.getElementById("addEventButton");
    button.disabled = true;
    button.textContent = "Adding...";
    try {
        await apiCalls.addEvent({
            artist_name: currentArtist.artist_name,
            venue_name: venue,
            location_city: city,
            location_region: state,
            event_date: date,
            event_time: time || undefined,
            ticket_url: ticketUrl || undefined,
        });
        // EXP-002: a show was added to the scene.
        track("event_add", `artist:${currentArtist.artist_name}`);
        toast("Event added — it's now listed under Upcoming.", "success");
        addEventForm.reset();
        // reset() wipes the pre-filled location too — restore it.
        document.getElementById("eventCity").value = currentArtist.location_city ?? "";
        document.getElementById("eventState").value = currentArtist.location_region ?? "";
        const events = await apiCalls.getArtistEvents(currentArtist.artist_name);
        renderConcerts(Array.isArray(events) ? events : []);
        selectTab("upcoming");
    } catch (err) {
        // apiFetch carries the server's message (e.g. the 409 duplicate
        // notice) — surface it instead of a generic failure.
        console.error("Couldn't add event:", err);
        toast("Couldn't add the event: " + err.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = "Add Event";
    }
});

function showNotFound() {
    artistHeader.style.display = "none";
    artistStats.style.display = "none";
    notFoundBox.style.display = "block";
    document.title = "Artist not found (MyScene)";
}

// Distinguished from "not found" (UX-08): a missing API is not a missing artist.
function showOffline() {
    artistHeader.style.display = "none";
    artistStats.style.display = "none";
    notFoundBox.style.display = "block";
    notFoundBox.innerHTML = `Scene data is temporarily offline — check back in a bit. <a href="../index.html" style="color:var(--cyan);">Back to MyScene</a>`;
    document.title = "Scene data offline (MyScene)";
}

// Cycle through image candidates (bundled assets/images file first, then the
// image_src column) before hiding the frame entirely.
function loadArtistImage(img, candidates, name) {
    const list = candidates.filter(Boolean);
    let i = 0;
    const tryNext = () => {
        i += 1;
        if (i < list.length) {
            img.src = list[i];
        } else {
            img.style.display = "none";
        }
    };
    if (list.length === 0) {
        img.style.display = "none";
        return;
    }
    img.alt = name;
    img.onerror = tryNext;
    img.src = list[0];
}

// "20:30:00" -> "8:30 PM"
function formatTime(value) {
    const match = /^(\d{2}):(\d{2})/.exec(value ?? "");
    if (!match) return value ?? "";
    const hours = Number(match[1]);
    return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}

// Event start as a local Date. A date-only "YYYY-MM-DD" string would parse as
// UTC midnight (the previous evening in US time zones), so build it from parts;
// shows with no time count as upcoming until the day is over.
function eventStart(event) {
    const date = event.event_date ?? event.date ?? null;
    if (!date) return null;
    const time = event.event_time ?? event.time ?? "23:59:59";
    const parsed = new Date(`${date}T${time}`);
    return isNaN(parsed) ? null : parsed;
}

// Renders one concert entry (fields from GET /getArtistEvents).
function renderConcert(li, event) {
    const band = event.band ?? event.artist ?? event.artist_name ?? "";
    const place = [event.location_city, event.location_region].filter(Boolean).join(", ");
    const venue = [event.venue ?? event.venue_name ?? event.location ?? "", place].filter(Boolean).join(", ");
    const when = [event.event_date ?? event.date, formatTime(event.event_time ?? event.time)].filter(Boolean).join(" — ");
    li.innerHTML =
        (band ? `<span class="band">${escapeHtml(band)}</span> ` : "") +
        (venue ? `&mdash; <span class="venue">${escapeHtml(venue)}</span>` : "") +
        (when ? `<span class="when">${escapeHtml(when)}</span>` : "") +
        (/^https?:\/\//i.test(event.ticket_url ?? "")
            ? ` <a class="tickets" href="${escapeHtml(event.ticket_url)}" target="_blank" rel="noopener">Tickets</a>`
            : "");
    if (!band && !venue && !when) li.innerHTML = `<span class="when">${escapeHtml(JSON.stringify(event))}</span>`;
}

function renderConcerts(events) {
    const previousList = document.getElementById("previousConcerts");
    const upcomingList = document.getElementById("upcomingConcerts");

    const now = new Date();
    const previous = [];
    const upcoming = [];

    for (const event of events) {
        const start = eventStart(event);
        if (start && start < now) previous.push(event);
        else upcoming.push(event);
    }
    previous.reverse(); // most recent show first

    const fill = (listEl, items) => {
        if (items.length === 0) {
            listEl.innerHTML = `<li style="border:none; color:var(--ink-faint); font-family:var(--font-mono); font-size:.75rem;">No concerts listed yet.</li>`;
            return;
        }
        listEl.innerHTML = items.map(() => "<li></li>").join("");
        items.forEach((event, i) => renderConcert(listEl.children[i], event));
    };

    fill(previousList, previous);
    fill(upcomingList, upcoming);
}

async function loadPage() {
    if (!artistParam) {
        showNotFound();
        return;
    }

    let artist;
    try {
        artist = await apiCalls.getArtistInfo(artistParam);
    } catch (err) {
        console.error("Couldn't load artist info:", err);
        if (apiOnline === false) showOffline();
        else showNotFound();
        return;
    }
    if (!artist || !artist.artist_name) {
        showNotFound();
        return;
    }

    // The add-event form submits for this row; pre-fill its location with
    // the artist's home city/state (the show may be elsewhere — editable).
    currentArtist = artist;
    document.getElementById("eventCity").value = artist.location_city ?? "";
    document.getElementById("eventState").value = artist.location_region ?? "";

    // EXP-002: a profile_view is a successfully loaded artist profile.
    track("profile_view", `artist:${artist.artist_name}`);

    // Header
    document.getElementById("artistName").textContent = artist.artist_name;
    document.title = `${artist.artist_name} (MyScene)`;

    const genreEl = document.getElementById("artistGenre");
    genreEl.textContent = artist.music_genre ?? "";
    genreEl.dataset.genre = artist.music_genre ?? "";
    if (!artist.music_genre) genreEl.style.display = "none";

    const locationEl = document.getElementById("artistLocation");
    const location = [artist.location_city, artist.location_region].filter(Boolean).join(", ");
    locationEl.textContent = location;
    if (!location) locationEl.style.display = "none";

    const instaEl = document.getElementById("artistInsta");
    if (artist.insta_handle) {
        const handle = artist.insta_handle.replace(/^@/, "");
        instaEl.innerHTML = `Follow <a href="https://instagram.com/${encodeURIComponent(handle)}" target="_blank" rel="noopener">${escapeHtml(artist.insta_handle)}</a>`;
        // EXP-002: the ONE action — someone going to follow on Instagram.
        instaEl.querySelector("a")?.addEventListener("click", () => {
            track("insta_click", `artist:${artist.artist_name}`);
        });
    } else {
        instaEl.style.display = "none";
    }

    loadArtistImage(
        document.getElementById("artistPic"),
        [
            `../assets/images/${artist.artist_name.replace(/\s+/g, "")}.png`,
            artist.image_src ?? null,
        ],
        artist.artist_name
    );

    // Concerts (GET /getArtistEvents — always 200 with a list, oldest first).
    try {
        const events = await apiCalls.getArtistEvents(artist.artist_name);
        renderConcerts(Array.isArray(events) ? events : []);
    } catch (err) {
        // UX-08: a failed fetch must not masquerade as "no concerts".
        console.error("Couldn't load artist events:", err);
        const msg = apiOnline
            ? "Couldn't load show info — check back soon."
            : "Show info can't load while scene data is offline.";
        for (const id of ["previousConcerts", "upcomingConcerts"]) {
            document.getElementById(id).innerHTML = `<li style="border:none; color:var(--ink-faint); font-family:var(--font-mono); font-size:.75rem;">${msg}</li>`;
        }
    }
}

loadPage();
