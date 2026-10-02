// CORS middleware: only the configured origins (and non-browser clients
// that send no Origin header) may call the API. Rejections surface as a
// 403 JSON response through the error handler.

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
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });
}
