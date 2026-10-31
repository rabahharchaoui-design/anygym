**9 MAJOR findings in completed `[x]` features: eight STILL OPEN and one new restore defect.** No files edited. Fixed earlier findings are excluded.

Typecheck, 10,560 weight-sum cases and 14 solver round trips passed. The failures below were reproduced with synthetic data and in-memory IndexedDB; physical iPhone behavior and browser race timing remain unverified.

1. **MAJOR — STILL OPEN: Finish can destroy an unknown legacy deletion.**  
   [workouts.ts:415](/Users/rabah/projects/anygym/src/db/workouts.ts:415)

   An unknown tokenless tombstone passes ownership checking because both `owned.get(id)` and `t.token` are `undefined`. Finish deletes its recovery copy. **Reproduced: the last-set case removed the set, tombstone and workout.**

   **Exact fix:** Require `owned.has(t.id)` before comparing tokens. Assign explicit identities to legacy deletions; missing ownership must block Finish.

2. **MAJOR — STILL OPEN: Finish overlooks another tab’s failed weight correction.**  
   [WorkoutScreen.tsx:452](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:452), [workouts.ts:406](/Users/rabah/projects/anygym/src/db/workouts.ts:406)

   After tab A checks pending changes, tab B’s correction fails journaling and enters fallback storage. Finish rechecks only database journals. **Reproduced: Finish retained 135 lb despite a pending 155 lb correction; Retry afterward discarded the correction because the workout had ended.**

   **Exact fix:** Serialize mutation registration, fallback handoff and Finish across tabs. While holding that shared lock, recheck fallback intents before committing Finish and refuse unresolved corrections.

3. **MAJOR — NEW: Restored weight corrections disappear after restart when localStorage rejects them.**  
   [backup.ts:121](/Users/rabah/projects/anygym/src/db/backup.ts:121), [mutations.ts:155](/Users/rabah/projects/anygym/src/db/mutations.ts:155)

   The backup now includes fallback corrections, fixing the earlier export omission. Restoration installs them only in memory/localStorage, after the database transaction commits. **Reproduced: Restore succeeded with a pending 155 lb correction; a fresh runtime recovered 135 lb with no pending correction**, despite working IndexedDB.

   **Exact fix:** Persist restored correction intents in IndexedDB inside the Replace/Merge transaction. Abort restoration if that persistence fails; hydrate runtime state from the committed intents.

4. **MAJOR — STILL OPEN: Finish → Undo allows an obsolete correction to overwrite a successful save.**  
   [workouts.ts:431](/Users/rabah/projects/anygym/src/db/workouts.ts:431), [mutations.ts:133](/Users/rabah/projects/anygym/src/db/mutations.ts:133)

   A stale fallback survives cleanup failure but is correctly suppressed by a database marker. Finish deletes that marker. Reopening exposes the obsolete correction again. **Reproduced: Retry changed successfully saved 175 lb × 19 back to 155 lb × 17.**

   **Exact fix:** Retain applied/superseded-operation markers across Finish and reopening. Remove them only when the session is permanently deleted.

5. **MAJOR — STILL OPEN: Equal timestamps hide a newer failed weight correction.**  
   [mutations.ts:56](/Users/rabah/projects/anygym/src/db/mutations.ts:56), [mutations.ts:133](/Users/rabah/projects/anygym/src/db/mutations.ts:133)

   Operation times increase only within one database object. Two tabs can assign the same timestamp; an older successful save’s marker then suppresses the newer fallback. **Reproduced: fallback contained the newer 155 lb × 19 correction, but pending changes returned zero and the older save remained.**

   **Exact fix:** Give operations identities and ordering coordinated across tabs. Suppress explicitly applied or superseded operations; timestamp equality alone must never establish supersession.

6. **MAJOR — STILL OPEN: Editing another row overwrites newer pending weights from another tab.**  
   [drafts.ts:180](/Users/rabah/projects/anygym/src/lib/drafts.ts:180), [drafts.ts:203](/Users/rabah/projects/anygym/src/lib/drafts.ts:203)

   Two tabs independently produce the same row revision. The merge ignores different contents when ID and revision match, then writes the stale collection back. **Reproduced: tab B saved a pending 73 lb weight; tab A edited another row and replaced it with 63 lb.** Restart recovers the wrong weight.

   **Exact fix:** Persist row changes individually with transactionally allocated revisions. Merge only changed rows; clean cached rows must adopt authoritative stored contents even when revisions match.

7. **MAJOR — STILL OPEN: Backup restores an intentionally deleted lift by ignoring deletion identity.**  
   [backup.ts:45](/Users/rabah/projects/anygym/src/db/backup.ts:45)

   Export matches Undo intents by set ID alone. An obsolete intent belonging to an earlier deletion marks the newer tombstone `undo: true`. **Reproduced: ordinary token checking rejected the intent, while export accepted it.** Restoring that backup resurrects the unwanted lift and inflates totals.

   **Exact fix:** Match each tombstone using `hasUndoIntent(..., t.token)`. Read database tombstones and intents in the same snapshot transaction and preserve deletion identities.

8. **MAJOR — STILL OPEN: A legacy Undo intent can resurrect a later intentional deletion.**  
   [undoIntents.ts:24](/Users/rabah/projects/anygym/src/db/undoIntents.ts:24)

   Missing tokens remain wildcards. A tokenless intent from an older version therefore authorizes restoration of a newer deletion after the set was restored, corrected and deleted again. **Finish’s unintended restoration was reproduced.**

   **Exact fix:** Require exact deletion identity. Migrate tokenless intents only together with their corresponding tokenless tombstones; unmatched legacy intents must never authorize newer deletions.

9. **MAJOR — STILL OPEN: A stale Delete offers Undo for another tab’s deletion.**  
   [sessionRecovery.ts:62](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:62), [deleteUndo.ts:115](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:115)

   Delete from a stale editor finds no saved set, but its provisional Undo record remains without an owned token. Undo then accepts the other tab’s tombstone. **Reproduced: a deliberately deleted 155 lb lift returned**, changing saved sets and total lifted.

   **Exact fix:** Return an explicit no-op result when nothing was deleted, remove the provisional Undo record and withdraw its action. Require an owned deletion identity before restoration.