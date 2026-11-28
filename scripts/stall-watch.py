#!/usr/bin/env python3
"""stall-watch.py [--dry-run]: every 15 minutes (launchd). Read only. Alerts when the build loop is
supposed to be working but has gone quiet: no commit on s4-run AND no growth of the loop log for 90+
minutes. Not a stall: the Claude launch agent not loaded, the handoff file saying "Claude paused", or the
loop's newest line being a deliberate wait (usage guard, build window, pause file). Never restarts anything.
npm: npm run tools:stall"""
import os, re, sys, time
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
    job.finish('ok', verdict, ['stall-watch: ' + ev])
    return 0


if __name__ == '__main__':
    jobkit.main_guard(main, 'stall-watch')
