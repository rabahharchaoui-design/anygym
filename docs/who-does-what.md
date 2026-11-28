# Who does what (lanes)

One line per area of the repo and the build machine: who may change it. When two places disagree about
an owner (this file, PLAN.md, .codex-lane, the handoff), nobody picks silently: the disagreement goes in
the Conflicts section of the handoff and to G.

Agents: **Claude** (lead builder and the only one who merges), **Codex** (builds its lane items),
**Grok** (reviewer and live tester), **Pluto** (art only). **G** owns the product and decides conflicts.

| Area | Who may change it |
|---|---|
| `src/` app code | Claude for its own PLAN items; Codex for its `.codex-lane` items, only on `codex-build-*` branches; Grok only through the fix-ok flow below |
| `tests/` and `src/**/__tests__` | Same owner as the item being built or fixed; nobody weakens another agent's test to make a build pass |
| `scripts/` tooling | Claude (helper scripts are tooling, not PLAN items); the older checks (secret scan, size and dup guards) change only with a test |
| `PLAN.md`, `SPEC.md`, `PROMPT.md` | Claude writes and ticks them, from G's decisions; Codex and Grok never tick items |
| `.codex-lane`, `.loop-tools/codex-fix-queue` | The Codex helper and Claude; an id in `.codex-lane` belongs to Codex until it is merged or handed back |
| `.loop-tools/`, `run-overnight.sh`, `.grok-helper.sh`, `.codex-helper.sh` | Claude only, local to the build machine; changes are tested with `.loop-tools/test-loop.sh` |
| `.github/workflows/` (CI, deploy) | Claude only, with G's yes for anything that changes what deploys |
| Art in `public/badges`, `public/stamps`, `docs/art/` | Claude copies in approved art; Pluto never touches the repo |
| `~/anygym-art-drop/` (outside the repo) | Pluto drops art and an optional one-line `STATUS.txt`; everyone else only reads it |
| `~/anygym-handoff.md` (outside the repo) | Above the Grok findings line: the handoff automation (`.loop-tools/handoff.sh`). Below it: Grok writes findings, Claude answers AGREE or WRONG under each, `scripts/coord.py` owns only the Daily review headers and its block at the end |
| `reports/codex/` | Codex writes its build reports; Claude and Grok add review notes in their own files |
| `reports/grok/`, grok-qa issues | Grok |
| Branches `codex-build-*` | Codex builds there; never merged by Codex |
| Branches `cursor/fix-<issue>` | Grok's Cursor fixes, only for issues G labeled fix-ok; arrive as pull requests that Claude reviews |
| `s4-run` (session branch) | Claude commits and merges reviewed work here; one PLAN item per commit |
| `master` and the live site | Claude only, at the merge gate after the full suite and CI pass; each merge adds a line to `RELEASES.md` in the same commit |
