Codex brief for PLAN item 2.0e, written Oct 30 19:13 at commit 1b831b5. SPEC.md wins if they disagree; code may have moved since.

Read-only review complete. No files edited; tests were not run.
Target: [PLAN.md:57](/Users/rabah/projects/anygym/PLAN.md:57), item **2.0e**, on `s2-catalog`.

1. **Applicable SPEC requirements and acceptance checks**

- **SPEC §0.4:** all five fixes must work offline.
- **SPEC §2:** writes are transactional; session validation must occur inside the transaction that changes the set.
- **SPEC §§9.1–9.2:** export includes pending workout data; merge and replace preserve recoverable drafts and mutation payloads.
- **SPEC §13.1:** errors explain what happened and how to retry, without exposing raw exceptions.
- **SPEC §13.3:** failed writes survive restart; no duplicate sets, console errors, or unhandled rejections; errors remain accessible.
- **SPEC §§13.4–13.5:** SE and Max layouts, safe areas, 130% text, and internal scrolling remain usable.
- **SPEC §20.2:** changing reps affects the selected set, even when logging changes row positions.
- **SPEC §21.1:** preserve set types, warm-up exclusions, and existing logging behavior.
- **SPEC §§23.1, 23.4:** retain modal behavior; capture before/after screenshots and flow videos on SE and Max.
- **Acceptance A:** overlapping saves to 17 and 19 reps cannot let the older completion erase the newer failed intent.
- After restart, the 19-rep payload remains recoverable; Finish refuses until retry succeeds or the user explicitly discards it.
- **Acceptance B:** stale Save, Delete, and type changes cannot alter a finished workout or create a deletion tombstone.
- **Acceptance C:** start logging row 3, open row 2’s reps editor, then complete logging; subsequent edits still affect row 2’s draft identity.
- If the edited draft itself commits or disappears, its editor closes and subsequent input changes nothing.
- **Acceptance D:** immediately after fallback hydration, export contains every valid pending draft without opening an exercise first.
- **Acceptance E:** failed Save leaves Edit open, preserves input, and announces “Could not save that. Try again.” inside the dialog.

2. **Files and implementation**

- [src/db/mutations.ts](/Users/rabah/projects/anygym/src/db/mutations.ts): replace shared operation identity in `mutationId()`.
- Currently every edit to a set uses `mut:edit:<setId>`, and every type change uses `mut:type:<setId>`, with `rev: 0`.
- Give each accepted operation an immutable identity containing the logical key and revision; keep edit and type streams separate.
- Allocate revisions transactionally across connections; a module counter or `Date.now()` alone cannot order two tabs reliably.
- `saveMutation()` must persist each operation’s payload before applying it, without replacing another operation’s payload.
- Change private `apply()` to receive the stored entry/operation identity, rather than recomputing a shared ID from `MutationIntent`.
- Inside its transaction, verify that exact entry still exists, validate its parent session, and delete only that operation’s entry.
- Superseded operations must never overwrite a newer successful operation; preserve the newest failed operation for recovery.
- `pendingMutations()` should expose actionable pending changes consistently; `retryMutations()` must replay stored values with deterministic ordering.
- `dropMutations()` must discard only the entries covered by the user’s explicit decision, never an unrelated later operation.
- [src/db/workouts.ts](/Users/rabah/projects/anygym/src/db/workouts.ts): add `db.sessions` to `deleteSet()`’s transaction.
- After reading the set, read its session; throw `WorkoutFinishedError` if missing or ended, before `seedCounter()`, deletion, or tombstone creation.
- Preserve missing-set idempotency: an already absent set can still return `undefined`.
- `updateSet()` and `updateSetType()` already validate their sessions transactionally; retain those checks.
- Check `addExercise()` too: it currently accepts ended sessions, unlike `setExerciseOrder()` and `removeExercise()`.
- Harden `finishWorkout()` against a mutation journaled by another tab between `pendingMutations()` and Finish’s transaction.
- Reject unresolved mutation entries inside Finish’s transaction before its existing blanket journal deletion; return control to the unsaved-change flow.
- [src/screens/workout/ExerciseView.tsx](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx): replace numeric `editing` state with a draft ID.
- Use existing `idOf()`, `rowById()`, `rowsOf()`, and `rowKey()`; derive the current display index for `SetTable`.
- Resolve the stored ID again inside each amount-change callback before calling `writeRow()`; do not trust a captured row index.
- Close the editor when its identity disappears; respect `logQueue.closed(sessionId)` before accepting further changes.
- Preserve timed-row behavior: typed seconds still write `watch: heldFor(value)`; reps still set `own.reps`.
- `src/screens/workout/SetTable.tsx`: retain its presentation-only `editing: number | null` interface if possible.
- Pass the index derived from the stable ID; ensure stepper remounting/keys cannot transfer a held repeat gesture to another draft.
- [src/lib/drafts.ts](/Users/rabah/projects/anygym/src/lib/drafts.ts): fix `exportDrafts()`.
- Select its base from `read(s)` when storage exists, otherwise `hydrated.get(NO_STORAGE) ?? {}`.
- Validate entries through `validDraft()`, then overlay the active memory session exactly as today.
- Preserve the empty-memory-session deletion rule so cleared drafts cannot return from the hydrated base.
- [src/screens/workout/EditSetSheet.tsx](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx): let `EditBody` receive Save failure status.
- Change `onSave` to a typed result such as `{ ok: true } | { ok: false; error: string }`, or propagate caught failures deliberately.
- Add an initially empty `aria-live` error region beside Save inside the sheet; keep values and enable retry after failure.
- Keep `running`, `busy`, `settling`, and `mounted` protections; catch failures so `void save()` cannot produce an unhandled rejection.
- `src/screens/workout/WorkoutScreen.tsx`: update `onSave()` to return that result instead of swallowing failures into the background toast.
- Close only on success or terminal finished-workout handling; use the existing `WorkoutFinishedError` wording.
- Update `onDelete()` to distinguish finished-workout rejection, restore optimistic visibility, and avoid offering a misleading retry.
- `src/screens/workout/Workout.module.css`: add only the dialog error styling needed, using existing design tokens.
- `src/lib/backup.ts`: update `RECORD_CHECKS.journal`/`isJournalEntry()` compatibility for revision-bearing mutation IDs.

3. **Data model and Dexie migration**

- Current schema is **v9**; `journal` already has `id`, `sessionId`, `key`, `rev`, `draft`, `at`, and optional `mutation`.
- Reuse these fields; `MutationIntent`’s edit/type payloads need no new domain fields.
- Preserve `draft.id === JournalEntry.id`; the backup validator currently enforces this.
- Accept legacy `mut:<kind>:<setId>` entries as revision zero and replay them safely.
- A concrete counter option is a reserved `db.kv` key per session/set/mutation kind, allocated with the journal write.
- Keep a revision watermark after successful application so an older delayed operation cannot become current again.
- If using that option, include `kv` in affected transactions; reset/rebuild its reserved keys during restore, since `kv` is not backed up.
- **No Dexie version bump is needed** if existing stores and indexes suffice; do not rewrite shipped schema declarations.
- If adding an index/store instead, append v10 and test a v9 database upgrade with all sets and pending intents intact.
- Keep backup format `anygym-backup-v1` compatible with older files; reject malformed operation identities before restore changes anything.

4. **Trickiest edge cases**

- **Reverse completion:** newer save succeeds before older apply resumes; the older operation must no-op rather than restore stale values.
- **Newer failure:** older success must remove only its own entry; the newer payload remains durable and blocks Finish.
- **Independent fields:** a reps/load edit and a type change must both survive; supersession applies within the same logical mutation kind.
- **Discard during retry:** an operation removed by explicit discard must not later apply from a stale closure; re-read its exact journal entry.
- **Finish in another tab:** local `finishing.current` and `logQueue.closed()` do not protect shared IndexedDB; transactional checks are authoritative.
- **Missing parent:** an orphaned existing set must not be modified or deleted; no counters or tombstones should change on rejection.
- **Reps hold during reconciliation:** resolve identity for repeat callbacks too; closing/remounting the stepper must cancel its repeat timers.
- **Fallback precedence:** hydrated data supplies untouched drafts, memory supplies newer edits, and memory clears suppress older hydrated entries.
- **Dialog reopening:** an earlier Save completion must not attach an error to a different editor opening; use an opening generation if needed.
- **Ambiguous write outcome:** rely on transactional journal/set state on retry, preserving idempotency rather than issuing a second logical edit.

5. **Tests to write and assertions**

- Create `src/db/__tests__/mutations-2.0e.test.ts` using `fake-indexeddb`, real `AnyGymDB`, and two connections to the same database.
- Gate application after journaling; overlap 17/19-rep edits and fail the newer write: its exact payload survives older completion and reopening.
- Reverse completion order: newer success wins, older retry never restores 17, and no actionable stale entries remain.
- Concurrent edit plus type change: both fields persist; neither journal cleanup erases the other operation.
- Journal-write failure: set and earlier pending intent remain unchanged; failed registration cannot advance authoritative state partially.
- Retry/discard tests: repeated retry is idempotent, repeated failure retains payload, and discarded operations cannot later apply.
- Create `src/db/__tests__/edit-lifecycle-2.0e.test.ts`: Finish first, then attempt `deleteSet()`, `updateSet()`, and `updateSetType()`.
- Assert `WorkoutFinishedError`, byte-equivalent saved sets, unchanged counters/tombstones, and unchanged plan state.
- Add a cross-connection Finish race: a newly journaled unresolved mutation prevents Finish from clearing the journal or setting `endedAt`.
- Extend `src/lib/__tests__/drafts.test.ts`: `hydrateDrafts(blob, null)` then immediate `exportDrafts(null)` includes reps, load, plates, IDs, revisions, and stopwatch timestamps.
- Also assert invalid hydrated drafts are omitted, memory edits win, and clears remain absent.
- Extend `src/db/__tests__/backup-live-2.0c.test.ts`: export before exercise access, serialize/parse, restore into another database, verify exact drafts.
- Extend backup validation tests for legacy IDs, revision IDs, mismatched set/kind/revision identities, and unchanged Log journal entries.
- Create `tests/journal-editors-2.0e.spec.ts`; import `test` and `expect` from `./fixtures`, and tag acceptance cases `@matrix`.
- Reuse `dbAll()`, `quickWith()`, `exerciseView()`, `loggedRows()`, and the timing helpers in `tests/helpers/idb.ts`.
- Delayed Log test: seed distinct 7/8/19-rep drafts, log row 3, open row 2’s editor, release the write, increment once.
- Assert the original row-2 draft becomes 9; original row 1 stays 7; exactly one 19-rep set exists.
- Edited-row commit test: editor closes when its draft commits; later taps or held repeats cannot modify another row.
- Stale-editor test: open Edit in tab A, Finish in tab B, then exercise stale Save/Delete paths; stored sets and plan state stay unchanged.
- Save-error test: fail the real set transaction; assert error within `getByRole('dialog', { name: 'Edit set' })` and its live region.
- Assert entered values remain, retry succeeds once, and no unhandled rejection occurs.
- Extend `tests/durability-2.0c.spec.ts` for overlapping failure → reload → Finish refusal → retry → exact latest saved payload.
- Add blocked-localStorage startup → Settings export without exercise access; verify the downloaded backup’s draft contents.
- Run WebKit projects **`iPhone SE`** and **`iPhone 17 Pro Max`**; SE means 375×667, Max 440×956.
- Test error/stepper layouts at 130% text, including newly mounted controls; check clipping, reachability, and internal scrolling.
- Run new `@matrix` cases across all configured devices; capture SE/Max screenshots and videos under SPEC §23.4.
- Validation commands: `npm run typecheck`, targeted Vitest, targeted Playwright with both named projects, then the existing regression suites.

6. **Risks and conflicts with built code**

- The 1627 report’s missing edit-journaling finding is already partially fixed: extend `saveMutation()`, rather than adding a parallel persistence mechanism.
- `src/screens/workout/__tests__/weights-2.0c.test.ts` already covers edit/type recovery and legacy journal validation; preserve those contracts.
- `rowLog.journalOf()` excludes mutation entries; revision changes must not make mutations appear as pending Log rows.
- `finishWorkout()` currently deletes the session journal after a screen-level check; without the transactional recheck, cross-tab data loss remains.
- `EditBody` currently receives a fulfilled `Promise<void>` even when Save fails; adding an error paragraph alone cannot fix accessibility.
- `sheetStack.ts` intentionally makes background toasts inert; keep errors inside Edit rather than weakening modal isolation.
- `exportDrafts()` feeds backup merge behavior too; preserve memory-clear precedence and active-session filtering in `buildBackup()`.
- Recent 2.0c code already preserves backup rest/extra rows and Finish→Undo rest deadlines; retain those regressions.
- 2.0d touches shared weight UI and remains unchecked in PLAN despite source changes; avoid reverting its picture-first plate work.
- Reports also identify Undo-finalization and broader test-matrix gaps outside this item’s five fixes; track them separately.
- Existing untracked critic/report/test artifacts are present; leave them untouched and out of the builder’s eventual commit.