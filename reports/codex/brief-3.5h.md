Codex brief for PLAN item 3.5h, written Nov 11 01:35 at commit 10fb3727. SPEC.md wins if they disagree; code may have moved since.

Item [3.5h is at PLAN.md:104](/Users/rabah/projects/anygym/PLAN.md:104), after 3.5g and before 3.5e.
This brief reflects the current checkout and the requested designer review. No files were edited; no tests were run.

**1) Applicable SPEC sections and acceptance checks**

- **§0, §4.1–4.4:** use the existing approved start/end photos; preserve exact/variant/none eligibility and honest missing-photo states.
- **§13.2, §23.3:** smooth animation without layout shifts; previews remain still with reduced motion.
- **§13.3:** zero console errors/rejections, accessible controls, 48 CSS-pixel targets, and readable layouts at 130% text.
- **§13.4:** all four safe-area insets, responsive portrait layouts, no horizontal overflow, and reachable actions on short phones.
- **§13.5, §20.1–20.4:** preserve the workout’s visible current set, automatic rest flow, and existing tap-count limits.
- **§21.1:** elapsed time, set count, total lifted, and Finish remain visible in the workout header.
- **§23.1, §23.4:** preserve navigation/shared-element transitions; provide before/after screenshots and SE/Pro Max recordings.
- **PLAN-specific acceptance:** every currently visible control’s full hit box stays within the safe rectangle, including sheet Close controls.
- Backgrounds extend beneath system bars; the status-bar strip shows the active screen’s background without exposed scrolling text.
- Every eligible exercise preview crossfades the same two photos as the exercise screen; unapproved exercises retain their fallback.
- Preview images load lazily; offscreen, covered, and background-document previews stop animating.
- Report accurately: this is a two-photo loop. Full video demos are future work, not part of 3.5h.

**2) Files and implementation**

- Start with [src/styles/tokens.css](/Users/rabah/projects/anygym/src/styles/tokens.css:60): `--safe-top`, `--safe-bottom`, `--safe-left`, and `--safe-right` already wrap `env()`.
- Keep those tokens as the sole application inset interface; do not add device detection or hardcoded production inset values.
- `--app-height` already selects `100dvh`, with `100lvh` in standalone mode; preserve this until measurements justify a change.
- [index.html](/Users/rabah/projects/anygym/index.html:8) already has `viewport-fit=cover` and `black-translucent`; add regression assertions rather than changing correct metadata.
- `src/screens/workout/Workout.module.css`: `.topBar` already has inset padding, inset-aware minimum height, and `flex: none`.
- Consequently, missing header padding is **not an established root cause**; reproduce before prescribing another inset.
- Measure computed `--safe-top`, header/control rectangles, viewport dimensions, scroll positions, and navigation state during the reported failure.
- Correct the demonstrated cause while preserving `.dockWrap` as the outer bottom-inset owner.
- `src/ui/TopBar.module.css`: audit `.bar` and `.row` before/after collapse; keep the inset strip opaque enough to prevent content bleeding through.
- `src/components/AppShell.module.css`: preserve shell background coverage and existing page-side padding; avoid adding a second top inset.
- [src/ui/Sheet.tsx](/Users/rabah/projects/anygym/src/ui/Sheet.tsx:1), `src/ui/Sheet.module.css`: enforce safe clearance for every sheet variant.
- Current `.grabberZone` has `margin-top: -32px`; its hit box can extend into the status bar even when the visible grabber looks safe.
- Make the full Close target safe universally, including scrolling sheets, automatic tall sheets, nested sheets, and sheets without footers.
- Replace opt-in `clearTop` protection with a common sizing rule; preserve existing callers while consolidating the behavior.
- Account for header, grabber, footer, and bottom padding when determining scroll-body space; retain focus trapping and drag dismissal.
- Audit `src/ui/BottomCTA.module.css`, `TabBar.module.css`, `ResumeBar.module.css`, and `Toast.module.css` for duplicate or missing inset ownership.
- Audit fullscreen layouts in `src/screens/intake/Intake.module.css`, `src/screens/quick/Quick.module.css`, and `src/screens/workout/Finish.module.css`.
- Audit body portals separately: `src/components/exercise/DemoViewer.module.css` already positions Close using the top/right tokens.
- Include `src/screens/review/ReviewScreen.module.css`, dev screens, landscape guard, and startup/error screens in the audit.
- Change these audited files only where geometry or background coverage fails; a shell-only fix cannot affect body portals.

- [src/components/exercise/FormDemo.tsx](/Users/rabah/projects/anygym/src/components/exercise/FormDemo.tsx:1) already provides two-frame rendering through `Picture()` and `FormDemo()`.
- **Create** `src/components/exercise/DemoFrames.tsx` and `DemoFrames.module.css`; extract the shared picture rendering and opacity loop there.
- Keep `FormDemo()` responsible for hero/tile/sheet layout, explicit pause controls, and existing test hooks.
- Preserve the current three-second cycle: start holds to 45%, end fades in by 50%, holds to 95%, then fades out.
- Keep WebP/JPG `<picture>` handling, `assetUrl()`, `[data-frame]`, and frame-zero-first DOM order.
- **Create** `src/hooks/usePreviewVisibility.ts`: combine intersection visibility and `document.visibilityState`; clean up observers/listeners.
- Separate “near enough to load” from “visible enough to animate”; allow an explicit inactive flag for the covered deck card.
- Begin looping only after both sharp frames have loaded/decoded; reserve image dimensions throughout loading.
- `src/hooks/usePhotos.ts`: reuse `useDemoPhotos()` and `demoFrames()`; preserve cache-only URL selection while offline.
- [src/screens/quick/Deck.tsx](/Users/rabah/projects/anygym/src/screens/quick/Deck.tsx:55): replace `Photo()`’s frame-zero-only rendering with the shared frames.
- Extract `Card()`/photo presentation into **new** `src/screens/quick/DeckCard.tsx`; leave pointer handling and gesture decisions in `Deck()`.
- Retain uncropped sharp photos and a static blurred background; animate sharp-frame opacity only.
- Pass the existing `under` state into playback eligibility so the covered card stays still.
- `src/screens/workout/Thumb.tsx`: replace its single `<img>` path with shared preview frames; preserve equipment/initials fallbacks.
- Prefer moving this shared component to **new** `src/components/exercise/ExerciseThumb.tsx`, with a compatibility re-export from `Thumb.tsx`.
- Preserve `data-photo`, `[data-photo] img`, dimensions, `vtName`, and `ex-hero`; `DayList` uses these during image decoding/navigation.
- `DayList()`, `SwapSheet()`, and `UpNextCard()` already consume `Thumb`; they should inherit moving previews without new renderers.
- `src/components/muscles/MuscleExercises.tsx` has another private `Thumb()` that currently renders one photo; consolidate it too.
- `src/data/muscleExercises.ts`: supply the approved `DemoImages` pair on `MuscleExerciseRow`, preserving `thumb` temporarily if existing consumers require it.
- Resolve that pair through `infoForCatalog()`/`demoFor()`; do not construct an unapproved second-photo URL from a catalog ID.

**3) Data model and Dexie**

- **No Dexie migration is required.** `src/db/schema.ts` currently declares `SCHEMA_VERSION = 10`; leave it unchanged.
- `DemoImages` in `src/lib/exerciseInfo.ts` already contains both WebP and JPG tuples.
- The optional `MuscleExerciseRow` pair is an in-memory view-model change, not persisted user data.
- Visibility, decoded-frame readiness, and playback state belong in component/hook state; do not persist them.
- Keep `photoEligibility()`, the exercise map, and `data/catalog-demos.json` unchanged; this item does not expand demo eligibility.
- Preserve Workbox’s `exercise-photos` runtime cache in `vite.config.ts`; do not precache the entire photo library.

**4) Tricky edge cases**

- **One cached frame:** show frame zero still; never crossfade into an empty second frame.
- **No cached frame:** retain the equipment/neutral fallback or honest offline message; never render an uncached offline URL.
- **Image identity changes during a swap:** reset readiness by demo identity and ignore stale decode completions.
- **Reduced motion changes while open:** stop immediately and show the start frame for previews; reuse `useReducedMotionLive()` where JS needs the preference.
- Preserve the exercise sheet’s existing still, side-by-side reduced-motion presentation; the new preview policy must not alter that layout.
- **Nested sheets:** only the top interactive layer is audited for reachability; covered layers remain inert and their previews paused.
- **Short screen plus large text:** allow internal scrolling while keeping sheet Close/header/footer safe and the current workout row reachable.
- **Keyboard open:** verify search, equipment answers, import editing, and problem reporting retain a usable dismissal/action path.
- **Returning from a sheet or viewer:** restore focus, preview visibility, and scroll position without restarting unrelated workout state.
- **Nonzero side insets:** test synthetic left/right values even though normal portrait iPhone fixtures currently use zero.
- **Shared transitions:** preserve unique `ex-hero` naming and the first decoded photo; avoid duplicate transition names on mounted layers.

**5) Tests to write or extend**

- Reuse [tests/helpers/layout.ts](/Users/rabah/projects/anygym/tests/helpers/layout.ts:1): it already defines `insetsOf()`, `simulateSafeAreas()`, `checkLayout()`, and `checkActiveWorkout()`.
- Existing fixtures already provide SE `20/0`, iPhone 15 `59/34`, Pro Max `62/34`, and Pixel 7 `24/24` top/bottom values.
- Add a fixture option in `tests/fixtures.ts` that installs the existing simulator before navigation; retain all network/error guards.
- Extend `playwright.config.ts` with the explicitly requested iPhone 15 Pro project/profile; preserve the existing iPhone 15 coverage.
- Include a 48px Android-top stress case and nonzero side-inset cases; use CSS pixels, not physical screenshot pixels.
- **Create** `tests/safe-area-3.5h.spec.ts`, marked `@matrix`: cover all route families in `src/App.tsx` and their important overlay states.
- Include Today, Run’s current screen, History/detail, Plans/place/viewer, Settings/import/gyms/equipment, intake/reveal, and Quick choose/deck/ready.
- Include workout list/exercise/rest/pair-next/finish, Replace, weight/Edit set, exercise sheet/viewer, nested sheets, Review, and dev/error screens.
- Assert full control bounds against all four insets, background coverage, no horizontal overflow, and primary-action reachability.
- Add a **no-scroll visible-control pass before `checkLayout()`**; the existing helper scrolls controls into view and can conceal initial bleed.
- Extend `tests/harness.spec.ts`: prove the checker rejects top intrusion, bottom intrusion, and an unsafe Close hit box despite a safe-looking glyph.
- Also prove it accepts legitimately offscreen scrollable content and does not change scroll positions during the initial-layout pass.
- Run `checkActiveWorkout()` before any scrolling helper after opening/logging/rest/pair transitions, at 100% and 130% text.
- **Create** `tests/previews-3.5h.spec.ts`: verify both correct image identities in deck, day list, Replace, Up next, and muscle lists.
- Assert opacity changes through a complete cycle; assert reduced motion leaves frame zero still, including a live preference change.
- Assert offscreen/covered previews pause, returning previews resume, and lazy previews do not request the whole list eagerly.
- Test cached-both, cached-start-only, and uncached offline states; assert no broken images, blank alternating frames, or unexpected errors.
- Test rapid Swap/Keep/Undo and navigation while decoding; assert the displayed frames belong to the current exercise.
- **Create** `src/components/exercise/__tests__/DemoFrames.test.tsx`: use the repo’s `renderToStaticMarkup` pattern for frame order, image pairs, and noninteractive preview markup.
- Extend `src/lib/__tests__/photoCache.test.ts` only for newly introduced cache behavior; retain first-frame-only and unreadable-cache assertions.
- Extend catalog/data tests to assert muscle-list pairs equal approved `infoForCatalog(id).demo`, with null pairs for ineligible exercises.
- Reuse frame sampling in `tests/quick-3.5a.spec.ts` and `tests/verify-3.5a.spec.ts` while previews animate during drags and flings.
- Record timing distributions; existing p90 limits of 34–40ms do not establish sustained 60fps on a physical iPhone.
- Screenshot every audited screen on SE, 17 Pro Max, 15 Pro, and Pixel 7; record SE/Pro Max flows under `reports/videos/`.
- Re-run tap-count, exercise-screen, sheet-fit, gym-switching, Quick gesture, and `@matrix` regressions; then build and Vitest.

**6) Risks and conflicts with built code**

- The physical-device header failure remains unproven by source inspection; synthetic insets validate layout but cannot reproduce native standalone viewport behavior.
- Use existing `collectViewportInfo()`/`readSafeAreaInsets()` in `src/screens/dev/viewportInfo.ts` for Safari and installed Home Screen confirmation.
- Preserve PLAN 1.10b’s bottom-band fix: blanket padding on `body`, shell, and children would count insets twice.
- Preserve 3.5g’s incoming hero shrinking, warm-up collapse, pair navigation, and current-row positioning; inspect its landed code before implementation.
- Existing tests assert exact frame selectors, animation cadence, and shared-photo transitions; keep contracts unless intentionally updating corresponding assertions.
- CLAUDE’s split-on-touch rule applies: `Deck.tsx` is 407 lines, `Quick.module.css` 840, `Workout.module.css` 1054, and `tests/helpers/layout.ts` 413.
- Split touched oversized files by responsibility without behavior changes; touching `QuickScreen.tsx` or `WorkoutScreen.tsx` also triggers that rule.
- `src/MAP.md` is currently absent; its full creation is queued in 3.6x. All proposed additions above fit existing folders.
- Keep library approval work in 3.5e and universal swipe-deck redesign in 3.5f; neither is needed to animate approved previews.
- Existing working-tree changes include `PLAN.md`, critic artifacts, a 3.5e brief, and a probe test; preserve them and isolate this item’s diff.