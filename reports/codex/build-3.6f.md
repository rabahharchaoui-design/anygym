# PLAN 3.6f backup-builder handoff

Built in this working copy. No commit. PLAN.md, SPEC.md, PROMPT.md, CLAUDE.md and .claude were not changed. Nothing from the private directory was accessed.

## Built

- Fixed, flexible and week-to-week intake choices. Flexible is the default without saved weekdays; legacy weekday choices remain fixed. Choosing a place never overrides the schedule.
- The eight existing focus tiles plus Posture, Grip and Mobility. Parts open in the shared sheet. Balance clears other choices. Four or more choices show drag ranking and accessible up/down buttons. Drafts, Back, reload, Settings redo, saved profiles and backups preserve the ordered IDs.
- One pure focus allocator in src/lib/plan/focus.ts. A shared maximum twelve-set budget, parent/child deduplication, shared physical-set charging with credit for every verified target, substitutions before growth before short finishers, experience limits, focused-muscle ceilings and final retained accounting. It runs after fitting so later filling cannot restore removed volume. Every tentative edit uses the existing duration estimate, including its final ordering and pairs.
- Detailed targets use source muscles and reviewed overrides, never name matching. Mobility uses known floor stretches and reports minutes, not hard sets. When the catalog or equipment facts cannot support an option (such as direct grip work), the plan reports its shortfall.
- Saved plan/day explanations, actual rotation or weekly counts, named shortfalls, and reveal actions to rebuild with another day or more minutes. Acceptance still lands on Today without starting a workout.
- Stable recovery deferral with an honest all-blocked state. Today, time selection, Preview and Start share the resolved day. Starts revalidate the actual gym substitutions inside the session transaction; double Start remains idempotent. Deferred cycles advance only after every pending day, keeping the 60% threshold, partial rings and Finish Undo.
- Weekly selections save transactionally, once per local Monday week; dismissal does not mark an answer. Flexible coaching never produces a missed-workouts card. Reminder eligibility is fixed-only; push infrastructure remains outside this item.
- Optional, unindexed v11 fields. Backup validation and tests cover weekly choices, ordered answers, explanations and pending-index bounds. Old pre-intake pointers keep legacy finish behavior until a schedule is chosen. The large touched intake and database-type files were split; src/MAP.md documents the new folder.
- Generator version 3. The three frozen generated plan files were regenerated; their only JSON changes are version 2 to version 3. Handwritten plans are unchanged.

## Validation

- npx vitest run: 257 files passed; 3,935 tests passed, 6 expected failures, 1 skipped.
- The new generator matrix covers 600 deterministic intakes: every 0–11 pick count, 2–6 days, all five minute choices, varied goals, experience and equipment. It checks retained counts, shared budgets, equipment, never/go-easy rules, pairing/order and exact normalized duration. Each case also simulates two dated rotations to check 48-hour recovery, wrapping and no lost days. Every individual detailed option and the maximum selection are covered separately.
- Database tests cover weekly write failure/retry, atomic start rollback, double Start, uncertain/import/warmup exclusion, cross-gym work, all-blocked recovery, partial Finish, Finish Undo, old v11 data and backup round trips/refusals.
- npm run build: TypeScript, Vite/PWA, secret scan and size guard pass. The existing large-chunk/PostCSS notices remain non-fatal.
- Duplicate guard: 43 clones, 0.69%, within the existing baseline. git diff --check passes.

## Helper checks still required

Playwright was NOT run, as requested. tests/verify-3.6f.spec.ts imports test/expect from ./fixtures and includes recorded phone flows, 100%/130% text, safe-area/layout checks, reduced motion, offline reload, four/five priorities, drag and accessible ordering, balance, dismissal, redo, fixed labels, weekly save failure/retry, recovery deferral and all-blocked state. The golden first-workout journey now chooses Flexible and retains its real set-logging assertion.

Run the new spec and golden journey on the helper's own server/port, including the WebKit iPhone SE and iPhone 17 Pro Max projects. Recordings, visual layout outcomes and the ux-critic score of at least 9 are not claimed or verified by this build.

## Files changed

- `data/plans/beginner-full-body-3-day.json`
- `data/plans/hotel-gym-3-day.json`
- `data/plans/no-equipment-3-day.json`
- `src/MAP.md`
- `src/data/focus.ts`
- `src/data/generator.ts`
- `src/db/__tests__/schedule-3.6f.test.ts`
- `src/db/coachData.ts`
- `src/db/intake.ts`
- `src/db/planAdapt.ts`
- `src/db/planState.ts`
- `src/db/profileTypes.ts`
- `src/db/quick.ts`
- `src/db/schedule.ts`
- `src/db/training.ts`
- `src/db/types.ts`
- `src/db/workoutStart.ts`
- `src/hooks/useSchedule.ts`
- `src/hooks/useTodayData.ts`
- `src/hooks/useTraining.ts`
- `src/lib/__tests__/chain-3.6y.test.ts`
- `src/lib/__tests__/generator-3.5.test.ts`
- `src/lib/__tests__/generator-3.6f.test.ts`
- `src/lib/__tests__/intake-3.3.test.ts`
- `src/lib/__tests__/intake-3.6f.test.ts`
- `src/lib/__tests__/yourPlan-3.5.test.ts`
- `src/lib/backup.ts`
- `src/lib/backupChecks.ts`
- `src/lib/coach/today.ts`
- `src/lib/finishPlan.ts`
- `src/lib/generator/day.ts`
- `src/lib/generator/focus.ts`
- `src/lib/generator/pick.ts`
- `src/lib/generator/plan.ts`
- `src/lib/generator/prescribe.ts`
- `src/lib/generator/types.ts`
- `src/lib/generatorRules.ts`
- `src/lib/intake/answers.ts`
- `src/lib/intake/funnel.ts`
- `src/lib/intake/options.ts`
- `src/lib/intake/planPick.ts`
- `src/lib/intake/sanitize.ts`
- `src/lib/intake/yourPlan.ts`
- `src/lib/plan/__tests__/focus.test.ts`
- `src/lib/plan/__tests__/schedule.test.ts`
- `src/lib/plan/focus.ts`
- `src/lib/plan/focusMetadata.ts`
- `src/lib/plan/schedule.ts`
- `src/lib/plans.ts`
- `src/lib/quickFocus.ts`
- `src/screens/TodayScreen.tsx`
- `src/screens/intake/Focus.module.css`
- `src/screens/intake/FocusPartsSheet.tsx`
- `src/screens/intake/FocusRank.tsx`
- `src/screens/intake/FocusStep.tsx`
- `src/screens/intake/IntakeScreen.tsx`
- `src/screens/intake/Reveal.tsx`
- `src/screens/intake/ScheduleStep.tsx`
- `src/screens/intake/icons.ts`
- `src/screens/intake/stepBody.tsx`
- `src/screens/plans/PlanCard.tsx`
- `src/screens/plans/PlanViewer.tsx`
- `src/screens/quick/QuickScreen.tsx`
- `src/screens/today/DayCard.tsx`
- `src/screens/today/WeekScheduleSheet.tsx`
- `src/screens/today/startPreview.ts`
- `src/screens/today/useCoach.ts`
- `src/screens/workout/UpNext.tsx`
- `tests/golden/01-intake-first-workout.spec.ts`
- `tests/helpers/touch.ts`
- `tests/verify-3.6f.spec.ts`
- `reports/codex/build-3.6f.md` (this handoff)
