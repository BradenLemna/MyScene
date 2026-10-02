// Artist routes — LastFM genre lookups plus proxies to the PHP db-api
// endpoints that read/write the MyScene MySQL database.
//
//   GET  /getGenre?artist=...        -> { genre }
//   GET  /getSimilarArtists?genre=.. -> { artists: [...] }
//   GET  /getFeaturedArtists         -> { featured_artists: [...] }
//   GET  /getArtistInfo?artist=...   -> { artistInfo: {...} }
//   GET  /getArtistAmount            -> { artistAmount: number }
//   GET  /getGenreList               -> { genres: [...] }
//   GET  /getArtistEvents?artist=... -> { events: [] } (no events table yet)
//   POST /add_artist                 -> { success, id, message }
//
// 400/404/409 answers from the PHP db-api are passed through to the client
// with their original status (see services/dbApi.js); unreachable PHP layer
// or timeouts surface as 502/504.

import { Router } from 'express';

import { dbApi } from '../services/dbApi.js';
import { getTopGenre } from '../services/lastFm.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { floatField, requireFields, requireQuery, strField } from '../utils/validate.js';

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

// The database has no events table yet. Keep the contract stable for the
// frontend by always answering 200 with an empty list; swap this for a real
// db-api endpoint once events are added to the schema.
router.get('/getArtistEvents', asyncHandler(async (req, res) => {
    requireQuery(req, 'artist');
    res.json({ events: [] });
}));

router.post('/add_artist', asyncHandler(async (req, res) => {
    const body = requireFields(req.body, [
        'artist_name',
        'location_city',
        'location_region',
        'music_genre',
    ]);

    const result = await dbApi.addArtist({
        artist_name: strField(body, 'artist_name'),
        location_city: strField(body, 'location_city'),
        location_region: strField(body, 'location_region'),
        music_genre: strField(body, 'music_genre'),
        insta_handle: strField(body, 'insta_handle'),
        image_src: strField(body, 'image_src'),
        longitude: floatField(body, 'longitude'),
        latitude: floatField(body, 'latitude'),
    });

    res.json(result);
}));

export default router;
