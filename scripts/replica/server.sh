#!/usr/bin/env bash
# Run the real dev server (tsx watch, so edits reload) against the replica:
# local MariaDB, the fake Google, and a clock read from the DB so the two agree
# to the second. Foreground; Ctrl-C to stop. Log: add `> "$REPLICA_STATE/dev.log" 2>&1 &`.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
cd "$REPO_DIR"

db_now=$(mysql -h127.0.0.1 -ulunch -plunchpw -N -e "SELECT UNIX_TIMESTAMP(UTC_TIMESTAMP())")
offset=$(( db_now - $(date -u +%s) ))

export NODE_ENV=development
export GOOGLE_MAPS_API_KEY=replica-fake
export APP_ORIGIN="http://localhost:$PORT"
export NODE_OPTIONS="--import $REPLICA_DIR/fake-google.mjs --import $REPLICA_DIR/mariadb-json.mjs"
exec faketime -f "+${offset}" node_modules/.bin/tsx watch server/_core/index.ts
