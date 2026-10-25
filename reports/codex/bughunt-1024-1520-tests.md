Found **12 findings**, worst first. Reviewed completed `[x]` features against the earlier reports; fixed findings are excluded. No files changed. Two in-memory source probes reproduced findings 1 and 3. Other findings are source-traced; I did not run the full suites or physical iPhone tests.

1. **MAJOR — STILL OPEN: Finish discards failed Log submissions.**  
   [logQueue.ts:83](/Users/rabah/projects/anygym/src/lib/logQueue.ts:83), [WorkoutScreen.tsx:362](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:362)  
   **User failure:** Check a set, immediately Finish, and let the set write fail. `settle()` resolves despite failure; Finish ends the workout and clears its drafts.  
   **Exact fix:** Retain failed submissions until retried successfully or explicitly discarded. Make Finish reject while failures remain, preserve drafts, and synchronously prevent new submissions once finishing begins.  
   **Test:** The Finish test in [logQueue.test.ts:135](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:135) supplies only a successful writer. Add rejection and `false` cases, including failure before Finish starts. Assert the session remains active, its draft survives reload, and retry saves exactly one set.

2. **MAJOR — STILL OPEN: App termination between Log commit and draft cleanup can duplicate a lift and hide an unlogged draft.**  
   [ExerciseView.tsx:165](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:165), [ExerciseView.tsx:179](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:179)  
   **User failure:** The set commits separately from row reconciliation. Termination between them leaves old draft indexes and submission IDs beside a newly saved set.  
   **Exact fix:** Persist stable row/submission identities before submission. Commit the set and pending-row reconciliation transactionally in IndexedDB; reconcile committed IDs on startup.  
   **Test:** [logQueue.test.ts:44](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:44) substitutes a plain subscribed object for a mounted React view. Add a real workout test: draft distinct values in adjacent rows, terminate after set commit but before cleanup, restart offline, and assert one saved lift plus every remaining draft exactly once.

3. **MAJOR — STILL OPEN: Delayed logging destroys newer row edits.**  
   [setTable.ts:160](/Users/rabah/projects/anygym/src/lib/setTable.ts:160)  
   **User failure:** Submit the current row, change it to 17 reps during the write, and have a draft already in the following row. Reconciliation clears the 17-rep edit. Submitting a later row also overwrites that row’s newer revision. The first case reproduced.  
   **Exact fix:** Preserve newer submitted revisions in both branches; move occupied drafts to make room and extend pending rows when necessary. Prefer stable row identities.  
   **Test:** [setTable.test.ts:193](/Users/rabah/projects/anygym/src/lib/__tests__/setTable.test.ts:193) asserts the implementation’s returned move list, without checking conservation of all edits. Add both counterexamples, apply the returned changes, rebuild visible rows, and assert every newer draft remains exactly once with its weight, reps and stopwatch.

4. **MAJOR — STILL OPEN: Editing an old rep set can replace its reps with one second.**  
   [EditSetSheet.tsx:49](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:49)  
   **User failure:** Log 10 reps, change “Loaded with” to Timed, then edit the original set. Today’s setting selects Seconds, initialized to `1`; Save removes the original reps while retaining the weighted load.  
   **Exact fix:** Derive count mode from the saved load/count fields. Use the current setting only for incomplete legacy records. Reject incompatible count/load combinations in `logSet()` and `updateSet()`.  
   **Test:** Add this exact UI sequence. Assert Save preserves `reps: 10`, the original load, and no `seconds` field. Add database rejection tests for timed loads with reps and weighted loads with seconds.

5. **MAJOR — STILL OPEN: Changing bars inside Edit saves the previous bar’s identity.**  
   [SetLoadInput.tsx:170](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:170)  
   **User failure:** Edit an Olympic set and select Smith. `setLocalBar()` schedules state, but `change()` immediately reads the old ID: Smith weight can be saved as Olympic history. Initialization also substitutes another identity when the historical bar’s configured weight changed.  
   **Exact fix:** Pass the selected bar ID and weight explicitly into the canonical load builder. Honor historical `ownBarId` independently of today’s configured weight.  
   **Test:** Edit Olympic → Smith, Save immediately, reload, and assert `barId: 'smith'`, the selected weight and exact total. Verify that this set is excluded from free-weight history. Repeat after changing the historical bar’s configured weight.

6. **MAJOR — STILL OPEN: Manual hold corrections are overridden by the old stopwatch.**  
   [ExerciseView.tsx:145](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:145), [ExerciseView.tsx:334](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:334)  
   **User failure:** Stop at 30 seconds, change Hold to 60, then check the row. The retained stopwatch overrides the displayed correction. Copying LAST TIME has the same conflict.  
   **Exact fix:** Manual/copied seconds must clear the stopwatch or replace it with a stopped watch containing the selected duration.  
   **Test:** Use a controlled clock: stop at 30, manually select 60, log, and assert stored `seconds: 60`. Repeat using LAST TIME. Test through `ExerciseView`; pure `captureHold()` tests cannot detect the conflicting state.

7. **MAJOR — STILL OPEN: Active-workout read failures have no recovery or mutation protection.**  
   [useWorkout.ts:52](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:52), [WorkoutScreen.tsx:386](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:386)  
   **User failure:** A failed initial session query redirects home as though the workout disappeared. Other failed queries can leave permanent loading or stale data while Finish remains available.  
   **Exact fix:** Expose required-query errors and a combined retry. Render `LoadError`, block mutations while required data is unavailable, and redirect for missing sessions only after a successful read.  
   **Test:** Existing error tests cover Today, History and Finish. Add active-workout failures for session, sets, gym, settings and history reads individually. Assert no redirect, a working retry, disabled mutations, and exact restored data.

8. **MAJOR — STILL OPEN; test retains recovery data the app loses.**  
   [deleteUndo.ts:39](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:39), [codex-write-recovery.test.ts:94](/Users/rabah/projects/anygym/src/db/__tests__/codex-write-recovery.test.ts:94)  
   **User failure:** Delete, accept Undo, then terminate before restoration commits or after it fails. The recovery record exists only in memory. The test “recovers” by retaining `undo` across database reopen and passing it back manually.  
   **Exact fix:** Store the deleted record transactionally with deletion; persist accepted Undo requests and replay them on startup. Consume recovery data only after successful restoration or intentional expiry.  
   **Test:** After failed restoration, destroy the queue and all local record references. Restart using persisted storage alone. Assert startup restores the exact ID, order, load and reps once.

9. **MAJOR — STILL OPEN; wheel tests wait away a display/save mismatch.**  
   [DumbbellWheel.tsx:95](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:95), [loads.spec.ts:55](/Users/rabah/projects/anygym/tests/loads.spec.ts:55)  
   **User failure:** Scrolling updates the displayed weight immediately but publishes the load after 110 ms. Done/Save can retain 30 while the wheel displays 50. Physical touch timing remains unverified. Tests programmatically scroll and poll until settlement, missing this window.  
   **Exact fix:** Commit the displayed snapped selection before confirmation, or disable confirmation until settlement.  
   **Test:** Freeze the debounce timer, scroll from 30 to 50, dispatch the scroll event, then immediately confirm in Weight and Edit sheets. Assert confirmation is blocked or the saved dumbbell total is 100 lb. Add a real touch/device check.

10. **MAJOR — STILL OPEN: SPEC 13’s console-error gate is optional.**  
    [fixtures.ts:99](/Users/rabah/projects/anygym/tests/fixtures.ts:99)  
    **Coverage failure:** The automatic fixture guards networking but does not collect errors. Any spec that omits `watchErrors()` can pass after `console.error()` or an unhandled rejection.  
    **Exact fix:** Add a context-wide automatic collector, attached before navigation and to every new page, asserted at teardown.  
    **Test:** Add harness tests expected to fail for `console.error`, an uncaught exception, and an unhandled rejection—including from a second page. Keep deliberate-error exemptions local and exact.

11. **MAJOR — STILL OPEN: Completed flows lack the required Android/device coverage.**  
    [playwright.config.ts:7](/Users/rabah/projects/anygym/playwright.config.ts:7)  
    **Coverage failure:** Only three WebKit projects exist. A Chromium-only sheet Back regression or failure at 360×640 cannot fail the normal suite. Resizing WebKit does not test Android behavior.  
    **Exact fix:** Run completed logging, picker, plan, History and sheet flows under Chromium at 412×915, 360×780, 360×640 and the 320-wide floor. Remove platform skips from shared acceptance cases. The harness is deferred in PLAN 1.12, but these built flows remain unverified.  
    **Test:** On each profile, log/edit/delete/undo/finish offline; open nested sheets and press Back twice. Assert one sheet closes per Back, the route stays correct, controls remain exposed, and no horizontal overflow occurs.

12. **MINOR — The 130% interaction test stops enlarging newly mounted controls.**  
    [codex-se-lifecycle.spec.ts:40](/Users/rabah/projects/anygym/tests/codex-se-lifecycle.spec.ts:40)  
    **Coverage failure:** It enlarges existing elements once, then mounts the reps editor and rest dock. Their newly created text is not guaranteed to receive 130% sizing. Thus the test can pass while enlarged interactive controls overlap. This is a test defect; an actual overlap is unconfirmed.  
    **Exact fix:** Apply enlargement consistently to newly mounted elements, without repeatedly scaling existing ones.  
    **Test:** Keep 130% active while opening reps, logging into rest, and opening nested weight/info sheets. First assert each new text element’s computed size is 1.3× baseline; then assert no clipping, overlap, covered controls or required workout scrolling.