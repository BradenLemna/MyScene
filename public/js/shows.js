// "Shows Near You" (Batch 4) — upcoming events within a radius of a city,
// grouped by date. Reuses the homepage's city autocomplete + geocoding
// pattern (api.js). Product requirement: the page must degrade gracefully
// when no events exist yet — an honest empty state with a next step, never
// a blank page or a fake list. A failed fetch is also distinguished from
// "no shows" (UX-08, same rule as viewArtist.js).
import * as apiCalls from "../js/api.js";
import { checkApiHealth, showOfflineBanner } from "./status.js";

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

// Global API health probe (EXP-001b / UX-13) — see status.js.
const apiOnline = await checkApiHealth();
if (!apiOnline) showOfflineBanner();

const cityInput = document.getElementById("showCity");
const radiusInput = document.getElementById("showRadius");
const daysSelect = document.getElementById("showDays");
const searchButton = document.getElementById("showSearchButton");
const results = document.getElementById("showsResults");
const context = document.getElementById("showsContext");

let searchLatitude = null;
let searchLongitude = null;
let searchLabel = null; // what the results are near ("your location" / city name)
let searchId = 0; // drops stale responses when a new search starts

// ---------- city autocomplete (same pattern as the homepage) ----------
let timer;
cityInput.addEventListener("keyup", function() {
    clearTimeout(timer);
    const query = this.value;
    timer = setTimeout(() => {
        if (query.length > 2) {
            apiCalls.autoCompleteCity(query)
                .then(renderCitySuggestions)
                .catch(err => {
                    console.error("City autocomplete failed:", err);
                    renderCitySuggestions([]);
                    const note = document.getElementById("showCityNote");
                    if (note) note.hidden = false;
                });
        } else {
            renderCitySuggestions([]);
        }
    }, 500); // Delay of 500ms after the user stops typing
});

function renderCitySuggestions(suggestions) {
    let list = document.getElementById("showCitySuggestions");
    if (!list) {
        list = document.createElement("div");
        list.id = "showCitySuggestions";
        list.className = "citySuggestions";
        cityInput.insertAdjacentElement("afterend", list);
    }
    if (!suggestions || suggestions.length === 0) {
        list.innerHTML = "";
        list.style.display = "none";
        return;
    }
    list.style.display = "block";
    list.innerHTML = suggestions.map(s => `<button type="button" class="citySuggestion" data-lon="${s.lon}" data-lat="${s.lat}">${escapeHtml(s.name)}</button>`).join("");
    list.querySelectorAll(".citySuggestion").forEach(btn => {
        btn.addEventListener("click", () => {
            cityInput.value = btn.textContent;
            setPoint(btn.dataset.lat, btn.dataset.lon, btn.textContent);
            list.innerHTML = "";
            list.style.display = "none";
            searchShows();
        });
    });
}

// Close the city dropdown on outside click.
document.addEventListener("click", e => {
    const list = document.getElementById("showCitySuggestions");
    if (list && list.style.display === "block" && !e.target.closest(".citySuggestions")) {
        list.style.display = "none";
    }
});

function setPoint(latitude, longitude, label) {
    searchLatitude = Number(latitude);
    searchLongitude = Number(longitude);
    searchLabel = label;
}

// ---------- search ----------
searchButton.addEventListener("click", searchShows);
radiusInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        e.preventDefault();
        searchButton.click();
    }
});
// Changing the window re-runs the search once a point is set.
daysSelect.addEventListener("change", () => {
    if (searchLatitude !== null) searchShows();
});

function currentRadius() {
    const radius = parseFloat(radiusInput.value);
    return isNaN(radius) || radius <= 0 ? null : radius;
}

async function searchShows() {
    const radius = currentRadius();
    if (radius === null) {
        toast("Please enter a valid radius in miles.", "error");
        return;
    }
    if (searchLatitude === null || searchLongitude === null) {
        toast("Pick a city from the suggestions first.", "error");
        return;
    }
    const days = Number(daysSelect.value);
    const requestId = ++searchId;

    searchButton.disabled = true;
    results.innerHTML = `<div class="emptyState">Looking for shows&hellip;</div>`;

    let events;
    try {
        events = await apiCalls.getNearbyEvents(searchLatitude, searchLongitude, radius, days);
    } catch (err) {
        // UX-08: a failed fetch must not masquerade as "no shows".
        console.error("Failed to load nearby events:", err);
        if (requestId === searchId) {
            results.innerHTML = `<div class="emptyState">${apiOnline
                ? "Couldn't load shows right now — check back soon."
                : "Shows can't load while scene data is offline — check back soon."}</div>`;
        }
        return;
    }
    if (requestId !== searchId) return; // a newer search superseded this one
    searchButton.disabled = false;
    renderShows(events ?? [], radius, days);
}

// ---------- rendering ----------
// "20:30:00" -> "8:30 PM" (same helper as viewArtist.js).
function formatTime(value) {
    const match = /^(\d{2}):(\d{2})/.exec(value ?? "");
    if (!match) return value ?? "";
    const hours = Number(match[1]);
    return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}

// "2026-12-05" -> "Friday, December 5" (local calendar, no UTC shift).
function formatDate(value) {
    const [y, m, d] = String(value ?? "").split("-").map(Number);
    if (!y || !m || !d) return value ?? "";
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
    });
}

function venueLine(event) {
    const place = [event.location_city, event.location_region].filter(Boolean).join(", ");
    return [event.venue_name, place].filter(Boolean).join(", ");
}

function renderShows(events, radius, days) {
    context.textContent = `Near ${searchLabel} — ${radius} mile${radius === 1 ? "" : "s"}, next ${days} days`;

    if (events.length === 0) {
        // The graceful empty state (product requirement): a fresh scene has
        // no events yet, and the page says so with a next step.
        results.innerHTML = `
            <div class="emptyState showEmpty">
                <p>No shows listed yet in this area &mdash; be the first to add one.</p>
                <a class="btn pink" href="addArtist.html">Add your band</a>
            </div>`;
        return;
    }

    // Group by event_date (the API returns them date-ordered already).
    const groups = new Map();
    for (const event of events) {
        const key = event.event_date;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(event);
    }

    results.innerHTML = [...groups.entries()].map(([date, dayEvents]) => `
        <div class="showDay">
            <h3 class="showDayHead">${escapeHtml(formatDate(date))}</h3>
            <ul class="showList">
                ${dayEvents.map(event => `
                    <li class="showRow">
                        <a class="showBand" href="viewArtist.html?artist=${encodeURIComponent(event.artist_name)}">${escapeHtml(event.artist_name)}</a>
                        <span class="showVenue">&mdash; ${escapeHtml(venueLine(event))}</span>
                        ${event.event_time ? `<span class="showTime">${escapeHtml(formatTime(event.event_time))}</span>` : ""}
                        ${/^https?:\/\//i.test(event.ticket_url ?? "")
                            ? `<a class="showTickets" href="${escapeHtml(event.ticket_url)}" target="_blank" rel="noopener">Tickets</a>`
                            : ""}
                    </li>`).join("")}
            </ul>
        </div>`).join("");
}

// ---------- initial location ----------
// Try geolocation first (like the homepage) so a returning fan lands on
// shows near them; without it, the city field drives the search.
navigator.geolocation.getCurrentPosition(
    position => {
        setPoint(position.coords.latitude, position.coords.longitude, "your location");
        context.textContent = "Showing shows near you";
        searchShows();
    },
    error => {
        console.warn("Geolocation unavailable:", error.message);
        context.textContent = "Pick a city to find shows near you.";
    }
);
