#!/bin/bash
# ci-status.sh [--brief] [--dry-run]: the latest GitHub Actions runs on s4-run and master (id, status,
# title, age, URL); if the newest s4-run run failed or is still running, its failed or running job and
# step names. gh run list / gh run view --json only, never --log. 60 s in total, about 15 lines.
# --brief: one line per branch (used by digest.py). npm: npm run ci
set -euo pipefail
. "$(dirname "$0")/lib/common.sh"
BRIEF=""; for a in "$@"; do case "$a" in --brief) BRIEF=1;; --dry-run) ;; *) echo "ci-status.sh: unknown option $a" >&2; exit 2;; esac; done
F=databaseId,status,conclusion,displayTitle,createdAt,url,workflowName,headBranch
if [ -n "$DRY" ]; then
  echo "dry-run: would run (in $REPO, 60 s budget, up to 2 retries): gh run list --branch s4-run --limit 3 --json $F"
  echo "dry-run: would run: gh run list --branch master --limit 2 --json $F"
  echo "dry-run: would run, if the newest s4-run run failed or is running: gh run view ID --json jobs"
  echo "dry-run: would log to /tmp/anygym-logs/ci-status/<time>.log; reads only"; exit 0
fi
END=$(( $(date +%s) + 60 )); LOG=$(logfile ci-status); cd "$REPO"
gh_try() { # retries with backoff inside the 60 s budget
  local i left out
  for i in 1 2 3; do left=$(( END - $(date +%s) )); [ "$left" -gt 2 ] || break
    if out=$(tmo "$(( left < 25 ? left : 25 ))" gh "$@" 2>>"$LOG"); then printf '%s' "$out"; return 0; fi
    sleep $(( i * 2 )); done
  echo "gh $* failed or timed out" >> "$LOG"; return 1; }
s4=$(gh_try run list --branch s4-run --limit 3 --json "$F") || s4=""
ma=$(gh_try run list --branch master --limit 2 --json "$F") || ma=""
printf '%s\n%s\n' "$s4" "$ma" >> "$LOG"
[ -n "$s4$ma" ] || { echo "ci-status: GitHub did not answer within 60 s (gh auth or network); see LOG"; echo "LOG $LOG"; exit 2; }
jobs=""; if [ -z "$BRIEF" ] && [ -n "$s4" ]; then
  id=$(printf '%s' "$s4" | "$PY" -c 'import json,sys
r=json.load(sys.stdin); r=r[0] if r else {}
print(r.get("databaseId","") if r.get("conclusion") in ("failure","cancelled","timed_out") or r.get("status")!="completed" else "")')
  [ -n "$id" ] && jobs=$(gh_try run view "$id" --json jobs) || true; fi
S4="$s4" MA="$ma" JOBS="$jobs" BRIEF="$BRIEF" "$PY" -c 'import json,os,time,datetime
def ago(t):
    try: s = time.time() - datetime.datetime.strptime(t, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc).timestamp()
    except Exception: return "?"
    return "%dm" % (s // 60) if s < 7200 else ("%dh" % (s // 3600) if s < 172800 else "%dd" % (s // 86400))
e = os.environ
for name, key, n in (("s4-run", "S4", 3), ("master", "MA", 2)):
    try: runs = json.loads(e[key] or "[]")
    except ValueError: runs = []
    if not runs: print("%-7s no runs found" % name); continue
    for r in runs[: (1 if e["BRIEF"] else n)]:
        st = r.get("conclusion") or r.get("status")
        print("%-7s %-11s %-9s %4s ago  %s  %s" % (name, r.get("databaseId"), st, ago(r.get("createdAt", "")), (r.get("displayTitle") or "")[:44], "" if e["BRIEF"] else r.get("url")))
if e["JOBS"]:
    for j in json.loads(e["JOBS"]).get("jobs", []):
        if j.get("conclusion") in (None, "", "success", "skipped"):
            if j.get("status") == "completed": continue
        bad = [s.get("name") for s in j.get("steps", []) if s.get("conclusion") == "failure" or (s.get("status") == "in_progress")]
        print("  job %s: %s%s" % (j.get("name"), j.get("conclusion") or j.get("status"), (" at step: " + ", ".join(bad[:3])) if bad else ""))'
echo "LOG $LOG"
