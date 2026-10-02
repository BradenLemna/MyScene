// Final error handling for the API server.
//
// Every failure leaves the process as a JSON response:
//   ApiError       -> its own status + message (validation, config, CORS)
//   UpstreamError  -> passthrough status (400/404/409 from the PHP db-api,
//                     404 for unknown artists on LastFM) or 502/504, with a
//                     safe client message
//   parse errors   -> 400 for malformed JSON bodies
//   anything else  -> 500 with a generic message; details go to the log only

import { ApiError } from '../utils/errors.js';

export function notFoundHandler(req, res) {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
    if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.message });
        return;
    }

    if (err.name === 'UpstreamError') {
        console.error(`[myscene:api] ${req.method} ${req.path} upstream error:`, err.message);
        res.status(err.status).json({ error: err.clientMessage });
        return;
    }

    // express.json() failures (malformed body, oversized payload)
    if (err.type === 'entity.parse.failed') {
        res.status(400).json({ error: 'Invalid JSON in request body.' });
        return;
    }
    if (err.type === 'entity.too.large') {
        res.status(413).json({ error: 'Request body too large.' });
        return;
    }

    console.error(`[myscene:api] Unhandled error on ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: 'Internal server error. Please try again later.' });
}
