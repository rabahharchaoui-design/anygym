1. **MAJOR — #4, iPhone-SE-workout-pr.** Changing reps requires discovering that the number is tappable; the promised plus/minus controls are hidden until then. This adds searching and another tap while lifting. **File:** `src/screens/workout/SetTable.tsx`. **Fix:** show the current set’s `RepsStepper` immediately, with at least 44 pt buttons; collapse upcoming rows and use a compact exercise header to keep it on screen.

2. **MAJOR — #4.** An outlined check under “Done” is the logging action, while a filled check means already logged. A beginner must infer that distinction. **Files:** `src/screens/workout/SetTable.tsx`, `SetTable.module.css`. **Fix:** give the current set a visible “Log set” button; reserve the filled check for completed sets.

3. **POLISH — #4.** The swipe hint sits across “+ Add set,” obscuring another action while pointing vaguely toward the rows. **Files:** `src/screens/workout/SetTable.module.css`, `SetTable.tsx`. **Fix:** place the hint in a dedicated space below the rows, clear of Add set, with its pointer aligned to a deletable row.

4. **POLISH — #4 and #6, Pro-Max-pr-popover.** “PR” requires fitness vocabulary; its plain-language meaning is hidden behind a tap. **Files:** `src/ui/PRBadge.tsx`, `PRBadge.module.css`. **Fix:** display “New best” directly, reserving enough space beside the completed set; retain the comparison details on tap.

5. **POLISH — #1–#3, finish screens.** “2 sets · 185 lb × 10” can read as both sets having those numbers, which would contradict the displayed total of 3,330 lb. The source confirms it shows only the best set. **Files:** `src/screens/workout/FinishScreen.tsx`, `Finish.module.css`. **Fix:** explicitly label it “2 sets · Best: 185 lb × 10,” allowing a second line on narrow screens.

**Feel: 7.5/10.** Clear finish screens and strong visual hierarchy, but the active logger still asks users to discover essential controls.

No files edited. #5 and #6 contain developer previews; their surrounding demo content is not a production-screen finding.