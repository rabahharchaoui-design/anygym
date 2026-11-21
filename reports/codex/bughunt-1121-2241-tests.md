The most consequential open risks involve submitted workout data and run recovery. The findings below concern completed features and were reported previously; I checked the cited code in this checkout. Several depend on storage failure or concurrent contexts, and I did not reproduce those conditions on a phone.

**Product findings**

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.** [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If a journal write fails in another app context, a checked set can remain in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so the finished workout can omit the set.  
   **Fix:** Register submissions under the session lock. During Finish, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

2. **MAJOR — STILL OPEN, timing-dependent: Two rapid checks can acknowledge one set without saving it.** [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77), [useLogRow.ts:59](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:59)  
   Distinct rows can be claimed before their deferred writes start. If the writes overlap, the second submission receives the first write’s promise without running its own write. The earlier report reproduced the queue interleaving; whether normal phone interaction reaches it remains uncertain.  
   **Fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.** [setTable.ts:168](/Users/rabah/projects/anygym/src/lib/setTable.ts:168)  
   Different contexts can allocate revisions independently, but reconciliation checks a payload mismatch only when revisions match. For example, an unsaved revision-1 draft for 73 lb × 19 can be consumed against a revision-5 receipt for 53 lb × 10.  
   **Fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN: A failed run-recovery read allows a new run to overwrite the live snapshot.** [runEngine.ts:216](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:216), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37)  
   A storage read error is treated as though there were no run. The user can start another run, whose save replaces the shared snapshot, making the interrupted route unreliable to recover.  
   **Fix:** Represent recovery failure separately from an empty database, offer Retry, and block Start until the read succeeds. Store snapshots by run ID and enforce one active run transactionally.

5. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.** [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without add-ons. Two hard workouts at 100 + 25 lb and 100 + 50 lb can be described as the same weight and prompt a lighter target, even though resistance increased.  
   **Fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

**Test blind spots**

6. **MAJOR — STILL OPEN: Queue tests miss overlapping distinct rows.** [logQueue.test.ts:39](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:39) tests duplicate submissions for one ID; its next-row case waits for the first write.  
   **Counterexample:** Row 2 submits while row 1 is blocked, receives row 1’s success, and is never written.  
   **Test to add:** Gate row 1’s database write, submit a different row ID and values before releasing it, then release the writes. Assert both IDs and their respective values exist and neither claim succeeds before its own commit.

7. **MAJOR — STILL OPEN: Run-recovery tests assume successful storage and lifecycle events.** [runEngine-4.3.test.ts:83](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.3.test.ts:83) waits for a successful `pagehide` save.  
   **Counterexample:** The recovery read rejects once and Start becomes available while the original run remains stored; a process can also die without `pagehide`.  
   **Tests to add:** Reject `readLiveRun` once and assert Start stays unavailable until Retry succeeds. Separately, record a route in a persistent browser profile, wait for confirmed autosave, kill the process without lifecycle events, and relaunch offline. Assert that the run returns paused with the interruption represented.

8. **MAJOR — STILL OPEN: The default UI suite does not run every test across the SPEC 13 device matrix.** [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45) filters Android and 320-wide projects to `@matrix` unless `PW_FULL_MATRIX` is set.  
   **Counterexample:** A Chromium-only regression in an untagged recovery flow can pass the default suite.  
   **Test to add:** Run every UI spec on all seven projects in the acceptance command. Add a CI check of Playwright’s test listing that each project includes recovery and primary-flow tests.

9. **MINOR — STILL OPEN: Muscle-list completeness uses the production filter as its expected answer.** [muscles-2.2c.spec.ts:13](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:13)  
   **Counterexample:** If `exercisesForRegion()` omits a valid quad exercise, both the UI and expected list omit it and the comparison passes.  
   **Test to add:** Compare rendered IDs with independently audited literal IDs for representative muscles, including primary-muscle and overridden-shoulder cases. Confirm that removing one expected exercise makes the test fail.

10. **MINOR — STILL OPEN: The SPEC 13 monkey test omits Run and does not exercise touch swipes.** [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25), [monkey.ts:19](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:19)  
    **Counterexample:** Random interactions leave a live run locked, or broken native touch handling prevents scrolling, while the mouse-drag suite passes.  
    **Test to add:** Run seeded 90-second cases on Run start and a live run with simulated GPS. Use engine-supported touch gestures; first prove a touch swipe scrolls a known screen, then assert the run can be unlocked, paused, and ended without console errors across the matrix.

11. **MINOR — STILL OPEN: Mocked voice tests do not establish that shipped clips decode and play.** [voice.ts:40](/Users/rabah/projects/anygym/tests/helpers/voice.ts:40) replaces decoding with a fake buffer.  
    **Counterexample:** An invalid audio file with matching updated metadata can pass the mocked checks but fail during an offline cue.  
    **Test to add:** Decode every shipped clip with a real decoder. In a built-app browser test, warm the voice cache, go offline, play a representative multi-clip cue, and assert decoding and playback complete without fallback.

This was a read-only review; I made no edits and did not run the suites or repeat the earlier reproductions. Physical iPhone behavior, storage-failure timing, and concurrent-context reachability remain unverified.