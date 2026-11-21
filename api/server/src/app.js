// Express app assembly: middleware + routes + error handling.
// Kept separate from index.js so the app can be created without binding a port.

import express from 'express';

import { config } from './config.js';
import { corsMiddleware } from './middleware/cors.js';
import { requestLogger } from './middleware/requestLogger.js';
import { defaultLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import geocodingRoutes from './routes/geocoding.js';
import artistRoutes from './routes/artists.js';
import authRoutes from './routes/auth.js';
import analyticsRoutes from './routes/analytics.js';
import adminRoutes from './routes/admin.js';

export function createApp() {
    const app = express();

    app.disable('x-powered-by');
    if (config.trustProxyHops > 0) {
        app.set('trust proxy', config.trustProxyHops);
    }
    app.use(corsMiddleware());
    app.use(requestLogger);
    app.use(express.json());
    app.use(defaultLimiter);

    app.get('/', (req, res) => {
        res.json({ status: 'ok', service: 'myscene-api' });
    });

    app.use(geocodingRoutes);
    app.use(artistRoutes);
    app.use(authRoutes);
    app.use(analyticsRoutes);
    app.use(adminRoutes);

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}
