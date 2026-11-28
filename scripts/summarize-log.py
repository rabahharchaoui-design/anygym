#!/usr/bin/env python3
"""summarize-log.py LOG [--dry-run]: a 5 to 15 line summary of a test or build log, so nobody pages through it.
Knows Vitest, Playwright, tsc, eslint and vite build output (and dev-check's "== step" / "rc=" markers).
Streams the file line by line (a 10 MB log takes about a second). When a log holds several runs it
reports the last one. Exit: 0 pass or nothing failing found, 1 something failed, 2 script error."""
import os, re, sys
from collections import OrderedDict
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
import pyver  # noqa: F401  exits 2 on a Python older than .python-version

ANSI = re.compile(r'\x1b\[[0-9;?]*[A-Za-z]')
PW_FAIL = re.compile(r'^\s+\d+\) \[([^\]]+)\] › (\S+?:\d+):\d+ › (.*)')
PW_X = re.compile(r'^\s*✘\s+\d+ \[([^\]]+)\] › (\S+?:\d+):\d+ › (.*)')
PW_COUNT = re.compile(r'^\s+(\d+) (passed|failed|flaky|skipped|did not run|interrupted)\b')
VT_FILES = re.compile(r'^\s*Test Files\s+(.*)')
VT_TESTS = re.compile(r'^\s*Tests\s+(\d.*)')
VT_FAIL = re.compile(r'^\s*(?:FAIL|×)\s+(\S+\.(?:test|spec)\.[mc]?[jt]sx?)(?:\s*>\s*(.*))?')
TSC = re.compile(r'^(\S+?)\((\d+),\d+\): error (TS\d+): (.*)')
ESL_SUM = re.compile(r'✖ (\d+) problems? \((\d+) errors?, (\d+) warnings?\)')
ESL_ROW = re.compile(r'^\s+(\d+):\d+\s+error\s+(.*)')
STEP = re.compile(r'^== (\S.*)$')
RC = re.compile(r'^rc=(\d+)')
NOISY = re.compile(r'\b(Error|FAIL|FAILED|failed)\b|✘|×')

def scan(path):
    st = {'pw': {}, 'pwf': {}, 'vt': None, 'vtf': {}, 'tsc': {}, 'esl': None, 'eslf': [], 'built': False,
          'builderr': None, 'steps': [], 'noise': OrderedDict(), 'pwrun': 0, 'vtrun': 0, 'lastfail': None, 'eslfile': ''}
    with open(path, 'rb') as fh:
        for raw in fh:
            line = ANSI.sub('', raw.decode('utf-8', 'replace').rstrip('\r\n'))
            if not line.strip(): continue
            if 'Running ' in line and ' using ' in line and ' worker' in line:
                st['pw'], st['pwf'] = {}, {}; st['pwrun'] += 1; continue
            if ' RUN  v' in line:
                st['vt'], st['vtf'] = None, {}; st['vtrun'] += 1; continue
            m = PW_FAIL.match(line) or PW_X.match(line)
            if m:
                key = (m.group(2), m.group(1))
                st['pwf'].setdefault(key, [m.group(3).strip()[:70], '']); st['lastfail'] = key; continue
            if st['lastfail'] and not st['pwf'][st['lastfail']][1] and re.search(r'Error|Timeout|expect\(|exceeded', line):
                st['pwf'][st['lastfail']][1] = line.strip()[:110]; continue
            m = PW_COUNT.match(line)
            if m and ('(' in line or m.group(2) != 'passed' or line.rstrip().endswith('passed')):
                st['pw'][m.group(2)] = int(m.group(1)); st['lastfail'] = None; continue
            m = VT_FILES.match(line)
            if m:
                st['vt'] = {'files': m.group(1).strip()}; continue
            m = VT_TESTS.match(line)
            if m and st['vt'] is not None:
                st['vt']['tests'] = m.group(1).strip(); continue
            m = VT_FAIL.match(line)
            if m:
                st['vtf'].setdefault(m.group(1), (m.group(2) or '').strip()[:80]); continue
            m = TSC.match(line)
            if m:
                st['tsc'].setdefault('%s:%s' % (m.group(1), m.group(2)), '%s %s' % (m.group(3), m.group(4)[:80])); continue
            m = ESL_SUM.search(line)
            if m:
                st['esl'] = (int(m.group(1)), int(m.group(2)), int(m.group(3))); continue
            if line.startswith('/') and not line.startswith('//') and ' ' not in line.strip():
                st['eslfile'] = line.strip(); continue
            m = ESL_ROW.match(line)
            if m and st['eslfile'] and len(st['eslf']) < 50:
                st['eslf'].append('%s:%s %s' % (os.path.basename(st['eslfile']), m.group(1), m.group(2)[:80])); continue
            if re.search(r'✓ built in|built in \d', line):
                st['built'] = True; continue
            if 'error during build' in line or line.startswith('[vite]: Rollup failed'):
                st['builderr'] = line.strip()[:110]; continue
            m = STEP.match(line)
            if m:
                st['steps'].append([m.group(1).strip()[:40], None]); continue
            m = RC.match(line)
            if m and st['steps'] and st['steps'][-1][1] is None:
                st['steps'][-1][1] = int(m.group(1)); continue
            if NOISY.search(line):  # unknown formats: keep the newest unique error-looking lines
                k = re.sub(r'\d+', 'N', line.strip())[:120]; st['noise'].pop(k, None); st['noise'][k] = line.strip()[:120]
                if len(st['noise']) > 60: st['noise'].popitem(last=False)
    return st

def vt_failed(vt):
    m = re.search(r'(\d+) failed', (vt or {}).get('tests', '') + ' ' + (vt or {}).get('files', ''))
    return int(m.group(1)) if m else 0

def report(path, st):
    out, fails, kinds = [], [], []
    if st['steps']:
        kinds.append('steps')
        out.append('Steps: ' + ', '.join('%s %s' % (n, 'ok' if r == 0 else ('rc=%s' % r if r is not None else '?')) for n, r in st['steps']))
    if st['vt']:
        kinds.append('vitest')
        out.append('Vitest: files %s; tests %s' % (st['vt'].get('files', '?'), st['vt'].get('tests', '?')) + (' (last of %d runs)' % st['vtrun'] if st['vtrun'] > 1 else ''))
        fails += ['%s %s' % (f, t) for f, t in st['vtf'].items()]
    if st['pw'] or st['pwf']:
        kinds.append('playwright')
        c = st['pw']
        out.append('Playwright: ' + ', '.join('%d %s' % (c[k], k) for k in ('passed', 'failed', 'flaky', 'skipped', 'did not run', 'interrupted') if k in c)
                   + (' (last of %d runs)' % st['pwrun'] if st['pwrun'] > 1 else ''))
        fails += ['%s [%s] %s | %s' % (f, p, t, e or 'no error line') for (f, p), (t, e) in st['pwf'].items()]
    if st['tsc']: kinds.append('tsc'); out.append('tsc: %d errors' % len(st['tsc'])); fails += ['%s %s' % kv for kv in st['tsc'].items()]
    if st['esl']:
        kinds.append('eslint'); out.append('eslint: %d problems (%d errors, %d warnings)' % st['esl']); fails += st['eslf']
    if st['built'] or st['builderr']:
        kinds.append('build'); out.append('build: ' + (st['builderr'] or 'built'))
    bad = bool(fails) or bool(st['builderr']) or st['pw'].get('failed', 0) > 0 or vt_failed(st['vt']) > 0 \
        or (st['esl'] and st['esl'][1] > 0) or any(r not in (0, None) for _, r in st['steps'])
    if not kinds:
        verdict = 'UNKNOWN format'
        fails = list(st['noise'].values())[::-1]
    else:
        verdict = 'FAIL' if bad else 'PASS'
    print('%s  (%s)' % (verdict, ', '.join(kinds) or 'no known test or build output'))
    for l in out: print('  ' + l)
    if fails:
        print('  %s:' % ('Error-looking lines' if not kinds else 'Failures'))
        for f in fails[:10]: print('    - ' + f[:160])
        if len(fails) > 10:
            print('    ... %d more, see LOG' % (len(fails) - 10) if kinds else '    (newest first; older ones in LOG)')
    print('LOG %s (%.1f KB)' % (path, os.path.getsize(path) / 1024.0))
    return 1 if (kinds and bad) else 0

def main():
    args = [a for a in sys.argv[1:] if a != '--dry-run']
    if len(args) != 1: print('usage: summarize-log.py LOGFILE [--dry-run]', file=sys.stderr); return 2
    if not os.path.isfile(args[0]): print('summarize-log.py: no such file: %s' % args[0], file=sys.stderr); return 2
    if '--dry-run' in sys.argv:
        print('dry-run: would stream %s (%.1f KB) and print a 5 to 15 line summary; reads only' % (args[0], os.path.getsize(args[0]) / 1024.0)); return 0
    return report(args[0], scan(args[0]))

if __name__ == '__main__':
    try: sys.exit(main())
    except KeyboardInterrupt: sys.exit(130)
    except Exception as e:  # never a traceback dump
        print('summarize-log.py: script error: %s: %s' % (type(e).__name__, e), file=sys.stderr); sys.exit(2)
