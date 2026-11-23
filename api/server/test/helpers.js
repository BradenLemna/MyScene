// Shared test harness: mock upstreams (PHP db-api, LocationIQ, LastFM) on
// ephemeral ports, plus an app factory that imports the real Express app
// with its config pointed at the mocks.
//
// config.js freezes its settings at import time (and locationIQ.js /
// lastFm.js capture their base URLs at module load), so the environment must
// be set before the dynamic import() inside createTestApp() runs. Under
// `node --test` every test file runs in its own process, so per-file env
// setup is safe.

import http from 'node:http';

// Session ids the mock db-api recognises (see the 'me' case below). The
// ids are self-describing so the tests read like assertions.
export const MOCK_SESSIONS = {
    'fan-session': { username: 'fanuser', is_admin: false, artist_status: 'none' },
    'pending-session': { username: 'pendinguser', is_admin: false, artist_status: 'pending' },
    'artist-session': { username: 'artistuser', is_admin: false, artist_status: 'verified' },
    'admin-session': { username: 'adminuser', is_admin: true, artist_status: 'verified' },
};

function startMock(handler) {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            try {
                handler(req, res, body);
            } catch (err) {
                json(res, 500, { error: `mock handler crashed: ${err.message}` });
            }
        });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, url: `http://127.0.0.1:${port}` });
        });
    });
}

function json(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

/**
 * Mock of the PHP db-api layer. Answers with the same JSON shapes and
 * status codes the real endpoints use (see api/db/*.php). `state.calls`
 * records every request so tests can assert on what the API forwarded.
 */
export async function startMockDbApi() {
    const state = { calls: [] };
    const { server, url } = await startMock((req, res, body) => {
        let parsed = {};
        if (body) {
            try {
                parsed = JSON.parse(body);
            } catch {
                parsed = {};
            }
        }
        state.calls.push({ path: req.url, body: parsed });
        const endpoint = req.url.replace(/^\//, '').replace(/\.php$/, '');

        switch (endpoint) {
            case 'get_artist_amount':
                json(res, 200, { artistAmount: 42 });
                break;
            case 'get_genre_list':
                json(res, 200, { genres: ['Rock', 'Punk'] });
                break;
            case 'get_featured_artists':
                json(res, 200, { featured_artists: [{ artist_name: 'The Belladonnas' }] });
                break;
            case 'get_artist':
                if (parsed.artist_name === 'The Belladonnas') {
                    json(res, 200, { artist_name: 'The Belladonnas', music_genre: 'Rock' });
                } else {
                    json(res, 404, { error: 'Artist not found.' });
                }
                break;
            case 'add_artist':
                if (parsed.artist_name === 'Taken Name') {
                    json(res, 409, { error: 'An artist with that name already exists.' });
                } else {
                    json(res, 200, { success: true, id: 99, message: 'Artist added.' });
                }
                break;
            case 'add_event':
                if (parsed.venue_name === 'Dup Venue') {
                    json(res, 409, { error: 'That listing already exists.' });
                } else {
                    json(res, 200, { success: true, id: 100, message: 'Event added.' });
                }
                break;
            case 'get_artist_events':
                json(res, 200, { events: [] });
                break;
            case 'get_nearby_events':
                // (0, 0) is the mock's "nowhere" point: no events there, so
                // the route's empty-results path is testable.
                if (parsed.latitude === 0 && parsed.longitude === 0) {
                    json(res, 200, { events: [] });
                } else {
                    json(res, 200, {
                        events: [
                            {
                                id: 101,
                                artist_name: 'The Belladonnas',
                                venue_name: 'Smoke Venue',
                                location_city: 'Fayetteville',
                                location_region: 'AR',
                                event_date: '2026-12-01',
                                event_time: '20:00:00',
                                ticket_url: 'https://tickets.example/belladonnas',
                                latitude: 36.0626,
                                longitude: -94.1574,
                                distance_miles: 0.4,
                            },
                        ],
                    });
                }
                break;
            case 'get_artists_with_events':
                json(res, 200, {
                    artists: [
                        { artist_name: 'The Belladonnas', music_genre: 'Rock', location_city: 'Fayetteville', location_region: 'AR' },
                        { artist_name: 'Keathley', music_genre: 'Indie', location_city: 'Oklahoma City', location_region: 'OK' },
                    ],
                });
                break;
            case 'get_nearby_artists':
                json(res, 200, { artists: [] });
                break;
            case 'verify_user':
                json(res, 200, { verified: parsed.username === 'gooduser' && parsed.password === 'right' });
                break;
            case 'register_user':
                if (parsed.username === 'taken') {
                    json(res, 409, { error: 'That username is already taken.' });
                } else if (typeof parsed.password !== 'string' || parsed.password.length < 8) {
                    json(res, 400, { error: 'Field "password" must be at least 8 characters.' });
                } else if (!/^[a-zA-Z0-9._]{3,20}$/.test(parsed.username || '')) {
                    json(res, 400, { error: 'Field "username" must be 3-20 characters (letters, numbers, dots, underscores).' });
                } else {
                    json(res, 200, { success: true });
                }
                break;
            case 'create_session':
                if (parsed.username === 'gooduser' && parsed.password === 'right') {
                    json(res, 200, { verified: true, session_id: 'a'.repeat(64) });
                } else {
                    json(res, 200, { verified: false });
                }
                break;
            case 'logout':
                json(res, 200, { success: true });
                break;
            case 'me': {
                const me = MOCK_SESSIONS[parsed.session_id];
                if (me) {
                    json(res, 200, me);
                } else {
                    json(res, 404, { error: 'Session not found or expired.' });
                }
                break;
            }
            case 'request_artist_access':
                if (parsed.session_id === 'fan-session') {
                    json(res, 200, { success: true, artist_status: 'pending' });
                } else if (MOCK_SESSIONS[parsed.session_id]?.artist_status === 'verified') {
                    // No-op for verified accounts.
                    json(res, 200, { success: true, artist_status: 'verified' });
                } else {
                    json(res, 404, { error: 'Session not found or expired.' });
                }
                break;
            case 'track_event':
                if (!['index', 'viewArtist', 'addArtist', 'login', 'register', 'analytics', 'shows'].includes(parsed.page)) {
                    json(res, 400, { error: 'Field "page" is not a known page.' });
                } else {
                    json(res, 200, { success: true });
                }
                break;
            case 'get_analytics_summary':
                json(res, 200, {
                    days: typeof parsed.days === 'number' ? parsed.days : 30,
                    totals: { pageviews: 12, searches: 5, profile_views: 3 },
                    top_artists: [{ artist: 'The Belladonnas', views: 3 }],
                    top_genres: [{ genre: 'Rock', searches: 2 }],
                    daily_pageviews: [{ date: '2026-11-21', pageviews: 12 }],
                    daily_searches: [{ date: '2026-11-21', searches: 5 }],
                    daily_profile_views: [{ date: '2026-11-21', profile_views: 3 }],
                });
                break;
            case 'get_pending_artists':
                json(res, 200, {
                    pending_artists: [
                        { username: 'pendinguser', created_at: '2026-11-20 12:00:00' },
                    ],
                });
                break;
            case 'get_verified_artists':
                json(res, 200, {
                    verified_artists: [
                        { username: 'artistuser', created_at: '2026-11-01 09:00:00', artist_verified_at: '2026-11-10 10:30:00' },
                        { username: 'adminuser', created_at: '2026-10-01 08:00:00', artist_verified_at: null },
                    ],
                });
                break;
            case 'set_artist_status':
                if (parsed.status !== 'verified' && parsed.status !== 'none') {
                    json(res, 400, { error: 'Field "status" must be one of: verified, none.' });
                } else if (parsed.target_username === 'ghost') {
                    json(res, 404, { error: 'User not found.' });
                } else {
                    json(res, 200, {
                        success: true,
                        username: parsed.target_username,
                        artist_status: parsed.status,
                    });
                }
                break;
            case 'get_recent_activity':
                json(res, 200, {
                    recent_activity: [
                        { actor_username: 'adminuser', action: 'artist_approved', target: 'pendinguser', created_at: '2026-11-22 15:04:05' },
                        { actor_username: 'artistuser', action: 'event_added', target: 'The Belladonnas — Test Hall', created_at: '2026-11-22 14:30:00' },
                        { actor_username: 'artistuser', action: 'artist_added', target: 'The Belladonnas', created_at: '2026-11-22 14:00:00' },
                    ],
                });
                break;
            default:
                json(res, 404, { error: `No such endpoint: ${req.url}` });
        }
    });
    return { server, url, state };
}

/** Mock of the LocationIQ geocoding API (autocomplete + search). */
export async function startMockLocationIQ() {
    const { server, url } = await startMock((req, res) => {
        const u = new URL(req.url, 'http://localhost');
        if (u.pathname === '/autocomplete.php') {
            json(res, 200, [
                { place_id: '1', display_name: 'Fayetteville, Arkansas', lat: '36.0626', lon: '-94.1574' },
            ]);
        } else if (u.pathname === '/search.php') {
            const q = (u.searchParams.get('q') || '').toLowerCase();
            if (q.includes('nowhere')) {
                json(res, 200, []);
            } else {
                json(res, 200, [
                    { place_id: '1', display_name: 'Fayetteville, Arkansas, USA', lat: '36.0626', lon: '-94.1574' },
                ]);
            }
        } else {
            json(res, 404, []);
        }
    });
    return { server, url };
}

/** Mock of the LastFM API (artist.gettoptags). */
export async function startMockLastFM() {
    const { server, url } = await startMock((req, res) => {
        const u = new URL(req.url, 'http://localhost');
        const artist = u.searchParams.get('artist') || '';
        if (artist === 'Unknown Band') {
            json(res, 200, { error: 6, message: 'The user/band you entered does not exist.' });
        } else {
            json(res, 200, { toptags: { tag: [{ name: 'indie rock' }] } });
        }
    });
    return { server, url };
}

/**
 * Point the environment at the mocks and import the real app.
 * `extraEnv` overrides individual settings (e.g. tiny rate limits).
 */
export async function createTestApp({ dbApi, locationIQ, lastFM, extraEnv = {} } = {}) {
    process.env.DB_API_BASE_URL = dbApi.url;
    process.env.LOCATIONIQ_BASE_URL = locationIQ.url;
    process.env.LASTFM_BASE_URL = lastFM.url;
    process.env.LOCATIONIQ_API_KEY = 'test-locationiq-key';
    process.env.LASTFM_API_KEY = 'test-lastfm-key';
    process.env.ALLOWED_ORIGINS = 'http://localhost:8000';
    Object.assign(process.env, extraEnv);

    const { createApp } = await import('../src/app.js');
    return createApp();
}

export async function closeAll(...mocks) {
    await Promise.all(mocks.map((m) => new Promise((resolve) => m.server.close(resolve))));
}
