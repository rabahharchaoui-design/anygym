#!/usr/bin/env python3
"""digest.py [--dry-run]: daily at 7:00 Guam time (launchd). A 15 line overnight digest from the loop log
(streamed, last 24 h only), the last day's commits, CI (ci-status.sh --brief) and the open grok-qa issue
count. Writes ~/.config/anygym/digest/latest.md plus a dated copy (keeps 30) and sends it as a normal
note through scripts/lib/alert.sh, and adds today's Daily review header to the handoff (coord.py day). npm: npm run tools:digest"""
import glob, os, re, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
import jobkit  # noqa: E402

MARK = re.compile(r'^=== (.*?) ((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} +\d+ \d\d:\d\d:\d\d) \S+ (\d{4}) ===\s*$')


def loop_day(path, since):
    """Counts from the loop log's '=== ... date ===' lines newer than `since`, streamed."""
    c = {'runs': 0, 'mins': 0, 'pushes': 0, 'guard': 0, 'failed': 0, 'last': ''}
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        for raw in f:
            if not raw.startswith(b'=== '):
                continue
            m = MARK.match(raw.decode('utf-8', 'replace'))
            if not m:
                continue
            try:
                t = time.mktime(time.strptime(re.sub(' +', ' ', m.group(2)) + ' ' + m.group(3), '%a %b %d %H:%M:%S %Y'))
            except ValueError:
                continue
            if t < since:
                continue
            msg = m.group(1); c['last'] = msg[:90]
            if re.match(r'run \d+ \(up to', msg): c['runs'] += 1
            e = re.match(r'run \d+ ended after (\d+) min', msg)
            if e: c['mins'] += int(e.group(1))
            if msg.startswith('pushed '): c['pushes'] += 1
            if 'usage guard' in msg or 'usage limit' in msg: c['guard'] += 1
            if 'failed' in msg or 'stuck' in msg: c['failed'] += 1
    return c


def main():
    job = jobkit.Job('digest', 300)
    now = time.time(); day = time.strftime('%Y-%m-%d')
    lines = ['AnyGym overnight digest, %s (last 24 h)' % time.strftime('%a %b %d %H:%M')]
    c = loop_day(os.path.join(jobkit.REPO, 'overnight-loop.log'), now - 86400)
    lines.append('Loop: unknown (no overnight-loop.log)' if c is None else
                 'Loop: %d runs, %d min of work, %d pushes, %d usage-guard stops, %d failures' % (c['runs'], c['mins'], c['pushes'], c['guard'], c['failed']))
    if c and c['last']:
        lines.append('Loop now: ' + c['last'])
    for br in ('s4-run', 'master'):
        rc, out = job.run(['git', 'log', br, '--since=24 hours ago', '--format=%h %s'], 20, local=True)
        subs = [l[:78] for l in out.splitlines() if l.strip()] if rc == 0 else []
        lines.append('%s: %s' % (br, ('%d commits' % len(subs)) if rc == 0 else 'unknown'))
        lines += ['  ' + s for s in subs[:3 if br == 's4-run' else 2]]
    rc, out = job.run(['/bin/bash', os.path.join(jobkit.SCRIPTS, 'ci-status.sh'), '--brief'], 70)
    ci = [l.strip() for l in out.splitlines() if l.strip() and not l.startswith('LOG ')]
    lines += ['CI ' + l[:90] for l in ci[:2]] or ['CI: unknown']
    rc, out = job.run(['gh', 'issue', 'list', '--label', 'grok-qa', '--state', 'open', '--limit', '200', '--json', 'number', '--jq', 'length'], 30, retries=2)
    lines.append('Open grok-qa issues: %s' % (out.strip() if rc == 0 and out.strip().isdigit() else 'unknown'))
    csv = os.path.join(jobkit.CONF, 'usage.csv')
    if os.path.exists(csv):
        last = open(csv).read().strip().splitlines()[-1].split(',')
        if len(last) >= 9:
            lines.append('Usage: Claude 5h %s%% week %s%%, Codex 5h %s%% week %s%%, Grok pool %s%%' % (last[1], last[2], last[4], last[5], last[8]))
    lines = lines[:15]
    d = os.path.join(jobkit.CONF, 'digest')
    if jobkit.DRY:
        job.would('write %s/latest.md and %s/%s.md (keep the newest 30 dated copies)' % (d, d, day))
    else:
        os.makedirs(d, exist_ok=True)
        for name in ('latest.md', day + '.md'):
            tmp = os.path.join(d, '.' + name + '.tmp')
            with open(tmp, 'w') as f:
                f.write('\n'.join(lines) + '\n')
            os.replace(tmp, os.path.join(d, name))
        dated = sorted(glob.glob(os.path.join(d, '20[0-9][0-9]-[0-1][0-9]-[0-3][0-9].md')))
        for old in dated[:-30]:
            os.remove(old); job.note('removed old digest ' + old)  # the job's own output, keep 30
    rc, out = job.run([sys.executable, os.path.join(jobkit.SCRIPTS, 'coord.py'), 'day'] + (['--dry-run'] if jobkit.DRY else []), 60, local=True)
    job.note('coord day rc=%s %s' % (rc, out.strip().splitlines()[-2:] if out.strip() else ''))  # today's Daily review header in the handoff
    job.alert('digest-' + day, 'daily', 'Overnight digest', '\n'.join(lines[1:10]), 86400)
    job.finish('ok', 'digest written, %d lines' % len(lines), lines)
    return 0


if __name__ == '__main__':
    jobkit.main_guard(main, 'digest')
