// Contract tests for the MyScene API routes, run against mock upstreams
// (PHP db-api, LocationIQ, LastFM). Run with `npm test`.

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
        extraEnv: { RATE_LIMIT_DEFAULT_MAX: '100000' }, // keep the global limiter out of the way
    });
});

after(async () => {
    await closeAll(dbApi, locationIQ, lastFM);
});

test('GET / health check', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
});

test('GET /getArtistAmount proxies the db-api', async () => {
    const res = await request(app).get('/getArtistAmount');
    assert.equal(res.status, 200);
    assert.equal(res.body.artistAmount, 42);
});

test('GET /getArtistInfo returns the artist row', async () => {
    const res = await request(app).get('/getArtistInfo?artist=' + encodeURIComponent('The Belladonnas'));
    assert.equal(res.status, 200);
    assert.equal(res.body.artistInfo.artist_name, 'The Belladonnas');
});

test('GET /getArtistInfo without the artist parameter answers 400', async () => {
    const res = await request(app).get('/getArtistInfo');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /artist/);
});

test('GET /getArtistInfo passes through a db-api 404', async () => {
    const res = await request(app).get('/getArtistInfo?artist=No Such Band XYZ');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Artist not found.');
});

test('GET /getGenreList proxies the db-api', async () => {
    const res = await request(app).get('/getGenreList');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.genres, ['Rock', 'Punk']);
});

test('POST /add_artist geocodes missing coordinates and proxies the insert', async () => {
    const res = await request(app)
        .post('/add_artist')
        .send({
            artist_name: 'Fresh Band',
            location_city: 'Fayetteville',
            location_region: 'AR',
            music_genre: 'Rock',
        });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const call = dbApi.state.calls.find((c) => c.path === '/add_artist.php');
    assert.equal(call.body.latitude, 36.0626);
    assert.equal(call.body.longitude, -94.1574);
});

test('POST /add_artist passes through a duplicate 409', async () => {
    const res = await request(app)
        .post('/add_artist')
        .send({
            artist_name: 'Taken Name',
            location_city: 'Fayetteville',
            location_region: 'AR',
            music_genre: 'Rock',
            latitude: 36.0,
            longitude: -94.0,
        });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already exists/);
});

test('POST /add_artist without required fields answers 400', async () => {
    const res = await request(app).post('/add_artist').send({ artist_name: 'Incomplete' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Missing required field/);
});

test('POST /add_event proxies the insert', async () => {
    const res = await request(app)
        .post('/add_event')
        .send({
            artist_name: 'The Belladonnas',
            venue_name: 'Test Hall',
            location_city: 'Fayetteville',
            location_region: 'AR',
            event_date: '2026-12-01',
        });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
});

test('POST /add_event passes through a duplicate 409', async () => {
    const res = await request(app)
        .post('/add_event')
        .send({
            artist_name: 'The Belladonnas',
            venue_name: 'Dup Venue',
            location_city: 'Fayetteville',
            location_region: 'AR',
            event_date: '2026-12-01',
            latitude: 36.0,
            longitude: -94.0,
        });
    assert.equal(res.status, 409);
});

test('POST /verify_user accepts a valid pair', async () => {
    const res = await request(app).post('/verify_user').send({ username: 'gooduser', password: 'right' });
    assert.equal(res.status, 200);
    assert.equal(res.body.verified, true);
});

test('POST /verify_user rejects an invalid pair (200 + verified:false)', async () => {
    const res = await request(app).post('/verify_user').send({ username: 'gooduser', password: 'wrong' });
    assert.equal(res.status, 200);
    assert.equal(res.body.verified, false);
});

test('POST /verify_user without fields answers 400', async () => {
    const res = await request(app).post('/verify_user').send({ username: 'gooduser' });
    assert.equal(res.status, 400);
});

test('POST /track records a valid beacon', async () => {
    const res = await request(app).post('/track').send({ page: 'index', event: 'pageview' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
});

test('POST /track passes through a db-api 400 for unknown pages', async () => {
    const res = await request(app).post('/track').send({ page: 'hacker', event: 'pageview' });
    assert.equal(res.status, 400);
});

test('GET /autocomplete proxies LocationIQ', async () => {
    const res = await request(app).get('/autocomplete?city=fay');
    assert.equal(res.status, 200);
    assert.equal(res.body.suggestions[0].name, 'Fayetteville, Arkansas');
});

test('GET /getLatitude geocodes a place', async () => {
    const res = await request(app).get('/getLatitude?gid=Fayetteville');
    assert.equal(res.status, 200);
    assert.equal(res.body.latitude, 36.0626);
});

test('GET /getLatitude answers 404 for an unknown place', async () => {
    const res = await request(app).get('/getLatitude?gid=Nowhere');
    assert.equal(res.status, 404);
});

test('GET /getGenre resolves a LastFM artist', async () => {
    const res = await request(app).get('/getGenre?artist=Some Band');
    assert.equal(res.status, 200);
    assert.equal(res.body.genre, 'indie rock');
});

test('GET /getGenre answers 404 for an unknown LastFM artist', async () => {
    const res = await request(app).get('/getGenre?artist=Unknown Band');
    assert.equal(res.status, 404);
});

test('unknown origins are rejected with 403', async () => {
    const res = await request(app).get('/getArtistAmount').set('Origin', 'http://evil.example');
    assert.equal(res.status, 403);
});

test('unknown routes answer 404 JSON', async () => {
    const res = await request(app).get('/nope');
    assert.equal(res.status, 404);
    assert.match(res.body.error, /Not found/);
});
