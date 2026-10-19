// Analytics ingestion for the privacy-friendly counter (EXP-002).
//
// The browser sends one small beacon per event (public/js/track.js).
// The PHP db-api is the source of truth for validation (page/event
// allowlists, detail length); its 400s are passed through to the client,
// anything else becomes a 502 by the shared db-api client.

import { Router } from 'express';

import { asyncHandler } from '../utils/asyncHandler.js';
import { dbApi } from '../services/dbApi.js';

const analyticsRoutes = Router();

analyticsRoutes.post('/track', asyncHandler(async (req, res) => {
    const { page, event, detail } = req.body ?? {};
    const data = await dbApi.trackEvent({ page, event, detail });
    res.json(data);
}));

export default analyticsRoutes;
