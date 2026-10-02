#!/usr/bin/env bash

# =============================================================================
# MyScene — API update script
#
# Run this on the API host. It is idempotent: on a fresh machine it installs
# everything (Node, pm2, Apache + PHP, Composer) and starts the services; on
# later runs it just redeploys the latest code and restarts the services.
#
# What it deploys:
#   - Node/Express API server   api/server/ -> /var/www/myscene-api
#     (run by pm2 as process 'myscene-api', default port 3000)
#   - PHP db-api endpoints      api/db/     -> /var/www/myscene-api/db-api
#     (served by Apache so the Node server can POST to them)
#
# Environment files (a file that already exists is NEVER overwritten):
#   /var/www/myscene-api/.env         Node server config (port, DB_API_BASE_URL,
#                                     ALLOWED_ORIGINS, upstream API keys).
#                                     Created from api/server/.env.example with
#                                     sensible single-host defaults if missing.
#   /var/www/myscene-api/db-api/.env  DB credentials read by PHP db-api
#                                     (bootstrap.php). Seeded from
#                                     ~/myscene-db/.env when available (written
#                                     by dbUpdate.sh), otherwise from
#                                     .env.example.
#
# Apache port: the db-api vhost uses port 80 unless nginx is installed or
# port 80 is busy (single-host setups run the website on nginx:80), in which
# case it uses 8080 and a fresh Node .env points DB_API_BASE_URL there.
#
# Usage:
#   ./apiUpdate.sh
#
# Prerequisite for a fully working site: run scripts/dbUpdate.sh first (on
# this host, or copy its ~/myscene-db/.env here).
# =============================================================================

set -euo pipefail

REPO_URL="${MYSCENE_REPO_URL:-https://github.com/BradenLemna/myscene.git}"
GIT_DIR="$HOME/myscene-git"
API_DIR="/var/www/myscene-api"
DBAPI_DIR="$API_DIR/db-api"
DBAPI_VHOST="/etc/apache2/sites-available/myscene-dbapi.conf"
SELF_NAME="$(basename "$0")"
RUN_USER="$(id -un)"

# --- small helpers ----------------------------------------------------------

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        echo "[myscene][ERROR] This script needs root (or passwordless sudo) to manage packages/services." >&2
        exit 1
    fi
fi

log()  { echo "[myscene] $*"; }
warn() { echo "[myscene][WARN] $*" >&2; }
die()  { echo "[myscene][ERROR] $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
is_tty() { [ -t 0 ]; }

apt_install() {
    local missing=()
    for pkg in "$@"; do
        dpkg -s "$pkg" >/dev/null 2>&1 || missing+=("$pkg")
    done
    [ ${#missing[@]} -eq 0 ] && return 0
    log "Installing packages: ${missing[*]}"
    DEBIAN_FRONTEND=noninteractive $SUDO apt-get update -qq
    DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y --no-install-recommends "${missing[@]}"
}

have_systemd() { [ -d /run/systemd/system ]; }

svc_running() { # $1 = unit, $2 = service name
    if have_systemd; then
        systemctl is-active --quiet "$1"
    else
        service "$2" status >/dev/null 2>&1
    fi
}

svc_start() { # $1 = unit, $2 = service name
    if svc_running "$1" "$2"; then
        return 0
    fi
    if have_systemd; then
        $SUDO systemctl start "$1" || true
        $SUDO systemctl enable "$1" || true
    else
        $SUDO service "$2" start || true
    fi
}

svc_reload() { # $1 = unit, $2 = service name
    if have_systemd; then
        $SUDO systemctl reload "$1" 2>/dev/null || $SUDO systemctl restart "$1"
    else
        $SUDO service "$2" reload 2>/dev/null || $SUDO service "$2" restart
    fi
}

port_in_use() { # $1 = TCP port on localhost
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&-; return 0; }
    return 1
}

# True when TCP port $1 is held by something OTHER than Apache. Apache holding
# port 80 itself (a previous run in port-80 mode) must not count as "busy",
# otherwise the vhost would flip to 8080 on every second run.
port_busy_by_other() { # $1 = TCP port
    port_in_use "$1" || return 1
    if have ss; then
        ! $SUDO ss -Hltnp "sport = :$1" 2>/dev/null | grep -q '"apache2"'
    else
        ! svc_running apache2 apache2
    fi
}

# Make sure ports.conf has an active "Listen <port>" line (uncommenting one
# this script disabled earlier, or appending a new one).
ensure_listen() { # $1 = port
    local conf=/etc/apache2/ports.conf
    if grep -Eq "^[[:space:]]*Listen[[:space:]]+$1[[:space:]]*$" "$conf" 2>/dev/null; then
        return 0
    fi
    if grep -Eq "^# Listen $1 +# disabled by apiUpdate.sh" "$conf" 2>/dev/null; then
        $SUDO sed -i -E "s/^# Listen $1 +# disabled by apiUpdate.sh.*$/Listen $1/" "$conf"
    else
        $SUDO sh -c "echo 'Listen $1' >> '$conf'"
    fi
}

# Comment out a top-level "Listen <port>" line so Apache does not try to bind it.
disable_listen() { # $1 = port
    $SUDO sed -i -E "s/^[[:space:]]*Listen[[:space:]]+$1[[:space:]]*$/# Listen $1   # disabled by apiUpdate.sh (port $1 belongs to another server)/" \
        /etc/apache2/ports.conf
}

apache_diagnostics() {
    warn "Apache diagnostics:"
    { have ss && $SUDO ss -ltnp 2>/dev/null | grep -E ":(80|$DB_API_PORT)[[:space:]]" ; } >&2 || true
    if have_systemd; then
        $SUDO journalctl -u apache2 --no-pager -n 20 >&2 2>/dev/null || true
    fi
    $SUDO tail -n 20 /var/log/apache2/error.log >&2 2>/dev/null || true
}

# HTTP GET that retries for up to ~15s; prints the body on success.
wait_for_http() { # $1 = url
    local _
    for _ in $(seq 1 15); do
        if curl -fsS -m 5 "$1" 2>/dev/null; then
            return 0
        fi
        sleep 1
    done
    return 1
}

# HTTP POST (JSON) that retries for up to ~15s; prints the body on success.
wait_for_http_post() { # $1 = url, $2 = json body
    local _
    for _ in $(seq 1 15); do
        if curl -fsS -m 5 -X POST -H 'Content-Type: application/json' -d "$2" "$1" 2>/dev/null; then
            return 0
        fi
        sleep 1
    done
    return 1
}

fetch_repo() {
    if [ -d "$GIT_DIR/.git" ]; then
        log "Updating existing checkout at $GIT_DIR"
        local branch
        branch="$(git -C "$GIT_DIR" symbolic-ref --short -q HEAD || echo main)"
        if git -C "$GIT_DIR" fetch --quiet origin "$branch" \
           && git -C "$GIT_DIR" checkout --quiet -B "$branch" "origin/$branch"; then
            return 0
        fi
        warn "Pull failed — re-cloning $GIT_DIR"
        rm -rf "$GIT_DIR"
    fi
    log "Cloning $REPO_URL -> $GIT_DIR"
    git clone --quiet "$REPO_URL" "$GIT_DIR"
}

self_update() {
    if [ -f "$GIT_DIR/scripts/$SELF_NAME" ]; then
        cp "$GIT_DIR/scripts/$SELF_NAME" "$HOME/$SELF_NAME" 2>/dev/null && chmod +x "$HOME/$SELF_NAME" || true
    fi
}

# --- 0. Choose the Apache port -----------------------------------------------
# Decided before Apache is installed/started so nothing tries to grab port 80
# while nginx (single-host setup) owns it.

DB_API_PORT=80
if have nginx || [ -f /etc/nginx/nginx.conf ] || port_busy_by_other 80; then
    DB_API_PORT=8080
fi
log "PHP db-api will be served by Apache on port $DB_API_PORT."

# --- 1. Dependencies ---------------------------------------------------------

log "Checking dependencies..."
PKGS=()
if ! have apache2; then
    PKGS+=(apache2 libapache2-mod-php)
fi
if ! have php; then
    PKGS+=(php)
fi
if ! php -m 2>/dev/null | grep -q '^pdo_mysql$'; then
    PKGS+=(php-mysql)
fi
if [ ${#PKGS[@]} -gt 0 ]; then
    # A freshly installed apache2 package tries to start on port 80; with nginx
    # there that start fails and can make dpkg error out. Block service starts
    # during the install (policy-rc.d) — Apache is started in step 5 once it is
    # configured for the right port.
    POLICY_RC=/usr/sbin/policy-rc.d
    BLOCKED_START=0
    if [ "$DB_API_PORT" -ne 80 ] && [ ! -e "$POLICY_RC" ]; then
        printf '#!/bin/sh\nexit 101\n' | $SUDO tee "$POLICY_RC" >/dev/null
        $SUDO chmod +x "$POLICY_RC"
        BLOCKED_START=1
    fi
    APT_RC=0
    apt_install "${PKGS[@]}" || APT_RC=$?
    if [ "$BLOCKED_START" -eq 1 ]; then
        $SUDO rm -f "$POLICY_RC"
    fi
    [ "$APT_RC" -eq 0 ] || die "Package install failed"
fi

if ! have node || [ "$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" -lt 18 ]; then
    apt_install nodejs npm
fi

if ! have pm2; then
    log "Installing pm2 (npm -g)"
    $SUDO npm install -g pm2 --no-audit --no-fund
fi

if ! have composer; then
    log "Installing composer (best effort — PHP db-api has a built-in .env fallback without it)"
    apt_install composer || warn "composer install failed — continuing without it"
fi

# Apache is (re)started in step 5, after ports.conf and the vhost are set up
# for $DB_API_PORT — starting it here would bind the stock port 80.

# --- 2. Fresh repository code ------------------------------------------------

fetch_repo
[ -d "$GIT_DIR/api/server" ] || die "api/server/ not found in $GIT_DIR"
[ -d "$GIT_DIR/api/db" ]     || die "api/db/ not found in $GIT_DIR"

# --- 3. Deploy the Node API server -------------------------------------------

log "Deploying Node API server -> $API_DIR"
$SUDO mkdir -p "$API_DIR"

# A .env already present on the server is never overwritten by a deploy.
SAVED_ENV=""
if [ -f "$API_DIR/.env" ]; then
    SAVED_ENV="$(mktemp /tmp/myscene-api.env.XXXXXX)"
    $SUDO cp "$API_DIR/.env" "$SAVED_ENV"
fi

$SUDO cp -r "$GIT_DIR/api/server/." "$API_DIR/"

# Drop the pre-rework legacy layout if it is still present on the server.
$SUDO rm -rf "$API_DIR/apiServer" "$API_DIR/apiCalls"
$SUDO rm -f  "$API_DIR/apiKeys.json"

if [ -n "$SAVED_ENV" ]; then
    $SUDO mv "$SAVED_ENV" "$API_DIR/.env"
fi

# If we are not root, hand the deploy dir to the calling user so npm/composer/
# pm2 can work with it without elevated privileges.
if [ "$(id -u)" -ne 0 ]; then
    $SUDO chown -R "$RUN_USER" "$API_DIR"
fi

log "Installing npm dependencies"
(cd "$API_DIR" && npm install --omit=dev --no-audit --no-fund)

# Composer deps (phpdotenv) — bootstrap.php falls back to a built-in .env
# parser when vendor/ is absent, so a failure here is not fatal.
$SUDO cp "$GIT_DIR/composer.json" "$API_DIR/composer.json"
[ -f "$GIT_DIR/composer.lock" ] && $SUDO cp "$GIT_DIR/composer.lock" "$API_DIR/composer.lock"
if have composer; then
    log "Installing composer dependencies"
    (cd "$API_DIR" && composer install --no-dev --quiet) || warn "composer install failed — PHP db-api will use its built-in .env parser"
else
    warn "composer not available — PHP db-api will use its built-in .env parser"
fi

# Fresh .env for the Node server (only when none exists yet).
if [ ! -f "$API_DIR/.env" ]; then
    LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    LAN_IP="${LAN_IP:-127.0.0.1}"
    if [ "$DB_API_PORT" -eq 80 ]; then
        DB_API_BASE="http://127.0.0.1"
    else
        DB_API_BASE="http://127.0.0.1:$DB_API_PORT"
    fi
    ORIGINS="https://myscene.live,http://localhost,http://127.0.0.1"
    case ",$ORIGINS," in *",http://$LAN_IP,"*) : ;; *) ORIGINS="$ORIGINS,http://$LAN_IP" ;; esac
    cat > "$API_DIR/.env" <<EOF
PORT=3000
DB_API_BASE_URL=$DB_API_BASE
ALLOWED_ORIGINS=$ORIGINS
LOCATIONIQ_API_KEY=
LASTFM_API_KEY=
UPSTREAM_TIMEOUT_MS=10000
EOF
    chmod 600 "$API_DIR/.env"
    log "Created $API_DIR/.env from the example with single-host defaults."
    warn "Fill in LOCATIONIQ_API_KEY / LASTFM_API_KEY in $API_DIR/.env for geocoding/genre features."
fi

# --- 4. Deploy the PHP db-api --------------------------------------------------

log "Deploying PHP db-api -> $DBAPI_DIR"
$SUDO mkdir -p "$DBAPI_DIR"
$SUDO rm -f "$DBAPI_DIR"/*.php
$SUDO cp "$GIT_DIR/api/db/"*.php "$DBAPI_DIR/"

if [ -f "$DBAPI_DIR/.env" ]; then
    log "Existing $DBAPI_DIR/.env left untouched."
elif [ -f "$HOME/myscene-db/.env" ]; then
    log "Seeding $DBAPI_DIR/.env from ~/myscene-db/.env"
    $SUDO tee "$DBAPI_DIR/.env" > /dev/null < "$HOME/myscene-db/.env"
elif [ -f "$GIT_DIR/.env.example" ]; then
    log "Creating $DBAPI_DIR/.env from .env.example — run scripts/dbUpdate.sh to provision the database!"
    DB_PW="$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    $SUDO tee "$DBAPI_DIR/.env" > /dev/null <<EOF
DB_HOST=localhost
DB_PORT=3306
DB_NAME=MyScene
DB_USERNAME=myscene
DB_PASSWORD=$DB_PW
DB_CHARSET=utf8mb4
EOF
    warn "Generated a placeholder password for the 'myscene' MySQL user — store it in ~/myscene-db/.env and run dbUpdate.sh."
fi
# PHP runs as www-data: it must be able to read the credentials, but nobody
# else (and not over HTTP either — the vhost below denies .env requests).
$SUDO chown www-data:www-data "$DBAPI_DIR/.env" 2>/dev/null || $SUDO chown root:root "$DBAPI_DIR/.env"
$SUDO chmod 600 "$DBAPI_DIR/.env"

# --- 5. Apache vhost for the db-api -------------------------------------------

log "Configuring Apache vhost (port $DB_API_PORT)"
PORTS_SUM_BEFORE="$(md5sum /etc/apache2/ports.conf 2>/dev/null || true)"
ensure_listen "$DB_API_PORT"
if [ "$DB_API_PORT" -ne 80 ]; then
    # Apache's stock ports.conf has "Listen 80". On a single host nginx owns
    # port 80, and an Apache that still tries to bind it refuses to start at
    # all — taking the 8080 db-api down with it. Drop that line and the
    # stock *:80 default site.
    disable_listen 80
    $SUDO a2dissite 000-default >/dev/null 2>&1 || true
fi
PORTS_SUM_AFTER="$(md5sum /etc/apache2/ports.conf 2>/dev/null || true)"
$SUDO tee "$DBAPI_VHOST" > /dev/null <<EOF
<VirtualHost *:$DB_API_PORT>
    ServerName apiserver.lan
    ServerAlias localhost 127.0.0.1
    DocumentRoot $DBAPI_DIR
    <Directory $DBAPI_DIR>
        AllowOverride All
        Require all granted
        <FilesMatch "^\.env">
            Require all denied
        </FilesMatch>
    </Directory>
    ErrorLog \${APACHE_LOG_DIR}/myscene-dbapi_error.log
    CustomLog \${APACHE_LOG_DIR}/myscene-dbapi_access.log combined
</VirtualHost>
EOF
$SUDO a2ensite myscene-dbapi >/dev/null
$SUDO apachectl configtest || { apache_diagnostics; die "Apache config test failed"; }

if ! svc_running apache2 apache2; then
    log "Starting Apache"
    svc_start apache2 apache2
elif [ "$PORTS_SUM_BEFORE" != "$PORTS_SUM_AFTER" ]; then
    log "Listen ports changed — restarting Apache"
    if have_systemd; then $SUDO systemctl restart apache2 || true; else $SUDO service apache2 restart || true; fi
else
    svc_reload apache2 apache2 || true
fi

# Verify Apache is really up and listening on the db-api port.
APACHE_OK=0
for _ in $(seq 1 10); do
    if svc_running apache2 apache2 && port_in_use "$DB_API_PORT"; then
        APACHE_OK=1
        break
    fi
    sleep 1
done
if [ "$APACHE_OK" -ne 1 ]; then
    apache_diagnostics
    die "Apache is not listening on port $DB_API_PORT (see diagnostics above)"
fi
log "Apache is up on port $DB_API_PORT."

# --- 6. (Re)start the Node server under pm2 -----------------------------------

log "Starting/reloading the pm2 process 'myscene-api'"
if pm2 describe myscene-api >/dev/null 2>&1; then
    pm2 reload myscene-api
else
    (cd "$API_DIR" && pm2 start src/index.js --name myscene-api)
fi
pm2 save >/dev/null 2>&1 || true

# --- 7. Health checks -----------------------------------------------------------

API_HEALTH_URL="http://127.0.0.1:3000/"
DBAPI_HEALTH_URL="http://127.0.0.1:$DB_API_PORT/get_artist_amount.php"
CHAIN_HEALTH_URL="http://127.0.0.1:3000/getArtistAmount"

log "Waiting for the Node API ($API_HEALTH_URL)..."
if NODE_OK="$(wait_for_http "$API_HEALTH_URL")"; then
    log "Node API healthy: $NODE_OK"
else
    warn "Node API is not responding on port 3000 — check 'pm2 logs myscene-api --lines 30'"
fi

log "Waiting for the PHP db-api ($DBAPI_HEALTH_URL)..."
if DBAPI_OK="$(wait_for_http_post "$DBAPI_HEALTH_URL" '{}')"; then
    log "PHP db-api healthy: $DBAPI_OK"
else
    warn "PHP db-api not responding — check Apache (port $DB_API_PORT) and $DBAPI_DIR/.env (DB credentials)"
fi

log "Waiting for the full chain ($CHAIN_HEALTH_URL)..."
if CHAIN_OK="$(wait_for_http "$CHAIN_HEALTH_URL")"; then
    log "Full chain healthy (frontend API -> PHP db-api -> MySQL): $CHAIN_OK"
else
    warn "Full chain not responding — check DB_API_BASE_URL in $API_DIR/.env (should be http://127.0.0.1$([ "$DB_API_PORT" -ne 80 ] && echo ":$DB_API_PORT"))"
fi

log "API update complete."
self_update
