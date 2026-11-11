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

// Per-route rate limits (middleware/rateLimit.js). Defaults are tuned for a
// single public API; every value is overridable via
// RATE_LIMIT_<NAME>_MAX / RATE_LIMIT_<NAME>_WINDOW_MS.
const RATE_LIMIT_DEFAULTS = {
    default: { windowMs: 15 * 60 * 1000, max: 100 },  // whole API
    auth: { windowMs: 15 * 60 * 1000, max: 10 },      // /verify_user
    write: { windowMs: 60 * 60 * 1000, max: 10 },     // /add_artist, /add_event
    register: { windowMs: 60 * 60 * 1000, max: 5 },   // /register (later batch)
    track: { windowMs: 60 * 1000, max: 60 },          // /track
};

function rateLimitSetting(name) {
    const d = RATE_LIMIT_DEFAULTS[name];
    return {
        windowMs: envInt(`RATE_LIMIT_${name.toUpperCase()}_WINDOW_MS`, d.windowMs),
        max: envInt(`RATE_LIMIT_${name.toUpperCase()}_MAX`, d.max),
    };
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

    // Per-route rate limits (see RATE_LIMIT_DEFAULTS above).
    rateLimits: {
        default: rateLimitSetting('default'),
        auth: rateLimitSetting('auth'),
        write: rateLimitSetting('write'),
        register: rateLimitSetting('register'),
        track: rateLimitSetting('track'),
    },

    // Trusted proxy hops in front of this server (TRUST_PROXY env, e.g. '1'
    // when nginx terminates TLS). 0 (the default) = no proxy: req.ip is the
    // real client. Rate limiting keys on req.ip, so set this when deploying
    // behind a proxy or every client behind it shares one bucket.
    trustProxyHops: (() => {
        const raw = process.env.TRUST_PROXY;
        if (!raw) {
            return 0;
        }
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    })(),
});
