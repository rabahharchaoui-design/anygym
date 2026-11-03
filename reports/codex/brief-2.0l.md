Codex brief for PLAN item 2.0l, written Nov 03 18:30 at commit 3a42771. SPEC.md wins if they disagree; code may have moved since.

Implementation brief for [PLAN.md:75](/Users/rabah/projects/anygym/PLAN.md:75), item **2.0l**. Read `CLAUDE.md`, the applicable SPEC, both referenced reports, implementation, and existing regression tests. No files changed; tests were not run.

**1) Applicable SPEC and acceptance checks**

- **SPEC 0, 2:** no invented weights; offline operation; transactional writes; durable recovery.
- **SPEC 5.4–5.5:** weight arithmetic stays in `src/lib/load.ts`; preserve the complete stored `Load`.
- **SPEC 9.1–9.2:** export and restore preserve committed lifts and unresolved workout state.
- **SPEC 13.1–13.5:** Undo, understandable controls, no lost inputs, double-tap safety, accessible targets, compact phone layouts.
- **SPEC 20.2–20.4:** logging remains one tap; reps remain editable in place; existing tap budgets remain valid.
- **SPEC 4.4:** typical three-to-four-set tables and every check remain above the fold.
- **SPEC 23.2–23.4:** immediate feedback, shared styling/motion, reduced motion, screenshots and recordings on both requested iPhones.
- **A1:** failed Olympic-bar 135 lb Log → change selected bar → dismiss picker → Retry saves exactly the load visibly represented by that pending row, including `barId`.
- **A2:** Remove exercise → Undo → immediate Finish restores every accepted member before finishing, or refuses Finish with recoverable state intact.
- **A3:** same draft ID and revision, different weights: the committed weight remains; conflicting input survives; no false landed callback.
- **A4:** logging from a stale tab preserves another tab’s durable pending weight, including equal-revision conflicts.
- **A5:** export cannot combine earlier sets with later cleared drafts and thereby lose a submitted lift.
- **A6:** explicitly discarded corrections remain discarded after Finish → Undo, including stale copies in another tab.
- **A7:** swipe B while C logs: only B can be removed; A survives. If B committed or disappeared, removal does nothing.
- **A8:** current reps visibly invite editing; the current logging control visibly reads as an action; logging adds no confirmation step.

**2) Files and implementation**

- Change `src/lib/setTable.ts`: make `pendingRows()` preserve the canonical submitted load for unresolved submissions.
- Currently it calls `rebuild()` for drafts, allowing today’s selected equipment to change the displayed load.
- Keep ordinary target prefilling through `currentLoad()`; submitted payloads need separate handling.
- Extend `markSubmitted()` to capture immutable submission identity and payload information.
- Extend `Committed` and `reconcileRows()` beyond revision-only comparison.
- Preserve a conflicting edit under a successor identity; consume only a positively identified committed submission.
- Keep `successorOf()` restart-safe; prevent two distinct conflicting edits from collapsing onto the same successor.
- Change `src/screens/workout/rowLog.ts`: update `setOf()`, `submitRow()`, `committedOf()`, `adoptJournal()`, and reconciliation.
- `submitRow()` currently initializes `committedRev` from the request and swallows receipt-read failures.
- Replace that optimistic default with an explicit unresolved result; missing/unreadable receipts must never authorize clearing input.
- Fire `onLanded` only when committed submission identity and payload match the submitted operation.
- `retryFailed()` and the exercise Retry path must use the same canonical payload resolver.
- Change `src/db/workouts.ts`: `logSet()` must commit submission identity/fingerprint alongside the set.
- Its existing-set branch currently returns the old set and deletes the journal without checking payload equality.
- Preserve conflicting journal/input state until reconciliation has safely retained it; retain ordinary idempotent duplicate behavior.
- Change `src/screens/workout/useWorkout.ts`: carry richer committed receipts through the existing sets/submissions/journal read transaction.
- Change `src/lib/drafts.ts`: fix `draftsDurableMerge()` to write only dirty rows and explicit deletions.
- Remove the clean-row overwrite condition `(d.rev ?? 0) >= (theirs.rev ?? 0)`.
- Reuse the same merge implementation in `persistRows()` and the Log journaling transaction.
- Clear dirty markers only after durable commit, and only for the exact generation/value persisted.
- `mirror()` currently clears dirty state after localStorage succeeds while IndexedDB persistence is still asynchronous; close that gap.
- Add an awaitable draft-persistence barrier for export; accept an injected database so tests exercise production persistence behavior.
- Change `src/lib/deleteUndo.ts`: synchronously track the entire `undoAll()` operation before its first await.
- Include acceptance and exercise restoration in that tracked operation, not just individual set writes.
- Allow an already-admitted group to finish after `close()` rejects new work; do not route it through the public closed-state guard.
- Keep failed or unattempted members unresolved, without expiry; `close()` must wait or throw `UndoUnresolvedError`.
- Change `src/screens/workout/sessionRecovery.ts`: expose group restoration through the workout-owned manager.
- Coordinate durable acceptance of all deletion tokens before restoring members; preserve recovery across unmounts and restart.
- Change `src/screens/workout/WorkoutScreen.tsx`: replace the untracked `restoreExercise()` → `deletes.undoAll()` sequence in `removeWithSets()`.
- Register the group synchronously in the Undo callback; `finishNow()` already waits through `deletes.close()`.
- Change `src/db/mutations.ts`: run `dropMutations()` under `withSessionLock()`.
- Transactionally write suppression receipts for discarded held IDs themselves and their covered predecessors before deleting stored copies.
- Reuse `supKey()`/`MUTATION_SUP_PREFIX`; filter stale memory, fallback, and restored-held entries through those receipts.
- Change `src/db/backup.ts`: replace the split `readTables()` → live-state reads in `exportBackup()`.
- Flush pending draft persistence, then read backup tables plus `db.kv` in one read transaction.
- Derive drafts, durable Undo intents, rest, extra rows, and suppression filtering from that captured snapshot.
- Coordinate memory/localStorage fallback capture with operation admission using `withSessionLock()`; avoid fresh database reads after capture.
- Keep `readTables()` usable independently: its existing transaction is correct, but does not include live workout state.
- Change `src/screens/workout/ExerciseView.tsx`: share canonical Retry behavior and visibly retain submitted equipment identity.
- An explicit weight correction must update display, draft, and pending journal consistently before another Retry.
- Replace `removeRow(row)`’s delayed index targeting with stable draft-ID lookup at execution time.
- Use existing `idOf()`/`rowById()` patterns; materialize target values before the gesture animation.
- Change `src/screens/workout/SwipeRow.tsx`: capture removal identity at gesture start and retain it through `animateOut()`.
- Cancel safely when a position-keyed component begins representing another row; include the menu’s `removeRowAnimated()` path.
- Change `src/screens/workout/SetTable.tsx` and `SetTable.module.css`: underline current-row reps or add a quiet edit glyph.
- Give the current check a visible `Log` label while the existing first-time coach mark applies.
- Retain accessible `Log set …` names, existing test IDs, blocked-weight behavior, and a minimum 48 pt hit area.
- New shared helper suggested: `src/lib/submission.ts` for canonical payload encoding, fingerprints, and receipt matching; no weight arithmetic.

**3) Data model and Dexie**

- Current database schema is **v9**; the proposed changes require no new store or index.
- Add optional edit/submission UUID fields to `Draft`; generate identity on actual edits, not on render or every Retry.
- Extend `Submission` with optional submitted-operation identity and canonical payload fingerprint.
- Carry the same metadata in `JournalEntry` and its draft snapshot; extend `NewSet` as needed.
- Fingerprint session/exercise identity, reps or seconds, kind/failure, and every meaningful `Load` field.
- Include `barId`, `barWeight`, unit, collars, per-side plates, stack value, added weight, and unresolved legacy-bar state.
- Allocate row revisions transactionally where ordering is needed; UUID identity must distinguish independent equal-revision edits.
- Update `isDraft()` in `src/lib/drafts.ts` and validators in `src/lib/backup.ts`.
- Preserve `anygym-backup-v1`; old drafts, receipts, and backups without metadata remain readable.
- For legacy receipts, compare available payload evidence conservatively; absent evidence must not mean “requested input saved.”
- Persist discard suppression in existing `kv`; `finishLocked()` already retains supersession markers for saved sessions.
- If new suppression prefixes are introduced, update Replace cleanup and permanent-session-discard cleanup explicitly.
- Do not fabricate UUID matches or payload fingerprints for legacy records whose original submission cannot be established.

**4) Tricky boundaries**

- A settings change alone must not rewrite a failed submission’s bar, collars, unit, or total.
- If equipment changes make Retry inappropriate, retain the exact old payload and require an explicit correction; never silently substitute equipment.
- Same total on different bars is still a payload conflict; numeric equality is insufficient.
- A receipt-read failure after a successful commit means reconciliation is pending, not that another set should be inserted.
- Preserve edits made during an in-flight Log and follow committed successor chains after restart.
- Group Undo must be tracked before awaiting `restoreExercise()` and before awaiting the first `ops.accept()`.
- Another tab’s Finish also needs durable group acceptance visible to its transaction; an in-memory busy flag alone is insufficient.
- Never hold a session lock while awaiting another operation that needs the same non-reentrant lock.
- Export needs a defined snapshot boundary: every submission admitted before it must appear as a set or complete recoverable pending operation.
- A Log admitted after that boundary belongs to the next snapshot; do not promise inclusion of arbitrarily later commits.
- Do not await unrelated asynchronous work inside a Dexie transaction; flush first, transact second.
- Swipe identity must survive rerenders, reduced motion, menu removal, animation delay, and a target committing mid-gesture.

**5) Tests to write**

- Write failing reproductions before fixes; use synthetic data and existing dependency seams.
- Add `src/screens/workout/__tests__/rowLog-2.0l.test.ts`.
- Assert 135 lb committed versus 155 lb submitted at the same ID/revision retains 155, preserves 135, and fires no landed callback.
- Assert identical retries create one set; unreadable/missing receipts preserve unresolved input.
- Assert failed Olympic 135 remains display/payload-consistent after selecting the women’s bar; explicit correction replaces both consistently.
- Add `src/lib/__tests__/drafts-2.0l.test.ts`, following the separate-module-tab pattern in `drafts-2.0k.test.ts`.
- Assert durable 73 lb survives stale clean 63 lb at equal revision while that stale tab logs another row.
- Assert explicit deletions merge correctly; persistence failure retains dirty state; delayed older completion cannot publish stale values.
- Extend `src/lib/__tests__/deleteUndo.test.ts` with deferred acceptance and deferred exercise-restoration promises.
- Call Undo then `close()` immediately; assert close waits, every member restores exactly once, and failures remain unresolved.
- Add `src/db/__tests__/codex-2.0l.test.ts` for manager/Finish integration and discard receipts.
- Assert group restoration retains IDs, order, reps, loads, and exercise membership; failed restoration leaves Finish refused.
- Assert discard → Finish → reopen → stale-tab Retry keeps the original saved weight and exposes no discarded correction.
- Add `src/db/__tests__/backup-2.0l.test.ts`.
- Interleave export with Log commit/draft cleanup; restore into another database/storage and assert the lift remains committed or recoverable exactly once.
- Include durable-only drafts, held corrections, accepted token-specific Undo, rest, extra rows, and legacy/new metadata round trips.
- Extend `src/lib/__tests__/setTable.test.ts` for identity-based removal after slot shifts and target disappearance.
- Add `tests/codex-2.0l.spec.ts`, importing `test`/`expect` from `tests/fixtures.ts`.
- Use two pages in one browser context for real shared IndexedDB/localStorage; use `tests/helpers/idb.ts` for controlled write timing.
- Exercise failed Retry/bar change, equal-revision conflicts, durable-row preservation, group Undo/Finish, and discard/Finish/Undo through the UI.
- Perform a browser swipe on B, commit C during the animation, and assert A survives and B alone disappears; cover long-press removal too.
- Assert visible reps affordance, visible current `Log`, one-tap logging, blocked-weight picker, and three-to-four-row above-fold geometry.
- Run normal and reduced motion, 130% text, offline/reload recovery; capture screenshots and videos on both phones.
- Focused command: `npx playwright test tests/codex-2.0l.spec.ts --project="iPhone SE" --project="iPhone 17 Pro Max"`.
- Finish with `npm run typecheck`, `npm test`, `npm run build`, then the required full device matrix using `PW_FULL_MATRIX=1`.

**6) Existing-code risks and scope conflicts**

- 2.0k’s duplicate tests cover differing revisions; keep those and add equal-revision/different-payload cases.
- Changing `Committed` affects `useWorkout()`, journal adoption, startup reconciliation, Finish checks, and existing row tests.
- Preserve 2.0j/2.0k’s committed-IndexedDB authority when localStorage refuses writes; do not restore whole-snapshot overwrites.
- Preserve deletion-token matching and the all-members Undo window; extending operation tracking must not revive expired deletions.
- Preserve `advancesAfterLog()` behavior: false duplicate acknowledgments must not start rest or advance the exercise.
- Preserve PR correctness and memoized row rendering; receipt/payload work must not introduce per-render hashing or whole-table updates.
- The report’s extra-set cross-tab finding and UI polish about PR wording, finish summaries, and swipe-hint placement are outside item 2.0l.
- Keep the larger security/CSP item 2.2f separate; this item needs no new dependency or schema rewrite.