Found **12 findings in completed `[x]` features**, including test blind spots. All remain **STILL OPEN** from earlier reports. Fixed findings are excluded. No files edited.

Typecheck passed. In-memory probes reproduced failed-Log draining, failed-Undo draining, lost newer edits, incompatible count acceptance, and lb drafts rebuilt as kg. Other findings are source-traced; full suites and physical iPhone tests were not run.

1. **MAJOR — STILL OPEN: Finish silently discards failed set submissions.**  
   [logQueue.ts:83](/Users/rabah/projects/anygym/src/lib/logQueue.ts:83), [WorkoutScreen.tsx:376](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:376)  
   Check a set, immediately Finish, then let its write reject. The queue converts failure to `false`; `settle()` ignores it. Finish ends the workout and clears drafts, omitting the checked lift. Failures already completed before Finish are also forgotten.

   **Exact fix:** Retain failed submission payloads until successfully retried or explicitly discarded. Block Finish while any remain; preserve drafts. Synchronously prevent new submissions before draining.

   **Test to add:** The Finish test in `logQueue.test.ts` uses only successful writes. Add rejection and `false` cases, both before and during Finish. Through the actual workout UI, assert the session stays active, drafts survive reload, and retry produces exactly one saved set.

2. **MAJOR — STILL OPEN: Termination after set commit can hide an unlogged draft and duplicate a lift.**  
   [ExerciseView.tsx:165](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:165), [ExerciseView.tsx:179](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:179)  
   Saving the set and reconciling localStorage drafts are separate operations. With pending rows of 7, 8 and 19 reps, check the third and terminate after IndexedDB commits but before cleanup. Recovery can expose pending `[8, 19]`: the 7-rep draft is hidden behind the logged boundary, while the committed 19 remains loggable.

   **Exact fix:** Persist stable row/submission identities before writing. Commit the set and pending-row reconciliation in one IndexedDB transaction; reconcile committed submissions before rendering recovered drafts.

   **Test to add:** `logQueue.test.ts` substitutes a subscribed plain object for a mounted React card. Use a persistent browser profile, terminate the process at that commit boundary, restart offline, and assert one saved 19-rep set plus pending 7- and 8-rep rows, exactly once each.

3. **MAJOR — STILL OPEN: Accepted Undo can permanently lose its set.**  
   [deleteUndo.ts:39](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:39), [deleteUndo.ts:67](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:67)  
   After deletion, recovery exists only in memory. Termination during an accepted Undo loses its recovery record. Even without termination, a rejected restoration leaves `running`; subsequent Finish resolves despite the unresolved Undo. Its retry record also expires.

   **Exact fix:** Store the deleted record transactionally with deletion. Persist accepted restoration intent, replay it on startup, and block Finish until restoration succeeds or the user explicitly cancels it. Do not expire unresolved accepted Undo.

   **Test to add:** [codex-write-recovery.test.ts:95](/Users/rabah/projects/anygym/src/db/__tests__/codex-write-recovery.test.ts:95) manually supplies an `undo` object retained across database reopen, masking the missing recovery mechanism. Destroy all runtime references after restoration fails; restart from persisted storage alone. Assert exact ID, order, load and reps return once. Also assert Finish remains blocked before recovery.

4. **MAJOR — STILL OPEN: Delayed Log completion destroys newer row edits.**  
   [setTable.ts:160](/Users/rabah/projects/anygym/src/lib/setTable.ts:160)  
   Submit row 1, change it to 17 reps during the write, and already have a draft in row 2. Reconciliation clears the newer 17-rep edit. Logging a later row also overwrites that submitted row’s newer revision.

   **Exact fix:** Preserve newer submitted revisions in both reconciliation branches. Move occupied drafts to make room, extending pending rows when necessary; retain load, count, type and stopwatch state.

   **Test to add:** [setTable.test.ts:193](/Users/rabah/projects/anygym/src/lib/__tests__/setTable.test.ts:193) checks returned move lists for selected branches, without asserting conservation of edits. Add both counterexamples, apply the operations, rebuild visible rows, and assert every newer draft survives exactly once. Repeat with an actual delayed React submission and reload.

5. **MAJOR — STILL OPEN: Changing units reinterprets pending plates as a much heavier load.**  
   [exerciseLoad.ts:125](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:125)  
   A pending 135 lb load—45 lb bar plus `[45]` per side—rebuilds as **110 kg** after changing the gym to kg. The code accepts nonexistent 45 kg plates. Disabling a selected plate in inventory similarly leaves it loggable.

   **Exact fix:** Store the originating unit with draft plates, including drafts whose base is unknown. Reject rebuilding across units or with unavailable plates; require a fresh selection. Explicitly converted suggestions must be solved against the destination inventory.

   **Test to add:** Exercise the real `currentLoad()` with that lb draft and a default kg gym; expect no loggable load. Repeat after disabling a selected plate. Add a UI reload case asserting no set is saved until the user selects valid equipment.

6. **MAJOR — STILL OPEN: Editing an old rep set can replace its reps with one second.**  
   [EditSetSheet.tsx:49](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:49), [workouts.ts:76](/Users/rabah/projects/anygym/src/db/workouts.ts:76)  
   Log 10 reps, change “Loaded with” to Timed, then edit the old set. Today’s setting selects Seconds, initialized to `1`. Save removes the original reps while keeping its weighted load. Database validation accepts this incompatible combination.

   **Exact fix:** Derive edit count mode from the saved load/count fields; consult current settings only for incomplete legacy records. Require compatible counts in both `logSet()` and `updateSet()`.

   **Test to add:** Perform that exact UI sequence, Save and reload. Assert `reps: 10`, unchanged load, and no `seconds`. Add database rejection tests for timed loads with reps, rep-based loads with seconds, and both count fields together.

7. **MAJOR — STILL OPEN: Changing bars inside Edit saves the previous equipment identity.**  
   [SetLoadInput.tsx:170](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:170)  
   Selecting Smith while editing an Olympic set schedules `localBar`, then immediately builds the load using the previous render’s bar ID. Smith weight can therefore enter Olympic history. Initialization also disregards the historical ID when its configured weight has changed.

   **Exact fix:** Pass the selected bar ID and weight explicitly into `change()` and `barbellLoad()`. Initialize historical identity directly from `ownBarId`, independently of today’s configured weight.

   **Test to add:** Edit Olympic → Smith, immediately Save, reload, and assert `barId: 'smith'`, correct bar weight and total. Assert exclusion from free-weight history. Repeat after changing the historical bar’s configured weight. Database tests supplied with already-correct loads cannot catch this React state error.

8. **MAJOR — STILL OPEN: Explicit hold corrections save the old stopwatch duration.**  
   [ExerciseView.tsx:145](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:145), [ExerciseView.tsx:334](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:334)  
   Stop at 30 seconds, then change the displayed duration to 60 or copy a 60-second LAST TIME value. Both retain the old watch. Checking the row captures that watch and saves 30.

   **Exact fix:** Manual/copied seconds must replace the watch with a stopped watch representing the chosen duration. Display and submission must consume the same canonical duration.

   **Test to add:** With a controlled clock, stop at 30, select 60, check and reload; assert stored `seconds: 60`. Repeat using LAST TIME. Run through `ExerciseView`; isolated stopwatch tests omit the conflicting state.

9. **MAJOR — STILL OPEN: Active-workout read failures lack recovery and mutation protection.**  
   [useWorkout.ts:52](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:52), [WorkoutScreen.tsx:400](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:400)  
   The hook drops query errors and retry functions. An initial session-read failure redirects home as though the workout disappeared. Other failures can leave permanent loading or stale data while Finish remains available.

   **Exact fix:** Expose required-query errors and a combined retry. Render `LoadError`, disable mutations while required data is unavailable, and redirect for missing sessions only after a successful read.

   **Test to add:** Existing error UI tests cover Today, History and Finish. Inject session, sets, gym, settings and history failures individually in an active workout, initially and after successful reads. Assert no redirect, working retry, blocked mutations and exact recovered data.

10. **MAJOR — STILL OPEN: Wheel confirmation can save a different weight from its readout.**  
    [DumbbellWheel.tsx:95](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:95)  
    Scrolling updates the displayed selection immediately but publishes its load after 110 ms. Done/Save can confirm 30 each while the readout shows 50 each, saving 60 total instead of 100. **Physical touch timing remains unverified.**

    **Exact fix:** Disable confirmation while selection is unsettled, or synchronously commit the displayed snapped selection before confirming in both Weight and Edit sheets.

    **Test to add:** [loads.spec.ts:55](/Users/rabah/projects/anygym/tests/loads.spec.ts:55) programmatically scrolls and polls until the new load arrives, waiting away the failure window. Freeze the debounce clock, scroll 30 → 50, dispatch the scroll event and immediately confirm. Assert confirmation is blocked or the saved total is 100 lb. Repeat for single weights.

11. **MAJOR — STILL OPEN: SPEC 13’s console-error gate is optional.**  
    [fixtures.ts:99](/Users/rabah/projects/anygym/tests/fixtures.ts:99)  
    The automatic fixture guards networking but does not collect console errors or unhandled exceptions. A spec that omits `watchErrors()` can pass after `console.error()` or an unhandled rejection. Manually attached collectors can also miss secondary pages.

    **Exact fix:** Add an automatic context-wide collector before navigation, attach it to every page, and assert it is empty at teardown. Keep deliberate-error exemptions exact and local.

    **Test to add:** Run harness child tests that emit `console.error`, throw asynchronously, and reject an unhandled promise, including on a second page. Assert each child run fails with the expected diagnostic.

12. **MAJOR — STILL OPEN: SPEC 13 acceptance coverage omits required platforms and realistic recovery/stress paths.**  
    [playwright.config.ts:7](/Users/rabah/projects/anygym/playwright.config.ts:7), [playwright.config.ts:28](/Users/rabah/projects/anygym/playwright.config.ts:28)  
    Only three WebKit projects run. Chromium-specific failures and the 320-wide floor cannot fail the suite. Reload tests do not exercise abrupt process death. The generated two-year fixture now has database coverage, but no browser History/navigation stress test.

    **Exact fix:** Add Chromium profiles at 412×915, 360×780, 360×640 and 320 width; remove platform skips from shared acceptance flows. Add persistent-profile process-termination tests and reuse the generated history in browser tests.

    **Tests to add:** On every profile, log/edit/delete/undo/finish offline and unwind nested sheets with Back; assert exact records, one-sheet dismissal, exposed controls and no horizontal overflow. Terminate mid-draft, hold and rest, relaunch offline, and assert exact recovery. Seed 730 sessions/14,600 sets in-browser, open newest and oldest History details, navigate rapidly, and log another set without errors or lost state. These test built features; deferred run/onboarding features are outside this review.