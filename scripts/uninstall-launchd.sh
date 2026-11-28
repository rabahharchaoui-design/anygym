#!/bin/bash
# uninstall-launchd.sh [--dry-run]: unloads the com.anygym.tools.* jobs and moves their plists out of
# ~/Library/LaunchAgents to ~/.config/anygym/launchd-removed/ (moved, not deleted). Touches nothing else.
# npm: npm run tools:uninstall
set -euo pipefail
. "$(dirname "$0")/lib/common.sh"
for a in "$@"; do [ "$a" = "--dry-run" ] || { echo "uninstall-launchd.sh: unknown option $a" >&2; exit 2; }; done
LA="$HOME/Library/LaunchAgents"; DOM="gui/$(id -u)"; BK="$ANYGYM_CONF/launchd-removed"; n=0
for dst in "$LA"/com.anygym.tools.*.plist; do [ -f "$dst" ] || continue; label=$(basename "$dst" .plist); n=$((n+1))
  if [ -n "$DRY" ]; then echo "dry-run: would unload $label and move $dst to $BK/"; continue; fi
  launchctl bootout "$DOM/$label" 2>/dev/null || true; mkdir -p "$BK"; mv "$dst" "$BK/"; echo "$label: unloaded, plist moved to $BK/"
done
[ "$n" -eq 0 ] && echo "no com.anygym.tools jobs installed"
echo "left: $(launchctl list | awk '$3 ~ /^com\.anygym\.tools\./{n++} END{print n+0}') com.anygym.tools agents loaded"
