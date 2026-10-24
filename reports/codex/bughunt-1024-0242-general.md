Read-only review of completed `[x]` items. No files changed. The earlier warmup-set and missing-finisher findings are fixed and excluded. SPEC §20’s deferred set-table redesign is excluded. Findings below come from source tracing; iPhone layout observations need device confirmation. Read-only runtime probes reproduced both deletion-queue defects.

1. **MAJOR — NEW: Diagram and saved weight diverge after editing starting resistance.**  
   [SetCard.tsx:100](/Users/rabah/projects/anygym/src/screens/workout/SetCard.tsx:100), [PlateMachineInput.tsx:38](/Users/rabah/projects/anygym/src/components/load/PlateMachineInput.tsx:38)  
   Log a machine set, edit it, and change its starting resistance. The active diagram receives the updated gym configuration, but the active card retains its old `load`. For example, changing the start from 0 to 50 lb with 45 lb per side makes the diagram show 140 lb while the next logged set still saves 90 lb. Smith bars have the same risk. Violates SPEC §0.  
   **Exact fix:** Rebuild the active draft through `load.ts` whenever its bar/start configuration changes. Make the diagram and logging action consume that same canonical load.

2. **MAJOR — STILL OPEN: Barbell input assumes an Olympic bar.**  
   [exerciseLoad.ts:22](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:22)  
   Every non-Smith barbell exercise assumes 45 lb / 20 kg. Using a lighter bar saves an incorrect total, with no workout control to correct it.  
   **Exact fix:** Resolve an explicit bar ID, recognize EZ/trap/Smith names, and offer bar selection where ambiguous. Wire unknown bar weights to the existing first-use prompts.

3. **MAJOR — STILL OPEN: Resumed holds save stale durations.**  
   [TimedInput.tsx:55](/Users/rabah/projects/anygym/src/components/load/TimedInput.tsx:55), [SetCard.tsx:117](/Users/rabah/projects/anygym/src/screens/workout/SetCard.tsx:117)  
   Stop at 10 seconds, tap “Start again,” then Log set while running. It saves 10 seconds and resets the live timer.  
   **Exact fix:** Capture the current elapsed duration atomically when logging, or expose running state and disable Log set until stopped.

4. **MAJOR — STILL OPEN: Switching exercises or reloading loses drafts.**  
   [ExerciseCard.tsx:53](/Users/rabah/projects/anygym/src/screens/workout/ExerciseCard.tsx:53), [SetCard.tsx:100](/Users/rabah/projects/anygym/src/screens/workout/SetCard.tsx:100)  
   Switching cards unmounts the pending weight, reps and stopwatch. Returning reconstructs them from saved sets. Reloading loses them too. Plan pairs make switching particularly frequent. Violates SPEC §13.3.  
   **Exact fix:** Persist drafts by session/exercise, including stopwatch timestamps. Restore on mount and clear only after successful logging or explicit reset.

5. **MAJOR — STILL OPEN: Finish ignores deletion failures and outstanding commits.**  
   [undoQueue.ts:23](/Users/rabah/projects/anygym/src/lib/undoQueue.ts:23), [undoQueue.ts:43](/Users/rabah/projects/anygym/src/lib/undoQueue.ts:43)  
   The queue removes a deletion before its write completes and swallows failures. `flush()` can return with a deletion still running or failed, allowing Finish to report success with an unwanted set retained. Both behaviors reproduced in runtime probes.  
   **Exact fix:** Track outstanding commit promises, propagate failures, restore failed deletions visibly with a retry action, and await every commit before finishing.

6. **MAJOR — STILL OPEN: Deleted sets reappear after an app kill.**  
   [WorkoutScreen.tsx:237](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:237), [undoQueue.ts:34](/Users/rabah/projects/anygym/src/lib/undoQueue.ts:34)  
   During the five-second Undo window, deletion exists only in memory. iOS termination can bypass `pagehide`, restoring a supposedly deleted set on reopening.  
   **Exact fix:** Delete transactionally immediately and retain the original record for Undo, or persist deletion tombstones and reconcile them during startup.

7. **MAJOR — STILL OPEN: Changing stack increments leaves an invalid weight loggable.**  
   [StackSelector.tsx:35](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:35), [StackSelector.tsx:128](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:128)  
   Select 15 lb, then change increments from 5 to 10. No pin is selected, but the parent still holds 15 lb and allows logging.  
   **Exact fix:** Validate the current pin after saving an increment change. Clear invalid selections through a nullable `onChange` and disable logging until another pin is chosen.

8. **MAJOR — NEW: Rep-based plan exercises become timed holds.**  
   [WorkoutScreen.tsx:64](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:64), [loadTypeRule.ts:34](/Users/rabah/projects/anygym/src/lib/loadTypeRule.ts:34)  
   Six Week Volume Builder day 3 prescribes three sets of 10 reps for Plank and Spider Plank. Both resolve to a stopwatch, making those reps impossible to record and saving seconds instead. Confirmed by executing the normalization and resolution functions. The intended plain-Plank variant is uncertain.  
   **Exact fix:** Respect explicit plan count units before name inference. Resolve rep-based variants to reviewed rep-capable metadata; where ambiguous, ask once instead of silently converting reps into seconds.

9. **MAJOR — STILL OPEN: Modal sheets lack focus management and accessible dismissal.**  
   [Sheet.tsx:22](/Users/rabah/projects/anygym/src/components/Sheet.tsx:22)  
   Focus remains behind an opened sheet, background controls remain keyboard-accessible, and there is no labelled Close button. Escape also reaches every nested sheet handler. This breaks keyboard and assistive-technology flows.  
   **Exact fix:** Add initial focus, focus trapping/restoration, inert background content, a labelled Close button, and dismissal restricted to the topmost sheet.

10. **MINOR — STILL OPEN: Update ready can reload during an active workout.**  
    [pwaUpdate.ts:23](/Users/rabah/projects/anygym/src/lib/pwaUpdate.ts:23)  
    The manual update action bypasses the activity check. Returning to Today during an unfinished workout permits a reload that loses pending inputs.  
    **Exact fix:** Recheck active workouts and runs immediately before calling the update callback; keep the update pending while either exists.

11. **MINOR — NEW: Added-weight keypad exceeds the active-card height on small phones.**  
    [BodyweightInput.tsx:51](/Users/rabah/projects/anygym/src/components/load/BodyweightInput.tsx:51), [AddedWeightField.tsx:32](/Users/rabah/projects/anygym/src/components/load/AddedWeightField.tsx:32)  
    “Add weight” expands a four-row keypad inline. Combined with the readout, guidance, logged sets and fixed bars, the current set requires scrolling on an SE-sized screen, contrary to SPEC §13.5. This is a source-based layout finding; confirm on-device.  
    **Exact fix:** Put added-weight entry in a scrolling sheet and leave a compact weight summary on the active card.

12. **MINOR — STILL OPEN: iPhone landscape protection is absent.**  
    [App.tsx:25](/Users/rabah/projects/anygym/src/App.tsx:25)  
    There is no orientation guard. Rotating an iPhone leaves the portrait interface in a short viewport, contrary to SPEC §13.4.  
    **Exact fix:** Add the full-screen “Turn your phone upright” overlay for landscape phones while keeping the underlying app mounted.