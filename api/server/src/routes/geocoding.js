// Geocoding routes — proxy LocationIQ (OpenStreetMap-based) lookups so the
// frontend never needs the LocationIQ key.
//
//   GET /autocomplete?city=...   -> { suggestions: [{id,name,lat,lon}] }
//   GET /getLatitude?gid=...     -> { latitude: number }
//   GET /getLongitude?gid=...    -> { longitude: number }
//   GET /getLocation?gid=...     -> { location: string }
//
// The "gid" query name is a holdover from the old Stadia Maps layout; the
// value is a place name, which is resolved through a LocationIQ search.
// Repeated lookups for the same place are answered from the in-memory cache
// in services/locationIQ.js.

import { Router } from 'express';

import { autoCompleteCity, searchPlace } from '../services/locationIQ.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/errors.js';
import { requireQuery } from '../utils/validate.js';

const router = Router();

/** Geocode a place name or answer 404 when LocationIQ has no match. */
async function placeOrThrow(place) {
    const result = await searchPlace(place);
    if (result === null) {
        throw new ApiError(`No place found matching "${place}".`, 404);
    }
    return result;
}

router.get('/autocomplete', asyncHandler(async (req, res) => {
    const city = requireQuery(req, 'city');
    const suggestions = await autoCompleteCity(city);
    res.json({ suggestions });
}));

router.get('/getLatitude', asyncHandler(async (req, res) => {
    const place = requireQuery(req, 'gid');
    const { lat } = await placeOrThrow(place);
    res.json({ latitude: lat });
}));

router.get('/getLongitude', asyncHandler(async (req, res) => {
    const place = requireQuery(req, 'gid');
    const { lon } = await placeOrThrow(place);
    res.json({ longitude: lon });
}));

router.get('/getLocation', asyncHandler(async (req, res) => {
    const place = requireQuery(req, 'gid');
    const { name } = await placeOrThrow(place);
    res.json({ location: name });
}));

export default router;
