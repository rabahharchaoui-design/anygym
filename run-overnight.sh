#!/bin/zsh
# Started by the LaunchAgent after a reboot, launchd gives a bare PATH: find claude, codex, node, gh the same way a login shell does.
[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile" >/dev/null 2>&1
export PATH="$HOME/.local/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin:$HOME/.npm-global/bin:$HOME/bin:$PATH"
# AnyGym Fable Loop with a Claude usage budget (G, Oct 30: leave usage for G all week).
# Fable orchestrates, Opus builds, Sonnet tests. Resumes from PLAN.md, stops at ALL DONE.
# Budget lives in .loop-budget (reread before every run, edit any time):
#   runs only while G sleeps (3 PM to 11 PM Guam time), at most DAY_HOURS a day, and at most WEEK_HOURS of loop time per usage week
#   (the week resets Thursday 8 PM Guam). The first start gets a KICKOFF run right away.
# Pause any time: touch .loop-pause    Resume: rm .loop-pause
cd "$(dirname "$0")"
LOG=overnight-loop.log
CFG=.loop-budget
STATE=.loop-hours
[ -f $CFG ] || cat > $CFG <<'CFGEOF'
# AnyGym loop budget. The loop rereads this before every run.
MODEL=claude-fable-5-2
START_HOUR=12       # Guam time: runs may start from noon (G sleeps 3 PM to 11 PM)
END_HOUR=0          # Guam time: any run still going at midnight is stopped (0 = midnight)
DAY_HOURS=5         # most loop hours per day, spreads the week evenly
WEEK_HOURS=30       # most loop hours per usage week (resets Thursday 8 PM Guam time)
KICKOFF_HOURS=2     # one run right away the first time the loop starts, counts toward the week
CFGEOF
PLUG=""
[ -d "$HOME/claude-mods/pocketsim-guard" ] && PLUG="--plugin-dir $HOME/claude-mods/pocketsim-guard"
tk(){ TZ=Pacific/Guam date "$@"; }   # G moved to Guam (Nov 5): all windows and day counts are Guam time
weekkey(){ local dow=$(tk +%u) h=$(tk +%H) d; d=$(( (dow - 4 + 7) % 7 )); [ $d -eq 0 ] && [ $((10#$h)) -lt 20 ] && d=7; tk -v-${d}d +%F; }
used(){ local k=$(weekkey); awk -v k="$k" '$1==k{s+=$NF} END{print s+0}' $STATE 2>/dev/null || echo 0; }
usedday(){ local k=$(tk +%F); awk -v k="$k" 'NF==3 && $2==k{s+=$3} END{print s+0}' $STATE 2>/dev/null || echo 0; }
in_window(){ [ "${ALLDAY:-0}" = 1 ] && return 0; local h=$((10#$(tk +%H))); if [ $START_HOUR -le $END_HOUR ]; then [ $h -ge $START_HOUR ] && [ $h -lt $END_HOUR ]; else [ $h -ge $START_HOUR ] || [ $h -lt $END_HOUR ]; fi; }
window_left(){ local e=$(tk -j -f "%Y-%m-%d %H:%M:%S" "$(tk +%F) $(printf %02d $END_HOUR):00:00" +%s) now=$(date +%s); [ $e -le $now ] && e=$((e+86400)); echo $((e-now)); }
say(){ echo "=== $* $(date) ===" >> "$LOG"; }
# G, Nov 15: build any time, but while G is awake (9 AM to 2 AM Guam) leave him 20% of each 5 hour window, and always keep 15% of the week.
# Numbers come from .usage-tap, written by the status line tap (.claude/usage-tap.sh) with Claude Code's own rate limit data.
awake(){ local h=$((10#$(tk +%H))); [ $h -ge 9 ] || [ $h -lt 2 ]; }
tap_fresh(){ [ -f .usage-tap ] || return 1; local ts=$(grep '^ts=' .usage-tap | cut -d= -f2); [ -n "$ts" ] && [ $(( $(date +%s) - ts )) -lt 1200 ]; }
tapv(){ grep "^$1=" .usage-tap 2>/dev/null | cut -d= -f2; }
week_allowed(){ # G, Nov 17: never leave G with nothing; spread what is left evenly until the weekly reset
  local stop=${WEEK_STOP:-85} wr=$(tapv week_reset) w=$(tapv week) now=$(date +%s) line wr0 t0 p0 span
  [ -z "$wr" ] && { echo $stop; return; }
  line=$(cat .week-pace 2>/dev/null); wr0=${line%% *}
  if [ "$wr0" != "$wr" ]; then echo "$wr $now ${w:-0}" > .week-pace; line="$wr $now ${w:-0}"; fi
  t0=$(echo "$line" | cut -d' ' -f2); p0=$(echo "$line" | cut -d' ' -f3)
  span=$(( wr - 14400 - t0 )); [ $span -lt 3600 ] && { echo $stop; return; }
  local lead=${WEEK_LEAD:-20};   # G, Nov 22: "if you can go, let's go"; still 85% max by 4 h before the reset
   local a=$(( p0 + lead + (stop - p0 - lead) * (now - t0) / span )); [ $a -gt $stop ] && a=$stop; echo $a   # lead: may run this far ahead of the even pace (Nov 19: a lead of 2 made runs stop after 4 min)
}
over_limit(){ tap_fresh || return 1; local f=$(tapv five) w=$(tapv week); [ "${w:-0}" -ge "$(week_allowed)" ] && { echo week; return 0; }; local cap=${FIVE_STOP:-74}; if [ -f .five-override ]; then read -r oc ou < .five-override; [ "$(date +%s)" -lt "${ou:-0}" ] 2>/dev/null && cap=$oc; fi; [ "${f:-0}" -ge $cap ] && { echo five; return 0; }; return 1; }   # .five-override "cap until": a one run exception G approved
tap_age(){ local ts=$(tapv ts); [ -n "$ts" ] && echo $(( $(date +%s) - ts )) || echo 99999; }
probe(){ local root="$PWD" d="$HOME/.cache/anygym-probe"; mkdir -p "$d"; date +%s > .usage-probe-at; ( cd "$d" && perl -e 'alarm shift; exec @ARGV' 90 claude --model haiku --output-format stream-json --verbose -p "Reply with OK only." 2>/dev/null | node "$root/.loop-tools/stream-tap.mjs" "$root/.usage-tap" >/dev/null 2>&1 ); }
probe_due(){ [ $(tap_age) -gt ${PROBE_EVERY:-300} ] || return 1; local pa=$(cat .usage-probe-at 2>/dev/null); [ $(( $(date +%s) - ${pa:-0} )) -gt ${PROBE_EVERY:-300} ]; }
hold_set(){ local r=$(tapv five_reset); [ -n "$r" ] && [ "$r" -gt $(date +%s) ] 2>/dev/null || r=$(( $(date +%s) + 3600 )); echo "$r" > .usage-hold; }   # never restart before the 5h window resets
usage_watch(){ while sleep 30; do probe_due && probe; local why=$(over_limit); if [ -n "$why" ]; then [ "$why" = five ] && hold_set; echo "=== usage guard: $why limit reached ($(tapv five)% of 5h, $(tapv week)% of week), stopping this run $(date) ===" >> "$LOG"; echo "$why" > .usage-stop; pkill -TERM -P $1 2>/dev/null; kill -TERM $1 2>/dev/null; return; fi; done; }
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
# Sharing the build with the cloud builder (G's waking hours, midnight to noon Guam time):
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
  if [ -n "$(git status --porcelain)" ]; then git add -A && git commit -q -m "WIP gmini: work in progress at the end of a build run (the next builder continues it) [skip ci]" 2>>"$LOG"; fi
  if git push -q origin "$br" 2>>"$LOG" && git push -q origin master 2>>"$LOG"; then say "pushed $br for the cloud builder ($(git rev-parse --short HEAD))"; else say "push to GitHub failed, will retry after the next run"; fi; }
LOOP_V=2
# Keep the phone watcher in step with .anygym-ntfy.sh (reinstalls it when it changed), so G never has to.
W=$(mktemp); sed -n '/^cat > "\$HOME\/bin\/anygym-notify.sh"/,/^__NOTIFY_EOF__/p' .anygym-ntfy.sh | sed '1d;$d' > "$W"
if [ -s "$W" ] && ! cmp -s "$W" "$HOME/bin/anygym-notify.sh"; then bash .anygym-ntfy.sh >/dev/null 2>&1; echo "=== phone watcher updated $(date) ===" >> "$LOG"; fi; rm -f "$W"
say "AnyGym loop started (budget mode)"
sync_out   # anything left from before this start goes to GitHub for the cloud builder
SELF_HASH=$(md5 -q run-overnight.sh 2>/dev/null)
n=0; FAST=0; WAITMSG=""
KICK=0; [ -f $STATE ] || KICK=1
while [ $n -lt 300 ]; do
  source ./$CFG
  cloudcheck
  # The script file changed since this loop started: reload it between runs (never during one).
  if [ -n "$SELF_HASH" ] && [ "$(md5 -q run-overnight.sh 2>/dev/null)" != "$SELF_HASH" ]; then sleep 5
    if zsh -n ./run-overnight.sh 2>>.loop-script.err; then say "loop script changed, reloading it"; exec zsh ./run-overnight.sh
    else SELF_HASH=$(md5 -q run-overnight.sh 2>/dev/null); say "loop script changed but does not parse, keeping the running one"; ntfy "AnyGym: loop edit rejected" "A change to the build loop did not parse on gmini, so the old loop keeps running. Claude is fixing it." "warning"; fi
  fi
  # Grok helper (G, Nov 17): live tests through Grok Bot, reviews and audits through the Grok Build CLI. Keep it running.
  lastreal=$(git log -1 --format=%ct --invert-grep --grep='^WIP' 2>/dev/null || echo 0)
  if [ ! -f .loop-pause ] && [ $(( $(date +%s) - ${lastreal:-0} )) -gt 43200 ] && [ $(( $(date +%s) - $(cat .noprog-ntfy 2>/dev/null || echo 0) )) -gt 43200 ]; then
    date +%s > .noprog-ntfy; say "stall watch: no real commit in 12 hours"
    ntfy "AnyGym: no progress in 12 hours" "No real work was committed in the last 12 hours. Last loop status: $(grep '^===' "$LOG" | grep -v 'pushed s4-run\|started the' | tail -1 | cut -c5-140). Claude has been asked to look." "warning"
  fi
  if [ -f .codex-restart ]; then rm -f .codex-restart; tmux kill-session -t codex-helper 2>/dev/null; say "restarting the Codex helper (asked by Claude)"; sleep 2; fi
  if [ -f .codex-helper.sh ] && /bin/bash -n .codex-helper.sh 2>/dev/null && command -v tmux >/dev/null 2>&1 && command -v codex >/dev/null 2>&1 && ! tmux has-session -t codex-helper 2>/dev/null; then env -u TMUX tmux new-session -d -s codex-helper "bash $PWD/.codex-helper.sh" && say "started the Codex helper (tmux session codex-helper)"; fi
  if [ -f .grok-restart ]; then rm -f .grok-restart; tmux kill-session -t grok-helper 2>/dev/null; say "restarting the Grok helper (asked by Claude)"; sleep 2; fi
  for hs in .grok-helper.sh .codex-helper.sh; do   # never start a helper that does not parse in this Mac's own bash (Nov 19 crash loop)
    if [ -f "$hs" ] && ! /bin/bash -n "$hs" 2>/dev/null; then hh=$(md5 -q "$hs" 2>/dev/null)
      [ "$(cat ".broken-$hs" 2>/dev/null)" != "$hh" ] && { echo "$hh" > ".broken-$hs"; say "$hs has a syntax error, not starting it"; ntfy "AnyGym: a helper script is broken" "$hs does not parse on gmini, so it is not started. Claude is fixing it." "warning"; }
    else rm -f ".broken-$hs" 2>/dev/null; fi
  done
  if [ -f .grok-helper.sh ] && /bin/bash -n .grok-helper.sh 2>/dev/null && command -v tmux >/dev/null 2>&1 && { command -v grok >/dev/null 2>&1 || [ -x "$HOME/.grok/bin/grok" ]; } && ! tmux has-session -t grok-helper 2>/dev/null; then env -u TMUX tmux new-session -d -s grok-helper "bash $PWD/.grok-helper.sh 2>>$PWD/.grok-helper.err" && say "started the Grok helper (tmux session grok-helper)"; fi
  if ! command -v claude >/dev/null 2>&1; then [ "$WAITMSG" != noclaude ] && { say "claude command not found on PATH ($PATH), waiting"; ntfy "AnyGym: needs Claude" "The build loop cannot find the claude command. Tell Claude in chat." "warning"; }; WAITMSG=noclaude; sleep 600; continue; fi
  if [ -f .loop-pause ]; then pu=$(grep -o 'until=[0-9]*' .loop-pause | head -1 | cut -d= -f2); if [ -n "$pu" ] && [ $(date +%s) -ge $pu ]; then mv .loop-pause .loop-pause.expired; say "pause expired, resuming"; fi; fi   # a pause can carry until=<epoch>
  if [ -f .loop-pause ] && [ "${IGNORE_GOV:-0}" = 1 ] && grep -q "usage governor" .loop-pause; then mv .loop-pause .loop-pause.gov-ignored; say "governor pause ignored: weekly reset is close (IGNORE_GOV)"; fi
  if [ -f .loop-pause ]; then [ "$WAITMSG" != pause ] && say "paused by .loop-pause"; WAITMSG=pause; sleep 300; continue; fi
  usedsec=$(used); weekleft=$(( WEEK_HOURS*3600 - usedsec ))
  if [ $weekleft -lt 900 ]; then [ "$WAITMSG" != week ] && say "weekly loop budget used ($WEEK_HOURS h), waiting for the Thursday 8 PM Guam time reset"; WAITMSG=week; daydone; sleep 900; continue; fi
  if [ $KICK -eq 1 ]; then limit=$(( KICKOFF_HOURS*3600 )); elif in_window; then limit=$(window_left); else
    [ "$WAITMSG" != window ] && say "outside the build window (from $START_HOUR:00 to $END_HOUR:00 Guam time), waiting. Used this week: $((usedsec/60)) of $((WEEK_HOURS*60)) min"; WAITMSG=window; daydone; sleep 600; continue; fi
  [ $limit -gt $weekleft ] && limit=$weekleft
  dayleft=$(( ${DAY_HOURS:-24}*3600 - $(usedday) ))
  if [ $KICK -eq 0 ] && [ $dayleft -lt 900 ]; then [ "$WAITMSG" != day ] && say "today's loop budget used ($DAY_HOURS h), waiting for tomorrow's window"; WAITMSG=day; daydone; sleep 900; continue; fi
  [ $limit -gt $dayleft ] && limit=$dayleft
  [ $limit -lt 900 ] && { sleep 600; continue; }
  if [ -f .usage-hold ]; then hr=$(cat .usage-hold 2>/dev/null); if [ "$(date +%s)" -lt "${hr:-0}" ] 2>/dev/null; then [ "$WAITMSG" != uhold ] && say "usage guard: holding until the 5 hour window resets at $(TZ=Pacific/Guam date -r ${hr} +%H:%M) (cap ${FIVE_STOP:-74}% so G never passes 83%)"; WAITMSG=uhold; sleep 120; continue; fi; mv .usage-hold .usage-hold.last; fi
  [ $(tap_age) -gt ${PROBE_EVERY:-300} ] && probe
  if tap_fresh; then hw=$(( $(week_allowed) - $(tapv week) ))   # Nov 22: a run needs room to do real work; starting at the edge just burns startup tokens
    if [ $hw -lt ${WEEK_START_GAP:-4} ]; then [ "$WAITMSG" != ugap ] && say "usage guard: ${hw}% of weekly room right now, waiting for ${WEEK_START_GAP:-4}% so a run can finish real work (85% by 4 hours before the reset, 15% kept for G)"; WAITMSG=ugap; sleep 1200; continue; fi
  fi
  why=$(over_limit); [ "$why" = five ] && hold_set; if [ "$why" = week ]; then [ "$WAITMSG" != uweek ] && say "usage guard: $(tapv week)% of the week used, pacing allows $(week_allowed)% by now (85% by 4 hours before the reset, 15% kept for G); Grok and Codex build meanwhile"; WAITMSG=uweek; sleep 1800; continue; fi
  if [ "$why" = five ]; then wr=$(tapv five_reset); [ "$WAITMSG" != ufive ] && say "usage guard: $(tapv five)% of the 5 hour window used, waiting for its reset at $(TZ=Pacific/Guam date -r ${wr:-0} +%H:%M)"; WAITMSG=ufive; sleep 600; continue; fi
  REST=0; if awake && ! tap_fresh; then [ $limit -gt 7200 ] && limit=7200; REST=1; fi   # no live usage numbers yet: short runs with rests while G is awake
  sync_in || { sleep 600; continue; }
  WAITMSG=""; n=$((n+1)); RANTODAY=1
  say "run $n (up to $((limit/60)) min, used this week $((usedsec/60)) of $((WEEK_HOURS*60)) min, model $MODEL)"
  RUNLOG=$(mktemp); START=$(date +%s)
  if [ $n -eq 1 ] && ! grep -q "\[x\]" PLAN.md; then
    ( claude --model $MODEL --dangerously-skip-permissions ${=PLUG} --output-format stream-json --verbose -p "$(cat PROMPT.md)" 2>&1 | node .loop-tools/stream-tap.mjs .usage-tap ) > "$RUNLOG" 2>&1 &
  else
    ( claude --continue --model $MODEL --dangerously-skip-permissions ${=PLUG} --output-format stream-json --verbose -p "Continue as the orchestrator per PROMPT.md. Re-read PLAN.md and resume at the first unchecked item above the STOP line (if HEAD is a 'Handoff to cloud builder' work in progress commit, check that item's code against SPEC and finish it first). When everything above the STOP line is done, merged, pushed and live, print exactly ALL DONE." 2>&1 | node .loop-tools/stream-tap.mjs .usage-tap ) > "$RUNLOG" 2>&1 &
  fi
  pid=$!
  ( sleep $limit; echo "=== budget time is up, stopping this run $(date) ===" >> "$LOG"; pkill -TERM -P $pid 2>/dev/null; kill -TERM $pid 2>/dev/null; sleep 30; pkill -KILL -P $pid 2>/dev/null; kill -KILL $pid 2>/dev/null ) &
  wd=$!
  rm -f .usage-stop; ( usage_watch $pid ) &
  uw=$!
  wait $pid 2>/dev/null
  kill $wd $uw 2>/dev/null; pkill -P $wd 2>/dev/null; pkill -P $uw 2>/dev/null
  dur=$(( $(date +%s) - START ))
  echo "$(weekkey) $(tk +%F) $dur" >> $STATE
  KICK=0
  cat "$RUNLOG" >> "$LOG"
  sync_out
  if grep -qE "^[[:space:]]*ALL DONE[.]?[[:space:]]*$" "$RUNLOG"; then say "ALL DONE"; rm -f "$RUNLOG"; break; fi
  # Only a real stop: the run ended early (not by the budget timer) AND the limit message is at the very end of its output.
  # (Nov 15: a 5 hour limit hit hours earlier, then refilled by G's Fable reset, was still in the log and sent G a false push.)
  if [ $dur -lt $(( limit - 60 )) ] && tail -n 6 "$RUNLOG" | grep -qiE "usage limit|limit reached|rate limit|resets at|resets [0-9]|hit your"; then
    if tail -n 6 "$RUNLOG" | grep -qiE "fable.*limit|limit.*fable"; then wr=$(tapv week_reset); [ -z "$wr" ] || [ "$wr" -lt $(date +%s) ] && wr=$(( $(date +%s) + 86400 )); echo "$wr" > .fable-capped; ntfy "AnyGym: Fable full for the week" "No Fable resets left, so the build switched to Opus by itself until the weekly reset. Nothing to press." "information_source"; say "Fable weekly limit hit, building on Opus until $(TZ=Pacific/Guam date -r $wr '+%a %H:%M')"; FAST=0; rm -f "$RUNLOG"; sleep 120; continue
    elif tail -n 6 "$RUNLOG" | grep -qiE "weekly limit|7-day limit|week.*limit" && [ "$(cat .weekly-ntfy 2>/dev/null)" != "$(tk +%F)" ]; then tk +%F > .weekly-ntfy; ntfy "AnyGym: weekly limit hit" "All models is full for the week. Nothing to press (no Full reset left); the build waits for Thursday 8 PM." "warning"; say "weekly all models limit hit, told G"; fi
    FAST=0; say "run $n hit a usage limit, sleeping 30 min"; rm -f "$RUNLOG"; sleep 1800; continue
  fi
  rm -f "$RUNLOG"
  echo "$(date +%s) $dur" >> .run-durations; tail -n 20 .run-durations > .run-durations.t && mv .run-durations.t .run-durations
  # STALL WATCH (G, Nov 22 "you can't let this keep happening"): 3 short runs in a row means the guard is chopping runs before real work
  if [ "$(tail -n 3 .run-durations | awk '$2 < 300 {c++} END {print c+0}')" -ge 3 ] && [ "$(cat .stall-ntfy 2>/dev/null)" != "$(tail -n 1 .run-durations | cut -d' ' -f1)" ]; then
    tail -n 1 .run-durations | cut -d' ' -f1 > .stall-ntfy; say "stall watch: the last 3 runs were each under 5 minutes"
    ntfy "AnyGym: build is stalling" "The last 3 runs each stopped in under 5 minutes, so nothing is getting built. Claude is told; the next run waits until there is real room." "warning"
  fi
  if [ -f .usage-stop ] && [ -f .five-override ]; then mv .five-override .five-override.used; hold_set; fi
  if [ -f .usage-stop ]; then mv .usage-stop .usage-stop.last; say "run $n stopped by the usage guard, checking again in 10 min"; sleep 600; continue; fi
  if [ $REST -eq 1 ] && ! tap_fresh; then say "no live usage numbers while G is awake: resting 3 h after a 2 h run"; sleep 10800; continue; fi
  if [ $dur -lt 60 ]; then FAST=$((FAST+1)); else FAST=0; fi
  if [ $FAST -ge 3 ]; then say "3 runs in a row failed in under a minute, stopping. Check the end of $LOG"; break; fi
  if [ -f .five-override ]; then mv .five-override .five-override.used; hold_set; say "one run exception done, holding again until the 5 hour window resets"; fi   # G: one run only, then pause
  say "run $n ended after $((dur/60)) min, next check in 2 min"; sleep 120
done
say "AnyGym loop finished"
