#!/bin/bash
# alert.sh KEY KIND "Title" "Body" [--dry-run]: one shared alert. KIND is a phone push kind (stop, pause,
# daily; see ~/bin/anygym-push.sh, installed by .anygym-ntfy.sh). The same KEY goes out at most once per
# ALERT_EVERY_S (default an hour). Always logged to ~/.config/anygym/alerts.log; sent to the phone through
# the existing push helper when it exists and ANYGYM_ALERT_DRY is unset. The ntfy topic stays in its own
# local file (~/.config/anygym/ntfy-topic), never in the repo.
set -euo pipefail
. "$(dirname "$0")/common.sh"
[ $# -ge 4 ] || { echo "usage: alert.sh KEY KIND \"Title\" \"Body\" [--dry-run]" >&2; exit 2; }
key=$1 kind=$2 title=$3 body=$4
push="${ANYGYM_PUSH:-$HOME/bin/anygym-push.sh}"
if dry "alert [$kind] $key: $title | $body (log to $ANYGYM_CONF/alerts.log$( [ -x "$push" ] && echo ", push via $push"))"; then exit 0; fi
state="$ANYGYM_CONF/alerts.state"; mkdir -p "$ANYGYM_CONF"; touch "$state"
now=$(date +%s); last=$(awk -v k="$key" '$1==k{t=$2} END{print t+0}' "$state")
if [ $(( now - last )) -lt "${ALERT_EVERY_S:-3600}" ]; then
  echo "$(date '+%F %T') held (same alert within the limit): $key" >> "$ANYGYM_CONF/alerts.log"; echo "alert $key: held (rate limit)"; exit 0
fi
{ awk -v k="$key" '$1!=k' "$state"; echo "$key $now"; } > "$state.tmp" && mv "$state.tmp" "$state"
echo "$(date '+%F %T') [$kind] $key | $title | $body" >> "$ANYGYM_CONF/alerts.log"
sent=""; if [ -z "${ANYGYM_ALERT_DRY:-}" ] && [ -x "$push" ]; then tmo 30 "$push" "$kind" "$title" "$body" >/dev/null 2>&1 && sent=" and sent"; fi
echo "alert $key: logged$sent"
