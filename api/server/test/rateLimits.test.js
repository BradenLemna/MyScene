// Rate-limit behaviour: each limiter must answer 429 with the standard JSON
// error shape once its budget is exhausted. The budgets are set tiny via
// env (before the app is imported) so no test has to wait for a window.

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
            RATE_LIMIT_DEFAULT_MAX: '100000', // keep the global limiter out of the way
            RATE_LIMIT_AUTH_MAX: '3',
            RATE_LIMIT_WRITE_MAX: '3',
            RATE_LIMIT_TRACK_MAX: '2',
        },
    });
});

after(async () => {
    await closeAll(dbApi, locationIQ, lastFM);
});

async function expect429(res, label) {
    assert.equal(res.status, 429, `${label}: expected 429, got ${res.status}`);
    assert.equal(typeof res.body.error, 'string', `${label}: 429 must carry a JSON error`);
    assert.match(res.headers['ratelimit'] ?? '', /limit=/, `${label}: RateLimit header missing`);
}

test('verify_user is limited to the auth budget', async () => {
    for (let i = 0; i < 3; i += 1) {
        const res = await request(app).post('/verify_user').send({ username: 'u', password: 'p' });
        assert.equal(res.status, 200);
    }
    await expect429(await request(app).post('/verify_user').send({ username: 'u', password: 'p' }), 'verify_user');
});

test('add_artist and add_event share the write budget', async () => {
    const artistBody = {
        artist_name: 'Spam Band',
        location_city: 'Fayetteville',
        location_region: 'AR',
        music_genre: 'Rock',
        latitude: 36.0,
        longitude: -94.0,
    };
    const eventBody = {
        artist_name: 'The Belladonnas',
        venue_name: 'Spam Hall',
        location_city: 'Fayetteville',
        location_region: 'AR',
        event_date: '2026-12-01',
        latitude: 36.0,
        longitude: -94.0,
    };

    assert.equal((await request(app).post('/add_artist').send(artistBody)).status, 200);
    assert.equal((await request(app).post('/add_event').send(eventBody)).status, 200);
    assert.equal((await request(app).post('/add_artist').send(artistBody)).status, 200);
    await expect429(await request(app).post('/add_event').send(eventBody), 'add_event');
});

test('track is limited to the beacon budget', async () => {
    assert.equal((await request(app).post('/track').send({ page: 'index', event: 'pageview' })).status, 200);
    assert.equal((await request(app).post('/track').send({ page: 'index', event: 'pageview' })).status, 200);
    await expect429(await request(app).post('/track').send({ page: 'index', event: 'pageview' }), 'track');
});
