#!/usr/bin/env bash

# =============================================================================
# MyScene — one-shot setup/update for the whole site
#
# Runs the three deploy scripts in dependency order on THIS machine, so a
# fresh machine gets a fully working website with a single command:
#
#     ./update.sh            # == ./update.sh all
#     ./update.sh db         # only the database
#     ./update.sh web        # only the website
#     ./update.sh api        # only the API (Node + PHP db-api)
#
# Order: db -> web -> api. The web step runs before the api step on purpose:
# on a single host the api step then sees nginx installed and moves the
# db-api vhost to port 8080 (nginx keeps port 80 for the website).
#
# Single-host convenience: when the web step runs on this machine, the site
# is pinned to the local Node API (http://<server-ip>:3000) via the
# window.MYSCENE_API_BASE mechanism. Override with your own value, e.g.:
#
#     MYSCENE_API_BASE="https://api.myscene.live" ./update.sh
#
# Each step is idempotent and never overwrites existing .env files.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log()  { echo "[myscene] $*"; }
warn() { echo "[myscene][WARN] $*" >&2; }
die()  { echo "[myscene][ERROR] $*" >&2; exit 1; }

RUN_DB=0
RUN_WEB=0
RUN_API=0
for arg in "$@"; do
    case "$arg" in
        all) RUN_DB=1; RUN_WEB=1; RUN_API=1 ;;
        db)  RUN_DB=1 ;;
        web) RUN_WEB=1 ;;
        api) RUN_API=1 ;;
        -h|--help)
            sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) die "Unknown argument: $arg (expected all|db|web|api)" ;;
    esac
done
if [ "$RUN_DB" -eq 0 ] && [ "$RUN_WEB" -eq 0 ] && [ "$RUN_API" -eq 0 ]; then
    RUN_DB=1; RUN_WEB=1; RUN_API=1
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

# If we deploy the website here, pin it to the local Node API (unless the
# user already gave an explicit MYSCENE_API_BASE).
if [ "$RUN_WEB" -eq 1 ] && [ -z "${MYSCENE_API_BASE:-}" ]; then
    if [ "$RUN_API" -eq 1 ] || curl -fsS -m 2 http://127.0.0.1:3000/ >/dev/null 2>&1; then
        LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
        LAN_IP="${LAN_IP:-127.0.0.1}"
        export MYSCENE_API_BASE="http://$LAN_IP:3000"
        log "Single-host setup detected — the website will be pinned to $MYSCENE_API_BASE"
    fi
fi

log "MyScene update — target: $([ "$RUN_DB" -eq 1 ] && echo -n 'db ')$([ "$RUN_WEB" -eq 1 ] && echo -n 'web ')$([ "$RUN_API" -eq 1 ] && echo -n 'api')"

if [ "$RUN_DB" -eq 1 ]; then
    run_step "database (scripts/dbUpdate.sh)" bash "$SCRIPT_DIR/dbUpdate.sh"
fi
if [ "$RUN_WEB" -eq 1 ]; then
    run_step "website (scripts/webUpdate.sh)" bash "$SCRIPT_DIR/webUpdate.sh"
fi
if [ "$RUN_API" -eq 1 ]; then
    run_step "api (scripts/apiUpdate.sh)" bash "$SCRIPT_DIR/apiUpdate.sh"
fi

# --- summary ------------------------------------------------------------------

echo
log "=================================================================="
log "Done. How to reach the site:"
log "  Website : http://$(hostname -I 2>/dev/null | awk '{print $1}')/   (nginx, port 80)"
if [ "$RUN_API" -eq 1 ] || curl -fsS -m 2 http://127.0.0.1:3000/ >/dev/null 2>&1; then
    log "  API     : http://127.0.0.1:3000/   (Node, pm2 process 'myscene-api')"
    log "  db-api  : http://127.0.0.1:$([ -f /etc/apache2/sites-available/myscene-dbapi.conf ] && grep -oP 'VirtualHost \*:\K[0-9]+' /etc/apache2/sites-available/myscene-dbapi.conf || echo 80)/"
fi
if [ "$RUN_DB" -eq 1 ]; then
    log "  DB creds: $HOME/myscene-db/.env"
fi
log "  pm2     : pm2 status / pm2 logs myscene-api"
log "=================================================================="
warn "If geocoding/genre features fail, fill in LOCATIONIQ_API_KEY / LASTFM_API_KEY in /var/www/myscene-api/.env and run 'pm2 reload myscene-api'."

# Keep a copy of this orchestrator in $HOME as well.
SELF_NAME="$(basename "$0")"
if [ -d "$HOME/myscene-git/scripts" ] && [ -f "$HOME/myscene-git/scripts/$SELF_NAME" ]; then
    cp "$HOME/myscene-git/scripts/$SELF_NAME" "$HOME/$SELF_NAME" 2>/dev/null && chmod +x "$HOME/$SELF_NAME" || true
fi
