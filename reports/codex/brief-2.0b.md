Codex brief for PLAN item 2.0b, written Oct 25 16:25 at commit 9eb816e. SPEC.md wins if they disagree; code may have moved since.

Read-only review complete; no files changed and no tests run. Item [2.0b is at PLAN.md:54](/Users/rabah/projects/anygym/PLAN.md:54).

1. **Applicable SPEC and acceptance checks**

   - [SPEC §5.6](/Users/rabah/projects/anygym/SPEC.md:144) is the primary requirement: replace the shortened shaft with one physical scale for the complete bar and plates.

   - Men’s Olympic geometry: 2200 mm overall, 1310 mm shaft between inner collars, two 415 mm sleeves, two approximately 30 mm collars; shaft diameter 28 mm, sleeve diameter 50 mm.

   - Women’s geometry: 2010 mm overall, the same 1310 mm shaft, two 320 mm sleeves, 25 mm shaft diameter. Select geometry by bar identity, independently of its configured weight.

   - Rendered Olympic shaft/sleeve length ratio must be within 5% of `1310 / 415`: approximately **3.00–3.31**, at every supported width and tested load.

   - §5.3 still governs plate thicknesses, descending order from each collar, bilateral symmetry, removal, tray interaction, and the “Sleeve is full” response.

   - §5.6 requires horizontal labels **under plate groups**, readable counts for repeated plates, steel/chrome materials, knurling, flanges, end caps, and slide animations.

   - §§0, 5.4–5.5 require exact totals and preserved stored units/breakdowns. Keep `sumLoad()` and `formatMathLine()` responsible for the readout.

   - §§10, 13.2–13.5 and 23 require reduced-motion support, safe areas, accessible controls, 130% text, and no horizontal page overflow.

   - Required visual matrix: **45, 135, 225, 315, 405 lb; 60, 100, 140 kg**, on SE, 17 Pro Max, and the 320 floor.

   - Accept only when adding plates never compresses the shaft, changes scale to accommodate an overfull load, or drops labels.

2. **Files and implementation**

   - [src/lib/plateLayout.ts](/Users/rabah/projects/anygym/src/lib/plateLayout.ts): `barLayout()` is the root cause. It explicitly substitutes `SHAFT_GAP = 48` for the physical shaft.

   - Replace that fixed gap with physical dimensions multiplied by `scale`; derive shaft, shoulders, sleeves, caps, and plate positions from the same scale.

   - Account for `1310 + 2×415 + 2×30 = 2200`. Draw end caps within that envelope rather than adding their widths beyond 2200 mm.

   - Preserve `LayoutInput`’s dimensional-unit contract: plate tables currently use inches for lb and millimetres for kg. Convert bar dimensions into that unit before applying scale.

   - Calculate scale from available width and physical overall length; reserve enough vertical space for the largest supported plate and label rows. Never derive scale from plate-stack thickness.

   - Extend `LayoutInput` with an optional bar identity or resolved geometry. Retain Olympic defaults for existing harness callers.

   - Rework `underLabels()`/`sideLabels()`: label every run, use `runLabel()` for counts, permit packing inward beneath the shaft, and use additional reserved label rows when necessary.

   - Remove the current behavior that silently drops labels or falls back to 9 px text when a side is crowded. Keep leaders to group anchors when labels move.

   - [src/lib/plates.ts](/Users/rabah/projects/anygym/src/lib/plates.ts): add static standard bar dimensions and a proposed `barSpec(barId, unit)` helper; reuse `plateSpec()`, `stackThickness()`, and `fitsSleeve()`.

   - Resolve the diameter conflict explicitly: newer §5.6 says 450 mm for 45 lb and heavier, while §5.3/current tables say 17.01/17.7 inches. Apply the newer drawing requirement; retain specified thicknesses.

   - [src/components/load/BarSvg.tsx](/Users/rabah/projects/anygym/src/components/load/BarSvg.tsx): remove the shaft break-mark path; preserve `BarSvg()`, `Flange()`, `Plate()`, gradients, stable animation keys, and reduced-motion behavior.

   - Add stable selectors to the actual shaft and sleeve rectangles, such as `data-bar-part="shaft"` and `data-bar-part="sleeve"` with `data-side`, for rendered-geometry assertions.

   - Paint all barbell group labels below the plates. Scale decorative hub/lip details so fixed pixel embellishments do not dominate thin plates.

   - [src/components/load/PlateDiagram.tsx](/Users/rabah/projects/anygym/src/components/load/PlateDiagram.tsx): pass resolved geometry into `barLayout()` and use its sleeve length for `add()`.

   - Route Type it application through a checked handler too; retain `sleeveFull()`, its status announcement, shake, and unchanged value on rejection.

   - [src/components/load/TypeItSheet.tsx](/Users/rabah/projects/anygym/src/components/load/TypeItSheet.tsx): accept optional `sleeveLength` and pass it into `solvePlates()` so suggested loads fit the drawn bar.

   - [src/screens/workout/SetLoadInput.tsx](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx): `BarbellField()` already resolves `barId`, including historical `ownBarId`/`localBar`; forward that identity to `PlateDiagram`.

   - [src/components/load/PlateDiagram.module.css](/Users/rabah/projects/anygym/src/components/load/PlateDiagram.module.css): accommodate label rows and physical plate height across normal, compact, and tight variants; keep controls at least 48 px.

   - [src/screens/dev/PlatesDevScreen.tsx](/Users/rabah/projects/anygym/src/screens/dev/PlatesDevScreen.tsx): extend `PRESETS` with all eight acceptance loads, preserving existing 185 lb and 102.5 kg presets used by older tests.

   - Add harness controls for women’s geometry and compact/tight rendering. Keep these controls behind the existing dev route.

3. **Data model and Dexie**

   - **No Dexie migration is needed.** `SCHEMA_VERSION` is currently 9; geometry belongs in static library data.

   - Existing `BarId` already covers `olympic`, `womens`, `ez_curl`, `trap`, and `smith`. Existing settings and saved loads already carry bar identity.

   - Do not persist pixel coordinates, scale, label positions, or standard dimensions in `Gym`, `Load`, drafts, or backups.

   - Preserve historical `barWeight`, `barId`, `perSide`, `collars`, `unit`, and `ownOther`; opening a set must not recalculate its stored total.

   - For consistent women’s-bar capacity, add optional `sleeveLength` to the transient `LoadSetup` type in `src/lib/load.ts`; forward it through `plateOpts()`.

   - Populate that value in `src/screens/workout/exerciseLoad.ts`’s `loadSetupFor()` using `barIdFor()`. Existing `SolveOptions.sleeveLength` already supports this.

   - In `copyLoad()`, check sleeve fit before reusing `prev.perSide`; its current fast path checks inventory and total but bypasses physical capacity.

4. **Tricky edge cases and handling**

   - **Overfull existing values:** restored drafts or historical sets can bypass tray additions. Show a persistent overflow state without shrinking, truncating the breakdown, or rewriting saved data; keep removal/Clear available.

   - **Exact sleeve boundary:** preserve `fitsSleeve()`’s tolerance. Test exact fit and just-over fit, not only large overflowing stacks.

   - **Disabled inventory plates:** saved plates may no longer be enabled. Rendering must still include their actual dimensions; tray availability must not clip an existing larger plate.

   - **Unknown bar weight:** preserve `— lb`, “Bar weight not set,” and `+ bar` math behavior. Known standard geometry does not justify inventing a weight.

   - **Unknown dimensions:** §5.6 references EZ/trap/Smith dimensions “from §5.3,” but §5.3 supplies weights/prompts only. Keep an explicitly schematic fallback and record this unresolved requirement; do not invent measurements.

   - **Empty bar:** 45 lb must retain full geometry without labels or active remove controls. Geometry must match the loaded states.

   - **Dense mixed stacks:** repeated plates share counted labels; distinct weights remain separately identifiable. Test label coverage and actual browser text bounds.

   - **Sizing:** `PlateDiagram` currently uses heights 136/96/84. A full-width true-scale bar plus labels may exceed the smaller budgets; reserve space explicitly rather than distorting proportions.

   - **Corner collision:** the compact bar-picker chip assumes the drawing’s upper-left corner is free. Recheck `.corner` and `.barChip`; the newly extended bar/plates can occupy that area.

   - **Responsive measurement:** clamp negative drawable space, handle initial width measurement, and avoid NaN coordinates when a sheet is hidden or resized.

   - **Machine horns:** preserve `hornLayout()`’s single-sided geometry, “Machine · plates per side,” starting-resistance handling, and `Horn is full` wording.

5. **Tests to write**

   - Extend `src/lib/__tests__/plateLayout.test.ts`: assert Olympic ratio, physical dimensions, mirrored coordinates, plate adjacency, and total envelope at widths 264, 288, 340, and 400.

   - Assert identical geometry/scale for empty, one-plate, and heavy stacks at a fixed viewport; overflowing input must not shorten the shaft.

   - Add women’s tests: shaft/sleeve ratio `1310/320`, shaft diameter 25 mm, overall envelope 2010 mm, and geometry independent of configured bar weight.

   - Replace assertions requiring `SHAFT_GAP`, thick-plate on-face labels, and silently dropped labels. Preserve symmetry and complete naming assertions.

   - Add label tests: one label per weight run per side, correct counts, no missing groups, no overlapping text bounds within a row, and all labels inside reserved space.

   - Extend `src/lib/__tests__/plates.test.ts`: standard bar dimensions, updated diameter policy, and men’s/women’s sleeve-fit boundaries.

   - Extend `src/lib/__tests__/load.test.ts` or `src/lib/__tests__/prefill.test.ts`: custom sleeve propagation, solver capacity, and `copyLoad()` refusing an overfull reused breakdown.

   - Verify women’s 320 mm sleeve accepts five 25 kg plates exactly and rejects six; Olympic accepts six and rejects seven.

   - Create `tests/true-scale-barbell.spec.ts`, importing `test`/`expect` from `./fixtures`; mark core cases `@matrix` so the 320 project actually runs them.

   - Measure the actual SVG shaft/sleeve rectangles after layout settles. Assert the ratio tolerance and uniform x/y scaling; do not test only exported constants.

   - Assert required lb fixtures have zero through four 45s per side; kg fixtures are `[20]`, `[25,15]`, and `[25,25,10]`, with correct totals and math.

   - Assert every rendered plate is represented by an under-group label and count; no plate text is rotated or squeezed onto its edge.

   - Exercise tap, long press, remove from either side, Clear, Type it, overflow rejection, reduced motion, and bar switching without changing weight semantics.

   - Test the real `WeightSheet` and `EditSetSheet` flows, including women’s and unknown bars; save/reload and assert exact stored load values.

   - Use `simulateSafeAreas()`, `checkLayout()`, and `checkControls()` on SE and Max, including 130% text. Call `checkActiveWorkout()` before helpers that scroll.

   - Capture all eight loads on SE, Max, and 320. Capture real Mobile Safari screenshots on **AnyGym Small** and **AnyGym Max**; include one iPhone Duo layout check per `PROMPT.md`.

   - The 320 project is 320×568 WebKit emulation. Label its screenshots accordingly; do not present Playwright captures as simulator evidence.

   - Run focused Vitest, `npm run build`, and the new Playwright spec on `"iPhone SE"`, `"iPhone 17 Pro Max"`, and `"320 floor"`; then run existing plate/load/bar-choice regressions.

6. **Risks and conflicts with built code**

   - Current geometry tests encode the obsolete compressed shaft. Update those expectations alongside implementation rather than preserving them through compatibility hacks.

   - `underLabels()` currently assumes outward-only placement and a 16 px band; this is the largest layout change after replacing `SHAFT_GAP`.

   - `SLEEVE_LENGTH.lb` is 16.4 inches, approximately 416.56 mm, while TRUE SCALE specifies 415 mm. Use the resolved standard consistently for drawing, additions, and solving.

   - Do not confuse structural inner-collar flanges with the optional competition collars whose mass is already included by `collarsWeight()`.

   - `WeightSheet` and `EditSetSheet` share `SetLoadInput`; preserve historical bar identity and stored-weight behavior introduced by earlier saving fixes.

   - The worktree already contains extensive uncommitted 1.7k changes, including `load.ts`, `exerciseLoad.ts`, and `SetLoadInput.tsx`. Build against those current contents and avoid reverting unrelated fixes.

   - Item 2.0a owns Finish-screen cleanup and machine-summary totals. Keep 2.0b’s machine work limited to preventing shared-diagram regressions.

   - `vitest.config.ts` requires 100% lines/branches for `plateLayout.ts`; new geometry and label branches need coverage.

   - Builder should first read `.design-ref/skills/emil-design-eng/SKILL.md`, `mobile-native/SKILL.md`, and `frontend-design/SKILL.md`, as required by `PROMPT.md`; review visuals against SPEC 23.