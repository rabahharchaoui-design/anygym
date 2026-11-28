#!/bin/bash
# gmini-status.sh [--dry-run]: one read-only look at the Mac mini. Branch, short sha, dirty count, last
# commit; the handoff STATUS line; Claude's usage from .usage-tap and how old it is (read only, never
# probes Claude); whether the Claude and watchdog launch agents are loaded (launchctl list only); tmux
# sessions; the full-suite lock; free disk; each scheduled job's latest heartbeat. npm: npm run status
set -euo pipefail
. "$(dirname "$0")/lib/common.sh"
for a in "$@"; do [ "$a" = "--dry-run" ] || { echo "gmini-status.sh: unknown option $a" >&2; exit 2; }; done
if [ -n "$DRY" ]; then
  echo "dry-run: would read: git status/log in $REPO, ~/anygym-handoff.md, $REPO/.usage-tap, launchctl list,"
  echo "dry-run:   tmux ls, $ANYGYM_CONF/fullsuite.lock, df /, $ANYGYM_CONF/heartbeats/*.json; changes nothing"
  echo "dry-run: would log to /tmp/anygym-logs/gmini-status/<time>.log"; exit 0
fi
LOG=$(logfile gmini-status); cd "$REPO"
{
br=$(git branch --show-current 2>/dev/null || echo '?'); dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
echo "git     $br @ $(git rev-parse --short HEAD 2>/dev/null), $dirty dirty, last: $(git log -1 --format='%h %cr %s' 2>/dev/null | cut -c1-70)"
echo "handoff $(grep -m1 '^STATUS' "$HOME/anygym-handoff.md" 2>/dev/null | cut -c1-80 || echo 'no STATUS line')"
tap="$REPO/.usage-tap"; if [ -f "$tap" ]; then
  v(){ sed -n "s/^$1=//p" "$tap" | head -1; }; ts=$(v ts)
  echo "claude  5h $(v five)%, week $(v week)%, reading $(( ($(date +%s) - ${ts:-0}) / 60 )) min old ($(v status))"
else echo "claude  usage unknown (no .usage-tap)"; fi
la=$(launchctl list 2>/dev/null || true)
ag(){ printf '%s\n' "$la" | awk -v l="$1" '$3==l{print ($1=="-"?"loaded, idle":"loaded, pid " $1) "; last exit " $2; f=1} END{if(!f) print "NOT loaded"}'; }
echo "agents  com.gmini.claude: $(ag com.gmini.claude) | watchdog: $(ag com.gmini.claude-watchdog)"
echo "tools   $(printf '%s\n' "$la" | awk '$3 ~ /^com\.anygym\.tools\./{n++} END{print n+0}') com.anygym.tools agents loaded"
echo "tmux    $(tmux ls 2>/dev/null | cut -d: -f1 | tr '\n' ' ' || true)$(tmux ls >/dev/null 2>&1 || echo 'no sessions')"
echo "suite   $([ -d "$ANYGYM_CONF/fullsuite.lock" ] && echo "full suite running (lock pid $(cat "$ANYGYM_CONF/fullsuite.lock/pid" 2>/dev/null || echo '?'))" || echo 'no full suite running')"
echo "disk    $(df -h / | awk 'NR==2{print $4 " free of " $2}')"
for j in stall-watch usage-log coord heartbeat-check digest cleanup; do f="$ANYGYM_CONF/heartbeats/$j.json"
  if [ -f "$f" ]; then "$PY" -c 'import json,sys,time
h=json.load(open(sys.argv[1])); print("beat    %-15s %-6s %4d min ago  %s" % (sys.argv[2], h.get("status"), (time.time()-h.get("epoch",0))//60, h.get("summary","")[:50]))' "$f" "$j"
  else echo "beat    $(printf '%-15s' "$j") no heartbeat yet"; fi; done
} 2>&1 | tee "$LOG"
echo "LOG $LOG"
