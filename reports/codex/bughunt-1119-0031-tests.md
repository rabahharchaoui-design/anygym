I found **seven product defects and four test blind spots** in completed work. The earlier set-integrity findings below remain open in the current source. The run findings are source-confirmed failure paths; I did not reproduce them on a phone.

1. **MAJOR — STILL OPEN: Finish can lose a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83) checks the journal and held corrections, but does not reconcile another tab’s durable submitted-draft mirror. If that tab’s journal write fails after its draft is retained, Finish can complete and clear recovery data without saving the set.  
   **Exact fix:** Serialize submission admission and Finish under the session lock. In Finish’s transaction, reconcile durable submitted drafts against commit and cancellation receipts and refuse to finish while any submission remains unresolved.

2. **MAJOR — STILL OPEN: Recovery can discard a different unsaved weight.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175) compares payload fingerprints only when revisions match. Tabs allocate revisions independently: a pending **73 lb × 19, revision 1** can be consumed by evidence for **53 lb × 10, revision 5**.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or a recorded causal supersession proves it obsolete. Preserve conflicting payloads under a recoverable identity.

3. **MAJOR — STILL OPEN: Rapid checks on two rows can leave one set unsaved.**  
   [useLogRow.ts:55](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:55), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77) allow distinct rows to be claimed before their deferred writes start, but `submit` returns the existing exercise-level promise to the second submission. That second set can appear successful without being written. The prior report reproduced the queue interleaving; browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct IDs, and mark each claim landed only after its own write commits.

4. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:75](/Users/rabah/projects/anygym/src/db/backup.ts:75) captures held corrections before the database snapshot. A correction retained between those reads can be missing from an otherwise later backup; restoring it loses the correction.  
   **Exact fix:** Capture durable held corrections in the same snapshot transaction as sets, journals and supersession receipts, and coordinate fallback and memory capture with mutation registration.

5. **MAJOR: A failed run save is invisible until the runner ends it.**  
   [runEngine.ts:75](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:75), [runEngine.ts:174](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:174) silently mark a failed initial or periodic write dirty and retry later. If storage remains unavailable and the app is killed, the run and its route can disappear without the runner ever being told they were unsaved.  
   **Exact fix:** Expose persistent save failure immediately in engine state and the live UI, retry writes, and clear the warning only after a successful durable save. Retain recoverable state through an independent durable fallback where available.

6. **MAJOR: A failed run restore is treated as “no active run.”**  
   [runEngine.ts:144](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:144) catches any read or setup failure and enables a new run. A transient read failure can therefore hide an existing run; starting another writes the single live snapshot key, making the original harder to recover.  
   **Exact fix:** Keep restore failure distinct from an empty database, show a retryable error, and prevent starting a new run until the active-run check succeeds. Store snapshots by run ID and enforce one active run transactionally.

7. **MINOR: Discard can fail while the UI reports success.**  
   [runEngine.ts:225](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:225) dismisses the summary before deleting the row and suppresses deletion errors. If IndexedDB rejects the delete, the supposedly discarded run remains on the phone.  
   **Exact fix:** Await deletion before dismissing the summary; on failure retain it and show an actionable retry message.

**Test blind spot audit**

8. **MAJOR — STILL OPEN: Default Playwright runs omit required devices for most tests.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47) limits Android and the 320-wide project to `@matrix` tests unless an environment variable is set, although SPEC 13 requires every UI test on the matrix. **Counterexample:** a Chromium-only hard-kill recovery regression passes the default suite because that test is never selected.  
   **Exact test/configuration change:** Run every UI spec on all seven projects in the acceptance command; add a CI check using Playwright’s test listing that verifies each required project selects the hard-kill and primary-flow tests.

9. **MAJOR: Run storage failure and recovery are mocked away.**  
   [runEngine-4.3.test.ts:7](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.3.test.ts:7) uses working in-memory IndexedDB and a controlled phone; its restore test waits for a successful save before reopening. **Counterexample:** the initial save rejects, the user runs, and the app is killed before storage recovers: the existing test stays green while the run disappears.  
   **Exact test to add:** Inject rejected `startRunRow` and `saveLiveRun` writes, assert an immediate visible unsaved warning, restart a fresh engine, and verify either exact recovery or an explicit recovery failure. Separately reject `readLiveRun` once and assert Start remains unavailable until Retry succeeds.

10. **MINOR: The voice-pack assertion checks the manifest against itself, not the shipped audio.**  
    [compose-4.4.test.ts:10](/Users/rabah/projects/anygym/src/lib/run/voice/__tests__/compose-4.4.test.ts:10) calls a clip “shipped” when its ID occurs in the manifest. **Counterexample:** delete a referenced `.m4a` while leaving the manifest intact; these assertions still pass, and an offline cue falls back or is silent.  
    **Exact test to add:** Iterate every manifest entry and verify the corresponding `public/voice` file exists, is nonempty and can be decoded; add an offline browser test that plays a representative multi-clip cue from the built service-worker cache.

11. **MINOR: SPEC 13’s monkey coverage omits the Run screen.**  
    [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25) enumerates seven screens but no Run start or live screen. **Counterexample:** a random swipe or rapid control sequence can leave the live run locked or unresponsive without this test exercising it.  
    **Exact test to add:** Add seeded 90-second monkey cases for Run start and an active run, with simulated GPS; assert no console errors, the live state remains recoverable, and a deliberate unlock/pause/end sequence still works afterward on every matrix device.

This was a read-only source and test review. I did not run the suites or perform physical-device verification, and the review is not an exhaustive audit of every source file and historical report.