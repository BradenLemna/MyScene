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
| GET    | `/getArtistEvents`   | Events for an artist (`?artist=`, empty until events exist) |
| POST   | `/add_artist`        | Add an artist (JSON body)                      |
| POST   | `/verify_user`       | Verify username/password (JSON body)           |

All responses are JSON. Errors use the shape `{"error": "..."}` with an
appropriate status code (400 validation, 404 not found, 409 conflict,
502/504 upstream failure, 500 server misconfiguration).

## Deployment

`scripts/apiUpdate.sh` copies this directory to `/var/www/myscene-api`,
runs `npm install --omit=dev` there and reloads the pm2 process
(`/var/www/myscene-api/src/index.js`). A `.env` already present on the server
is never overwritten by the deploy.
