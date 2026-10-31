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
START_HOUR=12       # Japan time: runs may start from noon (G sleeps 3 PM to 11 PM)
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
# One ntfy push per cloud builder run, so G sees in the morning that the cloud (free credit) worked.
cloudcheck(){ git fetch -q origin 2>/dev/null || return
  local br=$(git for-each-ref --sort=-committerdate --count=1 --format='%(refname:short)' 'refs/remotes/origin/s[0-9]*')
  local last=$(git log -1 --author="AnyGym cloud builder" --format=%H origin/master "$br" 2>/dev/null)
  [ -z "$last" ] && return; local seen=$(cat .cloud-seen 2>/dev/null); [ "$last" = "$seen" ] && return
  echo "$last" > .cloud-seen; [ -z "$seen" ] && seen=$(git log -1 --format=%H --before="12 hours ago" "$br")
  local items=$(git log --author="AnyGym cloud builder" --format=%s "$seen".."$br" origin/master 2>/dev/null | grep -iE '^Checkpoint ' | sed 's/^Checkpoint //; s/: .*//' | sort -u | head -6 | tr '\n' ';' | sed 's/;$//; s/;/; /g')
  # Estimated credit left: cloud build hours (lock taken to released, from GitHub) x CLOUD_RATE dollars per hour from .loop-budget.
  local mins=$(git log --reverse --format='%ct %s' origin/cloud-builder-lock 2>/dev/null | awk '/lock taken/{t=$1} /lock released/{if(t){m+=($1-t)/60; t=0}} END{print int(m)}')
  local money=""
  if [ -n "$CLOUD_RATE" ] && [ -n "$CLOUD_START" ]; then money=$(awk -v r="$CLOUD_RATE" -v s="$CLOUD_START" -v m="$mins" 'BEGIN{printf " About $%.0f of the cloud credit left (estimate, %.1f cloud hours so far).", s-r*m/60, m/60}'); fi
  ntfy "AnyGym: cloud builder worked" "Shipped on the free cloud credit: ${items:-nothing finished yet, work in progress saved}. The test now pushes say what to try.$money" "cloud"
  say "cloud builder work seen ($last)"; }
# One summary push when the day's building ends: what shipped and what to check on the phone.
DAYSTART=$(git rev-parse master 2>/dev/null); RANTODAY=0
daydone(){ [ $RANTODAY -eq 1 ] || return; RANTODAY=0
  local shipped=$(git log --reverse --first-parent --format=%s "$DAYSTART"..master 2>/dev/null | grep -i '^Checkpoint' | sed 's/^Checkpoint //')
  local now=$(awk '/=== STOP HERE/{exit} /^- \[ \] [0-9]/{sub(/^- \[ \] /,""); print substr($0,1,60); exit}' PLAN.md)
  if [ -n "$shipped" ]; then ntfy "AnyGym: done for today" "Live now, open the app and check: $(echo "$shipped" | tr '\n' ';' | sed 's/;$//; s/;/; /g'). The test now pushes above say exactly what to tap. Next up: $now" "sparkles"
  else ntfy "AnyGym: done for today" "Nothing new to check on your phone yet. Still working on: $now" "hourglass"; fi
  DAYSTART=$(git rev-parse master 2>/dev/null); }
# Sharing the build with the cloud builder (G's waking hours, midnight to noon Japan time):
# before each run take the cloud's pushed work; after each run save and push gmini's work so the cloud can continue.
cloud_busy(){ local lk=$(git log -1 --format=%ct origin/cloud-builder-lock 2>/dev/null) lkm=$(git log -1 --format=%s origin/cloud-builder-lock 2>/dev/null)
  [ -n "$lk" ] && [ $(( $(date +%s) - lk )) -lt 10200 ] && ! echo "$lkm" | grep -qi released; }
# Bring gmini up to date with GitHub (the cloud builder's work), keeping gmini's own unsaved and unpushed work on top.
catch_up(){ local br=$(git branch --show-current); git fetch -q origin 2>>"$LOG"
  git rev-parse -q --verify "origin/$br" >/dev/null || return 0
  git merge-base --is-ancestor "origin/$br" HEAD && return 0          # nothing new on GitHub
  local st=""; [ -n "$(git status --porcelain)" ] && git stash -q -u 2>>"$LOG" && st=1
  if git merge-base --is-ancestor HEAD "origin/$br"; then git merge -q --ff-only "origin/$br" 2>>"$LOG"
  else git rebase -q "origin/$br" 2>>"$LOG" || { git rebase --abort 2>/dev/null; say "could not combine gmini's unpushed work with the cloud's, left as is"; ntfy "AnyGym: needs Claude" "gmini and the cloud builder changed the same thing. Ask Claude to look at overnight-loop.log." "warning"; }
  fi
  [ -n "$st" ] && { git stash pop -q 2>>"$LOG" || say "stash pop conflict, gmini's local edits are kept in git stash"; }
  [ "$(git branch --show-current)" = "$br" ] && git merge-base --is-ancestor master origin/master 2>/dev/null && git fetch -q origin master:master 2>/dev/null
  say "up to date with GitHub on $br ($(git rev-parse --short HEAD))"; return 0; }
sync_in(){ git fetch -q origin 2>>"$LOG"
  if cloud_busy; then say "cloud builder is active (lock), waiting"; return 1; fi
  catch_up; return 0; }
sync_out(){ local br=$(git branch --show-current); git fetch -q origin 2>>"$LOG"
  if cloud_busy; then say "cloud builder is active, gmini's work stays on gmini until it finishes"; return 0; fi
  catch_up
  if [ -n "$(git status --porcelain)" ]; then git add -A && git commit -q -m "WIP gmini: work in progress at the end of a build run (the next builder continues it)" 2>>"$LOG"; fi
  if git push -q origin "$br" 2>>"$LOG" && git push -q origin master 2>>"$LOG"; then say "pushed $br for the cloud builder ($(git rev-parse --short HEAD))"; else say "push to GitHub failed, will retry after the next run"; fi; }
say "AnyGym loop started (budget mode)"
sync_out   # anything left from before this start goes to GitHub for the cloud builder
n=0; FAST=0; WAITMSG=""
KICK=0; [ -f $STATE ] || KICK=1
while [ $n -lt 300 ]; do
  source ./$CFG
  cloudcheck
  # The script file changed since this loop started: reload it between runs (never during one).
  if [ "$(stat -f %m run-overnight.sh 2>/dev/null)" != "$SELF_MTIME" ]; then say "loop script changed, reloading it"; exec zsh ./run-overnight.sh; fi
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
  sync_in || { sleep 600; continue; }
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
  sync_out
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
