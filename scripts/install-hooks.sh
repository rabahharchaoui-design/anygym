#!/bin/bash
# install-hooks.sh [--dry-run]: installs the pre-push gate as .git/hooks/pre-push (shared by every
# worktree). Idempotent. Never overwrites a hook it did not write. npm: npm run tools:hooks
set -euo pipefail
. "$(dirname "$0")/lib/common.sh"
H="$(git -C "$REPO" rev-parse --git-common-dir)"; case "$H" in /*) ;; *) H="$REPO/$H";; esac; H="$H/hooks/pre-push"
MARK="# anygym-tools pre-push (scripts/install-hooks.sh)"
BODY="#!/bin/bash
$MARK
# Uses this worktree's scripts/pre-push.sh, or the main checkout's if this branch predates it.
top=\$(git rev-parse --show-toplevel); s=\"\$top/scripts/pre-push.sh\"; [ -f \"\$s\" ] || s=\"$REPO/scripts/pre-push.sh\"
ANYGYM_REPO=\"\$top\" exec /bin/bash \"\$s\" \"\$@\""
if [ -f "$H" ] && ! grep -qF "$MARK" "$H"; then echo "install-hooks: $H exists and is not ours; left alone" >&2; exit 2; fi
if [ -f "$H" ] && [ "$(cat "$H")" = "$BODY" ]; then echo "install-hooks: pre-push already installed ($H)"; exit 0; fi
dry "write $H (pre-push gate -> scripts/pre-push.sh)" && exit 0
mkdir -p "$(dirname "$H")"; printf '%s\n' "$BODY" > "$H.tmp" && chmod +x "$H.tmp" && mv "$H.tmp" "$H"
echo "install-hooks: pre-push installed at $H"
