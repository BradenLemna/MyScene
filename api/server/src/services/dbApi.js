// Client for the PHP db-api endpoints (the layer that talks to MySQL).
//
// All calls are POSTs with a JSON body, matching the contract implemented in
// api/db/*.php. 400/404/409 responses from PHP are passed
// through to the API client with their original status and error text;
// anything else becomes a 502.

import { config } from '../config.js';
import { fetchJson } from './http.js';

// Statuses the client should see verbatim from the PHP db-api.
const PASSTHROUGH_STATUSES = [400, 404, 409];

async function callDb(endpoint, body) {
    const { data } = await fetchJson(`${config.dbApiBaseUrl}/${endpoint}`, {
        method: 'POST',
        body: body ?? {},
        timeoutMs: config.upstreamTimeoutMs,
        passthrough: PASSTHROUGH_STATUSES,
        upstreamName: `db-api/${endpoint}`,
    });
    return data;
}

export const dbApi = {
    addArtist: (payload) => callDb('add_artist.php', payload),
    getArtist: (artistName) => callDb('get_artist.php', { artist_name: artistName }),
    getArtistAmount: () => callDb('get_artist_amount.php'),
    getFeaturedArtists: () => callDb('get_featured_artists.php'),
    searchGenre: (genre) => callDb('search_genre.php', { music_genre: genre }),
    getGenreList: () => callDb('get_genre_list.php'),
    verifyUser: (username, password) => callDb('verify_user.php', { username, password }),
};
