#!/usr/bin/env bash

# =============================================================================
# MyScene — PHP db-api smoke test
#
# Boots the PHP db-api (php -S) against a real MariaDB and exercises every
# endpoint's contract: status codes and JSON shapes. Used by CI
# (.github/workflows/ci.yml) and available locally:
#
#   bash api/db/smoke.sh          # asks before touching the database
#   bash api/db/smoke.sh -y       # skip the confirmation (CI)
#
# DESTRUCTIVE: schema.sql contains DROP TABLE IF EXISTS, so the script
# re-creates the MyScene tables from scratch (seed data included). Point it
# at a throwaway database — in CI that is the service container's DB.
#
# Environment (defaults work for a local install.sh setup):
#   DB_HOST (127.0.0.1)   DB_PORT (3306)
#   DB_NAME (MyScene)     DB_USERNAME (myscene)
#   DB_PASSWORD (falls back to the DB_PASSWORD line in the repo-root .env)
#   SMOKE_PORT (8090) — port for the temporary PHP server
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

ASSUME_YES=0
for arg in "$@"; do
    case "$arg" in
        -y|--yes) ASSUME_YES=1 ;;
        -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
        *) echo "[smoke][ERROR] Unknown argument: $arg" >&2; exit 2 ;;
    esac
done

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-MyScene}"
DB_USERNAME="${DB_USERNAME:-myscene}"
DB_PASSWORD="${DB_PASSWORD:-}"
SMOKE_PORT="${SMOKE_PORT:-8090}"
BASE="http://127.0.0.1:$SMOKE_PORT"

log() { echo "[smoke] $*"; }
die() { echo "[smoke][ERROR] $*" >&2; exit 1; }

command -v mysql >/dev/null 2>&1 || die "mysql client not found"
command -v php >/dev/null 2>&1 || die "php not found"
php -m 2>/dev/null | grep -q '^pdo_mysql$' || die "php-mysql (pdo_mysql) is not installed"

# Fall back to the repo-root .env for the password (install.sh layout).
if [ -z "$DB_PASSWORD" ] && [ -f .env ]; then
    DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' .env | tail -n1)"
fi
[ -n "$DB_PASSWORD" ] || die "No DB password — set DB_PASSWORD or fill in the repo-root .env"

mysql_cli() { mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" -p"$DB_PASSWORD" "$@"; }

log "Waiting for MariaDB at $DB_HOST:$DB_PORT ..."
for _ in $(seq 1 30); do
    mysql_cli -e "SELECT 1" >/dev/null 2>&1 && break
    sleep 1
done
mysql_cli -e "SELECT 1" >/dev/null 2>&1 || die "MariaDB did not become ready"

if [ "$ASSUME_YES" -ne 1 ]; then
    if [ -t 0 ]; then
        read -r -p "This DROPS and re-creates the '$DB_NAME' tables from schema.sql. Continue? (y/N): " answer
        case "$answer" in
            y|Y|yes|YES) ;;
            *) die "Aborted." ;;
        esac
    else
        die "Not a TTY and no -y: refusing to touch the database without confirmation."
    fi
fi

log "Importing schema.sql + migrations (destructive)"
mysql_cli < schema.sql
for migration in migrations/*.sql; do
    [ -e "$migration" ] || continue
    mysql_cli < "$migration"
done

# Dedicated user with a known bcrypt hash (idempotent across re-runs).
SMOKE_HASH="$(php -r "echo password_hash('smoke-password', PASSWORD_BCRYPT);")"
mysql_cli -e "DELETE FROM \`$DB_NAME\`.Users WHERE username='smoke_user'; INSERT INTO \`$DB_NAME\`.Users (username, user_password) VALUES ('smoke_user', '$SMOKE_HASH');"

log "Starting PHP db-api on 127.0.0.1:$SMOKE_PORT"
PHP_PID=""
cleanup() {
    if [ -n "$PHP_PID" ]; then
        kill "$PHP_PID" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

# Real process env wins over any .env the bootstrap finds (createImmutable).
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" \
DB_USERNAME="$DB_USERNAME" DB_PASSWORD="$DB_PASSWORD" \
    php -S "127.0.0.1:$SMOKE_PORT" -t api/db >/tmp/myscene-smoke-php.log 2>&1 &
PHP_PID=$!

for _ in $(seq 1 60); do
    curl -s -o /dev/null "$BASE/get_artist_amount.php" && break
    sleep 0.5
done
curl -s -o /dev/null "$BASE/get_artist_amount.php" || die "PHP db-api did not come up (see /tmp/myscene-smoke-php.log)"

PASS=0
FAIL=0
BODY_FILE="$(mktemp)"

# expect_status LABEL EXPECTED METHOD PATH [JSON_BODY]
expect_status() {
    local label="$1" expected="$2" method="$3" path="$4" body="${5:-}"
    local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X "$method" "$BASE$path")
    if [ -n "$body" ]; then
        args+=(-H 'Content-Type: application/json' -d "$body")
    fi
    local status
    status="$(curl "${args[@]}")"
    if [ "$status" = "$expected" ]; then
        PASS=$((PASS + 1))
        echo "  ok    $label (HTTP $status)"
    else
        FAIL=$((FAIL + 1))
        echo "  FAIL  $label — expected HTTP $expected, got $status: $(cat "$BODY_FILE")"
    fi
}

# expect_contains LABEL PATTERN — checks the body of the last request.
expect_contains() {
    local label="$1" pattern="$2"
    if grep -q "$pattern" "$BODY_FILE"; then
        PASS=$((PASS + 1))
        echo "  ok    $label"
    else
        FAIL=$((FAIL + 1))
        echo "  FAIL  $label — body does not match '$pattern': $(cat "$BODY_FILE")"
    fi
}

log "Running endpoint checks"

expect_status "get_artist_amount" 200 GET /get_artist_amount.php
expect_contains "get_artist_amount shape" '"artistAmount"'

expect_status "get_genre_list" 200 GET /get_genre_list.php
expect_contains "get_genre_list shape" '"genres"'

expect_status "get_featured_artists" 200 GET /get_featured_artists.php

expect_status "get_artist (existing)" 200 POST /get_artist.php '{"artist_name":"The Belladonnas"}'
expect_status "get_artist (missing)" 404 POST /get_artist.php '{"artist_name":"No Such Band XYZ"}'

expect_status "add_artist (new)" 200 POST /add_artist.php \
    '{"artist_name":"Smoke Test Band","location_city":"Fayetteville","location_region":"AR","music_genre":"Rock","latitude":36.0626,"longitude":-94.1574}'
expect_contains "add_artist shape" '"success":true'
expect_status "add_artist (duplicate)" 409 POST /add_artist.php \
    '{"artist_name":"Smoke Test Band","location_city":"Fayetteville","location_region":"AR","music_genre":"Rock"}'
expect_status "add_artist (missing field)" 400 POST /add_artist.php '{"artist_name":"Incomplete"}'

expect_status "add_event (new)" 200 POST /add_event.php \
    '{"artist_name":"Smoke Test Band","venue_name":"Smoke Venue","location_city":"Fayetteville","location_region":"AR","event_date":"2026-12-01","event_time":"20:00"}'
expect_status "add_event (duplicate)" 409 POST /add_event.php \
    '{"artist_name":"Smoke Test Band","venue_name":"Smoke Venue","location_city":"Fayetteville","location_region":"AR","event_date":"2026-12-01"}'
expect_status "add_event (unknown artist)" 404 POST /add_event.php \
    '{"artist_name":"No Such Band XYZ","venue_name":"V","location_city":"Fayetteville","location_region":"AR","event_date":"2026-12-01"}'

expect_status "get_artist_events" 200 POST /get_artist_events.php '{"artist_name":"Smoke Test Band"}'
expect_contains "get_artist_events shape" '"events"'

expect_status "get_nearby_artists" 200 POST /get_nearby_artists.php \
    '{"latitude":36.0626,"longitude":-94.1574,"radius":10}'

expect_status "verify_user (valid)" 200 POST /verify_user.php \
    '{"username":"smoke_user","password":"smoke-password"}'
expect_contains "verify_user (valid) shape" '"verified":true'
expect_status "verify_user (wrong password)" 200 POST /verify_user.php \
    '{"username":"smoke_user","password":"nope"}'
expect_contains "verify_user (wrong) shape" '"verified":false'
expect_status "verify_user (missing field)" 400 POST /verify_user.php '{"username":"smoke_user"}'

expect_status "track_event (valid)" 200 POST /track_event.php '{"page":"index","event":"pageview"}'
expect_contains "track_event (valid) shape" '"success":true'
expect_status "track_event (bad page)" 400 POST /track_event.php '{"page":"hacker","event":"pageview"}'
expect_status "track_event (bad event)" 400 POST /track_event.php '{"page":"index","event":"hacker"}'

expect_status "OPTIONS preflight" 204 OPTIONS /get_artist_amount.php

rm -f "$BODY_FILE"
echo
log "Smoke test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
log "All db-api endpoints OK."
