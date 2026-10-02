// Entry point for the MyScene API server (run with `npm start`, or point
// pm2 at this file).

import { config } from './config.js';
import { createApp } from './app.js';

// Missing keys are a configuration problem, not a reason to kill the whole
// server — the database routes do not need them. Warn loudly at boot.
if (!config.locationIQApiKey) {
    console.warn('[myscene:api] WARNING: LOCATIONIQ_API_KEY is not set — /autocomplete, /getLatitude, /getLongitude and /getLocation will fail until it is configured.');
}
if (!config.lastFmApiKey) {
    console.warn('[myscene:api] WARNING: LASTFM_API_KEY is not set — /getGenre will fail until it is configured.');
}

const app = createApp();

const listen = config.host
    ? { port: config.port, host: config.host }
    : { port: config.port };

app.listen(listen, () => {
    console.log(`Server is running on ${config.host || 'all interfaces'}:${config.port}`);
});
