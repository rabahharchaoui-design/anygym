STATUS: HANDLED merge at 4.9 with a fix list (PLAN note)
# Codex backup build of PLAN item 4.9
Branch: codex-build-4.9-1119-1229 (based on s4-run). Review like any builder output, then merge with: git merge --no-ff --no-edit codex-build-4.9-1119-1229
Changes:  16 files changed, 367 insertions(+), 4 deletions(-)
Vitest (whole suite in Codex's copy): could not run
Build: build passed
Playwright (whole suite, port 4176, all iPhone profiles): could not run (see /Users/rabah/.config/anygym/codex-pw.txt)

## Codex notes
Implemented the three run plans with a weekly calendar, run purposes and presets, goal times based on recorded efforts, an opt-in adjustment for missed runs, and a Today shortcut. Plan progress is stored with the profile and included in backups.

Changed files:

- Plan logic, storage, and tests: [runplan.ts](/Users/rabah/projects/anygym-codex-build/src/lib/runplan.ts), [runPlan.ts](/Users/rabah/projects/anygym-codex-build/src/db/runPlan.ts), [useRunPlan.ts](/Users/rabah/projects/anygym-codex-build/src/hooks/useRunPlan.ts), [profileTypes.ts](/Users/rabah/projects/anygym-codex-build/src/db/profileTypes.ts), and their Vitest tests.
- Run and Today screens: [RunPlanSheet.tsx](/Users/rabah/projects/anygym-codex-build/src/screens/run/RunPlanSheet.tsx), [RunPlanWeek.tsx](/Users/rabah/projects/anygym-codex-build/src/screens/run/RunPlanWeek.tsx), [TodayRunPlan.tsx](/Users/rabah/projects/anygym-codex-build/src/screens/today/TodayRunPlan.tsx), their styles, and the existing Run and Today screens.
- Playwright coverage: [verify-4.9.spec.ts](/Users/rabah/projects/anygym-codex-build/tests/verify-4.9.spec.ts).

**Verification:** `npx vitest run` passed: 4,954 passed, 5 expected failures, and 1 skipped. `npm run build` passed. Playwright was not run, as requested.

**Unfinished or uncertain:** The referenced competitor research file is absent from this copy, so I could not review it. The Playwright flow and phone layout still need the helper’s verification. Also, if saving the link between a newly started run and its plan fails, the run can be saved without being marked complete in the plan; that failure needs a more visible recovery path.

No commit was made.