#!/usr/bin/env bash

# =============================================================================
# MyScene — database update script
#
# Run this on the host that runs MariaDB/MySQL (in the default topology that
# is the same host as the API server). It is idempotent: on a fresh machine
# it installs and starts MariaDB, imports the schema and provisions a
# dedicated database user; on later runs it just makes sure everything is in
# place and does not touch existing data.
#
# What it does:
#   1. Installs mariadb-server if missing and makes sure the service is up.
#   2. Fetches the latest repository code into ~/myscene-git (clone or pull).
#   3. Imports schema.sql:
#        - database missing        -> imports (fresh install, with seed data)
#        - database present        -> left alone (data preserved)
#        - FullUpdate / "Y" answer -> drops and rebuilds the database (DESTRUCTIVE)
#   4. Creates/updates a dedicated 'myscene' MySQL user (localhost + 127.0.0.1)
#      and writes its credentials to:
#        ~/myscene-db/.env                       (reference copy, chmod 600)
#        /var/www/myscene-api/db-api/.env        (only if the API was already
#                                                 deployed on this host — this
#                                                 is the file PHP db-api reads)
#   5. Verifies the connection and reports the artist count.
#
# Usage:
#   ./dbUpdate.sh                 # set up / update, never touches data
#                                 # (asks before a rebuild if the DB exists)
#   ./dbUpdate.sh FullUpdate      # drop + rebuild the database from schema.sql
#   ./dbUpdate.sh FullUpdate -y   # same, skip the confirmation prompt
#
# The generated password is printed once and stored in the .env files above.
# =============================================================================

set -euo pipefail

REPO_URL="${MYSCENE_REPO_URL:-https://github.com/BradenLemna/myscene.git}"
GIT_DIR="$HOME/myscene-git"
DB_DIR="$HOME/myscene-db"
DB_NAME="MyScene"
DB_USER="myscene"
DB_PORT=3306
DB_HOST=localhost
API_DBENV="/var/www/myscene-api/db-api/.env"
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

svc_reload_or_start() { # $1 = unit, $2 = service name
    if have_systemd; then
        $SUDO systemctl reload-or-restart "$1"
    else
        $SUDO service "$2" reload 2>/dev/null || $SUDO service "$2" restart
    fi
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

# --- parse arguments --------------------------------------------------------

FULL_UPDATE=0
ASSUME_YES=0
for arg in "$@"; do
    case "$arg" in
        FullUpdate) FULL_UPDATE=1 ;;
        -y|--yes)   ASSUME_YES=1 ;;
        -h|--help)
            sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) die "Unknown argument: $arg (expected [FullUpdate] [-y|--yes])" ;;
    esac
done

# --- 1. MariaDB installed + running -----------------------------------------

log "Checking MariaDB..."
if ! have mariadb && ! have mysql; then
    apt_install mariadb-server
fi
# MariaDB server may have been installed but not started (fresh container).
svc_start mariadb mariadb "$SUDO mysqld_safe --skip-syslog >/tmp/myscene-mariadb.log 2>&1 &"

# Wait until the server answers (root uses unix_socket auth on Debian).
log "Waiting for MariaDB to come up..."
ready=0
for _ in $(seq 1 30); do
    if $SUDO mysql -N -e "SELECT 1" >/dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 1
done
[ "$ready" -eq 1 ] || die "MariaDB did not become ready — check $SUDO journalctl -u mariadb or /tmp/myscene-mariadb.log"
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

# Keep a reference copy next to the credentials file.
mkdir -p "$DB_DIR"
cp "$GIT_DIR/schema.sql" "$DB_DIR/schema.sql"

# --- 4. Dedicated database user + .env credentials ---------------------------

CRED_FILE="$DB_DIR/.env"
if [ -f "$CRED_FILE" ]; then
    DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' "$CRED_FILE" | tail -n1)"
    [ -n "$DB_PASSWORD" ] || DB_PASSWORD=""
fi
if [ -z "${DB_PASSWORD:-}" ]; then
    DB_PASSWORD="$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    log "Generated a new password for the '$DB_USER' MySQL user."
else
    log "Reusing existing password from $CRED_FILE."
fi

log "Creating/updating MySQL user '$DB_USER'"
$SUDO mysql <<SQL
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost'   IDENTIFIED BY '$DB_PASSWORD';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1'   IDENTIFIED BY '$DB_PASSWORD';
ALTER USER '$DB_USER'@'localhost'   IDENTIFIED BY '$DB_PASSWORD';
ALTER USER '$DB_USER'@'127.0.0.1'   IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

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

# If the PHP db-api was already deployed on this host, give it the
# credentials file it reads at request time (bootstrap.php walks up from
# db-api/ and loads the first .env it finds).
if [ -d /var/www/myscene-api/db-api ]; then
    if [ ! -f "$API_DBENV" ]; then
        log "Writing PHP db-api credentials to $API_DBENV"
        $SUDO install -d -m 755 "$(dirname "$API_DBENV")"
        $SUDO tee "$API_DBENV" > /dev/null < "$CRED_FILE"
        if [ "$(id -u)" -ne 0 ]; then
            $SUDO chown www-data:www-data "$API_DBENV" 2>/dev/null || true
            $SUDO chmod 600 "$API_DBENV"
        else
            chmod 600 "$API_DBENV"
        fi
    else
        log "Existing $API_DBENV left untouched."
    fi
else
    log "Note: /var/www/myscene-api/db-api does not exist yet. Run scripts/apiUpdate.sh —"
    log "      it will pick up $CRED_FILE for the PHP db-api."
fi

# --- 5. Verify ---------------------------------------------------------------

log "Verifying database access as '$DB_USER'..."
ARTISTS="$($SUDO mysql -h 127.0.0.1 -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -N -e "SELECT COUNT(*) FROM \`$DB_NAME\`.Artists;")"
log "Connected OK — the Artists table holds $ARTISTS row(s)."

log "Database update complete."
self_update
