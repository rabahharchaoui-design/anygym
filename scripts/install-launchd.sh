#!/bin/bash
# install-launchd.sh [--dry-run]: installs the com.anygym.tools.* scheduled jobs from scripts/launchd/
# into ~/Library/LaunchAgents and loads them. Idempotent: an unchanged, loaded job is left alone; a
# changed one is reloaded. Touches only com.anygym.tools.* (never com.gmini.claude, the watchdog or any
# other agent). The digest runs at 7:00 Guam time, converted to this Mac's clock. npm: npm run tools:install
set -euo pipefail
. "$(dirname "$0")/lib/common.sh"
for a in "$@"; do [ "$a" = "--dry-run" ] || { echo "install-launchd.sh: unknown option $a" >&2; exit 2; }; done
LA="$HOME/Library/LaunchAgents"; DOM="gui/$(id -u)"
read -r DH DM < <("$PY" -c 'import datetime
from zoneinfo import ZoneInfo
t = datetime.datetime.now(ZoneInfo("Pacific/Guam")).replace(hour=7, minute=0, second=0, microsecond=0).astimezone()
print(t.hour, t.minute)')
mkdir -p "$LA"
for src in "$SCRIPTS"/launchd/com.anygym.tools.*.plist; do
  label=$(basename "$src" .plist); dst="$LA/$label.plist"; tmp="${TMPDIR:-/tmp}/$label.$$.plist"
  sed -e "s#__REPO__#$REPO#g" -e "s#__PY__#$PY#g" -e "s#__DIGEST_HOUR__#$DH#g" -e "s#__DIGEST_MIN__#$DM#g" "$src" > "$tmp"
  plutil -lint -s "$tmp" || { echo "$label: plist does not lint, skipped" >&2; rm -f "$tmp"; continue; }
  loaded=""; launchctl print "$DOM/$label" >/dev/null 2>&1 && loaded=1
  if [ -f "$dst" ] && cmp -s "$tmp" "$dst" && [ -n "$loaded" ]; then echo "$label: unchanged and loaded"; rm -f "$tmp"; continue; fi
  if [ -n "$DRY" ]; then echo "dry-run: would install $dst$( [ -n "$loaded" ] && echo ' and reload it' || echo ' and load it')"; rm -f "$tmp"; continue; fi
  [ -n "$loaded" ] && launchctl bootout "$DOM/$label" 2>/dev/null || true
  mv "$tmp" "$dst"; mkdir -p "$LOGROOT/${label#com.anygym.tools.}"
  if launchctl bootstrap "$DOM" "$dst" 2>/dev/null; then echo "$label: $( [ -n "$loaded" ] && echo reloaded || echo loaded)"
  else echo "$label: launchctl bootstrap failed (see: launchctl print $DOM/$label)" >&2; fi
done
echo "digest time: 7:00 Guam = $DH:$(printf '%02d' "$DM") on this Mac"
launchctl list | awk '$3 ~ /^com\.anygym\.tools\./' | sed 's/^/  /' || true
