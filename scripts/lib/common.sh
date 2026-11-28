#!/bin/bash
# Shared bits for the AnyGym helper scripts (scripts/README.md). Source it after `set -euo pipefail`.
# Machine values live in ~/.config/anygym/local.env (outside the repo, never committed).
ANYGYM_CONF="${ANYGYM_CONF:-$HOME/.config/anygym}"
[ -f "$ANYGYM_CONF/local.env" ] && . "$ANYGYM_CONF/local.env"
SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${ANYGYM_REPO:-$(cd "$SCRIPTS/.." && pwd)}"
LOGROOT="${ANYGYM_LOGROOT:-/tmp/anygym-logs}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
DRY=""; for a in "$@"; do [ "$a" = "--dry-run" ] && DRY=1; done

# PY: the repo's Python (.venv if one exists, else Homebrew's, else python3); scripts check the version.
PY="$REPO/.venv/bin/python"; [ -x "$PY" ] || PY=/opt/homebrew/bin/python3; [ -x "$PY" ] || PY=python3

# tmo SECONDS cmd...: a hard timeout on anything that can hang (kills the whole process group, exit 124).
tmo() { "$PY" "$SCRIPTS/lib/timeout.py" "$@"; }

# dry WHAT: under --dry-run, print what would happen and return 0 (the caller skips the real thing).
dry() { [ -n "$DRY" ] && echo "dry-run: would $*"; [ -n "$DRY" ]; }

# logfile JOB: a fresh log path under /tmp/anygym-logs/JOB/, printed.
logfile() { local d="$LOGROOT/$1"; mkdir -p "$d"; echo "$d/$(date +%Y%m%d-%H%M%S).log"; }

# summarize LOG: the short summary (summarize-log.py), never the whole log. Returns its status.
summarize() { "$PY" "$SCRIPTS/summarize-log.py" "$1"; }

# disk_ok GB: free space on / is at least GB.
disk_ok() { local kb; kb=$(df -k / | awk 'NR==2{print $4}'); [ "${kb:-0}" -ge $(( $1 * 1024 * 1024 )) ]; }

# lock_take JOB MAX_SECONDS [loud]: mkdir lock under ~/.config/anygym/locks, released on exit. Held:
# scheduled jobs exit 0 quietly; on-demand scripts (loud) say so and exit 2. Older than 2x MAX: stale,
# cleared and logged.
lock_take() {
  local d="$ANYGYM_CONF/locks/$1.lock" age
  mkdir -p "$ANYGYM_CONF/locks"
  if ! mkdir "$d" 2>/dev/null; then
    age=$(( $(date +%s) - $(stat -f %m "$d" 2>/dev/null || stat -c %Y "$d" 2>/dev/null || date +%s) ))
    if [ "$age" -gt $(( 2 * $2 )) ]; then
      echo "$(date '+%F %T') $1: stale lock ($age s old) cleared" >> "$ANYGYM_CONF/locks/stale.log"
      rmdir "$d" 2>/dev/null || true; mkdir "$d" 2>/dev/null || exit 0
    elif [ -n "${3:-}" ]; then echo "$1: another run holds $d (${age} s old), not started" >&2; exit 2
    else exit 0; fi
  fi
  LOCK_DIR="$d"; trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
}

# heartbeat JOB STATUS START_EPOCH SUMMARY: ~/.config/anygym/heartbeats/JOB.json, written atomically.
heartbeat() {
  local d="$ANYGYM_CONF/heartbeats"; mkdir -p "$d"
  JOB="$1" ST="$2" T0="$3" SUM="$4" "$PY" -c 'import json,os,time
e=os.environ
print(json.dumps({"time": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "epoch": int(time.time()), "status": e["ST"], "duration_s": int(time.time()) - int(e["T0"]), "summary": e["SUM"][:300]}))' > "$d/.$1.tmp" && mv "$d/.$1.tmp" "$d/$1.json"
}
