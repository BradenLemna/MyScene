// Auth routes (Batch 2): registration, login + session cookie, /me,
// artist-access requests, logout, and the verified-artist gate on the
// write routes. Run with `npm test`.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import request from 'supertest';

import {
    MOCK_SESSIONS,
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

const artistBody = {
    artist_name: 'Fresh Band',
    location_city: 'Fayetteville',
    location_region: 'AR',
    music_genre: 'Rock',
    latitude: 36.0,
    longitude: -94.0,
};

const eventBody = {
    artist_name: 'The Belladonnas',
    venue_name: 'Test Hall',
    location_city: 'Fayetteville',
    location_region: 'AR',
    event_date: '2026-12-01',
    latitude: 36.0,
    longitude: -94.0,
};

// ---------- /register ----------

test('POST /register creates a fan account', async () => {
    const res = await request(app).post('/register').send({ username: 'newfan', password: 'longenough' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const call = dbApi.state.calls.find((c) => c.path === '/register_user.php');
    assert.deepEqual(call.body, { username: 'newfan', password: 'longenough' });
});

test('POST /register passes through a duplicate 409', async () => {
    const res = await request(app).post('/register').send({ username: 'taken', password: 'longenough' });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already taken/);
});

test('POST /register passes through a short-password 400', async () => {
    const res = await request(app).post('/register').send({ username: 'newfan', password: 'short' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /password/);
});

test('POST /register without fields answers 400', async () => {
    const res = await request(app).post('/register').send({ username: 'newfan' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Missing required field/);
});

// ---------- /login ----------

test('POST /login sets the session cookie on success', async () => {
    const res = await request(app).post('/login').send({ username: 'gooduser', password: 'right' });
    assert.equal(res.status, 200);
    assert.equal(res.body.verified, true);
    assert.equal(typeof res.body.session_id, 'string');
    const cookie = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('myscene_session='));
    assert.ok(cookie, 'expected a myscene_session Set-Cookie header');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Max-Age=2592000/i); // 30 days
    assert.match(cookie, /Path=\//i);
});

test('POST /login answers verified:false without a cookie for a bad pair', async () => {
    const res = await request(app).post('/login').send({ username: 'gooduser', password: 'wrong' });
    assert.equal(res.status, 200);
    assert.equal(res.body.verified, false);
    assert.equal(res.body.session_id, undefined);
    assert.equal(res.headers['set-cookie'], undefined);
});

test('POST /login without fields answers 400', async () => {
    const res = await request(app).post('/login').send({ username: 'gooduser' });
    assert.equal(res.status, 400);
});

// ---------- /me ----------

test('GET /me without a cookie answers 401', async () => {
    const res = await request(app).get('/me');
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Log in/);
});

test('GET /me passes through an unknown-session 404', async () => {
    const res = await request(app).get('/me').set(sessionCookie('deadbeef'));
    assert.equal(res.status, 404);
    assert.match(res.body.error, /Session not found/);
});

test('GET /me returns the fan account for a fan session', async () => {
    const res = await request(app).get('/me').set(sessionCookie('fan-session'));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, MOCK_SESSIONS['fan-session']);
});

test('GET /me returns is_admin for an admin session', async () => {
    const res = await request(app).get('/me').set(sessionCookie('admin-session'));
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'adminuser');
    assert.equal(res.body.is_admin, true);
    assert.equal(res.body.artist_status, 'verified');
});

// ---------- /request_artist_access ----------

test('POST /request_artist_access without a cookie answers 401', async () => {
    const res = await request(app).post('/request_artist_access');
    assert.equal(res.status, 401);
});

test('POST /request_artist_access moves a fan to pending', async () => {
    const res = await request(app).post('/request_artist_access').set(sessionCookie('fan-session'));
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.artist_status, 'pending');
});

test('POST /request_artist_access is a no-op for a verified artist', async () => {
    const res = await request(app).post('/request_artist_access').set(sessionCookie('artist-session'));
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.artist_status, 'verified');
});

// ---------- gated writes ----------

test('POST /add_artist without a session answers 401', async () => {
    const res = await request(app).post('/add_artist').send(artistBody);
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Log in/);
});

test('POST /add_artist answers 401 for an expired session', async () => {
    const res = await request(app).post('/add_artist').set(sessionCookie('deadbeef')).send(artistBody);
    assert.equal(res.status, 401);
});

test('POST /add_artist answers 403 for a fan session', async () => {
    const res = await request(app).post('/add_artist').set(sessionCookie('fan-session')).send(artistBody);
    assert.equal(res.status, 403);
    assert.match(res.body.error, /verified artist/);
});

test('POST /add_artist answers 403 for a pending session', async () => {
    const res = await request(app).post('/add_artist').set(sessionCookie('pending-session')).send(artistBody);
    assert.equal(res.status, 403);
});

test('POST /add_artist passes through for a verified artist', async () => {
    const res = await request(app).post('/add_artist').set(sessionCookie('artist-session')).send(artistBody);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
});

test('POST /add_event without a session answers 401', async () => {
    const res = await request(app).post('/add_event').send(eventBody);
    assert.equal(res.status, 401);
});

test('POST /add_event answers 403 for a fan session', async () => {
    const res = await request(app).post('/add_event').set(sessionCookie('fan-session')).send(eventBody);
    assert.equal(res.status, 403);
});

test('POST /add_event passes through for a verified artist', async () => {
    const res = await request(app).post('/add_event').set(sessionCookie('artist-session')).send(eventBody);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
});

// ---------- /logout ----------

test('POST /logout deletes the session and clears the cookie', async () => {
    const res = await request(app).post('/logout').set(sessionCookie('artist-session'));
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const cookie = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('myscene_session='));
    assert.ok(cookie, 'expected the myscene_session cookie to be cleared');
    assert.match(cookie, /Max-Age=0/i);
    const call = dbApi.state.calls.find((c) => c.path === '/logout.php');
    assert.deepEqual(call.body, { session_id: 'artist-session' });
});

test('POST /logout without a cookie still answers 200', async () => {
    const res = await request(app).post('/logout');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
});
