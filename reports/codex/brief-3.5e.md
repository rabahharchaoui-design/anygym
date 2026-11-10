Codex brief for PLAN item 3.5e, written Nov 11 01:05 at commit 6863afda. SPEC.md wins if they disagree; code may have moved since.

Read-only review complete; no files edited or tests run. Item 3.5e is at [PLAN.md:104](/Users/rabah/projects/anygym/PLAN.md:104).

**1) Applicable requirements and acceptance checks**

- SPEC §§0, 4.1–4.5: accurate demos, equipment, muscles and cues; local assets; pinned source; preserved license.
- SPEC §4.3: retain `exact`/`variant`/`none`; a variant needs its difference explained; never substitute another movement’s demo.
- SPEC §§2, 9.4: transactional review persistence, hidden owner route, progress and review JSON export.
- SPEC §§3, 7.2, 19: equipment requirements must match the actual gym, including benches, bars and dumbbell availability.
- SPEC §§10, 13.1–13.4: plain labels, 48pt controls, safe areas, 130% text, reduced motion and zero console errors.
- SPEC §§20.3, 22: approved additions must work with existing Quick, replacement and ordering rules.
- PLAN 3.5e adds approximately 400 curated exercises, two-source verification and G’s approval before new exercises enter suggestions.
- Acceptance: at least 25 distinct **approved, verified, equipment-compatible** moves for each of six requested places.
- Count full, hotel, home, dumbbells only, bodyweight and outdoors separately; the same exercise may legitimately serve several places.
- Acceptance: at least three approved candidates in each of the existing 17 movement patterns; report cardio and mobility coverage separately.
- Acceptance: Review batches contain at most 20 candidates; right approves, left marks wrong, Fix opens details; provide equivalent buttons.
- Acceptance: decisions survive reload; failed saves never advance; approximately three minutes per batch needs G’s timed hand check.
- Acceptance: new candidates remain excluded before approval, after rejection and when their reviewed content changes.
- Distinguish “library and queue shipped” from “coverage target achieved”; only G’s real approvals can complete the latter.
- Conflict: SPEC §4.1 still targets 120–180 exercises, while PLAN requests about 400; reconcile the source-of-truth wording before implementation.
- Conflict: SPEC §9.4 defers applying exported approvals; explicitly retain that export/apply workflow or document an immediate local activation change.
- Recommended workflow: persist decisions locally, export them, validate and apply them in a subsequent build; display “Saved for the next library update.”

**2) Files to create or change**

- [scripts/build-catalog.ts](/Users/rabah/projects/anygym/scripts/build-catalog.ts): extend selection beyond map targets and `catalog-ladder.json`.
- Preserve the pinned `data/catalog-source.json`, safe IDs, two image frames and generated JPG/WebP assets.
- Keep existing catalog IDs and image bytes stable wherever their content has not changed.
- Harden publication: the script currently replaces `public/ex/` before writing all remaining outputs; stage catalog, license and report together.
- [src/lib/catalog.ts](/Users/rabah/projects/anygym/src/lib/catalog.ts): extend `selectedCatalogIds()` with curated candidate IDs; retain `validateExerciseMap()`.
- Create `data/catalog-curation.json`: explicit curated IDs, requirements, loading/counting facts, role/style tags, evidence and content revision.
- Record two distinct supporting sources per candidate, with URLs, access dates and specific demo/equipment/muscle conclusions.
- Include rejection reasons for unsuitable candidates; two photos from one dataset are not two independent sources.
- Create `src/lib/catalogCuration.ts`: types and pure validation for evidence, revisions, requirements, completeness and approval eligibility.
- Create `src/data/catalogCuration.ts`: bind committed JSON and expose candidate lookup, review queue data and approved IDs.
- Create `scripts/apply-catalog-review.ts`: validate exported decisions and matching revisions, then update committed approval metadata.
- Keep approval application deterministic and idempotent; reject unknown IDs, malformed exports and stale revisions.
- [data/patterns.json](/Users/rabah/projects/anygym/data/patterns.json): add ranked strength candidates with explicit `requires`, `load`, `bar`, `eachSide` and `timed`.
- Retain the 17 pattern names; do not misclassify cardio or stretches as `core` merely to make them selectable.
- Keep cardio/mobility entries in the curation metadata with explicit roles and nullable strength patterns.
- `data/catalog-ladder.json`: synchronize selection with the expanded catalog; prevent this older file silently omitting new candidates.
- `data/exercise-cues.json`: add source-indexed cues, maximum three and under 12 words; unsupported Watch out/Good for text stays absent.
- `data/muscle-overrides.json`: resolve every new shoulder entry explicitly; preserve precise labels and omit uncertain regions.
- Generate `data/catalog.json`, `public/ex/<id>/{0,1}.{jpg,webp}` and `CATALOG_REPORT.md` through the build script.
- Extend the report with evidence, approval state, pending deficits, per-place counts and per-pattern counts.
- Create `src/lib/catalogCoverage.ts`: count canonical approved IDs using `supports()` and real equipment fixtures.
- [src/data/exerciseInfo.ts](/Users/rabah/projects/anygym/src/data/exerciseInfo.ts): integrate approval into `photoEligibility()`; preserve `ownerPreviewForCatalog()` as the inspection bypass.
- Freeze the existing audited eligibility baseline explicitly; adding a new exercise-map entry must not bypass G’s approval.
- Keep `demoFor()`, `infoForCatalog()` and `infoForExercise()` consistent with the same committed eligibility policy.
- [src/data/generator.ts](/Users/rabah/projects/anygym/src/data/generator.ts): supply `GENERATOR_DEPS.usable`; currently only `QUICK_DEPS` supplies that filter.
- `src/data/quick.ts`: make `QUICK_DEPS.usable` require full candidate eligibility, rather than photo existence alone.
- `src/lib/swap.ts`: add an eligibility predicate to candidate selection; enforce it in `swapCandidates()` and `adaptDay()`, including saved “Always use this” choices.
- `src/data/order.ts`: filter `upNextPool()`; give additions explicit ordering facts through `profileFor()` without guessing from their names.
- Preserve raw candidate facts for existing sessions; approval filtering must not make historical load types or equipment metadata disappear.
- `src/data/muscleExercises.ts`: filter new unapproved rows in `exercisesForMuscle()` and `exerciseCount()`, not just their thumbnails.
- `src/screens/workout/ExercisePicker.tsx` currently lists only `PLAN_EXERCISES`; use a shared approved catalog adapter if expanded manual selection ships here.
- Retain plan IDs and picker aliases through that adapter; do not manufacture hundreds of plan-map rows for catalog-only exercises.
- `src/lib/review.ts`: extend `Decision`, `buildExport()` and parsing with candidate revision; add pure batch selection/resume helpers.
- `src/db/review.ts`: extend `saveReviewDecision()` while retaining its transactional read/merge/write behavior.
- Create `src/screens/review/useReview.ts`: loading, persistence, busy state, retry, batch progress and export orchestration.
- Update `ReviewScreen.tsx`; create `ReviewCard.tsx` and `ReviewFixSheet.tsx`; reuse `FormDemo`, `MuscleMap`, `Sheet` and `Button`.
- Extract reusable gesture handling from `src/screens/quick/Deck.tsx` into `src/components/deck/`; keep review content and verdict semantics separate.
- Review must not inherit Quick’s long-press “Never show” behavior or its personal-dislike writes.
- Update `ReviewScreen.module.css`; keep Approve/Wrong/Fix reachable while the card’s detail content scrolls.
- Preserve existing five-version-tap navigation in `SettingsScreen.tsx` and `#/review` in `src/App.tsx`.
- Create `src/MAP.md`, currently absent, when adding folders; describe their responsibilities and shared deck location.
- Respect CLAUDE.md: touched files over 400 lines require splitting; `Deck.tsx`, `swap.ts` and `order.ts` already exceed that limit.

**3) Data model and Dexie changes**

- No new exercise table: `AnyGymDB` correctly treats the catalog as static shipped JSON.
- Keep `SCHEMA_VERSION = 10`; candidate metadata and committed approvals require no IndexedDB migration.
- Store review decisions and optional batch-resume metadata in the existing `kv` review record.
- Add optional revision fields compatibly; preserve existing `review:v1` decisions and existing verdict strings.
- Generic Wrong should lead to a specific existing verdict, or add a backwards-compatible verdict with explicit parser/export coverage.
- New approval requires the exact revision covering photos, equipment, muscles, cues and loading facts.
- Old decisions without revisions remain readable but cannot approve newly introduced candidates.
- `kv` is excluded from workout backups: preserve dedicated review export and make that recovery path clear.
- If a separate indexed review table is chosen instead, append v11 and prove all v10 workout data survives; it is unnecessary here.

**4) Tricky edge cases**

- Home starts with no equipment in `equipmentPreset('home')`; its 25-move check must pass without assuming dumbbells or bands.
- Outdoors also starts empty; dumbbells only means dumbbells without an assumed bench.
- Use `supports()` requirement groups: groups are AND, members within each group are OR; upstream “body only” does not prove no equipment.
- Deduplicate using canonical identities consistent with `SWAP_DATA.sameAs()` and `workoutIdOf()`; aliases do not inflate coverage.
- Approval of an ID is insufficient after content correction; revision mismatch returns it to pending.
- An offline candidate missing either frame cannot be confidently approved; keep rejection/skip available and show an honest photo state.
- Decide against a captured candidate ID/revision; rapid gestures, late promises and navigation must never approve the next card accidentally.
- Freeze each batch’s membership; Skip remains pending, empty queues show completion, and the final partial batch never indexes past its end.
- Failed reads block decisions; failed writes retain the card and earlier decisions; concurrent writes preserve unrelated approvals.
- Fix notes record requested corrections; they must not immediately rewrite exercise facts or activate the candidate.
- Timed cardio/holds need explicit seconds; repetitions, unilateral counting and machine resistance must retain their current meanings.
- Keep safety and experience restrictions independent of approval: an approved advanced movement is still unsuitable for beginners.

**5) Tests to write and assertions**

- `src/lib/__tests__/catalog-curation-3.5e.test.ts`: unique safe IDs, complete metadata, two evidence sources and deterministic revisions.
- `src/lib/__tests__/catalog-coverage-3.5e.test.ts`: six real equipment fixtures, ≥25 approved canonical moves each, ≥3 per strength pattern.
- Coverage tests must distinguish pending potential from approved coverage; never seed fake production approvals to make targets pass.
- Extend `catalog.test.ts`: explicit curated selection, both frames/formats for every entry, all dimensions ≤720px and preserved license/source pin.
- Update its obsolete 180-entry ceiling only alongside the SPEC reconciliation.
- `src/data/__tests__/catalog-approval-3.5e.test.ts`: pending/rejected/stale candidates fail every public eligibility path; valid approvals pass.
- Extend `catalog-demo-2.0j.test.ts`: preserve historic rejected demos and owner preview; accept only properly approved additions.
- `src/lib/__tests__/review-queue-3.5e.test.ts`: 0/1/19/20/21/400 candidates, stable batches, skip/resume and revision invalidation.
- `src/db/__tests__/review-3.5e.test.ts`: legacy preservation, failed reads/writes, concurrent merges and decision/revision persistence.
- `scripts/__tests__/apply-catalog-review.test.ts`: unknown/stale/malformed rejection, idempotence and approval-to-committed-data round trip.
- Extend muscle/cue tests: every shoulder resolves intentionally; cues reference valid instruction lines; unsupported claims remain absent.
- Add generator/swap/Up next tests proving new pending IDs cannot leak, including aliases and saved “Always use this” preferences.
- `tests/review-3.5e.spec.ts`: five-tap entry, right/left gestures, equivalent buttons, Fix details, export, reload and batch boundaries.
- Add gesture cancellation, short-drag snapback, vertical scrolling, double taps and save-failure retry assertions.
- Run on existing WebKit projects `iPhone SE` and `iPhone 17 Pro Max`; use `./fixtures` and `watchErrors()`.
- On both phones, assert 48pt controls, fully visible actions, uncropped demos, no horizontal overflow and clean layouts at 100%/130%.
- Test reduced motion and offline cached/uncached frames; pending candidates must remain absent from Quick and replacement suggestions.
- Run `npm run test`, `npm run build`, targeted review tests and existing Quick/swap/plans regressions; visually inspect both phone screenshots.

**6) Risks and conflicts with built code**

- Current baseline: 138 catalog entries, 45 photo-eligible IDs, 113 ladder candidates; only 37 ladder candidates are photo-eligible.
- Equipment-compatible eligible ladder counts are full 37, hotel 12, dumbbells only 4, empty home/bodyweight/outdoors 2.
- The existing Review approval does not activate anything; `photoEligibility()` uses the map plus `data/catalog-demos.json`.
- Generator, swaps and Up next currently have eligibility gaps; extending their candidate pools without closing those paths leaks pending exercises.
- `cardioCore` and `mobility` currently request only core slots with role checks; more images alone cannot unlock those styles.
- Keep broader style construction in 3.5f, but deliver correctly classified approved activity metadata here.
- Changing ladder rank or filtering affects frozen-plan equality tests; inspect changes deliberately and never silently refreeze existing plans.
- Preserve existing session exercise IDs, load metadata and plan definitions; catalog expansion must not rewrite history.
- Images are runtime-cached, not precached; `vite.config.ts` limits that cache to 600 entries, below 800 frames for 400 exercises.
- Measure download/cache costs; preserve honest uncached offline behavior and avoid loading the whole library during startup.
- Local `master` already records checkpoint 3.8c/3.5b/3.5c/3.5d at `3b85c769`; verify deployment before repeating the PLAN prerequisite.
- Existing dirty PLAN changes and `reports/codex/tests-1111-0049.md` are unrelated work; the latter reports unresolved saving/recovery failures.
- Required test-now wording: “Approve the new exercises: tap the version 5 times, Review, swipe through the batch.”