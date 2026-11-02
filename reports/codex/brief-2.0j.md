Codex brief for PLAN item 2.0j, written Nov 02 15:11 at commit f421cdd. SPEC.md wins if they disagree; code may have moved since.

Read-only brief for [PLAN.md:71](/Users/rabah/projects/anygym/PLAN.md:71), item **2.0j**, checked against `CLAUDE.md`, `SPEC.md`, both cited bug reports, and current source. No files edited; tests below are proposed, not executed.

**1) Applicable SPEC and acceptance checks**

- **§0.1, §4.3:** public photos require an eligible exact/variant match; `none` and unknown eligibility produce no photo.
- Check every catalog ID, including thumbnails, exercise sheets, workout heroes, and full-screen demos.
- Explicit regressions: `Plank` and `Close-Grip_Front_Lat_Pulldown` must never regain public photos rejected by audit 2.5.
- **§4.4–4.5:** preserve independently verified muscle data, cues, variant notes, and honest empty states.
- **§9.4:** Review retains prior decisions through read/save failures, shows a retryable error, and exports committed decisions.
- Owner Review still needs an explicit inspection path for rejected assets; public callers must never inherit that bypass.
- **§2:** membership repair, set restoration, intent consumption, and ordering updates commit transactionally.
- **§0.4, §13.3:** failed corrections survive restart with localStorage unavailable when IndexedDB `kv` remains writable.
- Finish refuses unresolved writes/deletions; Retry cannot overwrite a newer successful correction.
- **§9.1–9.2:** backup/restore preserves pending operation identities, values, and ordering; older backups remain readable.
- **§13.1:** preserve Delete/Undo and the existing Restore/Keep deleted and Try again/Finish without it choices.
- **§13.3–13.4:** keyboard/assistive selection reaches every selectable drawn muscle, including unlit regions.
- Verify portrait WebKit on SE **375×667** and 17 Pro Max **440×956**, 130% text, no overflow or unexpected console errors.
- PLAN requires failing reproductions first, shared-layer fixes, no schema rewrite, and the checkpoint grouped with **2.2e**.

**2) Files to create/change**

- Create `data/catalog-demo-audit.json`: catalog-ID eligibility with `exact | variant | none`, reason, and audit provenance.
- Seed positive eligibility from the kept entries in `reports/audit-2.5.md`; rejected or unaudited IDs default to `none`.
- Keep this separate from `data/exercise-map.json`: `validateExerciseMap()` requires `none.catalogId === null`, losing rejected-asset identity.
- Change [src/lib/catalog.ts](/Users/rabah/projects/anygym/src/lib/catalog.ts): add pure eligibility validation; reject unknown IDs and incomplete entries.
- Change [src/data/exerciseInfo.ts](/Users/rabah/projects/anygym/src/data/exerciseInfo.ts): remove `infoForCatalog()`’s unconditional synthetic exact match.
- Gate public `infoForCatalog()` and `infoForPlan()` demos through the same eligibility lookup.
- Add an explicitly named owner-preview lookup here; use it only from Review to inspect rejected/unreviewed photos.
- Change [src/lib/exerciseInfo.ts](/Users/rabah/projects/anygym/src/lib/exerciseInfo.ts): separate photo eligibility from independently valid catalog muscles/cues.
- Its current `exerciseInfo()` none branch suppresses all catalog information; do not accidentally erase valid muscle-browser content.
- [src/data/muscleExercises.ts](/Users/rabah/projects/anygym/src/data/muscleExercises.ts): keep `exercisesForMuscle()` deriving `thumb` from gated `infoForCatalog().demo`.
- [src/components/muscles/MuscleExercises.tsx](/Users/rabah/projects/anygym/src/components/muscles/MuscleExercises.tsx): retain the same gated lookup for nested sheets.
- Change [scripts/build-catalog.ts](/Users/rabah/projects/anygym/scripts/build-catalog.ts): validate audit coverage during regeneration; rebuilding must preserve rejections.
- Create `src/db/review.ts`: proposed `readReview()` and `saveReviewDecision()` helpers, with injectable `AnyGymDB`.
- `saveReviewDecision()` must read, merge one verdict using `decide()`, and write `REVIEW_KEY` inside one `rw` transaction.
- Change [src/screens/review/ReviewScreen.tsx](/Users/rabah/projects/anygym/src/screens/review/ReviewScreen.tsx): replace swallowed read errors and optimistic whole-state `save()`.
- Reuse [src/hooks/useLive.ts](/Users/rabah/projects/anygym/src/hooks/useLive.ts), which already retains last-good data and exposes error/retry.
- Block verdict writes until a successful read; retain displayed decisions on failure; advance only after save commits.
- Keep export/progress based on the last committed state; retain the note and current exercise after a failed save.
- Change [src/db/workouts.ts](/Users/rabah/projects/anygym/src/db/workouts.ts): expand `removeExercise()`’s transaction to include `tombstones`, `journal`, and relevant `kv` intents.
- Refuse removal while that exercise has unresolved deletes, pending logs, or pending corrections, including held corrections.
- Make `restoreSet()` repair missing `session.exerciseIds` membership atomically before consuming the tombstone.
- Apply the same membership invariant to `finishWorkout()`’s inline accepted-Undo restoration.
- Ensure its final `{ ...s, endedAt }` write preserves repaired membership rather than overwriting it with the earlier session snapshot.
- Change [src/db/tombstones.ts](/Users/rabah/projects/anygym/src/db/tombstones.ts): make `cancelUndo()` and `expireDelete()` require exact deletion identity.
- Remove the missing-token wildcard; cancellation of an already-restored set must match `restoredKey()` evidence.
- Change [src/screens/workout/sessionRecovery.ts](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts): normalize legacy deletion identities before hydrating managers.
- Change [src/db/undoIntents.ts](/Users/rabah/projects/anygym/src/db/undoIntents.ts): transfer only matching tokenless intents during normalization, transactionally.
- Create `src/db/sessionWrites.ts`: shared per-database/session coordination for mutation admission, fallback handoff, Retry/discard, and Finish.
- Acquire browser-wide coordination before opening Dexie transactions; a module-local Promise queue cannot coordinate tabs.
- Without Web Locks, require a durable transactional admission/fence path; coordination failure must not silently permit Finish.
- Change [src/db/mutations.ts](/Users/rabah/projects/anygym/src/db/mutations.ts): update `saveMutation()`, `journal()`, `apply()`, `pendingMutations()`, `retryMutations()`, and `dropMutations()`.
- Register stable operation identity/order before application; Retry retains that identity instead of calling `saveMutation()` as a new user correction.
- On journal failure, attempt `db.kv.bulkPut(heldRows([held]))` before returning failure; retain memory/localStorage copies as additional fallbacks.
- Commit applied/superseded identity receipts with the set change; cleanup failure must not make an obsolete copy replayable.
- Change [src/db/mutationFallback.ts](/Users/rabah/projects/anygym/src/db/mutationFallback.ts): validate new metadata and make held IDs unique across tabs.
- Change `finishWorkout()`/`hasHeldChange()` to use that shared coordination and the same identity-based pending predicate.
- Create `src/db/draftRows.ts`: transactional changed-row persistence using stable `Draft.id`, slot association, revision, and deletion markers.
- Change [src/lib/drafts.ts](/Users/rabah/projects/anygym/src/lib/drafts.ts): preserve immediate memory updates, but persist only changed rows from `saveDraft()`, `writeDrafts()`, and clears.
- Merge committed rows into other tabs and expose an awaitable persistence flush for submission, Finish, and export.
- Change [src/lib/durable.ts](/Users/rabah/projects/anygym/src/lib/durable.ts) and [src/main.tsx](/Users/rabah/projects/anygym/src/main.tsx): hydrate row records and prevent stale whole-blob mirrors replacing them.
- Change [src/screens/workout/rowLog.ts](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts): replace `submitRow()`’s stale `draftsMirrorRow()` overwrite with transactional row merging.
- Change [src/db/backup.ts](/Users/rabah/projects/anygym/src/db/backup.ts): export authoritative drafts; restore new rows/held metadata within the existing restore transaction.
- Change [src/lib/backup.ts](/Users/rabah/projects/anygym/src/lib/backup.ts): extend `isHeld()`/`heldOk()` validation while accepting legacy formats.
- Create `src/components/muscles/MusclePicker.tsx`: one labelled native selector shared by both map variants.
- Change [src/components/muscles/MuscleMap.tsx](/Users/rabah/projects/anygym/src/components/muscles/MuscleMap.tsx): use it in `Drawing()` and interactive `MusclePair()`.
- Generate options from `regionsIn(body, view)` for one body, or the front/back union for the pair; use `pickLine()` and the same selection handler.
- Change [src/components/muscles/MuscleMap.module.css](/Users/rabah/projects/anygym/src/components/muscles/MuscleMap.module.css): share existing focus-reveal styling without changing workout layout.

**3) Data model / Dexie migration**

- Keep [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) at **schema version 9**; existing `kv`, `journal`, and `tombstones` stores suffice.
- Add optional operation identity/order fields to `JournalEntry` in [src/db/types.ts](/Users/rabah/projects/anygym/src/db/types.ts); preserve existing journal IDs.
- Distinguish transactionally allocated operation order from `at`, which becomes diagnostic metadata.
- Store applied/superseded receipts under the existing mutation namespace or a new explicit `kv` prefix.
- Preserve receipts **and allocation continuity** across Finish→Undo; current Finish deletes `MUTATION_REV_PREFIX` counters.
- Store held corrections under existing `MUTATION_HELD_PREFIX`; successful apply/discard consumes exactly the covered identities.
- Store draft rows under a new `kv` prefix keyed by session and stable draft ID; keep slot keys as positions, not identities.
- Import legacy `anygym-drafts` once transactionally, recording completion so stale blobs cannot resurrect cleared rows.
- Tokenize legacy tombstones lazily under a transaction; move matching legacy intent/restoration evidence consistently.
- Keep `review:v1` and `anygym-backup-v1`; extend validation compatibly rather than rewriting stored sessions or sets.

**4) Tricky edge cases**

- Equal **and reversed** clocks: successful 19 reps must supersede older failed 17; later failed 19 must remain pending after successful 17.
- UUIDs establish identity, not order; allocate order transactionally and record explicit supersession.
- Legacy entries with unknowable ordering must remain unresolved rather than gain precedence from a fresh Retry timestamp.
- Place a deterministic barrier after Finish’s fallback read: another tab’s admitted failed edit must still block completion.
- If Finish wins admission first, reject the later save explicitly; never accept it and subsequently consume it without applying.
- Avoid recursive lock acquisition when Retry invokes application helpers; provide internal already-coordinated functions.
- Undo membership repair must preserve other exercises and order; append deterministically when legacy data lacks original-position evidence.
- A failed repair leaves tombstone/intent intact and Finish blocked; never consume recovery evidence before membership is safe.
- Draft compaction moves slots while preserving IDs; deletion markers prevent another tab resurrecting a logged/removed draft.
- Review read rejection is not “no stored review”; a failed transactional read must never lead to writing `emptyReview()`.
- Selectable regions exclude resting art with `region: null`; include unlit muscles and deduplicate front/back regions.

**5) Tests to write**

- Create `src/data/__tests__/catalog-demo-2.0j.test.ts`: iterate every catalog ID; demo/thumbnail eligibility matches audit data.
- Assert explicit rejected IDs, unknown IDs, unaudited IDs, accepted photos, and plan variant notes; owner preview is separate.
- Create `src/db/__tests__/review-2.0j.test.ts`: seeded decisions survive rejected reads/writes byte-for-byte.
- Assert two connections saving different verdicts retain both; failed save does not produce a committed decision.
- Create `src/db/__tests__/carryover-2.0j.test.ts`, following the two-connection fixture in `carryover-2.0i.test.ts`.
- Legacy cancellation/expiry: stale tokenless actions leave a newer tombstone, its values, and its intent untouched.
- Matching cancellation still deletes only its own recovery/restored copy.
- Orphan reproduction: failed Undo followed by removal is refused; legacy missing membership is repaired on recovery and Finish.
- Finish race: inject the correction at the old snapshot boundary; assert no ended session or advanced plan with an admitted unresolved edit.
- Test reverse admission order: post-Finish saves reject without altering sets or manufacturing retryable accepted work.
- Parameterize equal/backward timestamps and failed cleanup; assert Retry never changes successful 19 back to obsolete 17.
- Test edit/type independence, repeated Retry idempotency, explicit discard IDs, and Finish→Undo receipt retention.
- Journal failure plus refusing localStorage: reopen a fresh DB/module context and recover identical values from `kv`.
- Assert fallback `kv` failure remains visibly unsaved; successful Retry/discard clears precisely the matching held operation.
- Create `src/lib/__tests__/drafts-2.0j.test.ts`: hydrated tabs, refusing localStorage, edits to different rows preserve both.
- Cover same-row ordering, clearing versus stale edits, slot compaction, `submitRow()`, and restart reconstruction.
- Extend `backup-held-2.0h.test.ts`: separate database/storage restore retains identities and retries once; legacy backups still parse.
- Extend `src/components/muscles/__tests__/MuscleMap.test.tsx`: selector options equal selectable drawn regions for both bodies/views.
- Assert unlit options exist, resting regions do not, and text-only/null maps remain honest.
- Create `tests/carryover-2.0j.spec.ts`, importing `test`/`expect` from `./fixtures`.
- Review fault injection: seed decisions, fail Review’s read only, assert error/disabled verdicts, retry, save, reload, export all decisions.
- Two pages in one browser context: exercise Finish/fallback and draft races; assert persisted data, not just visible row counts.
- Use `tests/helpers/idb.ts` barriers or narrowly scoped new seams; avoid timing sleeps as race synchronization.
- Extend `tests/muscles-2.2c.spec.ts`: select unlit Forearms without SVG taps, open its empty list, return with workout unchanged.
- Select Abs, verify rejected Plank has neither thumbnail nor demo; verify a kept exercise still opens its photos.
- Extend `tests/review-2.4.spec.ts`: exercise the shared accessible picker and confirm owner-preview labeling.
- Add a persistent-profile termination test using `launchPersistent()`, `killHard()`, and `relaunchOffline()` from `tests/helpers/kill.ts`.
- Fail journaling and localStorage, verify held `kv` commit, kill, relaunch offline, then assert Finish blocks and Retry saves once.
- Run new UI cases on both requested WebKit projects; capture screenshots, check 130% text, focus, safe areas, and horizontal overflow.
- Builder validation: `npm run typecheck`, `npm test`, then targeted Playwright with `--project="iPhone SE" --project="iPhone 17 Pro Max"`.

**6) Risks and conflicts with existing code**

- Existing 2.0f/2.0i tests cover earlier variants; retain them because opposite equal-timestamp orderings require opposite outcomes.
- `heldOk()` currently requires timestamp-encoded `mem:` IDs and timestamp ordering; identity changes must update export and parser together.
- `kv` is excluded from backup tables: new recovery metadata must travel through explicit backup fields/adapters.
- Whole-draft writes also occur in Log submission, restore, Finish cleanup, and Finish→Undo; changing `saveDraft()` alone is insufficient.
- Existing `useLive()` already supplies last-good read behavior; reuse it instead of adding a second Review loading-state mechanism.
- Preserve 2.2d row deletion/Undo and 2.0g stay-on-exercise behavior; keep persistence changes below those screen interactions.
- Photo rejection must not remove verified muscle-list entries or turn owner approval into automatic public eligibility.
- Total failure of all durable stores cannot guarantee termination survival; keep explicit unsaved state and never report persistence success.
- The working tree already contains changed screenshots and deleted temporary 2.2d tests; leave unrelated changes untouched.
- Record reproduction/validation evidence with the session report; 2.0j’s checkpoint remains grouped with 2.2e.