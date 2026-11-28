#!/bin/bash
# py.sh SCRIPT [args]: run a repo Python script with the repo's Python (.venv, else Homebrew python3).
set -euo pipefail
. "$(dirname "$0")/common.sh"
[ $# -ge 1 ] || { echo "usage: py.sh SCRIPT [args]" >&2; exit 2; }
exec "$PY" "$@"
