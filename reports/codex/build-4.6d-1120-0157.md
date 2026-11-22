STATUS: HANDLED merged in H1 (e5882a90) with one test fixed for the 4.4d filter
# Codex backup build of PLAN item 4.6d
Branch: codex-build-4.6d-1120-0157 (based on s4-run). Review like any builder output, then merge with: git merge --no-ff --no-edit codex-build-4.6d-1120-0157
Changes:  8 files changed, 174 insertions(+), 20 deletions(-)
Vitest (whole suite in Codex's copy): could not run
Build: build passed
Playwright (whole suite, port 4176, all iPhone profiles): could not run (see /Users/rabah/.config/anygym/codex-pw.txt)

## Codex notes
Implemented the 4.6d fixes against the engine in this copy:

- The dashed-route caption now explains conditional gap distance, retained moving time, and its exclusion from average pace.
- Recovery matching now compares distinct, sorted primary muscle labels, so a shared drawing alone cannot create a match.
- Added Vitest coverage for label matching, saved workout evidence, the caption, and GPS boundaries, plus phone Playwright specs for the affected screens.

Changed: [muscles.ts](/Users/rabah/projects/anygym-codex-build/src/lib/muscles.ts), [coachData.ts](/Users/rabah/projects/anygym-codex-build/src/db/coachData.ts), [summary.ts](/Users/rabah/projects/anygym-codex-build/src/lib/run/summary.ts), four Vitest files, and [fixes-4.6d.spec.ts](/Users/rabah/projects/anygym-codex-build/tests/fixes-4.6d.spec.ts).

`npx vitest run` passed: 5,102 passed, five expected failures, and one skipped. `npm run build` passed. Playwright was not run, as requested.

**Uncertainty:** PLAN 4.4d remains unchecked in this copy, despite being a stated prerequisite for 4.6d. The caption and tracker tests need rechecking after it lands. SPEC 12.2 says gap time is excluded, while the existing engine retains the first 15 seconds; this change preserves and describes the current behavior. No commit was made.