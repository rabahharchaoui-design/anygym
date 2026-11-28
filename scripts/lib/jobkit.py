"""Shared bits for the Python scheduled jobs (stall-watch, digest, usage-log). Same rules as common.sh:
mkdir lock under ~/.config/anygym/locks (held: exit 0 quietly; older than 2x max runtime: stale, cleared,
logged), an atomic heartbeat, a log under /tmp/anygym-logs/<job>/, hard timeouts on every command, and
alerts through scripts/lib/alert.sh. Never restarts, kills or pushes anything.
--dry-run: no lock, log file, heartbeat, alert or write; local read-only reads (git log, files,
launchctl list) still run so the output is real, network and heavy commands are only printed."""
import json, os, shutil, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pyver  # noqa: F401  exits 2 on a Python older than .python-version

DRY = '--dry-run' in sys.argv

CONF = os.path.expanduser(os.environ.get('ANYGYM_CONF', '~/.config/anygym'))
SCRIPTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.environ.get('ANYGYM_REPO') or os.path.dirname(SCRIPTS)
LOGROOT = os.environ.get('ANYGYM_LOGROOT', '/tmp/anygym-logs')
ENV = dict(os.environ, PATH='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:' + os.environ.get('PATH', ''))

def local_env():
    """KEY=value pairs from ~/.config/anygym/local.env (machine values, never in the repo)."""
    out, p = {}, os.path.join(CONF, 'local.env')
    if os.path.isfile(p):
        for line in open(p, errors='ignore'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1); out[k.strip()] = v.strip().strip('"').strip("'")
    return out

class Job:
    def __init__(self, name, max_s):
        self.name, self.max_s, self.t0 = name, max_s, time.time()
        if DRY:
            self.log_path, self.log, self.lock = '(dry-run: no log)', open(os.devnull, 'w'), None
            return
        os.makedirs(os.path.join(CONF, 'locks'), exist_ok=True)
        self.lock = os.path.join(CONF, 'locks', name + '.lock')
        try: os.mkdir(self.lock)
        except FileExistsError:
            age = time.time() - os.path.getmtime(self.lock)
            if age <= 2 * max_s:
                sys.exit(0)  # another run holds it: quiet
            with open(os.path.join(CONF, 'locks', 'stale.log'), 'a') as f:
                f.write('%s %s: stale lock (%d s old) cleared\n' % (time.strftime('%F %T'), name, age))
            os.rmdir(self.lock); os.mkdir(self.lock)
        d = os.path.join(LOGROOT, name); os.makedirs(d, exist_ok=True)
        self.log_path = os.path.join(d, time.strftime('%Y%m%d-%H%M%S') + '.log')
        self.log = open(self.log_path, 'a')

    def note(self, msg):  # one line in the job's own log
        self.log.write('%s %s\n' % (time.strftime('%F %T'), msg)); self.log.flush()

    def would(self, what):
        print('dry-run: would ' + what)

    def run(self, cmd, timeout, cwd=None, retries=0, local=False):
        """(rc, output) with a hard timeout; network commands get retries with backoff (2 s, 4 s).
        local=True marks a read-only local command that still runs under --dry-run."""
        if DRY and not local:
            self.would('run (timeout %ss): %s' % (timeout, ' '.join(cmd))); return 0, ''
        for i in range(retries + 1):
            try:
                p = subprocess.run(cmd, cwd=cwd or REPO, env=ENV, capture_output=True, text=True, timeout=timeout)
                rc, out = p.returncode, (p.stdout or '') + (p.stderr or '')
            except subprocess.TimeoutExpired:
                rc, out = 124, 'timed out after %s s' % timeout
            except OSError as e:
                rc, out = 127, str(e)
            self.note('$ %s -> rc=%s' % (' '.join(cmd)[:160], rc))
            if rc == 0 or i == retries:
                return rc, out
            time.sleep(2 * (i + 1))

    def alert(self, key, kind, title, body, every_s=3600):
        if DRY:
            self.would('alert [%s] %s (at most once per %d s): %s | %s' % (kind, key, every_s, title, body)); return
        env = dict(ENV, ALERT_EVERY_S=str(every_s))
        try:
            p = subprocess.run(['/bin/bash', os.path.join(SCRIPTS, 'lib', 'alert.sh'), key, kind, title, body],
                               env=env, capture_output=True, text=True, timeout=60)
            self.note('alert %s rc=%s %s' % (key, p.returncode, p.stdout.strip()))
        except Exception as e:
            self.note('alert %s failed: %s' % (key, e))

    def disk_ok(self, gb=5):
        return shutil.disk_usage('/').free >= gb * 1024 ** 3

    def finish(self, status, summary, lines=()):
        for l in lines: print(l)
        if DRY:
            self.would('write heartbeat %s/heartbeats/%s.json: status=%s, %s' % (CONF, self.name, status, summary)); return
        dur = beat(self.name, status, summary, self.t0)
        print('%s: %s (%s, %d s)' % (self.name, summary, status, dur))
        print('LOG ' + self.log_path)
        self.log.write('%s %s %s\n' % (time.strftime('%F %T'), status, summary)); self.log.close()
        unlock(self.name)

def beat(name, status, summary, t0):
    """Atomic heartbeat: temp file, then rename. Returns the run's duration in seconds."""
    d = os.path.join(CONF, 'heartbeats'); os.makedirs(d, exist_ok=True)
    hb = {'time': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'epoch': int(time.time()), 'status': status,
          'duration_s': int(time.time() - t0), 'summary': summary[:300]}
    tmp = os.path.join(d, '.%s.tmp' % name)
    with open(tmp, 'w') as f:
        json.dump(hb, f)
    os.replace(tmp, os.path.join(d, name + '.json'))
    return hb['duration_s']

def unlock(name):
    try: os.rmdir(os.path.join(CONF, 'locks', name + '.lock'))
    except OSError: pass

def main_guard(fn, job_name):
    """Exit 0 ok, 1 checks failed, 2 script error; never a traceback dump. An error leaves an error heartbeat."""
    t0 = time.time()
    try:
        sys.exit(fn() or 0)
    except SystemExit:
        raise
    except Exception as e:
        print('%s: script error: %s: %s' % (job_name, type(e).__name__, e), file=sys.stderr)
        if not DRY:
            try:
                beat(job_name, 'error', '%s: %s' % (type(e).__name__, e), t0); unlock(job_name)
            except Exception:
                pass
        sys.exit(2)
