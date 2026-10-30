**7 findings in completed `[x]` features.** No files changed. Typecheck passed. Persistence failures below were reproduced with in-memory probes; browser interaction races remain source-traced.

1. **MAJOR — STILL OPEN: Failed Undo can permanently lose its set.**  
   [tombstones.ts:59](/Users/rabah/projects/anygym/src/db/tombstones.ts:59)  
   If Undo acceptance and both intent-storage fallbacks fail, restarting after five seconds deletes the remaining tombstone. Reproduced: neither the set nor its recovery record survived. Violates §13.3.  
   **Exact fix:** Finalize ordinary deletions explicitly while running. On startup, retain unfinalized tombstones, offer Restore/Keep deleted, and block Finish until resolved; elapsed time alone must not destroy them.

2. **MAJOR — Overlapping edits can erase the newer failed edit’s journal.**  
   [mutations.ts:37](/Users/rabah/projects/anygym/src/db/mutations.ts:37), [mutations.ts:49](/Users/rabah/projects/anygym/src/db/mutations.ts:49)  
   Concurrent saves share one journal ID. The older save can delete the newer intent before the newer write fails. Reproduced with edits to 17 and 19 reps: 17 persisted, 19 failed, and no pending mutation remained to block Finish. Two tabs can produce this overlap; browser timing was not verified.  
   **Exact fix:** Give each intent a unique operation token. Inside `apply()`’s transaction, apply and remove only the matching token; skip superseded operations and retain the newest failed intent.

3. **MAJOR — A stale editor can delete a set after Finish.**  
   [workouts.ts:252](/Users/rabah/projects/anygym/src/db/workouts.ts:252)  
   `deleteSet()` never checks whether its workout ended. A deletion queued from another tab can run after Finish, changing saved totals and leaving plan progress inconsistent. Reproduced: an ended workout lost its only set.  
   **Exact fix:** Include `db.sessions` in the delete transaction and throw `WorkoutFinishedError` when the parent session is missing or ended, before deleting anything.

4. **MAJOR — STILL OPEN, backup fallback: Hydrated drafts can be omitted.**  
   [drafts.ts:300](/Users/rabah/projects/anygym/src/lib/drafts.ts:300)  
   When localStorage is unavailable, startup hydrates drafts into `hydrated`, but export reads only storage and the active memory cache. Backing up before reopening an exercise silently omits pending weights, reps and holds. Reproduced: a readable 17-rep draft exported as `{}`.  
   **Exact fix:** Read and validate `hydrated.get(NO_STORAGE)` when storage is absent, then overlay the memory cache. Verify export immediately after hydration, without visiting the workout.

5. **MAJOR — STILL OPEN, reps editor: A delayed Log redirects edits to another row.**  
   [ExerciseView.tsx:406](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:406)  
   Weight and type editors now use stable identities, but the reps stepper still stores a displayed index. Start logging row 3, open row 2’s stepper, then let logging finish: the stepper attaches to the former row 1. Subsequent taps change the wrong set. Row movement reproduced; browser sequence unverified. Violates §20.2.  
   **Exact fix:** Store the edited draft ID using `idOf()`, resolve its current row on every render/change, and close the editor if that draft was committed.

6. **MAJOR — STILL OPEN: Default tests omit acceptance coverage on four devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)  
   Standard `npm run test:ui` restricts Android and the 320 floor to `@matrix`; kill and monkey tests are excluded. Recovery and interaction regressions can therefore ship undetected. This is a confirmed coverage gap, not a reproduced device defect. Violates §§13.3–13.4.  
   **Exact fix:** Remove the default filter and platform skips from applicable functional tests. Keep a separately named checkpoint subset and enforce equal acceptance-test discovery across projects.

7. **MINOR — Failed Edit saves report errors outside the accessible dialog.**  
   [WorkoutScreen.tsx:329](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:329), [sheetStack.ts:23](/Users/rabah/projects/anygym/src/ui/sheetStack.ts:23)  
   Failed Save leaves Edit open but sends its error to the underlying workout toast. That content is inert while the modal is open, so VoiceOver cannot announce it; visually, it sits behind the sheet. Users receive no accessible explanation that saving failed.  
   **Exact fix:** Return failure status to `EditBody` and render an inline live error beside Save inside the dialog, preserving values and allowing retry.