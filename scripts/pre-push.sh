#!/bin/bash
# pre-push.sh [--dry-run]: the push gate (installed as .git/hooks/pre-push by install-hooks.sh). Runs the
# secret scan, typecheck, lint and unit tests (15 minutes in total) and blocks the push if one fails. No
# Playwright. SKIP_PREPUSH=1 git push ... is the logged emergency bypass. Pushes made by the build loop
# and the bot helpers (run-overnight.sh, .codex-helper.sh, .grok-helper.sh) pass through, logged: they
# run their own checks and must not stall behind this one. npm: npm run check:push
set -euo pipefail
. "$(dirname "$0")/lib/common.sh"
PLOG="$ANYGYM_CONF/prepush.log"; mkdir -p "$ANYGYM_CONF"
CHECKS="secret scan:node scripts/secret-scan.mjs|typecheck:npm run -s typecheck|lint:npm run -s lint|vitest:npm run -s test"
LIMIT=${PREPUSH_LIMIT_S:-900}
if [ -n "$DRY" ]; then
  IFS='|'; for s in $CHECKS; do echo "dry-run: would run ${s#*:}  ($(echo "${s%%:*}"))"; done; unset IFS
  echo "dry-run: $LIMIT s in total; would block the push on the first failure; log /tmp/anygym-logs/pre-push/<time>.log"; exit 0
fi
note() { echo "$(date '+%F %T') $(git -C "$REPO" branch --show-current 2>/dev/null) $*" >> "$PLOG"; }
if [ -n "${SKIP_PREPUSH:-}" ]; then note "BYPASS SKIP_PREPUSH=1 by $(id -un)"; echo "pre-push: skipped (SKIP_PREPUSH=1, logged to $PLOG)"; exit 0; fi
p=$PPID; for _ in 1 2 3 4 5 6 7 8; do [ "${p:-1}" -gt 1 ] || break
  c=$(ps -o command= -p "$p" 2>/dev/null || true)
  case "$c" in *run-overnight.sh*|*.codex-helper.sh*|*.grok-helper.sh*) note "pass-through for automation: ${c:0:60}"; exit 0;; esac
  p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ' || echo 1); done
if ! disk_ok 5; then note "skipped: under 5 GB free"; bash "$SCRIPTS/lib/alert.sh" disk-low pause "Mac mini disk is low" "Under 5 GB free, the pre-push checks were skipped." || true; echo "pre-push: skipped, under 5 GB free (alert sent)"; exit 0; fi
T0=$(date +%s); LOG=$(logfile pre-push); cd "$REPO"; rc=0
IFS='|'; for s in $CHECKS; do unset IFS
  left=$(( LIMIT - ($(date +%s) - T0) )); echo "== ${s%%:*}" >> "$LOG"
  set +e; NO_COLOR=1 tmo "$(( left > 5 ? left : 5 ))" /bin/bash -c "${s#*:}" >> "$LOG" 2>&1; rc=$?; set -e
  echo "rc=$rc" >> "$LOG"; [ "$rc" -eq 0 ] || break; IFS='|'
done; unset IFS
note "$([ "$rc" -eq 0 ] && echo passed || echo "BLOCKED rc=$rc") in $(( $(date +%s) - T0 )) s"
echo "pre-push: $([ "$rc" -eq 0 ] && echo 'checks passed, pushing' || echo "push BLOCKED (exit $rc); fix it, or SKIP_PREPUSH=1 in an emergency")"
set +e; summarize "$LOG" >&2; set -e
exit "$rc"
