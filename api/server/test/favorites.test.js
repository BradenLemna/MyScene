// Server-side favorites routes (Batch 5): GET /getFavorites + POST
// /toggleFavorite, both session-gated. 401 without a valid session, the
// username always comes from the session (never the request body), and the
// favorites list passes through unmolested. Run with `npm test`.

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

// ---------------- GET /getFavorites ----------------

test('GET /getFavorites answers 401 without a session', async () => {
    const res = await request(app).get('/getFavorites');
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Log in/i);
});

test('GET /getFavorites answers 401 with an unknown session', async () => {
    const res = await request(app).get('/getFavorites').set(sessionCookie('deadbeef'));
    assert.equal(res.status, 401);
});

test('GET /getFavorites returns the current user\'s favorites (full rows)', async () => {
    const res = await request(app).get('/getFavorites').set(sessionCookie('fan-session'));
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.favorites));
    assert.equal(res.body.favorites.length, 2);
    assert.deepEqual(
        res.body.favorites.map((a) => a.artist_name),
        ['The Belladonnas', 'Keathley']
    );
    assert.equal(res.body.favorites[0].music_genre, 'indie rock');
});

test('GET /getFavorites forwards the session username to the DB (never the request)', async () => {
    dbApi.state.calls.length = 0;
    const res = await request(app)
        .get('/getFavorites')
        .set(sessionCookie('artist-session'))
        .send({ username: 'attacker-nobody' });
    assert.equal(res.status, 200);
    // The mock only knows the default session artists; the attacker-supplied
    // username must never reach the DB verbatim.
    const calls = dbApi.state.calls.filter((c) => c.path.includes('get_favorites'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.username, 'artistuser');
});

// ---------------- POST /toggleFavorite ----------------

test('POST /toggleFavorite answers 401 without a session', async () => {
    const res = await request(app).post('/toggleFavorite').send({ artist_name: 'The Belladonnas' });
    assert.equal(res.status, 401);
});

test('POST /toggleFavorite answers 401 with an unknown session', async () => {
    const res = await request(app)
        .post('/toggleFavorite')
        .set(sessionCookie('deadbeef'))
        .send({ artist_name: 'The Belladonnas' });
    assert.equal(res.status, 401);
});

test('POST /toggleFavorite toggles a favorite for the session user', async () => {
    dbApi.state.calls.length = 0;
    const res = await request(app)
        .post('/toggleFavorite')
        .set(sessionCookie('fan-session'))
        .send({ artist_name: 'Keathley' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { favorited: true });

    const calls = dbApi.state.calls.filter((c) => c.path.includes('toggle_favorite'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.username, 'fanuser');
    assert.equal(calls[0].body.artist_name, 'Keathley');
});

test('POST /toggleFavorite toggles an existing favorite back off', async () => {
    const res = await request(app)
        .post('/toggleFavorite')
        .set(sessionCookie('fan-session'))
        .send({ artist_name: 'Already Fav' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { favorited: false });
});

test('POST /toggleFavorite requires artist_name (400)', async () => {
    const res = await request(app)
        .post('/toggleFavorite')
        .set(sessionCookie('fan-session'))
        .send({});
    assert.equal(res.status, 400);
    assert.match(res.body.error, /artist_name/);
});

test('POST /toggleFavorite rejects over-long artist_name (400)', async () => {
    const res = await request(app)
        .post('/toggleFavorite')
        .set(sessionCookie('fan-session'))
        .send({ artist_name: 'x'.repeat(51) });
    assert.equal(res.status, 400);
});

test('POST /toggleFavorite passes through an unknown artist as 404', async () => {
    const res = await request(app)
        .post('/toggleFavorite')
        .set(sessionCookie('fan-session'))
        .send({ artist_name: 'Not a Band' });
    assert.equal(res.status, 404);
    assert.match(res.body.error, /Artist not found/i);
});
