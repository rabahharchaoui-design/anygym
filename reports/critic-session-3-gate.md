BLOCKERS: 5

# Session 3 merge gate critique (first time user, never lifted)

Build: ./dist on branch s3-plans, served with `vite preview --port 4188`, Playwright WebKit as iPhone 17 Pro Max (440x956), iPhone SE (375x667) and 360x640. Screenshots: /tmp/critic-gate/shots/, videos: /tmp/critic-gate/videos/, notes: /tmp/critic-gate/status.md. Intake answers used: Build muscle, Brand new, 3 days, 45 min, Full gym, Mix, with and without focus picks.

## Ranked list (worst first)

1. **BLOCKER · Weight sheet, plate loaded machine (Machine Seated Calf Raise) · iPhone SE.** Before the user has answered "Does this machine load on one side or both?", tapping one 45 plate already shows **"90 lb"** with "Each side 45", while the drawing shows a single plate on a single horn. The app shows a number it does not know yet (SPEC 0.1). Shot: calf-se-c-45.png. Fix: until the side question is answered, show "— lb" (or "45 lb on this side") and keep Done disabled with "Answer one side or both first"; never double before the answer.

2. **BLOCKER · Your plan / Plans tab, plan built from intake · iPhone 17 Pro Max.** A "Brand new" lifter with no focus pick gets the machine first "Beginner Full Body 3 Day" ("Start light and learn the moves"). The same person who also taps one or two focus areas (Lats, Biceps) gets "3 Day Full Body" with **Barbell Back Squat, Deadlift, Wide Grip Pull Up, Barbell Bent Over Row**, and Day 1 and Day 3 each carry two curl variants. Picking a body part silently turns a beginner plan into an advanced barbell plan. Shots: plans-max-b-plan.png, set2-se-e-squat-kg.png (Barbell Back Squat for a brand new user). This is about which moves get picked, not the focus set numbers already reviewed. Fix: build the focus plan on top of the beginner template when experience is "Brand new" or "A few months" (machines first, no deadlift or unassisted pull ups), and never put two variants of the same move on one day.

3. **BLOCKER · Exercise screen, 2nd exercise of the app's own Day 1 (Machine Bench Press) · iPhone 17 Pro Max.** Opening it raises "Tell AnyGym how this one is loaded, once. **How do you load this?**" with 7 choices, including "Plates on a bar / Barbell", "Dumbbells", "Timed / Hold or stretch". The app picked this exercise for a beginner and then asks the beginner what kind of equipment it is. Shot: wk4-max-c-ex2.png. Fix: for an exercise named "Machine ...", offer only the two machine answers ("Pin and weight stack" / "Plates on the machine"), each with a small picture, or default to the stack and let them change it.

4. **BLOCKER · Plan screen, Coach tips · iPhone 17 Pro Max.** The tip says **"Shoulders get one session a week"**, but the same plan has Dumbbell Lateral Raise on Day 1 and Overhead Press on Day 2. It also says "Adds 3 sets of each on another day" when the tip moves one exercise. The tip is wrong. Shot: plans-max-c-tips.png. Fix: count side and front shoulder work together (or name the part: "Front shoulders get one session a week"), and use "of it" when there is one move. After Apply, change the title to the result ("Shoulders now twice a week").

5. **BLOCKER · Weight sheet on a short phone · 360x640.** The plate tray (45, 35, 25, 10, 5, 2.5) is cut off under the Done bar. Only the top half of each plate button shows, behind a fade. This is the main control of the sheet. Shot: quick2-and-e-calf-sheet.png. Fix: when the starting weight or side question card is showing, shrink the drawing (or let the sheet body scroll above a fixed Done) so the full plate row always sits above Done. Add a 360x640 layout check for this exact state.

6. **POLISH · Exercise screen after a unit switch · iPhone SE.** "Beat last time: 11 reps at 47.5 kg · **≈ 47.5 kg, last time 105 lb**" says 47.5 kg twice. Under it, "Last time (today): 95 lb × 10 · 105 lb × 8 · 105 lb × 8" repeats the Last time column and wraps to a lone "8". The target also jumps from 8 to 11 reps. Shots: set2-se-e-squat-kg.png, wk6-max-d-squat-again.png. Fix: write one line, "Beat last time: 11 reps at 47.5 kg (was 105 lb)". Drop the "Last time (today)" line, because the column already shows it.

7. **POLISH · Plan screen after Apply · iPhone 17 Pro Max.** Applying a tip to your own plan quietly makes "3 Day Full Body (coach tuned)", which is not active until you also tap "Use this plan". Two Undo buttons show at once (the card and the toast), and the toast covers "Hide tips for this plan". Shots: plans2-max-a-applied.png, plans2-max-d-applyall.png. Fix: when the plan is already yours, apply the tip in place and show one Undo (the toast). Keep "Use this plan" only for plans that are not active. Lift the toast above the CTA.

8. **POLISH · Exercise screen · all phones.** In the middle of the first set, a large "Which body should the map show? Male / Female" card sits under the set table. It is a setup question during the zero thinking screen. Shots: wk-max-02-exercise.png, wk-max-07-rest.png. Fix: default to the intake answer (or Male) and move the choice to Settings, which already has it.

9. **POLISH · Rest bar · iPhone 17 Pro Max.** The rolling digits leave clipped ghost glyphs: half a "2:2" under "2:28", and a dash above "2:29". The ring does not show progress in the frames captured. Shots: wk-max-07-rest.png, wk-max-08-three-done.png. Fix: clip the digit roll to the number box (overflow hidden) and drive the ring from the remaining time.

10. **POLISH · Stretches in plans and workouts · iPhone 17 Pro Max, SE.** One sided stretches read "Static Quadricep Stretch 45 sec" and "Static Pigeon Stretch 45 sec" with no "each side". In a quick workout the pigeon stretch reads "3 sets" with Hold "Start" and no target time. Shots: plans2-max-b-five.png, quick2-and-c-list.png, calf-se-f-pigeon.png. Fix: show "45 sec each side" for unilateral holds, and give a default hold (for example 30 sec each side) when the stretch comes from the picker.

11. **POLISH · 3D icons, consistency · iPhone 17 Pro Max, 360x640.** The 3D icons on goal, place and quick style cards look good. Next to them, these flat icons look unfinished:
    - the focus tiles use thin line icons (intake-max-flexible-02-focus.png),
    - the Plans tab "Where you train" tiles use flat line icons for the same places that were 3D one minute earlier (plans-max-a-tab.png),
    - "Your plan" has a flat clipboard (intake-max-flexible-reveal-full.png),
    - on Quick workout the "Your plan" card has no icon while "Easy start" and "Pairs" do, and those icons are jammed into the top left corner (quick-and-a-build.png).

    Fix: use the same 3D place icons on the Plans tab, give the "Your plan" card and the reveal header a 3D icon, and inset the card icons by the card padding.

12. **POLISH · Finish screen · iPhone 17 Pro Max.** The three tiles have uneven widths: "<1 min Time" wide, "3 Sets" narrow, "2,630 lb Total lifted" widest. "1 of 7 lifts finished" says "lifts" where the rest of the app says exercises. Shot: wk5-max-h-finish.png. Fix: use a three column grid with equal widths, and "1 of 7 exercises done".

13. **POLISH · Day list and exercise header · iPhone 17 Pro Max.** The first exercise of the beginner's first workout, Smith Machine Squat, has a grey dumbbell placeholder instead of a photo, and so does Standing Biceps Cable Curl. The floating "Start · Machine Bench Press" covers "Pair: back to back / Rest 60 s" text. Shots: wk-max-01-after-start.png, wk4-max-b-list-after-ex1.png. Fix: use a Smith machine drawing (not a dumbbell) as the honest placeholder, and add bottom padding equal to the floating button height.

14. **POLISH · Words a beginner will not get · all phones.**
    - "150 s rest" and "120 s rest" (wk-max-01-after-start.png): say "2:30 rest".
    - "This rotation" (today-max-flexible-first.png): say "Your 3 workouts".
    - "Your plan so far 45 min +3" (intake-max-flexible-09-place.png): say "+3 more" or list them.
    - "Grip · None yet" (intake-max-flexible-02-focus.png): say "Not in plans yet".
    - "0 lb + start" on the calf sheet (quick2-and-e-calf-sheet.png): say "0 lb plus the machine's start weight".

15. **POLISH · Small details · iPhone SE.**
    - The weight sheet title "Set 1" is cut under the grabber when the side question card shows (calf-se-c-45.png).
    - The fixed schedule rest day shows "This week" dots 1 2 3 with no weekday names (sched-se-fixed-rest-today.png).
    - "Backup ready" is a small toast that covers the Back up row text (set2-se-c-backup.png).
    - Set 1 reps start at 10 while sets 2 and 3 start at 8 before the test set (wk-max-02-exercise.png).

    Fix: keep the title row out of the sheet's scroll area, put Tue/Thu/Sat under the dots, put the toast above the list, and prefill all rows the same.

## Not fully covered

- Coach cards (Level up, Not now, Missed N) and History "Not sure" marks on imported sets were not reached before the session was interrupted.
- The Restore tap showed no visible change in headless WebKit (it probably opens a file picker), so Restore was not judged.
- Videos were recorded but not reviewed frame by frame. In the logs, tap to feedback on Log set took 30 ms.
- Every run logged "Refused to apply a stylesheet ... Content-Security-Policy" console errors. The source was not isolated: it may be the test harness, or the app.
- On the 360x640 run the phone was simulated with the iPhone SE profile in WebKit at 360x640.

## What is genuinely good

- Offline works. After the first load, going offline and starting the five day plan showed every exercise photo (10 of 10 loaded; offline-max-a-list.png). The intake asks short, all-tap questions, and its 3D goal and place icons look premium (intake-max-flexible-00-goal.png, 09-place.png).
- The logging loop is fast and honest:
  - "Start light: 10 easy reps, then we'll set your number" is followed by "Your number: 105 lb for the rest of your sets".
  - The rest timer starts on its own.
  - "Nice. Next: Machine Bench Press" tells you where to go.
  - Finish leads to a calm "First workout 2,630 lb lifted today" moment.
- The schedule states read clearly. "Rest day / Next: tomorrow, Day 1" with "Train today anyway", and "Done for today · Quads, glutes and hamstrings trained today · Ready Wednesday evening" are the right words for a beginner (sched-se-fixed-rest-today.png, sched-se-recovery.png).
