// Auth routes — accounts, sessions, and the artist-access request.
// Credential checks and session rows live in the PHP db-api layer
// (bcrypt + the Sessions table); this file validates request shapes,
// manages the myscene_session cookie, and passes results through.
//
//   POST /verify_user           { username, password } -> { verified }
//   POST /register              { username, password } -> { success }
//   POST /login                 { username, password } -> { verified, session_id? }
//   POST /logout                (cookie)               -> { success }
//   GET  /me                    (cookie)               -> { username, is_admin, artist_status }
//   POST /request_artist_access (cookie)               -> { success, artist_status }

import { Router } from 'express';

import { dbApi } from '../services/dbApi.js';
import { authLimiter, registerLimiter } from '../middleware/rateLimit.js';
import {
    SESSION_COOKIE,
    clearCookieOptions,
    requireSession,
    sessionIdFromRequest,
    sessionCookieOptions,
} from '../utils/session.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireFields, strField } from '../utils/validate.js';

const router = Router();

router.post('/verify_user', authLimiter, asyncHandler(async (req, res) => {
    const body = requireFields(req.body, ['username', 'password']);
    const data = await dbApi.verifyUser(strField(body, 'username'), body.password);
    res.json({ verified: data?.verified === true });
}));

router.post('/register', registerLimiter, asyncHandler(async (req, res) => {
    const body = requireFields(req.body, ['username', 'password']);
    const data = await dbApi.registerUser(strField(body, 'username'), body.password);
    res.json({ success: data?.success === true });
}));

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
    const body = requireFields(req.body, ['username', 'password']);
    const data = await dbApi.createSession(strField(body, 'username'), body.password);

    if (data?.verified === true && typeof data.session_id === 'string') {
        res.cookie(SESSION_COOKIE, data.session_id, sessionCookieOptions);
        return res.json({ verified: true, session_id: data.session_id });
    }
    res.json({ verified: false });
}));

router.post('/logout', asyncHandler(async (req, res) => {
    // Idempotent: a missing cookie just clears (an already-cleared) cookie.
    const sessionId = sessionIdFromRequest(req);
    if (sessionId !== null) {
        await dbApi.logout(sessionId);
    }
    res.clearCookie(SESSION_COOKIE, clearCookieOptions);
    res.json({ success: true });
}));

router.get('/me', requireSession(), asyncHandler(async (req, res) => {
    res.json({
        username: req.sessionUser.username,
        is_admin: req.sessionUser.isAdmin,
        artist_status: req.sessionUser.artistStatus,
    });
}));

router.post('/request_artist_access', requireSession(), asyncHandler(async (req, res) => {
    const data = await dbApi.requestArtistAccess(req.sessionUser.sessionId);
    res.json({
        success: data?.success === true,
        artist_status: data?.artist_status,
    });
}));

export default router;
