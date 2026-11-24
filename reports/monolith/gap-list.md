# Monolith gap list (M11 step 3, Nov 22)

Written by the orchestrator after looking at the target and at the app as it was on Nov 22 before M10
(221 screenshots in reports/monolith/audit-before/, list in INDEX.md there).

The target: round 2 boards (13 screens and the style sheet, private art repo art/ui-concepts-2/) and G's
store art. In one sentence: giant white type on flat graphite, one screen = one stack of rows split by
hairlines, the main action is big words over an ice blue line, no cards, no boxes, no glass, no round
buttons, small uppercase labels, numbers as the heroes.

Honest limit: I looked closely at the target sheet, the store art and about a dozen of the 221
screenshots (Today, Plans, a workout exercise, History, Settings, Quick, Run start, run summary, share
card, goal screen, data field, tab bar), and judged the other screens from their group. Each M item
below gets its own after picture next to its board before it is called done.

## What is off everywhere (the pattern)

1. Boxes. Every list is a stack of bordered cards (History rows, Plans tiles, Settings groups, Quick
   ideas, set rows). The board has no boxes at all: rows on the page, a hairline between them.
   M10 made the boxes square; they are still boxes.
2. Round controls. Back button, settings gear, the Start button on Run, run controls, info buttons are
   circles. The board has none; M10 squared most, the board would drop the outline entirely.
3. Type is too small and too even. Board: one giant thing per screen (the day name, 185, 3.42,
   47:12), a small uppercase label over it, everything else small. App: many mid sized bold lines.
4. Filled ice blue blocks (unit toggles, the Haptics switch, the Start circle, selected chips).
   Board: ice blue is a line or a small mark, never a filled block.
5. Icons and pictures in rows (3D icons on Quick ideas, run icons in History, tile icons on Plans).
   Board rows are words and numbers only (the goal screen keeps small marks).
6. Tab bar: the board has five words, Today, Plan, Run, History, You. The app has four (Today, Run,
   History, Plans) and Settings behind a gear on Today.

## Per screen

| Screen | Board | What is off now | Fixed by |
|---|---|---|---|
| Today | 01 | plan card in a box, mid size type, rotation dots, gym pill and gear at the top; no weekly ring row | M4 |
| Today sheets (gym, change day, preview, time) | style sheet | boxes inside sheets | M15 |
| Workout day list | 10 (as rows) | boxed exercise rows | M5 |
| Workout exercise | 02 | photo band on top, boxed set rows with four boxed cells each, round check boxes, Finish as a boxed button; board: name, plates, giant weight, plain set lines, "Log set" over a line | M5 |
| Weight sheet, plate diagram, rest timer | 02 and style sheet | boxes, round steppers | M5 |
| Exercise info | 03 | boxed sections; board: two frames, numbered cues, "Back to workout" | M5 |
| Workout finished | 04 | cards and badges; board: "Workout saved", giant time, one new best line, weekly ring, Done | M5 |
| Quick (time, ideas, deck, review) | none (Q3 text) | 3D icons and boxed idea cards; target is eight giant type rows | Q3 to Q6 |
| Run start, goal sheets, run settings, pocket explainer | none | round Start, boxed mode chips, map dot in a round halo, music buttons as boxes | M12 (new) |
| Run countdown | 05 | close; digits a little small on short phones | M2 |
| Run live data | 06 | distance centred with time and pace side by side, three round controls; board: stacked fields, one "Pause" over a line, "Hold to end" as small words | M2 |
| Run live map | 07 | round controls; board: map on top, one stat row, "Pause" over a line | M2 |
| Run locked, pocket dim, paused | style sheet | round controls | M2 |
| Run summary, share card, run detail | 08, 09 | done in M3; left: record cards, back button, the switch | M6 for the leftovers |
| History list | 11 | boxed rows with icons and chevrons; board: plain rows, name left, number right, date small, "Run records and heatmap" as a small link top right | M6 |
| History empty | 12 | board: "No workouts yet" giant, "Start workout" over a line | M6 |
| Workout detail, run records, heatmap | 11 as rows | boxes | M6 |
| Plans list, place plans, plan detail, coach tips | 10 | tiles with icons, plan cards; board: "Plan" giant, week as rows Mon to Sun with today marked | M6 |
| Settings and gyms, gym detail, equipment, backup and restore, report a problem, review | 13 | grouped boxes, filled toggles, round back button; board: "You" giant, plain rows with the value on the right | M14 (new) |
| Onboarding, all 19 steps | store art screen 02 | goal tiles and focus chips are boxes; board: a hairline grid of rows; Continue over a line is already right | M13 (new) |
| First Today and the welcome tour | none | boxed tour bubbles | M13 (new) |
| Every sheet, dialog, toast, load error | style sheet | boxed buttons inside sheets, boxed toast with a filled Undo | M15 (new) |
| Tab bar | all boards | four tabs, no You | M14 (new) |

## Calls I made

- Tab bar becomes the board's five: Today, Plan, Run, History, You. Settings moves from the gear on
  Today to the You tab (same screens, nothing removed). SPEC 19 and 23 get the change first.
- Cards go away app wide: a list is rows with hairlines. Where a group needs a title, a small
  uppercase label, never a box.
- Filled ice blue is only for the one main action line and small marks. Toggles and chips become
  words with an underline or a small square mark.
- Photos stay (exercise demos are content), shown plain, no rounded frame, no overlay gradient.
- The 3D icons on Quick go; the goal icons on onboarding stay (G approved them Nov 19) inside the
  hairline grid.
- Order after M10: M12, M13, M14, M15 are new; then M2, M4, M5, Q3 to Q7, M6, M7 as G set them.

## Second look, Nov 24 (M16): what went live from the Codex builds, next to the boards

Looked at (iPhone 15 Pro, today's build, pictures in reports/monolith/audit-after/): Today, the workout
day list, the exercise screen, the demo viewer, the record celebration, Quick. Not looked at yet:
"Workout saved" (the after picture shows the record celebration, not the saved screen), Plans and
History (item M6 is rebuilding them), You and onboarding (judged when they were built), Run (judged in M2).

| Screen | Board | Verdict | What still differs |
|---|---|---|---|
| Workout day list | 10 (as rows) | close | rows with hairlines and a giant day name: good. Left: a boxed square with a timer icon in front of every row, round status rings at the right (should be a small tick or nothing), the back control is a boxed square, "Start · exercise" is centred with a play icon where the boards put big words at the left over the line |
| Workout exercise | 02 | NOT the board | better than before (set rows are plain with hairlines) but the board's idea is missing: the board has no photo band; it shows the name, the loaded bar drawing, ONE giant weight ("185 lb"), "Last time 180 lb x 8" small, short set lines with a small tick, and "Log set" as big words over the ice blue line. Live has a photo band with a gradient under the name, a table with five columns, a boxed check button on every row (the first one a filled, outlined "Log" box), a boxed "..." button, a boxed back button, a dashed "Add set" box and a boxed coach tip bubble |
| Record celebration | none | off style | a soft round glow behind the number and a boxed, tinted "+90 lb" chip: the two things Monolith removed everywhere else. Flat graphite, the number giant in white or ice blue, "+90 lb" as small ice blue words |
| Today | 01 | close, type too small | the structure is the board's (label, day, minutes, "Start" over the line, rows with hairlines, no card). Left: "Today" is ordinary title size where the board's fills the top (about twice as tall); the day name is mid size and indented where the board's is very large and flush left; the gym is a boxed chip at the top right where the board has a small outlined label under the title; the rotation squares are five tiny boxes (one line of words would do: "Day 1 of 5"); the "Plan saved / Undo" toast is still a box with a filled Undo (M15 fixes it). No weekly ring and no next run line: correct, the app has no such data yet (item 5.1) |
| Exercise info / demo viewer | 03 | NOT the board | live shows only the photo, the name and a boxed close button. Board 03: name large, muscles in one small line, the two frames side by side labelled Start and End, three numbered cues as rows with hairlines, "Back to workout" over the ice blue line. Cues exist only for some exercises (no bad data): show them when the app has them, otherwise the frames and the action |
| Quick (time and ideas) | none (Q3 text) | old look | boxed time chips, boxed idea cards with 3D icons and two muscle figures each; Q3 replaces it with eight giant type rows |

Calls: the exercise screen is the screen G uses most, so it gets its own item (M17) built to board 02,
not a patch; the day list and celebration leftovers go into the same item.
