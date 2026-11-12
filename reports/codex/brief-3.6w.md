Codex brief for PLAN item 3.6w, written Nov 13 00:07 at commit cdaf4b29. SPEC.md wins if they disagree; code may have moved since.

Read [CLAUDE.md](/Users/rabah/projects/anygym/CLAUDE.md), [SPEC.md](/Users/rabah/projects/anygym/SPEC.md), [PLAN.md:63](/Users/rabah/projects/anygym/PLAN.md:63), `src/MAP.md`, the three cited reports, and relevant source/tests. No files edited; tests were not run.

**1) Applicable SPEC and acceptance checks**

- **§§0, 5.4–5.5:** displayed, drawn, solved and saved resistance must agree; unknown machine geometry must never produce a guessed total.
- **§§2–3:** writes remain transactional; machine answers belong to a gym; existing saved records survive upgrades unchanged.
- **§6:** machine history remains scoped to the gym where the set was submitted, including failed Log retries after switching gyms.
- **§§9.1–9.4:** Merge, Replace and cold startup restore approvals before registering personal plans; approved exercises remain usable.
- **§15:** beginner estimates and lighter-week targets use complete stack resistance, including added weight; reconstructed targets retain an explicit pin/add-on split.
- **§§13.1, 13.3:** read failures show a recoverable error with Retry; failed submissions cannot disappear through Finish or Discard → Undo.
- **§§13.4–13.5, 20.2:** new questions fit the weight sheet on SE and 17 Pro Max; Done/check controls remain reachable, labelled and at least 48 pt.
- **§19:** switching gyms must preserve already-submitted input while subsequent fresh submissions use the new gym.
- Acceptance: `100 lb pin + 50 lb added`, ten test reps, eight target reps → **165 lb total**, with the target’s pin/add-on components explicitly stored.
- Acceptance: lighter-week examples reduce **150 lb → 135 lb** and **75 kg → 67.5 kg**, retaining the add-on when a valid positive pin can express that target.
- Acceptance: one 45 lb plate on a confirmed single-horn, plates-only machine saves **45 lb**; the equivalent two-horn machine saves **90 lb**.
- Acceptance: `stepDown()` returns the greatest physically loadable total below the current value, including plate exchanges across sleeve-limited gaps.
- Acceptance: mirror-only submitted drafts block Finish; Discard → Undo restores the exact draft; logging another row never resurrects deliberately removed input.
- Scope: PLAN defers lower-revision cross-tab conflicts, corrections arriving inside backup reads, and older tabs resolving generated plans. Do not expand this item into those fixes.

**2) Files to change/create and implementation**

- **Approval ordering — [src/main.tsx](/Users/rabah/projects/anygym/src/main.tsx):** replace concurrent `savedPlans()`/`approvals()` with awaited `loadApprovals()` → `loadSavedPlans()` before `showApp()`.
- Keep mirror restoration parallel only with work independent of that ordering; propagate required read failures to the existing `StartupError`.
- **`src/db/backup.ts`:** in both `restoreReplace()` and `restoreMerge()`, await approvals before saved plans; remove the two `.catch(() => 0)` success fallbacks.
- **`src/db/savedPlans.ts`:** make `loadSavedPlans()` distinguish registration failures from successfully loaded plans; do not silently count an unresolved required plan as absent.
- **New `src/db/loadPlanRegistry.ts`:** share the ordered loading operation between startup and restore; retain dependency/database seams for fault-injection tests.
- **`src/components/StartupError.tsx`:** reuse its existing Retry control; adjust workout-only copy if the failure concerns plans or approvals.
- **`src/screens/settings/RestoreSheet.tsx`:** distinguish restore-transaction failure from registry-loading failure after commit.
- For the latter, show “Restored, but could not load your plans” with Retry that reruns registration, rather than repeating Replace or claiming “Nothing was changed.”
- **`src/lib/backupChecks.ts`, `src/lib/backup.ts`, `src/data/plans.ts`:** cover the earlier validation boundary too: `parseBackup()` currently validates definitions against the live approval gate.
- Validate incoming personal-plan exercises against valid approval rows in that backup without installing those approvals into the running app before confirmation.
- **Beginner targets — `src/lib/load/coach.ts`:** retain `testSetNumber()` for numeric callers; add a load-returning target helper accepting the complete source `Load`.
- **New `src/lib/load/stackTargets.ts`:** centralize complete-resistance targeting and reconstruction of valid pin/add-on combinations; export through `src/lib/load/index.ts`.
- **`src/screens/workout/useWorkout.ts`:** `startLight()` must pass `test.load`, not only `pickedWeight(test.load)`; return the resulting complete target load directly.
- Its `progressionOf()` coach-target branch must reconstruct stack targets with their stored add-on instead of `loadAt(kind, t.value, setup)` alone.
- **`src/lib/coach/recovery.ts`:** update `lighter()` and `plateauOf()` to preserve the stack split for deload, welcome-back and plateau targets.
- **`src/lib/coach/types.ts`, `src/lib/coach/target.ts`:** carry the add-on through `PlannedChange`, `CoachTarget` and `targetOf()`, preserving existing picked-weight semantics.
- **`src/screens/today/CoachList.tsx`, `CoachCard.tsx`:** display target total resistance, using a load-module formatter/helper; a pin-only destination must not be labelled as the whole target.
- **`src/db/coach.ts`:** preserve the new target fields in `applyChanges()` and Undo; compare the complete target identity when deciding whether Undo still applies.
- **Gym capture — `src/lib/setTable.ts`:** in `markSubmitted()`, preserve `base.gymId` whenever `base.submitted !== undefined`; capture `values.gymId` only for a fresh submission.
- **`src/screens/workout/useLogRow.ts`:** retain the same draft identity and captured gym through the row-check retry path; verify its separate `retry()` path behaves identically.
- **Machine definitions — `data/plan-exercise-overrides.json`, `src/lib/loadTypeRule.ts`:** add validated horn metadata to `LoadTypeOverride` and `PlanExercise`.
- Update `buildPlanExercises()` to retain it and regenerate `data/plan-exercises.json` with the existing `scripts/build-plan-exercises.ts`.
- Record a count only where the machine definition establishes it; generic names such as seated calf raise must still permit an unknown count.
- **`src/db/gyms.ts`, `src/db/equipment.ts`:** resolve/save horn count by existing `machineIdFor()` identity; preserve it when changing starting resistance.
- **`src/screens/workout/exerciseLoad.ts`:** thread resolved count through `loadSetupFor()`, `currentLoad()`, `prefillLoad()` and `confirmablePick()`; unresolved count prevents a loggable total.
- **Load math — `src/lib/load/sum.ts`, `loads.ts`, `setup.ts`, `solver.ts`, `loadAt.ts`:** support one or two loaded horns throughout summing, solving, construction and copying.
- Keep barbells symmetric with two sleeves; machines always exclude competition collars; sleeve capacity remains a per-horn constraint.
- **`src/lib/load/increments.ts`, `steps.ts`, `compare.ts`, `format.ts`:** thread count through increments, stepping, `platesOnly()` and explanatory formatting.
- Update `collarsOf()`/`otherOf()` in `loads.ts` so a single-horn load is not interpreted as having an unexplained negative residual.
- **`src/components/load/PlateMachineInput.tsx`:** ask unknown horn count once per machine/gym, independently of starting resistance; expose a change action later.
- **`src/components/load/BarQuestion.tsx`, `EquipmentWeightSheet.tsx`, `src/lib/equipmentPrompt.ts`:** reuse existing first-use question, save guard and error patterns for the count choice.
- **`src/components/load/PlateDiagram.tsx`, `TypeItSheet.tsx`:** pass count into all math/solver calls; use “On this machine” for one horn and “Each side” for two.
- **`src/components/load/BarPicture.tsx`, `BarSvg.tsx`, `src/data/glossary.ts`:** align captions, accessibility descriptions and help text with the actual count.
- **`src/screens/workout/SetLoadInput.tsx`, `EditSetSheet.tsx`:** pass the logged load’s count when editing, just as `ownBar` preserves its original starting resistance.
- **`src/lib/import/importPlan.ts`:** extend `LoadContext`/`buildLoad()` so machine imports use explicit geometry; unresolved geometry stays uncertain with the source number preserved.
- **`src/screens/settings/ImportReview.tsx`, `ImportSetSheet.tsx`:** supply that context and reuse the same question/editor; imported-load previews use snapshot geometry.
- **Strict lower load — `src/lib/load/steps.ts`:** replace nearest-rounding logic in `stepDown()` with a solver query for the greatest reachable total strictly below `value`.
- Add the strict-lower operation in `solver.ts`; do not approximate it by repeatedly subtracting the nominal increment or floating-point epsilon.
- **`src/lib/load/coach.ts`:** keep `scaledWeight()`’s fallback to `stepDown()` when a lighter target rounds back to the current resistance.
- **Storage admission — `src/screens/workout/rowLog.ts`:** coordinate `submitRow()` admission with `withSessionLock()` and verify the session is active before journaling.
- **New `src/db/submittedDrafts.ts`:** read mirror submissions and judge them against existing submissions, sets, tombstones and cancellation receipts; reuse pure payload/reconciliation helpers.
- **`src/db/workoutFinish.ts`:** call that check inside `finishLocked()`’s transaction; unresolved submissions throw `UnsavedWritesError` before cleanup or plan advancement.
- **`src/screens/workout/rowLog.ts`, `useFinish.ts`:** make durable-only failed drafts available to `failedRows()` and the unsaved sheet, including Retry and operation-specific cancellation.
- **`src/db/discard.ts`:** extend `Discarded`, `discardEmptyWorkout()` and `undoDiscard()` to snapshot/restore pending drafts, extra rows and rest transactionally.
- Serialize Discard against Log admission; refuse in-flight writes/held corrections, while preserving the mirror-only failed draft for the required Discard → Undo path.
- **`src/screens/TodayScreen.tsx`:** move draft deletion into the discard operation; after successful Undo, restore runtime state using the existing pending-state restoration helpers.
- **`src/lib/drafts.ts`:** `draftsDurableMerge()` must apply only dirty updates and explicit deletions; remove the clean-row insertion caused by `|| !validDraft(theirs)`.
- Publish the committed merged state back to memory/hydration after transaction success, without overwriting edits made while that transaction ran.

**3) Data model and migration**

- Proposed additive fields: `Load.hornCount?: 1 | 2`, `EquipmentWeight.hornCount?: 1 | 2`, and corresponding resolved geometry in `LoadSetup`.
- `perSide` remains the plates on one horn; the snapshot count establishes whether that list contributes once or twice.
- New machine loads require a resolved count. Missing count on an existing saved load means its **legacy two-horn interpretation**, preserving its saved total.
- Do not backfill gym answers from historical totals: an old doubled total does not prove the physical machine had two horns.
- Starting-resistance saves must merge geometry metadata; changing the gym’s unit resets weight answers but can retain the unitless horn answer.
- Add `CoachTarget.added?` and `PlannedChange.toAdded?`; absent fields preserve existing pin-only targets. Keep `to`/`value` as picked pin values.
- No new table or index is necessary. Current schema is **v11**; optional fields can remain additive without a Dexie version bump.
- Add compatibility/migration tests anyway: old records unchanged, missing geometry remains unresolved for new input, new fields survive reopen and backup restore.
- Update `src/lib/backupChecks.ts` to reject invalid counts while accepting old loads/gyms; nested drafts, journal entries and tombstones must retain geometry.
- Do not rewrite submission fingerprints: `payloadFp()` already includes every load field, so modifying legacy snapshots would invalidate receipt evidence.

**4) Tricky cases and handling**

- Restore can commit successfully and then fail loading approvals. Retry must load the committed registry without rerunning a destructive restore.
- Approval tests need a candidate outside the existing ladder/name fallback; otherwise a fixture can pass without exercising approval-dependent resolution.
- Isolate module registries between tests: `src/data/plans.ts` caches `SAVED`/`BY_ID`, which can conceal startup failures.
- For stack targets, scale/estimate the whole resistance, then reconstruct the pin; never pass a total as the pin while also retaining the add-on.
- If retaining an add-on requires a zero/negative or invalid pin, choose an explicitly represented alternative or return an honest unavailable target.
- Compare lighter targets by total resistance and beginner caps by complete resistance; preserve existing dumbbell “each hand” semantics.
- Resolve horn questions independently: “Plates only” answers starting resistance, not horn count.
- Saving a count asynchronously must use the latest selected plates and current gym identity; failed saves leave the question unresolved.
- Historical Edit, Retry and Undo use snapshot geometry even after the gym’s answer changes; merely opening an editor must preserve the total.
- Strict-lower solving must respect the empty base plus collars, sparse inventories, sleeve thickness and machine collar exclusion.
- A durable submitted draft with a matching receipt is already committed; one explicitly cancelled is resolved. Neither should block Finish forever.
- Discard/Undo must restore submitted marks, operation IDs, gym ID and load breakdown, plus rest deadlines rather than restarting timers.
- For storage findings (6) and (7), first reproduce using one page/context and an actual failing write path; direct database seeding alone does not establish the requested one-tab defect.

**5) Tests to write**

- **`src/db/__tests__/savedPlans-3.5.test.ts`:** cold registry load, Merge and Replace restore an approval-dependent plan with identical exercises and active-plan position.
- Cover approval-read failure, plan-read failure and registration failure: no false success; Retry works; already-restored data is not replaced again.
- **`src/lib/__tests__/backup.test.ts`:** parse the same backup with an empty live gate; validate its own approvals without changing the live gate.
- **`src/lib/__tests__/load-coach-3.8.test.ts`:** beginner stack examples in lb/kg use whole resistance, obey the cap and reconstruct the expected total.
- **`src/lib/__tests__/codex-recovery-resistance-math.test.ts`:** extend all three recovery routes to assert pin, add-on and total through `targetOf()` and target reconstruction.
- **`src/db/__tests__/coach-3.8.test.ts`:** apply/reopen/Undo preserves explicit stack targets and their previous targets.
- **`src/db/__tests__/log-gym-3.8b.test.ts`:** first submission at A, failed journal, switch to B, call `markSubmitted()` again, Retry twice → exactly one set attributed to A.
- Add a fresh post-resolution submission asserting B is captured; test `submitted: 0` explicitly.
- **New `src/lib/__tests__/machine-horns-3.6w.test.ts`:** one/two horns, lb/kg, zero/nonzero start, exact and nearest solves, sleeve capacity, copying and unknown geometry.
- Use literal expected totals and independently enumerated plate combinations; assert barbell totals/collars remain unchanged.
- **`src/lib/__tests__/codex-short-sleeve-coach.test.ts`:** replace `it.fails` with `it`; preserve its independent expected inventory totals.
- Extend strict-lower coverage to minimum load, fractional plates, one-horn machines and no valid lower loading.
- **`src/db/__tests__/equipment.test.ts`:** answers are machine/gym scoped; start changes preserve count; unit changes handle count separately from weights.
- **`src/lib/import/__tests__/importPlan.test.ts`:** explicit one-horn imports save once-counted plates; unknown count remains uncertain; legacy source values remain visible.
- **`src/db/__tests__/migration.test.ts`:** old sets, receipts, tombstones and journal payloads remain unchanged; new geometry/target fields survive close/reopen.
- **New `src/db/__tests__/carryover-3.6w-storage.test.ts`:** fail journaling through `submitRow()`, leave only durable submitted evidence, then assert Finish refuses without deleting anything.
- Continue through restart → Retry twice → Finish: exact payload saved once; cancellation resolves only the operation shown.
- Same file: failed first Log and ordinary pending picks → Discard → Undo → reopen restores exact draft, extra rows and rest.
- **`src/lib/__tests__/codex-draft-storage-recovery.test.ts`:** blocked localStorage, clean cached row deliberately removed, another row logged → removed row stays absent in memory, durable storage and after restart.
- Include a concurrently edited dirty row control, proving committed-state refresh does not erase new input.
- **New `tests/verify-3.6w.spec.ts`:** use `tests/fixtures.ts` and `tests/helpers/idb.ts`; inject failures at the relevant IDB store operation, rather than disabling all storage.
- Browser journeys: approval-dependent backup through the real file picker; failed startup then Retry; beginner stack target accepted and logged; lighter-week target accepted and logged.
- Browser journeys: unknown horn question → single horn → plates-only → add 45 → type-total solve → log → reload; verify displayed total, drawing labels and stored breakdown.
- Browser journeys: failed Log → switch gym → row-check retry; mirror-only failure → Finish sheet → Retry; failed first Log → Today Discard → Undo.
- Run those journeys on WebKit **iPhone SE (375×667)** and **iPhone 17 Pro Max (440×956)**, with screenshots and newly mounted controls checked at 130% text.
- Assert no overflow/clipping, reachable primary actions, 48 pt targets, no duplicate sets, and no console errors/unhandled rejections; mark applicable cases `@matrix`.
- Builder validation: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, golden suite, then the targeted spec with both named iPhone projects and `--retries=0`.

**6) Risks and conflicts with built code**

- The existing lighter-week regression already passes because it accepts a **pin-only** target with the right total; strengthen it to verify the required explicit split.
- `CoachList` currently renders `.to` directly, and `targetOf()` stores only `.to`; changing reconstruction without both consumers creates misleading UI.
- `RECORD_CHECKS.plans` and `planStateOk()` validate before restore, so reordering post-restore loaders alone does not cover a fresh-phone backup journey.
- Existing `it.fails` cases in `codex-cross-tab-submission-evidence.test.ts` are explicitly deferred; add the required one-tab reproductions without relabelling all cross-tab failures as solved.
- Locking must avoid nested acquisition of the same session lock; share internal locked operations instead of calling public locked entry points recursively.
- Five likely touched files already exceed 400 lines: `drafts.ts` 563, `setTable.ts` 514, `db/types.ts` 433, `SetLoadInput.tsx` 422, `rowLog.ts` 405.
- Split those by responsibility, retain public exports, and lower `scripts/size-baseline.json`; keep new files around 300 lines and avoid adding screen→DB boundary exemptions.
- Preserve `src/lib/load/index.ts` exports and update callers/tests deliberately when geometry becomes explicit; defaulting every machine to two horns would retain the defect.
- Existing matrix debt belongs to 3.6v. Report pre-existing failures separately; this item still needs passing targeted tests and golden paths before handoff.