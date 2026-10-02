// LocationIQ (OpenStreetMap-based) geocoding calls.
//
// The API key comes from the LOCATIONIQ_API_KEY environment variable and is
// never logged. Results of place searches are cached in memory for a short
// TTL so consecutive /getLatitude + /getLongitude calls for the same place
// only hit LocationIQ once.

import { config } from '../config.js';
import { UpstreamError, ApiError } from '../utils/errors.js';
import { fetchJson } from './http.js';

const BASE_URL = config.locationIqBaseUrl;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_MAX_ENTRIES = 500;

const cache = new Map();

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) {
        return null;
    }
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function cacheSet(key, value) {
    if (cache.size >= CACHE_MAX_ENTRIES) {
        // Map preserves insertion order — drop the oldest entry.
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
    }
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function requireKey() {
    if (!config.locationIQApiKey) {
        throw new ApiError('Server is missing the LOCATIONIQ_API_KEY setting.', 500);
    }
    return config.locationIQApiKey;
}

/**
 * Autocomplete suggestions for a city/country fragment.
 * @returns {Promise<Array<{id: string, name: string, lat: number, lon: number}>>}
 */
export async function autoCompleteCity(input) {
    const params = new URLSearchParams({
        key: requireKey(),
        format: 'json',
        q: input,
        limit: '4',
        dedupe: '1',
    });

    const { data } = await fetchJson(`${BASE_URL}/autocomplete.php?${params}`, {
        timeoutMs: config.upstreamTimeoutMs,
        upstreamName: 'LocationIQ',
    });

    if (!Array.isArray(data)) {
        throw new UpstreamError('Unexpected (non-array) response from LocationIQ autocomplete');
    }

    return data.slice(0, 4).map((item) => ({
        id: item.place_id,
        name: item.display_name,
        lat: Number(item.lat),
        lon: Number(item.lon),
    }));
}

/**
 * Geocode a place name to the best match.
 * @returns {Promise<{lat: number, lon: number, name: string} | null>} null when LocationIQ has no match
 */
export async function searchPlace(place) {
    const cacheKey = place.trim().toLowerCase();
    const hit = cacheGet(cacheKey);
    if (hit) {
        return hit;
    }

    const params = new URLSearchParams({
        key: requireKey(),
        format: 'json',
        q: place,
    });

    const { data } = await fetchJson(`${BASE_URL}/search.php?${params}`, {
        timeoutMs: config.upstreamTimeoutMs,
        upstreamName: 'LocationIQ',
    });

    if (!Array.isArray(data)) {
        throw new UpstreamError('Unexpected (non-array) response from LocationIQ search');
    }
    if (data.length === 0) {
        return null;
    }

    const best = data[0];
    const result = {
        lat: Number(best.lat),
        lon: Number(best.lon),
        name: best.display_name,
    };
    cacheSet(cacheKey, result);
    return result;
}
