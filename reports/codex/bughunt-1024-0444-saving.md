Found **7 issues** in the built logging flow. No files edited. Reviewed earlier reports first; fixed findings and deferred features are excluded. Four defects were reproduced using the actual modules with in-memory IndexedDB. UI race sequences below are source-traced, without physical iPhone testing.

1. **MAJOR — Finish and Undo can create an inaccessible orphan set.**  
   [WorkoutScreen.tsx:270](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:270), [workouts.ts:142](/Users/rabah/projects/anygym/src/db/workouts.ts:142)  
   Delete the only set, tap Finish, then Undo while Finish is pending. `settle()` only snapshots existing writes; subsequent Undo remains allowed. Finish deletes the empty session, then Undo restores its set without checking the parent. **Reproduced:** session absent, restored set present, workout inaccessible. With other sets, Undo can change an already-finished workout after its count was calculated.  
   **Exact fix:** Lock new workout mutations synchronously when Finish starts, drain all session writes, then finish. Make restoration transactionally verify that its parent session exists and is active.

2. **MAJOR — Failed Undo permanently consumes its recovery record.**  
   [deleteUndo.ts:51](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:51), [WorkoutScreen.tsx:252](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:252)  
   Undo removes the backup **before** its IndexedDB restore succeeds. On failure, the toast says “Try again” but provides no retry action; calling Undo again returns `undefined`. **Reproduced:** the set stays deleted and Finish subsequently succeeds. Killing the app during the restore also loses the memory-only recovery record.  
   **Exact fix:** Persist the deleted record alongside the deletion in one transaction. Consume that record only after successful restoration or intentional expiry. Preserve it after failure and provide a working retry action.

3. **MAJOR — Switching cards during a pending Log can silently discard the next set.**  
   [SetCard.tsx:105](/Users/rabah/projects/anygym/src/screens/workout/SetCard.tsx:105), [SetCard.tsx:123](/Users/rabah/projects/anygym/src/screens/workout/SetCard.tsx:123), [workouts.ts:88](/Users/rabah/projects/anygym/src/db/workouts.ts:88)  
   With a slow write: change an input, Log, switch exercises, then return before the write commits. The remounted card restores the same draft ID with a fresh `busy` flag. When the original write succeeds, only the unmounted instance rotates its ID. The visible card’s next Log reuses the committed ID; `logSet()` returns the old set unchanged and the UI treats that as success. The second set is missing, potentially with different reps or weight. **Source-traced; delayed-write UI reproduction remains to be run.**  
   **Exact fix:** Own pending logs and draft IDs outside mounted cards, keyed by session/exercise. Block another submission until settlement and publish the replacement draft ID to every mounted consumer.

4. **MAJOR — Save → Delete → Undo restores outdated values.**  
   [EditSetSheet.tsx:48](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:48), [EditSetSheet.tsx:75](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:75), [WorkoutScreen.tsx:257](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:257)  
   Delete remains enabled while Save runs. The update can commit first, but deletion retains the sheet’s original snapshot for Undo. **Reproduced:** save 12 reps over an original 10, delete, undo; the restored record has 10 reps.  
   **Exact fix:** Serialize Save and Delete and disable conflicting controls while either runs. Build the Undo record from the record actually returned by the transactional `deleteSet()`, rather than the stale UI object.

5. **MAJOR — Deleting the newest set allows duplicate order values.**  
   [workouts.ts:92](/Users/rabah/projects/anygym/src/db/workouts.ts:92), [workouts.ts:142](/Users/rabah/projects/anygym/src/db/workouts.ts:142)  
   Delete the highest-order set, log another, then Undo. Logging reuses the deleted order; restoration keeps that same order. **Reproduced:** both sets had order `1`, and primary-key ordering placed the newer set before the older one. Set numbers, repeat prefills, and per-set progression can therefore use the wrong sequence.  
   **Exact fix:** Allocate orders from a monotonic session counter updated transactionally with each log. Never reuse an allocated order after deletion.

6. **MAJOR — STILL OPEN, partially fixed: ordinary barbell exercises still assume the Olympic bar.**  
   [loadTypeRule.ts:62](/Users/rabah/projects/anygym/src/lib/loadTypeRule.ts:62), [SetLoadInput.tsx:99](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:99)  
   EZ, trap and Smith detection is fixed. However, squat/bench exercises still force 45 lb / 20 kg with no bar selector or change control. Using the supported women’s bar saves totals 10 lb / 5 kg too high.  
   **Exact fix:** Persist an explicit bar choice per exercise/gym, offer Olympic and women’s bars in the workout, and use that choice consistently for diagram, prefill and save.

7. **MAJOR — STILL OPEN under storage failure: switching cards loses drafts.**  
   [drafts.ts:57](/Users/rabah/projects/anygym/src/lib/drafts.ts:57), [SetCard.tsx:121](/Users/rabah/projects/anygym/src/screens/workout/SetCard.tsx:121)  
   Normal draft persistence is fixed. When localStorage is full or blocked, writes silently fail and the only remaining copy belongs to the mounted card. Switching exercises destroys pending weight, reps and stopwatch state. **Reproduced:** a failed storage write followed by draft reload returns `null`; there is no shared memory fallback.  
   **Exact fix:** Maintain a session-level memory cache independently of storage, propagate persistence failures, and show that reload recovery is unavailable. Use a durable fallback where available.

The earlier stale-hold capture, invalid stack selection, active-load recalculation and manual-update activity-check defects are fixed in the inspected source. Database transactions also protect against partial Log/Edit/Finish writes; the remaining failures above occur around those transactions and their UI coordination.