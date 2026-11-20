// CORS middleware: only the configured origins (and non-browser clients
// that send no Origin header) may call the API. Rejections surface as a
// 403 JSON response through the error handler.
//
// credentials: true is required for the httpOnly myscene_session cookie
// (Batch 2) — the frontend is a different origin (myscene.live ->
// api.myscene.live) and fetches with credentials: 'include'. The origin
// allowlist above stays the security boundary (no wildcard + credentials).

import cors from 'cors';
import { config } from '../config.js';
import { ApiError } from '../utils/errors.js';

export function corsMiddleware() {
    return cors({
        origin(origin, callback) {
            if (!origin || config.allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new ApiError('Origin not allowed by CORS.', 403));
        },
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });
}
