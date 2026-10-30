**8 findings, worst first.** No files edited. Reviewed completed features against SPEC, PLAN, earlier reports, source, Vitest and Playwright tests. Typecheck passed. In-memory probes reproduced the recovery failures below; browser suites and physical iPhone behavior were not tested. Fixed earlier findings are excluded.

1. **MAJOR — STILL OPEN: Failed Undo can permanently lose a saved set.**  
   [sessionRecovery.ts:36](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:36), [tombstones.ts:59](/Users/rabah/projects/anygym/src/db/tombstones.ts:59)

   Delete succeeds, but Undo acceptance, its IndexedDB intent, and its localStorage fallback fail. Restart after five seconds treats the remaining tombstone as an expired ordinary deletion. **Reproduced: no set, tombstone, or unresolved recovery request remained.**

   **Exact fix:** Persist explicit finalization when an ordinary Undo window expires without an Undo request. On startup, retain unfinalized tombstones and offer Restore/Keep deleted instead of deleting them solely because time elapsed.

   **Mocked-away failure/test:** [verify-1.7k.spec.ts:34](/Users/rabah/projects/anygym/tests/verify-1.7k.spec.ts:34) rejects tombstone/set writes while leaving intent storage working. Add a case rejecting acceptance, `anygym-undo:*` writes, and localStorage fallback. Destroy runtime state, restart after expiry, and assert the exact deleted record remains recoverable and Finish requires resolution.

2. **MAJOR — STILL OPEN, partial fix: Restart forgets failed edits and permits Finish with old values.**  
   [logQueue.ts:82](/Users/rabah/projects/anygym/src/lib/logQueue.ts:82), [WorkoutScreen.tsx:436](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:436)

   Failed edits now block Finish during the current launch, but their payloads are retained only as closures in a memory map. Change 10 reps to 17, fail Save, then reload: the failure disappears and Finish can save the original 10 reps without retry/discard. **Queue-state loss reproduced; the complete browser sequence is source-traced.**

   **Exact fix:** Journal edit/type-change payloads before starting their writes. Remove journal entries transactionally on success; hydrate outstanding mutations before enabling Finish.

   **Mocked-away failure/test:** [weights-2.0c.test.ts:66](/Users/rabah/projects/anygym/src/screens/workout/__tests__/weights-2.0c.test.ts:66) substitutes a scalar `saved` variable and retains the same queue throughout. Add a browser test that fails a real 17-rep edit, reloads, verifies Finish remains blocked, then retries and checks exactly 17 reps persisted.

3. **MAJOR — NEW: Backup loses the active rest timer and added-set counts.**  
   [backup.ts:44](/Users/rabah/projects/anygym/src/db/backup.ts:44), [backup.ts:39](/Users/rabah/projects/anygym/src/lib/backup.ts:39)

   The backup includes drafts but neither `anygym-rest` nor `anygym-extra-sets`. Restoring an active workout onto another phone loses its countdown and added rows. **Reproduced in separate databases: the 17-rep draft returned, but one added row became zero and rest became null.** This violates SPEC 9.1’s “Export everything.”

   **Exact fix:** Add validated, optional active-rest and added-row fields to the backup format. Restore their durable mirrors in the restore transaction and hydrate runtime stores afterward. Replace must also clear stale destination values.

   **STILL OPEN assertion weakness/test:** [backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73) and [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97) derive snapshots and expected completeness from production’s `TABLE_NAMES`. An omitted category can disappear from both sides and pass. Add an independent literal backup contract, seed distinct sentinels plus active rest/extra rows, restore into a fresh database/storage context, and assert destination records and visible row counts directly.

4. **MAJOR — STILL OPEN, test gap: Hard-kill coverage misses transaction boundaries.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

   The tests kill after UI assertions and database snapshots. They cover settled-state recovery, but never deterministically interrupt Log reconciliation or Undo restoration—the critical SPEC 13.3 boundaries.

   **Counterexample:** A settled draft survives, while termination after set commit but before cleanup offers the same lift again. This is a coverage gap; I did not reproduce that duplication in current code.

   **Exact fix/test:** Add deterministic gates after journal persistence, before set commit, and after receipt commit/before reconciliation. SIGKILL at each gate, reopen offline, and assert one saved 19-rep set plus pending 7- and 8-rep rows exactly once. Repeat between Undo acceptance and restoration commit.

5. **MAJOR — STILL OPEN, test gap: Default execution omits acceptance tests on four devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

   Ordinary `npm run test:ui` filters Android and the 320 floor to `@matrix`. Kill and monkey tests lack that tag, so they do not run there despite SPEC 13.3–13.4.

   **Counterexample:** Chromium-only recovery failure passes the standard suite because the corresponding kill test is never selected.

   **Exact fix/test:** Make all seven projects run applicable functional tests by default; keep a separately named checkpoint subset if needed. Add a discovery-contract test comparing functional test IDs across projects and explicitly requiring kill and monkey cases.

6. **MAJOR — STILL OPEN, test gap: “Swipe” tests bypass native touch panning.**  
   [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [monkey.ts:181](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:181)

   Picker tests assign `scrollLeft`; monkey swipes use mouse dragging. Neither exercises the phone’s touch arbitration.

   **Counterexample:** A sheet’s `touch-action` blocks horizontal thumb scrolling, while direct scroll assignment and mouse input still pass. No current device defect was reproduced.

   **Exact fix/test:** Add native touch drags in Weight and Edit sheets using Chromium touch injection and an iOS simulator/device driver. Assert actual scroll movement, changed selection, and Done/Save persisting the displayed weight. Include nested sheets and left-edge Back gestures.

7. **MINOR — STILL OPEN, rest-state remainder: Finish → Undo drops an active countdown.**  
   [finishPending.ts:13](/Users/rabah/projects/anygym/src/lib/finishPending.ts:13), [WorkoutScreen.tsx:446](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:446)

   Pending drafts and added rows are now restored, but the snapshot excludes rest. Finish clears it; Undo cannot recover it. **Reproduced: the original rest deadline became null.**

   **Exact fix:** Include rest in the Finish snapshot and restore its original deadline transactionally during Undo. Preserve elapsed time rather than starting a fresh countdown.

   **Test:** Log a set, capture its rest deadline, Finish → Done → Undo, then reload. Assert the same deadline remains and the displayed remaining time reflects elapsed wall-clock time.

8. **MINOR — STILL OPEN, test gap: The 130% interaction test leaves newly mounted controls unscaled.**  
   [codex-se-lifecycle.spec.ts:40](/Users/rabah/projects/anygym/tests/codex-se-lifecycle.spec.ts:40), [matrix.spec.ts:199](/Users/rabah/projects/anygym/tests/matrix.spec.ts:199)

   Scaling changes only currently mounted elements. The lifecycle test subsequently mounts the reps stepper and rest controls without scaling those new elements or verifying their computed sizes.

   **Counterexample:** A newly mounted, explicitly pixel-sized stepper remains at normal size and passes visibility checks, although its enlarged version would overlap. Actual overlap remains unconfirmed.

   **Exact fix/test:** Keep the 130% fixture active for newly mounted elements, recording baseline sizes to avoid repeated scaling. Open reps, rest, and nested sheets; first assert new text computes to 1.3× baseline, then check clipping, overlap, hit areas, and active-workout visibility before any scrolling.