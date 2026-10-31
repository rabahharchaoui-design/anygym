**12 findings: 9 product defects and 3 test gaps, all STILL OPEN from earlier reports.** Completed features only; fixed findings excluded. No files edited.

Typecheck and **1,350 Vitest tests passed**; the private-history test was excluded because it creates temporary files. In-memory probes reproduced the product failures below. Playwright and physical iPhone behavior were not executed.

1. **MAJOR — STILL OPEN: Stale “Keep deleted” destroys a newer recovery record.**  
   [tombstones.ts:122](/Users/rabah/projects/anygym/src/db/tombstones.ts:122)

   Restore a deleted set elsewhere, correct it, then delete it again. The original tab’s cancellation unconditionally deletes the newer tombstone. **Reproduced: the corrected set’s recovery copy disappeared.** It can also delete an already-restored set.

   **Exact fix:** Pass the expected deletion token into `cancelUndo()` and compare it transactionally. Removing a restored set must require matching restoration-generation evidence.

   **Test to add:** Hold an unresolved Undo in A; restore, edit to 17 reps, and delete again in B; cancel in A. Assert B’s tombstone and exact values remain unchanged.

2. **MAJOR — STILL OPEN: Finish can destroy another tab’s failed Undo.**  
   [workouts.ts:380](/Users/rabah/projects/anygym/src/db/workouts.ts:380), [sessionRecovery.ts:136](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:136)

   A’s recovery is cached. B then deletes a set, but Undo acceptance and intent persistence fail. A’s manager knows nothing about it; Finish removes the unaccepted tombstone. **Reproduced: the last-set case removed the session and recovery record.**

   **Exact fix:** Pass explicitly authorized deletion tokens into Finish. Inside its transaction, refuse unknown, unfinalized tombstones until Restore/Keep deleted resolves them.

   **Test to add:** Extend [journal-2.0e.test.ts:301](/Users/rabah/projects/anygym/src/db/__tests__/journal-2.0e.test.ts:301) with two connections and previously completed recovery in A. Finish through A must refuse and preserve B’s deleted record.

3. **MAJOR — STILL OPEN: Retry overwrites a successful correction with obsolete values.**  
   [mutations.ts:84](/Users/rabah/projects/anygym/src/db/mutations.ts:84), [mutations.ts:203](/Users/rabah/projects/anygym/src/db/mutations.ts:203)

   An old edit reaches localStorage fallback. A newer edit saves successfully, but deleting the fallback fails. Retry treats the obsolete edit as pending. **Reproduced: saved 19 reps reverted to 17.**

   **Exact fix:** Commit an applied/superseded operation marker with successful mutations. Filter fallback entries against it before display or replay; correctness cannot depend on successful localStorage cleanup.

   **Mocked-away failure:** [journal-2.0e.test.ts:357](/Users/rabah/projects/anygym/src/db/__tests__/journal-2.0e.test.ts:357) supplies storage whose cleanup always succeeds. Add failed journaling for 17, successful save of 19, failing fallback removal, restart, Retry. Assert 19 remains saved and no obsolete correction is offered.

4. **MAJOR — STILL OPEN: Save → dismiss → reopen → Delete → Undo loses the correction.**  
   [mutations.ts:134](/Users/rabah/projects/anygym/src/db/mutations.ts:134), [workouts.ts:264](/Users/rabah/projects/anygym/src/db/workouts.ts:264)

   Delete can run after an edit is journaled but before application. Application finds no set, consumes the journal and resolves successfully. **Reproduced: saving 17 over 10 succeeded, but Undo restored 10 with nothing pending.**

   **Exact fix:** Include the journal in Delete’s transaction and reject deletion while that set has unresolved mutations. Application encountering a tombstoned set must retain the correction and report a retryable conflict.

   **Assertion blind spot:** [weights-2.0c.test.ts:129](/Users/rabah/projects/anygym/src/screens/workout/__tests__/weights-2.0c.test.ts:129) treats missing sets as needing no correction. Add a gated Save/Delete/Undo race; require the correction to survive or deletion to refuse.

5. **MAJOR — STILL OPEN: Another tab silently overwrites pending rows.**  
   [drafts.ts:124](/Users/rabah/projects/anygym/src/lib/drafts.ts:124), [drafts.ts:166](/Users/rabah/projects/anygym/src/lib/drafts.ts:166)

   Each tab caches the whole workout’s drafts and writes that stale collection. Editing a different row can overwrite another tab’s newer input. **Reproduced: A displayed 17 reps while a fresh reader recovered 7.**

   **Exact fix:** Persist drafts by stable row ID and revision. Transactionally merge changed rows and subscribe tabs to committed changes; avoid whole-collection replacement from cached snapshots.

   **Test to add:** Open one workout in two pages. A changes row 1 from 7 to 17; B changes row 2. Reload both and export a backup. Assert row 1 remains 17 and row 2 retains B’s change.

6. **MAJOR — STILL OPEN: Backup omits corrections held in mutation fallback.**  
   [backup.ts:38](/Users/rabah/projects/anygym/src/db/backup.ts:38), [mutations.ts:182](/Users/rabah/projects/anygym/src/db/mutations.ts:182)

   Export reads the database journal but excludes memory/localStorage mutation intents. **Reproduced: the source retained a pending 19-rep correction; its restored backup contained the original 10 reps and no pending correction.**

   **Exact fix:** Include fallback mutation intents in the validated backup contract, preserving operation identity, ordering and complete values. Restore them before enabling Retry or Finish.

   **Implementation-repeating assertion:** [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97) derives completeness from production’s `TABLE_NAMES`. Add an independent backup contract and export/restore into separate database and storage contexts after journaling fails. Assert the exact correction remains retryable.

7. **MAJOR — STILL OPEN: Recovered Undo acts on a newer intentional deletion.**  
   [sessionRecovery.ts:102](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:102), [sessionRecovery.ts:65](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:65)

   Recovery hydrates the set without its deletion token. After another tab restores, edits and deletes it again, the older manager passes `undefined`, accepting the current deletion. **Reproduced: the newer deleted 17-rep set returned and its tombstone disappeared.**

   **Exact fix:** Hydrate an immutable token with every manager record and carry it through restoration and intent storage. Require exact matching, with an explicit representation for legacy tokenless deletions.

   **Test to add:** Hydrate deletion A; elsewhere restore, correct and create deletion B; invoke the hydrated manager’s Undo. Assert B remains deleted with its recovery record intact.

8. **MAJOR — STILL OPEN: Suggested loads bypass the selected bar’s sleeve capacity.**  
   [load.ts:643](/Users/rabah/projects/anygym/src/lib/load.ts:643), [exerciseLoad.ts:134](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:134)

   Manual additions enforce capacity, but progression solving and confirmation omit the selected sleeve length. **Reproduced: 315 kg on the women’s bar was confirmable—six 25 kg plates per side, requiring 384 mm on a 320 mm sleeve.**

   **Exact fix:** Add sleeve length to `LoadSetup`, propagate it into every solver call, and validate fit during prefill, confirmation and bar changes.

   **Test to add:** Exercise the full suggestion → confirmation path using the women’s bar. Assert the above stack is refused, and changing from a longer bar cannot leave an overflowing stack loggable.

9. **MAJOR — STILL OPEN: Restore accepts state that crashes or freezes the app.**  
   [backup.ts:204](/Users/rabah/projects/anygym/src/lib/backup.ts:204), [backup.ts:336](/Users/rabah/projects/anygym/src/lib/backup.ts:336)

   Parsing accepts `nextDayIndex: -1` for a real plan and one billion added sets. The negative index reaches [DayCard.tsx:32](/Users/rabah/projects/anygym/src/screens/today/DayCard.tsx:32) and dereferences an absent day; the added count drives enormous row construction. **Parser acceptance reproduced; the billion-row loop was not executed.**

   **Exact fix:** Validate integer plan positions against the referenced plan; bound added-set counts and draft-slot indexes. Defensively validate these bounds in consumers too.

   **Test to add:** Submit each malformed backup through Restore. Require rejection before replacement and byte-identical existing data afterward. Cover negative, fractional and excessive indexes/counts.

10. **MAJOR — STILL OPEN, test gap: Hard-kill tests miss write boundaries required by SPEC §13.3.**  
    [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

    Tests kill after successful UI assertions and database snapshots. **Counterexample:** settled drafts survive, but termination after set commit and before reconciliation duplicates the checked lift or loses another row. This specific browser failure remains unverified.

    **Exact fix/test:** Gate execution after journal persistence, before commit, and after receipt commit before cleanup. SIGKILL at each boundary, reopen offline, and assert exactly one saved 19-rep set plus pending 7- and 8-rep rows. Repeat between Undo acceptance and restoration commit.

11. **MAJOR — STILL OPEN, test gap: Default acceptance execution omits four required devices.**  
    [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

    Android projects and the 320 floor select only `@matrix` tests. Kill and monkey coverage is therefore absent from ordinary `npm run test:ui`, contrary to SPEC §§13.3–13.4.

    **Counterexample:** an Android-only recovery regression cannot fail the default suite because its recovery test is excluded. No additional device defect is claimed.

    **Exact fix/test:** Make full-matrix execution the default; name the checkpoint subset separately. Add a discovery contract requiring shared acceptance-test IDs across all seven projects, explicitly including kill and monkey tests.

12. **MAJOR — STILL OPEN, test gap: “Swipes” bypass native phone touch handling.**  
    [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [monkey.ts:181](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:181)

    Picker tests assign `scrollLeft`; monkey swipes use mouse dragging. Neither verifies native touch panning.

    **Counterexample:** a sheet’s `touch-action` blocks thumb scrolling while direct assignment and mouse input pass. **No current physical-device failure was reproduced.**

    **Exact fix/test:** Add native touch drags through Chromium touch injection and an iOS simulator/device driver. In Weight and Edit sheets, assert actual scroll movement, changed selection, and Done/Save persisting the displayed weight. Include nested sheets and edge-back gestures.