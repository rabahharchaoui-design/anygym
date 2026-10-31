1. **MAJOR — Images #3, #4, #5: editing controls disappear below the footer.** At 100%, the keypad’s bottom row is clipped; at 130%, even 7–9 are cut off. Reps are hidden below it. Scrolling to reps also removes the set number and exercise name (#4), so users lose context while editing.
   
   **Likely files:** `src/screens/settings/ImportSetSheet.tsx`, `src/ui/Sheet.module.css`, `src/components/load/LoadInput.module.css`.
   
   **Exact fix:** Add a compact import-editor layout: keep set/exercise context visible, reduce readout height and vertical gaps, and fit all four keypad rows plus the reps stepper above the footer on SE at 130%. Preserve at least 48 pt targets. Reduce the footer to one short validation line, Save, and a compact restore action.

2. **MAJOR — Images #3, #4, #5: validation gives the wrong explanation.** “Pick a weight this gym can load” implies equipment availability is the problem. Here, 501 exceeds the app’s 500 lb input limit; the cleared field needs a weight. Users cannot tell how to correct either state.
   
   **Likely files:** `src/components/load/ExactWeightInput.tsx`, `src/screens/settings/ImportSetSheet.tsx`.
   
   **Exact fix:** Pass a specific validation reason from the input. For 501, show “Enter a weight up to 500 lb.” For an empty field, show “Enter the weight on your kettlebell.” Keep Save disabled until valid, and label the recovery action “Restore 53 lb.”

**Feel score: 6/10.** The workout table is clear and comfortably sized, but the weight editor requires scrolling and hides essential controls; its error message makes recovery harder. Static screenshots cannot establish motion or haptic quality.