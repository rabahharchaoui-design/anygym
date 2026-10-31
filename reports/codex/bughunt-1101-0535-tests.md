**12 findings: nine confirmed data defects and three test gaps, all STILL OPEN from earlier reports.** Fixed findings excluded; scope limited to completed `[x]` work. No files edited. Typecheck passed. Data failures were reproduced with actual modules, in-memory IndexedDB and controlled failures; browser timing and physical iPhone behavior remain unverified.

1. **MAJOR — STILL OPEN: Restored corrections disappear after restart.**  
   [src/db/backup.ts:121](/Users/rabah/projects/anygym/src/db/backup.ts:121), [src/db/mutations.ts:155](/Users/rabah/projects/anygym/src/db/mutations.ts:155)

   Restore installs `pendingChanges` only in memory/localStorage after the database transaction commits. If localStorage refuses writes, Restore reports success, but restart loses the correction. **Reproduced: pending 19 reps disappeared; saved 10 remained.**

   **Exact fix:** Persist incoming correction intents in IndexedDB inside both Replace and Merge transactions. Roll back restoration if persistence fails.

   **Mocked-away failure/test:** [backup-held-2.0h.test.ts:67](/Users/rabah/projects/anygym/src/db/__tests__/backup-held-2.0h.test.ts:67) uses working storage and retries within the same runtime. Add Replace/Merge cases with throwing `setItem`/`removeItem`, then reopen through a fresh runtime. Assert 19 remains pending and Retry saves it exactly once.

2. **MAJOR — STILL OPEN: Finish discards another tab’s failed correction.**  
   [WorkoutScreen.tsx:461](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:461), [workouts.ts:406](/Users/rabah/projects/anygym/src/db/workouts.ts:406)

   After A checks pending changes, B’s edit fails journaling and enters fallback storage. Finish rechecks only database journals. **Reproduced: A finished with 10 reps; B’s Retry returned success while discarding its pending 19.**

   **Exact fix:** Serialize mutation registration, fallback handoff and Finish across tabs. Under that shared lock, recheck fallback intents before completion; unresolved registrations must block Finish.

   **Test:** Extend [journal-2.0e.test.ts:227](/Users/rabah/projects/anygym/src/db/__tests__/journal-2.0e.test.ts:227): fail B’s **journal write**, instead of its set write, after A’s preliminary check. Require Finish to refuse, correction to survive restart, and Retry to save 19.

3. **MAJOR — STILL OPEN: Finish destroys an unknown legacy deletion’s recovery copy.**  
   [workouts.ts:415](/Users/rabah/projects/anygym/src/db/workouts.ts:415)

   An unknown tokenless tombstone passes ownership checking because `owned.get(id)` and `t.token` are both `undefined`. **Reproduced: finishing the last-set case removed the workout and tombstone.**

   **Exact fix:** Require `owned.has(t.id)` before comparing tokens. Assign explicit identities to legacy deletions during migration/recovery; absent ownership must block Finish.

   **Test:** Extend [bughunt-2.0f.test.ts:72](/Users/rabah/projects/anygym/src/db/__tests__/bughunt-2.0f.test.ts:72) with a tokenless tombstone and empty ownership map. Assert `UnresolvedDeletesError`, unchanged tombstone, and active session. Repeat with the deleted set as the workout’s only set.

4. **MAJOR — STILL OPEN: Finish → Undo reactivates an obsolete correction.**  
   [workouts.ts:431](/Users/rabah/projects/anygym/src/db/workouts.ts:431), [mutations.ts:133](/Users/rabah/projects/anygym/src/db/mutations.ts:133)

   A failed 17-rep edit remains in fallback when cleanup fails. A successful 19-rep save suppresses it using a database marker. Finish deletes that marker; reopening exposes 17 again. **Reproduced: Retry reverted 19 to 17.**

   **Exact fix:** Retain supersession markers across Finish and reopening. Remove them only when the session is permanently deleted.

   **Test:** Extend [bughunt-2.0f.test.ts:200](/Users/rabah/projects/anygym/src/db/__tests__/bughunt-2.0f.test.ts:200), which currently stops before Finish: fail 17’s journal, save 19 with fallback cleanup failing, Finish, reopen, restart, Retry. Assert 19 remains saved and no obsolete change is offered.

5. **MAJOR — STILL OPEN: Equal timestamps hide a newer correction.**  
   [mutations.ts:56](/Users/rabah/projects/anygym/src/db/mutations.ts:56), [mutations.ts:133](/Users/rabah/projects/anygym/src/db/mutations.ts:133)

   `nextAt()` is monotonic only within one database object. Separate tabs can assign equal timestamps. An earlier successful edit’s marker then suppresses a later failed edit. **Reproduced: fallback contained 19, but pending changes returned zero after saving 17.**

   **Exact fix:** Use operation identities and ordering coordinated across tabs. Suppress explicitly applied/superseded operations; timestamp equality alone cannot establish supersession.

   **Test:** [bughunt-2.0f.test.ts:227](/Users/rabah/projects/anygym/src/db/__tests__/bughunt-2.0f.test.ts:227) supplies one database object, whose counter prevents the collision. Add two connections to the same database: save 17 through A, fail journaling 19 through B at the same supplied time. Require pending 19 and successful recovery.

6. **MAJOR — STILL OPEN: Editing another row overwrites newer pending reps.**  
   [drafts.ts:180](/Users/rabah/projects/anygym/src/lib/drafts.ts:180), [drafts.ts:203](/Users/rabah/projects/anygym/src/lib/drafts.ts:203)

   Two tabs independently produce the same draft ID and revision. A clean cached row ignores different stored contents when those identifiers match, then writes its stale value back. **Reproduced: B’s 19 reps reverted to A’s 17 when A edited another row.**

   **Exact fix:** Persist changed rows individually with transactionally allocated revisions. Clean cached rows must adopt authoritative stored values, including equal-revision conflicts.

   **Test:** Extend [bughunt-2.0f.test.ts:247](/Users/rabah/projects/anygym/src/db/__tests__/bughunt-2.0f.test.ts:247): both tabs load revision 1; A writes 17/revision 2, B writes 19/revision 2; A changes another row. Reload both and assert 19 plus the other-row edit survive.

7. **MAJOR — STILL OPEN: Backup resurrects an intentionally deleted set.**  
   [src/db/backup.ts:45](/Users/rabah/projects/anygym/src/db/backup.ts:45)

   Export matches Undo intents by set ID alone, ignoring deletion tokens. An obsolete intent therefore marks a newer deletion `undo: true`. **Reproduced: ordinary token matching rejected the intent while export accepted it.**

   **Exact fix:** Match each tombstone using `hasUndoIntent(..., t.token)`. Read database intents and tombstones in the same snapshot transaction.

   **Test:** Delete A, restore it, correct it, delete it again as B, then reinsert A’s obsolete intent. Export and restore into a fresh context. Assert B remains deleted and export never marks it accepted.

   **Implementation-repeating assertion:** [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97) derives completeness from production’s `TABLE_NAMES`; omitted recovery data can disappear from both expectations and output. Add an independent literal backup contract with distinct recovery-state sentinels and verify destination behavior after restart.

8. **MAJOR — STILL OPEN: A legacy Undo intent authorizes a newer deletion.**  
   [undoIntents.ts:24](/Users/rabah/projects/anygym/src/db/undoIntents.ts:24)

   Missing tokens remain wildcards. A tokenless intent left by an older version matches a newly tokenized tombstone. **Reproduced: Finish restored an intentionally deleted set.**

   **Exact fix:** Require exact deletion identity in matching and cleanup. Migrate tokenless intents only alongside their corresponding legacy tombstones; unmatched legacy intents must never authorize newer deletions.

   **Test:** Extend [bughunt-2.0f.test.ts:84](/Users/rabah/projects/anygym/src/db/__tests__/bughunt-2.0f.test.ts:84) with a tokenless obsolete intent and newer tokenized tombstone. Assert recovery, Finish and backup all leave the newer set deleted.

9. **MAJOR — STILL OPEN: A stale Delete offers Undo for another tab’s deletion.**  
   [sessionRecovery.ts:62](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:62), [deleteUndo.ts:115](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:115)

   Deleting from a stale editor finds no saved set, but the manager retains its provisional Undo record without an owned token. Undo then accepts another tab’s tombstone. **Reproduced: the other tab’s deleted set returned.**

   **Exact fix:** Return an explicit no-op result when nothing was deleted, remove the provisional record, and withdraw Undo. Require an owned deletion identity before restoration.

   **Test:** Keep A’s editor open; delete through B; invoke A’s Delete. Assert A offers no Undo. Attempt any stale action and verify B’s tombstone/token remain unchanged and its set stays absent.

10. **MAJOR — STILL OPEN, test gap: Hard-kill coverage avoids write boundaries.**  
    [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

    Tests snapshot settled state before killing. They never terminate between journal persistence, set commit and draft reconciliation.

    **Counterexample:** recovery preserves settled drafts but duplicates a checked set after termination between commit and cleanup. **This browser failure is unproven.**

    **Exact fix/test:** Add deterministic gates after journal persistence, before set commit, and after receipt commit before cleanup. SIGKILL at each gate, reopen offline, and assert exactly one checked set plus unchanged pending rows. Cover Undo acceptance before restoration commit too. Compare expected user values directly, not only a pre-kill storage snapshot.

11. **MAJOR — STILL OPEN, test gap: Default acceptance execution omits four devices.**  
    [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

    Android projects and the 320-wide floor run only `@matrix` tests. Ordinary `npm run test:ui` excludes their kill and monkey coverage, contrary to SPEC §§13.3–13.4.

    **Counterexample:** an Android-only recovery defect cannot fail the default suite because its recovery test is never selected. No additional device defect is claimed.

    **Exact fix/test:** Make all seven projects run the full acceptance suite by default; provide a separately named checkpoint subset. Add a discovery test comparing normalized acceptance-test IDs across projects, explicitly requiring kill and monkey cases.

12. **MAJOR — STILL OPEN, test gap: “Swipe” tests bypass native touch handling.**  
    [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [monkey.ts:181](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:181)

    Wheel tests assign `scrollLeft`; monkey swipes use mouse dragging. Neither exercises native phone panning or proves `touch-action` permits thumb scrolling.

    **Counterexample:** a sheet blocks touch scrolling while direct scroll assignment and mouse tests pass. **No current physical-device failure was reproduced.**

    **Exact fix/test:** Add native touch drags through Chromium touch injection and an iOS simulator/device driver. In Weight and Edit sheets, assert actual scroll movement, changed selection, and Done/Save persisting the displayed weight. Include nested-sheet scrolling and edge-back gestures required by SPEC 13.