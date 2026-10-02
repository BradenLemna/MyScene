//--------------------------------------------
// Client side API calls for MyScene
// Author: Braden Lemna
// Calls to the server for API calls to prevent unwanted use of API keys
//
// All calls go through the MyScene API server (api/server),
// which proxies the upstream geocoding/LastFM services and the PHP db-api
// database endpoints. Keys never reach the browser.
//
// The API base URL defaults to the production host and can be overridden
// for local development by setting window.MYSCENE_API_BASE in the page
// (e.g. 'http://127.0.0.1:3000') — no code edits needed.
//--------------------------------------------

const API_BASE = (typeof window !== 'undefined' && window.MYSCENE_API_BASE)
    ? window.MYSCENE_API_BASE.replace(/\/+$/, '')
    : 'https://api.myscene.live';

/**
 * Fetch a JSON endpoint on the MyScene API server.
 * Throws an Error carrying the server's error message when the response is
 * not ok, so callers can surface the real reason instead of crashing on
 * an undefined field.
 */
async function apiFetch(path)
{
    const response = await fetch(API_BASE + path);

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null; // non-JSON body — treat as a server problem below
    }

    if (!response.ok) {
        const message = data && typeof data.error === 'string'
            ? data.error
            : `API request failed (HTTP ${response.status}).`;
        throw new Error(message);
    }

    return data;
}

export async function autoCompleteCity(city) // Calls the server to autocomplete the given city
{
    const data = await apiFetch('/autocomplete?city=' + encodeURIComponent(city));
    return data.suggestions // Return all suggestions
}

export async function getLatitude(gid) // Calls the server to get the latitude of the given gid
{
    const data = await apiFetch('/getLatitude?gid=' + encodeURIComponent(gid));
    return data.latitude
}

export async function getLongitude(gid) // Calls the server to get the longitude of the given gid
{
    const data = await apiFetch('/getLongitude?gid=' + encodeURIComponent(gid));
    return data.longitude
}

export async function getLocation(gid) // Calls the server to get the location of the given gid
{
    const data = await apiFetch('/getLocation?gid=' + encodeURIComponent(gid));
    return data.location
}

export async function getGenre(artist) // Calls the server to get the genre of the given artist
{
    const data = await apiFetch('/getGenre?artist=' + encodeURIComponent(artist));
    return data.genre
}

export async function getSimilarArtists(genre) // Calls the server to get the similar artists of the given genre
{
    const data = await apiFetch('/getSimilarArtists?genre=' + encodeURIComponent(genre));
    return data.artists
}

export async function getFeaturedArtists() // Calls the server to get the featured artists
{
    const data = await apiFetch('/getFeaturedArtists');
    return data.featured_artists
}

export async function getArtistInfo(artist) // Calls the server to get the artist info of the given artist
{
    const data = await apiFetch('/getArtistInfo?artist=' + encodeURIComponent(artist));
    return data.artistInfo
}

export async function getArtistAmount() // Calls the server to get the amount of artists in the database
{
    const data = await apiFetch('/getArtistAmount');
    return data.artistAmount
}

export async function getArtistEvents(artist) // Calls the server to get the events of the given artist
{
    const data = await apiFetch('/getArtistEvents?artist=' + encodeURIComponent(artist));
    return data.events
}

export async function getGenreList() // Calls the server to get the list of genres
{
    const data = await apiFetch('/getGenreList');
    return data.genres
}
