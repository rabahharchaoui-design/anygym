#!/bin/bash
# cleanup.sh [--dry-run]: daily at 4:00 (launchd). Removes only: (1) /tmp/anygym-logs past the rotation
# rule (each job keeps its newest 20 logs and anything under 7 days; the folder is capped at 500 MB);
# (2) /tmp/*.log older than 7 days with a known AnyGym test-log name; (3) Playwright test-results/ and
# playwright-report/ folders older than 3 days in the repo and its ~/projects/anygym-* worktrees.
# Never touches src, .git, node_modules, .loop-tools or ~/anygym-handoff.md. Prints what it removed.
# Always try --dry-run first. npm: npm run tools:cleanup
set -euo pipefail
. "$(dirname "$0")/lib/common.sh"
for a in "$@"; do [ "$a" = "--dry-run" ] || { echo "cleanup.sh: unknown option $a" >&2; exit 2; }; done
[ -n "$DRY" ] || lock_take cleanup 600
T0=$(date +%s); n=0; kb=0
[ -n "$DRY" ] && LOG=/dev/null || LOG=$(logfile cleanup)
gone() { # PATH: remove one allowed path (or say it would), refusing anything protected
  case "$1" in */src|*/src/*|*/.git|*/.git/*|*/node_modules*|*/.loop-tools*|"$HOME/anygym-handoff.md"|""|/) echo "refused (protected): $1" | tee -a "$LOG"; return 0;; esac
  local s; s=$(du -sk "$1" 2>/dev/null | awk '{print $1}'); n=$((n+1)); kb=$((kb + ${s:-0}))
  if [ -n "$DRY" ]; then echo "dry-run: would remove $1 (${s:-0} KB)"; else rm -rf -- "$1" && echo "removed $1 (${s:-0} KB)" >> "$LOG"; fi; }
# 1) rotation inside /tmp/anygym-logs
if [ -d "$LOGROOT" ]; then
  for d in "$LOGROOT"/*/; do [ -d "$d" ] || continue
    ls -1t "$d" 2>/dev/null | grep -E '^[0-9]{8}-[0-9]{6}\.log$' | tail -n +21 | while read -r f; do
      [ -n "$(find "$d$f" -mtime +7 2>/dev/null)" ] && echo "$d$f"; done
  done > "${TMPDIR:-/tmp}/anygym-cleanup.$$" || true
  while read -r f; do gone "$f"; done < "${TMPDIR:-/tmp}/anygym-cleanup.$$"; rm -f "${TMPDIR:-/tmp}/anygym-cleanup.$$"
  cap=$(( ${CLEANUP_CAP_MB:-500} * 1024 )); tot=$(du -sk "$LOGROOT" | awk '{print $1}')
  if [ "$tot" -gt "$cap" ]; then # oldest first until under the cap, never the newest log of a job
    find "$LOGROOT" -type f -name '[0-9]*-[0-9]*.log' -print0 | xargs -0 ls -1tr 2>/dev/null | while read -r f; do
      [ "$tot" -le "$cap" ] && break; [ "$(ls -1t "$(dirname "$f")" | head -1)" = "$(basename "$f")" ] && continue
      s=$(du -sk "$f" | awk '{print $1}'); tot=$((tot - s)); echo "$f"; done > "${TMPDIR:-/tmp}/anygym-cap.$$" || true
    while read -r f; do gone "$f"; done < "${TMPDIR:-/tmp}/anygym-cap.$$"; rm -f "${TMPDIR:-/tmp}/anygym-cap.$$"
  fi
fi
# 2) old AnyGym test logs in /tmp (our own files only)
for f in /tmp/anygym-*.log /tmp/ship-*.log /tmp/q[0-9]*-*.log /tmp/pw-*.log /tmp/vitest-*.log /tmp/codex-*.log; do
  [ -f "$f" ] && [ -O "$f" ] && [ -n "$(find "$f" -mtime +7 2>/dev/null)" ] && gone "$f"; done
# 3) old Playwright output folders
for w in "$REPO" "$HOME"/projects/anygym-*; do for p in test-results playwright-report; do
  [ -d "$w/$p" ] || continue; git -C "$w" ls-files --error-unmatch "$p" >/dev/null 2>&1 && continue
  [ -n "$(find "$w/$p" -maxdepth 0 -mtime +3 2>/dev/null)" ] && gone "$w/$p"; done; done
msg="$( [ -n "$DRY" ] && echo 'would remove' || echo removed) $n item(s), $((kb / 1024)) MB"
if [ -n "$DRY" ]; then echo "dry-run: cleanup $msg; would write heartbeats/cleanup.json"; exit 0; fi
heartbeat cleanup ok "$T0" "$msg"
echo "cleanup: $msg in $(( $(date +%s) - T0 )) s"; tail -n 8 "$LOG" | sed 's/^/  /'
echo "LOG $LOG"
