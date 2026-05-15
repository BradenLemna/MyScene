import { setUserLocation, calculateDistance, testInRange } from "./backend/locationHandling.js";
import { autoCompleteCity, getLatitude, getLongitude, getLocation, getGenre } from "./backend/apiCallsClientside.js";

/*
document.addEventListener("DOMContentLoaded", () => {
    
});
*/

document.getElementById("searchButton").addEventListener("click", search);
async function search() {
    //alert("searching");
    console.log("searching");
    /*var checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(function(checkbox) {
        if (!checkbox.checked){
            return;
        }
        //add to list
        if(genreTrue){
        //checkbox.name? or checkbox.value? or checkbox.id?
            addGenre(checkbox.id);
        }
        if(datesTrue){
            addDates(checkbox.id);
        }
        if(sizeTrue){
            addSize(checkbox.id);
        }
    });*/
    
    let input = document.getElementById("homeSearch").value;
    let genre = await getGenre(input);
    alert(genre);
    const res = await fetch("../backend/db-api/search_genre.php",{
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },

        body: JSON.stringify({
            music_genre: genre
            //prevconcerts: prevconvertList,
            //distances: distanceList
        })
    });

    let data = await res.json();
    console.log(data);

    displayArtists(data.artists);
}

function displayArtists(artists) {
    document.getElementById("searchResults").style.display = "block";
    document.getElementById("featuredArtists").style.display = "none";
    document.getElementById("map").style.display = "none";

    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = artists.map(artist => `
        <div class="artistCard">
            <div class = "artist-info">
                <h2>${artist.artist_name}</h2>
                <p>Genre:${artist.music_genre}</p>
                <p>${artist.location_city}, ${artist.location_region}</p>
                <p>${artist.insta_handle}</p>
            </div>
        </div>
    `).join("");
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

navigator.geolocation.getCurrentPosition(function(position) {
  userLatitude = position.coords.latitude;
  userLongitude = position.coords.longitude;

  setUserLocation(userLongitude, userLatitude);
  console.log("User location set to:", userLatitude, userLongitude);
  
  // Initialize map after geolocation is ready
  initializeMap();
  updateRadiusCircle(10);
  userMarker.bringToFront(); // Bring circle marker to the front
});


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

// Add map marker for concert location
function addMarker(latitude, longitude, concertInfo)
{
    const marker = L.marker([latitude, longitude]).addTo(map);
    marker.bindPopup(concertInfo);
}