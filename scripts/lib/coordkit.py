"""Pieces for scripts/coord.py: the daily token tally, the Pluto status line, the conflicts check and
the helper-script list. Reads local files only; never probes a bot, never edits another agent's lines."""
import glob, json, os, re, subprocess, time
import jobkit

HOME = os.path.expanduser('~')
COORD = os.environ.get('ANYGYM_COORD') or os.path.join(HOME, 'anygym-coord')
ART = os.environ.get('ANYGYM_ART_DROP') or os.path.join(HOME, 'anygym-art-drop')
KEEP_DAYS = 14

def kv(path):
    try:
        return dict(t.split('=', 1) for t in open(path, errors='ignore').read().split() if '=' in t)
    except OSError:
        return {}

def tally_lines(now):
    """'YYYY-MM-DD Claude 5h/week % | Codex week % | Grok Bot ... | Pluto n/a', newest first, from usage.csv
    plus the current .usage-tap / .codex-usage reading for today. Unknown stays unknown."""
    days = {}
    def add(day, c5, cw, xw, gp, gage):
        d = days.setdefault(day, {'c5': [], 'cw': None, 'xw': None, 'gp': None, 'gage': None})
        if c5.isdigit(): d['c5'].append(int(c5))
        if cw.isdigit(): d['cw'] = cw
        if xw.isdigit(): d['xw'] = xw
        if gp.replace('.', '', 1).isdigit(): d['gp'], d['gage'] = gp, gage
    csv = os.path.join(jobkit.CONF, 'usage.csv')
    if os.path.exists(csv):
        for row in open(csv, errors='ignore').read().splitlines()[1:]:
            r = row.split(',')
            if len(r) >= 10: add(r[0][:10], r[1], r[2], r[5], r[8], r[9])
    tap, cx = kv(os.path.join(jobkit.REPO, '.usage-tap')), kv(os.path.join(jobkit.REPO, '.codex-usage'))
    gk = kv(os.path.join(jobkit.CONF, 'grok-state'))
    gage = str(int((now - float(gk['grok_pool_at'])) / 60)) if gk.get('grok_pool_at', '').isdigit() else 'unknown'
    add(time.strftime('%Y-%m-%d', time.localtime(now)), tap.get('five', ''), tap.get('week', ''), cx.get('week', ''), gk.get('grok_pool', ''), gage)
    out = []
    for day in sorted(days, reverse=True):
        d = days[day]
        c = '%s/%s %%' % (max(d['c5']) if d['c5'] else 'unknown', d['cw'] or 'unknown')
        g = 'n/a' if d['gp'] is None else 'pool %s %%%s' % (d['gp'], ' (reading %s h old)' % (int(d['gage']) // 60) if d['gage'].isdigit() and int(d['gage']) > 120 else '')
        out.append('%s Claude %s | Codex week %s | Grok Bot %s | Pluto n/a' % (day, c, (d['xw'] + ' %') if d['xw'] else 'unknown', g))
    return out

def pluto_line(now):
    """Pluto's own one-line STATUS.txt in the art drop if it left one, else the newest drop folder."""
    st = os.path.join(ART, 'STATUS.txt')
    if os.path.isfile(st):
        first = next((l.strip() for l in open(st, errors='ignore') if l.strip()), '')
        return 'STATUS.txt (%s): %s' % (time.strftime('%b %d %H:%M', time.localtime(os.path.getmtime(st))), first[:120] or 'empty')
    ents = [e for e in glob.glob(os.path.join(ART, '*')) if os.path.basename(e) != 'STATUS.txt']
    if not ents:
        return 'no STATUS.txt and nothing in the art drop' if os.path.isdir(ART) else 'art drop folder not found'
    e = max(ents, key=os.path.getmtime)
    return 'no STATUS.txt; newest drop %s%s (%s), %d items in the drop' % (os.path.basename(e), '/' if os.path.isdir(e) else '',
                                                                          time.strftime('%b %d %H:%M', time.localtime(os.path.getmtime(e))), len(ents))

def conflicts(handoff_text):
    """Places where two sources disagree. Listed for a person to decide; nothing is changed."""
    R, out = jobkit.REPO, []
    lane = [l.strip() for l in open(os.path.join(R, '.codex-lane'), errors='ignore') if l.strip()] if os.path.exists(os.path.join(R, '.codex-lane')) else []
    plan = open(os.path.join(R, 'PLAN.md'), errors='ignore').read() if os.path.exists(os.path.join(R, 'PLAN.md')) else ''
    ticked = set(re.findall(r'^- \[x\] (\S+)', plan, re.M)); open_ids = set(re.findall(r'^- \[ \] (\S+)', plan, re.M))
    for i in lane:
        if i in ticked: out.append('.codex-lane lists %s, but PLAN.md has it ticked done' % i)
        elif i not in open_ids: out.append('.codex-lane lists %s, but PLAN.md has no open item with that id' % i)
        fails = [f for f in glob.glob(os.path.join(R, 'reports/codex/build-%s-[0-9]*.md' % i))
                 if re.match(r'STATUS: (FAILED|EMPTY|STALE)', open(f, errors='ignore').readline())]
        if len(fails) >= 2 and i not in ticked:
            out.append('%s: Codex has %d failed builds (it is tried out), yet .codex-lane still gives it to Codex; who owns it now is not written down' % (i, len(fails)))
    m = re.search(r'Codex lane \(Codex owns these\): (.*)', handoff_text)
    if m and m.group(1).split() != lane:
        out.append('handoff "In flight" lists the Codex lane as "%s", .codex-lane now says "%s"' % (m.group(1).strip()[:80], ' '.join(lane)[:80]))
    for f in glob.glob(os.path.join(R, 'reports/codex/build-*.md')):
        first = open(f, errors='ignore').readline()
        if first.startswith(('STATUS: BUILDING', 'STATUS: TESTING')) and time.time() - os.path.getmtime(f) > 6 * 3600:
            out.append('%s says %s but has not changed for %d h' % (os.path.basename(f), first.strip()[:30], (time.time() - os.path.getmtime(f)) // 3600))
    rel = open(os.path.join(R, 'RELEASES.md'), errors='ignore').read() if os.path.exists(os.path.join(R, 'RELEASES.md')) else ''
    try:
        log = subprocess.run(['git', 'log', 'master', '--first-parent', '--since=7 days ago', '--format=%h %s'], cwd=R, capture_output=True, text=True, timeout=20).stdout
    except Exception:
        log = ''
    for l in log.splitlines():
        h, _, s = l.partition(' ')
        if s.startswith('Checkpoint') and h not in rel:
            out.append('master %s ("%s") went live but RELEASES.md has no line for it' % (h, s[:60]))
    manual = os.path.join(COORD, 'conflicts-manual.md')
    if os.path.exists(manual):
        out += [l[2:].strip() for l in open(manual, errors='ignore') if l.startswith('- ')]
    return out

def script_list():
    """One line per script in scripts/ and scripts/lib/: path, how to run it, npm name, whether it alerts."""
    R = jobkit.REPO
    try:
        npm = json.load(open(os.path.join(R, 'package.json')))['scripts']
    except (OSError, ValueError, KeyError):
        npm = {}
    lines = []
    for p in sorted(glob.glob(os.path.join(R, 'scripts', '*.*')) + glob.glob(os.path.join(R, 'scripts', 'lib', '*.*'))):
        rel = os.path.relpath(p, R)
        if not re.search(r'\.(sh|py|mjs|mts|ts|js)$', rel) or '__tests__' in rel:
            continue
        txt = open(p, errors='ignore').read()
        names = [k for k, v in npm.items() if rel in v.split()]
        run = {'.sh': 'bash ', '.py': 'python3 ', '.mjs': 'node ', '.js': 'node ', '.ts': 'node ', '.mts': 'node '}[os.path.splitext(rel)[1]] + rel
        if rel.endswith('lib/alert.sh'): al = 'the one alert path: log plus phone push (config key ntfy-topic, via the push helper)'
        elif rel.endswith('lib/jobkit.py'): al = 'alert path for the Python jobs (calls lib/alert.sh)'
        elif (rel.endswith('.sh') and 'alert.sh' in txt) or ('job' + '.alert(') in txt: al = 'alerts: log plus phone push (config key ntfy-topic)'
        else: al = 'no alerts'
        lines.append('- `%s`: `%s`%s; %s' % (rel, run, (', npm `npm run %s`' % ', '.join(names)) if names else '', al))
    return lines

def codex_lines(now):
    """Codex pace and the job log for the handoff (G, Nov 29), newest first."""
    env = jobkit.local_env()
    cx = kv(os.path.join(jobkit.REPO, '.codex-usage'))
    reset = None
    try:
        reset = time.mktime(time.strptime(env.get('CODEX_RESET_EXPIRES', ''), '%Y-%m-%dT%H:%M'))
    except ValueError:
        pass
    st, exp, tgt = jobkit.codex_pace(env, now, cx.get('week', ''), reset)
    out = ['Codex pace: %s (week %s%%, plan %s%% by now, %s)' % (st, cx.get('week', '?'), exp if exp is not None else '?', tgt),
           'Codex week resets %s; saved resets (G taps them): %s' % (env.get('CODEX_RESET_EXPIRES', 'unknown'), env.get('CODEX_SAVED_RESETS', 'unknown'))]
    jl = os.path.join(jobkit.CONF, 'codex-jobs.log')
    rows = open(jl, errors='ignore').read().strip().splitlines()[-10:] if os.path.exists(jl) else []
    out += ['- ' + r for r in rows[::-1]] or ['- no Codex jobs logged yet']
    cl = os.path.join(jobkit.REPO, '.claude-lane')
    if os.path.exists(cl):
        out.append('Moved to Claude: ' + '; '.join(l.strip() for l in open(cl, errors='ignore') if l.strip()))
    return out
