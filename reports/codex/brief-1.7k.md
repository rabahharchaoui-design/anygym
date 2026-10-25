Codex brief for PLAN item 1.7k, written Oct 25 14:09 at commit 218567d. SPEC.md wins if they disagree; code may have moved since.

Implementation brief for [PLAN.md:48](/Users/rabah/projects/anygym/PLAN.md:48), item **1.7k**. Read-only review; no files edited and no tests run.

**1) Applicable SPEC sections and acceptance checks**

- **§§0, 2:** offline operation, no personal data in automatic reports, transactional writes, and no lost workout state.
- **§§3, 5.3–5.5:** supported plate sizes depend on unit; stored loads retain their original unit and breakdown.
- **§6 rules 1, 2, 7:** progression uses working sets, recognizes equivalent resistance across units, and chooses equipment available today.
- **§§9.1–9.2:** damaged backups are rejected before mutation; valid backups retain round-trip behavior.
- **§13.1:** Undo remains recoverable after a failed write; errors use plain messages and offer retry.
- **§§13.3–13.5:** restart recovery, race resistance, zero unexpected console errors, 48pt controls, safe areas, and 130% text.
- **§§20.2, 21.1:** weight changes propagate downward from the intended working row; warmups retain their separate behavior.
- **§24:** automatic diagnostic context excludes personal text; reporting remains queued offline, deduplicated, and controlled by the privacy toggle.
- **Undo acceptance:** reject the tombstone acceptance write, restart after its expiry, and retain either the restored set or a recoverable unresolved Undo; Finish cannot discard it.
- **Backup acceptance:** unsupported inventory or breakdown plates return `DAMAGED`; existing tables and drafts remain unchanged.
- **Editor acceptance:** a delayed commit cannot redirect weight or set-type changes to a neighboring row.
- **Privacy acceptance:** `account alice smith at 14 oak street failed` never survives in automatic messages, signatures, error context, or phone pushes.
- **Report acceptance:** completion of report A cannot alter report B opened afterward.
- **Extra-row acceptance:** added rows survive restart while localStorage continues rejecting writes.
- **Progression acceptance:** equivalent 20 kg and approximately 44.09245 lb working sets reaching the rep ceiling earn the available 22 kg target.

**2) Files to create/change and implementation**

- [src/db/tombstones.ts](/Users/rabah/projects/anygym/src/db/tombstones.ts): extend `undoDelete()`, `expireDelete()`, `recoverDeletes()`, and `cancelUndo()` to account for durable Undo intent.
- Create `src/db/undoIntents.ts`; proposed helpers: `rememberUndo()`, `readUndoIntents()`, and `forgetUndo()`, using existing `db.kv`.
- Persist intent before attempting acceptance/restore, so failure of `acceptUndo()` leaves a durable recovery record.
- Use one key per session/set, avoiding read-modify-write races between multiple unresolved Undos.
- Do not use `mirrorValue()` for this correctness-critical write: it deliberately swallows persistence failures.
- [src/lib/deleteUndo.ts](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts): extend `createDeleteUndo()` with hydration of unresolved records, including each tombstone’s exact saved set.
- Hydrated records must have no expiry timer; `unresolved()`, `close()`, `undo()`, and `cancel()` must work immediately after hydration.
- [src/screens/workout/sessionRecovery.ts](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts): hydrate `deletesFor()`’s manager before `recoverSession()` examines expirations.
- Add a shared per-session readiness promise; concurrent mounts and Finish must await the same hydration/recovery operation.
- [src/screens/workout/WorkoutScreen.tsx](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx): make `finishNow()` await recovery readiness before `deletes.close()`.
- Recovery failure must block Finish with retry; the current fire-and-forget `recoverSession(...).catch(() => undefined)` is insufficient.
- [src/db/workouts.ts](/Users/rabah/projects/anygym/src/db/workouts.ts): include `kv` in affected transactions; `restoreSet()` clears intent atomically with restoration and tombstone removal.
- Protect `finishWorkout()` against unresolved durable intents directly; its current transaction deletes all remaining tombstones.
- Cancellation must atomically clear tombstone and intent; failed cancellation keeps the Undo unresolved.
- [src/lib/backup.ts](/Users/rabah/projects/anygym/src/lib/backup.ts): strengthen `RECORD_CHECKS.gyms`, `isLoad`, `isDraft`, and `parseBackup()` using `PLATE_SPECS`.
- Validate every inventory entry against its gym unit, including disabled entries; validate `Load.perSide` against the load’s own unit.
- Cover loads in sets, tombstone sets, journal drafts, and exported drafts; also validate draft-only `plates`.
- Resolve draft plate units from `draft.load.unit`, then `draft.unit`, then the referenced session’s gym for legacy drafts.
- [src/db/backup.ts](/Users/rabah/projects/anygym/src/db/backup.ts): preserve unresolved fallback intent during export, preferably by representing it as `undo: true` in exported tombstones.
- Keep `restoreReplace()`/`restoreMerge()` transactional; clear stale Undo-intent keys on Replace without clearing reporting preferences or queues.
- [src/screens/workout/ExerciseView.tsx](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx): replace `picking`/pending `typing` row-index targets with stable draft IDs.
- When opening an editor, materialize an undrafted row through existing `rowDraft()`, `saveDraft()`/`writeDrafts()`, and `rowKey()`.
- Update `applyWeight()` and `pickType()` to resolve that ID’s current slot from `rowsOf()` before applying changes.
- Apply downward weight propagation from the resolved position and current type; retain `writeRow()`’s revisions and ownership flags.
- [src/lib/setTable.ts](/Users/rabah/projects/anygym/src/lib/setTable.ts): expose draft identity through `PendingRow`/`pendingRows()`, or add a shared identity resolver; retain slot-based storage.
- Preserve `reconcileRows()` and `successorOf()` semantics; committed IDs and replacement drafts must never be confused.
- [src/lib/reporting/mask.ts](/Users/rabah/projects/anygym/src/lib/reporting/mask.ts): keep `maskText()` for authored feedback; add a separate automatic-error formatter with fixed messages and allowlisted codes.
- Restrict `maskRoute()` to actual templates from `src/App.tsx`; its current lowercase-segment rule accepts arbitrary text.
- Restrict `maskStack()` to approved application script references and numeric positions; do not forward arbitrary function names or filenames.
- [src/lib/reporting/diagnostics.ts](/Users/rabah/projects/anygym/src/lib/reporting/diagnostics.ts): route `pushError()`/`installConsoleRing()` through the automatic formatter.
- [src/lib/reporting/capture.ts](/Users/rabah/projects/anygym/src/lib/reporting/capture.ts): build crash messages/signatures from approved code plus sanitized location; preserve browser-noise exclusions.
- [src/lib/reporting/feedback.ts](/Users/rabah/projects/anygym/src/lib/reporting/feedback.ts): mask authored `message` before queueing; ensure `errors` already contain only approved diagnostics.
- [src/lib/reporting/transport.ts](/Users/rabah/projects/anygym/src/lib/reporting/transport.ts): sanitize old queued payloads before sending; an updated app must not transmit previously stored raw diagnostics.
- [workers/anygym-api/src/validate.ts](/Users/rabah/projects/anygym/workers/anygym-api/src/validate.ts): independently normalize automatic fields and mask feedback text; field allowlisting alone currently permits raw strings.
- [workers/anygym-api/src/handlers.ts](/Users/rabah/projects/anygym/workers/anygym-api/src/handlers.ts): pass the resulting report `id` into `formatPush()`; pushes should contain fixed copy, report reference, and approved screen.
- [src/screens/settings/ReportProblemSheet.tsx](/Users/rabah/projects/anygym/src/screens/settings/ReportProblemSheet.tsx): add a generation token per opening/submission; guard every asynchronous success, failure, busy, and `sending` update.
- Keep screenshot generation independent: the existing `pick` token also changes when selecting/removing screenshots.
- [src/lib/extraSets.ts](/Users/rabah/projects/anygym/src/lib/extraSets.ts): export `EXTRA_SETS_KEY`, add `hydrateExtraSets()`, and call `mirrorValue()` when add/clear localStorage writes fail.
- [src/main.tsx](/Users/rabah/projects/anygym/src/main.tsx): register the extra-set hydrator with existing `restoreMirrors()` before React mounts.
- [src/lib/progression.ts](/Users/rabah/projects/anygym/src/lib/progression.ts): replace `sameLoad()` with existing `sameResistance()` in both `sameAll` and the bodyweight streak comparison.

**3) Data model and Dexie migrations**

- Current schema is **v9**; `kv` already exists from v7. No new table, index, or Dexie version is necessary.
- Proposed intent row: `{ key: "anygym-undo:<sessionId>:<setId>", value: JSON.stringify({ sessionId, setId }), at }`.
- The tombstone remains authoritative for the deleted `WorkoutSet`; avoid duplicating its load/order data in another mutable record.
- Read Undo keys explicitly through the recovery barrier; they need not become localStorage-mirrored `DURABLE_KEYS`.
- Continue using existing tombstone `undo?: boolean`; legacy records without fallback intent retain normal expiry.
- Extra-set storage retains `{ sessionId, extra: Record<string, number> }` under `anygym-extra-sets`.
- Reporting can retain current string payload columns by encoding approved diagnostics in those strings; no D1 migration is required.
- Keep `kv` excluded from wholesale backup export; normalize Undo semantics into existing backup tombstones instead.

**4) Tricky edge cases and handling**

- **Expiry races acceptance:** `expireDelete()` must check durable intent inside its transaction; an in-memory `keep` callback alone cannot protect another launch.
- **Recovery races Finish:** share and await readiness; do not rely on effect ordering or a disabled button alone.
- **Multiple failed Undos:** hydrate every ID, allow individual retry/cancellation, and keep Finish blocked until all resolve.
- **Both persistence paths fail:** surface failure and retain the in-memory blocker; never report Undo as durable when no write committed.
- **Crash during cleanup:** restoration/cancellation and intent consumption must commit together, preventing stale intent from resurrecting a deleted set.
- **Edited row already committed:** close/refuse with a plain explanation; never retarget the new occupant of the old index.
- **Untouched row has no ID:** assign identity when opening the editor without marking target values as manual user edits.
- **Historical plate disabled today:** allow known sizes regardless of current inventory enablement; reject unknown sizes, not legitimate historical configurations.
- **Draft has old-unit plates:** validate using stored unit information; the current gym unit may have changed.
- **Stale report completion:** ignore A’s `finally`/error handlers too; otherwise A can unlock B’s Send while B is already submitting.
- **Extra-set clear fails:** mirror a null removal; otherwise finishing one workout can leave a stale count available after restart.
- **Equivalent loads:** use existing `sameResistance()` tolerance and kind checks; do not change global `sameLoad()` behavior used elsewhere.

**5) Tests to write and assertions**

- Create `src/db/__tests__/fixes-1.7k.test.ts`, using `fake-indexeddb` and existing workout helpers.
- Undo test: reject tombstone acceptance, verify a `kv` intent, dispose/recreate the manager, advance beyond expiry, and recover.
- Assert the exact original ID/order/load returns once, or unresolved state remains and Finish refuses while restore is still failing.
- Test failed retry and failed cancellation separately; both retain recoverability, while successful cancellation survives another restart.
- Race test: recovery/expiry and Finish cannot consume an unresolved intent; direct `finishWorkout()` is protected too.
- Extend `src/lib/__tests__/backup.test.ts` with unknown lb/kg inventory weights, disabled unknown entries, and wrong-unit sizes.
- Parameterize unknown breakdowns across saved sets, tombstones, journal drafts, and ordinary drafts; every parse returns `DAMAGED`.
- Extend `src/db/__tests__/backup.test.ts` for validation-before-restore and unresolved-Undo export/restore; existing data remains byte-identical on rejection.
- Extend `src/lib/__tests__/setTable.test.ts` or create `src/screens/workout/__tests__/fixes-1.7k.test.ts` for identity resolution after reconciliation shifts slots.
- Assert only the target and eligible following working rows change; preceding rows and unrelated warmups remain identical.
- Extend `src/lib/reporting/__tests__/{mask,diagnostics,capture,privacy,transport}.test.ts`.
- Assert lowercase names/addresses, arbitrary thrown objects, custom error names, URL queries, and stale queued messages cannot enter automatic payloads.
- Assert authored feedback retains useful masked text; approved code/location remains useful; unknown routes become a fixed fallback.
- Extend `workers/anygym-api/src/__tests__/api.test.ts`: submit raw unsafe automatic fields directly and inspect D1 rows plus captured ntfy bodies.
- Assert all push kinds contain approved text/reference only; preserve rate limits, request idempotency, and crash deduplication.
- Extend `src/lib/__tests__/extraSets.test.ts` and `durable.test.ts`: failed localStorage write, memory reset, hydration while still blocked, and durable clearing.
- Extend `src/lib/__tests__/progression.test.ts`: mixed-unit dumbbells advance to 22 kg; mixed-unit bodyweight reaches its three-session nudge; unequal resistance does neither.
- Create `tests/fixes-1.7k.spec.ts`; import `test`/`expect` from `./fixtures` and mark core flows `@matrix`.
- Delayed-log UI test: submit pending row 3, open row 2’s weight sheet, release the write, choose Done, and assert exact draft/set values after reload.
- Repeat with set type; test an editor whose target disappears and verify no neighbor receives the edit.
- Report UI test: hold A’s response, close/reopen, enter B, release A, and assert B remains editable/unsent; sending B creates its own request.
- Test stale success, queued, and failure completions; retain rapid-Send duplicate protection.
- Restart tests: failed Undo acceptance and failed extra-row localStorage writes, using `launchPersistent()`, `killHard()`, and `relaunchOffline()` from `tests/helpers/kill.ts`.
- Await the relevant IndexedDB commit before killing; verify offline recovery against database records, not only visible row counts.
- Run WebKit projects **iPhone SE (375×667)** and **iPhone 17 Pro Max (440×956)**; then run the existing full device matrix.
- Reuse `simulateSafeAreas()` and active-workout layout checks before scrolling; inspect sheets at 100%/130% text and record both iPhone flows.
- Validation commands: `npm run test`, `npm run build`, targeted Playwright with both named projects, then `PW_FULL_MATRIX=1 npx playwright test`.

**6) Risks and conflicts with existing code**

- `recoverSession()` currently preserves only manager-held unresolved IDs; recreating the manager without hydrating its records leaves retry/cancel broken.
- `finishWorkout()` restores accepted tombstones and deletes the rest; adding fallback persistence without changing this boundary still permits data loss.
- `mirrorValue()` ignores writes when localStorage is absent and swallows IndexedDB failures; extra-set handling must distinguish blocked writes from unavailable storage.
- Row IDs interact with submission receipts and deterministic successors from 1.7j; avoid minting replacement identities during every render.
- Existing privacy tests explicitly expect arbitrary diagnostic text to survive; replace those expectations with code/location assertions.
- SPEC §24 requests message excerpts in pushes, while 1.7k requires allowlisting; fixed report-reference pushes satisfy the stronger no-personal-data requirement.
- The referenced bug report contains **eight findings**, but 1.7k contains seven: tiny dumbbell steps still pass `validDumbbellRange()` and can stall `dumbbellsInRange()`; flag this separately.
- The working tree already contains modified/untracked files and generated reports; the builder must isolate its changes and avoid sweeping them into the commit.
- PLAN’s checkpoint requires both Pages and Worker deployment; a frontend deploy alone leaves server privacy behavior unchanged. Follow the session-branch/checkpoint workflow after verification.