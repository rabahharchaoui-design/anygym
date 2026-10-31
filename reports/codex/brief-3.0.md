Codex brief for PLAN item 3.0, written Nov 01 03:32 at commit 34a3f91. SPEC.md wins if they disagree; code may have moved since.

[PLAN.md:69](/Users/rabah/projects/anygym/PLAN.md:69) defines **3.0 as an inspiration study**, producing `docs/inspiration.md`. It does not authorize building the patterns.
Read `CLAUDE.md`, `SPEC.md`, `PLAN.md`, and the relevant source and tests. No files changed; no tests run.

**1) Applicable SPEC sections and acceptance checks**

- **SPEC 21.1–21.3:** primary scope: Hevy logging patterns, Bevel summaries, and practices to avoid.
- **SPEC 0:** preserve honest data, offline operation, privacy, uncluttered screens, and original assets.
- **SPEC 10:** adapt every recommendation to AnyGym’s black surfaces, lime accent, typography, and restrained motion.
- **SPEC 13.1–13.5:** plain labels, clear defaults, accessible controls, phone layouts, and a current set usable without scrolling.
- **SPEC 20.1–20.4:** protect the existing list/table workout flow and its 6/3/7 tap budgets.
- **SPEC 23:** evaluate navigation and feedback against the existing shared controls and motion system.
- **SPEC 14, 15, 17, 19, 22:** cross-reference onboarding, coach, motivation, gym switching, and suggestions where research applies.
- Acceptance: exactly **20 distinct, ranked patterns**, each supported by inspected public evidence.
- Cover both apps and all three requested evidence classes: App Store screenshots, design teardowns/showcases, and user reviews.
- Each pattern records its source URL, access date, evidence location, observation, AnyGym adaptation, SPEC reference, implementation status, owning PLAN item, and acceptance check.
- Include a separate “SPEC 21 gaps” discussion; identify omissions without silently turning proposals into requirements.
- Every recommendation must identify whether to preserve, extend, defer, or reject it.
- Completion means another builder can find the relevant component and verify the intended behavior without repeating the research.

**2) Files and concrete contents**

- Create [docs/inspiration.md](/Users/rabah/projects/anygym/docs/inspiration.md); `docs/` does not currently exist.
- Begin with research date, app/platform/version information where available, source inventory, and evidence limitations.
- Follow with the ranked 20-pattern study, then SPEC gaps, conflicts, and the implementation/test handoff.
- Use stable pattern IDs `P01`–`P20` so subsequent PLAN items and reports can reference decisions.
- Recommended entry format: `Evidence → observed pattern → user benefit → AnyGym adaptation → code → SPEC/PLAN → acceptance`.
- At actual completion, update only item 3.0 in [PLAN.md](/Users/rabah/projects/anygym/PLAN.md:69) with a concise completion note.
- Do not change `SPEC.md` to make recommendations appear approved.
- No production source changes, dependencies, routes, downloaded competitor assets, or new research UI belong in 3.0.

The following are **research targets**, not findings to publish before examining evidence:

| ID | Pattern to investigate; existing implementation anchor; ownership |
|---|---|
| P01 | Per-row previous performance and copy action: `SetTable()` and `ExerciseView.copyLast`; SPEC 21.1; preserve existing behavior. |
| P02 | Prefilled targets with one-tap logging: `pendingRows()` in `src/lib/setTable.ts`, `ExerciseView.log`, `logQueue.claim()`; SPEC 20/21.1. |
| P03 | Immediate, satisfying completion feedback: `SetTable()`, `tick()` in `src/ui/haptics.ts`; SPEC 21.1/23.3. |
| P04 | Exercise-specific rest controls: `RestDock()`, `ExerciseMenu.RestPage`, `startRest()`/`shortenRest()`; SPEC 21.1. |
| P05 | Discoverable set types: `SetTypeSheet()`, `storedType()`/`typeOfSet()`; SPEC 21.1; preserve current plain-word labels. |
| P06 | Compact live workout totals: `WorkoutScreen()`; SPEC 21.1; assess information hierarchy without increasing header height. |
| P07 | Contextual exercise actions: `ExerciseMenu()`; SPEC 21.1; distinguish existing actions from missing Replace and pairing. |
| P08 | Readable grouped exercises and next-item progress: `DayList()`/`Progress()`; SPEC 20.1/21.1; PLAN 3.1. |
| P09 | Fast search and batch selection: `ExercisePicker()`/`PickerBody()`, `pickerSections()`; SPEC 21.2; already implemented. |
| P10 | Useful finish summary and restrained PR celebration: `FinishScreen()`, `recordsFor()`, `bestSetOf()`; SPEC 21.1; PLAN 7.1. |
| P11 | Exercise How to/History/Charts/Records organization: `ExerciseSheet()` currently supplies How to only; SPEC 21.1; PLAN 7.1. |
| P12 | Weekly activity/calendar context: `HistoryScreen()`, `listFinished()`, `DayCard()`; SPEC 21.1; PLAN 5.1/7.1. |
| P13 | Reorderable, hideable home cards: `TodayScreen()`/`DayCard()`; SPEC 21.2; PLAN 7.1. |
| P14 | Calm progress rings with clear denominators: existing `Ring()`; SPEC 21.2/17; PLAN 5.1. |
| P15 | Explanations disclosed in a sheet: `InfoButton()`, `InfoSheet()`, `Sheet()`; SPEC 21.2/13.7. |
| P16 | One useful, explainable coaching recommendation: future coach integrated into `TodayScreen()`; SPEC 21.2/15; PLAN 3.8. |
| P17 | Weekly muscle balance visualization: `MuscleMap()` is the rendering primitive; SPEC 21.1/21.2; aggregation remains future work. |
| P18 | Helpful first-day content without invented statistics: `TodayScreen()` currently offers plan selection and Quick workout; SPEC 21.2; PLAN 3.3/7.1. |
| P19 | Optional effort feedback and measured number animation: existing `Odometer()`, `motionFor()`; SPEC 21.2/15/23; PLAN 3.8. |
| P20 | Visible onboarding progress and low input burden: SPEC 21.3/14; PLAN 3.3; no intake route currently exists in `src/App.tsx`. |

- Re-rank or replace these targets when evidence shows a more useful pattern; avoid splitting one interaction merely to reach 20.
- For each retained pattern, cite the actual screen/review passage inspected, not a generic product homepage.

**3) Data model and Dexie migrations**

- **None for 3.0.** Research belongs in Markdown, outside application storage.
- [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) currently exports `SCHEMA_VERSION = 9`; leave it and `AnyGymDB` unchanged.
- Leave `Profile`, `ExerciseSetting`, `Session`, `WorkoutSet`, and backup formats unchanged.
- Card preferences, effort history, coaching state, and weekly aggregates need design decisions in their owning implementation items.
- Document those future storage questions; do not preemptively add tables, `kv` keys, or profile properties.

**4) Tricky edge cases and handling**

- Screenshots cannot prove interaction behavior: distinguish visible evidence from inferred navigation or timing.
- Marketing screenshots may show premium features or staged data: record that context and assess the pattern independently.
- App versions and platforms differ: retain conflicting observations with dates rather than combining them into a fictional current flow.
- Reviews are anecdotal: summarize specific friction; do not claim prevalence or consensus without supporting evidence.
- If a showcase is unavailable or gated, record the limitation and seek another public source; never invent the missing observation.
- Separate reviewer requests, your interpretation, and AnyGym recommendations explicitly.
- Keep competitor branding in research attribution only; write proposed product copy in original AnyGym language.
- Suggested recovery scores or muscle heatmaps must identify their actual inputs and uncertainty; logged sets do not establish physiological recovery.
- Zero history, missing demos, unknown equipment weights, and offline states require honest alternatives alongside every applicable pattern.
- Use public evidence and synthetic examples; do not access private history or reproduce private design references.

**5) Tests and assertions**

- **Write no new Vitest or Playwright tests for the documentation-only 3.0 item.**
- Validate the study manually: 20 unique IDs, inspected citations, valid SPEC/PLAN mappings, correct code anchors, explicit gaps and conflicts.
- Do not add a Markdown parser or brittle tests that merely count headings.
- Include the following test handoff in the study; extend existing coverage when the owning feature is implemented.

- Vitest: `src/lib/__tests__/setTable.test.ts` — targets prefill correctly, drafts win, absent weights remain absent, set types round-trip.
- Vitest: `src/lib/__tests__/progression.test.ts` — first-time advice stays honest; suggestions respect units, equipment, and loadability.
- Vitest: `src/lib/__tests__/records.test.ts` — ties, warmups, and drops do not create PRs; mixed-unit comparisons remain correct.
- Vitest: `src/lib/__tests__/rest.test.ts` — ±15-second adjustments, deadline-based countdown, and persistence retain correct remaining time.
- Future home-card tests — hiding/reordering preserves the selected order after reload and provides a usable first-day state.
- Future muscle-summary tests — aggregate only documented qualifying sets; unknown muscle mappings contribute no fabricated region.
- Future coach/effort tests — skipping effort remains valid, one answer attaches to the intended exercise, and explanations match the decision.

- Playwright: extend `tests/tapcount.spec.ts` — retain ≤6 taps for four target squat sets, ≤3 extra for weight changes, ≤7 for the seeded Quick workout flow.
- Playwright: extend `tests/verify-1.7c.spec.ts` — LAST TIME copies exact values, one check creates one set, rest starts, and first workouts show no false PR.
- Playwright: extend `tests/matrix.spec.ts` — new cards, sheets, and summaries have no horizontal overflow or obscured primary controls.
- Playwright: extend `tests/exercise-sheet-2.3.spec.ts` — detail expansion preserves the honest missing-demo state and reduced-motion behavior.
- Future `tests/today-cards.spec.ts` — proposed file for PLAN 7.1: reorder/hide/reload, empty history, active-workout Resume, and readable 130% text.
- Future exercise-detail tests — History/Charts/Records use the selected exercise and appropriate gym/bar context; back navigation preserves the workout.
- Run UI cases on configured WebKit projects **`iPhone SE` (375×667)** and **`iPhone 17 Pro Max` (440×956)**.
- Import `test`/`expect` from `tests/fixtures.ts` to retain the automatic console-error and rejection trap.
- Use `simulateSafeAreas()`, `checkLayout()`, and `activeWorkoutProblems()` from `tests/helpers/layout.ts`; verify the current set before scrolling.
- For later UI implementations, capture both-device videos and screenshots per SPEC 23.4; browser emulation alone does not prove native haptics or standalone safe areas.

**6) Risks and conflicts with code already built**

- **Duplicated work:** set tables, copy-last, set types, rest controls, multi-select, navigation, and PR chips already exist; mark these as preserve/assess.
- **Incomplete menus:** `ExerciseMenu()` deliberately omits Replace and Make a pair; research must not describe either as shipped.
- **Incomplete summaries:** `recordsFor()` supports `heaviest` and `most_reps`; best-set-volume PRs, finish muscle maps, and workout share cards remain gaps.
- **Incomplete home/history:** Today has no editable dashboard; History is a session list, and `ExerciseSheet()` has no history/chart/records tabs.
- **Gym switching:** `GymPill()` currently renders a `<span>`; its presence does not satisfy SPEC 19’s two-tap switcher.
- **Catalog mismatch:** the picker still uses `PLAN_EXERCISES`; suggestions assuming universal catalog IDs must coordinate with PLAN 3.1/3.2.
- **Durability:** visual changes must preserve stable draft IDs, `logQueue` claims, mutation journals, deletion tokens, and Finish locking.
- **SPEC precedence:** section 20 replaces the older card flow; section 14 replaces the short intake; picture-first 5.6 supersedes numbered-plate recommendations.
- **Conflicting wording:** use the stricter 48-point control target; flag onboarding’s older 60-second test against section 14’s approximately two-minute funnel.
- **Strength estimates:** SPEC 6 prohibits displayed estimated 1RM; SPEC 15 permits internal estimates. Research must not authorize displaying them.
- **Queue state:** PLAN 2.6 remains unchecked. This brief neither completes that gate nor authorizes shipping Session 3.