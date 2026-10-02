// LastFM API calls. The key comes from the LASTFM_API_KEY environment
// variable and is never logged.

import { config } from '../config.js';
import { UpstreamError, ApiError } from '../utils/errors.js';
import { fetchJson } from './http.js';

const LASTFM_URL = config.lastFmBaseUrl;

/**
 * Returns the top genre tag for an artist from LastFM.
 * @returns {Promise<string>} the genre name
 * @throws {ApiError} 500 when the server has no LastFM key configured
 * @throws {UpstreamError} 404 when LastFM can't resolve the artist or has no tags
 */
export async function getTopGenre(artist) {
    if (!config.lastFmApiKey) {
        throw new ApiError('Server is missing the LASTFM_API_KEY setting.', 500);
    }

    const params = new URLSearchParams({
        method: 'artist.gettoptags',
        artist,
        api_key: config.lastFmApiKey,
        format: 'json',
    });

    const { data } = await fetchJson(`${LASTFM_URL}/?${params}`, {
        timeoutMs: config.upstreamTimeoutMs,
        upstreamName: 'LastFM',
    });

    // LastFM signals problems with { "error": <code>, "message": "..." }.
    if (!data || typeof data !== 'object' || data.error) {
        const detail = data && typeof data.message === 'string' ? data.message : 'unknown error';
        throw new UpstreamError(`LastFM could not resolve artist "${artist}": ${detail}`, {
            status: 404,
            clientMessage: 'That artist could not be found. Try a different name.',
        });
    }

    const tags = data.toptags?.tag;
    if (!Array.isArray(tags) || tags.length === 0) {
        throw new UpstreamError(`LastFM returned no genre tags for artist "${artist}"`, {
            status: 404,
            clientMessage: `No genre found for artist "${artist}".`,
        });
    }

    return tags[0].name;
}
