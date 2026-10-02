#!/usr/bin/env bash

# =============================================================================
# MyScene — one-shot setup/update
#
# Runs the deploy scripts for the role(s) of THIS machine in dependency order.
#
# Two containers (DB on its own container, website + API on the other):
#
#   DB container :  ./update.sh db --app-host <app container IP>   # first time
#                   ./update.sh db                                 # later runs
#   app container:  MYSCENE_DB_HOST=<DB container IP> MYSCENE_DB_PASSWORD=<pw> \
#                       ./update.sh app                            # first time
#                   ./update.sh app                                # later runs
#
#   The first `db` run prints the exact `app` command (password included) and
#   writes it to ~/myscene-db/app.env; `--db-env app.env` works as well.
#   Set up the DB container first.
#
# Single host (everything on one machine):
#
#   ./update.sh all
#
# Roles:
#   app   website + API (web -> api)      db    database only
#   web   website only                    api   API only (Node + PHP db-api)
#   all   db -> web -> api on this machine
#
# Without a role the script detects it from what is installed here:
# MariaDB only -> db, API only -> app, both -> all. A fresh machine needs an
# explicit role.
#
# Options (passed to the scripts that use them):
#   --app-host HOST     dbUpdate.sh: allow the app container (repeatable)
#   --db-host HOST      apiUpdate.sh: DB container address (MYSCENE_DB_HOST)
#   --db-port PORT      apiUpdate.sh: DB port (MYSCENE_DB_PORT)
#   --db-password PW    apiUpdate.sh: DB password (MYSCENE_DB_PASSWORD)
#   --db-env FILE       apiUpdate.sh: app.env copied from the DB container
#   FullUpdate [-y]     dbUpdate.sh: drop + rebuild the database
#
# Website API base: with `all` the site is pinned to the local Node API
# (http://<server-ip>:3000). With `app` it keeps its built-in default
# (https://api.myscene.live). Override either way, e.g.:
#
#     MYSCENE_API_BASE="http://10.0.0.11:3000" ./update.sh app
#
# Each step is idempotent and never overwrites existing .env files unless DB
# settings are given explicitly.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log()  { echo "[myscene] $*"; }
warn() { echo "[myscene][WARN] $*" >&2; }
die()  { echo "[myscene][ERROR] $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

usage() {
    awk 'NR > 3 && /^# =====/ { exit } NR > 3 { sub(/^# ?/, ""); print }' "$0"
}

RUN_DB=0
RUN_WEB=0
RUN_API=0
ROLE=""
DB_ARGS=()
API_ARGS=()
while [ $# -gt 0 ]; do
    case "$1" in
        all) RUN_DB=1; RUN_WEB=1; RUN_API=1; ROLE="${ROLE:+$ROLE+}all" ;;
        app) RUN_WEB=1; RUN_API=1; ROLE="${ROLE:+$ROLE+}app" ;;
        db)  RUN_DB=1;  ROLE="${ROLE:+$ROLE+}db" ;;
        web) RUN_WEB=1; ROLE="${ROLE:+$ROLE+}web" ;;
        api) RUN_API=1; ROLE="${ROLE:+$ROLE+}api" ;;
        FullUpdate|-y|--yes) DB_ARGS+=("$1") ;;
        --app-host)
            [ $# -ge 2 ] || die "$1 needs a value"
            DB_ARGS+=("$1" "$2"); shift ;;
        --app-host=*) DB_ARGS+=("$1") ;;
        --db-host|--db-port|--db-password|--db-env)
            [ $# -ge 2 ] || die "$1 needs a value"
            API_ARGS+=("$1" "$2"); shift ;;
        --db-host=*|--db-port=*|--db-password=*|--db-env=*) API_ARGS+=("$1") ;;
        -h|--help) usage; exit 0 ;;
        *) die "Unknown argument: $1 (expected app|db|all|web|api and options — see --help)" ;;
    esac
    shift
done

# --- role auto-detection -------------------------------------------------------

has_local_db() {
    have mariadbd || have mysqld || [ -x /usr/sbin/mariadbd ] || [ -x /usr/sbin/mysqld ] \
        || dpkg -s mariadb-server >/dev/null 2>&1
}
has_local_api() {
    [ -d /var/www/myscene-api ]
}

if [ -z "$ROLE" ]; then
    if has_local_db && has_local_api; then
        RUN_DB=1; RUN_WEB=1; RUN_API=1; ROLE="all"
    elif has_local_db; then
        RUN_DB=1; ROLE="db"
    elif has_local_api; then
        RUN_WEB=1; RUN_API=1; ROLE="app"
    else
        usage
        die "Fresh machine — choose a role: './update.sh db --app-host <ip>' on the DB container, './update.sh app' on the app container, or './update.sh all' for a single host."
    fi
    log "Detected role: $ROLE"
fi

# Guard against the classic mistake: installing MariaDB on the app container.
if [ "$RUN_DB" -eq 1 ] && [ "$RUN_API" -eq 1 ] && [ "${#API_ARGS[@]}" -gt 0 ]; then
    die "DB settings (--db-*) point the API at another container — use 'app' instead of 'all' here."
fi
if [ "${#DB_ARGS[@]}" -gt 0 ] && [ "$RUN_DB" -eq 0 ]; then
    die "Options ${DB_ARGS[*]} belong to the db role — run them on the DB container."
fi
if [ "${#API_ARGS[@]}" -gt 0 ] && [ "$RUN_API" -eq 0 ]; then
    die "--db-host/--db-port/--db-password/--db-env belong to the app/api role — run them on the app container."
fi

run_step() { # $1 = label, rest = command
    local label="$1"; shift
    echo
    log "=================================================================="
    log "STEP: $label"
    log "=================================================================="
    if ! "$@"; then
        die "Step '$label' failed — see the output above."
    fi
}

# Single host: pin the website to the local Node API (unless the user already
# gave an explicit MYSCENE_API_BASE). In the two-container `app` role the site
# keeps its public default, since browsers cannot reach a LAN address.
if [ "$RUN_WEB" -eq 1 ] && [ "$RUN_DB" -eq 1 ] && [ -z "${MYSCENE_API_BASE:-}" ]; then
    LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    LAN_IP="${LAN_IP:-127.0.0.1}"
    export MYSCENE_API_BASE="http://$LAN_IP:3000"
    log "Single-host setup — the website will be pinned to $MYSCENE_API_BASE"
fi

log "MyScene update — role: $ROLE — steps: $([ "$RUN_DB" -eq 1 ] && echo -n 'db ')$([ "$RUN_WEB" -eq 1 ] && echo -n 'web ')$([ "$RUN_API" -eq 1 ] && echo -n 'api')"

if [ "$RUN_DB" -eq 1 ]; then
    run_step "database (scripts/dbUpdate.sh)" bash "$SCRIPT_DIR/dbUpdate.sh" "${DB_ARGS[@]+"${DB_ARGS[@]}"}"
fi
if [ "$RUN_WEB" -eq 1 ]; then
    run_step "website (scripts/webUpdate.sh)" bash "$SCRIPT_DIR/webUpdate.sh"
fi
if [ "$RUN_API" -eq 1 ]; then
    run_step "api (scripts/apiUpdate.sh)" bash "$SCRIPT_DIR/apiUpdate.sh" "${API_ARGS[@]+"${API_ARGS[@]}"}"
fi

# --- summary ------------------------------------------------------------------

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
log "=================================================================="
log "Done ($ROLE)."
if [ "$RUN_WEB" -eq 1 ]; then
    log "  Website : http://$IP/   (nginx, port 80)"
fi
if [ "$RUN_API" -eq 1 ]; then
    DBAPI_PORT="$(grep -oP 'VirtualHost \*:\K[0-9]+' /etc/apache2/sites-available/myscene-dbapi.conf 2>/dev/null || echo 80)"
    log "  API     : http://$IP:3000/   (Node, pm2 process 'myscene-api')"
    log "  db-api  : http://127.0.0.1:$DBAPI_PORT/   (Apache + PHP)"
    log "  DB creds: /var/www/myscene-api/db-api/.env"
    log "  pm2     : pm2 status / pm2 logs myscene-api"
fi
if [ "$RUN_DB" -eq 1 ]; then
    log "  Database: MariaDB on $IP:3306 — creds in $HOME/myscene-db/.env"
    [ -f "$HOME/myscene-db/app.env" ] && log "            app-container creds in $HOME/myscene-db/app.env"
fi
log "=================================================================="
if [ "$RUN_API" -eq 1 ]; then
    warn "If geocoding/genre features fail, fill in LOCATIONIQ_API_KEY / LASTFM_API_KEY in /var/www/myscene-api/.env and run 'pm2 reload myscene-api'."
fi

# Keep a copy of this orchestrator in $HOME as well.
SELF_NAME="$(basename "$0")"
if [ -d "$HOME/myscene-git/scripts" ] && [ -f "$HOME/myscene-git/scripts/$SELF_NAME" ]; then
    cp "$HOME/myscene-git/scripts/$SELF_NAME" "$HOME/$SELF_NAME" 2>/dev/null && chmod +x "$HOME/$SELF_NAME" || true
fi
