//--------------------------------------------
// LastFM API Call Functions
// These functions call the LastFM API to get the genre of a given artist
// Author: Braden Lemna
//--------------------------------------------

export async function getGenre(artist) // Calls the LastFM api to get the genre of the artist
{
    const apiKey = 'null' // Input server side to prevent unwanted use
    const url = 'https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist='+ artist + '&api_key=' + apiKey + '&format=json'

    console.log(url)
    const response = await fetch(url)
    const data = await response.json()
    const genres = data.toptags.tag

    console.log('Top genres for', artist, ':', genres.slice(0, 4))
    console.log(genres[0].name)
    return genres[0].name
}