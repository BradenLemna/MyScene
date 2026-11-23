// Session helpers (Batch 2 auth).
//
// The API sets an httpOnly `myscene_session` cookie on /login carrying the
// DB-backed session id that create_session.php issues. The API never trusts
// the client's word for who it is — every gated route re-checks the session
// against the PHP db-api (me.php).

import { dbApi } from '../services/dbApi.js';
import { ApiError } from './errors.js';

export const SESSION_COOKIE = 'myscene_session';

// 30 days — matches the Sessions.expires_at window in the PHP layer.
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

/** Options for (re)setting the session cookie on login. */
export const sessionCookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_S * 1000,
    path: '/',
};

/** Options that expire the cookie immediately (logout). */
export const clearCookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
};

/**
 * Parse the raw Cookie header into an object. A tiny hand-rolled parser
 * keeps the dependency list at zero (Express does not parse cookies).
 */
export function parseCookies(req) {
    const header = req.headers.cookie;
    const cookies = {};
    if (typeof header !== 'string' || header === '') {
        return cookies;
    }
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) {
            continue;
        }
        const name = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (name === '') {
            continue;
        }
        try {
            cookies[name] = decodeURIComponent(value);
        } catch {
            cookies[name] = value; // malformed escape — keep the raw value
        }
    }
    return cookies;
}

/** The session id from the request cookie, or null when absent. */
export function sessionIdFromRequest(req) {
    const value = parseCookies(req)[SESSION_COOKIE];
    return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Middleware: require a valid session. Loads the account row via me.php
 * and attaches it to req.sessionUser ({ sessionId, username, isAdmin,
 * artistStatus }). A missing cookie answers 401; a cookie the db-api
 * rejects (unknown/expired) passes the 404 through, so GET /me mirrors
 * the PHP contract exactly.
 */
export function requireSession() {
    return async (req, res, next) => {
        const sessionId = sessionIdFromRequest(req);
        if (sessionId === null) {
            return next(new ApiError('Log in to continue.', 401));
        }
        try {
            const me = await dbApi.me(sessionId);
            req.sessionUser = {
                sessionId,
                username: me?.username,
                isAdmin: me?.is_admin === true,
                artistStatus: me?.artist_status,
            };
            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Middleware for the admin dashboard routes (Batch 3): require a valid
 * session whose account has is_admin. 401 when the session is missing or
 * unknown/expired, 403 when logged in but not an admin. Attaches the
 * account to req.sessionUser for the route handler.
 */
export function requireAdmin() {
    return async (req, res, next) => {
        const sessionId = sessionIdFromRequest(req);
        if (sessionId === null) {
            return next(new ApiError('Log in to continue.', 401));
        }
        let me;
        try {
            me = await dbApi.me(sessionId);
        } catch (err) {
            if (err.name === 'UpstreamError' && err.status === 404) {
                // Unknown/expired session: answer "not logged in", not 404.
                return next(new ApiError('Log in to continue.', 401));
            }
            return next(err);
        }
        if (me?.is_admin !== true) {
            return next(new ApiError('Admin access required.', 403));
        }
        req.sessionUser = {
            sessionId,
            username: me.username,
            isAdmin: true,
            artistStatus: me.artist_status,
        };
        next();
    };
}

/**
 * Middleware for POST /add_artist and POST /add_event: require a valid
 * session whose account is a verified artist (artist_status='verified').
 * 401 when the session is missing or unknown/expired, 403 when logged in
 * but not a verified artist (fan or pending). Attaches the account to
 * req.sessionUser for the route handler (the writes record it as the
 * activity-feed actor).
 */
export async function requireVerifiedArtist(req, res, next) {
    const sessionId = sessionIdFromRequest(req);
    if (sessionId === null) {
        return next(new ApiError('Log in to add artists and events.', 401));
    }
    let me;
    try {
        me = await dbApi.me(sessionId);
    } catch (err) {
        if (err.name === 'UpstreamError' && err.status === 404) {
            // Unknown/expired session: answer "not logged in", not 404.
            return next(new ApiError('Log in to add artists and events.', 401));
        }
        return next(err);
    }
    if (me?.artist_status !== 'verified') {
        return next(new ApiError('Only verified artists can add artists and events.', 403));
    }
    req.sessionUser = {
        sessionId,
        username: me.username,
        isAdmin: me.is_admin === true,
        artistStatus: me.artist_status,
    };
    next();
}
