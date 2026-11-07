1. **MAJOR — #6, `effort-iPhone-17-Pro-Max.png`: Effort feedback competes with an automatic exit.**  
   The new question appears just as the workout schedules a return to the exercise list after **2.5 seconds**. Users can be moved away while reading or answering.  
   **File:** [WorkoutScreen.tsx](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:260)  
   **Exact fix:** Keep the completed exercise visible while the optional effort prompt is active. Let answering or an explicit Next/Finish action advance; never make answering mandatory.

2. **MAJOR — #1, `missed-days-iPhone-17-Pro-Max.png`: Navigation overlaps the recommended action.**  
   The bottom of “Pick up where I left off” sits behind the tab bar, reducing its visible tap area. The recovery decision needs more space than the screen provides, even on Max.  
   **Files:** [Coach.module.css](/Users/rabah/projects/anygym/src/screens/today/Coach.module.css), [CoachCard.tsx](/Users/rabah/projects/anygym/src/screens/today/CoachCard.tsx)  
   **Exact fix:** Shorten the heading to “Missed 2 workouts,” explain the choice once, and use “Resume Day 3” and “Restart Day 1” buttons in one row with at least 48 pt targets. Ensure both sit fully above the tab capsule at this viewport.

3. **MAJOR — #5, `settings-coach-iPhone-17-Pro-Max.png`: Current units are invisible.**  
   Neither distance nor body-measurement units have a selected state. Users cannot tell their current settings; both controls look inactive.  
   **File:** [SettingsScreen.tsx](/Users/rabah/projects/anygym/src/screens/SettingsScreen.tsx:211)  
   **Exact fix:** Resolve missing profile values through the app’s existing unit defaults and pass those effective values to `Segmented`. Show a selected pill after loading; persist explicit changes normally.

4. **MAJOR — #6, `effort-iPhone-17-Pro-Max.png`: The swipe hint covers the effort question.**  
   “Swipe a set left to delete it” overlaps “How did that feel?” precisely when the new interaction appears. Two unrelated messages demand attention together.  
   **Files:** [SetTable.tsx](/Users/rabah/projects/anygym/src/screens/workout/SetTable.tsx:519), [ExerciseView.tsx](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:740)  
   **Exact fix:** Suppress the swipe hint while the effort prompt is visible. When shown elsewhere, place it in reserved space rather than a zero-height slot overlapping subsequent content.

5. **POLISH — #6, `effort-iPhone-17-Pro-Max.png`: “PR” requires fitness knowledge.**  
   Beginners must tap an unexplained abbreviation to understand their achievement. SPEC §23 explicitly calls for “New best.”  
   **File:** [PRBadge.tsx](/Users/rabah/projects/anygym/src/ui/PRBadge.tsx)  
   **Exact fix:** Replace the visible “PR” label with “New best,” retaining the detail popover and minimum 44 pt hit area; reserve sufficient row width without shrinking weight or reps.

**Feel score: 6/10.** Strong visual consistency, but overlapping controls, invisible settings, and a timed exit during feedback undermine the premium native feel.

No files changed.