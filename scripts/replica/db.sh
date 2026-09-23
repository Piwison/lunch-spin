#!/usr/bin/env bash
# Start MariaDB on the replica clock and make sure the `lunch` database and user
# exist. Safe to re-run: an already-running server is left alone.
#
# The clock matters. MariaDB stamps spunAt with its own NOW(), the server decides
# "today" and "open now" with its own Date, and the browser formats "2m ago" with
# its own — three clocks. They must agree, or History shows "picked -1d ago"
# (failure mode 71). The DB is the one source: server.sh and drv.mjs both read
# their offset from it.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

if mysqladmin ping --silent >/dev/null 2>&1; then
  echo "MariaDB already running (restart it to change REPLICA_TIME)"
else
  offset=$(( $(date -u -d "$REPLICA_TIME" +%s) - $(date -u +%s) ))
  mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld
  nohup faketime -f "+${offset}" mariadbd --user=mysql --bind-address=127.0.0.1 --port=3306 \
    >"$REPLICA_STATE/mariadb.log" 2>&1 &
  for _ in $(seq 1 50); do mysqladmin ping --silent >/dev/null 2>&1 && break; sleep 0.2; done
fi

mysql -uroot <<'SQL'
CREATE DATABASE IF NOT EXISTS lunch CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'lunch'@'127.0.0.1' IDENTIFIED BY 'lunchpw';
CREATE USER IF NOT EXISTS 'lunch'@'localhost' IDENTIFIED BY 'lunchpw';
GRANT ALL ON lunch.* TO 'lunch'@'127.0.0.1';
GRANT ALL ON lunch.* TO 'lunch'@'localhost';
SQL

echo "MariaDB clock (UTC): $(mysql -h127.0.0.1 -ulunch -plunchpw -N -e 'SELECT UTC_TIMESTAMP()')"
