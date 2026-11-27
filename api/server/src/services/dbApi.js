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
    getArtistEvents: (artistName) => callDb('get_artist_events.php', { artist_name: artistName }),
    getNearbyEvents: (latitude, longitude, radius, days) =>
        callDb('get_nearby_events.php', { latitude, longitude, radius, days }),
    getArtistsWithEvents: (days) => callDb('get_artists_with_events.php', { days }),
    addEvent: (payload) => callDb('add_event.php', payload),
    getNearbyArtists: (latitude, longitude, radius) =>
        callDb('get_nearby_artists.php', { latitude, longitude, radius }),
    verifyUser: (username, password) => callDb('verify_user.php', { username, password }),
    registerUser: (username, password) => callDb('register_user.php', { username, password }),
    createSession: (username, password) => callDb('create_session.php', { username, password }),
    logout: (sessionId) => callDb('logout.php', { session_id: sessionId }),
    me: (sessionId) => callDb('me.php', { session_id: sessionId }),
    requestArtistAccess: (sessionId) => callDb('request_artist_access.php', { session_id: sessionId }),
    trackEvent: (payload) => callDb('track_event.php', payload),
    getAnalyticsSummary: (days) => callDb('get_analytics_summary.php', { days }),
    getPendingArtists: () => callDb('get_pending_artists.php'),
    getVerifiedArtists: () => callDb('get_verified_artists.php'),
    setArtistStatus: (targetUsername, status, actorUsername) =>
        callDb('set_artist_status.php', {
            target_username: targetUsername,
            status,
            actor_username: actorUsername,
        }),
    getRecentActivity: () => callDb('get_recent_activity.php'),
    getFavorites: (username) => callDb('get_favorites.php', { username }),
    toggleFavorite: (username, artistName) =>
        callDb('toggle_favorite.php', { username, artist_name: artistName }),
};
