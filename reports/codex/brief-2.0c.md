Codex brief for PLAN item 2.0c, written Oct 25 17:41 at commit 98e602c. SPEC.md wins if they disagree; code may have moved since.

Implementation brief for [PLAN.md:55](/Users/rabah/projects/anygym/PLAN.md:55), item **2.0c — Codex weights carry over**. Read-only review; no files edited or tests run.
Scope is the six fixes listed in 2.0c, supported by the 1651-weights and 1722-tests reports.

**1) Applicable SPEC and acceptance checks**

- **SPEC 0, 3, 5.3–5.5:** preserve the unit entered, validate plates against that unit and gym inventory, and calculate loads only through `src/lib/load.ts`.
- **SPEC 2:** gym changes and any historical identity updates commit in one Dexie transaction.
- **SPEC 6:** Smith history stays gym-specific; free-bar history remains shared; unresolved bar identities produce no suggested weight or record.
- **SPEC 9.3:** import edits preserve the user’s actual answer; invalid edits cannot silently restore the source weight or mark a set checked.
- **SPEC 13.3:** drafts, clears, and rest survive restart despite unavailable localStorage; asynchronous completion cannot overwrite newer selections.
- **SPEC 13.1–13.4, 20.2, 21.1:** keep the existing sheet/table flow, stable row targeting, plain errors, reachable controls, and correct LAST TIME values.
- **SPEC 24:** queued reporting respects server retry timing while retaining its request ID and existing privacy rules.
- Acceptance A: open **65 lb** picker, change the gym to kg elsewhere; Done and drag-to-apply cannot create a **40 kg** draft.
- Acceptance B: clear an imported **53 lb** kettlebell weight or enter **501**; Save stays disabled and the edit remains unconfirmed.
- Acceptance C: delay Olympic→Smith selection, add 10s to `[45]`, release save; picker, draft, and saved set retain `[45,10]`, **110 lb**.
- Acceptance D: throwing localStorage getter and timestamp-only write failure still produce current IndexedDB mirror rows, including null clears.
- Acceptance E: change units or the Smith answer; legacy Smith sets never enter Olympic LAST TIME, progression, or records.
- Acceptance F: browser-readable `Retry-After: 120` schedules the queued report at least 120 seconds later.

**2) Files to change and implementation**

- [src/screens/workout/WeightSheet.tsx](/Users/rabah/projects/anygym/src/screens/workout/WeightSheet.tsx): extend `WeightPick` with required originating `unit: Unit`.
- In `WeightBody()`, retain that unit independently of the current `gym.unit`; update it only when the user makes a fresh selection.
- Use `pickProblem()` with the pick’s originating unit before rebuilding or confirming; a non-null `currentLoad()` alone is insufficient.
- Replace the broad plates-present `canDone` fallback with validation that the base is genuinely unknown and the plate unit/inventory are valid.
- Route both Done and `commit.current` through the same guarded confirmation function; prevent drag-close from applying invalid selections.
- [src/screens/workout/ExerciseView.tsx](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx): update `startPick()`, the empty start object, and `applyWeight()` for the new unit.
- `applyWeight()` must validate again before changing any row; reject a stale pick with a plain notice.
- Fix `writeRow()` so an explicit `patch.unit` wins over its current unconditional `unit: gym.unit` assignment.
- Preserve `rowById()` targeting and propagation to subsequent working rows, excluding warmups.
- [src/screens/workout/exerciseLoad.ts](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts): reuse `pickProblem()`, `barIdFor()`, and `machineIdFor()` for validation.
- If sharing confirmation eligibility, add a small named helper here; keep all load construction in existing `load.ts` functions.
- [src/screens/workout/SetLoadInput.tsx](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx): fix `BarbellField.choose()` to read current plates after `await saveBarChoice()`.
- Maintain a plate ref updated synchronously inside `change()`; an effect-only ref update can still miss a same-turn selection.
- Serialize bar-choice writes or otherwise ensure the latest choice wins in both Dexie and UI; a UI-only generation check leaves stale settings possible.
- Expose choice-pending state to parents and clear it in `finally`; failures retain the prior bar and current plates.
- Apply the same current-selection discipline to `BarQuestion.onSaved` and `EquipmentWeightSheet.onSaved`, including gym/unit changes during the write.
- [src/screens/workout/EditSetSheet.tsx](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx): disable and guard Save while its load input is settling.
- [src/screens/settings/ImportSetSheet.tsx](/Users/rabah/projects/anygym/src/screens/settings/ImportSetSheet.tsx): track whether weight was edited, separately from the current `Load | null`.
- Disable and guard `save()` when a changed weight is invalid or a bar choice is pending; reference inequality is not sufficient edit tracking.
- Keep reps-only edits of foreign-unit historical loads valid and preserve their original weight.
- [src/lib/import/importPlan.ts](/Users/rabah/projects/anygym/src/lib/import/importPlan.ts): change `SetEdit.load` to `load?: Load | null`.
- In `planImport()`, distinguish property absence from explicit null; replace `edit.load ?? built.load` with property-presence resolution.
- Explicit null produces no load and remains uncertain, even with `ok: true`; update `edited`, reason, and source-note handling accordingly.
- Keep `chooseKind()` clearing old load edits and approval when the loading kind changes.
- [src/screens/settings/ImportReview.tsx](/Users/rabah/projects/anygym/src/screens/settings/ImportReview.tsx): retain explicit null when merging edits; verify reopen/Skip cannot resurrect source loads.
- [src/lib/durable.ts](/Users/rabah/projects/anygym/src/lib/durable.ts): allow `mirrorValue(null, key, value)` when phone storage is also unavailable.
- Preserve the guard against mirroring arbitrary injected storage and keys outside `DURABLE_KEYS`.
- In `mirror()`, snapshot value and stamp, attempt timestamp persistence separately, and attempt `db.kv.put()` regardless of timestamp failure.
- In `restoreMirrors()`, advance the stamp clock from restored rows even when localStorage is null.
- [src/lib/drafts.ts](/Users/rabah/projects/anygym/src/lib/drafts.ts): add the null-storage fallback to `mirror()` and remove the persistence-skipping return in `clearSessionDrafts()`.
- Audit `replaceDrafts()` too: every durable value or removal must reach IndexedDB when localStorage is unavailable.
- [src/lib/rest.ts](/Users/rabah/projects/anygym/src/lib/rest.ts): make `saveRest()` explicitly mirror its serialized value when storage is null; cover clears too.
- [src/db/history.ts](/Users/rabah/projects/anygym/src/db/history.ts): make `legacyBarOf()` return unresolved when evidence is missing, incompatible, or ambiguous.
- Add a shared proposed `preserveLegacyBarsForGym()` helper that resolves historical loads against the gym **before** its configuration changes.
- [src/db/equipment.ts](/Users/rabah/projects/anygym/src/db/equipment.ts): call that helper inside `setGymUnit()` and bar-affecting `setEquipmentWeight()` transactions.
- [src/db/exerciseSettings.ts](/Users/rabah/projects/anygym/src/db/exerciseSettings.ts): reuse it in `saveBarChoice()` rather than retaining separate preservation logic.
- [workers/anygym-api/src/http.ts](/Users/rabah/projects/anygym/workers/anygym-api/src/http.ts): add `Access-Control-Expose-Headers: Retry-After` to `corsHeaders()`.
- [src/lib/reporting/transport.ts](/Users/rabah/projects/anygym/src/lib/reporting/transport.ts): retain `post()` header reading and `classify()`; ensure forced drains cannot bypass a server retry minimum.
- Implement that minimum with an optional queue deadline in `ReportQueueRow`, persisted by `retryLater()` and checked by `claimNext()` even for `dueBy = Infinity`.
- Corresponding files: [reporting/types.ts](/Users/rabah/projects/anygym/src/lib/reporting/types.ts) and [db/reports.ts](/Users/rabah/projects/anygym/src/db/reports.ts).
- New files are primarily the focused regression suites listed below; no new screen or dependency is needed.

**3) Data model and Dexie changes**

- Current [schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) is **v9**; existing `kv` already supports `{ key, value: string | null, at }`.
- `WeightPick.unit` is transient; persisted `Draft.unit` already exists. Do not add another draft-unit field.
- `SetEdit.load: null` is an in-memory review answer; it does not require a database migration.
- Preserve resolvable historical identities by adding existing `load.barId`, without changing totals, units, plates, set IDs, or order.
- Persist unresolved decisions too; otherwise an ambiguous 45 lb bar can become “Olympic” after the Smith answer is reset.
- Suggested additive field in [types.ts](/Users/rabah/projects/anygym/src/db/types.ts): `Load.legacyBarUnresolved?: true`; the resolver checks it before inference.
- Update [src/lib/backup.ts](/Users/rabah/projects/anygym/src/lib/backup.ts) to validate that marker and reject contradictory resolved/unresolved identities.
- Resolve exercise defaults from `planExercise()`/`barForName()`; never infer historical identity from today’s user-selected bar.
- Preserve the marker during reps-only edits; remove it only after an explicit, successful bar identification.
- Add optional `retryAfterUntil?: number` to queue rows; missing means the existing retry behavior.
- These are non-indexed additive fields, so no schema bump is required for the recommended approach.
- If implementing an eager backfill instead, append v10 and test opening populated v9 data; never edit shipped schema definitions.
- A configuration-write failure must roll back identity additions and the gym/settings change together.

**4) Tricky edge cases**

- A shared numeric plate size, such as 10, proves nothing about its unit; never re-stamp retained lb plates as kg.
- A fresh selection after unit change must start from the new inventory, without silently retaining old plates.
- Unknown base and invalid selection are different states; only the former permits retaining validated plates without a load.
- Smith base **0** is known “plates only”; use null checks, not truthiness.
- Successful delayed bar writes are the reproduction; testing only immediate rejection misses the lost-plates race.
- Closing/unmounting or changing gym during a bar save must prevent obsolete completion from updating another picker.
- Clearing a changed import weight cannot become `{ ok: true }` with the load omitted.
- Untouched uncertain or weightless source sets retain the existing honest review flow; do not block all such sets.
- Null mirror rows are durable removals; deleting the mirror itself permits stale localStorage drafts to return.
- Test multiple rapid saves followed by clear; the latest value must win, and restore stamps must remain increasing.
- Treat IndexedDB failure separately from localStorage failure; do not claim durability solely because the UI retained memory.
- Unknown legacy identity stays visible in session detail while excluded from equipment comparisons.
- Keep identity preservation scoped to the affected gym, including exercise aliases and explicitly identified sets.
- A constructed JavaScript `Response` bypasses CORS filtering; it cannot prove `Retry-After` is browser-readable.

**5) Tests to write and assertions**

- Create `src/screens/workout/__tests__/weights-2.0c.test.tsx` using the repo’s existing React server-render/handler testing patterns where applicable.
- Assert originating-unit validation rejects the 65 lb→kg pick, including null-load plates and drag confirmation.
- Assert fresh kg selection succeeds, disabled inventory fails, and known zero-base Smith succeeds.
- Hold `saveBarChoice()` with a deferred promise; add plates, release it, and assert `[45,10]`, Smith identity, and 110 lb.
- Assert two successive choices cannot persist an older choice last; failure/unmount does not apply stale values.
- Extend `src/lib/import/__tests__/importPlan.test.ts`: absent load retains source, replacement wins, explicit null never falls back.
- Assert explicit null stays uncertain despite `ok`, and `chooseKind()` removes both cleared/replacement load answers and approval.
- Add import-sheet handler coverage for clear, 501, valid replacement, and untouched foreign-unit reps-only edits.
- Extend `src/lib/__tests__/durable.test.ts`: timestamp-only failure still stores the exact draft/rest value and newer stamp.
- Replace the weak “resolves undefined” assertion with database-content and subsequent restore assertions.
- Create `src/lib/__tests__/drafts-2.0c.test.ts`: throwing getter, 53 lb/17 reps, await mirror, discard module memory, hydrate, assert exact recovery.
- Repeat for `clearDraft()`, `clearSessionDrafts()`, and rest clear; assert no resurrection and unchanged rest deadline.
- Extend `src/db/__tests__/fixes-1.7k-weights.test.ts`: preserve Smith identity through `setGymUnit()` and `setEquipmentWeight()`.
- Assert `getPastSessions()`, `lastSessionSets()`, and `workoutRecords()` remain uncontaminated across gyms.
- Cover equal Smith/free-bar weights, missing gym, mismatched units, aliases, explicit `barId`, repeat calls, and transactional rollback.
- Update older tests that currently assert missing evidence defaults to Olympic; those expectations conflict with this fix.
- Extend backup tests with resolved/unresolved identity round trips and unchanged saved load numbers.
- Extend `workers/anygym-api/src/__tests__/api.test.ts`: allowed-origin 429 exposes `Retry-After`; origin rejection remains enforced.
- Extend `src/lib/reporting/__tests__/transport.test.ts`: exact 120-second deadline, no early normal/forced retry, same request ID after expiry.
- Create `tests/weights-2.0c.spec.ts`, importing `test`/`expect` from `./fixtures`; tag functional cases `@matrix`.
- Use a second page in the same context to change gym units while the first page’s Weight sheet remains mounted.
- Assert Done stays disabled, dismissal applies nothing, no 40 kg draft/set exists, and a fresh selection logs its exact value.
- Add the delayed bar-choice browser reproduction; inspect diagram, draft, saved set, and post-reload state.
- Create `tests/import-2.0c.spec.ts` with synthetic 53 lb kettlebell history; clear/501 cannot save, valid replacement imports exactly.
- Add storage-failure reload tests, waiting for actual `kv` persistence before reload; use existing hard-kill helpers for termination coverage.
- Create `tests/report-cors-2.0c.spec.ts`: serve a second localhost-port endpoint and use actual browser fetch through `createTransport({ base })`.
- Assert header visibility and persisted 120-second queue deadline; avoid the fixture’s production-host fetch shim.
- Run all new UI cases on **iPhone SE 375×667** and **iPhone 17 Pro Max 440×956**, both WebKit.
- Check sheet bounds, reachable Done/Save, no horizontal overflow, 130% text, and before/after screenshots plus flow videos per SPEC 23.4.
- Run focused suites, `npm run build`, Worker typecheck, then `npm test` and `PW_FULL_MATRIX=1 npx playwright test`.

**6) Risks and conflicts with existing code**

- The checkout already contains uncommitted 2.0a changes, tests, and screenshots; preserve them and isolate the 2.0c diff.
- 2.0b touches plate rendering; avoid geometry changes here and coordinate tests/selectors around its final diagram.
- Existing 1.7i unit protection covers stored drafts but is bypassed by unitless `WeightPick`; repairing only `currentLoad()` leaves that bypass.
- Existing 1.7k `saveBarChoice()` preserves resolvable legacy bars, but equipment/unit setters do not; ambiguous identities are not frozen.
- Existing legacy tests explicitly bless some fallback-to-Olympic behavior; revise expectations with the implementation.
- `SetLoadInput` is shared by workout, historical edit, import, and dev screens; pending-choice plumbing must not rebuild untouched historical loads.
- `extraSets.ts` already has direct IndexedDB fallback for null storage; preserve its behavior while changing shared durability helpers.
- Forced reporting drains currently bypass backoff on startup, foreground, online, and Send; CORS exposure alone does not enforce the server minimum.
- Worker headers require a separate Worker deployment; publishing the frontend alone cannot complete acceptance F.
- The other test-harness findings in 1722—touch injection, transaction-boundary kills, discovery, backup completeness—are separate work beyond these six reproductions.