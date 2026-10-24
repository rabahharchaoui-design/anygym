#!/bin/zsh
# AnyGym Fable Loop. Fable orchestrates, Opus builds, Sonnet tests.
# Runs nonstop. Resumes from PLAN.md after usage limits, stops at ALL DONE.
cd "$(dirname "$0")"
LOG=overnight-loop.log
MAX=200
n=0
FAST=0
PLUG=""
[ -d "$HOME/claude-mods/pocketsim-guard" ] && PLUG="--plugin-dir $HOME/claude-mods/pocketsim-guard"
echo "=== AnyGym loop started $(date) ===" >> "$LOG"
while [ $n -lt $MAX ]; do
  n=$((n+1))
  echo "=== run $n $(date) ===" >> "$LOG"
  RUNLOG=$(mktemp)
  START=$SECONDS
  if [ $n -eq 1 ] && ! grep -q "\[x\]" PLAN.md; then
    claude --model claude-fable-5-1 --dangerously-skip-permissions ${=PLUG} -p "$(cat PROMPT.md)" 2>&1 | tee "$RUNLOG" | tee -a "$LOG"
  else
    claude --continue --model claude-fable-5-1 --dangerously-skip-permissions ${=PLUG} -p "Continue as the orchestrator per PROMPT.md. Re-read PLAN.md and resume at the first unchecked item above the STOP line. When everything above the STOP line is done, merged, pushed and live, print exactly ALL DONE." 2>&1 | tee "$RUNLOG" | tee -a "$LOG"
  fi
  if grep -qE "^[[:space:]]*ALL DONE[.]?[[:space:]]*$" "$RUNLOG"; then
    echo "=== ALL DONE $(date) ===" >> "$LOG"; rm -f "$RUNLOG"; break
  fi
  if grep -qiE "usage limit|limit reached|rate limit|resets at|resets [0-9]" "$RUNLOG"; then
    FAST=0
    echo "=== run $n hit a usage limit $(date), sleeping 30 min ===" >> "$LOG"; rm -f "$RUNLOG"; sleep 1800
    continue
  fi
  rm -f "$RUNLOG"
  if [ $((SECONDS-START)) -lt 60 ]; then FAST=$((FAST+1)); else FAST=0; fi
  if [ $FAST -ge 3 ]; then
    echo "=== 3 runs in a row failed in under a minute, stopping. Check the end of $LOG ===" >> "$LOG"; break
  fi
  echo "=== run $n ended $(date), resuming in 2 min ===" >> "$LOG"; sleep 120
done
echo "=== AnyGym loop finished $(date) ===" >> "$LOG"
