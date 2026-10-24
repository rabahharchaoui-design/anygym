Found **4 issues** in completed features. No files edited. Earlier fixed findings and the unfinished set-table redesign are excluded. These are new findings; none repeats an unresolved earlier report.

1. **MAJOR — Editing an older machine set can display and save different weights.**  
   [PlateMachineInput.tsx:29](/Users/rabah/projects/anygym/src/components/load/PlateMachineInput.tsx:29), [EditSetSheet.tsx:41](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:41)  
   Log 45 lb per side with starting resistance 0: **90 lb**. Change the machine’s starting resistance to 50 through another set, then reopen the original. Its diagram shows **140 lb**, but saving a reps-only edit preserves **90 lb**. Adding and removing a plate silently changes that historical load to 140 lb.  
   **Exact fix:** Initialize machine edits from the set’s stored `barWeight`, as barbell edits already do. Keep starting resistance local to the edit and use one canonical load for the diagram and Save.

2. **MAJOR — Saved sets lose Smith-machine identity, contaminating free-weight history.**  
   [types.ts:159](/Users/rabah/projects/anygym/src/db/types.ts:159), [history.ts:30](/Users/rabah/projects/anygym/src/db/history.ts:30)  
   Choosing Smith for a bench exercise saves only `kind: 'barbell'` and its weight breakdown. Switching back to Olympic allows those Smith sets into free-weight “Last time” and progression—even across gyms. Conversely, selecting Smith can include Olympic sets from that gym. **Reproduced with the actual database modules.**  
   **Exact fix:** Save equipment identity on each load, including `barId`. Filter historical sets by their saved identity; apply gym isolation to saved Smith sets. Treat ambiguous legacy records explicitly rather than inferring equipment from weight.

3. **MINOR — Recent warmups can hide genuine working-set history.**  
   [history.ts:35](/Users/rabah/projects/anygym/src/db/history.ts:35)  
   The query takes six sessions before progression removes warmups and other load kinds. Six recent warmup-only appearances therefore hide an older working session, producing “First time” and removing its weight target. **Reproduced.**  
   **Exact fix:** Filter sets for the requested load kind and `kind === 'work'` before selecting and limiting qualifying sessions.

4. **MINOR — Stack inputs cannot record weights above an arbitrary ceiling.**  
   [StackSelector.tsx:39](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:39), [exerciseLoad.ts:99](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:99)  
   The picker stops at **300 lb / 140 kg**. Prefill also rejects higher pins, so someone using a heavier stack cannot record the actual weight. This is source-confirmed; hardware prevalence was not assessed.  
   **Exact fix:** Support a confirmed per-machine maximum or extendable pin range. Use the same range for selection, prefill, validation, and progression; keep the default display ceiling separate from load validity.

Read-only probes passed **5,280 bar/plate/collar combinations** across lb and kg, plus solver round trips and single-weight, dumbbell-pair, and machine examples. UI sequences were source-traced; no physical iPhone testing was performed.