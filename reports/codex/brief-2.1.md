Codex brief for PLAN item 2.1, written Oct 25 02:26 at commit ba3c7eb. SPEC.md wins if they disagree; code may have moved since.

PLAN item **2.1 is at [PLAN.md:49](/Users/rabah/projects/anygym/PLAN.md:49)**. Build the catalog, mappings, optimized assets, and audit report. Demo rendering belongs to 2.3.
No files edited; no tests run. Existing functions below are named explicitly; proposed functions are marked “new.” Paths are relative to `/Users/rabah/projects/anygym/`.

**1) Applicable SPEC and acceptance checks**

- SPEC 0, 1: accurate data, offline after first load, `/anygym/` base path, no runtime requests to upstream.
- SPEC 4.1: use `yuhonas/free-exercise-db`; record a full commit SHA and fetch JSON, images, and license from that same SHA.
- Commit only the curated subset, targeting 120–180 distinct source exercises, rather than the entire upstream dataset.
- Produce `public/ex/<id>/0.jpg`, `1.jpg`, `0.webp`, and `1.webp`; preserve aspect ratio and keep width ≤720px.
- SPEC 4.2: account for every exercise in both plan files and select candidates covering all 17 SPEC 7.2 movement patterns.
- Include candidates across equipment levels where feasible; explicitly report unavailable combinations rather than inventing exercises.
- SPEC 4.3: every plan exercise has a manually decided `exact`, `variant`, or `none` mapping.
- `exact` requires the same movement and implement; `variant` requires a documented stance/grip difference suitable for later cues.
- `none` has no catalog target or demo paths; uncertain names must remain usable for logging.
- Every catalog record starts with `reviewed: false`; matching confidence and owner approval are separate concepts.
- Generate `CATALOG_REPORT.md` through `scripts/catalog-report.ts`; include every plan exercise, mapping, rationale, and both image paths.
- Open both images for every proposed exact match before accepting it; leave an audit trail for the broader 2.5 audit.
- SPEC 4.4/PLAN 2.3: retain original instructions so later condensed cues can cite their source instruction indices.
- SPEC 4.5: preserve primary/secondary muscle labels; identify ambiguous shoulders without implementing the 2.2 body map.
- SPEC 8: add dataset credit to Settings → About.
- SPEC 13.3–13.5 and 20.4: existing logging, offline recovery, phone layouts, and tap budgets must remain green.

**2) Files and implementation responsibilities**

- Create `data/catalog-source.json`: repository, full SHA, license identifier, source JSON path, and hashes of downloaded inputs.
- Create `data/catalog-selection.json`: manually curated upstream IDs, movement patterns, equipment requirements, and selection rationale.
- Use existing `EquipmentId` values from `src/db/types.ts` for requirements; retain upstream equipment separately.
- Create `data/exercise-map.json`: hand-maintained mapping decisions; the build validates and canonicalizes them without guessing replacements.
- Suggested mapping shape: `{ planExerciseId, name, catalogId, match, reason, variantCue?, occurrences }`.
- `occurrences` records plan ID, day, and block/item location so plan-specific notes remain auditable.
- Create `data/catalog.json`: generated selected source records, original instructions, local image paths, provenance, and `reviewed: false`.
- Keep upstream IDs intact as catalog IDs; use the existing plan slug as a separate mapping key.
- Create `src/lib/catalog.ts`: new types and pure `validateCatalog()`, `validateExerciseMap()`, and `validateCatalogCoverage()`.
- Validation rejects duplicate IDs, missing selections, dangling targets, invalid match combinations, unsafe paths, and absent image pairs.
- Create `src/data/catalog.ts`: import committed JSON and expose new `catalogExercise(id)` and `catalogForPlanExercise(planExerciseId)` lookups.
- `catalogForPlanExercise()` returns no demo target for `none` or an unknown ID; never fall back to a similarly named exercise.
- Create `scripts/build-catalog.ts`: fetch pinned metadata, validate selection/mappings, optimize selected images using installed `sharp`, then generate outputs.
- Separate its entry point from importable helpers so tests can inject fixture fetch responses without triggering network access.
- Stage outputs until validation and image processing succeed; a failed fetch must leave the previous generated catalog usable.
- Create `scripts/catalog-report.ts`: new `buildCatalogReport()` plus CLI; consume committed artifacts without downloading upstream again.
- Report SHA, counts by match type, unique exercise count, image dimensions/bytes, pattern coverage, unresolved muscles, and missing matches.
- Include plan notes and variant explanations beside image links so the auditor can assess the actual prescription.
- Create `third_party/free-exercise-db-LICENSE.md` from the pinned upstream license.
- Change `package.json`: add explicit catalog generation/report commands; ordinary `npm run build` must use committed outputs without downloading.
- Change [vite.config.ts](/Users/rabah/projects/anygym/vite.config.ts): add `jpg` and `webp` to Workbox `globPatterns`.
- Change `src/screens/SettingsScreen.tsx`: add the dataset credit within the existing About group; reuse `Settings.module.css`.
- Keep `src/data/planExercises.ts`, `scripts/build-plan-exercises.ts`, and `data/plan-exercise-overrides.json` operational.
- Leave `Thumb`, `ExerciseView`, `ExercisePicker`, and the How to sheet behavior intact; their catalog/demo integration follows later.

**3) Data model and Dexie**

- [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) is currently schema **v7**; exercises are explicitly static JSON, not a Dexie table.
- No Dexie migration, bootstrap seeding, schema bump, or backup-format change is needed for this item.
- Catalog records should retain `id`, `name`, equipment, muscles, instructions, category, level, force, mechanic, images, and source SHA.
- Preserve nullable upstream metadata rather than replacing missing values with invented classifications.
- The existing list contains **83 exercise names**; preserve every current slug, name, `loadType`, and optional `bar`.
- Keep `Session.exerciseIds`, `WorkoutSet.exerciseId`, exercise settings, submissions, tombstones, and draft keys unchanged.
- Several existing IDs may map to one catalog record; shared demo metadata must not merge their histories or progression.
- Keep catalog assets outside `BackupTables`/`TABLE_NAMES` in `src/lib/backup.ts`; backups continue carrying user records.
- If scope later requires changing stored IDs, treat that as a separate migration with previous-version data-preservation tests.

**4) Tricky cases and handling**

- `buildPlanExercises()` recursively finds `exercise` properties; the two plans have different nested block/item/week structures.
- Reuse it for the base name inventory, but independently collect occurrences and notes so deduplication does not discard context.
- Three finishers use `finisher.name`: Stair climbing, Jump rope, Cycling. Include them in coverage/reporting separately.
- Preserve their `finisherId()` identities from `src/lib/planWorkout.ts`, including Cycling’s unspecified duration.
- Detect normalized-name collisions explicitly; `slugify()` currently collapses names and `buildPlanExercises()` keeps the first.
- “Barbell Bent Over Row” and “Bent Over Barbell Row” may share a demo while retaining separate saved IDs.
- Treat “28 Method Squat,” “Forearm Finger Roll,” “Wrist Twist,” and “Wide Lunge” as unresolved until movement and implement are established.
- A plain squat demo does not establish the special protocol implied by “28 Method Squat.”
- Distinguish lying/seated leg curls, reverse pec deck/dumbbell reverse fly, plate-loaded/stack presses, and Smith/free-bar rows.
- Preserve squat and leg-press “Wide stance” notes; classify a standard-stance source as variant only after verifying suitability.
- “Barbell Straight Leg Romanian Deadlift” needs inspection; do not resolve straight-leg versus Romanian technique by name similarity.
- `planItemLoadType()` makes explicit plan reps override a timed name: Six Week Plank/Spider Plank must remain rep-based.
- Upstream equipment labels are insufficient to infer bench/rack requirements or pin-stack versus plate-loaded machines.
- Upstream permits null equipment and documents duplicate images; validate selected pairs and flag suspicious duplicates for inspection. [Upstream documentation](https://github.com/yuhonas/free-exercise-db)
- Require two decodable positions for a usable demo; missing/corrupt assets must fail generation or be explicitly downgraded to `none`.
- Validate HTTP status before decoding; never save a GitHub error response with a `.jpg` extension.
- Retain framing and orientation; resize without cropping or enlarging smaller originals.
- Use deterministic ordering and encoding settings; record acquisition metadata separately from reproducible generated content.
- Export base-relative asset paths through the catalog accessor; `/ex/...` would break deployment beneath `/anygym/`.

**5) Tests to write**

- Create `src/lib/__tests__/catalog.test.ts`; existing Vitest configuration only discovers tests beneath `src/`.
- Assert every current plan name has exactly one mapping, every occurrence is represented, and all three finishers are accounted for.
- Assert exact/variant targets exist; variants require an explanation; `none` cannot resolve a demo.
- Assert all generated records are selected, IDs are unique, count meets the agreed target, and every record starts unreviewed.
- Assert all 17 patterns have candidates and recorded requirements use valid `EquipmentId` values.
- Assert unsupported equipment combinations are reported honestly; do not require impossible floor-only alternatives.
- Assert catalog lookups preserve all 83 legacy IDs and allow multiple legacy IDs to resolve the same source record.
- Assert unknown names/IDs return no target and never activate fuzzy matching.
- Create `src/lib/__tests__/catalog-build.test.ts`: injected fetch fixtures assert every request uses the recorded SHA.
- Assert JSON/image failures do not publish partial outputs; reject traversal paths and duplicate/colliding output IDs.
- Decode committed assets with `sharp`; assert JPG/WebP formats, both positions, width ≤720, and preserved aspect ratio.
- Assert rebuilding from identical fixture inputs produces identical catalog, mapping normalization, and report content.
- Assert report rows and totals agree with the mappings, including unresolved entries and source instruction references.
- Retain `loadTypeRule.test.ts`’s committed-list comparison; add compatibility assertions rather than replacing that safeguard.
- Create `tests/catalog.spec.ts`, importing `test` and `expect` from `./fixtures`, as required by the network/error guards.
- Assert representative JPG/WebP pairs decode under `/anygym/ex/...`; read expected paths from generated catalog data.
- Assert all selected asset URLs appear in the built precache, then test an unvisited exercise pair after going offline.
- Wait for `navigator.serviceWorker.ready` and an active controller; disable ordinary HTTP caching so the test proves Workbox caching.
- On both phones, start a plan day, log a seeded squat set, reload offline, and assert the same saved ID/load and restored workout.
- Assert Settings credit is readable using `simulateSafeAreas()` and `checkLayout()` from `tests/helpers/layout.ts`.
- Run `npx playwright test tests/catalog.spec.ts tests/tapcount.spec.ts --project="iPhone SE" --project="iPhone 17 Pro Max"`.
- Existing profiles are SE 3rd gen **375×667** and 17 Pro Max **440×956**; label applicable new flows `@matrix`.
- Run `npm test`, `npm run build`, and existing plan/import/backup regressions; report actual results, not assumed passes.

**6) Risks and conflicts with built code**

- `resolvePlanExercise()`, `normalizePlan()`, `useWorkout().nameOf/loadTypeOf/barOf`, and History naming depend on the temporary list.
- Replacing `PLAN_EXERCISES` with upstream records would change identities and load behavior throughout the app.
- `mapPlanExercise()` currently matches imported names to legacy records; remapping imports is explicitly PLAN 3.2.
- User-selected load types take precedence in `useWorkout()`; later demo rendering must suppress incompatible implement demos.
- `gymSupports()` currently approximates equipment from load type; adding 120–180 entries to the picker would expose incorrect availability.
- Keep richer equipment metadata ready for 3.4 without broadening the live picker in 2.1.
- Workbox currently excludes both requested image formats; fixing generation alone would silently fail offline acceptance.
- Hundreds of precached images increase installation cost; report total bytes and installation failures rather than silently using lazy caching.
- Deployment uses Node 20, while the existing `.ts` generator expects Node 22.6+; keep catalog generation explicit or standardize its runner.
- PLAN wording says the script “writes” mappings, but SPEC requires manual decisions: generation must never overwrite reviewed mapping choices.
- The working tree already contains unrelated changes; preserve them and review only the intended item’s diff.