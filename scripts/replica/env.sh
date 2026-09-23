# Shared settings for the replica scripts. Sourced, not executed.
# Every value can be overridden from the environment.

REPLICA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$REPLICA_DIR/../.." && pwd)"

# The moment the replica starts at, in UTC. 04:05Z = Thursday 12:05 in Taipei:
# lunchtime on a weekday, when "open now" and "closing soon" mean something.
export REPLICA_TIME="${REPLICA_TIME:-2026-09-24 04:05:00}"
export REPLICA_STATE="${REPLICA_STATE:-$REPLICA_DIR/.state}"
export DATABASE_URL="${DATABASE_URL:-mysql://lunch:lunchpw@127.0.0.1:3306/lunch}"
export PORT="${PORT:-3000}"
export JWT_SECRET="${JWT_SECRET:-replica-secret}"
export VITE_APP_ID="${VITE_APP_ID:-lunch-replica}"
mkdir -p "$REPLICA_STATE"

# Never point any of this at a real database: seed.mjs drops every table.
case "$DATABASE_URL" in
  mysql://*@127.0.0.1:*|mysql://*@localhost:*|mysql://*@127.0.0.1/*|mysql://*@localhost/*) ;;
  *) echo "replica: DATABASE_URL must point at 127.0.0.1/localhost, got $DATABASE_URL" >&2; exit 1 ;;
esac
