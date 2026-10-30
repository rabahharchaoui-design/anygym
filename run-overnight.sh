#!/bin/zsh
# AnyGym Fable Loop with a Claude usage budget (G, Oct 30: leave usage for G all week).
# Fable orchestrates, Opus builds, Sonnet tests. Resumes from PLAN.md, stops at ALL DONE.
# Budget lives in .loop-budget (reread before every run, edit any time):
#   runs only while G sleeps (noon to midnight Japan time), at most DAY_HOURS a day, and at most WEEK_HOURS of loop time per usage week
#   (the week resets Thursday 7 PM Tokyo). The first start gets a KICKOFF run right away.
# Pause any time: touch .loop-pause    Resume: rm .loop-pause
cd "$(dirname "$0")"
LOG=overnight-loop.log
CFG=.loop-budget
STATE=.loop-hours
[ -f $CFG ] || cat > $CFG <<'CFGEOF'
# AnyGym loop budget. The loop rereads this before every run.
MODEL=claude-fable-5-1
START_HOUR=12       # Japan time: runs may start from noon (G sleeps noon to midnight)
END_HOUR=0          # Japan time: any run still going at midnight is stopped (0 = midnight)
DAY_HOURS=5         # most loop hours per day, spreads the week evenly
WEEK_HOURS=30       # most loop hours per usage week (resets Thursday 7 PM Japan time)
KICKOFF_HOURS=2     # one run right away the first time the loop starts, counts toward the week
CFGEOF
PLUG=""
[ -d "$HOME/claude-mods/pocketsim-guard" ] && PLUG="--plugin-dir $HOME/claude-mods/pocketsim-guard"
tk(){ TZ=Asia/Tokyo date "$@"; }
weekkey(){ local dow=$(tk +%u) h=$(tk +%H) d; d=$(( (dow - 4 + 7) % 7 )); [ $d -eq 0 ] && [ $((10#$h)) -lt 19 ] && d=7; tk -v-${d}d +%F; }
used(){ local k=$(weekkey); awk -v k="$k" '$1==k{s+=$NF} END{print s+0}' $STATE 2>/dev/null || echo 0; }
usedday(){ local k=$(tk +%F); awk -v k="$k" 'NF==3 && $2==k{s+=$3} END{print s+0}' $STATE 2>/dev/null || echo 0; }
in_window(){ local h=$((10#$(tk +%H))); if [ $START_HOUR -le $END_HOUR ]; then [ $h -ge $START_HOUR ] && [ $h -lt $END_HOUR ]; else [ $h -ge $START_HOUR ] || [ $h -lt $END_HOUR ]; fi; }
window_left(){ local e=$(tk -j -f "%Y-%m-%d %H:%M:%S" "$(tk +%F) $(printf %02d $END_HOUR):00:00" +%s) now=$(date +%s); [ $e -le $now ] && e=$((e+86400)); echo $((e-now)); }
say(){ echo "=== $* $(date) ===" >> "$LOG"; }
ntfy(){ local t=$(cat "$HOME/.config/anygym/ntfy-topic" 2>/dev/null); [ -n "$t" ] && curl -s -o /dev/null --max-time 10 -H "Title: $1" -H "Tags: $3" -H "Click: https://rabahharchaoui-design.github.io/anygym/" -d "$2" "https://ntfy.sh/$t"; }
# One summary push when the day's building ends: what shipped and what to check on the phone.
DAYSTART=$(git rev-parse master 2>/dev/null); RANTODAY=0
daydone(){ [ $RANTODAY -eq 1 ] || return; RANTODAY=0
  local shipped=$(git log --reverse --first-parent --format=%s "$DAYSTART"..master 2>/dev/null | grep -i '^Checkpoint' | sed 's/^Checkpoint //')
  local now=$(awk '/=== STOP HERE/{exit} /^- \[ \] [0-9]/{sub(/^- \[ \] /,""); print substr($0,1,60); exit}' PLAN.md)
  if [ -n "$shipped" ]; then ntfy "AnyGym: done for today" "Live now, open the app and check: $(echo "$shipped" | tr '\n' ';' | sed 's/;$//; s/;/; /g'). The test now pushes above say exactly what to tap. Next up: $now" "sparkles"
  else ntfy "AnyGym: done for today" "Nothing new to check on your phone yet. Still working on: $now" "hourglass"; fi
  DAYSTART=$(git rev-parse master 2>/dev/null); }
say "AnyGym loop started (budget mode)"
n=0; FAST=0; WAITMSG=""
KICK=0; [ -f $STATE ] || KICK=1
while [ $n -lt 300 ]; do
  source ./$CFG
  if [ -f .loop-pause ]; then [ "$WAITMSG" != pause ] && say "paused by .loop-pause"; WAITMSG=pause; sleep 300; continue; fi
  usedsec=$(used); weekleft=$(( WEEK_HOURS*3600 - usedsec ))
  if [ $weekleft -lt 900 ]; then [ "$WAITMSG" != week ] && say "weekly loop budget used ($WEEK_HOURS h), waiting for the Thursday 7 PM Japan time reset"; WAITMSG=week; daydone; sleep 900; continue; fi
  if [ $KICK -eq 1 ]; then limit=$(( KICKOFF_HOURS*3600 )); elif in_window; then limit=$(window_left); else
    [ "$WAITMSG" != window ] && say "outside the build window (from $START_HOUR:00 to $END_HOUR:00 Japan time), waiting. Used this week: $((usedsec/60)) of $((WEEK_HOURS*60)) min"; WAITMSG=window; daydone; sleep 600; continue; fi
  [ $limit -gt $weekleft ] && limit=$weekleft
  dayleft=$(( ${DAY_HOURS:-24}*3600 - $(usedday) ))
  if [ $KICK -eq 0 ] && [ $dayleft -lt 900 ]; then [ "$WAITMSG" != day ] && say "today's loop budget used ($DAY_HOURS h), waiting for tomorrow's window"; WAITMSG=day; daydone; sleep 900; continue; fi
  [ $limit -gt $dayleft ] && limit=$dayleft
  [ $limit -lt 900 ] && { sleep 600; continue; }
  WAITMSG=""; n=$((n+1)); RANTODAY=1
  say "run $n (up to $((limit/60)) min, used this week $((usedsec/60)) of $((WEEK_HOURS*60)) min, model $MODEL)"
  RUNLOG=$(mktemp); START=$(date +%s)
  if [ $n -eq 1 ] && ! grep -q "\[x\]" PLAN.md; then
    claude --model $MODEL --dangerously-skip-permissions ${=PLUG} -p "$(cat PROMPT.md)" > "$RUNLOG" 2>&1 &
  else
    claude --continue --model $MODEL --dangerously-skip-permissions ${=PLUG} -p "Continue as the orchestrator per PROMPT.md. Re-read PLAN.md and resume at the first unchecked item above the STOP line (if HEAD is a 'Handoff to cloud builder' work in progress commit, check that item's code against SPEC and finish it first). When everything above the STOP line is done, merged, pushed and live, print exactly ALL DONE." > "$RUNLOG" 2>&1 &
  fi
  pid=$!
  ( sleep $limit; echo "=== budget time is up, stopping this run $(date) ===" >> "$LOG"; pkill -TERM -P $pid 2>/dev/null; kill -TERM $pid 2>/dev/null; sleep 30; pkill -KILL -P $pid 2>/dev/null; kill -KILL $pid 2>/dev/null ) &
  wd=$!
  wait $pid 2>/dev/null
  kill $wd 2>/dev/null; pkill -P $wd 2>/dev/null
  dur=$(( $(date +%s) - START ))
  echo "$(weekkey) $(tk +%F) $dur" >> $STATE
  KICK=0
  cat "$RUNLOG" >> "$LOG"
  if grep -qE "^[[:space:]]*ALL DONE[.]?[[:space:]]*$" "$RUNLOG"; then say "ALL DONE"; rm -f "$RUNLOG"; break; fi
  if grep -qiE "usage limit|limit reached|rate limit|resets at|resets [0-9]|hit your" "$RUNLOG"; then
    FAST=0; say "run $n hit a usage limit, sleeping 30 min"; rm -f "$RUNLOG"; sleep 1800; continue
  fi
  rm -f "$RUNLOG"
  if [ $dur -lt 60 ]; then FAST=$((FAST+1)); else FAST=0; fi
  if [ $FAST -ge 3 ]; then say "3 runs in a row failed in under a minute, stopping. Check the end of $LOG"; break; fi
  say "run $n ended after $((dur/60)) min, next check in 2 min"; sleep 120
done
say "AnyGym loop finished"
