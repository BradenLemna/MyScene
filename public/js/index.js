import { setUserLocation } from "./locationHandling.js";
import * as apiCalls from "./api.js";

// ---------- helpers ----------

// Escape untrusted strings before injecting them into innerHTML templates.
function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

// Candidate image locations for an artist, in priority order.
// 1. The bundled assets/images folder (files are stored without spaces).
// 2. The image_src column from the database, if present.
function artistImageCandidates(artist) {
    const candidates = [
        `assets/images/${artist.artist_name.replace(/\s+/g, "")}.png`,
    ];
    if (artist.image_src) {
        candidates.push(artist.image_src);
    }
    return candidates;
}

// Attach an <img> with onerror fallback that walks through every candidate
// before giving up on the image entirely (shows the ♫ placeholder).
function artistImgTag(artist, className) {
    const candidates = JSON.stringify(artistImageCandidates(artist));
    return `<img src="${escapeHtml(artistImageCandidates(artist)[0])}" class="${className}" alt="${escapeHtml(artist.artist_name)}"
        data-candidates="${escapeHtml(candidates)}" data-index="0"
        onerror="this._onImgError = true; (function loop(img){
            const list = JSON.parse(img.dataset.candidates);
            const next = Number(img.dataset.index) + 1;
            if (next < list.length) { img.dataset.index = String(next); img.src = list[next]; }
            else { img.parentElement.classList.add('noImg'); img.remove(); }
        })(this)">`;
}

// Wrap showToast so the page degrades gracefully if ui.js is missing.
function toast(message, kind = "info") {
    if (typeof window.showToast === "function") window.showToast(message, kind);
    else alert(message);
}

// ---------- artist search ----------
const homeSearch = document.getElementById("homeSearch");
const searchButton = document.getElementById("searchButton");
searchButton.addEventListener("click", search);
homeSearch.addEventListener("keydown", e => {
    if (e.key === "Enter") search();
});

// Selected genre-filter checkboxes, in DOM order.
function selectedGenres() {
    return [...document.querySelectorAll("#genrefilter input:checked")].map(cb => cb.value);
}

async function search() {
    let input = homeSearch.value;
    const genres = selectedGenres();

    if (input.trim() === "" && genres.length === 0) {
        toast("Please enter an artist name or pick a genre filter.", "error");
        return;
    }

    setSearchLoading(true);
    try {
        let resultGenres = genres;

        // No explicit genre filter: resolve the searched artist's genre
        // through the API (LastFM top genre) and search for that.
        if (resultGenres.length === 0) {
            let genre = await apiCalls.getGenre(input);
            genre = genre.charAt(0).toUpperCase() + genre.slice(1); // Capitalize first letter
            resultGenres = [genre];
        }

        const fetches = resultGenres.map(g => apiCalls.getSimilarArtists(g));
        const results = await Promise.all(fetches);

        // Merge, de-duplicate by name, and keep the exact genre filter applied.
        const seen = new Set();
        const artists = results.flat().filter(artist => {
            if (seen.has(artist.artist_name)) return false;
            seen.add(artist.artist_name);
            return true;
        });

        displayArtists(artists, input.trim());
    } catch (err) {
        console.error("Search failed:", err);
        toast(err instanceof Error && err.message
            ? err.message
            : "Something went wrong searching. Please try again.", "error");
    } finally {
        setSearchLoading(false);
    }
}

function setSearchLoading(isLoading) {
    searchButton.disabled = isLoading;
    searchButton.classList.toggle("isLoading", isLoading);
}

// ---------- genre filter (populated from the database) ----------
// Fallback list used only if the /getGenreList call fails, so the filter is
// never an empty box.
const FALLBACK_GENRES = ["Rock", "Indie", "Punk", "Country", "Alt Rock"];

function renderGenreFilter(genres) {
    const container = document.getElementById("genrefilter");
    if (!container) return;
    container.innerHTML = genres.map(g =>
        `<label><input type="checkbox" value="${escapeHtml(g)}"> ${escapeHtml(g)}</label>`
    ).join("");

    // Feed the "Genres tracked" hero stat from the same live list.
    const statEl = document.getElementById("statGenres");
    if (statEl) statEl.textContent = genres.length;
}

async function loadGenreFilter() {
    try {
        const genres = await apiCalls.getGenreList();
        renderGenreFilter(genres.length > 0 ? genres : FALLBACK_GENRES);
    } catch (err) {
        console.warn("Failed to load genre list, using fallback:", err);
        renderGenreFilter(FALLBACK_GENRES);
    }
}
// Single shared promise — reused by deep links so the genre list is only
// fetched once.
const genreFilterReady = loadGenreFilter();

// Pre-check a genre when arriving with ?genre=... (e.g. from "View Similar").
function preselectGenre(genre) {
    const box = document.querySelector(`#genrefilter input[value="${genre.replace(/"/g, "")}"]`);
    if (box) box.checked = true;
}

// ---------- filter panel (click to open, works on touch) ----------
const filterButton = document.getElementById("filterButton");
const filterOptions = document.getElementById("filterOptions");

function setFilterPanel(open) {
    filterOptions.classList.toggle("open", open);
    filterButton.setAttribute("aria-expanded", String(open));
}

function closeSubmenus() {
    document.querySelectorAll(".filterCategory.open").forEach(cat => {
        cat.classList.remove("open");
        const btn = cat.querySelector(".filterToggle");
        if (btn) btn.setAttribute("aria-expanded", "false");
    });
}

filterButton.addEventListener("click", () => {
    setFilterPanel(!filterOptions.classList.contains("open"));
    if (!filterOptions.classList.contains("open")) closeSubmenus();
});

// Each category header toggles its own submenu (multi-select stays open
// while ticking boxes — only the header toggles).
document.querySelectorAll(".filterToggle").forEach(btn => {
    btn.addEventListener("click", () => {
        const cat = btn.closest(".filterCategory");
        const open = cat.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
    });
});

// Clicking anywhere outside the search box closes the panel + submenus.
document.addEventListener("click", e => {
    if (filterOptions.classList.contains("open") &&
        !e.target.closest(".searchEngine")) {
        setFilterPanel(false);
        closeSubmenus();
    }
});

// Escape closes everything, returning focus to the filter button.
document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (filterOptions.classList.contains("open")) {
        setFilterPanel(false);
        closeSubmenus();
        filterButton.focus();
    }
});

// ---------- artist count stat ----------
function getArtistAmount() {
    const statArtists = document.getElementById("statArtists");
    if (!statArtists) return;

    apiCalls.getArtistAmount()
        .then(amount => {
            console.log("Total artists in database:", amount);
            statArtists.textContent = amount;
        })
        .catch(err => {
            console.error("Failed to get artist amount:", err);
            statArtists.textContent = "—";
        });
}
getArtistAmount();

// ---------- city search + radius ----------
document.getElementById("radiusEnterButton").addEventListener("click", function() {
    const radiusInput = document.getElementById("radiusSearch").value;
    const radius = parseFloat(radiusInput); // Convert string input to a number (float)
    if (!isNaN(radius) && radius > 0) { // Check if the input is a valid number and greater than 0
        updateRadiusCircle(radius);
    }
    else {
        toast("Please enter a valid radius in miles.", "error");
    }
});

document.getElementById("radiusSearch").addEventListener("keydown", e => {
    if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("radiusEnterButton").click();
    }
});

let timer;
const input = document.getElementById("citySearch");
input.addEventListener('keyup', function() {
    clearTimeout(timer);
    const query = this.value;
    timer = setTimeout(() => {
        if (query.length > 2) {
            autoCompleteCity(query).then(suggestions => {
                console.log(suggestions);
                renderCitySuggestions(suggestions);
            });
        } else {
            renderCitySuggestions([]);
        }
    }, 500); // Delay of 500ms after the user stops typing
});

// Lightweight dropdown for city autocomplete results
function renderCitySuggestions(suggestions) {
    let list = document.getElementById("citySuggestions");
    if (!list) {
        list = document.createElement("div");
        list.id = "citySuggestions";
        list.className = "citySuggestions";
        input.insertAdjacentElement("afterend", list);
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
            input.value = btn.textContent;
            userLongitude = btn.dataset.lon;
            userLatitude = btn.dataset.lat;
            console.log("Selected city coordinates:", userLatitude, userLongitude);
            updateUserLocation(userLongitude, userLatitude);
            updateRadiusCircle(10); // Reset radius circle to default 10 miles
            list.innerHTML = "";
            list.style.display = "none";
        });
    });
}

// Close the city dropdown on outside click / Escape.
document.addEventListener("click", e => {
    const list = document.getElementById("citySuggestions");
    if (list && list.style.display === "block" && !e.target.closest(".citySuggestions")) {
        list.style.display = "none";
    }
});

// ---------- featured artists ----------
// Renders featured artists
async function renderFeaturedArtists() {
    try {
        const artists = await apiCalls.getFeaturedArtists();
        const featuredDiv = document.getElementById("featuredArtistsGrid");
        if (!featuredDiv) return;

        if (!artists || artists.length === 0) {
            featuredDiv.innerHTML = `<div class="emptyState">No featured artists yet — check back soon, or add the first one.</div>`;
            return;
        }

        featuredDiv.innerHTML = artists.map((artist, i) => `
            <div role="button" class="artistBox" data-artist-index="${i}" tabindex="0" aria-label="View ${escapeHtml(artist.artist_name)}">
                <div class="artistCard">
                    <div class="artistImgWrap">
                        <span class="newBadge">Featured</span>
                        ${artistImgTag(artist, "artistImg")}
                    </div>
                    <div class="artistCardBody">
                        <h3>${escapeHtml(artist.artist_name)}</h3>
                        <div class="artistMeta"><span class="genreTag">${escapeHtml(artist.music_genre)}</span></div>
                    </div>
                </div>
            </div>
        `).join("");

        wireArtistBoxes(featuredDiv, artists);
    } catch (err) {
        console.error("Failed to fetch featured artists:", err);
        const featuredDiv = document.getElementById("featuredArtistsGrid");
        if (featuredDiv) featuredDiv.innerHTML = `<div class="emptyState">Couldn't load featured artists right now.</div>`;
    }
}
renderFeaturedArtists();

// ---------- search results ----------
// Renders search results
function displayArtists(artists, queryName = "") {
    document.getElementById("searchResults").style.display = "block";
    document.getElementById("featuredArtists").style.display = "none";
    document.getElementById("map").style.display = "none";

    const resultsDiv = document.getElementById("results");
    const countEl = document.getElementById("resultsCount");
    if (countEl) {
        countEl.textContent = queryName
            ? `For "${queryName}"`
            : `${artists.length} artist${artists.length === 1 ? "" : "s"} found`;
    }

    if (!artists || artists.length === 0) {
        resultsDiv.innerHTML = `<div class="emptyState">No artists match that search yet — try a different name or clear a filter.</div>`;
        return;
    }

    resultsDiv.innerHTML = artists.map((artist, i) => `
        <div class="artistBox" data-artist-index="${i}" tabindex="0" role="button" aria-label="View ${escapeHtml(artist.artist_name)}">
            <div class="artistCard">
                <div class="artistImgWrap">
                    ${artistImgTag(artist, "artistImg")}
                </div>
                <div class="artistCardBody">
                    <h3>${escapeHtml(artist.artist_name)}</h3>
                    <div class="artistMeta">
                        <span class="genreTag">${escapeHtml(artist.music_genre)}</span>
                        <span class="dot">&bull;</span>
                        <span class="artistLoc">${escapeHtml(artist.location_city)}, ${escapeHtml(artist.location_region)}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join("");

    wireArtistBoxes(resultsDiv, artists);
}

// Shared click/keyboard wiring for artist cards (featured + results grids).
function wireArtistBoxes(grid, artists) {
    grid.querySelectorAll(".artistBox").forEach(box => {
        const artist = artists[Number(box.dataset.artistIndex)];
        const open = () => openArtistModal(artist);
        box.addEventListener("click", open);
        box.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
        });
    });
}

// ---------- quick-view modal ----------
let currentModalArtist = null;
let lastFocusedElement = null; // so focus returns to the card on close

document.getElementById("modalClose")?.addEventListener("click", closeArtistModal);
document.getElementById("modalOverlay")?.addEventListener("click", e => {
    if (e.target.id === "modalOverlay") closeArtistModal();
});
document.addEventListener("keydown", e => {
    if (e.key === "Escape" && document.getElementById("modalOverlay")?.classList.contains("open")) {
        closeArtistModal();
    }
});

// Walk the image candidates for an element (created in JS, so no inline
// onerror string is needed). Hides the image if every candidate fails.
function loadIntoImg(img, candidates, alt) {
    const list = candidates.filter(Boolean);
    let i = 0;
    const tryNext = () => {
        i += 1;
        if (i < list.length) img.src = list[i];
        else img.remove();
    };
    if (list.length === 0) {
        img.remove();
        return;
    }
    img.alt = alt;
    img.onerror = tryNext;
    img.src = list[0];
}

function openArtistModal(artist) {
    const overlay = document.getElementById("modalOverlay");
    if (!overlay) return;
    currentModalArtist = artist;
    lastFocusedElement = document.activeElement;

    document.getElementById("modalTitle").textContent = artist.artist_name;
    document.getElementById("modalBio").textContent = artist.insta_handle
        ? `Find them on Instagram: ${artist.insta_handle}`
        : "";
    document.getElementById("modalTags").innerHTML = `
        <span class="genreChip active">${escapeHtml(artist.music_genre)}</span>
        <span class="genreChip">${escapeHtml(artist.location_city)}, ${escapeHtml(artist.location_region)}</span>
    `;

    // Optional avatar at the top of the card (hidden if no image loads).
    const tagsRow = document.getElementById("modalTags");
    if (tagsRow.previousElementSibling?.id === "modalImgSlot") {
        tagsRow.previousElementSibling.remove();
    }
    const slot = document.createElement("div");
    slot.id = "modalImgSlot";
    slot.className = "modalImgSlot";
    const img = document.createElement("img");
    img.id = "modalImg";
    img.className = "modalImg";
    img.onerror = () => img.remove();
    slot.appendChild(img);
    tagsRow.insertAdjacentElement("beforebegin", slot);
    loadIntoImg(img, artistImageCandidates(artist), artist.artist_name);

    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    document.getElementById("modalClose").focus();
}

function closeArtistModal() {
    document.getElementById("modalOverlay")?.classList.remove("open");
    document.body.style.overflow = "";
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
}

// "View Full Profile" -> dynamic artist page
document.getElementById("viewProfileButton")?.addEventListener("click", () => {
    if (!currentModalArtist) return;
    window.location.href = `pages/viewArtist.html?artist=${encodeURIComponent(currentModalArtist.artist_name)}`;
});

// Global variables
let map = null; // Leaflet map instance (Needed to access in multiple functions)
let userMarker = null; // User location circle marker (Needed to bring the marker to the front after adding the radius circle)

// Store user location
let userLatitude = null;
let userLongitude = null;

// Getter functions for user location
function getUserLatitude() {
  return userLatitude;
}

function getUserLongitude() {
  return userLongitude;
}

navigator.geolocation.getCurrentPosition(
  function(position) {
    userLatitude = position.coords.latitude;
    userLongitude = position.coords.longitude;

    setUserLocation(userLongitude, userLatitude);
    console.log("User location set to:", userLatitude, userLongitude);

    // Initialize map after geolocation is ready
    initializeMap();
    updateRadiusCircle(10);
    userMarker.bringToFront(); // Bring circle marker to the front
  },
  function(error) {
    // User denied location or it's unavailable — fall back to a default
    // center so the map still renders instead of staying blank.
    console.warn("Geolocation unavailable, using default center:", error.message);
    userLatitude = 36.0822;  // Fayetteville, AR
    userLongitude = -94.1719;

    initializeMap();
    updateRadiusCircle(10);
    userMarker.bringToFront();
  }
);

// Initialize map with user location
function initializeMap()
{
    map = L.map('map').setView([getUserLatitude(), getUserLongitude()], 11);

    // Keyless OpenStreetMap tiles — the previous Stadia tile layer required
    // an API key that is no longer shipped with the frontend.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    }).addTo(map);

    userMarker = L.circleMarker([getUserLatitude(), getUserLongitude()], {
        radius: 8,
        fillColor: "#220C10",
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map);
}

// Initialize radius circle
function updateRadiusCircle(radius)
{
    if (window.radiusCircle) {
        window.radiusCircle.setRadius(radius * 1609.34); // Convert miles to meters
    }
    else
    {
        window.radiusCircle = L.circle([getUserLatitude(), getUserLongitude()], {
            radius: radius * 1609.34, // Convert miles to meters
            color: '#000000',
            weight: 1,
            fillColor: '#75B8C8',
            fillOpacity: 0.1
        }).addTo(map);
    }

    // Zoom map to fit the radius circle
    map.fitBounds(window.radiusCircle.getBounds());
}

// Update user location and recenter map
function updateUserLocation(longitude, latitude)
{
    setUserLocation(longitude, latitude);
    userMarker.setLatLng([latitude, longitude]);
    if (window.radiusCircle) {
        window.radiusCircle.setLatLng([latitude, longitude]);
    }
    map.setView([latitude, longitude], 11);
}

// Add map marker for concert location
function addMarker(latitude, longitude, concertInfo)
{
    const marker = L.marker([latitude, longitude]).addTo(map);
    marker.bindPopup(concertInfo);
}

// ---------- deep links ----------
// ?artist=Name  -> run a search for that artist on load
// ?genre=Genre  -> run a genre search on load (used by "View Similar")
function handleDeepLinks() {
    const params = new URLSearchParams(window.location.search);
    const artist = params.get("artist");
    const genre = params.get("genre");

    if (!artist && !genre) return;

    // Drop the params so a refresh doesn't re-trigger the search.
    window.history.replaceState({}, "", "index.html");

    if (genre) {
        // Wait for the filter to render so we can pre-check the genre.
        genreFilterReady.then(() => {
            preselectGenre(genre);
            homeSearch.placeholder = `Genre: ${genre}`;
            search();
        });
    } else if (artist) {
        homeSearch.value = artist;
        search();
    }
}
handleDeepLinks();
