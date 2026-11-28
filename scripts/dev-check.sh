#!/bin/bash
# dev-check.sh [--build] [--dry-run]: typecheck, lint, unit tests (vitest + dup guard); --build adds the
# production build. 20 minutes in total, one combined log, one short summary. Runs every step and exits
# with the first failing step's status. npm: npm run check / npm run check:build (add -- --dry-run).
set -euo pipefail
. "$(dirname "$0")/lib/common.sh"
BUILD=""
for a in "$@"; do case "$a" in --build) BUILD=1;; --dry-run) ;; *) echo "dev-check.sh: unknown option $a (use --build, --dry-run)" >&2; exit 2;; esac; done
LIMIT=${DEV_CHECK_LIMIT_S:-1200}
STEPS="typecheck:npm run -s typecheck|lint:npm run -s lint|vitest:npm run -s test"
[ -n "$BUILD" ] && STEPS="$STEPS|build:npm run -s build"
if [ -n "$DRY" ]; then
  echo "dry-run: dev-check in $REPO, $LIMIT s in total, lock $ANYGYM_CONF/locks/dev-check.lock"
  IFS='|'; for s in $STEPS; do echo "dry-run: would run ${s#*:}  (step ${s%%:*})"; done; unset IFS
  echo "dry-run: would write /tmp/anygym-logs/dev-check/<time>.log and heartbeats/dev-check.json"; exit 0
fi
if ! disk_ok 5; then bash "$SCRIPTS/lib/alert.sh" disk-low pause "Mac mini disk is low" "Under 5 GB free, dev-check skipped." || true; echo "dev-check: skipped, under 5 GB free" >&2; exit 2; fi
lock_take dev-check "$LIMIT" loud
T0=$(date +%s); LOG=$(logfile dev-check); first=0
cd "$REPO"
IFS='|'; for s in $STEPS; do unset IFS
  name=${s%%:*}; cmd=${s#*:}; left=$(( LIMIT - ($(date +%s) - T0) ))
  echo "== $name" >> "$LOG"
  if [ "$left" -le 5 ]; then rc=124; echo "dev-check: no time left (limit $LIMIT s)" >> "$LOG"
  else set +e; NO_COLOR=1 tmo "$left" /bin/bash -c "$cmd" >> "$LOG" 2>&1; rc=$?; set -e; fi
  echo "rc=$rc" >> "$LOG"; [ "$rc" -ne 0 ] && [ "$first" -eq 0 ] && first=$rc
  IFS='|'
done; unset IFS
heartbeat dev-check "$([ "$first" -eq 0 ] && echo ok || echo failed)" "$T0" "dev-check$( [ -n "$BUILD" ] && echo ' --build') rc=$first"
echo "dev-check: $( [ "$first" -eq 0 ] && echo 'all steps passed' || echo "failed, exit $first") in $(( $(date +%s) - T0 )) s"
set +e; summarize "$LOG"; set -e
exit "$first"
