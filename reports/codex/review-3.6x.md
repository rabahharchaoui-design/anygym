STATUS: HANDLED
# Codex review of PLAN 3.6x (read only, Nov 12)
Scope: the file splits, the merged duplicate helpers and the new guards, checked for behavior changes.

- BLOCKER: none. MAJOR: none.
- MINOR, fixed: eslint.config.js boundary rule rejected `import { type X } from '../../db/...'` while allowing `import type { X }`. Both forms are type only and now pass; a value import still fails (checked with scratch files).
