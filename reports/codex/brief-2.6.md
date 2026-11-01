Codex brief for PLAN item 2.6, written Nov 01 15:41 at commit afb2c1d. SPEC.md wins if they disagree; code may have moved since.

[PLAN.md:70](/Users/rabah/projects/anygym/PLAN.md:70) defines **2.6 as the Session 2 merge gate**. It requires verification, targeted fixes, and release evidence—not another feature.
“Same as 1.10” is a stale reference: item 1.10 loads plans; use `PROMPT.md`’s MERGE GATE procedure and the completed 1.12 gate as precedent.
This brief reflects the current working tree, including uncommitted 2.2c work. No files were edited; no tests were run.

**1) Applicable SPEC sections and acceptance checks**

- **SPEC 0, 2:** preserve saved workouts, exact loads, pending corrections, deletion identities, and recovery state; no personal data in committed evidence.
- **SPEC 1:** production build works under `/anygym/`, HashRouter deep links resolve, app shell works offline, and Pages serves the tested build.
- **SPEC 4.1–4.3:** retain the pinned catalog source, local images, attribution, explicit variant caveats, and honest `none` states.
- Current source SHA is `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`; current counts are **138 catalog exercises; 86 mappings: 37 exact, 8 variant, 41 none**.
- **SPEC 4.4:** demos crossfade correctly; sheets show at most three supported short cues; unsupported Watch out/Good for claims stay absent.
- Workout acceptance: typical three/four-set tables and every ✓ fit before scrolling; muscles and tips remain reachable below.
- **SPEC 4.5:** both body drawings use the same verified muscle mappings; shoulder overrides remain explicit; body preference survives reload.
- **SPEC 5.4–5.6, 6:** plate presentation changes preserve exact saved loads, sleeve limits, unit handling, progression, and history.
- **SPEC 9.1–9.2, 9.4:** backup/recovery regressions pass; Review decisions persist and export with the correct catalog SHA.
- **SPEC 13.1–13.7:** zero unexpected console errors/rejections; named controls, AA contrast, 48 pt targets, safe areas, 130% text, honest empty states.
- **SPEC 20.2, 20.4, 21.1:** preserve logging tap counts, rest behavior, stable row editing, working-set completion, and last-set navigation.
- **SPEC 23.1–23.4:** native navigation/sheets, reduced motion, SE/17 Pro Max videos, Simulator inspection, and feel score **at least 8**.
- Gate completion requires the full seven-device suite, 90-second monkey tests, edge/history/recovery tests, independent UX review, green deploy, and live check.
- Do not treat cloud Chromium runs labelled as iPhones as WebKit evidence or clear existing `SIM CHECK PENDING` notes without performing those checks.

**2) Files to create/change and responsibilities**

- **`reports/session-2.md` — required update:** replace historical summaries with the final shipped behavior, exact tested revision, commands/results, critic scores, Simulator evidence, remaining failures, and five-minute phone checks.
- Copy the audit table from **`reports/audit-2.5.md`** into that report, as PLAN explicitly requires; distinguish historical audit counts from current mapping counts.
- **`PLAN.md` — final status only:** mark 2.6 complete after the gate succeeds; reconcile unfinished 2.2c separately before declaring Session 2 complete.
- **`reports/test-now.md` — release workflow:** append the required single 2.6 line when the builder actually ships.
- **`reports/shots/gate-s2/`, `reports/videos/`, `reports/critic/session-2/` — evidence:** save device-labelled screenshots, recordings, and critic findings tied to the tested revision.
- **`tests/gate-s2.spec.ts` — proposed new integration spec:** cover the Session 2 flows and gaps below; import `test`/`expect` from `./fixtures`.
- **`tests/exercise-screen-2.2b.spec.ts` — extend:** strengthen first-screen checks with real safe-area/occlusion checks and verify them while rest is active.
- Reuse **`tests/helpers/layout.ts`** functions `simulateSafeAreas`, `checkActiveWorkout`, `checkLayout`, and `checkControls`; call the active-workout check before helpers that scroll.
- Reuse **`tests/helpers/contrast.ts::checkContrast`** for demo captions, muscle legends/readouts, Review, and nested sheets.
- **`tests/review-2.4.spec.ts` — extend:** persistence failures, verdict replacement, download fallback, share cancellation, and export after reload.
- **`tests/kill.spec.ts`, `tests/helpers/kill.ts` — extend:** add deterministic write-boundary kills using existing `killHard`, `launchPersistent`, and `relaunchOffline`.
- **`tests/monkey.spec.ts` — extend:** include Review and focused exercise-sheet/viewer interactions; current screen list covers seven older screens.
- **`scripts/build-catalog.ts`, `CATALOG_REPORT.md` — fix reporting:** generator/report still claim WebP precaching; current `vite.config.ts` explicitly excludes exercise photos.
- **`src/components/exercise/FormDemo.tsx` — targeted fix:** `Photo` currently has no image-failure state; handle unavailable photos honestly, without broken-image UI or blocking logging.
- **`src/components/exercise/FormDemo.module.css` — targeted fix:** `.pause` is currently 44×44; meet SPEC 13.3’s stricter 48 pt requirement.
- **`src/screens/review/ReviewScreen.tsx` — targeted persistence hardening:** initial read failures currently become an apparently empty review; `save` advances optimistically before `db.kv.put` completes.
- **`src/screens/review/ReviewScreen.module.css` — conditional layout fixes:** long exercise names, verdict badges, note keyboard, and actions must remain usable on SE.
- **`src/components/exercise/DemoViewer.tsx` — verify/fix `Frame`:** focus containment, restored focus, nested Back behavior, and dismissal during parent closure.
- **`src/components/exercise/ExerciseSheet.tsx` — verify lifecycle:** its local `full` state must not leave a viewer open after the owning sheet closes or changes exercise.
- **`src/screens/workout/ExerciseView.tsx`, `Workout.module.css` — conditional polish:** retain stable draft IDs, reserved hint space, and logging behavior while fixing proven hero/table problems.
- **`src/components/muscles/MuscleMap.tsx` — 2.2c prerequisite:** provide keyboard/VoiceOver muscle selection; `MusclePair` currently relies on clicking an image containing hidden SVG bodies.
- Treat existing 2.2c files as work to review: `MuscleExercises.tsx`, its CSS, `src/data/muscleExercises.ts`, `src/lib/muscleExercises.ts`, and `src/hooks/usePlanCatalogIds.ts`.
- Do not add swaps, onboarding, generated plans, charts, or another catalog browser as part of this gate.

**3) Data model and Dexie migrations**

- **No schema migration is required for 2.6.** `src/db/schema.ts` currently declares `SCHEMA_VERSION = 9`.
- Catalog, exercise mappings, cues, muscle overrides, and body art are shipped files; there is no Dexie exercise-catalog table.
- Review uses `db.kv`, key **`review:v1`**; preserve `ReviewState`, `Decision`, and the `anygym-review-v1` export contract in `src/lib/review.ts`.
- Preserve `decide`, `parseReview`, `progress`, `nextIndex`, and `buildExport`; approving a review must not silently rewrite static catalog data.
- Body preference uses **`anygym.muscleBody`** through `src/lib/bodyPref.ts::bodyPref`; it is localStorage state, not a new profile field.
- Keep sessions/sets keyed by existing exercise IDs; catalog IDs are lookup targets, not replacements for historical IDs.
- Preserve journals, submission receipts, tombstones, held corrections, and mutation supersession records during any gate fix.
- If a reproduced defect genuinely requires a new store/index, add v10; never modify shipped schema declarations.
- Any v10 must include a v9→v10 preservation test in `src/db/__tests__/migration.test.ts`, including pending recovery records.

**4) Tricky edge cases and handling**

- **Cold offline photos:** `CacheFirst` only helps after an image was requested; both frames and both formats are not automatically cached together.
- Test unseen exercises offline separately from previously viewed exercises; show an honest unavailable-photo state and keep sets usable.
- The first-view caching decision conflicts with SPEC 0’s broad “everything works offline after first load” promise; explicitly resolve/document that contract before claiming compliance.
- **Audited-out demos can return through 2.2c:** `Plank` remains in the catalog/ladder despite both plan plank mappings being downgraded to `none`.
- `infoForCatalog()` fabricates an exact entry, and `exercisesForMuscle()` uses it for thumbnails; prevent ordinary browsing from re-exposing that rejected photo pair.
- Keep owner Review able to inspect disputed material; distinguish photo suitability from the owner’s review verdict.
- **Nested dialogs:** muscle list → exercise sheet → demo viewer must unwind one level per Back/Escape and restore focus without changing workout state.
- Closing an ancestor or changing exercise must also close its descendants; no orphan viewer, stale title, or lingering inert application.
- **Short-screen geometry:** long names, plan notes, first-time hints, reps editor, and rest dock must coexist without covering the current row.
- **Logging while viewing form:** opening/closing demos must not change pending weights/reps, restart holds, clear rest, or move edits onto another row.
- **Pair navigation:** preserve `planWorkout.ts::advancesAfterLog` and `restAfter`; early checks stay on the exercise, final prescribed working set advances, extras never trigger another advance.
- **Review write/read failure:** retain the last persisted decisions, expose retry, and avoid presenting an unreadable store as “0 reviewed.”
- **Cross-tab Finish:** `finishWorkout()` rechecks held changes, but `saveMutation()` and Finish still lack a true shared registration lock; reproduce the remaining timing window before choosing a fix.
- **Reduced motion:** sheet demos show two still frames; workout hero/full viewer currently use the start frame. Preserve the explicit workout exception.

**5) Tests to add or extend, with assertions**

- **Vitest — `src/lib/__tests__/catalog.test.ts`:** lock in the three audit downgrades; validate all mappings, local assets, full source SHA, and image dimensions.
- **Vitest — `src/lib/__tests__/exerciseInfo.test.ts`:** `none`/unknown/mismatched IDs yield no demo or invented muscles; variants retain their caveat; cues cite valid source lines.
- Add a regression there for catalog-level rejected photos once the suitability mechanism is chosen; ordinary catalog lookup must suppress the rejected Plank demo.
- **Vitest — `src/lib/__tests__/review.test.ts`:** last verdict wins, blank cue notes are refused, reload parsing preserves valid decisions, export excludes obsolete IDs and includes the catalog SHA.
- **Vitest — existing muscle/body tests:** preserve four distinct drawings, region coverage, primary precedence, shoulder overrides, and text-only uncertain anatomy.
- **Vitest — `src/lib/__tests__/muscleExercises.test.ts`:** retain primary-only selection, plan-first sorting, exclusions for uncertain shoulders, and empty-list behavior.
- Add independent named fixtures to that test; assertions derived solely from `resolveMuscles()` cannot detect an error shared by both implementations.
- **Vitest — `src/db/__tests__/carryover-2.0i.test.ts`:** coordinate two DB connections; a failed correction registered during Finish must remain pending and prevent silent completion.
- **Vitest — `src/db/__tests__/backup-held-2.0h.test.ts`:** Replace/Merge with throwing localStorage, fresh-runtime reopen, and Retry preserve exact correction values once.
- **Playwright — `tests/gate-s2.spec.ts`:** exact, variant, none, and unknown exercises render the correct photos/caveat/empty state with no invented content.
- Assert three/four-set geometry before scrolling, including rest active, safe areas, 130% text, long names, bodyweight, stack, barbell, and timed exercises.
- Assert hero/viewer/sheet closure restores the same route, current row, draft values, rest deadline, and committed-set count.
- Assert cached demos survive offline reload; unseen photos fail honestly; logging offline still persists exactly one set per accepted check.
- **Playwright — Review:** four version taps stay hidden; fifth opens; each verdict persists; cue-note validation works; share/download/cancel outcomes are accurate.
- Inject Review storage failures and assert retryable feedback without false saved progress or overwriting previously stored decisions.
- **Playwright — 2.2c:** select a muscle using keyboard-accessible controls, open its exercise list/details, unwind dialogs, and assert sessions/sets are unchanged.
- **Playwright — `tests/stay-2.0g.spec.ts`:** verify early paired sets stay put, last working set advances, warmups/extras do not; rest starts correctly.
- Repeat the reported offline double-check regression **30 times in WebKit** and assert exact set IDs/counts/values, not only visible row counts.
- **Playwright — hard kills:** stop after journal persistence, before set commit, after receipt commit/before reconciliation, and after Undo acceptance/before restore.
- Reopen offline after each kill; assert no lost submission, no duplicate committed set, unchanged newer drafts, and correct deletion identity.
- Run the new/changed flows on **`--project="iPhone SE"` and `--project="iPhone 17 Pro Max"`**, both WebKit; record both flows explicitly.
- Then run `npm run build`, `npm run test`, `npm run test:coverage`, and **`PW_FULL_MATRIX=1 npx playwright test`** with the full 90-second monkey duration.
- Include existing `matrix.spec.ts`, `edge.spec.ts`, `history-2y.spec.ts`, `kill.spec.ts`, durability/editor/backup regressions, and `tapcount.spec.ts`.
- Inspect AnyGym Small/Max in real Mobile Safari Simulator; verify native touch panning and standalone behavior on-device where automation cannot prove them.

**6) Risks, existing conflicts, and gate exit**

- The working tree contains modified exercise/muscle components, untracked 2.2c code/tests, and changed screenshots; establish their ownership before staging or attributing gate results.
- `reports/codex/2.2c.md` already flags inaccessible muscle selection; current source still contains that path.
- `CATALOG_REPORT.md` is stale: it reports 40/8/38 mappings and precaching; current data/config are 37/8/41 and runtime caching.
- `reports/session-2.md` includes superseded UI descriptions; final report must describe the shipped hero/inline-tips implementation.
- The latest recorded exercise-screen score is **7/10**; the earlier plate work also missed 8. Checked PLAN boxes do not satisfy SPEC 23.4.
- Several gate-s1 assertions encode old hint positions; update only assertions contradicted by the current SPEC, preserving their underlying reachability checks.
- The default Playwright command filters Android/floor projects to `@matrix`; the gate must set `PW_FULL_MATRIX=1` explicitly.
- Existing kill tests terminate after settled snapshots; mouse drags/direct scroll assignments do not prove native thumb panning.
- Deployment workflow builds/deploys without running this acceptance suite; a green Pages workflow alone is insufficient.
- Before visual fixes, builder/critic should read the three local design skills named in SPEC 23; critic also reads `break-ui/SKILL.md`.
- Release only after tests and critic pass: commit reviewed session work, merge `s2-catalog` to master without fast-forward, smoke-test master, push, await green Pages, run `npm run test:live`.
- Record final revision/results and remaining limitations; if the gate fails, leave 2.6 incomplete and do not merge further gate changes.