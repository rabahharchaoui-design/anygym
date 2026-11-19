STATUS: HANDLED discarded: ours is built; its one extra case (flush after the clock auto-stopped) is ported into our 4.6b
# Codex backup build of PLAN item 4.6b
Branch: codex-build-4.6b-1119-1817 (based on s4-run). Review like any builder output, then merge with: git merge --no-ff --no-edit codex-build-4.6b-1119-1817
Changes:  13 files changed, 258 insertions(+), 25 deletions(-)
Vitest (whole suite in Codex's copy): could not run
Build: build passed
Playwright (whole suite, port 4176, all iPhone profiles): could not run (see /Users/rabah/.config/anygym/codex-pw.txt)

## Codex notes
Implemented PLAN 4.6b in this repo. Eligible withheld walking distance is now included when pausing, ending, restoring a run, or processing a GPS gap. Credited endpoints are retained in the route, gap bridges remain separate, and GPX filenames include local start seconds.

Changed files:

- GPS tracking and batch processing: [tracker.ts](/Users/rabah/projects/anygym-codex-build/src/lib/gps/tracker.ts), [batch.ts](/Users/rabah/projects/anygym-codex-build/src/lib/gps/batch.ts)
- Run finalization, restore, and export: [live.ts](/Users/rabah/projects/anygym-codex-build/src/lib/run/live.ts), [snapshot.ts](/Users/rabah/projects/anygym-codex-build/src/lib/run/snapshot.ts), [summary.ts](/Users/rabah/projects/anygym-codex-build/src/lib/run/summary.ts), [gpx.ts](/Users/rabah/projects/anygym-codex-build/src/lib/run/gpx.ts)
- Added GPS and run regression tests, updated existing property and filename tests, and added [verify-4.6b.spec.ts](/Users/rabah/projects/anygym-codex-build/tests/verify-4.6b.spec.ts) plus the existing Playwright filename expectation.

**Verification:** `npx vitest run` passed with 5,064 tests passed, five expected failures, and one skipped. `npm run build` passed, including the secret scan and size guard. Playwright was not run, as requested; the new browser spec remains for the helper to verify.

The tracker cannot perfectly distinguish slow movement from stationary GPS wander using its existing state. The flush uses a conservative accuracy-based threshold, so some short walking legs may remain uncredited and sufficiently large stationary drift could still be mistaken for movement. A flush that crosses a split also cannot reconstruct exactly how the already-recorded time was distributed across that boundary.