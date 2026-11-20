STATUS: NEW
# Codex backup build of PLAN item 4.4e
Branch: codex-build-4.4e-1120-0723 (based on s4-run). Review like any builder output, then merge with: git merge --no-ff --no-edit codex-build-4.4e-1120-0723
Changes:  2 files changed, 162 insertions(+)
Vitest (whole suite in Codex's copy): could not run
Build: build passed
Playwright (whole suite, port 4176, all iPhone profiles): could not run (see /Users/rabah/.config/anygym/codex-pw.txt)

## Codex notes
**4.4e is not complete.** I added diagnostic tests and a baseline report, but did not retain a production fix. An attempted movement-evidence change caused a 10-second freeze in a previously passing walking replay, so I removed it.

Files added:

- [standing-4.4e.test.ts](/Users/rabah/projects/anygym-codex-build/src/lib/gps/__tests__/standing-4.4e.test.ts) documents two unresolved standing defects as expected failures.
- [run-lag-4.4e.md](/Users/rabah/projects/anygym-codex-build/reports/run-lag-4.4e.md) records the simulated baseline, the failed experiment and remaining work.

`npx vitest run` passed: 5,162 passed, 99 expected failures and 2 skipped. `npm run build` passed. Playwright was not run, as requested, and the new Playwright journeys were not written.

The tracking changes and acceptance gates remain unfinished. G’s outdoor export was not present, so the real-phone characterization and the decision on the seven distance cases also remain open. No commit was made.