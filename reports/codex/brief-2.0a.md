Codex brief for PLAN item 2.0a, written Oct 25 16:20 at commit 9eb816e. SPEC.md wins if they disagree; code may have moved since.

Read-only brief for [PLAN.md:53](/Users/rabah/projects/anygym/PLAN.md:53), item **2.0a**. No files edited or tests run. New function and file names below are proposals; existing names are identified explicitly.

**1) Applicable SPEC and acceptance checks**

- SPEC §0: honest progress and load numbers, offline operation, one primary action.
- SPEC §2: session completion and plan-position changes must commit transactionally.
- SPEC §§5.3–5.5: machine resistance is starting resistance plus both sides’ plates; retain the logged unit and breakdown.
- SPEC §6, rule 6: calculate prescriptions from the session’s stored week.
- SPEC §21.1: warm-ups do not count toward progress; retain the existing saved summary, statistics and PR presentation.
- SPEC §§13.1–13.4 and 23: plain copy, accessible sheets, reduced motion, safe areas, 48-point targets and phone-matrix verification.
- The **60% rule is specified in PLAN 2.0a**, not currently in SPEC; it replaces the older full-completion/manual-choice behavior.
- Remove both “Next time…” radios and `finish-choice-helper`.
- At **≥60%** of prescribed working sets, advance; below 60%, retain the session’s day.
- Exclude warm-up blocks, warm-up sets and stretches; preserve the existing exclusion of cardio finishers.
- Show `Next up: Day 2 · Chest and triceps` above Done, with a small `Change` text button opening Today’s day picker.
- The exercise count must use that same eligible-exercise definition, while “finished” still requires all prescribed sets.
- Concrete current-data check: Classic Day 1 becomes **12 exercises / 37 sets**; 22 sets repeat, 23 advance.
- A machine with 50 lb starting resistance and one 25 lb plate per side must show **`8 × 100 lb`** for eight reps.

**2) Files and implementation**

- Change [src/lib/planWorkout.ts](/Users/rabah/projects/anygym/src/lib/planWorkout.ts).
- Add proposed `isWorkingEntry(entry)` and use it inside existing `dayProgress()`.
- Exclude `warmup`, `finisher` and stretches; the four shipped stretch names all contain the whole word “Stretch.”
- Keep stretch classification separate from `loadType`: planks and other timed working exercises still count.
- Continue using existing `doneCounts()` to exclude logged warm-up rows; cap credited sets at each exercise’s prescription.
- Create `src/lib/finishPlan.ts` with proposed pure `finishPlanPosition(state, plan, dayIndex, progress)`.
- Return the next position and partial marks; reuse existing `advancePlan()` from `src/lib/plans.ts` for wrapping and week limits.
- Separate advancement from completion: 60–99% advances while retaining a partial ring; only 100% earns a completed-day tick.
- Change [src/db/planState.ts](/Users/rabah/projects/anygym/src/db/planState.ts).
- Add proposed `applyFinishProgress(session, progress, db)` using existing private `planDayOf()` and the pure position helper.
- Preserve unrelated partial marks; preserve existing wrap behavior that clears marks when starting a new pass.
- Add proposed `setFinishNextDay(sessionId, dayIndex, db)` for guarded, transactional day overrides.
- Change [src/db/workouts.ts](/Users/rabah/projects/anygym/src/db/workouts.ts), existing `planProgress()` and `finishWorkout()`.
- Replace the `progress.complete` advancement branch with the new policy, inside the existing Finish transaction.
- Apply it only while transitioning an active session to ended; repeated Finish calls must never advance again.
- Change [src/screens/workout/FinishScreen.tsx](/Users/rabah/projects/anygym/src/screens/workout/FinishScreen.tsx), existing `FinishScreen()` and `done()`.
- Read the active `PlanState` alongside `finishedDetail()`; render the persisted next position instead of recomputing advancement on mount.
- Remove `moveOn`, radio controls, helper copy and the `moveOnFrom()` call in Done.
- Reuse `dayProgress()` plus `isWorkingEntry()` for the summary and “started” count; remove route-state dependence from progress visibility.
- Persist a Change selection immediately through `setFinishNextDay()`; update the line only after success.
- Reuse existing `dayTitle()` from `src/screens/plans/planWords.ts` for the exact day label.
- Change [src/screens/today/ChangeDaySheet.tsx](/Users/rabah/projects/anygym/src/screens/today/ChangeDaySheet.tsx): allow an optional heading, defaulting to Today’s existing copy.
- Finish supplies “Which day next?” and the persisted state, including its resulting week.
- Change [src/screens/workout/Finish.module.css](/Users/rabah/projects/anygym/src/screens/workout/Finish.module.css): replace radio styles with a quiet wrapping next-day row.
- Keep the footer outside `.main`’s scroller; Change needs a 48-point hit area despite its small text.

**3) Data model and Dexie**

- **No schema change or migration is required.** The current database is version 9.
- Existing `PlanState.nextDayIndex`, `weekIndex`, `doneDays` and `partial` cover every required result.
- Existing `Session.planId`, `dayId` and `weekIndex` identify the original prescription.
- Keep using the full plan day as the denominator; removing an exercise during the workout must not lower the completion threshold.
- Do not combine earlier sessions’ sets or `partial` values to decide whether this session reaches 60%.
- `keepPartialDay()` currently retains the largest historical partial share; that display behavior must not influence today’s advancement.
- Preserve `WorkoutScreen`’s existing `planBefore` handoff and `reopenWorkout()` restoration of the entire previous state.
- Do not backfill old sessions, recalculate historical loads, or rewrite existing plan positions.
- No new persisted “next day” field: update the existing plan pointer atomically with Finish.

**4) Tricky cases and handling**

- **Threshold:** compare the unrounded share with 0.6; never use a displayed percentage rounded to 60.
- **Extra sets:** cap each exercise before summing, so extra squats cannot compensate for skipped presses.
- **Empty eligible day:** share remains zero and the day repeats; avoid division by zero.
- **No logged sets:** retain `finishWorkout()`’s existing discard behavior and leave the plan untouched.
- **Warm-up/stretch-only session:** save its real sets, report zero eligible exercises finished, and retain the day.
- **Set kinds:** retain current completion semantics where normal, drop and failure sets count; SPEC §6’s drop exclusion concerns load progression.
- **Weeks:** use `session.weekIndex` for completed-set targets; advance the plan’s week only when wrapping its last day.
- **Final week:** preserve existing `clampWeek()` behavior; finishing week six never creates week seven.
- **Manual Change after wrapping:** select a day within the resulting week; do not increment or decrement the week again.
- **Reload/back/direct URL:** display the persisted pointer; mounting Finish must perform no plan writes.
- **Different active plan:** omit the old session’s next-day controls and never modify the newly selected plan.
- **Another workout active:** refuse a stale Finish override rather than changing that workout’s upcoming position.
- **Override failure:** retain the saved workout and previous next-day line; show a plain retryable error.
- **Unknown plan/day or Quick workout:** keep the saved summary and Done, without invented next-day information.
- **Long labels/130% text:** allow the next-day sentence to wrap without pushing Done beneath the safe area.

**5) Tests to write**

- Create `src/lib/__tests__/finishPlan.test.ts` for the pure position helper.
- Assert 0%, below 60%, exactly 60%, above 60% and 100% produce the correct day and completion marks.
- Assert last-day wrapping, one-day plans, weekly advancement and final-week clamping.
- Extend `src/lib/__tests__/planWorkout.test.ts`: stretches and warm-up blocks contribute neither exercises nor prescribed sets.
- Assert warm-up rows contribute zero, timed working exercises count, and extra sets cannot inflate share.
- Assert Classic Day 1 has 12 eligible exercises and 37 prescribed sets; Day 4 has 13 and 40.
- Extend `src/db/__tests__/planState.test.ts`: 60–99% advances with partial marks but no false completed tick.
- Assert unrelated partial marks survive, wrapping clears the pass, and repeated Finish is idempotent.
- Assert a second below-threshold session repeats even when a previous partial share exceeded 60%.
- Assert Finish rollback leaves both `endedAt` and the plan pointer unchanged when the plan write fails.
- Assert `reopenWorkout(sessionId, planBefore)` restores day, week, completed marks and partial marks exactly.
- Test `setFinishNextDay()` rejection for invalid days, missing/active sessions, a changed plan and another active workout.
- Extend `src/lib/__tests__/setLoad.test.ts`: `formatSetLine()` renders `plateMachineLoad(50, [25], 'lb')` as `8 × 100 lb`.
- Include plates-only and kg cases; unknown starting resistance must still return `null`.
- Create `tests/finish-2.0a.spec.ts`, importing `test` and `expect` from `./fixtures`.
- Use existing `dbPut()`/`dbAll()` from `tests/workout-helpers.ts` to seed precise boundary counts; finish through the real UI.
- On **iPhone SE** and **iPhone 17 Pro Max**, assert radios/helper are absent and the persisted next-day line is correct.
- Assert Change opens the shared dialog, highlights the current choice, saves another day, and survives offline reload.
- Assert Today shows the same chosen day after Done; Undo reopens the workout and restores `planBefore`.
- Exercise the real leg-press picker → log → Finish path; inspect both the stored load breakdown and summary’s total.
- Change the gym’s starting resistance afterward and reload: the saved summary must retain its original load.
- Use `simulateSafeAreas()`, `checkLayout()`, `checkControls()` and `matrixShot()` from `tests/helpers/layout.ts`.
- Check default and 130% text, long day names, reachable Done, unobscured Change, sheet dismissal and reduced motion.
- Tag representative cases `@matrix`; run the seven-device matrix, with explicit SE/Max screenshots and flow recordings.
- Capture requested **AnyGym Small/Max simulator** screenshots separately; Playwright profiles do not prove installed Home Screen rendering.

**6) Risks and conflicts with existing code**

- The working tree already contains substantial uncommitted **1.7k** work, including `workouts.ts`, `load.ts` and workout UI files; build on it without overwriting those changes.
- Preserve Finish’s tombstone recovery, durable Undo intent handling, journal cleanup, submission receipts and mutation locks.
- `FinishScreen` currently catches advancement failures silently; moving automatic advancement into Finish makes persistence failure part of the existing save-error flow.
- `dayProgress()` is shared; changing stretch eligibility also changes full-day completion semantics, which is intended and needs regression coverage.
- The reported machine bug is **not established by current source**: `plateMachineLoad()` computes both sides plus start, and `formatSetLine()` already uses `load.total`.
- Trace the actual saved load/type before changing math; multiplying again in the summary would double-count correctly stored resistance.
- Existing radio expectations must be rewritten in `tests/plans.spec.ts`, `verify-1.10.spec.ts`, `critic-1.7e.spec.ts` and `verify-1.7e-final.spec.ts`.
- Also update `gate-s1.spec.ts`, `verify-gate-s1.spec.ts` and `verify-gate-s1-final.spec.ts`, including hardcoded “16 exercises” and footer geometry assertions.
- Keep catalogue work, muscle maps, share cards and the **2.0b bar redraw** outside this item.