1. **MAJOR — #2, `100kg-iPhone-SE.png`: plate choices are hidden.** The tray cuts off 2.5 kg and hides smaller plates, requiring sideways scrolling while lifting.  
   **File:** `src/components/load/PlateDiagram.module.css`  
   **Exact fix:** Replace the fixed 56 px widths for trays with more than six sizes with a layout that exposes every enabled size. When one row cannot preserve 48 pt targets, use two visible rows in the expanded picker and reclaim height above. Remove the edge fade and horizontal scrolling.

2. **MAJOR — #1 and #5, compared with #3: heavier loads look like fewer plates.** At 225 lb, two plates appear on each side; at 315 and 405 lb, they collapse into one plate with a small ×3 or ×4 label. The picture stops matching what the lifter should put on the bar, forcing them to decode counts or read the equation.  
   **Files:** `src/lib/plateLayout.ts`, `src/components/load/BarSvg.tsx`  
   **Exact fix:** Draw every plate individually. Reduce illustrated plate thickness and scale the whole bar uniformly as needed, retaining real bar proportions. Replace the equation with one plain summary: “Each side: 3 × 45 lb.”

3. **MAJOR — #1, #2, #3 and #5: removing one plate pair is undiscoverable.** “Clear” is the only visible removal action. Tapping a sleeve removes the outermost pair, but nothing explains that interaction; the existing first-use hint only explains adding plates.  
   **Files:** `src/components/load/PlateDiagram.tsx`, `src/lib/hints.ts`  
   **Exact fix:** On the first loaded state, show a dismissible hint anchored to a sleeve: “Tap the sleeve to remove one plate from each side.” Preserve the existing large sleeve hit areas.

**Feel score: 6/10.** Strong weight hierarchy and readable controls, but hidden choices and a diagram that requires decoding interrupt the effortless lifting experience.

These are developer-harness screenshots; presets and “No errors” are excluded. Static images cannot establish motion quality or safe-area behavior in the actual workout sheet.