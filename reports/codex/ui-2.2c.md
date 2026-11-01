1. **MAJOR — #3 `card-picked-320-floor`, #6 `empty-iPhone-17-Pro-Max`: muscle selection requires precision taps.** Small regions such as forearms are much narrower than 44 pt. Code also exposes the drawing as an image, with no accessible muscle controls.
   **File:** `src/components/muscles/MuscleMap.tsx`
   **Exact fix:** Add a visible “Choose muscle” control opening named muscle buttons with ≥44 × 44 pt targets and selected states. Keep direct map taps as a shortcut.

2. **MAJOR — #1 and #5, both exercise sheets: instructions require scrolling past the artwork.** The photo and large muscle diagrams consume the initial view; no “How to” cue is visible when the lifter opens the exercise.
   **Files:** `src/components/exercise/ExerciseSheet.tsx`, `ExerciseSheet.module.css`
   **Exact fix:** Order content as exercise name, compact demo, “How to” cues, then muscle map and supplementary details. Size the inline demo and spacing so the available cues fit initially on SE; retain the existing full-screen demo for enlargement.

3. **MAJOR — #4 `list-iPhone-17-Pro-Max`, #5 `exercise-sheet-iPhone-15`: explicit navigation disappears inside scrolling content.** The list’s Close button follows all 21 exercises. The nested sheet’s Back button scrolls with its content and is already visibly clipped in #5. Returning requires discovering the grabber gesture or scrolling.
   **Files:** `src/components/muscles/MuscleExercises.tsx`, `src/components/exercise/ExerciseSheet.tsx`, `src/ui/Sheet.tsx`
   **Exact fix:** Place Back in a fixed sheet header outside `scrollBody`; place Close in the existing pinned `SheetFooter`. Reserve their space and safe-area padding.

4. **POLISH — #3 `card-picked-320-floor`: “Quads · primary” leaves beginners interpreting terminology.** The relationship between the bright and muted muscles is expressed through an unexplained classification.
   **File:** `src/components/muscles/MuscleMap.tsx`
   **Exact fix:** Replace “primary” with “main muscle” and “secondary” with “also works” throughout the selection readout and legend.

**Feel score: 6/10.** Cohesive surfaces and clear exercise rows, but precision tapping and buried instructions/navigation interrupt use while lifting; motion cannot be judged from stills.

No files changed.