# MyScene API Server

Node/Express server that sits between the MyScene frontend and the upstream
services (LocationIQ geocoding, LastFM genres) plus the PHP `db-api`
endpoints that talk to the MySQL database. All API keys stay server-side.

## Layout

```
api/server/
├── package.json
├── .env.example        # copy to .env and fill in
└── src/
    ├── index.js        # entry point (pm2 runs this)
    ├── config.js       # environment loading + validation
    ├── app.js          # express app assembly
    ├── middleware/     # cors, request logger, error handler
    ├── routes/         # geocoding.js, artists.js, auth.js
    ├── services/       # http.js (fetch helper), locationIQ.js, lastFm.js, dbApi.js
    └── utils/          # errors, asyncHandler, validate
```

## Setup

```bash
cd api/server
npm install
cp .env.example .env      # then fill in the API keys / DB API URL
npm start                 # or: npm run dev (auto-restart)
```

The server listens on `PORT` (default 3000).

## Endpoints

| Method | Path                 | Description                                    |
| ------ | -------------------- | ---------------------------------------------- |
| GET    | `/`                  | Health check                                   |
| GET    | `/autocomplete`      | City autocomplete suggestions (`?city=`)       |
| GET    | `/getLatitude`       | Latitude for a place (`?gid=` — place name)    |
| GET    | `/getLongitude`      | Longitude for a place (`?gid=` — place name)   |
| GET    | `/getLocation`       | Human-readable location for a place (`?gid=`)  |
| GET    | `/getGenre`          | Top genre for an artist (`?artist=`)           |
| GET    | `/getSimilarArtists` | Artists matching a genre (`?genre=`)           |
| GET    | `/getFeaturedArtists`| Featured artists from the database             |
| GET    | `/getArtistInfo`     | Single artist row (`?artist=`)                 |
| GET    | `/getArtistAmount`   | Total number of artists                        |
| GET    | `/getGenreList`      | Distinct genres in the database                |
| GET    | `/getArtistEvents`   | Events for an artist (`?artist=`)              |
| GET    | `/getNearbyArtists`  | Artists near a point (`?lat=&lon=&radius=` miles, default 10) |
| POST   | `/add_artist`        | Add an artist (JSON body; geocodes city/state when lat/lon are omitted) |
| POST   | `/add_event`         | Add an event for an existing artist (JSON body) |
| POST   | `/verify_user`       | Verify username/password (JSON body)           |

All responses are JSON. Errors use the shape `{"error": "..."}` with an
appropriate status code (400 validation, 404 not found, 409 conflict,
502/504 upstream failure, 500 server misconfiguration).

## Rate limiting

All endpoints are rate-limited per client IP (express-rate-limit, in-memory
store). Exhausted limits answer `429` with the standard `{"error": "..."}`
shape plus `RateLimit` / `RateLimit-Policy` headers (IETF draft-7).

| Scope | Default | Env override |
| ----- | ------- | ------------ |
| Whole API | 100 req / 15 min | `RATE_LIMIT_DEFAULT_MAX`, `RATE_LIMIT_DEFAULT_WINDOW_MS` |
| `POST /verify_user` | 10 req / 15 min | `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_AUTH_WINDOW_MS` |
| `POST /add_artist`, `POST /add_event` (shared budget) | 10 req / hour | `RATE_LIMIT_WRITE_MAX`, `RATE_LIMIT_WRITE_WINDOW_MS` |
| `POST /register` (planned) | 5 req / hour | `RATE_LIMIT_REGISTER_MAX`, `RATE_LIMIT_REGISTER_WINDOW_MS` |
| `POST /track` | 60 req / min | `RATE_LIMIT_TRACK_MAX`, `RATE_LIMIT_TRACK_WINDOW_MS` |

`TRUST_PROXY` (default `0`): number of trusted proxy hops in front of the
server. Set it to `1` when the API sits behind a reverse proxy (e.g. nginx
terminating TLS) — otherwise `req.ip` is the proxy's address and every
client behind it shares one bucket.

The in-memory store is per process: correct for a single pm2 instance. If
the API ever runs as multiple instances, swap in a shared store
(e.g. rate-limit-redis).

## Tests

`npm test` runs the integration suite (node:test + supertest) against mock
upstreams (PHP db-api, LocationIQ, LastFM) — no database or API keys needed.
CI (`.github/workflows/ci.yml`) runs it on every push/PR, plus a PHP db-api
smoke test (`api/db/smoke.sh`) against a MariaDB service container.

## Deployment

`scripts/apiUpdate.sh` copies this directory to `/var/www/myscene-api`,
runs `npm install --omit=dev` there and reloads the pm2 process
(`/var/www/myscene-api/src/index.js`). A `.env` already present on the server
is never overwritten by the deploy.
