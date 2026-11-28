#!/usr/bin/env python3
"""coord.py init|refresh|day|check [--dry-run]: keeps the coordination parts of ~/anygym-handoff.md.
Never touches what the handoff automation reads (the STATUS first line, everything above the Grok findings
marker) and never edits another agent's lines. It owns only: the "### Daily review" header lines under the
marker (newest first; `day` adds today's, run by digest.py at 7:00) and one block at the very end between
<!-- coord:begin --> and <!-- coord:end --> (tally, Pluto, conflicts, links), rebuilt by `refresh` every
30 minutes (launchd). Daily review blocks over 14 days old move to ~/anygym-coord/findings-archive.md.
`check` proves the pause/resume flow on a temp copy. npm: npm run tools:coord -- refresh"""
import datetime, os, re, shutil, subprocess, sys, tempfile, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
import jobkit, coordkit as ck  # noqa: E402

F = os.environ.get('HANDOFF_FILE') or os.path.join(ck.HOME, 'anygym-handoff.md')
MARK = '## Grok findings (Grok writes below this line'
BEGIN, END = '<!-- coord:begin', '<!-- coord:end -->'
DAILY = re.compile(r'^### Daily review (before )?(\d{4}-\d{2}-\d{2})')

def daily_header(d):
    return ('### Daily review %s (%s): Grok findings from 7:00 AM this day to 7:00 AM the next go directly under this '
            'line, newest first; Claude answers AGREE or WRONG under each one' % (d.isoformat(), d.strftime('%a')))

def block(now, text, notes):
    tally = ck.tally_lines(now)
    old = [l for l in tally if l[:10] < (datetime.date.fromtimestamp(now) - datetime.timedelta(days=ck.KEEP_DAYS)).isoformat()]
    arch = os.path.join(ck.COORD, 'tally-archive.md'); have = open(arch).read() if os.path.exists(arch) else ''
    notes['tally_archive'] = [l for l in old if l[:10] not in have]
    plog = os.path.join(ck.COORD, 'pluto.log'); prev = open(plog).read().splitlines() if os.path.exists(plog) else []
    line = ck.pluto_line(now)
    if not prev or prev[-1].split('Pluto: ', 1)[-1] != line:
        notes['pluto_add'] = '%s Pluto: %s' % (time.strftime('%Y-%m-%d %H:%M', time.localtime(now)), line); prev.append(notes['pluto_add'])
    conf = ck.conflicts(text) or ['none found']
    return ([BEGIN + ': scripts/coord.py rebuilds this block every 30 minutes; write your own lines above it -->',
             '## Daily token tally (newest first, last 14 days; older lines: ~/anygym-coord/tally-archive.md)']
            + [l for l in tally if l not in old]
            + ['', '## Codex pace and jobs (start, end and usage of each job, newest first; Grok checks the pace)'] + ck.codex_lines(now)
            + ['', '## Pluto (read from the art drop; Pluto never edits this file; full log: ~/anygym-coord/pluto.log)']
            + prev[::-1][:ck.KEEP_DAYS]
            + ['', '## Conflicts (two sources disagree; nothing was changed, a person decides)'] + ['- ' + c for c in conf]
            + ['', '## Reference', '- Helper scripts, one line each: ~/anygym-coord/scripts.md',
               '- Gotchas log (newest first): ~/anygym-coord/gotchas.md', '- Who does what: docs/who-does-what.md in the repo',
               '- Release notes: RELEASES.md in the repo', '- Daily reviews over 14 days old: ~/anygym-coord/findings-archive.md', END])

def transform(text, mode, now, notes):
    lines = text.rstrip('\n').split('\n')
    mi = next((i for i, l in enumerate(lines) if l.startswith(MARK)), None)
    if mi is None:
        notes['problem'] = 'no Grok findings marker in the handoff file; left it alone'; return text
    head, body = lines[:mi + 1], lines[mi + 1:]
    b = next((i for i, l in enumerate(body) if l.startswith(BEGIN)), None)
    if b is not None:
        e = next((i for i in range(b, len(body)) if body[i].startswith(END)), None)
        if e is None:
            notes['problem'] = 'coord block has no end marker; left the file alone'; return text
        body = body[:b] + body[e + 1:]
    while body and not body[-1].strip(): body.pop()
    today = datetime.date.fromtimestamp(now)
    hdr = [i for i, l in enumerate(body) if DAILY.match(l)]
    if mode in ('init', 'day') and not hdr and any(l.strip() for l in body):
        body = ['### Daily review before %s: findings written before the daily headers began (kept as they were)' % today, ''] + body
    if mode in ('init', 'day') and not any(DAILY.match(l) and DAILY.match(l).group(2) == today.isoformat() and not DAILY.match(l).group(1) for l in body):
        body = [daily_header(today), ''] + body; notes['header'] = today.isoformat()
    hdr = [i for i, l in enumerate(body) if DAILY.match(l)]
    if hdr and any(l.strip() for l in body[:hdr[0]]):  # someone wrote above the newest header: it is that day's, move the header up
        h = body.pop(hdr[0]); body = [h, ''] + body; notes['moved_header'] = h[:40]
    cutoff = (today - datetime.timedelta(days=ck.KEEP_DAYS)).isoformat(); keep, arch, cur = [], [], None
    for l in body:
        m = DAILY.match(l)
        if m:
            d = m.group(2) if not m.group(1) else (datetime.date.fromisoformat(m.group(2)) - datetime.timedelta(days=1)).isoformat()
            cur = arch if d < cutoff else keep
        (cur if cur is not None else keep).append(l)
    notes['findings_archive'] = arch
    out = head + keep + [''] + block(now, text, notes)
    return '\n'.join(out) + '\n'

def write_cas(path, text, st):
    cur = os.stat(path)
    if (cur.st_mtime_ns, cur.st_size) != (st.st_mtime_ns, st.st_size):
        return False  # someone wrote it meanwhile: read again
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix='.handoff.')
    with os.fdopen(fd, 'w') as f: f.write(text)
    os.chmod(tmp, 0o644); os.replace(tmp, path); return True

def append(path, lines):
    if lines and not jobkit.DRY:
        with open(path, 'a') as f: f.write('\n'.join(lines) + '\n')

def check(job):
    """Proves the automation still reads the file: STATUS first line, marker, and pause then active on a temp copy."""
    text = open(F).read(); res = ['STATUS line: ' + text.split('\n', 1)[0], 'marker present: %s' % (MARK in text), 'coord block present: %s' % (BEGIN in text)]
    hs = os.path.join(jobkit.REPO, '.loop-tools', 'handoff.sh')
    if not os.path.exists(hs):
        return res + ['handoff.sh not found: pause/resume test unknown']
    d = tempfile.mkdtemp(prefix='anygym-coordcheck.'); t = os.path.join(d, 'h.md'); shutil.copy(F, t)
    below = lambda s: s.split(MARK, 1)[1].split('\n', 1)[1] if MARK in s else None
    env = dict(jobkit.ENV, HANDOFF_FILE=t)
    subprocess.run(['/bin/bash', hs, 'pause', 'coord check'], env=env, timeout=30, capture_output=True)
    p = open(t).read()
    res.append('after pause: first line "%s", findings and coord block kept: %s' % (p.split('\n', 1)[0], below(p) == below(text)))
    subprocess.run(['/bin/bash', hs, 'active'], env=env, timeout=30, capture_output=True)
    a = open(t).read()
    res.append('after active: first line "%s", everything else unchanged: %s' % (a.split('\n', 1)[0][:40], a.split('\n', 1)[1] == p.split('\n', 1)[1]))
    shutil.rmtree(d); return res

def main():
    mode = next((a for a in sys.argv[1:] if not a.startswith('--')), '')
    if mode not in ('init', 'refresh', 'day', 'check'):
        print('usage: coord.py init|refresh|day|check [--dry-run]', file=sys.stderr); return 2
    job = jobkit.Job('coord', 60)
    if not os.path.exists(F):
        job.finish('ok', 'no handoff file at %s yet; nothing to do' % F); return 0
    if mode == 'check':
        job.finish('ok', 'check done', check(job)); return 0
    if not jobkit.DRY:
        os.makedirs(ck.COORD, exist_ok=True)
        with open(os.path.join(ck.COORD, 'scripts.md'), 'w') as f:
            f.write('# AnyGym helper scripts (generated by scripts/coord.py from scripts/ and package.json)\n\n' + '\n'.join(ck.script_list()) + '\n')
    for attempt in range(3):
        st = os.stat(F); text = open(F).read(); notes = {}
        new = transform(text, mode, time.time(), notes)
        if jobkit.DRY:
            job.would('rewrite only the coord parts of %s (%d -> %d lines); notes: %s' % (F, text.count('\n'), new.count('\n'), {k: v for k, v in notes.items() if v}))
            print('\n'.join(new.split('\n')[new.split('\n').index(next(l for l in new.split('\n') if l.startswith(BEGIN))):][:24]) if BEGIN in new else '')
            break
        if new == text or write_cas(F, new, st):
            break
        time.sleep(1)
    else:
        job.finish('error', 'handoff kept changing under coord, gave up after 3 tries'); return 1
    append(os.path.join(ck.COORD, 'findings-archive.md'), notes.get('findings_archive'))
    append(os.path.join(ck.COORD, 'tally-archive.md'), notes.get('tally_archive'))
    append(os.path.join(ck.COORD, 'pluto.log'), [notes['pluto_add']] if notes.get('pluto_add') else [])
    job.finish('ok' if 'problem' not in notes else 'error', '%s: %s' % (mode, notes.get('problem') or 'coord parts up to date'),
               ['coord: ' + k + ' ' + str(v)[:100] for k, v in notes.items() if v and k != 'findings_archive'])
    return 0

if __name__ == '__main__':
    jobkit.main_guard(main, 'coord')
