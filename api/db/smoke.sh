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

# --skip-ssl: the disposable MariaDB container ships without TLS certs, and
# newer MariaDB clients (11.8+) enable SSL by default. Accepted by both the
# MySQL 8 client (CI) and the MariaDB client.
mysql_cli() { mysql --skip-ssl -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" -p"$DB_PASSWORD" "$@"; }

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

# expect_not_contains LABEL PATTERN — the body of the last request must NOT match.
expect_not_contains() {
    local label="$1" pattern="$2"
    if grep -q "$pattern" "$BODY_FILE"; then
        FAIL=$((FAIL + 1))
        echo "  FAIL  $label — body unexpectedly matches '$pattern': $(cat "$BODY_FILE")"
    else
        PASS=$((PASS + 1))
        echo "  ok    $label"
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
    '{"artist_name":"Smoke Test Band","location_city":"Fayetteville","location_region":"AR","music_genre":"Rock","latitude":36.0626,"longitude":-94.1574,"actor_username":"smoke_user"}'
expect_contains "add_artist shape" '"success":true'
# The response id must be the new Artists row, not the ActivityLog row the
# same request inserts (lastInsertId is connection-wide).
expect_contains "add_artist id is a new row" '"id":[1-9]'
expect_status "add_artist (duplicate)" 409 POST /add_artist.php \
    '{"artist_name":"Smoke Test Band","location_city":"Fayetteville","location_region":"AR","music_genre":"Rock"}'
expect_status "add_artist (missing field)" 400 POST /add_artist.php '{"artist_name":"Incomplete"}'

expect_status "add_event (new)" 200 POST /add_event.php \
    '{"artist_name":"Smoke Test Band","venue_name":"Smoke Venue","location_city":"Fayetteville","location_region":"AR","event_date":"2026-12-01","event_time":"20:00","actor_username":"smoke_user"}'
expect_status "add_event (duplicate)" 409 POST /add_event.php \
    '{"artist_name":"Smoke Test Band","venue_name":"Smoke Venue","location_city":"Fayetteville","location_region":"AR","event_date":"2026-12-01"}'
expect_status "add_event (unknown artist)" 404 POST /add_event.php \
    '{"artist_name":"No Such Band XYZ","venue_name":"V","location_city":"Fayetteville","location_region":"AR","event_date":"2026-12-01"}'

expect_status "get_artist_events" 200 POST /get_artist_events.php '{"artist_name":"Smoke Test Band"}'
expect_contains "get_artist_events shape" '"events"'

expect_status "get_nearby_artists" 200 POST /get_nearby_artists.php \
    '{"latitude":36.0626,"longitude":-94.1574,"radius":10}'

# --- shows near you (Batch 4): nearby events + dates filter ---
# The migration 007 index must be in place (schema.sql + migrations above).
if mysql_cli -e "SHOW INDEX FROM \`$DB_NAME\`.Events WHERE Key_name='idx_events_coords'" | grep -q idx_events_coords; then
    PASS=$((PASS + 1))
    echo "  ok    idx_events_coords exists"
else
    FAIL=$((FAIL + 1))
    echo "  FAIL  idx_events_coords missing from Events"
fi

# Events at known offsets from today (relative dates keep the window checks
# independent of when the smoke test runs), seeded through the real
# add_event endpoint. "Smoke Test Band" exists from the add_artist checks.
D_IN_3="$(date -d '+3 days' +%F)"
D_IN_10="$(date -d '+10 days' +%F)"
D_PAST="$(date -d '-3 days' +%F)"

expect_status "add_event (in 3 days)" 200 POST /add_event.php \
    "{\"artist_name\":\"Smoke Test Band\",\"venue_name\":\"Smoke Venue Near\",\"location_city\":\"Fayetteville\",\"location_region\":\"AR\",\"event_date\":\"$D_IN_3\",\"event_time\":\"20:00\",\"ticket_url\":\"https://tickets.example/near\",\"latitude\":36.0626,\"longitude\":-94.1574}"
expect_status "add_event (in 10 days)" 200 POST /add_event.php \
    "{\"artist_name\":\"Smoke Test Band\",\"venue_name\":\"Smoke Venue Far\",\"location_city\":\"Fayetteville\",\"location_region\":\"AR\",\"event_date\":\"$D_IN_10\",\"latitude\":36.0626,\"longitude\":-94.1574}"
expect_status "add_event (past)" 200 POST /add_event.php \
    "{\"artist_name\":\"Smoke Test Band\",\"venue_name\":\"Smoke Venue Past\",\"location_city\":\"Fayetteville\",\"location_region\":\"AR\",\"event_date\":\"$D_PAST\",\"latitude\":36.0626,\"longitude\":-94.1574}"
# A second artist whose only show is 10 days out — the Dates-filter window
# check needs an artist that falls outside the 7-day window.
expect_status "add_artist (events band)" 200 POST /add_artist.php \
    '{"artist_name":"Smoke Events Band","location_city":"Fayetteville","location_region":"AR","music_genre":"Rock","latitude":36.0626,"longitude":-94.1574}'
expect_status "add_event (events band, in 10 days)" 200 POST /add_event.php \
    "{\"artist_name\":\"Smoke Events Band\",\"venue_name\":\"Smoke Venue Solo\",\"location_city\":\"Fayetteville\",\"location_region\":\"AR\",\"event_date\":\"$D_IN_10\",\"latitude\":36.0626,\"longitude\":-94.1574}"

expect_status "get_nearby_events (Fayetteville, 10mi, 7d)" 200 POST /get_nearby_events.php \
    '{"latitude":36.0626,"longitude":-94.1574,"radius":10,"days":7}'
expect_contains "get_nearby_events shape" '"events"'
expect_contains "get_nearby_events lists the 3-day show" '"venue_name":"Smoke Venue Near"'
expect_contains "get_nearby_events joins the artist name" '"artist_name":"Smoke Test Band"'
expect_contains "get_nearby_events has distance" '"distance_miles"'
expect_not_contains "get_nearby_events excludes the 10-day show (7d window)" '"venue_name":"Smoke Venue Far"'
expect_not_contains "get_nearby_events excludes past shows" '"venue_name":"Smoke Venue Past"'

expect_status "get_nearby_events (30d window, default radius)" 200 POST /get_nearby_events.php \
    '{"latitude":36.0626,"longitude":-94.1574,"days":30}'
expect_contains "get_nearby_events 30d includes the 10-day show" '"venue_name":"Smoke Venue Far"'

expect_status "get_nearby_events (far away)" 200 POST /get_nearby_events.php \
    '{"latitude":40.7128,"longitude":-74.006,"radius":10,"days":30}'
expect_not_contains "get_nearby_events radius excludes distant shows" '"Smoke Venue'

expect_status "get_nearby_events (missing coords)" 400 POST /get_nearby_events.php '{"radius":10}'
expect_status "get_nearby_events (out-of-range coords)" 400 POST /get_nearby_events.php '{"latitude":95,"longitude":-94.1574}'
expect_status "get_nearby_events (bad radius)" 400 POST /get_nearby_events.php '{"latitude":36.0626,"longitude":-94.1574,"radius":0}'
expect_status "get_nearby_events (fractional days)" 400 POST /get_nearby_events.php '{"latitude":36.0626,"longitude":-94.1574,"days":7.5}'

expect_status "get_artists_with_events (7d)" 200 POST /get_artists_with_events.php '{"days":7}'
expect_contains "get_artists_with_events shape" '"artists"'
expect_contains "get_artists_with_events 7d lists the 3-day artist" '"artist_name":"Smoke Test Band"'
expect_not_contains "get_artists_with_events 7d excludes the 10-day-only artist" '"Smoke Events Band"'

expect_status "get_artists_with_events (30d)" 200 POST /get_artists_with_events.php '{"days":30}'
expect_contains "get_artists_with_events 30d lists the 10-day-only artist" '"Smoke Events Band"'

expect_status "get_artists_with_events (1d)" 200 POST /get_artists_with_events.php '{"days":1}'
expect_not_contains "get_artists_with_events 1d excludes the 10-day-only artist" '"Smoke Events Band"'

expect_status "get_artists_with_events (bad days)" 400 POST /get_artists_with_events.php '{"days":"soon"}'

expect_status "verify_user (valid)" 200 POST /verify_user.php \
    '{"username":"smoke_user","password":"smoke-password"}'
expect_contains "verify_user (valid) shape" '"verified":true'
expect_status "verify_user (wrong password)" 200 POST /verify_user.php \
    '{"username":"smoke_user","password":"nope"}'
expect_contains "verify_user (wrong) shape" '"verified":false'
expect_status "verify_user (missing field)" 400 POST /verify_user.php '{"username":"smoke_user"}'

# --- auth (Batch 2): registration + sessions ---
expect_status "register_user (valid)" 200 POST /register_user.php \
    '{"username":"smoke_fan","password":"fan-password-1"}'
expect_contains "register_user (valid) shape" '"success":true'
expect_status "register_user (duplicate)" 409 POST /register_user.php \
    '{"username":"smoke_fan","password":"another-password"}'
expect_status "register_user (short password)" 400 POST /register_user.php \
    '{"username":"smoke_fan2","password":"short"}'
expect_status "register_user (bad username)" 400 POST /register_user.php \
    '{"username":"x","password":"fan-password-1"}'
expect_status "register_user (missing field)" 400 POST /register_user.php '{"username":"smoke_fan"}'

expect_status "create_session (valid)" 200 POST /create_session.php \
    '{"username":"smoke_user","password":"smoke-password"}'
expect_contains "create_session (valid) shape" '"verified":true'
SESSION_ID="$(sed -n 's/.*"session_id":"\([^"]*\)".*/\1/p' "$BODY_FILE")"
if [ -n "$SESSION_ID" ]; then
    PASS=$((PASS + 1))
    echo "  ok    create_session session_id present"
else
    FAIL=$((FAIL + 1))
    echo "  FAIL  create_session session_id missing: $(cat "$BODY_FILE")"
fi
expect_status "create_session (wrong password)" 200 POST /create_session.php \
    '{"username":"smoke_user","password":"nope"}'
expect_contains "create_session (wrong) shape" '"verified":false'
expect_status "create_session (missing field)" 400 POST /create_session.php '{"username":"smoke_user"}'

expect_status "me (valid session)" 200 POST /me.php "{\"session_id\":\"$SESSION_ID\"}"
expect_contains "me shape (username)" '"username":"smoke_user"'
expect_contains "me shape (artist_status)" '"artist_status":"none"'
expect_status "me (unknown session)" 404 POST /me.php \
    '{"session_id":"0000000000000000000000000000000000000000000000000000000000000000"}'
expect_status "me (missing field)" 400 POST /me.php '{}'

expect_status "request_artist_access (valid)" 200 POST /request_artist_access.php "{\"session_id\":\"$SESSION_ID\"}"
expect_contains "request_artist_access shape" '"artist_status":"pending"'
expect_status "request_artist_access (no-op when pending)" 200 POST /request_artist_access.php "{\"session_id\":\"$SESSION_ID\"}"
expect_contains "request_artist_access (no-op) shape" '"artist_status":"pending"'
expect_status "request_artist_access (unknown session)" 404 POST /request_artist_access.php \
    '{"session_id":"0000000000000000000000000000000000000000000000000000000000000000"}'

# --- admin dashboard (Batch 3): verification queue + analytics ---
# smoke_user is pending at this point (request_artist_access above).
expect_status "get_pending_artists (pending user present)" 200 POST /get_pending_artists.php '{}'
expect_contains "get_pending_artists shape" '"pending_artists"'
expect_contains "get_pending_artists lists smoke_user" '"username":"smoke_user"'
expect_contains "get_pending_artists has created_at" '"created_at"'

expect_status "set_artist_status (approve)" 200 POST /set_artist_status.php \
    '{"target_username":"smoke_user","status":"verified","actor_username":"smoke_user"}'
expect_contains "set_artist_status (approve) shape" '"success":true'
expect_contains "set_artist_status (approve) status" '"artist_status":"verified"'

# --- artist profiles: verified accounts + revoking the role ---
expect_status "get_verified_artists (after approve)" 200 POST /get_verified_artists.php '{}'
expect_contains "get_verified_artists shape" '"verified_artists"'
expect_contains "get_verified_artists lists smoke_user" '"username":"smoke_user"'
expect_contains "get_verified_artists has artist_verified_at" '"artist_verified_at":"2'
expect_status "me (after approve) shows verified" 200 POST /me.php "{\"session_id\":\"$SESSION_ID\"}"
expect_contains "me (after approve) artist_status" '"artist_status":"verified"'
expect_status "get_pending_artists (empty after approve)" 200 POST /get_pending_artists.php '{}'
expect_not_contains "get_pending_artists no longer lists smoke_user" '"username":"smoke_user"'

expect_status "set_artist_status (reject)" 200 POST /set_artist_status.php \
    '{"target_username":"smoke_user","status":"none","actor_username":"smoke_user"}'
expect_contains "set_artist_status (reject) status" '"artist_status":"none"'
expect_status "get_verified_artists (after revoke)" 200 POST /get_verified_artists.php '{}'
expect_not_contains "get_verified_artists no longer lists smoke_user" '"username":"smoke_user"'
expect_status "set_artist_status (bad status)" 400 POST /set_artist_status.php \
    '{"target_username":"smoke_user","status":"hacker"}'
expect_status "set_artist_status (bad username)" 400 POST /set_artist_status.php \
    '{"target_username":"x","status":"verified"}'
expect_status "set_artist_status (unknown user)" 404 POST /set_artist_status.php \
    '{"target_username":"no_such_user_xyz","status":"verified"}'
expect_status "set_artist_status (missing field)" 400 POST /set_artist_status.php \
    '{"target_username":"smoke_user"}'

# --- recent changes: the activity feed (admin dashboard) ---
# By this point the feed holds: artist_added + event_added (the adds above,
# attributed to smoke_user via actor_username), account_created (smoke_fan's
# registration), artist_requested, and artist_approved + artist_rejected
# (the status changes above).
expect_status "get_recent_activity (shape)" 200 POST /get_recent_activity.php '{}'
expect_contains "get_recent_activity shape" '"recent_activity"'
expect_contains "get_recent_activity artist_added" '"actor_username":"smoke_user","action":"artist_added"'
expect_contains "get_recent_activity artist_added target" '"target":"Smoke Test Band"'
expect_contains "get_recent_activity event_added" '"actor_username":"smoke_user","action":"event_added"'
expect_contains "get_recent_activity event_added target" '"target":"Smoke Test Band — Smoke Venue"'
expect_contains "get_recent_activity account_created" '"actor_username":"smoke_fan","action":"account_created"'
expect_contains "get_recent_activity artist_requested" '"actor_username":"smoke_user","action":"artist_requested"'
expect_contains "get_recent_activity artist_approved" '"actor_username":"smoke_user","action":"artist_approved"'
expect_contains "get_recent_activity artist_rejected" '"actor_username":"smoke_user","action":"artist_rejected"'
expect_contains "get_recent_activity has created_at" '"created_at"'

# Seed a few analytics events through the real endpoint, then query the
# summary (all inside the 30-day window).
expect_status "track_event (search_success)" 200 POST /track_event.php \
    '{"page":"index","event":"search_success","detail":"genre:Rock|results:3"}'
expect_status "track_event (profile_view)" 200 POST /track_event.php \
    '{"page":"viewArtist","event":"profile_view","detail":"artist:Smoke Test Band"}'
expect_status "track_event (analytics page)" 200 POST /track_event.php \
    '{"page":"analytics","event":"pageview"}'

expect_status "get_analytics_summary (30d)" 200 POST /get_analytics_summary.php '{"days":30}'
expect_contains "get_analytics_summary totals" '"pageviews"'
expect_contains "get_analytics_summary searches" '"searches"'
expect_contains "get_analytics_summary profile_views" '"profile_views"'
expect_contains "get_analytics_summary top_artists" '"top_artists"'
expect_contains "get_analytics_summary top artist row" '"artist":"Smoke Test Band"'
expect_contains "get_analytics_summary top_genres" '"top_genres"'
expect_contains "get_analytics_summary top genre row" '"genre":"Rock"'
expect_contains "get_analytics_summary daily series" '"daily_pageviews"'
expect_status "get_analytics_summary (default days)" 200 POST /get_analytics_summary.php '{}'
expect_status "get_analytics_summary (bad days)" 400 POST /get_analytics_summary.php '{"days":7}'
expect_status "get_analytics_summary (non-numeric days)" 400 POST /get_analytics_summary.php '{"days":"soon"}'

expect_status "logout (valid)" 200 POST /logout.php "{\"session_id\":\"$SESSION_ID\"}"
expect_contains "logout shape" '"success":true'
expect_status "logout (idempotent)" 200 POST /logout.php "{\"session_id\":\"$SESSION_ID\"}"
expect_status "logout (missing field)" 400 POST /logout.php '{}'

expect_status "track_event (valid)" 200 POST /track_event.php '{"page":"index","event":"pageview"}'
expect_contains "track_event (valid) shape" '"success":true'
expect_status "track_event (shows page)" 200 POST /track_event.php '{"page":"shows","event":"pageview"}'
expect_status "track_event (bad page)" 400 POST /track_event.php '{"page":"hacker","event":"pageview"}'
expect_status "track_event (bad event)" 400 POST /track_event.php '{"page":"index","event":"hacker"}'

expect_status "OPTIONS preflight" 204 OPTIONS /get_artist_amount.php

rm -f "$BODY_FILE"
echo
log "Smoke test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
log "All db-api endpoints OK."
