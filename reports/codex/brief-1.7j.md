Codex brief for PLAN item 1.7j, written Oct 25 08:07 at commit 1eadd8a. SPEC.md wins if they disagree; code may have moved since.

Read [CLAUDE.md](/Users/rabah/projects/anygym/CLAUDE.md), [SPEC.md](/Users/rabah/projects/anygym/SPEC.md), [PLAN.md:45](/Users/rabah/projects/anygym/PLAN.md:45), the three referenced bug reports, and the affected source/tests. No files changed; tests were not run.

**1) Applicable SPEC and acceptance checks**

- SPEC §§0, 2: honest numbers, offline operation, transactional writes, versioned storage, minimum 48pt targets.
- §§5.2–5.5: equipment-specific selection, exact loading, stored units and load breakdowns.
- §6: working-set progression, equipment availability, explicit cross-unit suggestions.
- §§9.1–9.2: backups preserve recovery data; damaged backups fail before changing anything.
- §§13.1, 13.3–13.5: recoverable errors, Undo, double-tap safety, kill recovery, accessible phone layouts.
- §§20.1–20.4, 21.1: correct progress rings, prefilled rows, one-tap checks, exact LAST TIME copying, persistent rest.
- §23.4: record changed flows on iPhone SE and 17 Pro Max; inspect screenshots and videos.
- Acceptance (1): check row 3 first, then the remaining rows; every distinct row saves once and no enabled ✓ silently stops working.
- Acceptance (2): pending/failed active-plan reads disable selection; selecting the active plan preserves every progress field.
- Acceptance (3): warmups on a normal lift leave its prescribed working rows outstanding; dedicated warmup blocks still complete independently.
- Acceptance (4): edit an in-flight row, save its successor, restart with stale mirrors; the saved successor never becomes loggable again.
- Acceptance (5): Finish synchronously prevents type changes; already-started changes settle before completion is calculated.
- Acceptance (6): LAST TIME preserves the historical total on today’s equipment or explains why it cannot copy the weight.
- Acceptance (7): held-plate selection, validation, prefill and progression all use enabled plate weights.
- Acceptance (8): failed Undo → minimize → resume retains recovery and blocks Finish until restore or successful cancellation.
- Acceptance (9): +25 lb bodyweight history produces an explicit nonzero kg addition or a blocked row requiring selection.
- Acceptance (10): invalid stack defaults/overrides are rejected before restore; pathological values cannot crash pin generation.
- Acceptance (11): toast action buttons measure at least 48×48 CSS px; rest survives minimize/resume with localStorage full.

**2) Files to change/create and implementation**

- [src/lib/logQueue.ts](/Users/rabah/projects/anygym/src/lib/logQueue.ts): change `claim`, `claimed`, `release` from numeric indexes to stable draft IDs.
- `release` must use committed identities, including receipts for deleted sets; retain running claims and stale-render double-tap protection.
- [src/lib/setTable.ts](/Users/rabah/projects/anygym/src/lib/setTable.ts): give `PendingRow` a stable identity; update `markSubmitted`, `reconcileRows`, `pendingRows`.
- Materialize an untouched row’s identity once before submission; allocating a fresh ID on each stale click defeats the guard.
- Keep display index, pending slot, stable identity, and prescribed-set ordinal separate.
- [src/screens/workout/ExerciseView.tsx](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx): update `log` and claim release; use row identity throughout.
- Replace `copyLast`’s `prefillLoad` call with a separate exact-total copy helper; keep copied reps/seconds and stopped-watch behavior.
- Guard both `cycleType` and `cycleLogged` synchronously during Finish, including callbacks from stale mounted views.
- [src/screens/workout/rowLog.ts](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts): extend `committedOf`, `submitRow`, `reconcileExercise`, `reconcileSession` with successor receipts.
- Reserve the successor before committing its predecessor; immediate reconciliation and startup recovery must read the same durable identity.
- [src/db/workouts.ts](/Users/rabah/projects/anygym/src/db/workouts.ts): extend `NewSet`/`logSet` to commit the reserved successor with the submission receipt.
- Make `updateSetType` transact over `sessions` and `sets`; check the parent session is active inside that transaction.
- Reuse `WorkoutFinishedError`; retain IDs, ordering, failure-flag normalization and transactional rollback.
- [src/screens/workout/useWorkout.ts](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts): replace the all-rows `done` calculation with shared completion counts.
- [src/lib/planWorkout.ts](/Users/rabah/projects/anygym/src/lib/planWorkout.ts): add a pure completion-count helper used by navigation and prescribed-row calculation.
- Normal lifts exclude warmups; dedicated `WorkoutEntry.warmup` blocks count their own rows. Keep progression’s separate work-only rule.
- Calculate pending count from remaining prescription plus retained drafts/extra rows, rather than `entry.sets - logged.length`.
- [src/screens/workout/WorkoutScreen.tsx](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx): update `onLogged`; its unconditional `done[id] + 1` also miscounts warmups.
- Pass landed set kind/details through the callback, or read authoritative counts; avoid stale closure counts during delayed writes.
- Update `finishNow` to close and drain type mutations alongside logging/deletion before `finishWorkout`.
- [src/screens/workout/SetTable.tsx](/Users/rabah/projects/anygym/src/screens/workout/SetTable.tsx): accept mutation-disabled state and disable type controls during Finish.
- [src/screens/workout/FinishScreen.tsx](/Users/rabah/projects/anygym/src/screens/workout/FinishScreen.tsx) and `workouts.ts::planProgress`: share the same completion policy as the live view.
- [src/screens/plans/PlanViewer.tsx](/Users/rabah/projects/anygym/src/screens/plans/PlanViewer.tsx): gate both button and `use` handler on `state.ready && !state.error`; render `LoadError` with `state.retry`.
- [src/db/planState.ts](/Users/rabah/projects/anygym/src/db/planState.ts): `choosePlan` must read inside its write transaction and return the existing state when `planId` matches.
- Preserve `startedAt`, `weekIndex`, `nextDayIndex`, `doneDays`, and `partial`; choosing a different plan retains current reset behavior.
- Create `src/screens/workout/sessionRecovery.ts`: session-keyed ownership of `createDeleteUndo`, unresolved IDs, and tracked type mutations.
- Keep that manager through route unmounts; do not retain component setters in it. Dispose only after successful finish/discard and settled writes.
- [src/lib/deleteUndo.ts](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts) and [src/db/tombstones.ts](/Users/rabah/projects/anygym/src/db/tombstones.ts): preserve unresolved intent through recovery/expiry; cancellation remains a tracked write.
- [src/screens/workout/exerciseLoad.ts](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts): add proposed `copyLastLoad`; resolve today’s bar identity and setup, then delegate arithmetic to `load.ts`.
- [src/lib/load.ts](/Users/rabah/projects/anygym/src/lib/load.ts): implement exact-total copying using `solvePlates`/`loadAt`; preserve today’s `barId`, base and collars.
- Extend `LoadSetup`, `loadAt`, `nearestLoadable`, `stepUp`, and relevant availability helpers for held-plate versus other single implements.
- Add shared stack-step/list validation used by `stackValues` and `isStackPin`; reject invalid precision/divisors and bound generated option counts.
- [src/lib/progression.ts](/Users/rabah/projects/anygym/src/lib/progression.ts): explicitly convert bodyweight `added`; do not route nonzero additions through the current null-returning `nearestLoadable` path.
- `pendingRows` must distinguish unavailable historical weight from first-ever bodyweight; unavailable weighted history must not reach `certainLoad()`’s zero fallback.
- [src/lib/loadTypeRule.ts](/Users/rabah/projects/anygym/src/lib/loadTypeRule.ts): extend `PlanExercise`, `LoadTypeOverride`, `buildPlanExercises` with optional implement metadata.
- Update [data/plan-exercise-overrides.json](/Users/rabah/projects/anygym/data/plan-exercise-overrides.json) for `plate-russian-twist` and `front-and-lateral-plate-raise`; regenerate [data/plan-exercises.json](/Users/rabah/projects/anygym/data/plan-exercises.json).
- [src/screens/workout/SetLoadInput.tsx](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx): choose enabled-plate options for held plates, dumbbell options for known dumbbell singles, exact entry for other singles.
- [src/components/load/DumbbellWheel.tsx](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx): support explicit options without synthesizing a fake range; preserve synchronous publication.
- Reuse [NumPad.tsx](/Users/rabah/projects/anygym/src/components/load/NumPad.tsx) and `numpad.ts::pressKey/parseTyped` for exact single-weight entry.
- [src/lib/backup.ts](/Users/rabah/projects/anygym/src/lib/backup.ts): strengthen `RECORD_CHECKS.gyms` and validate optional receipt fields and successor relationships.
- [src/lib/rest.ts](/Users/rabah/projects/anygym/src/lib/rest.ts): add shared runtime state and proposed `hydrateRest`; make `saveRest` persist the supplied value even when localStorage throws.
- [src/lib/durable.ts](/Users/rabah/projects/anygym/src/lib/durable.ts): reuse `mirrorValue`; ensure stamp-writing failure cannot suppress the IndexedDB fallback.
- [src/main.tsx](/Users/rabah/projects/anygym/src/main.tsx): register the `REST_KEY` hydrator beside `hydrateDrafts`.
- [src/ui/Toast.module.css](/Users/rabah/projects/anygym/src/ui/Toast.module.css): change `.action` minimum height from `44px` to `var(--tap)`.

**3) Data model / Dexie**

- Current source is already Dexie **v9**, including reporting tables; do not build from PLAN’s earlier v8 assumption.
- Add optional `successorId` to `Submission` and the journal reservation in [src/db/types.ts](/Users/rabah/projects/anygym/src/db/types.ts).
- Reserve once per submitted identity; retries reuse the journal reservation, and `logSet` copies it into the receipt transactionally.
- Change `Committed` from revision-only values to receipt metadata; propagate through `useWorkout`, immediate reconciliation and recovery.
- Follow successor chains until the draft is consumed or genuinely pending; guard cycles and cross-session/exercise references.
- Old receipts remain readable; if an old newer draft needs a successor, reserve it transactionally before exposing it.
- No new table/index is necessary; optional fields require no Dexie version bump or historical-set rewrite.
- Keep `Load.kind === 'single'`; implement metadata belongs to the static exercise catalog and runtime setup.
- Extend backup validation/round trips for receipt metadata; preserve all existing IDs, units, plan pointers and tombstones.

**4) Tricky edge cases**

- A later row moves after logging: release its identity, never its former position; failures must permit retry with the same ID.
- A predecessor’s set can be deleted while its receipt remains: recovery must still consume it and follow any committed successor.
- Preserve the existing revision rule: draft rev ≤ committed rev is consumed; only strictly newer values survive.
- Shared Undo ownership alone is insufficient: `recoverDeletes` must not expire an unaccepted tombstone whose acceptance failed but remains unresolved in memory.
- Finish errors must reopen every mutation gate; type-write failures must be surfaced rather than silently advancing the plan.
- Warmup → work → warmup changes, delete/undo, extra sets and pairs must update rings, remaining rows and navigation consistently.
- LAST TIME examples: 135 lb Olympic history on a 35 lb bar requires 50 lb per side; 90 lb machine history with a 50 lb start requires 20 per side.
- Refuse unknown bases, unavailable plates, sleeve overflow and inexact conversions; copying reps may succeed with a clear weight-copy explanation.
- Weighted bodyweight conversion must respect selectable precision and explicitly disclose rounding/reselection; never silently substitute “Just you.”
- There are no persisted stack min/max fields. `max < min` is already checked for `dumbbellRange`; the missing stack checks concern defaults, overrides and generated lists.
- Rest recovery must retain the original deadline, including Skip/Finish clearing; stale mirrors must not resurrect a cleared timer.

**5) Tests to write**

- Extend [logQueue.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts): row 3 → remaining rows invokes three writers; same-ID stale/double clicks invoke one; failed claims retry.
- Extend [setTable.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/setTable.test.ts): warmups retain prescribed rows, draft IDs remain stable, unavailable weighted history stays blocked.
- Extend [rowLog.test.ts](/Users/rabah/projects/anygym/src/screens/workout/__tests__/rowLog.test.ts): delayed 10→12 edit, failed mirrors, successor save, restart yields exactly `[10,12]`.
- Include multiple successor generations, committed/deleted successors, legacy receipts, and existing older/equal/newer revision cases.
- Extend [planState.test.ts](/Users/rabah/projects/anygym/src/db/__tests__/planState.test.ts): same-plan selection is byte-identical, concurrent same-plan calls preserve progress, different-plan choice resets.
- Extend [planWorkout.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/planWorkout.test.ts): normal warmups do not complete lifts; dedicated warmups complete; pair navigation uses correct counts.
- Create `src/db/__tests__/workout-1.7j.test.ts`: type mutation before Finish is included; one queued after Finish rejects without changing sets or planState.
- Extend [deleteUndo.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/deleteUndo.test.ts): manager reacquisition retains failed acceptance, expiry cannot drop it, failed cancellation still blocks Finish.
- Extend [load.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/load.test.ts): changed bar/base/collars preserve copied totals; unavailable exact solutions return failure; plate singles use enabled inventory.
- Extend [prefill.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/prefill.test.ts) and [progression.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/progression.test.ts): 5 kg plate remains 5, next plate follows inventory, bodyweight conversion stays nonzero.
- Extend [backup.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/backup.test.ts): reject zero/negative/tiny/oversized stack configurations and reversed dumbbell bounds; accept standard valid settings.
- Extend [src/db/__tests__/backup.test.ts](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts): successor receipt round trips preserve exactly-once recovery.
- Extend [rest.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/rest.test.ts) and [durable.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/durable.test.ts): quota failure preserves deadline through remount/hydration; clear remains cleared.
- Create `tests/verify-1.7j.spec.ts`, importing `test`/`expect` from `./fixtures`.
- Browser cases: out-of-order checks; delayed/failed plan read; same-plan reuse; three W rows followed by working rows; Finish/type race.
- Browser cases: failed Undo acceptance → minimize/resume → blocked Finish → retry, plus explicit cancellation and cancellation failure.
- Browser cases: changed-equipment LAST TIME exact/refused copies; held-plate selection/save/reload; cross-unit weighted dips; damaged backup leaves data unchanged.
- Browser case: localStorage quota failure during rest → minimize/resume/reload; compare stored deadline, not a restarted countdown.
- Reuse `tests/helpers/idb.ts::{holdNextSetWrite,releaseSetWrite,delayReadsAfterNextWrite}` for deterministic races.
- Add successor/rest hard-kill cases using `tests/helpers/kill.ts::{killHard,relaunchOffline}`; reload alone does not prove kill recovery.
- Run WebKit projects `iPhone SE` (375×667) and `iPhone 17 Pro Max` (440×956), including 130% text, safe areas, no horizontal overflow and 48pt toast actions.
- Preserve §20.4 tap budgets; capture changed flows with `tests/workout-helpers.ts::{shotOn,fitsOneScreen}`.
- Builder validation: `npm test`, `npm run test:coverage`, `npm run build`, targeted two-phone Playwright, then full checkpoint suite.

**6) Risks and conflicts with built code**

- The working tree already contains substantial changes, including reporting/schema v9, `main.tsx`, fixtures and tests; preserve them and avoid unrelated cleanup.
- Existing claim tests explicitly encode numeric indexes; rewrite their contract while retaining delayed-render double-tap assertions.
- Live completion currently counts everything; Finish excludes warmups. Fix both through one policy. Preserve existing drop-set completion behavior unless explicitly changing it.
- Keep SPEC §6’s separate exclusion of drops from progression; completion and progression are currently different calculations.
- Do not repurpose `currentLoad` globally for exact copying: active equipment edits intentionally rebuild current picks, while historical edits preserve their own bar/collars.
- Preserve 1.7i guarantees: pending loads retain original units, saved rows render stored values, and wheel Done saves the displayed value.
- The 0736 report also identifies mixed-unit `sameAll` progression; it is absent from 1.7j’s eleven requirements. Flag separately rather than silently expanding scope.
- SPEC §23.2 mentions 44pt controls, but §§0/13.3 and this item require 48pt; use 48pt for toast actions.