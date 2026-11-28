#!/bin/bash
# heartbeat-check.sh [--dry-run]: every 30 minutes (launchd, under its own 120 s timeout). The dead-man
# check: alerts (once an hour per job at most) when a scheduled job's heartbeat is older than 3x its
# interval, or its last status is "error". A job with no heartbeat yet only counts once its launch agent
# has been installed longer than 3x its interval. npm: npm run tools:deadman
set -euo pipefail
. "$(dirname "$0")/lib/common.sh"
for a in "$@"; do [ "$a" = "--dry-run" ] || { echo "heartbeat-check.sh: unknown option $a" >&2; exit 2; }; done
[ -n "$DRY" ] || lock_take heartbeat-check 120
T0=$(date +%s); LOG=$([ -n "$DRY" ] && echo /dev/null || logfile heartbeat-check); bad=0; out=""
JOBS="${HB_JOBS:-stall-watch:900 usage-log:1800 coord:1800 digest:86400 cleanup:86400}"
for e in $JOBS; do j=${e%%:*}; iv=${e#*:}; f="$ANYGYM_CONF/heartbeats/$j.json"; why=""
  if [ -f "$f" ]; then
    read -r ep st < <("$PY" -c 'import json,sys
h=json.load(open(sys.argv[1])); print(int(h.get("epoch",0)), h.get("status","?"))' "$f" 2>/dev/null || echo "0 unreadable")
    age=$(( T0 - ep ))
    [ "$age" -gt $(( 3 * iv )) ] && why="heartbeat is $((age / 60)) min old (limit $((3 * iv / 60)) min)"
    [ "$st" = error ] || [ "$st" = unreadable ] && why="${why:+$why; }last status $st"
    line="$j: $st, $((age / 60)) min ago"
  else
    pl="$HOME/Library/LaunchAgents/com.anygym.tools.$j.plist"; line="$j: no heartbeat yet"
    if [ -f "$pl" ] && [ $(( T0 - $(stat -f %m "$pl" 2>/dev/null || stat -c %Y "$pl") )) -gt $(( 3 * iv )) ]; then why="no heartbeat since its agent was installed"; fi
  fi
  if [ -n "$why" ]; then bad=$((bad+1)); line="$line -> ALERT: $why"
    if [ -n "$DRY" ]; then echo "dry-run: would alert deadman-$j: $why"
    else bash "$SCRIPTS/lib/alert.sh" "deadman-$j" pause "An AnyGym helper job stopped" "The $j job: $why. Nothing was restarted; ask Claude to look." >> "$LOG" 2>&1 || true; fi
  fi
  out="$out$line"$'\n'; echo "$line" >> "$LOG"
done
printf '%s' "$out" | sed 's/^/heartbeat-check: /'
if [ -n "$DRY" ]; then echo "dry-run: would write heartbeats/heartbeat-check.json ($bad problem(s))"; exit 0; fi
heartbeat heartbeat-check ok "$T0" "$bad problem job(s)"
echo "heartbeat-check: $bad problem job(s)"; echo "LOG $LOG"
