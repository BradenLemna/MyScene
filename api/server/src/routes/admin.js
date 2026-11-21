// Admin dashboard routes (Batch 3): the analytics summary, the pending-
// artist queue, and artist approval/rejection.
//
//   GET  /getAnalyticsSummary?days=30|90|365
//        -> {days, totals, top_artists, top_genres, daily_pageviews}
//        Read-only; no session required (the data is aggregate, no PII).
//   GET  /getPendingArtists
//        -> {pending_artists: [{username, created_at}, ...]}
//        Admin-only (401 without a session, 403 for non-admins).
//   POST /setArtistStatus  {target_username, status}
//        -> {success, username, artist_status}
//        Admin-only; status is 'verified' (approve) or 'none' (reject).

import { Router } from 'express';

import { dbApi } from '../services/dbApi.js';
import { requireAdmin } from '../utils/session.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/errors.js';
import { requireFields, strField } from '../utils/validate.js';

const router = Router();

const ANALYTICS_WINDOWS = [30, 90, 365];
const ARTIST_STATUSES = ['verified', 'none'];

router.get('/getAnalyticsSummary', asyncHandler(async (req, res) => {
    // days is optional (defaults to 30); when present it must be one of the
    // fixed windows the dashboard offers.
    let days = 30;
    const raw = req.query.days;
    const text = Array.isArray(raw) ? raw[0] : raw;
    if (typeof text === 'string' && text.trim() !== '') {
        const parsed = Number(text);
        if (!Number.isInteger(parsed) || !ANALYTICS_WINDOWS.includes(parsed)) {
            throw new ApiError('Query parameter "days" must be one of: 30, 90, 365.', 400);
        }
        days = parsed;
    }
    const data = await dbApi.getAnalyticsSummary(days);
    res.json(data);
}));

router.get('/getPendingArtists', requireAdmin(), asyncHandler(async (req, res) => {
    const data = await dbApi.getPendingArtists();
    res.json(data);
}));

router.post('/setArtistStatus', requireAdmin(), asyncHandler(async (req, res) => {
    const body = requireFields(req.body, ['target_username', 'status']);
    const status = strField(body, 'status');
    if (!ARTIST_STATUSES.includes(status)) {
        throw new ApiError('Field "status" must be one of: verified, none.', 400);
    }
    const data = await dbApi.setArtistStatus(strField(body, 'target_username'), status);
    res.json(data);
}));

export default router;
