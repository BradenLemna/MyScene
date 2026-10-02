// Centralized configuration for the MyScene API server.
//
// Loads serversideapi/.env (if present) — real process environment variables
// always win over .env values — and exposes a single frozen `config` object.

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

function envList(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') {
        return fallback;
    }
    return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

function envInt(name, fallback) {
    const raw = process.env[name];
    const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = Object.freeze({
    port: envInt('PORT', 3000),

    // Interface to bind. Empty (the default) listens on all interfaces,
    // which is what the production LAN host needs. Set 127.0.0.1 for local
    // development behind a reverse proxy.
    host: process.env.HOST || '',

    // Base URL of the PHP db-api endpoints (no trailing slash).
    dbApiBaseUrl: (process.env.DB_API_BASE_URL || 'http://apiserver.lan').replace(/\/+$/, ''),

    // Origins the frontend is allowed to call from.
    allowedOrigins: envList('ALLOWED_ORIGINS', [
        'https://myscene.live',
        'http://127.0.0.1:5500',
    ]),

    // Upstream API keys. Optional at boot — the affected routes answer with
    // a 500 misconfiguration error when they are missing, so the database
    // routes keep working on a partially configured server.
    locationIQApiKey: process.env.LOCATIONIQ_API_KEY || null,
    lastFmApiKey: process.env.LASTFM_API_KEY || null,

    // Upstream base URLs (no trailing slash). Overridable via the
    // environment for staging/testing against mock services.
    locationIqBaseUrl: (process.env.LOCATIONIQ_BASE_URL || 'https://us1.locationiq.com/v1').replace(/\/+$/, ''),
    lastFmBaseUrl: (process.env.LASTFM_BASE_URL || 'https://ws.audioscrobbler.com/2.0').replace(/\/+$/, ''),

    // How long to wait for an upstream call before giving up.
    upstreamTimeoutMs: envInt('UPSTREAM_TIMEOUT_MS', 10000),
});
