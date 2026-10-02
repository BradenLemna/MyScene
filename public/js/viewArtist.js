// Dynamic view-artist page — loads the artist row and its events from the
// MyScene API (see api/server). The artist name comes from
// the ?artist= query parameter.
import * as apiCalls from "../js/api.js";

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

const artistParam = new URLSearchParams(window.location.search).get("artist");
const notFoundBox = document.getElementById("artistNotFound");
const artistHeader = document.getElementById("artistHeader");
const artistStats = document.getElementById("artistStats");

// Purely visual favorite toggle — wire up to a real "favorites" endpoint
// once one exists.
document.getElementById("favArtist").addEventListener("click", function() {
    const isNowActive = this.classList.toggle("active");
    this.innerHTML = isNowActive ? "&#9733; Favorited" : "&hearts; Fav Artist";
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

function showNotFound() {
    artistHeader.style.display = "none";
    artistStats.style.display = "none";
    notFoundBox.style.display = "block";
    document.title = "Artist not found (MyScene)";
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
        showNotFound();
        return;
    }
    if (!artist || !artist.artist_name) {
        showNotFound();
        return;
    }

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
        console.error("Couldn't load artist events:", err);
        renderConcerts([]);
    }
}

loadPage();
