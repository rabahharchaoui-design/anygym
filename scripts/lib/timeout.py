#!/usr/bin/env python3
"""Portable hard timeout (macOS has no `timeout`): timeout.py SECONDS cmd [args...]
Runs cmd in its own process group; past SECONDS it kills the whole group (npx, npm and their
children included) and exits 124, like coreutils timeout. Otherwise exits with cmd's own status."""
import os, signal, subprocess, sys

def main() -> int:
    if len(sys.argv) < 3 or not sys.argv[1].replace('.', '', 1).isdigit():
        print('usage: timeout.py SECONDS cmd [args...]', file=sys.stderr)
        return 2
    secs = float(sys.argv[1])
    try:
        p = subprocess.Popen(sys.argv[2:], start_new_session=True)
    except OSError as e:
        print(f'timeout.py: cannot run {sys.argv[2]}: {e}', file=sys.stderr)
        return 127
    try:
        return p.wait(timeout=secs)
    except subprocess.TimeoutExpired:
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.killpg(p.pid, sig)
            except ProcessLookupError:
                break
            try:
                p.wait(timeout=5)
                break
            except subprocess.TimeoutExpired:
                continue
        print(f'timeout.py: gave up after {secs:g} s: {" ".join(sys.argv[2:])[:120]}', file=sys.stderr)
        return 124
    except KeyboardInterrupt:
        os.killpg(p.pid, signal.SIGTERM)
        return 130

if __name__ == '__main__':
    sys.exit(main())
