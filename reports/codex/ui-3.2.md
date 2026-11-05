1. **MAJOR — #2, `pick-sheet-320-floor.png`: footer covers an exercise.** “Bulgarian Split Squat” runs into the bottom actions, leaving a partly obscured selection target.
   **File:** [PickExerciseSheet.tsx](/Users/rabah/projects/anygym/src/screens/settings/PickExerciseSheet.tsx).
   **Exact fix:** Use the existing `Sheet footer` and `SheetFooter` slots for “Keep the name” and “Skip.” Make the exercise list scroll within the remaining height, entirely above the footer.

2. **MAJOR — #4 and #6, both `review-top` screenshots: competing counts obscure what remains.** “2 to check” and “Answer 3 questions” appear together without explaining that they count different things. Users cannot tell how much checking is required before importing.
   **File:** [ImportReview.tsx](/Users/rabah/projects/anygym/src/screens/settings/ImportReview.tsx).
   **Exact fix:** State both categories explicitly: “3 exercise questions · 2 sets to check.” Keep the button “Answer 3 questions” while those questions remain; afterward, retain the separate set warning until addressed.

3. **MAJOR — #6, `review-top-Galaxy-compact.png`: the ambiguous set has no visible correction action.** “Hard to read: 6 or 8” explains the problem, but the row looks like a warning rather than an editable control. Users must discover that tapping it opens the editor.
   **Files:** [ImportReview.tsx](/Users/rabah/projects/anygym/src/screens/settings/ImportReview.tsx), [Import.module.css](/Users/rabah/projects/anygym/src/screens/settings/Import.module.css).
   **Exact fix:** Add a visible “Check reps” label and chevron within the existing full-row button. Preserve its minimum 48 pt target.

4. **MAJOR — #2, `pick-sheet-320-floor.png`: “Keep the name” hides a meaningful consequence.** Users can save “Moon press,” but nothing visible explains that it will lack exercise photos and muscle information. That explanation currently exists in an accessible label and the no-results state, not this state.
   **File:** [PickExerciseSheet.tsx](/Users/rabah/projects/anygym/src/screens/settings/PickExerciseSheet.tsx).
   **Exact fix:** Add persistent helper text beside the action: “Save as ‘Moon press’ without exercise photos or muscle info.” Keep it outside the scrolling results.

5. **POLISH — #2, `pick-sheet-320-floor.png`: “In your plans” overstates personalization.** The component lists all `PLAN_EXERCISES` without checking the user’s plans. This can send users searching for an exercise in a plan where it does not exist.
   **File:** [PickExerciseSheet.tsx](/Users/rabah/projects/anygym/src/screens/settings/PickExerciseSheet.tsx).
   **Exact fix:** Rename the section “Exercises,” or filter it to exercises actually present in the user’s saved plans before retaining the current heading.

**Feel score: 7/10.** Strong visual hierarchy and readable targets, but obscured picker content and unclear review actions keep it below the premium native bar.

No files edited.