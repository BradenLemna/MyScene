//--------------------------------------------
// Stadia Maps API Call Functions
// These functions call the Stadia Maps API to get map data
// Author: Braden Lemna
//--------------------------------------------

const apiKey = 'null' // Input server side to prevent unwanted use

export async function autoCompleteAddress(address) // Calls the Stadia Maps api to autocomplete the given address
{
    const url = 'https://api.stadiamaps.com/geocoding/v2/autocomplete?api_key=' + apiKey + '&text=' + encodeURIComponent(address)
    
    const response = await fetch(url)
    const data = await response.json()
    const suggestions = []

    for(let i = 0; i < data.features.length; i++) {
        suggestions.push(data.features[i].properties.name + ', ' + data.features[i].properties.coarse_location + ' gid: ' + data.features[i].properties.gid)
    }
    return suggestions // Return all suggestions
}

export async function getCoordinates(gid) // Calls the Stadia Maps api to get the coordinates of the given gid
{
    const url = 'https://api.stadiamaps.com/geocoding/v2/place_details?api_key=' + apiKey + '&ids=' + encodeURIComponent(gid)

    const response = await fetch(url)
    const data = await response.json()
    const longitude = data.bbox[0]
    const latitude = data.bbox[3]
    const coordinates = [latitude, longitude]
    return coordinates
}