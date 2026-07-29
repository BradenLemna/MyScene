import { setUserLocation, calculateDistance, testInRange } from "./backend/locationHandling.js";
import * as apiCalls from "./backend/apiCallsClientside.js";

// ---------- artist search ----------
document.getElementById("searchButton").addEventListener("click", search);
async function search() {
    let input = document.getElementById("homeSearch").value;
    if (input.trim() === "") {
        alert("Please enter an artist name.");
        return;
    }

    setSearchLoading(true);
    try {
        let genre = await apiCalls.getGenre(input);
        genre = genre.charAt(0).toUpperCase() + genre.slice(1); // Capitalize first letter

        console.log(genre);

        const artists = await apiCalls.getSimilarArtists(genre);
        console.log(artists);
        displayArtists(artists);

    } catch (err) {
        console.error("Search failed:", err);
        alert("Something went wrong searching for that artist. Please try again.");
    } finally {
        setSearchLoading(false);
    }
}

function setSearchLoading(isLoading) {
    const btn = document.getElementById("searchButton");
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle("isLoading", isLoading);
}

document.getElementById("radiusEnterButton").addEventListener("click", function() {
    const radiusInput = document.getElementById("radiusSearch").value;
    const radius = parseFloat(radiusInput); // Convert string input to a number (float)
    if (!isNaN(radius) && radius > 0) { // Check if the input is a valid number and greater than 0
        updateRadiusCircle(radius);
    }
    else {
        alert("Please enter a valid radius in miles.");
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
    list.innerHTML = suggestions.map(s => `<button type="button" class="citySuggestion" data-lon="${s.lon}" data-lat="${s.lat}">${s.name}</button>`).join("");
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

// Renders featured artists
async function renderFeaturedArtists() {
    try {
        const artists = await apiCalls.getFeaturedArtists();
        const featuredDiv = document.getElementById("featuredArtistsGrid");
        if (!featuredDiv) return;

        featuredDiv.innerHTML = artists.map((artist, i) => `
            <div role="button" class="artistBox" data-artist-index="${i}" tabindex="0" aria-label="View ${artist.artist_name}">
                <div class="artistCard">
                    <div class="artistImgWrap">
                        <span class="newBadge">Featured</span>
                        <img src="frontend/Artist Pics/${artist.artist_name.replace(/\s+/g, '')}.png" class="artistImg" alt="${artist.artist_name}"
                            onerror="this.parentElement.classList.add('noImg'); this.remove();">
                    </div>
                    <div class="artistCardBody">
                        <h3>${artist.artist_name}</h3>
                        <div class="artistMeta"><span>${artist.music_genre}</span></div>
                    </div>
                </div>
            </div>
        `).join("");

        featuredDiv.querySelectorAll(".artistBox").forEach(box => {
            const artist = artists[box.dataset.artistIndex];
            const open = () => openArtistModal(artist);
            box.addEventListener("click", open);
            box.addEventListener("keydown", e => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
            });
        });
    } catch (err) {
        console.error("Failed to fetch featured artists:", err);
    }
}
renderFeaturedArtists();

// Renders search results
function displayArtists(artists) {
    document.getElementById("searchResults").style.display = "block";
    document.getElementById("featuredArtists").style.display = "none";
    document.getElementById("map").style.display = "none";

    const resultsDiv = document.getElementById("results");

    if (!artists || artists.length === 0) {
        resultsDiv.innerHTML = `<div class="emptyState">No artists match that search yet — try a different name or clear a filter.</div>`;
        return;
    }

    resultsDiv.innerHTML = artists.map((artist, i) => `
        <div class="artistBox" data-artist-index="${i}" tabindex="0" role="button" aria-label="View ${artist.artist_name}">
            <div class="artistCard">
                <div class="artistImgWrap noImg"></div>
                <div class="artistCardBody">
                    <h3>${artist.artist_name}</h3>
                    <div class="artistMeta">
                        <span>${artist.music_genre}</span>
                        <span class="dot">&bull;</span>
                        <span class="artistLoc">${artist.location_city}, ${artist.location_region}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join("");

    resultsDiv.querySelectorAll(".artistBox").forEach(box => {
        const artist = artists[box.dataset.artistIndex];
        const open = () => openArtistModal(artist);
        box.addEventListener("click", open);
        box.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
        });
    });
}

// ---------- quick-view modal ----------
document.getElementById("modalClose")?.addEventListener("click", closeArtistModal);
document.getElementById("modalOverlay")?.addEventListener("click", e => {
    if (e.target.id === "modalOverlay") closeArtistModal();
});
document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeArtistModal();
});

function openArtistModal(artist) {
    const overlay = document.getElementById("modalOverlay");
    if (!overlay) return;
    document.getElementById("modalTitle").textContent = artist.artist_name;
    document.getElementById("modalBio").textContent = artist.insta_handle
        ? `Find them on Instagram: ${artist.insta_handle}`
        : "";
    document.getElementById("modalTags").innerHTML = `
        <span class="genreChip active">${artist.music_genre}</span>
        <span class="genreChip">${artist.location_city}, ${artist.location_region}</span>
    `;
    overlay.classList.add("open");
}

function closeArtistModal() {
    document.getElementById("modalOverlay")?.classList.remove("open");
}

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

let filterone = false;
let filtertwo = false;

// Filter lists
let genreList = [];
let datesList = [];
let sizeList = [];
let prevconvertList = [];
let distanceList = [];

// Functions to add to lists
function addGenre(genre) {
    if (!genreList.includes(genre)) {
        genreList.push(genre);
    }
}

function addDates(date) {
    if (!datesList.includes(date)) {
        datesList.push(date);
    }
}

function addSize(size) {
    if (!sizeList.includes(size)) {
        sizeList.push(size);
    }
}

function addPrevconvert(item) {
    if (!prevconvertList.includes(item)) {
        prevconvertList.push(item);
    }
}

function addDistance(distance) {
    if (!distanceList.includes(distance)) {
        distanceList.push(distance);
    }
}

//event listeners
document.getElementById("filterButton").addEventListener("mouseover", mouseoverone);
document.getElementById("filterButton").addEventListener("mouseout", mouseoutone);

//changes the display of first filter to block when mouseover and none when mouseout
function mouseoverone() {
    document.getElementById("filterOptions").style.display = "block";
    filterone = true;
}
function mouseoutone() {
    filterone = false;
    if (!filtertwo) {
        document.getElementById("filterOptions").style.display = "none";
    }
}
//entire filter two section
document.getElementById("filterOptions").addEventListener("mouseover", mouseovertwo);
document.getElementById("filterOptions").addEventListener("mouseout", mouseouttwo);
//closes pop up filter two
function mouseovertwo() {
    filtertwo = true;
}
function mouseouttwo() {
    filtertwo = false;
}

document.getElementById("genre").addEventListener("mouseover", genredisplay);
document.getElementById("genre").addEventListener("mouseout", genreleave);
document.getElementById("dates").addEventListener("mouseover", datesdisplay);
document.getElementById("dates").addEventListener("mouseout", datesleave);
//document.getElementById("prevconcert").addEventListener("mouseover", prevconcertdisplay);
//document.getElementById("prevconcert").addEventListener("mouseout", prevconcertleave);
document.getElementById("size").addEventListener("mouseover", sizedisplay);
document.getElementById("size").addEventListener("mouseout", sizeleave);
//document.getElementById("distance").addEventListener("mouseover", distancedisplay);
//document.getElementById("distance").addEventListener("mouseout", distancelеave);

function genredisplay() {
    document.getElementById("genrefilter").style.display = "block";
}
function genreleave() {
    document.getElementById("genrefilter").style.display = "none";
}
function datesdisplay() {
    document.getElementById("datesfilter").style.display = "block";
}
function datesleave() {
    document.getElementById("datesfilter").style.display = "none";
}
function sizedisplay() {
    document.getElementById("sizefilter").style.display = "block";
}
function sizeleave() {
    document.getElementById("sizefilter").style.display = "none";
}
// function prevconcertdisplay() {
//     document.getElementById("prevconcertfilter").style.display = "block";
// }
// function prevconcertleave() {
//     document.getElementById("prevconcertfilter").style.display = "none";
// }
// function distancedisplay() {
//     document.getElementById("distancefilter").style.display = "block";
// }
// function distancelеave() {
//     document.getElementById("distancefilter").style.display = "none";
// }

// Initialize map with user location
function initializeMap()
{
    map = L.map('map').setView([getUserLatitude(), getUserLongitude()], 11);

    L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
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
