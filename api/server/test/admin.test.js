// Admin dashboard routes (Batch 3): analytics summary passthrough, the
// pending-artist queue, and artist approval — with the admin gate
// (401 without a session, 403 for non-admins). Run with `npm test`.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import request from 'supertest';

import {
    startMockDbApi,
    startMockLastFM,
    startMockLocationIQ,
    createTestApp,
    closeAll,
} from './helpers.js';

let dbApi;
let locationIQ;
let lastFM;
let app;

before(async () => {
    dbApi = await startMockDbApi();
    locationIQ = await startMockLocationIQ();
    lastFM = await startMockLastFM();
    app = await createTestApp({
        dbApi,
        locationIQ,
        lastFM,
        extraEnv: {
            RATE_LIMIT_DEFAULT_MAX: '100000',
            RATE_LIMIT_AUTH_MAX: '100000',
            RATE_LIMIT_WRITE_MAX: '100000',
            RATE_LIMIT_REGISTER_MAX: '100000',
        },
    });
});

after(async () => {
    await closeAll(dbApi, locationIQ, lastFM);
});

function sessionCookie(sessionId) {
    return { Cookie: `myscene_session=${sessionId}` };
}

// ---------- /getAnalyticsSummary ----------

test('GET /getAnalyticsSummary passes the summary through (default days)', async () => {
    const res = await request(app).get('/getAnalyticsSummary');
    assert.equal(res.status, 200);
    assert.equal(res.body.days, 30);
    assert.deepEqual(res.body.totals, { pageviews: 12, searches: 5, profile_views: 3 });
    assert.deepEqual(res.body.top_artists, [{ artist: 'The Belladonnas', views: 3 }]);
    assert.deepEqual(res.body.top_genres, [{ genre: 'Rock', searches: 2 }]);
    assert.deepEqual(res.body.daily_pageviews, [{ date: '2026-11-21', pageviews: 12 }]);
    const call = dbApi.state.calls.find((c) => c.path === '/get_analytics_summary.php');
    assert.deepEqual(call.body, { days: 30 });
});

test('GET /getAnalyticsSummary forwards an explicit window', async () => {
    const res = await request(app).get('/getAnalyticsSummary?days=365');
    assert.equal(res.status, 200);
    assert.equal(res.body.days, 365);
    const calls = dbApi.state.calls.filter((c) => c.path === '/get_analytics_summary.php');
    assert.deepEqual(calls.at(-1).body, { days: 365 });
});

test('GET /getAnalyticsSummary answers 400 for a window outside 30/90/365', async () => {
    const res = await request(app).get('/getAnalyticsSummary?days=7');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /days/);
});

test('GET /getAnalyticsSummary answers 400 for a non-numeric window', async () => {
    const res = await request(app).get('/getAnalyticsSummary?days=soon');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /days/);
});

// ---------- /getPendingArtists ----------

test('GET /getPendingArtists without a cookie answers 401', async () => {
    const res = await request(app).get('/getPendingArtists');
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Log in/);
});

test('GET /getPendingArtists answers 401 for an expired session', async () => {
    const res = await request(app).get('/getPendingArtists').set(sessionCookie('deadbeef'));
    assert.equal(res.status, 401);
});

test('GET /getPendingArtists answers 403 for a fan session', async () => {
    const res = await request(app).get('/getPendingArtists').set(sessionCookie('fan-session'));
    assert.equal(res.status, 403);
    assert.match(res.body.error, /Admin access/);
});

test('GET /getPendingArtists passes through for an admin session', async () => {
    const res = await request(app).get('/getPendingArtists').set(sessionCookie('admin-session'));
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.pending_artists));
    assert.deepEqual(res.body.pending_artists, [
        { username: 'pendinguser', created_at: '2026-11-20 12:00:00' },
    ]);
});

// ---------- /getVerifiedArtists ----------

test('GET /getVerifiedArtists without a cookie answers 401', async () => {
    const res = await request(app).get('/getVerifiedArtists');
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Log in/);
});

test('GET /getVerifiedArtists answers 401 for an expired session', async () => {
    const res = await request(app).get('/getVerifiedArtists').set(sessionCookie('deadbeef'));
    assert.equal(res.status, 401);
});

test('GET /getVerifiedArtists answers 403 for a fan session', async () => {
    const res = await request(app).get('/getVerifiedArtists').set(sessionCookie('fan-session'));
    assert.equal(res.status, 403);
    assert.match(res.body.error, /Admin access/);
});

test('GET /getVerifiedArtists answers 403 for a verified (non-admin) artist', async () => {
    const res = await request(app).get('/getVerifiedArtists').set(sessionCookie('artist-session'));
    assert.equal(res.status, 403);
});

test('GET /getVerifiedArtists passes through for an admin session', async () => {
    const res = await request(app).get('/getVerifiedArtists').set(sessionCookie('admin-session'));
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.verified_artists));
    assert.deepEqual(res.body.verified_artists, [
        { username: 'artistuser', created_at: '2026-11-01 09:00:00', artist_verified_at: '2026-11-10 10:30:00' },
        { username: 'adminuser', created_at: '2026-10-01 08:00:00', artist_verified_at: null },
    ]);
});

// ---------- /setArtistStatus ----------

test('POST /setArtistStatus without a cookie answers 401', async () => {
    const res = await request(app)
        .post('/setArtistStatus')
        .send({ target_username: 'pendinguser', status: 'verified' });
    assert.equal(res.status, 401);
});

test('POST /setArtistStatus answers 401 for an expired session', async () => {
    const res = await request(app)
        .post('/setArtistStatus')
        .set(sessionCookie('deadbeef'))
        .send({ target_username: 'pendinguser', status: 'verified' });
    assert.equal(res.status, 401);
});

test('POST /setArtistStatus answers 403 for a fan session', async () => {
    const res = await request(app)
        .post('/setArtistStatus')
        .set(sessionCookie('fan-session'))
        .send({ target_username: 'pendinguser', status: 'verified' });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /Admin access/);
});

test('POST /setArtistStatus answers 403 for a verified (non-admin) artist', async () => {
    const res = await request(app)
        .post('/setArtistStatus')
        .set(sessionCookie('artist-session'))
        .send({ target_username: 'pendinguser', status: 'verified' });
    assert.equal(res.status, 403);
});

test('POST /setArtistStatus answers 400 for a bad status', async () => {
    const res = await request(app)
        .post('/setArtistStatus')
        .set(sessionCookie('admin-session'))
        .send({ target_username: 'pendinguser', status: 'hacker' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /status/);
});

test('POST /setArtistStatus answers 400 for a missing field', async () => {
    const res = await request(app)
        .post('/setArtistStatus')
        .set(sessionCookie('admin-session'))
        .send({ target_username: 'pendinguser' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Missing required field/);
});

test('POST /setArtistStatus approves for an admin session', async () => {
    const res = await request(app)
        .post('/setArtistStatus')
        .set(sessionCookie('admin-session'))
        .send({ target_username: 'pendinguser', status: 'verified' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.artist_status, 'verified');
    const calls = dbApi.state.calls.filter((c) => c.path === '/set_artist_status.php');
    assert.deepEqual(calls.at(-1).body, {
        target_username: 'pendinguser',
        status: 'verified',
        // The admin's session-verified username is forwarded as the
        // activity-feed actor.
        actor_username: 'adminuser',
    });
});

test('POST /setArtistStatus passes through an unknown-user 404', async () => {
    const res = await request(app)
        .post('/setArtistStatus')
        .set(sessionCookie('admin-session'))
        .send({ target_username: 'ghost', status: 'verified' });
    assert.equal(res.status, 404);
    assert.match(res.body.error, /User not found/);
});

// ---------- /getRecentActivity ----------

test('GET /getRecentActivity without a cookie answers 401', async () => {
    const res = await request(app).get('/getRecentActivity');
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Log in/);
});

test('GET /getRecentActivity answers 401 for an expired session', async () => {
    const res = await request(app).get('/getRecentActivity').set(sessionCookie('deadbeef'));
    assert.equal(res.status, 401);
});

test('GET /getRecentActivity answers 403 for a fan session', async () => {
    const res = await request(app).get('/getRecentActivity').set(sessionCookie('fan-session'));
    assert.equal(res.status, 403);
    assert.match(res.body.error, /Admin access/);
});

test('GET /getRecentActivity answers 403 for a verified (non-admin) artist', async () => {
    const res = await request(app).get('/getRecentActivity').set(sessionCookie('artist-session'));
    assert.equal(res.status, 403);
});

test('GET /getRecentActivity passes through the feed for an admin session', async () => {
    const res = await request(app).get('/getRecentActivity').set(sessionCookie('admin-session'));
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.recent_activity));
    assert.equal(res.body.recent_activity.length, 3);
    assert.deepEqual(res.body.recent_activity[0], {
        actor_username: 'adminuser',
        action: 'artist_approved',
        target: 'pendinguser',
        created_at: '2026-11-22 15:04:05',
    });
});
