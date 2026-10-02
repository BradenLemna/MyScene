//----------------------------------------------
// Client-side location handling (shared user location + distance checks)
// Author: Braden Lemna
//----------------------------------------------

let userLongitude = 94.17; // Longitude and Latitude of UofA for original variable
let userLatitude = 36.07;

export function setUserLocation(longitude, latitude)
{
    userLongitude = longitude;
    userLatitude = latitude;
}

export function calculateDistance(longitude, latitude)
{
    let R = 3959 // Radius of Earth in Miles

    let longDif = Math.abs(userLongitude - longitude) * Math.PI / 180
    let latDif = Math.abs(userLatitude - latitude) * Math.PI / 180
    let halfLongDif = longDif / 2
    let halfLatDif = latDif / 2

    // Haversine formula
    let a = (Math.sin(halfLatDif) * Math.sin(halfLatDif)) + Math.cos(userLatitude * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) * (Math.sin(halfLongDif) * Math.sin(halfLongDif))
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c;
}

export function testInRange(longitude, latitude, range)
{
    let dist = calculateDistance(longitude, latitude)

    if (dist <= range)
    {
        return true
    }
    else
    {
        return false
    }
}