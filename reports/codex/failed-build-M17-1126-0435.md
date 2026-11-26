STATUS: FAILED (not handed over: its full suite does not pass after the fix round)
# Codex backup build of PLAN item M17
Branch: codex-build-M17-1126-0435 (based on s4-run). Review like any builder output, then merge with: git merge --no-ff --no-edit codex-build-M17-1126-0435
Changes:  4 files changed, 24 insertions(+), 9 deletions(-)
Vitest (whole suite in Codex's copy): Test Files  400 passed | 1 skipped (401);Tests  5269 passed | 97 expected fail | 2 skipped (5368);
Build: build passed
Playwright (whole suite, port 4176, every phone): Playwright: 5979 tests: 31 failed, 493 skipped, 5455 passed (1.1h) (64 min) Rerun of the 31 failed: 13 passed on a second try (flaky), 18 fail again Of the 18: 14 fail the same way before this change (codex-build-M17-1126-0435^ at db0e6a61), 4 are NEW Of the 4 new: 3 also fail at least once in 5 runs before this change (flaky there too), 1 are NEW for real RESULT: FAIL (1 new Playwright failures) 
Tests: FAIL (1 new Playwright failures)
New failures:
  Small Android|tests/verify-4.4a.spec.ts|4.4a the countdown › 3, 2, 1, GO: giant white numbers, never clipped, also at 130% text; then the live run @matrix
Finished Nov 26 06:26, 87 min in all

## Codex notes
**M17 is not complete.** The exercise screen, exercise info, Today redesign, and day-list progress indicators remain unfinished. I need a decision on the conflicting requirements before completing them: [SPEC 4.4 and 20.1–20.2](/Users/rabah/projects/anygym-codex-build/SPEC.md:64) require the photo hero, set table, and progress rings, while [M17](/Users/rabah/projects/anygym-codex-build/PLAN.md:69) says to replace them. The repository rules say SPEC wins.

The partial changes left in the workspace are:

- [DayList.tsx](/Users/rabah/projects/anygym-codex-build/src/screens/workout/DayList.tsx) and [DayList.module.css](/Users/rabah/projects/anygym-codex-build/src/screens/workout/DayList.module.css): left-aligned the Start action and removed its play icon.
- [celebrate.module.css](/Users/rabah/projects/anygym-codex-build/src/ui/celebrate/celebrate.module.css): removed the celebration glow and tinted increase label.
- [monolith-m17.spec.ts](/Users/rabah/projects/anygym-codex-build/tests/monolith-m17.spec.ts): checks that the day-list action opens an exercise.

Vitest passed with 5,269 tests, and the build passed. The new phone test passed on all seven profiles. An initial phone batch had 735 passes and two setup timeouts; both timeouts passed in isolation. **Phone coverage remains incomplete:** the helper ran only the first 30 specs in the broad request. No commit was made.

May M17’s newer board instructions override the conflicting SPEC details for this build?
## Fix round (Nov 26 06:29)
Codex made no changes. Left for Claude's review.
