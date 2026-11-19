STATUS: HANDLED discarded: ours is merged; its one real extra (future snapshot time) is in fix item 4.6a
# Codex backup build of PLAN item 4.4c
Branch: codex-build-4.4c-1119-1056 (based on s4-run). Review like any builder output, then merge with: git merge --no-ff --no-edit codex-build-4.4c-1119-1056
Changes:  8 files changed, 150 insertions(+), 14 deletions(-)
Vitest (whole suite in Codex's copy): could not run
Build: build passed
Playwright (whole suite, port 4176, all iPhone profiles): could not run (see /Users/rabah/.config/anygym/codex-pw.txt)

## Codex notes
The checkout already contained most of 4.4c’s fixes. I completed the remaining accounting changes: restored snapshots now reject future timestamps, the initial snapshot captures its timestamp before the queued write, and delayed-fix time stays out of average and split pace. I also clarified the shared dashed-route caption and added save/restore, pace and phone-flow regression coverage.

Changed files:

- [runEngine.ts](/Users/rabah/projects/anygym-codex-build/src/hooks/runEngine.ts), [tracker.ts](/Users/rabah/projects/anygym-codex-build/src/lib/gps/tracker.ts), [snapshot.ts](/Users/rabah/projects/anygym-codex-build/src/lib/run/snapshot.ts), and [summary.ts](/Users/rabah/projects/anygym-codex-build/src/lib/run/summary.ts)
- [runEngine-4.3.test.ts](/Users/rabah/projects/anygym-codex-build/src/hooks/__tests__/runEngine-4.3.test.ts), [fixes-4.4c.test.ts](/Users/rabah/projects/anygym-codex-build/src/lib/run/__tests__/fixes-4.4c.test.ts), and [verify-4.4c.spec.ts](/Users/rabah/projects/anygym-codex-build/tests/verify-4.4c.spec.ts)
- [test-now.md](/Users/rabah/projects/anygym-codex-build/reports/test-now.md)

`npx vitest run` passed: 4,949 passed, 5 expected failures and 1 skipped. `npm run build` passed. Playwright was **not run**, as requested; its new phone flows remain unverified. Physical iPhone haptics and real GPS also need a device check.

One specification conflict remains for the spec owner: SPEC 12.2 says GPS-gap time is excluded, while PLAN 4.4c explicitly retains the first 15 seconds of a moving gap. The implementation retains the planned behavior. The new Playwright coverage does not yet exercise delayed-fix Pause and hold-to-End paths; those paths have existing pure clock coverage but still need the requested browser-level checks. No commit was made.