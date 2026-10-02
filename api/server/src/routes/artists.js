// Artist routes — LastFM genre lookups plus proxies to the PHP db-api
// endpoints that read/write the MyScene MySQL database.
//
//   GET  /getGenre?artist=...        -> { genre }
//   GET  /getSimilarArtists?genre=.. -> { artists: [...] }
//   GET  /getFeaturedArtists         -> { featured_artists: [...] }
//   GET  /getArtistInfo?artist=...   -> { artistInfo: {...} }
//   GET  /getArtistAmount            -> { artistAmount: number }
//   GET  /getGenreList               -> { genres: [...] }
//   GET  /getArtistEvents?artist=... -> { events: [...] }
//   GET  /getNearbyArtists?lat=..&lon=..&radius=.. -> { artists: [...] }
//   POST /add_artist                 -> { success, id, message }
//   POST /add_event                  -> { success, id, message }
//
// 400/404/409 answers from the PHP db-api are passed through to the client
// with their original status (see services/dbApi.js); unreachable PHP layer
// or timeouts surface as 502/504.

import { Router } from 'express';

import { dbApi } from '../services/dbApi.js';
import { getTopGenre } from '../services/lastFm.js';
import { searchPlace } from '../services/locationIQ.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    floatField,
    optionalNumberQuery,
    requireFields,
    requireNumberQuery,
    requireQuery,
    strField,
} from '../utils/validate.js';

const router = Router();

router.get('/getGenre', asyncHandler(async (req, res) => {
    const artist = requireQuery(req, 'artist');
    const genre = await getTopGenre(artist);
    res.json({ genre });
}));

router.get('/getSimilarArtists', asyncHandler(async (req, res) => {
    const genre = requireQuery(req, 'genre');
    const data = await dbApi.searchGenre(genre);
    res.json({ artists: Array.isArray(data?.artists) ? data.artists : [] });
}));

router.get('/getFeaturedArtists', asyncHandler(async (req, res) => {
    const data = await dbApi.getFeaturedArtists();
    res.json({
        featured_artists: Array.isArray(data?.featured_artists) ? data.featured_artists : [],
    });
}));

router.get('/getArtistInfo', asyncHandler(async (req, res) => {
    const artist = requireQuery(req, 'artist');
    const artistInfo = await dbApi.getArtist(artist);
    res.json({ artistInfo });
}));

router.get('/getArtistAmount', asyncHandler(async (req, res) => {
    const data = await dbApi.getArtistAmount();
    res.json({ artistAmount: data?.artistAmount ?? 0 });
}));

router.get('/getGenreList', asyncHandler(async (req, res) => {
    const data = await dbApi.getGenreList();
    res.json({ genres: Array.isArray(data?.genres) ? data.genres : [] });
}));

router.get('/getArtistEvents', asyncHandler(async (req, res) => {
    const artist = requireQuery(req, 'artist');
    const data = await dbApi.getArtistEvents(artist);
    res.json({ events: Array.isArray(data?.events) ? data.events : [] });
}));

router.get('/getNearbyArtists', asyncHandler(async (req, res) => {
    const latitude = requireNumberQuery(req, 'lat');
    const longitude = requireNumberQuery(req, 'lon');
    const radius = optionalNumberQuery(req, 'radius', 10);
    const data = await dbApi.getNearbyArtists(latitude, longitude, radius);
    res.json({ artists: Array.isArray(data?.artists) ? data.artists : [] });
}));

/**
 * Best-effort geocode of "city, region" so new rows get map coordinates.
 * Never blocks the insert: a missing LocationIQ key, no match or an upstream
 * failure just leaves the coordinates null.
 */
async function geocodeOrNull(city, region) {
    try {
        const place = await searchPlace(`${city}, ${region}`);
        return place ? { latitude: place.lat, longitude: place.lon } : null;
    } catch (err) {
        console.warn(`[myscene:api] geocoding "${city}, ${region}" failed: ${err.message}`);
        return null;
    }
}

/** Use the caller's coordinates when both are given, else geocode. */
async function resolveCoordinates(body, city, region) {
    const latitude = floatField(body, 'latitude');
    const longitude = floatField(body, 'longitude');
    if (latitude !== null && longitude !== null) {
        return { latitude, longitude };
    }
    return (await geocodeOrNull(city, region)) ?? { latitude: null, longitude: null };
}

router.post('/add_artist', asyncHandler(async (req, res) => {
    const body = requireFields(req.body, [
        'artist_name',
        'location_city',
        'location_region',
        'music_genre',
    ]);

    const city = strField(body, 'location_city');
    const region = strField(body, 'location_region');
    const { latitude, longitude } = await resolveCoordinates(body, city, region);

    const result = await dbApi.addArtist({
        artist_name: strField(body, 'artist_name'),
        location_city: city,
        location_region: region,
        music_genre: strField(body, 'music_genre'),
        insta_handle: strField(body, 'insta_handle'),
        image_src: strField(body, 'image_src'),
        longitude,
        latitude,
    });

    res.json(result);
}));

router.post('/add_event', asyncHandler(async (req, res) => {
    const body = requireFields(req.body, [
        'artist_name',
        'venue_name',
        'location_city',
        'location_region',
        'event_date',
    ]);

    const city = strField(body, 'location_city');
    const region = strField(body, 'location_region');
    const venue = strField(body, 'venue_name');

    // Prefer the venue itself; fall back to the city centre.
    let coords = { latitude: floatField(body, 'latitude'), longitude: floatField(body, 'longitude') };
    if (coords.latitude === null || coords.longitude === null) {
        coords = (await geocodeOrNull(`${venue}, ${city}`, region))
            ?? (await geocodeOrNull(city, region))
            ?? { latitude: null, longitude: null };
    }

    const result = await dbApi.addEvent({
        artist_name: strField(body, 'artist_name'),
        venue_name: venue,
        location_city: city,
        location_region: region,
        event_date: strField(body, 'event_date'),
        event_time: strField(body, 'event_time'),
        ticket_url: strField(body, 'ticket_url'),
        latitude: coords.latitude,
        longitude: coords.longitude,
    });

    res.json(result);
}));

export default router;
