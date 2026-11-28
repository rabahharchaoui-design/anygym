"""Imported first by every Python helper: exits 2 with a clear message when this Python is older than
the major.minor pinned in .python-version (the scripts are tested on that one)."""
import os, sys

_pin = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.python-version')
try:
    _want = tuple(int(x) for x in open(_pin).read().strip().split('.')[:2])
except (OSError, ValueError):
    _want = (3, 9)
if sys.version_info[:2] < _want:
    sys.stderr.write('%s needs Python %d.%d or newer (pinned in .python-version), this is %s at %s. '
                     'Run it with /opt/homebrew/bin/python3 or bash scripts/lib/py.sh.\n'
                     % (os.path.basename(sys.argv[0] or 'script'), _want[0], _want[1], sys.version.split()[0], sys.executable))
    sys.exit(2)
