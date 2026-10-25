Codex brief for PLAN item 2.2, written Oct 25 12:20 at commit 218567d. SPEC.md wins if they disagree; code may have moved since.

Read-only brief for [PLAN 2.2](/Users/rabah/projects/anygym/PLAN.md:52). No files changed; no tests run.
Paths below are relative to `/Users/rabah/projects/anygym`; proposed files and functions are explicitly identified.

**1) Applicable SPEC and acceptance checks**

- [SPEC 4.5](/Users/rabah/projects/anygym/SPEC.md:73) defines the geometry source, muscle mapping, shoulder exceptions, overrides, and text labels.
- SPEC 4.4 requires both front and back silhouettes, primary muscles in lime, secondary at 40% opacity, and a “Primary · Secondary” legend.
- SPEC 0 requires honest uncertainty: missing or ambiguous muscle data must never produce guessed highlights.
- SPEC 2 makes exercises static bundled data; this feature needs no user-data writes.
- SPEC 10 requires existing black/lime styling, typography, spacing, and reduced-motion behavior.
- SPEC 13.3–13.4 require accessible text, zero console errors, offline operation, safe areas, and layouts through 320px width and 130% text.
- SPEC 13.5 keeps exercise details outside the active set layout; the map must not push logging controls below the fold.
- SPEC 23 requires existing design tokens and SE/17 Pro Max screenshots and recordings.
- Acceptance: both silhouettes render from locally bundled polygons, without runtime network requests.
- Acceptance: every supported catalog muscle resolves correctly or appears explicitly unresolved in the report.
- Acceptance: shoulder direction is exercise-specific; lateral raises use `front-deltoids` geometry with “Side delts” text.
- Acceptance: precise primary labels always appear below the drawing; secondary labels remain separately identifiable.
- Acceptance: every ambiguous decision is recorded in `data/muscle-overrides.json` and `CATALOG_REPORT.md`.
- Scope: deliver the reusable component, resolver, overrides, and a dev preview; the exercise-sheet consumer belongs to PLAN 2.3.
- Finish-summary and weekly heat maps from SPEC 21 are later consumers; this item should not invent intensity or recovery calculations.

**2) Files to create or change**

- Dependency: 2.1 is unchecked; `data/catalog.json`, `data/exercise-map.json`, and catalog accessors do not currently exist.
- `reports/codex/brief-2.1.md` proposes those interfaces; confirm the actual 2.1 implementation before binding to them.
- Create `src/components/muscles/bodyPolygons.ts`: typed anterior/posterior polygon arrays, model bounds, and upstream provenance.
- Port coordinate strings without redrawing anatomy; preserve all polygons associated with each region.
- Record the exact upstream commit and source paths; the inspected geometry exports `anteriorData` and `posteriorData`. [Upstream geometry](https://github.com/giavinh79/react-body-highlighter/blob/master/src/assets/index.ts)
- Create `third_party/react-body-highlighter-LICENSE.txt`: preserve the complete MIT notice and copyright. [Upstream license](https://github.com/giavinh79/react-body-highlighter/blob/master/LICENSE)
- Create `third_party/react-body-highlighter-SOURCE.md`: repository, pinned SHA, copied files, and local adaptations.
- Create `src/lib/muscles.ts`: proposed `MuscleRegion`, `MuscleTarget`, `ResolvedMuscles`, and override types.
- Add proposed pure `resolveMuscles()`, `validateMuscleOverrides()`, and `validateMuscleCoverage()` functions.
- Keep source muscle identity, display label, and polygon regions separate; one coarse region can represent several precise labels.
- Implement the fixed mapping exactly:
- `abdominals→abs`, `obliques→obliques`, `abductors→abductors`, `adductors→adductor`.
- `biceps→biceps`, `calves→calves`, `chest→chest`, `forearms→forearm`.
- `glutes→gluteal`, `hamstrings→hamstring`, `lats→upper-back`, `middle back→upper-back`.
- `lower back→lower-back`, `neck→neck`, `quadriceps→quadriceps`, `traps→trapezius`, `triceps→triceps`.
- Handle `shoulders` through explicit exercise decisions; provide no global front-delt fallback.
- Create `data/muscle-overrides.json`: explicit primary/secondary targets, precise labels, resolution status, rationale, and source references.
- Namespace keys as `catalog:<catalogId>` and `plan:<legacyExerciseId>`; plan-specific decisions take precedence.
- Overrides should replace the specified primary or secondary list, making corrections and intentional omissions unambiguous.
- Create `src/data/muscles.ts`: load overrides and expose proposed `musclesForPlanExercise(planExerciseId)`.
- That accessor resolves the legacy exercise through 2.1’s mapping, then calls `resolveMuscles()`; unknown IDs return an honest empty result.
- Create `src/components/muscles/MuscleMap.tsx`: proposed `MuscleMap({ muscles })`, consuming resolved data rather than resolving names itself.
- Render two responsive SVGs, front/back captions, legend, and visible primary/secondary text beneath them.
- Use a labelled figure; make redundant SVG geometry decorative so assistive technology receives the text once.
- Expose stable `data-view`, `data-region`, and `data-role` attributes for browser assertions.
- Create `src/components/muscles/MuscleMap.module.css`: fluid sizing, preserved SVG aspect ratios, wrapping labels, and token-based colors.
- Apply secondary opacity only to highlighted geometry and its legend swatch; keep explanatory text at accessible contrast.
- Create `src/screens/dev/MusclesDevScreen.tsx` and `.module.css`, following `InfoDevScreen()`’s scrollable audit-page pattern.
- Include catalog-backed examples plus clearly labelled synthetic fixtures for overlap, empty data, and long labels.
- Change [src/App.tsx](/Users/rabah/projects/anygym/src/App.tsx): register `dev/muscles` behind existing `DEV_TOOLS` / `devToolsEnabled()`.
- Extend 2.1’s proposed `scripts/catalog-report.ts` / `buildCatalogReport()` with source muscles, resolved regions, override rationale, and unresolved entries.
- Update generated `CATALOG_REPORT.md`; report all curated catalog exercises, including those without plan references.
- Leave `ExerciseView()`, `Thumb()`, and `FinishScreen()` integration for their respective follow-up work.

**3) Data model and Dexie**

- [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) currently declares `SCHEMA_VERSION = 9`.
- No schema bump, migration, new table, bootstrap write, or backup-format change is needed.
- Exercises are explicitly static JSON, not a Dexie table; overrides and SVG geometry should also ship as static modules.
- Suggested resolved target: `{ muscle: string, label: string, regions: MuscleRegion[] }`.
- Suggested result: `{ primary: MuscleTarget[], secondary: MuscleTarget[], unresolved: string[], status }`.
- Preserve original catalog muscle strings alongside resolution results for auditability.
- Keep `Session.exerciseIds`, `WorkoutSet.exerciseId`, settings, draft identities, submission receipts, and history keys unchanged.
- Do not add static anatomy data to `TABLE_NAMES` or `BackupTables` in `src/lib/backup.ts`.
- Catalog `reviewed` approval remains separate from mapping resolution; resolving a muscle does not approve a demo.

**4) Tricky edge cases and handling**

- Lats and middle back share `upper-back`; deduplicate the highlight while retaining both meaningful text labels.
- When primary and secondary muscles collapse onto one region, primary styling wins; do not paint secondary over it.
- If the identical source muscle occurs in both lists, retain it once as primary.
- Resolve shoulders appearing in either list; bench-press secondary shoulders need the same explicit handling as primary shoulders.
- Audit current `dumbbell-arnold-shoulder-press`, `dumbbell-lateral-raise`, `machine-seated-reverse-fly`, and `rear-delt-fly`.
- `front-and-lateral-plate-raise` needs an explicit combined label; its shared front-delt polygon cannot communicate both actions.
- Band internal shoulder rotations must not inherit the press rule; leave unsupported anatomy unresolved.
- Never derive muscles from `bodyPartOf()` in `src/lib/picker.ts`; its categories serve search, not anatomical accuracy.
- A `match: none` demo does not prohibit independently verified muscle text; it does prohibit borrowing an approximate demo’s muscles.
- For unresolved muscles, retain confirmed targets and show a short uncertainty note; with no confirmed targets, show neutral silhouettes.
- “Upper chest” requires supporting source information or a documented override; `chest` alone does not establish that precision.
- Preserve abductor/adductor spelling exactly; upstream’s deprecated `ABDUCTOR` constant aliases `adductor`. [Upstream metadata](https://github.com/giavinh79/react-body-highlighter/blob/master/src/component/metadata.ts)
- Treat head, knees, and other structural polygons as neutral unless explicitly supported by the mapping contract.
- Derive bounds from the pinned geometry; inspect the complete posterior model for clipping rather than assuming matching front/back bounds.
- Validate unknown region names, dangling override IDs, empty labels, duplicate keys, and missing rationales before publishing artifacts.
- Keep runtime fallback nonthrowing for missing metadata; generated-data validation should fail with actionable build/test diagnostics.
- Multiple maps on one page must not reuse SVG title IDs; use React `useId()` if SVG titles are necessary.
- Keep the map static; it needs no tap targets, timers, frequency shading, or animation loop.

**5) Tests to write and assertions**

- Create `src/lib/__tests__/muscles.test.ts`; use table-driven cases for every fixed SPEC 4.5 mapping.
- Assert front/rear shoulder overrides apply independently to primary and secondary source lists.
- Assert lateral raises highlight `front-deltoids` and display “Side delts,” without claiming front delts in the label.
- Assert lats plus middle back produce one region while retaining distinct text targets.
- Assert primary styling wins a primary/secondary region collision; input arrays remain unchanged.
- Assert unknown muscles and unresolved shoulders remain unresolved, without guessed regions.
- Assert override precedence, explicit empty replacements, unknown IDs, invalid regions, and missing rationale behavior.
- Once 2.1 exists, assert every curated muscle occurrence is resolved or explicitly reported unresolved.
- Assert report entries match override decisions and preserve source references.
- Create `src/components/muscles/__tests__/MuscleMap.test.tsx`; follow existing `renderToStaticMarkup()` tests and Node Vitest environment.
- Assert both views, captions, legend, visible labels, neutral empty state, and semantic primary/secondary region attributes.
- Assert geometry contains finite valid coordinates within declared bounds and renders every polygon for a highlighted region.
- Create `tests/muscles.spec.ts`; import `test` and `expect` from `./fixtures` for network and error guards.
- Mark relevant cases `@matrix`; explicitly run WebKit projects `iPhone SE` **375×667** and `iPhone 17 Pro Max` **440×956**.
- Assert front/back highlights, computed lime fill, secondary opacity `0.4`, and full-opacity primary precedence.
- Use `simulateSafeAreas()`, `checkLayout()`, `fullyShown()`, and `checkContrast()` for normal and 130% text layouts.
- Assert long muscle labels wrap completely, both silhouettes remain visible, and no horizontal scrolling appears.
- Test reduced-motion preference: the map remains complete and static, with identical labels and highlights.
- Wait for service-worker control, go offline, reload the dev route, and assert polygons and labels still render.
- Render multiple maps together; assert unique accessible references and no styling leakage between instances.
- Run existing `tests/tapcount.spec.ts` and workout layout regressions; call `checkActiveWorkout()` before scrolling.
- Capture inspected screenshots and recordings under `reports/shots/2.2/` and `reports/videos/2.2/` on both requested phones.
- Validation commands: `npm test`, `npm run build`, then `npx playwright test tests/muscles.spec.ts tests/tapcount.spec.ts --project="iPhone SE" --project="iPhone 17 Pro Max"`.

**6) Risks and conflicts with built code**

- The working tree contains substantial Session 1 edits, including workout screens, picker logic, backup code, and tests; preserve that baseline.
- The earlier 2.1 brief says schema v7; current source is v9. Recheck interfaces against source when implementation starts.
- `PlanExercise` currently contains only `id`, `name`, `loadType`, and optional `bar`; adding anatomical guesses there would contaminate existing behavior.
- `resolvePlanExercise()`, `normalizePlan()`, and `useWorkout().nameOf/loadTypeOf/barOf` depend on legacy identities; keep muscle lookup additive.
- Picker aliases and display names are separate concerns; never merge anatomical overrides solely because names look alike.
- `ExerciseView()` already owns a “How to” sheet showing “Demo coming soon”; 2.3 should replace its contents through that existing entry point.
- The active view already has strict SE layout and tap-count constraints; avoid adding an inline body map during 2.2.
- Vendoring geometry avoids a new runtime package; retain attribution and inspect the copied model before accepting screenshots.
- Bundled TS/JSON uses existing JS precaching in `vite.config.ts`; external SVG fetching would introduce unnecessary offline failure paths.
- Implement geometry/types first, then resolver/overrides, then preview/report/tests; catalog-dependent coverage becomes verifiable after 2.1 lands.