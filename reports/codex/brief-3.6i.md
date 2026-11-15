Codex brief for PLAN item 3.6i, written Nov 15 15:55 at commit 459ac292. SPEC.md wins if they disagree; code may have moved since.

Item **3.6i is at [PLAN.md:68](/Users/rabah/projects/anygym/PLAN.md:68)**. This brief uses the current source; proposed files and functions are identified below. No files changed; no tests run.

**1) Applicable SPEC sections and acceptance checks**

- **SPEC 0, 1:** decoration must preserve offline operation, use local assets, and resolve correctly under `/anygym/`.
- **SPEC 4.3:** generated art must never become an exercise demo, muscle illustration, or claim about available equipment.
- **SPEC 10:** retain Titanium Glass surfaces, Inter, silver text, and token-based ice blue glow and shadow.
- **SPEC 13.2:** reserve image space before loading; image arrival must not move labels, controls, or selection tags.
- **SPEC 13.3–13.4:** accessible labels, 48 pt targets, 130% text, safe areas, no clipping or horizontal scrolling.
- **SPEC 14:** preserve goal order, Main/Also selection behavior, place choices, hints, and intake navigation.
- **SPEC 20.3:** preserve Quick generation, actual muscle maps, counts, minutes, why lines, and curation behavior.
- **SPEC 16–17:** passport textures and badges support existing artwork components; earning rules and passport screens remain later work.
- **SPEC 23.2:** retain Lucide for functional controls and fallback. PLAN 3.6i explicitly authorizes these decorative raster icons.
- **SPEC 23.4 plus PLAN:** record SE and 17 Pro Max flows; also visually check the existing iPhone 15 project. Premium score target is **9+**.
- Acceptance: all 23 icons exported to AVIF and WebP, preserving alpha, at twice their maximum CSS display dimensions.
- Acceptance: target **under 40 KB per encoded icon**; load only needed artwork, with no remote requests or first-paint dependency.
- Acceptance: Lucide remains visible while loading, after both image formats fail, and when reduced data is requested.
- Acceptance: goal/place artwork appears through Settings’ actual **“Answer the questions again”** action (`redo-intake`).

**2) Files and implementation**

- Add `scripts/export-approved-art.mjs`, using the already-installed `sharp`; keep it separate from `scripts/make-icons.mjs`, which generates app identity icons.
- Give the exporter an explicit source/output manifest, dimension checks, alpha checks, encoder settings, and byte-size reporting.
- Export committed derivatives into proposed `public/art/approved/v1/`; retain originals only in the ignored `.design-ref/` directories.
- Use semantic output names rather than array indexes. The exact mapping is:

| Local source prefix | Destination identity |
| --- | --- |
| `01_build_muscle_dumbbell` | goal `muscle` |
| `02_get_stronger_trophy` | goal `strength` |
| `03_lose_fat_flame` | goal `fat_loss` |
| `04_tone_up_sparkle` | goal `tone` |
| `05_stay_healthy_heart` | goal `health` |
| `06_athletic_performance_lightning` | goal `athletic` |
| `07_train_for_race_finish_flag` | goal `race` |
| `08_get_back_into_it_circular_arrow` | goal `comeback` |
| `09_full_gym_squat_rack` | place `full` |
| `10_hotel_gym_suitcase_dumbbell` | place `hotel` |
| `11_home_yoga_mat_house` | place `home` |
| `12_outdoors_tree_park_bench` | place `outdoors` |
| `13_mix_everything_globe` | place `mix` |
| `14_full_body_circuit_three_rings` | Quick `circuit` |
| `15_superset_pump_crossed_dumbbells` | Quick `pump` |
| `16_strength_focus_barbell_plate` | Quick `strength` |
| `17_cardio_core_pulse_heart` | Quick `cardioCore` |
| `18_mobility_reset_rolled_mat` | Quick `mobility` |
| `19_arms_abs_flexed_arm` | Quick `armsAbs` |
| `20_easy_start_leaf` | Quick `easy` |
| `21_first_5k_running_shoe` | future First 5K |
| `22_faster_5k_speed_shoe` | future Faster 5K |
| `23_first_10k_finish_arch` | future First 10K |

- Add `src/ui/art/approvedIcons.ts`: typed asset registry and proposed `goalArtKey()`, `placeArtKey()`, `quickArtKey()` lookups.
- Type goal/place keys from `src/lib/intake/options.ts`; Quick keys come from `StyleId` in `src/lib/quickStyles/types.ts`.
- Namespace identities (`goal-strength`, `quick-strength`); intake’s training `STYLES` are unrelated to Quick styles.
- Add `src/ui/art/IconArt.tsx` and `IconArt.module.css`: one decorative renderer accepting an asset key and existing Lucide fallback.
- Reserve a square slot, render `object-fit: contain`, use empty `alt`, `aria-hidden`, `draggable={false}`, and `pointer-events: none`.
- Reuse `afterPaint()` from `src/ui/afterPaint.ts` and `useInView()` from `src/hooks/useInView.ts` before mounting image sources.
- Use asynchronous decoding and lazy loading; retain fallback until the selected image has loaded successfully.
- Add `src/hooks/useReducedData.ts`: combine `useMedia('(prefers-reduced-data: reduce)')` with feature-detected `navigator.connection.saveData`; subscribe and clean up changes.
- Extend [Chip.tsx](/Users/rabah/projects/anygym/src/ui/Chip.tsx) and [ChoiceCard.tsx](/Users/rabah/projects/anygym/src/ui/ChoiceCard.tsx) with an optional `art?: ReactNode` slot; keep `icon?: LucideIcon`.
- Their render precedence becomes supplied art, otherwise the existing icon. Update both CSS modules without changing callers lacking art.
- In [Steps.tsx](/Users/rabah/projects/anygym/src/screens/intake/Steps.tsx), `GoalChoice()` supplies `IconArt` using each goal id and `iconFor(o.icon)`.
- Add an optional artwork callback to `SingleChoice()`; supply it only for the place step from `stepBody()` in `src/screens/intake/stepBody.tsx`.
- Do not change `iconFor()` globally: shared Lucide names also serve experience, cardio, training preferences, and other questions.
- Starting size proposal: goal artwork 48 CSS px on tall screens, 28 px below 720 px height; place artwork 40 px; Quick artwork 44 px.
- Those maxima imply 96, 80, and 88 px square exports respectively; verify final sizes before encoding.
- In [ConceptCard.tsx](/Users/rabah/projects/anygym/src/screens/quick/ConceptCard.tsx), resolve artwork from `concept.id`, retaining its existing `MiniMusclePair`.
- Place the decoration beside the title within existing space; keep count, why, info target, muscle map, press feedback, and card height intact.
- `plan`, `fresh`, and `focus` concepts receive no invented style artwork; every variant of `pump` uses the same pump asset.
- Add a small explicit Lucide fallback mapping for the seven Quick styles; Quick currently has no style-icon fallback.
- In `vite.config.ts`, add narrowly scoped `CacheFirst` runtime caching for `/art/approved/v1/` AVIF/WebP files.
- Keep derivatives outside precache: current `globPatterns` omit AVIF/WebP, and precaching all art would defeat lazy/reduced-data behavior.
- Keep the versioned URL directory immutable; future replacements use a new version to avoid stale `CacheFirst` assets.
- Add a lazy gallery in proposed `src/screens/dev/ApprovedArtDev.tsx`, mounted through existing `src/screens/dev/ArtDev.tsx`.
- Show all 23 assets there, including currently unavailable Quick styles and future run icons; do not expose unfinished product features.
- Export Higgsfield `p2-page-paper.png` and `p3-ink-texture.png` as separate optimized texture derivatives, sized to their preview surfaces.
- Layer them optionally in `GuillochePaper()` and `InkBloom()` via `src/ui/art/passport/Paper.tsx`, `InkBloom.tsx`, and `passport.module.css`.
- Keep paper children and stamp geometry above decoration; retain current vectors when textures are unavailable or reduced data is enabled.
- Keep `src/ui/badges/Badge.tsx` unchanged: all eight inspected Higgsfield badges are opaque, so clean-cutout acceptance is currently unmet.
- Update `src/MAP.md`’s existing `ui/art` description; keep new source files near 300 lines and below the 400-line guard.

**3) Data model and Dexie**

- **No migration or stored-data change.** `src/db/schema.ts` currently declares `SCHEMA_VERSION = 11`; leave it unchanged.
- Keep `GoalId`, `PlaceAnswer`, Quick `StyleId`, intake drafts, profiles, plans, and backup formats unchanged.
- Asset identities and dimensions are shipped UI metadata; image cache state belongs to Workbox.
- Do not persist a reduced-data preference merely to support this item; derive it from available browser signals.
- Run-plan artwork receives registry entries and gallery coverage only: `src/screens/RunScreen.tsx` is currently an empty state.

**4) Edge cases and handling**

- A `<picture>` source’s unsupported format can fall through, but a failed AVIF request/decode needs explicit handling: retry WebP once, then retain Lucide.
- Reset per-image failure state when the asset key changes; ignore late callbacks from an earlier asset.
- Reduced data must prevent mounting image URLs. Hiding an already-mounted image with CSS does not prevent its download.
- Missing network APIs or media-query support must not crash; default to ordinary lazy artwork behavior.
- Offline before an asset has been seen shows Lucide; previously displayed assets should survive reload through runtime caching.
- Preserve transparent padding and soft edges during export; inspect on glass surfaces for dark fringes and inconsistent apparent sizes.
- SE goal tiles currently switch to horizontal layout below 720 px; keep Main/Also tags clear of the artwork and labels.
- Preserve the place auto-advance pulse and `useFlip()` behavior; image loading must not change the measured card height.
- Higgsfield ink is an opaque blue-on-paper texture: use it as a subtle layer, never as a rectangular replacement for the actual stamp.
- Keep decoration static; use existing motion tokens for any fade and avoid animating blur or shadow.

**5) Tests to write**

- `scripts/__tests__/approved-art.test.ts`: inspect committed derivatives with Sharp; assert complete manifest, expected dimensions, formats, byte targets, and real icon transparency.
- Make those tests run without `.design-ref/`: CI lacks the local sources. Validate sources only during explicit export.
- `src/ui/art/__tests__/approvedIcons.test.ts`: assert all eight goals, five places, seven Quick styles, and three future run assets map correctly.
- Assert `quickArtKey()` returns no style art for `plan`, `fresh`, or `focus`; `pump` variants resolve identically.
- `src/ui/art/__tests__/IconArt.test.tsx`: follow existing `renderToStaticMarkup` conventions; assert reserved dimensions, hidden decoration, fallback markup, and no eager image sources.
- Extend `src/ui/__tests__/components.test.tsx`: supplied art replaces only the icon slot; labels, hints, Main/Also tags, rings, and `aria-pressed` remain.
- Add `tests/verify-3.6i.spec.ts` using `tests/fixtures.ts`; its automatic error trap must remain active.
- Intake test: fresh goal screen loads correct art; first/second/third goal taps preserve Main/Also replacement behavior and reload persistence.
- Place test: all five choices show correct artwork; tapping still stores the correct id and advances once.
- Settings test: tap `redo-intake`, reach goal/place screens, and verify artwork without clearing workout history or the active plan.
- Quick test: style art matches stable ids across More ideas; muscle maps, info sheets, counts, and starting/curating workouts still work.
- Gallery test: every asset decodes; unavailable `cardioCore`/`mobility` remain absent from real generated suggestions.
- Failure tests: AVIF failure falls back to WebP; both failures show Lucide; navigation remains usable.
- Reduced-data tests: mock each signal before page load; assert visible Lucide and zero artwork requests, including after navigation.
- Offline tests: warm service-worker/runtime caches, reload offline, and verify seen art; unseen art falls back without blocking interaction.
- Layout tests: use `simulateSafeAreas()` and `checkLayout()` from `tests/helpers/layout.ts` at 100% and 130% text.
- Delay image responses and compare control rectangles before/after decoding; assert no movement, overlap, covered CTA, or lost 48 pt targets.
- Run WebKit on **iPhone SE (375×667)** and **iPhone 17 Pro Max (440×956)**, plus existing **iPhone 15**; mark layout coverage `@matrix`.
- Capture before/after screenshots under `reports/shots/3.6i/` and flow recordings under `reports/videos/`; inspect pixels, not just passing assertions.
- Builder checks: typecheck, lint, Vitest, build, bundle budget, golden suite, then the focused three-phone Playwright run with retries disabled.

**6) Risks and conflicts with existing code**

- Current Quick design intentionally uses actual muscle maps as its main picture; replacing them would regress SPEC 20.3 and prior 3.5f work.
- “Superset pump” is now titled **“Pairs, back to back”** in `quickStyles/styles.ts`; map by `pump`, never displayed text.
- Cardio/core and mobility are deliberately gated on honest exercise/demo availability; approved icons must not enable those cards.
- `ArtScene()` already delays loading, but `src/ui/art/lazy.tsx` loads a shared art pack; avoid coupling intake icons to badges and celebration effects.
- The bundle guard measures initial JavaScript, not image transfer size; explicit asset-size and request-count checks are necessary.
- `.design-ref/` is excluded only through this checkout’s `.git/info/exclude`; add portable ignore entries before exporting, and never stage originals.
- Existing vector badges preserve live numbers, accessible names, locked states, and distinct shapes; opaque raster replacements would lose those guarantees.
- PLAN 3.6v records existing matrix failures. Record the baseline and isolate new failures; do not weaken unrelated assertions to obtain green.
- The working tree already contains modified screenshots and untracked reports; leave them outside this item’s eventual commit.
- WebKit emulation can verify layout and loading behavior; final premium assessment and installed-PWA touch feel still need the required visual review.