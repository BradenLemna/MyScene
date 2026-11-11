// Per-IP rate limiting.
//
// One global limiter for the whole API, plus stricter per-route limiters for
// the sensitive endpoints (auth checks, writes, analytics beacons). Limits
// live in config.js and are overridable via RATE_LIMIT_<NAME>_MAX /
// RATE_LIMIT_<NAME>_WINDOW_MS environment variables.
//
// The default in-memory store is correct for a single server process. If the
// API ever runs as multiple instances behind a load balancer, swap in a
// shared store (e.g. rate-limit-redis) — until then limits apply per
// instance, not per client.

import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

function makeLimiter({ windowMs, max }) {
    return rateLimit({
        windowMs,
        limit: max,
        // draft-7: `RateLimit: limit=…, remaining=…, reset=…` + `RateLimit-Policy`.
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({ error: 'Too many requests from this address — please slow down and try again later.' });
        },
    });
}

/** Applied to every route (app.js). */
export const defaultLimiter = makeLimiter(config.rateLimits.default);

/** POST /verify_user — the brute-force target. */
export const authLimiter = makeLimiter(config.rateLimits.auth);

/** POST /add_artist and POST /add_event — the spam targets (shared budget). */
export const writeLimiter = makeLimiter(config.rateLimits.write);

/** POST /register — wired in a later batch once the endpoint exists. */
export const registerLimiter = makeLimiter(config.rateLimits.register);

/** POST /track — analytics beacons. */
export const trackLimiter = makeLimiter(config.rateLimits.track);
