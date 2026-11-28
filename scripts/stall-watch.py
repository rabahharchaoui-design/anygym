#!/usr/bin/env python3
"""stall-watch.py [--dry-run]: every 15 minutes (launchd). Read only. Alerts when the build loop is
supposed to be working but has gone quiet: no commit on s4-run AND no growth of the loop log for 90+
minutes. Not a stall: the Claude launch agent not loaded, the handoff file saying "Claude paused", or the
loop's newest line being a deliberate wait (usage guard, build window, pause file). Never restarts anything.
Also (G, Nov 29), whether Claude is paused or not: Codex idle 60+ minutes while it has allowance left is a
stall too (no codex exec running, no Codex session file written for 60 min, its 5 hour and weekly use under
90%), unless everything is paused (.loop-pause) or backup builds are off. npm: npm run tools:stall"""
import glob, os, re, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
import jobkit  # noqa: E402

WAIT = re.compile(r'waiting|usage guard|holding|paused by|outside the build window|stopped by the usage guard|budget used', re.I)


def last_marker(path, tail=65536):
    """The loop's newest '=== ... ===' line, from the end of the file only."""
    try:
        with open(path, 'rb') as f:
            f.seek(max(0, os.path.getsize(path) - tail)); chunk = f.read().decode('utf-8', 'replace')
    except OSError:
        return ''
    marks = [l.strip() for l in chunk.splitlines() if l.startswith('=== ')]
    return marks[-1][:140] if marks else ''


def codex_idle(job, env, now):
    """Codex idle 60+ min with allowance left -> alert (G, Nov 29). Returns a short status."""
    limit = int(env.get('CODEX_IDLE_MINUTES', '60'))
    rc, out = job.run(['pgrep', '-f', 'codex exec'], 10, local=True)
    if rc == 0 and out.strip():
        return 'working (codex exec running)'
    files = glob.glob(os.path.expanduser('~/.codex/sessions/**/*.jsonl'), recursive=True)
    idle = int((now - max(os.path.getmtime(f) for f in files)) / 60) if files else None
    u = {}
    try:
        u = dict(t.split('=', 1) for t in open(os.path.join(jobkit.REPO, '.codex-usage')).read().split() if '=' in t)
    except OSError:
        pass
    five, week = u.get('five', ''), u.get('week', '')
    room = five.isdigit() and week.isdigit() and int(five) < 90 and int(week) < 90
    held = os.path.exists(os.path.join(jobkit.REPO, '.loop-pause')) or os.path.exists(os.path.join(jobkit.CONF, 'codex-build-off'))
    if idle is None:
        return 'idle time unknown (no Codex session files)'
    if idle >= limit and room and not held:
        last = ''
        try:
            last = open(os.path.join(jobkit.REPO, '.codex-helper.log'), errors='ignore').read().strip().splitlines()[-1][:120]
        except (OSError, IndexError):
            pass
        job.alert('codex-idle', 'stop', 'Codex idle %d min' % idle,
                  'Codex has done nothing for %d min with %s%% of its 5 hours and %s%% of its week used (use or lose). Its last log line: %s. Nothing was restarted; Claude refills its queue.' % (idle, five, week, last))
        return 'IDLE %d min with room (5h %s%%, week %s%%): alerted' % (idle, five, week)
    return 'last active %d min ago (5h %s%%, week %s%%)%s' % (idle, five or '?', week or '?', ', held' if held else '')

def main():
    env = jobkit.local_env()
    job = jobkit.Job('stall-watch', 120)
    limit = int(env.get('STALL_MINUTES', '90'))
    log = env.get('LOOP_LOG') or os.path.join(jobkit.REPO, 'overnight-loop.log')
    now = time.time()
    rc, out = job.run(['git', 'log', '-1', '--format=%ct', 's4-run'], 20, local=True)
    commit_min = int((now - int(out.strip())) / 60) if rc == 0 and out.strip().isdigit() else None
    log_min = int((now - os.path.getmtime(log)) / 60) if os.path.exists(log) else None
    rc, _ = job.run(['launchctl', 'list', 'com.gmini.claude'], 15, local=True)
    loaded = rc == 0
    try:
        status = next((l.strip() for l in open(os.path.expanduser('~/anygym-handoff.md'), errors='ignore') if l.startswith('STATUS')), '')
    except OSError:
        status = ''
    paused = 'paused' in status.lower()
    marker = last_marker(log)
    waiting = bool(WAIT.search(marker))
    ev = ('last s4-run commit %s min ago; loop log grew %s min ago; Claude agent %s; handoff "%s"; newest loop line: %s'
          % (commit_min, log_min, 'loaded' if loaded else 'NOT loaded', status[:40] or 'none', marker or 'none'))
    job.note(ev)
    if not loaded:
        verdict = 'not active: the Claude launch agent is not loaded'
    elif paused:
        verdict = 'not active: handoff says Claude paused'
    elif waiting:
        verdict = 'not active: the loop is waiting on purpose'
    elif commit_min is not None and log_min is not None and commit_min >= limit and log_min >= limit:
        verdict = 'STALL'
        job.alert('stall', 'stop', 'The build loop looks stuck',
                  'No commit and no loop output for %d+ min while it should be working. %s. Nothing was restarted; ask Claude in chat to look.' % (limit, ev))
    else:
        verdict = 'ok: working'
    cx = codex_idle(job, env, now)
    job.finish('ok', verdict + '; ' + cx, ['stall-watch: ' + ev, 'stall-watch: Codex ' + cx])
    return 0


if __name__ == '__main__':
    jobkit.main_guard(main, 'stall-watch')
