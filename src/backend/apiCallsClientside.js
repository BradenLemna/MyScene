//--------------------------------------------
// Client side API calls for MyScene
// Author: Braden Lemna
// Calls to the server for API calls to prevent unwanted use of API keys
//--------------------------------------------

export async function autoCompleteCity(city) // Calls the server to autocomplete the given city
{
    const response = await fetch('https://api.myscene.live/autocomplete' + '?city=' + encodeURIComponent(city))
    const data = await response.json()
    return data.suggestions // Return all suggestions
}

export async function getLatitude(gid) // Calls the server to get the latitude of the given gid
{
    const response = await fetch('https://api.myscene.live/getLatitude' + '?gid=' + encodeURIComponent(gid))
    const data = await response.json()
    return data.latitude
}

export async function getLongitude(gid) // Calls the server to get the longitude of the given gid
{
    const response = await fetch('https://api.myscene.live/getLongitude' + '?gid=' + encodeURIComponent(gid))
    const data = await response.json()
    return data.longitude
}

export async function getLocation(gid) // Calls the server to get the location of the given gid
{
    const response = await fetch('https://api.myscene.live/getLocation' + '?gid=' + encodeURIComponent(gid))
    const data = await response.json()
    return data.location
}

export async function getGenre(artist) // Calls the server to get the genre of the given artist
{
    const response = await fetch('https://api.myscene.live/getGenre' + '?artist=' + encodeURIComponent(artist))
    const data = await response.json()
    return data.genre
}

export async function getSimilarArtists(genre) // Calls the server to get the similar artists of the given genre
{
    const response = await fetch('https://api.myscene.live/getSimilarArtists' + '?genre=' + encodeURIComponent(genre))
    const data = await response.json()
    return data.artists
}

export async function getFeaturedArtists() // Calls the server to get the featured artists
{
    const response = await fetch('https://api.myscene.live/getFeaturedArtists')
    const data = await response.json()
    return data.artists
}

export async function getArtistInfo(artist) // Calls the server to get the artist info of the given artist
{
    const response = await fetch('https://api.myscene.live/getArtistInfo' + '?artist=' + encodeURIComponent(artist))
    const data = await response.json()
    return data.artistInfo
}

export async function getArtistAmount() // Calls the server to get the amount of artists in the database
{
    const response = await fetch('https://api.myscene.live/getArtistAmount')
    const data = await response.json()
    return data.amount
}

export async function getArtistEvents(artist) // Calls the server to get the events of the given artist
{
    const response = await fetch('https://api.myscene.live/getArtistEvents' + '?artist=' + encodeURIComponent(artist))
    const data = await response.json()
    return data.events
}

export async function getGenreList() // Calls the server to get the list of genres
{
    const response = await fetch('https://api.myscene.live/getGenreList')
    const data = await response.json()
    return data.genres
}