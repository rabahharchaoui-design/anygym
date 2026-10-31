**6 findings in completed `[x]` features.** No files edited. Typecheck passed. In-memory probes confirmed the data/helper failures; browser races and physical iPhone behavior remain unverified. Fixed earlier findings are excluded.

1. **MAJOR — STILL OPEN: Stale “Keep deleted” destroys a newer deletion’s recovery record.**  
   [tombstones.ts:122](/Users/rabah/projects/anygym/src/db/tombstones.ts:122), [sessionRecovery.ts:77](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:77)  
   Leave failed Undo unresolved in one tab. Elsewhere, restore, edit, and delete that set again. The older cancellation unconditionally removes the newer tombstone; it can also delete an already-restored newer set. **The newer recovery record’s loss was reproduced.** Restoration and expiry now check tokens, but cancellation still does not.  
   **Exact fix:** Pass the expected deletion token into cancellation and verify it transactionally before changing sets, tombstones, or intents. Retain restoration-generation evidence so cancellation can remove only the matching restored copy.

2. **MAJOR — Suggested loads and bar changes bypass sleeve capacity.**  
   [load.ts:643](/Users/rabah/projects/anygym/src/lib/load.ts:643), [exerciseLoad.ts:134](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:134)  
   Manual plate additions respect the selected bar’s sleeve, but progression and confirmation do not. **Reproduced:** a women’s bar accepts **315 kg**, using six 25 kg plates per side—**384 mm of plates on a 320 mm sleeve**. The app offers an impossible loading as valid, violating §0.  
   **Exact fix:** Carry the selected sleeve length through `LoadSetup` into every solver call. Validate capacity during prefill, confirmation, and bar changes; reject an existing stack that cannot fit the newly selected bar.

3. **MAJOR — Restore accepts state that crashes or freezes the restored app.**  
   [backup.ts:204](/Users/rabah/projects/anygym/src/lib/backup.ts:204), [backup.ts:336](/Users/rabah/projects/anygym/src/lib/backup.ts:336)  
   Both `nextDayIndex: -1` and one billion added sets pass parsing. After Replace commits, the negative day makes [DayCard.tsx:32](/Users/rabah/projects/anygym/src/screens/today/DayCard.tsx:32) dereference an absent day; the added-set count drives an enormous pending-row loop. **Parser acceptance reproduced; the billion-row loop was not executed.**  
   **Exact fix:** Validate integer plan positions against the referenced plan and bound extra-set counts and draft-slot indexes before restoration. Add defensive bounds in rendering consumers.

4. **MAJOR — One transient startup failure prevents further workout starts until reload.**  
   [bootstrap.ts:35](/Users/rabah/projects/anygym/src/db/bootstrap.ts:35)  
   `startDb()` permanently caches its rejected promise. Even after storage recovers, Quick workout and plan Start keep receiving the original failure. **Reproduced:** direct initialization succeeded afterward, while `startDb()` continued rejecting.  
   **Exact fix:** Clear the cached initialization promise when it rejects, provided it is still that attempt. Expose a retry path from `useActiveGym()` that reruns initialization and its subscription.

5. **MAJOR — STILL OPEN: Default acceptance testing omits four required devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)  
   Standard `npm run test:ui` restricts Android and the 320 floor to `@matrix`, excluding recovery and interaction coverage required by §§13.3–13.4. **This is a confirmed verification gap, not an observed device defect.**  
   **Exact fix:** Make full-matrix acceptance testing the default and enforce it in CI. Keep the checkpoint subset under a separately named command.

6. **MINOR — Landscape protection sits behind open pickers.**  
   [App.tsx:47](/Users/rabah/projects/anygym/src/App.tsx:47), [Sheet.module.css:159](/Users/rabah/projects/anygym/src/ui/Sheet.module.css:159)  
   With a sheet open, `#root` becomes a transformed stacking context. The landscape guard remains inside it, below sheets portaled to `body`; it is also inert with the background. Rotating can therefore leave the picker covering the required upright-phone screen. **Source-traced; needs iPhone confirmation.**  
   **Exact fix:** Portal the guard outside the transformed root, above sheet portals, and manage focus/inert state while it is visible.