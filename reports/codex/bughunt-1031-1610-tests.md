**12 findings: 9 product defects and 3 test gaps, all STILL OPEN from earlier reports.** Reviewed completed `[x]` features only; fixed findings are excluded. No files edited. Typecheck passed. In-memory probes reproduced the data/helper failures below; full browser races and physical iPhone behavior remain unverified.

1. **MAJOR — STILL OPEN: Failed Undo can permanently lose its set after restart.**  
   [tombstones.ts:59](/Users/rabah/projects/anygym/src/db/tombstones.ts:59), [sessionRecovery.ts:36](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:36)

   Delete succeeds, but Undo acceptance, IndexedDB intent storage, and localStorage fallback fail. Recovery after five seconds deletes the remaining tombstone. **Reproduced: neither set nor recovery record survived.**

   **Exact fix:** Persist explicit deletion finalization. On startup, retain unfinalized tombstones and require Restore/Keep deleted before permanently removing them; elapsed time alone must not destroy the recovery copy.

   **Blind spot/test:** [fixes-1.7k.test.ts:140](/Users/rabah/projects/anygym/src/screens/workout/__tests__/fixes-1.7k.test.ts:140) checks that both-store failure rejects, but stops before recovery. Add deletion → reject acceptance and both fallbacks → destroy runtime state → recover after expiry. Assert the exact record remains recoverable and Finish requires resolution.

2. **MAJOR — STILL OPEN: Delayed Undo recovery restores obsolete values over a newer deletion.**  
   [workouts.ts:295](/Users/rabah/projects/anygym/src/db/workouts.ts:295), [tombstones.ts:87](/Users/rabah/projects/anygym/src/db/tombstones.ts:87)

   Recovery captures a tombstone outside the restoration transaction. Another operation restores, edits, and deletes that set again. The delayed operation checks only that some tombstone exists. **Reproduced: a newly deleted 70 lb × 17 set returned as 53 lb × 10; its newer tombstone disappeared.**

   **Exact fix:** Give each deletion a unique token. Carry it through acceptance, restoration, cancellation, and expiry. Inside the transaction, require the matching token and restore that tombstone’s current payload.

   **Test:** Pause recovery after reading the old tombstone; restore, edit, and delete again; release recovery. Assert the newer deletion and its exact values remain intact.

3. **MAJOR — STILL OPEN: Overlapping edits erase the newer failed edit’s journal.**  
   [mutations.ts:49](/Users/rabah/projects/anygym/src/db/mutations.ts:49), [mutations.ts:37](/Users/rabah/projects/anygym/src/db/mutations.ts:37)

   Saves to the same set share one journal ID. An older save can delete the entry after a newer save replaced its contents. **Reproduced: 17 reps saved, the newer 19-rep edit failed, and zero pending mutations remained.** Finish therefore cannot offer retry/discard.

   **Exact fix:** Assign operation tokens or monotonic revisions. Transactionally compare the stored operation before applying or deleting it; superseded operations must not consume newer intents.

   **Mocked-away failure/test:** [weights-2.0c.test.ts:89](/Users/rabah/projects/anygym/src/screens/workout/__tests__/weights-2.0c.test.ts:89) awaits each immediately rejected save. Add controlled overlapping saves: journal 17, journal 19, complete 17, fail 19. Reopen the database and assert 19 remains pending and retries exactly once.

4. **MAJOR — STILL OPEN: Finish can erase an edit journal created after its preliminary checks.**  
   [WorkoutScreen.tsx:438](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:438), [workouts.ts:346](/Users/rabah/projects/anygym/src/db/workouts.ts:346)

   Finish checks journals before entering its transaction, then unconditionally deletes them inside it. Another tab can journal a failed correction between those steps. **Reproduced: Finish removed a pending 19-rep edit and completed with the original 10 reps.** The queue lock covers only one JavaScript runtime.

   **Exact fix:** Reject unresolved journals inside Finish’s transaction. Journal creation must also check session activity transactionally, preventing new intents after Finish commits.

   **Test:** Use two database connections. Pause Finish after its preliminary checks; create a failed edit through the other connection; resume Finish. Assert it refuses, preserves the payload, and leaves the session active. Test the reverse ordering too.

5. **MAJOR — STILL OPEN: Failure to create an edit journal lets Finish accept old values.**  
   [mutations.ts:49](/Users/rabah/projects/anygym/src/db/mutations.ts:49), [logQueue.ts:113](/Users/rabah/projects/anygym/src/lib/logQueue.ts:113)

   If the initial journal write fails, no unresolved payload remains after the tracked promise settles. Dismissing Edit loses its local values. **Reproduced: a requested 17-rep correction failed, but Finish succeeded with 10 reps.** Set-type changes use the same path.

   **Exact fix:** Register unresolved payloads in session memory before journaling. Retain them on failure, attempt a durable fallback, and include them in Finish’s retry/discard checks.

   **Implementation-repeating assertion/test:** [weights-2.0c.test.ts:129](/Users/rabah/projects/anygym/src/screens/workout/__tests__/weights-2.0c.test.ts:129) asserts rejection and unchanged saved values, without checking the user’s pending correction. Extend through the real UI: reject journaling, dismiss Edit, tap Finish; require retry/discard and verify retry saves exactly 17.

6. **MAJOR — STILL OPEN: Changing reps invents an unselected weight.**  
   [ExerciseView.tsx:129](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:129), [exerciseLoad.ts:134](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:134)

   On a first-time barbell exercise showing “Pick,” changing only reps creates a draft that rebuilds as the bare bar. **Reproduced: no selected weight became a loggable 45 lb.** Plate machines with known starting resistance share the path.

   **Exact fix:** Preserve an explicit unselected-weight state when creating drafts from reps/type edits. Reuse `rowDraft()`’s empty-row handling and retain `noTarget` until an explicit load selection.

   **Mocked-away failure/test:** [setTable.test.ts:41](/Users/rabah/projects/anygym/src/lib/__tests__/setTable.test.ts:41) substitutes `rebuild: picked => picked`, hiding real bare-bar reconstruction. Add a first-use browser test: change reps and type without opening Weight; assert “Pick” remains and ✓ stays disabled until explicit weight selection.

7. **MAJOR — STILL OPEN: A stale Delete changes an already-finished workout.**  
   [workouts.ts:252](/Users/rabah/projects/anygym/src/db/workouts.ts:252)

   `deleteSet()` does not check its parent session. An editor opened in another tab before Finish can subsequently delete a saved set, invalidating totals and plan completion. **Reproduced: the finished workout lost its only set.**

   **Exact fix:** Include `db.sessions` in the delete transaction. Reject missing or ended parents with `WorkoutFinishedError` before modifying sets, counters, or tombstones.

   **Test:** Open the editor in tab A, Finish in tab B, then Delete in A. Assert rejection and unchanged session, sets, counters, tombstones, summary, and plan position. Existing finished-workout mutation coverage checks Edit, not this Delete path.

8. **MAJOR — STILL OPEN: Delayed logging redirects the open reps editor to another row.**  
   [ExerciseView.tsx:406](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:406), [SetTable.tsx:257](/Users/rabah/projects/anygym/src/screens/workout/SetTable.tsx:257)

   The reps editor stores a displayed index rather than draft identity. Log row 3 while row 2’s stepper is open: reconciliation moves pending rows, and the stepper attaches to another draft. **Helper reproduction: its target changed from the 8-rep draft to the 7-rep draft.** Full browser timing remains unverified.

   **Exact fix:** Store `idOf(row)` as the editing target. Resolve its current index on render and change; close the editor if that identity commits or disappears.

   **Test:** Seed distinct 7-, 8-, and 19-rep rows; delay row 3’s Log, open row 2’s stepper, release Log, then increment. Assert only the original 8-rep draft becomes 9; the 7-rep draft stays unchanged.

9. **MAJOR — STILL OPEN: Backup omits hydrated drafts when localStorage is unavailable.**  
   [drafts.ts:300](/Users/rabah/projects/anygym/src/lib/drafts.ts:300)

   Startup can hydrate pending sets from IndexedDB into `hydrated`, but export reads only storage and the active memory cache. Exporting before opening the exercise silently omits those values. **Reproduced: a readable 17-rep draft exported as `{}`.**

   **Exact fix:** When storage is absent, validate and include `hydrated.get(NO_STORAGE)`, then overlay the active memory cache.

   **Assertion weakness/test:** [backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73) and [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97) derive completeness expectations from production’s `TABLE_NAMES`. Add an independent literal backup contract. Hydrate with null storage, export before visiting the workout, restore into a separate database/storage context, and assert the exact pending values.

10. **MAJOR — STILL OPEN, test gap: Hard-kill tests avoid write boundaries.**  
    [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

    The browser is killed after successful UI assertions and database snapshots. This establishes settled-state recovery, but leaves SPEC 13.3’s dangerous Log/Undo interruption boundaries untested.

    **Counterexample:** Settled drafts survive, while termination after set commit but before reconciliation duplicates a lift or loses another pending row. **This is a coverage gap; that regression was not reproduced in current code.**

    **Exact fix/test:** Add deterministic gates after journal persistence, before commit, and after receipt commit/before cleanup. SIGKILL at each gate, reopen offline, and assert one saved 19-rep set plus pending 7- and 8-rep rows exactly once. Repeat between Undo acceptance and restoration commit.

11. **MAJOR — STILL OPEN, test gap: Default execution omits acceptance coverage on four devices.**  
    [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

    Ordinary `npm run test:ui` restricts Android projects and the 320 floor to `@matrix`. Kill and monkey tests lack that tag, so they never run there by default despite SPEC 13.3–13.4.

    **Counterexample:** An Android-only recovery failure cannot fail the standard suite because its recovery test is excluded. No additional device defect is asserted.

    **Exact fix/test:** Make applicable functional tests run across all seven projects by default; expose the checkpoint subset through a separately named command. Add a discovery contract requiring matching shared acceptance-test IDs, explicitly including kill and monkey cases.

12. **MAJOR — STILL OPEN, test gap: “Swipe” tests bypass native touch panning.**  
    [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [monkey.ts:181](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:181)

    Picker coverage assigns `scrollLeft`; monkey swipes send mouse events. Neither exercises the phone’s native touch arbitration required by SPEC 13.

    **Counterexample:** A sheet’s `touch-action` prevents horizontal thumb scrolling while direct scroll assignment and mouse dragging pass. **No current physical-device failure was reproduced.**

    **Exact fix/test:** Add native touch drags using Chromium touch injection and an iOS simulator/device driver. Drag the wheel inside Weight and Edit sheets; assert actual scrolling, changed selection, and Done/Save persisting the displayed weight. Include nested sheets and edge-back gestures.