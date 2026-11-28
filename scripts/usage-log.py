#!/usr/bin/env python3
"""usage-log.py [--dry-run]: every 30 minutes (launchd). Appends one row to ~/.config/anygym/usage.csv:
Claude 5h% / week% from .usage-tap, Codex 5h% / week% and its weekly reset from the local Codex session
files, the Grok pool from the Grok helper's state. Reads local files only: no logins, no paid calls.
Anything it cannot read is written as "unknown", never guessed. Alerts (rate limited, once a day each):
Codex with lots of its week unused and the week resetting within 24 h, and a saved ChatGPT reset expiring
within 24 h when CODEX_RESET_EXPIRES (dates, in ~/.config/anygym/local.env) is set. npm: npm run tools:usage"""
import glob, json, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
import jobkit  # noqa: E402

COLS = 'time,claude_5h,claude_week,claude_age_min,codex_5h,codex_week,codex_age_min,codex_week_resets,grok_pool,grok_age_min'

def kv(path, sep):
    out = {}
    try:
        for tok in open(path, errors='ignore').read().replace('\n', ' ').split():
            if sep in tok:
                k, v = tok.split(sep, 1); out[k] = v
    except OSError:
        pass
    return out

def codex_reset():
    """The newest secondary (weekly) window reset time in the local Codex session files, or None."""
    best = None
    files = sorted(glob.glob(os.path.expanduser('~/.codex/sessions/**/*.jsonl'), recursive=True), key=os.path.getmtime)[-3:]
    for fn in files:
        seen = os.path.getmtime(fn)
        for line in open(fn, errors='ignore'):
            if '"secondary"' not in line:
                continue
            try:
                w = json.loads(line)
                stack = [w]
                while stack:
                    o = stack.pop()
                    if isinstance(o, dict):
                        if isinstance(o.get('rate_limits'), dict):
                            s = o['rate_limits'].get('secondary') or {}
                            ra = s.get('resets_at') or (seen + s['resets_in_seconds'] if s.get('resets_in_seconds') is not None else None)
                            if ra: best = float(ra)
                        stack.extend(o.values())
                    elif isinstance(o, list):
                        stack.extend(o)
            except (ValueError, KeyError, TypeError):
                continue
    return best

def main():
    env, now = jobkit.local_env(), time.time()
    job = jobkit.Job('usage-log', 60)
    u = lambda d, k: d.get(k) if d.get(k, '') != '' else 'unknown'
    age = lambda t: str(int((now - float(t)) / 60)) if str(t).replace('.', '', 1).isdigit() else 'unknown'
    tap = kv(os.path.join(jobkit.REPO, '.usage-tap'), '=')
    cx = kv(os.path.join(jobkit.REPO, '.codex-usage'), '=')
    gk = kv(os.path.join(jobkit.CONF, 'grok-state'), '=')
    reset = codex_reset()
    row = [time.strftime('%Y-%m-%dT%H:%M:%S%z'), u(tap, 'five'), u(tap, 'week'), age(tap.get('ts', '')),
           u(cx, 'five'), u(cx, 'week'), age(cx.get('at', '')),
           time.strftime('%Y-%m-%dT%H:%M', time.localtime(reset)) if reset and reset > now else 'unknown',
           u(gk, 'grok_pool'), age(gk.get('grok_pool_at', ''))]
    csv = os.path.join(jobkit.CONF, 'usage.csv')
    if jobkit.DRY:
        job.would('append to %s: %s' % (csv, ','.join(row)))
    else:
        new = not os.path.exists(csv)
        with open(csv, 'a') as f:
            f.write((COLS + '\n' if new else '') + ','.join(row) + '\n')
    notes = []
    wk = cx.get('week', '')
    if reset and wk.isdigit() and 0 < reset - now <= 86400 and int(wk) < int(env.get('CODEX_UNUSED_PCT', '60')):
        h = int((reset - now) / 3600); notes.append('Codex %s%% of its week used, resets in %d h' % (wk, h))
        job.alert('codex-unused-' + time.strftime('%Y%m%d', time.localtime(reset)), 'pause', 'Codex has unused allowance',
                  'Codex has used %s%% of its week and it resets in about %d h. Queue Codex work so it is not lost.' % (wk, h), 86400)
    for d in env.get('CODEX_RESET_EXPIRES', '').replace(',', ' ').split():
        try:
            exp = time.mktime(time.strptime(d, '%Y-%m-%d'))
        except ValueError:
            notes.append('bad CODEX_RESET_EXPIRES date %s' % d); continue
        if 0 < exp - now <= 86400:
            notes.append('saved reset expires %s' % d)
            job.alert('codex-reset-' + d, 'stop', 'A Codex reset expires tomorrow',
                      'A saved ChatGPT full reset expires %s, use or lose. Open the ChatGPT app, Usage and limits, and tap it.' % d, 86400)
    if not env.get('CODEX_RESET_EXPIRES'):
        notes.append('saved reset expiry dates unknown (CODEX_RESET_EXPIRES not set)')
    job.finish('ok', 'claude %s/%s%%, codex %s/%s%%, grok pool %s%%' % (row[1], row[2], row[4], row[5], row[8]),
               ['usage-log: ' + ','.join(row)] + ['usage-log: ' + n for n in notes])
    return 0

if __name__ == '__main__':
    jobkit.main_guard(main, 'usage-log')
