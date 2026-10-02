# MyScene
This repository is a continuation of the 2026 HogHacks Project "MyScene". This repository will have more functionality and improved implementation on already implemented features.

## Repository Layout

```
myscene/
├── public/            # Web root — the only part served to browsers
│   ├── index.html     # Homepage
│   ├── style.css
│   ├── js/            # Client-side scripts (api.js wraps all API calls)
│   ├── pages/         # login, addArtist, viewArtist
│   └── assets/        # icons/ and artist images/
├── api/               # Server-side only — never served to browsers
│   ├── server/        # Node/Express API (proxies LocationIQ/LastFM + db-api)
│   └── db/            # PHP db-api endpoints (talk to MySQL)
├── scripts/           # Deployment: dbUpdate.sh, webUpdate.sh, apiUpdate.sh, update.sh
├── schema.sql         # Database schema (fresh installs)
├── migrations/        # Idempotent schema changes applied to existing DBs by dbUpdate.sh
└── .env.example       # DB credentials template for the PHP db-api
```

## Run

### Local development

```bash
./install.sh   # system packages, Composer + npm deps, local MariaDB + .env files
```

Then start three processes (three terminals) and open `http://localhost:8000/`:

```bash
php -S localhost:8080 -t api/db   # PHP db-api (talks to MySQL)
cd api/server && npm start        # Node API on http://localhost:3000
php -S localhost:8000 -t public   # Website
```

The pages default to the production API (`https://api.myscene.live`). To use
the local Node API instead, set `window.MYSCENE_API_BASE = 'http://localhost:3000'`
in the page before the site scripts load (see `public/js/api.js`).

*Geocoding/genre features need upstream API keys — fill in
`LOCATIONIQ_API_KEY` / `LASTFM_API_KEY` in `api/server/.env` (see
`api/server/.env.example`).*

### Server deployment (`scripts/`)

All deploy scripts are idempotent — they fully set up a fresh machine and
only update an existing one. They need root or passwordless sudo and work
with or without systemd. Run `db` before `api` (the api step picks up the DB
credentials from `~/myscene-db/.env`).

| Script | Run on | What it does |
| ------ | ------ | ------------ |
| `scripts/dbUpdate.sh` | DB host | Installs/starts MariaDB, imports `schema.sql` (fresh install only — existing data is never touched), applies `migrations/*.sql`, creates the `myscene` MySQL user and writes `~/myscene-db/.env` |
| `scripts/webUpdate.sh` | web host | Installs/starts nginx, deploys `public/` to `/var/www/html` |
| `scripts/apiUpdate.sh` | API host | Installs Node/pm2/Apache/PHP, deploys the Node API to `/var/www/myscene-api` (pm2) and the PHP db-api to `/var/www/myscene-api/db-api` (Apache), seeds any missing `.env`, restarts services and health-checks the full chain |
| `scripts/update.sh` | one machine | Runs `db` → `web` → `api` in order for a single-host setup |

Useful flags:

```bash
./scripts/dbUpdate.sh FullUpdate     # drop + rebuild the database (asks first; -y to skip)
MYSCENE_API_BASE="http://ip:3000" ./scripts/webUpdate.sh   # pin the site to an API server
MYSCENE_REPO_URL="git@github.com:you/myscene.git" ./scripts/update.sh   # private mirror
```

Notes:

- Existing `.env` files are **never** overwritten by an update.
- On a single host, nginx keeps port 80 and the db-api vhost moves to 8080 automatically.
- `update.sh` pins the deployed site to the local Node API (`http://<server-ip>:3000`) so a single machine runs the whole stack.

# Old README
```
# Hoghacks-2026
This respoitory is for the team **Theta Protocol** at the University of Arkansas' Hoghacks 2026. Look around to see what we're working on!

**Members:**  
Shirley Lin  
Shayne Thompson  
Braden Lemna  
Kamila Cudzich  
Elisabeth Johnson  
Cooper Claussen

## Project Descripton
MyScene is a website that helps you connect with niche and underground artists and allows those artists to self-promote their events, developing the local music scene and strengthening its community. It makes it easy to find upcoming concerts around your area and discover artists that fit your tastes by recommending music based on previous local shows you've attended and your listening habits. You'll be able to input the name of well-known artists and be able to find local artists under the same genre.

MyScene gives these smaller artists an opportunity to connect with the scene by allowing them to add themselves to our database of artists and upload show dates. We differentiate ourselves from other similar platforms by recommending new artists based on previous listening habits and events attended rather than the popularity or status of said artist.

## Run
Our project interfaces with a local MySQL database, so you'll need to set one up before running the program. The database schema can be found in `schema.sql`. Use the .env.example to create your own .env file with the MySQL credentials.


git clone https://github.com/katsu1863/Hoghacks-2026.git
cd HogHacks-2026
- Run `./install.sh` to install necessary packages
- Start a local PHP web server by running `php -S localhost:8000` from the home directory of HogHacks-2026
- Navigate to `http://localhost:8000/src/frontend/main.html` on a Web browser 
 
*The website relies on multiple API Calls that require API keys*
```
