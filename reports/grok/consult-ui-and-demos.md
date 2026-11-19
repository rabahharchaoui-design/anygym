STATUS: HANDLED (folded into PLAN M0, M-TEST and D1 by Claude, Nov 19)
# Grok Build consult: ui-and-demos (Nov 19 13:28)

I'll read the spec, plan, and source first, then answer both sections from what is already built.

The visual system, run screens, and exercise catalog are next so the advice matches what is already shipped.

## 1. The new UI

SPEC 10 and 23 still require Titanium Glass: frosted cards, 20–24 px corners, and an accent pill in a floating tab bar. The accent is already `#9FD3FF` in `src/styles/tokens.css`. Monolith is a spec change first. If the spec stays, the next builder will put the glass back. Leave plate colors, the muscle-map drawing, `src/lib/load/`, GPS math, and the voice clips alone.

**a) Order**

1. Rewrite the visual rules in SPEC 10 and 23, then change only `src/styles/tokens.css` and `src/styles/base.css`. Radii become 0 and 4 px. Delete pill radius. Flatten the background to graphite `#0F1114` with a top of `#2B2E34`. Raise `--text-hero`. Keep the color guard. One commit, no screen edits.
2. Shared chrome, still no screen layout work: `src/ui/Button.module.css`, `Chip.module.css`, `TabBar.module.css` plus `TabBar.tsx`, `Sheet.module.css`, `TopBar.module.css`, `card.module.css`, `ChoiceCard.module.css`, `Toast.module.css`, `EmptyState.module.css`, `BottomCTA.module.css`, `Switch.module.css`, `SlidingToggle.module.css`, and `src/components/AppShell.module.css`, `GymPill.tsx`, `MusicLinks.module.css`, `WeekdayChips.module.css`, `hint/Hint.module.css`. The gym control stays one tap to the same sheet. It just stops being a pill.
3. Today: `src/screens/TodayScreen.tsx`, `TodayScreen.module.css`, `src/screens/today/`.
4. Workout chrome only: `src/screens/workout/` (`WorkoutScreen`, `ExerciseView`, `ExerciseHead`, `SetTable`, `SetRow`, `WorkoutDock`, `RestDock`, `Finish`) and the frames in `src/components/exercise/FormDemo.module.css`, `ExerciseSheet.module.css`, `DemoViewer.module.css`. Same demo rules.
5. Run, after the chrome is already square: `RunStart.tsx` and `Run.module.css`, then `LiveStats.tsx`, `Live.module.css`, `LiveControls.tsx`, `LiveControls.module.css`, `HoldButton.tsx`, then `RunSummary.tsx`, `Summary.module.css`, `RouteMap.tsx`, and the same map-first block in `src/screens/history/RunDetail.tsx`.
6. One screen family per step after that: `HistoryScreen`, `plans/`, `quick/`, `SettingsScreen` plus `settings/`, then `intake/`.
7. Hidden `review/` last.

**b) Live run and summary**

Stats page stays full screen, near black, edge to edge. Three full-width rows, always visible, in this order: Distance, Moving time, Pace. Each row is a small label, a giant tabular number, the unit, then a 1 px hairline. Pace is the rolling number the engine already returns. A GPS gap shows `--` and the existing line `GPS lost · time on hold`. Interval runs keep `IntervalFace` as the top block. The three rows sit under it.

One square Pause, full width, at least 56 px tall, in the thumb zone. Lock is a 48 px square at the corner, same action. Hold to end stays a 1 second hold (`useHold`). Make the control square and fill a bar, not a circle. Locked screen still shows only Hold to unlock. The map stays a second page: swipe, or the left-edge swipe on the map. Route in `#9FD3FF`, dashed gaps, start mark, `Map offline` chip. Lock still blocks map pan.

Summary, and run detail, use the same stack. Edge-to-edge map first, fit to the route. Under it one stat row: distance, moving time, average pace, split by hairlines. Then the existing `Run saved` check, best split, records, splits, the dashed-gap sentence from `DASHED_NOTE`, share, and GPX. A no-GPS or under-50 m run keeps the plain verdict with Discard and Keep and no invented numbers.

Do not break pocket dim after 10 seconds with no touch, first tap only wakes, wake lock, or the one-time toast when the phone will not hold the screen. Do not break the voice pack, the run settings sheet, the interval color flash, reload-returns-paused, or reduced motion. Formatters in `src/lib/run/` stay the only source of the numbers.

**c) Live QA on https://rabahharchaoui-design.github.io/anygym/**

Use an iPhone SE width (320) and a Pro, portrait, and the largest text size. Outdoors or at full brightness, numbers must be `#F2F4F7` or `#9FD3FF` on graphite. `#7B8490` is too dim for any label you need while running.

- Today, History, Plans, Quick, Settings, intake: every tab, Start, chip, and row is at least 48 px. No pill remains. Type is not cut with an ellipsis. A long gym name and a long exercise name wrap. Gym switch still takes two taps. Tab bar clears the home indicator.
- Workout: hero, set rows, and checkmarks stay on the first screen for a 3-set move on SE. Weight sheet, plate picture, rest dock, and Finish still work. A move with no sure demo shows the honest empty header, not a photo.
- Run start: Start, the four run types, and music buttons are 48 px and readable in sun. Countdown still fills the screen.
- Live: three rows readable at arm’s length. None overflow on SE. Pause, Lock, and the 1 second End hold all work. Lock hides everything but Hold to unlock, and the map does not pan. Ten seconds of no touch dims. The next tap only wakes. Pause, resume, and auto-pause keep their places. Kill GPS and confirm `--`, the hold line, and a dashed gap on the map, including `Map offline`. Speak one split with music playing. Music must keep playing.
- Summary and run detail: map is first and full width. Stat row matches the live numbers. Dashed note is the real sentence, not a shortened one. Short run still offers Discard and Keep. Share hides the first and last 200 m. GPX still shares.

## 2. Exercise demo images

**a) Count**

`data/catalog.json` has **138** exercises. Each already has start and end JPG and WebP under `public/ex/<id>/`. `reviewed` is false on all 138. `photoEligibility` in `src/data/exerciseInfo.ts` shows a demo for **46** (audit keeps plus 4 ids in `data/catalog-demos.json`). **92** stay hidden. Of 86 plan rows, **41** are `match: none` with no catalog id, so the user sees no photo. Those 41 are the holes that matter. The 46 stay as they are.

**b) Sourcing**

I can browse the web from here. Do not hunt for 138 new pictures. The files on disk are Unlicense (public domain) from `yuhonas/free-exercise-db`, already credited on the Settings screen. The gap is certainty.

Open both frames. Keep a pair only when the named movement and the implement are visible in both. A stance or grip difference can be a variant cue. Any doubt stays `none`. Never point a plan row at a different exercise. This is the audit 2.5 rule. Plank and Close-Grip Front Lat Pulldown already failed it. Leave them hidden.

Only a failed pair gets a replacement, and only from a page that states one of these: public domain, CC0, or CC BY. Record author, title, file URL, and license URL. Wikimedia Commons qualifies per file, not as a blanket. Skip wger (many files have no real license, and some point at commercial sites), ExerciseDB, MuscleWiki, and Bodybuilding.com. Skip CC BY-NC, CC BY-ND, and CC BY-SA.

Save as today: max 720 px wide, `public/ex/<id>/0.jpg`, `1.jpg`, and WebP twins. No hotlinking. Add one sentence to `data/catalog-demos.json` describing what both frames show, and set the plan map to `exact` or `variant` only when the implement matches. Credits: the existing Settings line covers free-exercise-db. Any other file gets its own author and license on that same Settings note.

**c) Pluto**

Pluto may draw decoration only: a square empty-state mark, badges, plate art. It must never draw a person, a body, or a lift, and it must never “correct” a photo. Generated bodies get the form wrong, and a wrong demo is the bug this rule exists to prevent.

**d) PLAN steps**

1. First batch, 8 ids already on disk and not in the 46: `Dumbbell_Flyes`, `Dumbbell_Lunges`, `Bodyweight_Walking_Lunge`, `Russian_Twist`, `Reverse_Flyes`, `Cable_Rear_Delt_Fly`, `Lying_Leg_Curls`, `Split_Squat_with_Dumbbells`. Open both frames. Write keep or none with a reason. Wire a plan row only on keep. Do not touch Plank or the narrow lat pulldown.
2. Tester opens each kept pair in the workout and the sheet, and confirms the empty state on every none.
3. Repeat in batches of 8 for the rest of the 41 plan holes, then the remaining withheld catalog ids.
4. A batch with no honest pair stops. List it for Rabah. No AI fill-in.
