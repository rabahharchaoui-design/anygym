Found **12 findings across completed features and their tests**. No files changed. Typecheck passed; read-only, in-memory probes reproduced findings 1–4 and 6. Full Vitest/Playwright suites and physical iPhone testing were not run.

1. **MAJOR — STILL OPEN: Failed submissions can disappear after restart.**  
   [ExerciseView.tsx:156](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:156)

   **Failure:** Logging ignores `writeDrafts()` returning `false`. If localStorage cannot save the submission marker and the set write also fails, restarting loses evidence that the checked set remains unsaved. Finish can then discard it. The probe recovered **zero failed submissions**.

   **Exact fix:** Persist the submitted ID, revision and complete values in an IndexedDB pending-write journal before attempting Log. Keep that journal until successful reconciliation or explicit discard; make Finish inspect it.

   **Test to add:** Reject both the submission-marker storage write and `logSet()`, destroy runtime state, then restart offline. Assert the failed row remains visible, Finish stays blocked, and retry saves its exact values once.

2. **MAJOR — STILL OPEN: Failed Undo acceptance permits permanent loss.**  
   [tombstones.ts:24](/Users/rabah/projects/anygym/src/db/tombstones.ts:24), [deleteUndo.ts:109](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:109)

   **Failure:** Delete succeeds, but persisting `undo: true` fails. The queue retains a temporary retry record yet subsequently allows Finish. Finish deletes the unaccepted tombstone. The last-set probe ended with **neither the set nor its recovery record**.

   **Exact fix:** Track unresolved Undo requests separately from running promises. Do not expire them or allow Finish until restoration succeeds or the user explicitly cancels the request. Report failed acceptance without treating Undo as completed.

   **Test blind spot:** [tombstones.test.ts:70](/Users/rabah/projects/anygym/src/db/__tests__/tombstones.test.ts:70) explicitly persists acceptance before provoking failure, bypassing this boundary. Add a test that rejects the acceptance `put`, awaits the rejection, then attempts Finish. Assert Finish refuses, the tombstone remains, and retry restores the exact record.

3. **MAJOR — STILL OPEN: Recovery resurrects consumed older draft revisions.**  
   [setTable.ts:92](/Users/rabah/projects/anygym/src/lib/setTable.ts:92)

   **Failure:** Reconciliation treats every unequal revision as a newer edit. If revision 2 committed but storage retained revision 1, recovery assigns that stale draft a fresh ID. The user can log the same lift again. The probe turned an older eight-rep draft into a new pending set.

   **Exact fix:** Consume drafts with `draft.rev <= committed.rev`. Preserve and reidentify only strictly newer revisions.

   **Test blind spot:** [setTable.test.ts:199](/Users/rabah/projects/anygym/src/lib/__tests__/setTable.test.ts:199) covers equal and newer revisions only. Add older/equal/newer cases with committed revision 2. Assert revisions 1 and 2 disappear, revision 3 survives once, and rebuilding visible rows cannot expose the committed lift again.

4. **MAJOR — STILL OPEN: Unit changes corrupt pending resistance.**  
   [exerciseLoad.ts:125](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:125)

   **Failure:** A pending 135 lb barbell load containing `[45]` plates becomes **110 kg** after switching the gym to kilograms. Those plates are unavailable in the default kilogram inventory. The adjacent bodyweight branch also turns a **+25 lb** draft into unweighted bodyweight. Both results remain loggable.

   **Exact fix:** Preserve the draft’s originating unit, including when its base weight is unknown. Reject incompatible units or unavailable plates until explicitly reselected or converted through the destination equipment solver. Never replace an incompatible add-on with zero.

   **Test to add:** Exercise the actual `currentLoad()` with those two drafts after switching units; neither may silently become a different loggable resistance. Repeat through Settings → Resume → reload and after disabling a selected plate.

5. **MAJOR — STILL OPEN: Wheel confirmation can save a different displayed weight.**  
   [DumbbellWheel.tsx:97](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:97), [WeightSheet.tsx:98](/Users/rabah/projects/anygym/src/screens/workout/WeightSheet.tsx:98)

   **Failure:** Scrolling updates the visible selection immediately but publishes its load after the debounce. Done/Save can therefore retain 30 each while the readout displays 50 each. **Source-confirmed timing window; physical touch reproduction remains unverified.**

   **Exact fix:** Publish the displayed snapped selection synchronously, or prevent confirmation until that selection settles. Apply this guarantee to Weight and Edit sheets.

   **Test blind spot:** [loads.spec.ts:55](/Users/rabah/projects/anygym/tests/loads.spec.ts:55) scrolls and polls until settlement, waiting away the failure. Freeze the debounce timer, scroll 30 → 50, dispatch `scroll`, then immediately confirm. Assert confirmation is blocked or the saved dumbbell total is **100 lb**. Repeat for single weights.

6. **MAJOR — STILL OPEN: Stack progression drops added resistance.**  
   [progression.ts:112](/Users/rabah/projects/anygym/src/lib/progression.ts:112), [progression.ts:145](/Users/rabah/projects/anygym/src/lib/progression.ts:145)

   **Failure:** Comparison and conversion use the pin value rather than complete resistance. The probe converted **100 lb pin + 25 lb added** into **45 kg**, explaining it as “last time 100 lb.” Actual resistance was approximately **56.7 kg**. Ranking also incorrectly favors a 110 lb pin without additions over 100 + 25 lb.

   **Exact fix:** Separate the pin coordinate used for stepping from total resistance used for comparison and conversion. Convert complete resistance, round to a loadable destination, and describe the complete previous resistance.

   **Test to add:** Assert that 100 + 25 outranks 110 + 0. With kilogram increments of 2.5, assert conversion produces **57.5 kg**, with an explanation retaining the original **125 lb** resistance. Existing pin-helper assertions do not establish this user-facing invariant.

7. **MAJOR — STILL OPEN: Saved rows inherit today’s unit and loading convention.**  
   [SetTable.tsx:125](/Users/rabah/projects/anygym/src/screens/workout/SetTable.tsx:125)

   **Failure:** Log 135 lb, switch Settings to kg, then resume: the saved row shows **135 under “kg.”** Changing “Loaded with” similarly allows a saved single weight to appear under a dumbbell “each” heading.

   **Exact fix:** Render saved rows from their stored load kind and unit. Explicitly label differences from the current column heading, including “each” versus “total.”

   **Test to add:** Log 135 lb, switch to kg, resume and reload. Assert the visible saved row explicitly says **135 lb** while storage remains unchanged. Repeat single → dumbbells and reps → timed.

8. **MAJOR — Restore reports success despite failed draft persistence.**  
   [backup.ts:59](/Users/rabah/projects/anygym/src/db/backup.ts:59)

   **Failure:** Restore commits the database, then ignores `replaceDrafts()` returning `false`. It reports success although restored pending values and a running hold may survive only in memory and disappear after termination.

   **Exact fix:** Store restored drafts durably in IndexedDB within the restore transaction. A draft persistence failure must abort restoration before success is reported.

   **Mocked-away failure:** [backup.test.ts:12](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:12) supplies storage whose writes always succeed. Add a restored active workout with pending weight, reps and stopwatch state; reject draft persistence and destroy runtime caches. Assert either complete rollback or complete durable recovery—never successful partial restoration.

9. **MAJOR — Layout checks can scroll away a SPEC 13.5 failure.**  
   [layout.ts:167](/Users/rabah/projects/anygym/tests/helpers/layout.ts:167)

   **Counterexample:** An active workout’s ✓ lies below the viewport. `checkLayout()` scrolls it into view before checking coverage, allowing a layout requiring scrolling to pass.

   **Exact fix:** Add an active-workout mode that checks full control bounds before scrolling and verifies that inspection leaves all scroll positions unchanged.

   **Test to add:** On SE, small Android and the 320 floor, check the title, current row, reps and ✓ immediately after opening the workout and starting rest, including at 130% text. Add a harness regression with ✓ deliberately below the fold; the checker must reject it.

10. **MAJOR — Monkey assertions count attempts and reload away stuck state.**  
    [monkey.ts:88](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:88), [monkey.ts:129](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:129)

    **Counterexample:** A silent overlay intercepts taps without console errors. Attempts still increment `stats.taps`; the final `page.goto('./')` reload removes the overlay, and navigation passes. The swipe branch also sends mouse events, leaving touch-specific gesture failures unexercised.

    **Exact fix:** Verify responsiveness in the existing document before any reload. Count observable successful interactions, use touch gestures for mobile paths, and treat recovery reloads as failures.

    **Test to add:** Inject a transparent tap-blocking overlay during the run. Assert the monkey fails before navigation. Separately verify a touch swipe changes a picker or scroll position and that a left-edge touch gesture navigates correctly.

11. **MAJOR — STILL OPEN, partially fixed: Required device coverage excludes most UI tests.**  
    [playwright.config.ts:56](/Users/rabah/projects/anygym/playwright.config.ts:56)

    **Counterexample:** Android projects now exist, but their `grep: /@matrix/` excludes untagged tests such as the detailed wheel regression. An Android-only failure there cannot fail the normal Android run. SPEC 13.3–13.4 requires every UI test on the matrix.

    **Exact fix:** Remove the matrix filter for shared UI acceptance tests. Keep narrowly justified platform-specific exclusions explicit.

    **Test to add:** Add a discovery check asserting each shared UI test is scheduled on every required project. Run picker confirmation, import, restore and nested-sheet Back cases under Chromium at all three Android sizes.

12. **MINOR — SPEC 13.3 contrast acceptance has no automated test.**  
    [matrix.spec.ts:36](/Users/rabah/projects/anygym/tests/matrix.spec.ts:36), [layout.ts:145](/Users/rabah/projects/anygym/tests/helpers/layout.ts:145)

    **Counterexample:** Change an enabled secondary label to foreground/background colors with a 2:1 contrast ratio. Current geometry assertions still pass. **This is a coverage gap; I have not established a current contrast violation.**

    **Exact fix:** Add WCAG AA contrast checks to the existing screen matrix, handling translucent backgrounds against their rendered backdrop.

    **Test to add:** Check enabled text in Today, workout, rest, History and nested sheets against the applicable AA threshold. Include a deliberately low-contrast harness element to prove the check fails.