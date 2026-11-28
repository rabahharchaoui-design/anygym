# AnyGym helper scripts

Small tools that do the repeat work on the Mac mini and print a 5 to 15 line summary, so nobody reads a
700 KB log to find one failure. Read the summary first; open the full log (its path is always the last
line) only when the summary is not enough.

Bash vs Python: bash scripts are saved terminal commands that run tools in a row; Python is used where a
script has to read messy logs or make decisions.

These sit beside the existing tools and replace nothing: `.loop-tools/` (full-suite.sh, quick-tests.sh,
recheck.sh, usage-now.sh, handoff.sh, land.sh, test-loop.sh) and the older `scripts/` tools (secret-scan,
size-guard, dup-guard and the rest) are unchanged.

Every script takes `--dry-run`: it prints what it would run, delete, alert or write, then exits 0 without
doing it. Through npm, put it after `--` (for example `npm run check -- --dry-run`); a bare
`npm run check --dry-run` is npm's own flag. `npm run ci` runs ci-status; `npm ci` is still npm's
clean install.

## On demand

**summarize-log.py**: PASS/FAIL, counts and up to 10 failures (file, phone, first error line) for a
Vitest, Playwright, tsc, eslint or vite build log; unknown formats get the newest error-looking lines.
Streams the file (10 MB in well under a second). Exit 0 pass, 1 failures, 2 script error.
- Run: `python3 scripts/summarize-log.py LOG`, npm: `npm run logsum -- LOG`
- Dry run: `npm run logsum -- LOG --dry-run`

**dev-check.sh**: typecheck, lint, unit tests (vitest plus the dup guard); `--build` adds the production
build. 20 minutes in total, one log, exits with the first failing step's status.
- Run: `scripts/dev-check.sh [--build]`, npm: `npm run check`, `npm run check:build`
- Dry run: `npm run check -- --dry-run`

**pw-run.sh**: `npx playwright test` with your arguments on its own free port (never another run's
preview server), 45 minute limit, exits with Playwright's status. Not the full suite: that stays
`.loop-tools/full-suite.sh`.
- Run: `scripts/pw-run.sh tests/x.spec.ts --project="iPhone 15"`, npm: `npm run pw -- tests/x.spec.ts`
- Dry run: `npm run pw -- tests/x.spec.ts --dry-run`

**ci-status.sh**: newest GitHub Actions runs on s4-run and master, and the failed or running job and
step when s4-run is red or busy. Uses `gh run list` and `gh run view --json` only, never `--log` (logs
can print tokens). 60 s budget. `--brief` gives one line per branch.
- Run: `scripts/ci-status.sh`, npm: `npm run ci`
- Dry run: `npm run ci -- --dry-run`

**gmini-status.sh**: read-only look at the Mac mini: branch, sha, dirty files, last commit, the handoff
STATUS line, Claude's usage reading and its age, whether the Claude and watchdog agents are loaded, tmux
sessions, the full-suite lock, free disk and each scheduled job's last heartbeat. Run it at the start of
a session.
- Run: `scripts/gmini-status.sh`, npm: `npm run status`
- Dry run: `npm run status -- --dry-run`

**pre-push.sh**: the push gate: secret scan, typecheck, lint and unit tests (15 minutes), blocks the push
if one fails. No Playwright. Emergency bypass `SKIP_PREPUSH=1 git push ...`, logged to
`~/.config/anygym/prepush.log`. Pushes made by run-overnight.sh, .codex-helper.sh and .grok-helper.sh
pass straight through (logged); they run their own checks.
- Install: `scripts/install-hooks.sh` (npm `npm run tools:hooks`), run by hand: `npm run check:push`
- Dry run: `npm run check:push -- --dry-run`

## Scheduled (launchd, com.anygym.tools.*)

**stall-watch.py** (every 15 min, read only): alerts when the loop should be working but there has been
no commit on s4-run and no loop log growth for 90+ minutes. A paused handoff, an unloaded Claude agent or
a deliberate wait (usage guard, build window) is not a stall. Never restarts anything.
- Run: `npm run tools:stall`. Dry run: `npm run tools:stall -- --dry-run`

**digest.py** (daily 7:00 Guam time): 15 lines on the last 24 h (loop runs, commits, CI, open grok-qa
issues, usage) to `~/.config/anygym/digest/latest.md` plus dated copies (30 kept), sent as a normal note.
- Run: `npm run tools:digest`. Dry run: `npm run tools:digest -- --dry-run`

**usage-log.py** (every 30 min): appends Claude, Codex and Grok usage readings that are already on disk to
`~/.config/anygym/usage.csv`; "unknown" when there is no reading. Alerts when Codex has most of its week
unused with the week resetting within 24 h, and (only if `CODEX_RESET_EXPIRES` is set in local.env) when
a saved reset expires within 24 h.
- Run: `npm run tools:usage`. Dry run: `npm run tools:usage -- --dry-run`

**cleanup.sh** (daily 4:00): rotates `/tmp/anygym-logs`, removes AnyGym test logs in /tmp older than 7
days and Playwright `test-results/` and `playwright-report/` older than 3 days. Nothing else, ever.
- Run: `npm run tools:cleanup`. Dry run first: `npm run tools:cleanup -- --dry-run`

**heartbeat-check.sh** (every 30 min, own 120 s timeout): the dead-man check. Alerts when a job's
heartbeat is older than 3x its interval or its last status is "error".
- Run: `npm run tools:deadman`. Dry run: `npm run tools:deadman -- --dry-run`

Install or remove the jobs (idempotent, touches only com.anygym.tools.*):
- `scripts/install-launchd.sh` (`npm run tools:install`), check with `launchctl list | grep com.anygym.tools`
- `scripts/uninstall-launchd.sh` (`npm run tools:uninstall`): unloads and moves the plists to
  `~/.config/anygym/launchd-removed/`. Both take `--dry-run`.

## scripts/lib

- `common.sh`: shared bash bits (Python choice, timeouts, locks, heartbeats, disk guard, logs, dry run).
- `jobkit.py`: the same for the Python jobs.
- `timeout.py SECONDS cmd...`: hard timeout that kills the whole process group, exit 124.
- `alert.sh KEY KIND "Title" "Body"`: the one alert path (rate limited per key).
- `py.sh SCRIPT`: runs a Python helper with the repo's Python. `pyver.py`: the version check.

## Where things live

- Logs: `/tmp/anygym-logs/<job>/<time>.log` (newest 20 per job plus anything under 7 days, 500 MB cap).
- Heartbeats: `~/.config/anygym/heartbeats/<job>.json` (`time, status, duration_s, summary`).
- Alerts: `~/.config/anygym/alerts.log`, and the phone through the existing push helper
  (`~/bin/anygym-push.sh`, set up by `.anygym-ntfy.sh`); its topic stays in a local file, never here.
- Digest: `~/.config/anygym/digest/`. Usage: `~/.config/anygym/usage.csv`. Locks: `~/.config/anygym/locks/`.
- Machine values: `~/.config/anygym/local.env` (outside the repo, never committed): `LOOP_LOG`,
  `STALL_MINUTES`, `CODEX_UNUSED_PCT`, `CODEX_RESET_EXPIRES`, `ANYGYM_PUSH`.

## Python

Pinned in `.python-version` (Homebrew python3). Every Python helper checks it at startup and exits 2 with
a clear message on an older Python. The helpers use the standard library only (`requirements.txt`). The
voice pack's Kokoro install lives outside the repo (`~/kokoro`); `requirements-voice.txt` pins its
packages. No virtualenv is needed; if `.venv/` exists the scripts use it.

## Rules every script follows

1. `set -euo pipefail` in bash; Python mains catch everything and exit 0 ok, 1 checks failed, 2 error.
2. Hard timeouts on anything that can hang (npm, npx, gh, git, network), 2 retries with backoff on
   network calls.
3. Scheduled jobs take a lock; a held lock means exit 0 quietly; a lock older than twice the job's
   limit is stale, cleared and logged.
4. Heartbeats are written to a temp file and moved into place.
5. Never destructive: no push, reset, clean or checkout of anyone's work, no deletes outside the log
   folder and the job's own files, no killing or restarting Claude, Codex, launch agents or tmux.
6. Logs stay in /tmp (never committed), rotated as above.
7. Under 5 GB free disk, heavy work is skipped with an alert.
8. One alert path, at most once an hour per alert.
9. No personal info, tokens or topics in the repo.
10. launchd agents with the com.anygym.tools prefix, no KeepAlive.
11. Short scripts, a short summary, the log path last.
