Codex brief for PLAN item 4.9, written Nov 19 15:57 at commit 0b232581. SPEC.md wins if they disagree; code may have moved since.

## Scope and acceptance

1. [PLAN 4.9](/Users/rabah/projects/anygym/PLAN.md:57) calls for First 5K, Faster 5K and First 10K.
2. The prescribed head start is the reviewed branch `codex-build-4.9-1119-1229`.
3. Merge that branch into the session branch, then implement the review fixes below.
4. The branch’s 16-file change is clean against its reviewed base; recheck against the current HEAD before merging.
5. [Competitor research, gap 7](/Users/rabah/projects/anygym/.design-ref/inspiration/competitors-research.md:26) supplies the feature direction.
6. Use original wording and presentation; do not copy competitors’ text, artwork or layouts.
7. SPEC does **not** specify the three training schedules, progression rules or starting-week algorithm.
8. The backup branch invents those schedules; mark their contents for G and do not ship them as approved advice.
9. Acceptance: each plan has a browsable week calendar and a plain, one-line purpose for each run.
10. Acceptance: the user can choose the appropriate starting week; entering a later week must schedule that week first.
11. Acceptance: suggest a goal time only when supported by recorded efforts; otherwise show an honest next step.
12. Acceptance: the accepted suggestion reaches the intended planned run, not just its explanatory text.
13. Acceptance: missed runs never silently move; offer a choice to adjust or keep the dates.
14. Acceptance: Today starts the scheduled run in one tap with its intended run type and preset.
15. [SPEC 12.1–12.3](/Users/rabah/projects/anygym/SPEC.md:268): preserve the existing run types, countdown, GPS and live-run behavior.
16. [SPEC 12.7](/Users/rabah/projects/anygym/SPEC.md:296): use the existing named interval presets.
17. [SPEC 12.11](/Users/rabah/projects/anygym/SPEC.md:311) and [9.1–9.2](/Users/rabah/projects/anygym/SPEC.md:237): data stays on the phone and participates in backup and restore.
18. [SPEC 13](/Users/rabah/projects/anygym/SPEC.md:317): plain language, accessible controls, 48-point targets, offline use and 130% text.
19. SPEC 13.1 normally limits confirmations; PLAN 4.9 explicitly requires asking before adaptation.
20. Treat the adjustment choice as that feature-specific requirement, and preserve “Keep dates.”

## Implementation by file

21. Branch paths below exist **on the backup branch**, not necessarily on current HEAD until merged.
22. `src/lib/runplan.ts`: retain `RUN_PLANS`, `goalSuggestion`, `localDate`, `addDays`, `daysBetween` and `adaptDates`.
23. Replace or remove unused `SavedRunPlan`, `currentWeek`, `missedRuns` and the unused `completed` argument in `scheduledWeek`.
24. Replace `scheduledWeek`’s hard-coded three-runs-per-week indexing with plan/run metadata.
25. Add pure helpers for building dates from a selected starting week, determining missed runs and selecting today’s run.
26. Add a pure completion predicate for distance, time and interval sessions; document the chosen interval completion rule.
27. Source plan content from a G-approved schedule; the competitor research gives no distances or training prescription.
28. `src/db/profileTypes.ts`: retain the branch’s optional `runPlan` field and give its stored shape a stable type.
29. `src/db/runPlan.ts`: keep `readRunPlan`, `saveRunPlan` and `clearRunPlan`; validate all imported fields.
30. Add transactional operations that read the latest profile and update one plan’s dates or link without overwriting concurrent changes.
31. Use a stable plan-instance ID and planned-run ID, or equivalent version checks, so an old start cannot modify a replacement plan.
32. `src/db/runs.ts`: extend `startRunRow` or add a helper to create the run row, live snapshot and plan link in one transaction.
33. Include `db.profile`, `db.runs` and `db.kv` in that transaction; roll all three back if linking fails.
34. `src/hooks/runEngine.ts`: pass planned-run identity into the queued start write and expose failure through the existing save-error flow.
35. Preserve ordinary unplanned starts and the existing snapshot/restore behavior.
36. `src/hooks/useRunPlan.ts`: derive completed entries from linked finished runs and the pure completion predicate.
37. Use `useLive` error and retry states; do not turn a failed read into “no plan” or “no history.”
38. `src/screens/run/RunPlanSheet.tsx`: add starting-week selection before saving and explain adjustment before applying it.
39. Guard async choose, adapt and replacement actions against double taps; keep the sheet open on write failure.
40. `src/screens/run/RunPlanWeek.tsx`: format local dates as weekday and date, with accessible full dates.
41. Render every scheduled entry once, including multiple runs on one date after adaptation.
42. `src/screens/run/RunStart.tsx`: replace the branch’s fire-and-forget `readRunPlan().then(saveRunPlan)` link.
43. Route `startPlanned` through the existing tap guard, pocket explanation, countdown and engine start.
44. Apply the selected session’s `RunSetup` without losing the user’s voice and auto-pause settings.
45. `src/screens/today/TodayRunPlan.tsx` and `src/screens/TodayScreen.tsx`: retain the branch’s Today entry point.
46. Hide the start action while a run is active; use a stable plan/run identity in navigation state.
47. `src/screens/run/RunScreen.tsx`: retain the branch’s routing integration, checking active-run and restore states.
48. Reuse `Button`, `Sheet`, `useTapGuard` and existing run formatting; do not create duplicate UI primitives.
49. Keep branch CSS in `RunPlanSheet.module.css` and `TodayRunPlan.module.css`; use current design tokens.
50. Recheck the Run start layout against M2’s pending restyle before resolving any merge conflict.
51. Update [src/MAP.md](/Users/rabah/projects/anygym/src/MAP.md) if the final implementation adds a folder.

## Data, migration and difficult cases

52. The branch stores `{ id, start, dates, links }` under `Profile.runPlan`; extend it with instance and start-week information.
53. An optional, unindexed profile property requires **no Dexie version bump**.
54. Persist enough information to recover the exact schedule, accepted suggestion and run association after reload.
55. Validate date strings as real calendar dates, plan IDs, entry counts, link keys and values; reject malformed restored data safely.
56. Use local calendar-day arithmetic, not elapsed 24-hour increments, across daylight-saving changes.
57. Define behavior for future starts, a selected later week, end-of-plan dates and travel across time zones.
58. Adapt only unfinished entries, preserve completed dates and IDs, and make repeated confirmation idempotent.
59. Handle collisions and shifted weeks explicitly; a date may legitimately contain more than one planned run.
60. A linked `endedAt` alone is insufficient: the branch marks a 100 m abort Done.
61. `runVerdict` only checks GPS presence and a minimum distance; it is not a planned-goal completion check.
62. Require a valid run and its intended distance or moving-time target; define and test interval completion separately.
63. Discarded, missing, incomplete and deleted linked runs must not be displayed as completed.
64. `goalSuggestion` currently uses `bestEffortSec` for a real recorded 5 km or 10 km; preserve gap-aware evidence.
65. Current `RunSetup` supports **either** a distance goal or a time goal, not a target time for a distance run.
66. Agree on how the accepted time is represented and shown during the relevant run; do not silently replace a distance goal with a time goal.
67. A one-tap Today start still passes through the existing first-run pocket explanation and countdown.
68. Consume navigation state once; canceled countdown, stale plan, active run or failed write must not create a false link.
69. Backup exports the profile and runs, but `restoreMerge` keeps an existing profile rather than merging its fields.
70. Test and document that merge behavior; decide explicitly if importing a plan into an existing profile requires a scoped change.

## Tests and verification

71. Extend `src/lib/__tests__/runplan-4.9.test.ts`: each approved plan’s structure, purpose, preset and selected starting week.
72. Assert local-date arithmetic and adaptation across spring and autumn DST, month/year boundaries and multiple missed runs.
73. Assert no misses leaves dates unchanged; completed entries stay fixed; repeated adjustment does not shift twice.
74. Assert week selection before start, after finish and after shifted dates; cover multiple entries on the same date.
75. Assert suggestions use genuine qualifying efforts, reject gaps/invalid data and return `null` with no suitable history.
76. Assert a 100 m abort, no GPS, partial distance/time and incomplete intervals remain unfinished.
77. Assert a completed target counts once; missing or deleted linked runs do not count.
78. Extend `src/db/__tests__/runPlan-4.9.test.ts`: old profile without the field, validation and profile-field preservation.
79. Force a link/write failure and assert run row, snapshot and link roll back together.
80. Race adaptation against linking and plan replacement; assert no lost dates, links or cross-plan association.
81. Test backup, replace restore and merge restore with plan links and runs, including an existing destination profile.
82. Extend `tests/verify-4.9.spec.ts`; run WebKit projects **iPhone SE** and **iPhone 17 Pro Max**.
83. Select each plan and a later starting week; verify friendly dates, calendar navigation and purpose text.
84. With no history, verify the honest empty state; with a qualifying run, verify the accepted goal reaches the live run.
85. From Today, start one scheduled run and verify its type/preset through countdown and into the saved run.
86. Double tap Start and Adjust; verify one run/link and one schedule shift.
87. Cancel the pocket sheet or countdown, reload during a run, and verify no false completion or duplicate start.
88. Finish a short abort and verify it is not Done; complete a target and verify it is Done after reload.
89. Verify Keep dates and Adjust separately, active-run hiding, write-error recovery and offline behavior.
90. Check sheet scrolling, accessible labels, tap targets and 130% text on both phone sizes.
91. Run `npm run test`, `npm run build` and the targeted Playwright projects; report any environment limitations.

The principal release blocker is **G-approved plan content**. The accepted goal-time behavior and interval completion rule also need an explicit product decision because the current SPEC and run model do not define them.