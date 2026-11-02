**12 findings, all STILL OPEN from earlier reports.** Scope is completed `[x]` work only; fixed findings are excluded. No files edited. Typecheck passed. Findings 1–8 were reproduced using actual modules with in-memory IndexedDB or inspected assets. Finding 9 is source-confirmed. Full Playwright runs and physical iPhone behavior were not verified.

1. **MAJOR — STILL OPEN: Failed corrections disappear after restart.**  
   [mutations.ts:267](/Users/rabah/projects/anygym/src/db/mutations.ts:267)

   When journaling fails and localStorage rejects writes, the correction remains only in memory despite working IndexedDB. **Reproduced:** pending 19 reps became zero pending changes in a fresh runtime; the saved set remained at 10.

   **Exact fix:** Write `heldRows([held])` into IndexedDB `kv` in a separate fallback transaction. Keep that intent until applied or explicitly discarded.

   **Test to add:** Fail `journal.put` and storage writes, leave `kv` operational, then open another database instance with empty runtime memory. Assert pending 19 survives, Finish refuses, and Retry saves 19 exactly once. Existing restore-fallback tests do not cover creation of this failed edit.

2. **MAJOR — STILL OPEN: Retry overwrites a newer successful correction.**  
   [mutations.ts:150](/Users/rabah/projects/anygym/src/db/mutations.ts:150), [mutations.ts:297](/Users/rabah/projects/anygym/src/db/mutations.ts:297)

   Equal timestamps across tabs leave obsolete fallback edits eligible; Retry promotes them into new operations. **Reproduced:** failed 17 reps, subsequently saved 19 reps, then Retry reverted the set to 17.

   **Exact fix:** Persist operation identities and ordering shared across tabs; record explicit supersession. Retry must retain the original operation’s identity rather than create a newly ordered edit.

   **Blind spot/test:** [carryover-2.0i.test.ts:192](/Users/rabah/projects/anygym/src/db/__tests__/carryover-2.0i.test.ts:192) covers the opposite ordering. Add failed 17 through A, successful 19 through B at the same timestamp, with fallback cleanup refusing writes. After restart and Retry, require saved 19 and no obsolete pending edit.

3. **MAJOR — STILL OPEN: Finish can discard another tab’s correction.**  
   [workouts.ts:374](/Users/rabah/projects/anygym/src/db/workouts.ts:374)

   Finish snapshots localStorage fallback before asynchronous reads. Another tab can register a failed correction afterward. **Controlled interleaving reproduced:** Finish saved 10 reps with 19 pending; Retry then removed the correction without applying it.

   **Exact fix:** Serialize mutation registration, durable fallback handoff, and Finish under a shared per-session lock across tabs. Finish must inspect authoritative intents while holding that lock.

   **Blind spot/test:** [carryover-2.0i.test.ts:154](/Users/rabah/projects/anygym/src/db/__tests__/carryover-2.0i.test.ts:154) completes B’s failure before calling Finish. Instead inject B’s journal-transaction failure immediately after A reads fallback. Require Finish to refuse and 19 to remain recoverable. Real-browser race frequency remains unmeasured.

4. **MAJOR — STILL OPEN: Legacy “Keep deleted” destroys newer recovery data.**  
   [tombstones.ts:136](/Users/rabah/projects/anygym/src/db/tombstones.ts:136)

   A missing token still acts as a wildcard during cancellation. **Reproduced:** restore a legacy deletion, correct its set, delete again, then execute the old cancellation—the newer tombstone disappears.

   **Exact fix:** Require exact deletion identity, including legacy cases. Assign legacy tombstones persistent identities before exposing recovery actions; remove restored sets only when their restoration identity matches.

   **Blind spot/test:** [bughunt-2.0f.test.ts:32](/Users/rabah/projects/anygym/src/db/__tests__/bughunt-2.0f.test.ts:32) supplies modern tokens. Repeat with a tokenless original deletion. Assert stale cancellation preserves both a newer tombstone and, separately, a newer restored/corrected set.

5. **MAJOR — STILL OPEN: Storage failure lets another tab overwrite newer drafts.**  
   [drafts.ts:169](/Users/rabah/projects/anygym/src/lib/drafts.ts:169), [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)

   Hydrated tabs skip merging and mirror their complete cached collection. **Reproduced:** A retained 73 lb onscreen; B edited another row and replaced the durable weight with stale 53 lb.

   **Exact fix:** Persist changed rows individually by stable identity. Merge and allocate revisions inside an IndexedDB transaction; never replace authoritative rows using a hydrated collection snapshot.

   **Mocked-away failure/test:** [drafts-2.0i.test.ts:8](/Users/rabah/projects/anygym/src/lib/__tests__/drafts-2.0i.test.ts:8) gives both tabs working storage. Add two hydrated runtimes with throwing storage writes and working IndexedDB. After A changes weight and B changes another row, restart and require both edits to survive.

6. **MAJOR — STILL OPEN: Undo restores a set into a removed exercise.**  
   [workouts.ts:225](/Users/rabah/projects/anygym/src/db/workouts.ts:225)

   Exercise removal checks saved sets but ignores unresolved deletions. **Reproduced:** delete the only set, accept Undo, remove the exercise before restoration, then recover. The set returns while `session.exerciseIds` is empty, hiding it from workout editing.

   **Exact fix:** Include tombstones and journals in the removal transaction and reject removal while unresolved operations exist. Accepted-Undo recovery must defensively restore exercise membership.

   **Test to add:** Hold restoration after Undo acceptance, attempt exercise removal, restart, and recover. Require either refusal of removal or restoration of both exercise membership and the original set exactly once.

7. **MAJOR — STILL OPEN: Changing “Loaded with” invents a selected weight.**  
   [exerciseLoad.ts:135](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:135)

   Barbell and machine rebuilding accept incompatible stored load kinds. **Reproduced:** a selected single 60 lb weight became a confirmable 45 lb bare bar without selecting another weight.

   **Exact fix:** Preserve the selection’s load-kind identity; reject incompatible kinds in rebuilding and confirmation. Changing load type must invalidate the prior weight selection and require explicit reselection.

   **Test to add:** Select single 60 lb, change to barbell, then plate machine. Require incompatible `currentLoad()` and `confirmablePick()` calls to return `null`; through the UI, require a new selection before logging. Repeat after reload.

8. **MAJOR — STILL OPEN: The public muscle browser displays rejected demos.**  
   [exerciseInfo.ts:37](/Users/rabah/projects/anygym/src/data/exerciseInfo.ts:37)

   `infoForCatalog()` labels every catalog exercise exact. **Confirmed:** plan Plank suppresses its rejected kneeling photo, while the public Abs list and exercise sheet expose it.

   **Exact fix:** Store explicit catalog-photo eligibility from the audit and enforce it for public thumbnails and sheets. Allow rejected assets only through an explicit owner-review path.

   **Implementation-repeating assertion:** [muscles-2.2c.spec.ts:13](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:13) calculates expected membership with production’s `exercisesForRegion()`. An incorrect filter can agree with itself.

   **Tests to add:** Use independently specified expected exercise IDs for representative muscles. Separately assert the audited `Plank` and `Close-Grip_Front_Lat_Pulldown` photos cannot appear in public lists or sheets; validate every catalog ID against an independent eligibility manifest.

9. **MAJOR — STILL OPEN: A Review read failure can erase previous decisions.**  
   [ReviewScreen.tsx:55](/Users/rabah/projects/anygym/src/screens/review/ReviewScreen.tsx:55)

   A failed initial read is swallowed, then controls become available with empty state. The next verdict writes that state over existing decisions. **Source-confirmed; UI fault injection was not run.**

   **Exact fix:** Enable decisions only after successful loading, show Retry on failure, and transactionally read/merge the changed decision when saving.

   **Test to add:** Seed two decisions, reject the first `REVIEW_KEY` read, and assert decision controls remain unavailable and stored JSON is unchanged. Retry, approve another exercise, reload, and require all three decisions. Current Review UI coverage starts with empty, readable storage.

10. **MAJOR — STILL OPEN, test gap: Hard-kill tests avoid write boundaries.**  
    [kill.spec.ts:83](/Users/rabah/projects/anygym/tests/kill.spec.ts:83)

    Tests snapshot settled state before SIGKILL. They do not terminate between journal persistence, set commit, and draft reconciliation.

    **Counterexample:** settled drafts recover correctly, but termination after set commit and before cleanup duplicates the checked row. **This browser defect is not established.**

    **Exact test/fix:** Add deterministic gates after journal persistence, before set commit, and after receipt commit before cleanup. SIGKILL at each gate, reopen offline, and assert one saved set with literal expected values plus unchanged pending rows. Include accepted Undo before restoration commit.

11. **MAJOR — STILL OPEN, test gap: Default acceptance runs omit four required devices.**  
    [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

    Android projects and the 320-wide floor select only `@matrix` tests. Default runs therefore omit their hard-kill coverage, contrary to SPEC §§13.3–13.4.

    **Counterexample:** an Android-only recovery regression cannot fail the default run because its test is never selected. No additional device defect is claimed.

    **Exact fix/test:** Make full matrix execution the acceptance default; expose the checkpoint subset through a separately named command. Add discovery validation requiring identical normalized acceptance-test IDs across all seven projects, explicitly including kill and monkey cases.

12. **MAJOR — STILL OPEN, test gap: “Swipe” coverage bypasses native touch behavior.**  
    [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [polish-2.2d.spec.ts:44](/Users/rabah/projects/anygym/tests/polish-2.2d.spec.ts:44), [monkey.ts:181](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:181)

    Wheel coverage assigns `scrollLeft`; row swipes and monkey swipes use mouse dragging.

    **Counterexample:** touch-action blocks finger scrolling or cancels swipe-to-delete while direct scrolling and mouse tests pass. **No current physical-device failure was reproduced.**

    **Exact test/fix:** Add native touch drags using Chromium touch injection and an iOS simulator/device driver. In Weight/Edit sheets, verify scrolling changes selection and Done/Save persists the displayed weight. For set rows, verify a horizontal finger swipe reveals Delete while vertical movement scrolls without deleting.