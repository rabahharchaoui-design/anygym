#!/bin/bash
# pw-run.sh [--dry-run] [playwright args...]: npx playwright test with your args, 45 minute limit, its own
# free port (so it never reuses another run's preview server), log saved, short summary, exits with
# Playwright's status (124 on timeout). Not a replacement for .loop-tools/full-suite.sh.
# npm: npm run pw -- tests/x.spec.ts --project="iPhone 15"
set -euo pipefail
. "$(dirname "$0")/lib/common.sh"
ARGS=(); for a in "$@"; do [ "$a" = "--dry-run" ] || ARGS+=("$a"); done
LIMIT=${PW_RUN_LIMIT_S:-2700}
PORT=${PW_PORT:-$("$PY" -c 'import socket
for p in range(4300, 4400):
    s = socket.socket()
    try: s.bind(("127.0.0.1", p)); s.close(); print(p); break
    except OSError: pass')}
if [ -n "$DRY" ]; then
  echo "dry-run: would run in $REPO: PW_PORT=$PORT npx playwright test ${ARGS[*]:-(all specs)}  (limit $LIMIT s)"
  echo "dry-run: would hold $ANYGYM_CONF/locks/pw-run.lock, log to /tmp/anygym-logs/pw-run/<time>.log, write heartbeats/pw-run.json"
  [ -d "$ANYGYM_CONF/fullsuite.lock" ] && echo "dry-run: note: a full suite is running (fullsuite.lock), this run would share the CPU"
  exit 0
fi
if ! disk_ok 5; then bash "$SCRIPTS/lib/alert.sh" disk-low pause "Mac mini disk is low" "Under 5 GB free, pw-run skipped." || true; echo "pw-run: skipped, under 5 GB free" >&2; exit 2; fi
lock_take pw-run "$LIMIT" loud
T0=$(date +%s); LOG=$(logfile pw-run)
[ -d "$ANYGYM_CONF/fullsuite.lock" ] && echo "pw-run: a full suite is running too; expect slower tests"
echo "pw-run: npx playwright test ${ARGS[*]:-} on port $PORT" > "$LOG"
cd "$REPO"; set +e
NO_COLOR=1 PW_PORT=$PORT tmo "$LIMIT" npx playwright test ${ARGS[@]+"${ARGS[@]}"} >> "$LOG" 2>&1; rc=$?
set -e
[ "$rc" -eq 124 ] && echo "pw-run: gave up after $LIMIT s (timeout)"
heartbeat pw-run "$([ "$rc" -eq 0 ] && echo ok || echo failed)" "$T0" "playwright ${ARGS[*]:-} rc=$rc"
echo "pw-run: exit $rc in $(( $(date +%s) - T0 )) s"
set +e; summarize "$LOG"; set -e
exit "$rc"
