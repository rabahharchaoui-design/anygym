1. **MAJOR — Image #2, `reveal-30-iPhone-SE.png`: false success for a poor time fit.**  
   The user requested 30 minutes; the recommended plan averages 81 minutes, with Day 1 taking about 90. “Your plan,” the lime check and highlighted card signal that their requirements were met. The caveat contradicts that success state.  
   **Likely file:** `src/lib/intake/planPick.ts`  
   **Exact fix:** Include session duration in the match criteria. For this result, remove the success check, title it “Closest plan we have,” and state prominently: “These workouts take 63–98 minutes. You picked 30.”

2. **MAJOR — Image #2, `reveal-30-iPhone-SE.png`: the primary fallback implies a ready short workout.**  
   “Start a quick workout” appears to solve the time mismatch. The implementation starts an empty session with no exercises or duration constraint, leaving the new user to build the workout themselves. Image #5 explains this manual setup; Image #2 does not.  
   **Likely files:** `src/screens/intake/Reveal.tsx`, `src/screens/intake/IntakeScreen.tsx`  
   **Exact fix:** Until a prepared short workout exists, label this action consistently “Build your own workout” and add “Choose exercises as you go.” Reserve “Start a quick workout” for a populated workout that fits the selected time.

3. **POLISH — Image #4, `reveal-weekdays-iPhone-SE.png`: scrolling removes the screen’s identity.**  
   At this scroll position, the header contains only Back and a completed progress bar. The plan title has disappeared, so the user must scroll back to identify the displayed schedule. Section 23 explicitly calls for a compact title after scrolling.  
   **Likely files:** `src/screens/intake/Reveal.tsx`, `src/screens/intake/Intake.module.css`  
   **Exact fix:** As the large heading leaves view, show the selected plan name in a compact, safe-area-aware top bar; restore the large heading when scrolling back.

**Feel score: 7/10.** Strong readability and generous controls, but the misleading time-fit success and unprepared primary fallback weaken trust at the final step.

No files changed.