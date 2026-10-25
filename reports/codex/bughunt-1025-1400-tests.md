**12 findings: 8 product defects and 4 test blind spots.** Reviewed earlier reports and completed `[x]` scope; fixed findings are excluded. No files edited. Typecheck passed. In-memory probes reproduced the storage/database failures below; browser timing and physical iPhone behavior were not tested.

1. **MAJOR — STILL OPEN: Failed Undo acceptance can permanently lose a set after restart.**  
   [sessionRecovery.ts:38](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:38), [tombstones.ts:80](/Users/rabah/projects/anygym/src/db/tombstones.ts:80)  
   Delete a set, fail the write accepting Undo, then restart after five seconds. The unresolved intent existed only in memory; recovery deletes its tombstone. **Reproduced: both set and recovery record disappeared.**  
   **Exact fix:** Persist Undo intent through a durable fallback and hydrate it before expiry/Finish. Preserve ambiguous tombstones for explicit recovery when intent persistence fails.  
   **Test to add:** Extend [fixes-1.7i.test.ts:150](/Users/rabah/projects/anygym/src/screens/workout/__tests__/fixes-1.7i.test.ts:150): after rejecting acceptance, discard the manager, reopen the database, advance past expiry, and recover. Assert the original record remains recoverable and Finish cannot silently discard it. The current test retains the same manager.

2. **MAJOR — STILL OPEN: Startup recovery failures expose obsolete weights and reps as current.**  
   [main.tsx:31](/Users/rabah/projects/anygym/src/main.tsx:31)  
   `.catch(() => [])` mounts the app after mirror hydration fails. Later reads can succeed, allowing stale localStorage values to be logged over newer recovery data. **Reproduced: the visible draft had 10 reps while IndexedDB held 17.**  
   **Exact fix:** Block workout mutations and mirror writes until hydration succeeds; show a retry action that reruns hydration.  
   **Test to add:** Seed conflicting localStorage/IndexedDB drafts, reject the first `kv.toArray()`, and mount the real startup flow. Assert logging stays blocked; after Retry, show and save exactly the newer draft. Existing [durable.test.ts:45](/Users/rabah/projects/anygym/src/lib/__tests__/durable.test.ts:45) exercises successful hydration only.

3. **MAJOR — STILL OPEN: A damaged backup can freeze the dumbbell picker.**  
   [load.ts:309](/Users/rabah/projects/anygym/src/lib/load.ts:309), [load.ts:319](/Users/rabah/projects/anygym/src/lib/load.ts:319)  
   `{ min: 5, max: 5, step: 1e-12 }` passes parsing, but integer scaling turns its step into zero. Enumeration never advances. **Parser acceptance reproduced; picker execution timed out.**  
   **Exact fix:** Reject steps that become zero at supported precision. Generate a bounded number of options rather than relying on weight increasing to terminate.  
   **Test to add:** Extend [backup.test.ts:249](/Users/rabah/projects/anygym/src/lib/__tests__/backup.test.ts:249) with this exact range. Assert parsing rejects it before Replace. Independently invoke enumeration in a worker with a deadline and assert it returns safely.

4. **MAJOR — STILL OPEN: Unsupported restored plates crash weight selection.**  
   [backup.ts:154](/Users/rabah/projects/anygym/src/lib/backup.ts:154)  
   An enabled `999 kg` plate passes validation. After restoration, loading throws `Unknown kg plate: 999`. **Both acceptance and solver failure reproduced.**  
   **Exact fix:** Validate inventory weights against `PLATE_SPECS[gym.unit]`; validate saved load/draft plate breakdowns against their own units before restoration commits.  
   **Test to add:** Parameterize invalid inventory and saved `perSide` entries. Attempt both Merge and Replace; assert rejection and byte-identical destination data. Current parser tests check numeric shapes without checking supported plate sizes.

5. **MAJOR — STILL OPEN: “Keep it deleted” can retain the unwanted set.**  
   [sessionRecovery.ts:39](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:39), [tombstones.ts:93](/Users/rabah/projects/anygym/src/db/tombstones.ts:93)  
   Accept Undo, fail restoration, then minimize/resume. Automatic recovery restores the set, but the manager still considers Undo unresolved. “Keep it deleted” removes only the tombstone. **Reproduced: Finish retained both sets.**  
   **Exact fix:** Route recovery through the manager, clear unresolved/hidden state after restoration, and serialize restoration with cancellation. Check tombstone state inside the restoration transaction.  
   **Test to add:** Extend [fixes-1.7i.test.ts:190](/Users/rabah/projects/anygym/src/screens/workout/__tests__/fixes-1.7i.test.ts:190) by inserting `recoverSession()` before cancellation. Assert the UI resolves the recovery consistently and never promises deletion while retaining the set. The simpler test at line 179 mocks restoration entirely, skipping acceptance and recovery.

6. **MAJOR — STILL OPEN: Edit Save bypasses Finish’s mutation lock.**  
   [WorkoutScreen.tsx:293](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:293), [workouts.ts:151](/Users/rabah/projects/anygym/src/db/workouts.ts:151)  
   Logged rows remain editable during slow Finish. Saves neither join the tracked mutation queue nor check the parent session. **Database acceptance reproduced: a completed set changed to 155 lb/17 reps.** The browser race is source-traced.  
   **Exact fix:** Guard editor opening and Save with the finishing lock, track existing saves through `logQueue.mutate()`, and make `updateSet()` transactionally reject missing/ended parents.  
   **Test to add:** Mirror the existing set-type/Finish tests for ordinary edits: delay Save, start Finish, assert Finish waits; then assert a Save attempted after Finish starts is refused and completed values remain unchanged.

7. **MAJOR — STILL OPEN: An open row editor can modify another pending set.**  
   [ExerciseView.tsx:198](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:198), [ExerciseView.tsx:249](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:249)  
   Start saving row 3, then open row 2’s weight/type editor. When row 3 commits, pending positions move, while the editor retains its old index. Done can change an unintended preceding row. **Source-traced; browser reproduction remains outstanding.**  
   **Exact fix:** Materialize a stable draft ID when opening an editor. Resolve its current position on confirmation, then apply downward weight propagation from that identity.  
   **Test to add:** Hold row 3’s write, open row 2’s editor, release the write, then confirm. Assert row 1 stays unchanged and only the intended row and permitted successors change. Repeat for set type.

8. **MAJOR — STILL OPEN: Automatic diagnostics can disclose personal text.**  
   [capture.ts:44](/Users/rabah/projects/anygym/src/lib/reporting/capture.ts:44), [mask.ts:66](/Users/rabah/projects/anygym/src/lib/reporting/mask.ts:66)  
   Error messages use heuristic masking. **Reproduced:** `Error: workout for jane doe at 12 oak road failed` survives both diagnostic masking and crash-push formatting unchanged. With reporting enabled, that text can leave the phone.  
   **Exact fix:** Use allowlisted automatic messages/error codes and script locations. Replace arbitrary automatic text with a generic placeholder; handle user-authored report text separately.  
   **Test to add:** Extend [privacy.test.ts:54](/Users/rabah/projects/anygym/src/lib/reporting/__tests__/privacy.test.ts:54) with lowercase names, addresses and gym names embedded directly in errors/console messages. Assert they are absent from queued payloads, transmitted bodies and pushes. Currently the crash input contains a UUID/email, which the existing patterns already recognize.

9. **MAJOR — STILL OPEN, test gap: Hard-kill coverage avoids critical transaction boundaries.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)  
   Current process-kill tests snapshot settled state. They do not terminate during Log commit/reconciliation or accepted Undo restoration.  
   **Counterexample:** Settled recovery passes while termination immediately after a commit could duplicate a lift or lose another pending row. This is a coverage gap, not evidence that previously fixed duplication has returned.  
   **Exact fix/test:** Add deterministic gates before commit and after commit/before cleanup. SIGKILL at each gate, relaunch offline, and assert one saved 19-rep set plus pending 7- and 8-rep rows exactly once. Repeat after Undo acceptance commits but before restoration commits.

10. **MAJOR — STILL OPEN, test gap: Default discovery omits acceptance tests on four devices.**  
    [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)  
    Android and the 320-wide project run only `@matrix` tests by default. SPEC 13.3 requires every applicable UI test across the matrix.  
    **Counterexample:** All tests in `kill.spec.ts` lack that tag, so Android-only termination failures escape the normal run.  
    **Exact fix/test:** Remove the default subset filter for shared acceptance cases, or make the full matrix the mandatory acceptance command. Add a discovery assertion comparing applicable test IDs across projects; require kill, restore, picker and sheet cases on every applicable device.

11. **MAJOR — STILL OPEN, test gap: “Swipe” tests bypass native touch scrolling.**  
    [loads.spec.ts:57](/Users/rabah/projects/anygym/tests/loads.spec.ts:57), [monkey.ts:181](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:181)  
    Picker tests assign `scrollLeft` or drag a mouse; monkey swipes also use mouse events.  
    **Counterexample:** A sheet can block horizontal touch panning while direct scrolling and mouse dragging both pass. No current device failure is asserted.  
    **Exact fix/test:** Perform native touch drags inside Weight and Edit sheets using Chromium touch injection and iOS simulator/device automation. Assert scrolling changes the selected weight and Done/Save persists that exact value. Include nested sheets and edge-back gestures.

12. **MINOR — STILL OPEN, assertion weakness: Backup completeness checks reuse production’s whitelist.**  
    [backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73), [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97)  
    Export, expected keys and round-trip snapshots all derive from `TABLE_NAMES`.  
    **Counterexample:** Removing a required table from that production list also removes it from these assertions’ expectations. Those assertions still pass; other dedicated tests may catch particular omissions. The previously reported journal omission is fixed.  
    **Exact fix/test:** Add an independent contract test with a literal required-table list and explicit intentional exclusions. Seed a distinct sentinel in every required category, restore into a separate database, and inspect each destination table directly without using production’s whitelist or snapshot helper.