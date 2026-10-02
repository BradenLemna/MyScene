#!/usr/bin/env bash

# =============================================================================
# MyScene — database update script
#
# Run this on the host that runs MariaDB/MySQL. Two layouts are supported:
#
#   single host     DB, API and website on one machine (DB_HOST=localhost).
#   two containers  this DB container + an "app" container running the
#                   website and the API. Pass the app container's address
#                   with --app-host the first time; later runs remember it
#                   (it is stored as a MySQL user host, not in a file).
#
# It is idempotent: on a fresh machine it installs and starts MariaDB, imports
# the schema and provisions a dedicated database user; on later runs it just
# makes sure everything is in place and does not touch existing data.
#
# What it does:
#   1. Installs mariadb-server if missing and makes sure the service is up.
#   2. Fetches the latest repository code into ~/myscene-git (clone or pull).
#   3. Imports schema.sql:
#        - database missing        -> imports (fresh install, with seed data)
#        - database present        -> left alone (data preserved)
#        - FullUpdate / "Y" answer -> drops and rebuilds the database (DESTRUCTIVE)
#      then applies every migrations/*.sql file in name order. Migrations are
#      idempotent (CREATE ... IF NOT EXISTS, guarded UPDATEs), so they bring an
#      existing database up to date without touching its data.
#   4. Creates/updates a dedicated 'myscene' MySQL user for localhost,
#      127.0.0.1 and every app host (new --app-host values plus the ones
#      granted on earlier runs) and writes its credentials to:
#        ~/myscene-db/.env       DB_HOST=localhost (single host, chmod 600)
#        ~/myscene-db/app.env    DB_HOST=<this container's IP> — the file the
#                                app container needs (two containers only)
#        /var/www/myscene-api/db-api/.env  (only if the API is deployed on
#                                this host and the file does not exist yet)
#   5. Two containers only: makes MariaDB listen on the network
#      (bind-address, default 0.0.0.0) and, if ufw is active, opens 3306 for
#      the app host(s). Access stays limited to the granted hosts.
#   6. Verifies the connection and reports the artist count.
#
# Usage:
#   ./dbUpdate.sh                          # set up / update, never touches data
#                                          # (asks before a rebuild if the DB exists)
#   ./dbUpdate.sh --app-host 10.0.0.11     # allow the app container (repeatable,
#                                          # comma-separated, or a MySQL pattern
#                                          # such as 10.0.0.%)
#   ./dbUpdate.sh FullUpdate               # drop + rebuild the database from schema.sql
#   ./dbUpdate.sh FullUpdate -y            # same, skip the confirmation prompt
#
# Environment overrides:
#   MYSCENE_APP_HOST   same as --app-host
#   MYSCENE_DB_HOST    address the app container uses to reach this DB
#                      (default: first address of `hostname -I`)
#   MYSCENE_DB_BIND    MariaDB bind-address for two containers (default 0.0.0.0)
# =============================================================================

set -euo pipefail

REPO_URL="${MYSCENE_REPO_URL:-https://github.com/BradenLemna/myscene.git}"
GIT_DIR="$HOME/myscene-git"
DB_DIR="$HOME/myscene-db"
DB_NAME="MyScene"
DB_USER="myscene"
DB_PORT=3306
DB_HOST=localhost
DB_BIND="${MYSCENE_DB_BIND:-0.0.0.0}"
API_DBENV="/var/www/myscene-api/db-api/.env"
MYSCENE_CNF_NAME="99-myscene-network.cnf"
SELF_NAME="$(basename "$0")"

# --- small helpers ----------------------------------------------------------

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        echo "[myscene][ERROR] This script needs root (or passwordless sudo) to manage MariaDB." >&2
        exit 1
    fi
fi

log()  { echo "[myscene] $*"; }
warn() { echo "[myscene][WARN] $*" >&2; }
die()  { echo "[myscene][ERROR] $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
is_tty() { [ -t 0 ]; }

# Install Debian/Ubuntu packages that are not present yet.
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

# Is a real systemd running (false inside containers / bare chroots)?
have_systemd() { [ -d /run/systemd/system ]; }

svc_running() { # $1 = unit, $2 = service name
    if have_systemd; then
        systemctl is-active --quiet "$1"
    else
        service "$2" status >/dev/null 2>&1
    fi
}

svc_start() { # $1 = unit, $2 = service name, $3 = direct fallback command
    if svc_running "$1" "$2"; then
        return 0
    fi
    if have_systemd; then
        $SUDO systemctl start "$1" || true
        $SUDO systemctl enable "$1"  || true
    else
        $SUDO service "$2" start || $SUDO bash -c "nohup $3" || true
    fi
}

mariadb_start_fallback="$SUDO mysqld_safe --skip-syslog >/tmp/myscene-mariadb.log 2>&1 &"

# Wait until the server answers (root uses unix_socket auth on Debian).
wait_for_mariadb() {
    local _
    for _ in $(seq 1 30); do
        if $SUDO mysql -N -e "SELECT 1" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

# Restart MariaDB so a changed bind-address takes effect.
restart_mariadb() {
    log "Restarting MariaDB to apply the network settings"
    if have_systemd; then
        $SUDO systemctl restart mariadb
    elif ! $SUDO service mariadb restart >/dev/null 2>&1; then
        # Started by mysqld_safe directly (no init script): stop + start by hand.
        $SUDO mysqladmin shutdown >/dev/null 2>&1 || true
        sleep 2
        $SUDO bash -c "nohup $mariadb_start_fallback"
    fi
    wait_for_mariadb || die "MariaDB did not come back after the restart — check $MYSCENE_CNF_PATH and the MariaDB log"
}

# Clone the repo if needed, otherwise fast-forward it.
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

# Keep a fresh copy of this script in $HOME (same behaviour as the old
# deploy scripts, so the latest version is always one command away).
self_update() {
    if [ -f "$GIT_DIR/scripts/$SELF_NAME" ]; then
        cp "$GIT_DIR/scripts/$SELF_NAME" "$HOME/$SELF_NAME" 2>/dev/null && chmod +x "$HOME/$SELF_NAME" || true
    fi
}

# Print the comment header (the usage text) of this script.
usage() {
    awk 'NR > 3 && /^# =====/ { exit } NR > 3 { sub(/^# ?/, ""); print }' "$0"
}

# --- parse arguments --------------------------------------------------------

FULL_UPDATE=0
ASSUME_YES=0
APP_HOSTS_RAW="${MYSCENE_APP_HOST:-}"
while [ $# -gt 0 ]; do
    case "$1" in
        FullUpdate) FULL_UPDATE=1 ;;
        -y|--yes)   ASSUME_YES=1 ;;
        --app-host)
            [ $# -ge 2 ] || die "--app-host needs a value (IP, hostname or MySQL pattern like 10.0.0.%)"
            APP_HOSTS_RAW="$APP_HOSTS_RAW,$2"
            shift
            ;;
        --app-host=*) APP_HOSTS_RAW="$APP_HOSTS_RAW,${1#--app-host=}" ;;
        -h|--help) usage; exit 0 ;;
        *) die "Unknown argument: $1 (expected [FullUpdate] [-y|--yes] [--app-host HOST])" ;;
    esac
    shift
done

# Split + validate the new app hosts (they end up inside SQL strings).
NEW_APP_HOSTS=()
IFS=',' read -r -a _hosts <<< "$APP_HOSTS_RAW"
for h in "${_hosts[@]}"; do
    h="$(echo "$h" | tr -d '[:space:]')"
    [ -n "$h" ] || continue
    [[ "$h" =~ ^[A-Za-z0-9._%:-]+$ ]] || die "Invalid --app-host '$h' (use an IP, hostname or pattern like 10.0.0.%)"
    case "$h" in localhost|127.0.0.1|::1) continue ;; esac
    NEW_APP_HOSTS+=("$h")
done

# --- 1. MariaDB installed + running -----------------------------------------

log "Checking MariaDB..."
if ! have mariadb && ! have mysql; then
    apt_install mariadb-server
fi
# MariaDB server may have been installed but not started (fresh container).
svc_start mariadb mariadb "$mariadb_start_fallback"

log "Waiting for MariaDB to come up..."
wait_for_mariadb || die "MariaDB did not become ready — check $SUDO journalctl -u mariadb or /tmp/myscene-mariadb.log"
log "MariaDB is up."

# --- 2. Fresh repository code ------------------------------------------------

fetch_repo
[ -f "$GIT_DIR/schema.sql" ] || die "schema.sql not found in $GIT_DIR"

# --- 3. Import schema (fresh install or full update) -------------------------

db_exists=0
if [ "$($SUDO mysql -N -e "SHOW DATABASES LIKE '$DB_NAME'" | wc -l)" -gt 0 ]; then
    db_exists=1
fi

rebuild=0
if [ "$db_exists" -eq 0 ]; then
    log "Database '$DB_NAME' does not exist — importing schema.sql (fresh install)"
    rebuild=1
elif [ "$FULL_UPDATE" -eq 1 ]; then
    if [ "$ASSUME_YES" -eq 0 ]; then
        if is_tty; then
            read -r -p "This DROPS the '$DB_NAME' database and re-creates it from schema.sql (all data is deleted). Type 'yes' to continue: " answer
        else
            answer=""
        fi
        [ "$answer" = "yes" ] || die "Aborted (answer was '$answer')."
    else
        log "FullUpdate requested with -y — skipping confirmation"
    fi
    log "Dropping and rebuilding '$DB_NAME' from schema.sql"
    $SUDO mysql -e "DROP DATABASE IF EXISTS $DB_NAME;"
    rebuild=1
else
    if is_tty; then
        read -r -p "Database '$DB_NAME' already exists and will NOT be touched. Run a full update (drop + rebuild from schema.sql)? (Y/n): " answer
        answer="${answer:-n}"
        if [ "$answer" = "Y" ] || [ "$answer" = "y" ]; then
            log "Dropping and rebuilding '$DB_NAME' from schema.sql"
            $SUDO mysql -e "DROP DATABASE IF EXISTS $DB_NAME;"
            rebuild=1
        fi
    else
        log "Database '$DB_NAME' already exists — data left untouched (use 'FullUpdate' to rebuild)."
    fi
fi

if [ "$rebuild" -eq 1 ]; then
    log "Importing schema.sql"
    $SUDO mysql < "$GIT_DIR/schema.sql"
    log "Schema imported."
fi

# --- 3b. Apply idempotent migrations -----------------------------------------

if [ -d "$GIT_DIR/migrations" ]; then
    for migration in "$GIT_DIR"/migrations/*.sql; do
        [ -e "$migration" ] || continue
        log "Applying migration $(basename "$migration")"
        $SUDO mysql < "$migration" || die "Migration $(basename "$migration") failed"
    done
fi

# Keep a reference copy next to the credentials file.
mkdir -p "$DB_DIR"
cp "$GIT_DIR/schema.sql" "$DB_DIR/schema.sql"

# --- 4. Dedicated database user + .env credentials ---------------------------

CRED_FILE="$DB_DIR/.env"
APP_CRED_FILE="$DB_DIR/app.env"
DB_PASSWORD=""
if [ -f "$CRED_FILE" ]; then
    DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' "$CRED_FILE" | tail -n1)"
fi
if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD="$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    log "Generated a new password for the '$DB_USER' MySQL user."
else
    log "Reusing existing password from $CRED_FILE."
fi

# App hosts granted on earlier runs + the new ones from this run.
APP_HOSTS=()
while IFS= read -r h; do
    [ -n "$h" ] && APP_HOSTS+=("$h")
done < <($SUDO mysql -N -e "SELECT Host FROM mysql.user WHERE User='$DB_USER' AND Host NOT IN ('localhost','127.0.0.1','::1')")
for h in "${NEW_APP_HOSTS[@]+"${NEW_APP_HOSTS[@]}"}"; do
    case " ${APP_HOSTS[*]+"${APP_HOSTS[*]}"} " in *" $h "*) : ;; *) APP_HOSTS+=("$h") ;; esac
done

ALL_HOSTS=(localhost 127.0.0.1 "${APP_HOSTS[@]+"${APP_HOSTS[@]}"}")
log "Creating/updating MySQL user '$DB_USER' for: ${ALL_HOSTS[*]}"
{
    for h in "${ALL_HOSTS[@]}"; do
        echo "CREATE USER IF NOT EXISTS '$DB_USER'@'$h' IDENTIFIED BY '$DB_PASSWORD';"
        echo "ALTER USER '$DB_USER'@'$h' IDENTIFIED BY '$DB_PASSWORD';"
        echo "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'$h';"
    done
    echo "FLUSH PRIVILEGES;"
} | $SUDO mysql

{
    echo "DB_HOST=$DB_HOST"
    echo "DB_PORT=$DB_PORT"
    echo "DB_NAME=$DB_NAME"
    echo "DB_USERNAME=$DB_USER"
    echo "DB_PASSWORD=$DB_PASSWORD"
    echo "DB_CHARSET=utf8mb4"
} > "$CRED_FILE"
chmod 600 "$CRED_FILE"
log "Credentials written to $CRED_FILE"

# If the PHP db-api was already deployed on this host (single host), give it
# the credentials file it reads at request time (bootstrap.php walks up from
# db-api/ and loads the first .env it finds).
if [ -d /var/www/myscene-api/db-api ]; then
    if [ ! -f "$API_DBENV" ]; then
        log "Writing PHP db-api credentials to $API_DBENV"
        $SUDO install -d -m 755 "$(dirname "$API_DBENV")"
        $SUDO tee "$API_DBENV" > /dev/null < "$CRED_FILE"
        $SUDO chown www-data:www-data "$API_DBENV" 2>/dev/null || true
        $SUDO chmod 600 "$API_DBENV"
    else
        log "Existing $API_DBENV left untouched."
    fi
elif [ ${#APP_HOSTS[@]} -eq 0 ]; then
    log "Note: the API is not deployed on this host and no app container is configured."
    log "      Single host: run scripts/apiUpdate.sh here (it picks up $CRED_FILE)."
    log "      Two containers: re-run with --app-host <app container IP>."
fi

# --- 5. Network access for the app container (two containers) ----------------

if [ ${#APP_HOSTS[@]} -gt 0 ]; then
    # Address the app container should use to reach this DB.
    PUBLIC_DB_HOST="${MYSCENE_DB_HOST:-}"
    if [ -z "$PUBLIC_DB_HOST" ] || [ "$PUBLIC_DB_HOST" = "localhost" ] || [ "$PUBLIC_DB_HOST" = "127.0.0.1" ]; then
        PUBLIC_DB_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
    fi
    [ -n "$PUBLIC_DB_HOST" ] || die "Could not detect this container's IP — set MYSCENE_DB_HOST=<ip>"

    # MariaDB on Debian/Ubuntu ships with bind-address = 127.0.0.1. Our file
    # sorts after 50-server.cnf, so its bind-address wins.
    if [ -d /etc/mysql/mariadb.conf.d ]; then
        MYSCENE_CNF_PATH="/etc/mysql/mariadb.conf.d/$MYSCENE_CNF_NAME"
    else
        MYSCENE_CNF_PATH="/etc/mysql/conf.d/$MYSCENE_CNF_NAME"
    fi
    CNF_WANTED="# Managed by MyScene dbUpdate.sh — lets the app container reach MariaDB.
# Access is still limited to the hosts granted to the '$DB_USER' user.
[mysqld]
bind-address = $DB_BIND
skip-networking = 0"
    if [ "$($SUDO cat "$MYSCENE_CNF_PATH" 2>/dev/null || true)" != "$CNF_WANTED" ]; then
        log "Writing $MYSCENE_CNF_PATH (bind-address = $DB_BIND)"
        $SUDO install -d -m 755 "$(dirname "$MYSCENE_CNF_PATH")"
        printf '%s\n' "$CNF_WANTED" | $SUDO tee "$MYSCENE_CNF_PATH" > /dev/null
        $SUDO chmod 644 "$MYSCENE_CNF_PATH"
        restart_mariadb
    fi

    BIND_NOW="$($SUDO mysql -N -e "SELECT @@bind_address" 2>/dev/null || echo '?')"
    if [ "$BIND_NOW" = "127.0.0.1" ] || [ "$BIND_NOW" = "localhost" ]; then
        die "MariaDB still listens on $BIND_NOW only — another config file overrides $MYSCENE_CNF_PATH (grep -r bind-address /etc/mysql)"
    fi
    log "MariaDB listens on ${BIND_NOW:-all interfaces} port $DB_PORT."

    # Optional host firewall inside the container.
    if have ufw && $SUDO ufw status 2>/dev/null | grep -q '^Status: active'; then
        for h in "${APP_HOSTS[@]}"; do
            if [[ "$h" =~ ^[0-9.]+$ ]]; then
                $SUDO ufw allow from "$h" to any port "$DB_PORT" proto tcp >/dev/null && log "ufw: allowed $h -> port $DB_PORT"
            else
                warn "ufw is active — open port $DB_PORT for '$h' yourself (only plain IPs are handled automatically)"
            fi
        done
    fi

    {
        echo "DB_HOST=$PUBLIC_DB_HOST"
        echo "DB_PORT=$DB_PORT"
        echo "DB_NAME=$DB_NAME"
        echo "DB_USERNAME=$DB_USER"
        echo "DB_PASSWORD=$DB_PASSWORD"
        echo "DB_CHARSET=utf8mb4"
    } > "$APP_CRED_FILE"
    chmod 600 "$APP_CRED_FILE"
    log "App-container credentials written to $APP_CRED_FILE (DB_HOST=$PUBLIC_DB_HOST)"
fi

# --- 6. Verify ---------------------------------------------------------------

log "Verifying database access as '$DB_USER'..."
ARTISTS="$($SUDO mysql -h 127.0.0.1 -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -N -e "SELECT COUNT(*) FROM \`$DB_NAME\`.Artists;")"
log "Connected OK — the Artists table holds $ARTISTS row(s)."

if [ ${#APP_HOSTS[@]} -gt 0 ]; then
    log "App container(s) allowed: ${APP_HOSTS[*]}"
    if [ ${#NEW_APP_HOSTS[@]} -gt 0 ]; then
        log ""
        log "Next, on the app container (website + API) run:"
        log ""
        log "    MYSCENE_DB_HOST=$PUBLIC_DB_HOST MYSCENE_DB_PASSWORD='$DB_PASSWORD' ./update.sh app"
        log ""
        log "(or copy $APP_CRED_FILE there and run: ./update.sh app --db-env <path to app.env>)"
    fi
fi

log "Database update complete."
self_update
