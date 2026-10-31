**One confirmed UI problem; these captures also leave major verification gaps.** They show `PlatesDevScreen`, so the preset buttons and “No errors” panel are developer controls, not production clutter.

| Severity | Screenshot | What is wrong for the user | Likely component | Exact fix |
|---|---|---|---|---|
| **MAJOR** | **#4 Small-140kg, #6 Small-400lb** | Safari’s bottom toolbar cuts off the plate tray. The lifter cannot see and use the complete controls without scrolling, failing the one-screen requirement. | [PlatesDevScreen.module.css](/Users/rabah/projects/anygym/src/screens/dev/PlatesDevScreen.module.css), [PlateDiagram.module.css](/Users/rabah/projects/anygym/src/components/load/PlateDiagram.module.css) | Move developer presets into a collapsible setup panel. Fit the readout, drawing, breakdown and complete tray within the visible viewport; reduce drawing height and spacing first, preserving ≥44 pt targets. Verify with Safari’s toolbar expanded on SE, then verify the actual workout picker separately. |

**Capture problems prevent approval of the remaining cases:**

- **#2 and #5:** blank pages with Safari’s loading progress visible. These do **not** establish an app crash. Retake after the plate total and tray render; if loading never completes, investigate startup before assigning a component fix.
- **#1 Max-700lb and #3 Max-400lb both display 135 lb; #4 Small-140kg displays 400 lb with lb selected.** Heavy-load zoom and kilogram behavior therefore remain unverified. Check URL initialization in [PlatesDevScreen.tsx](/Users/rabah/projects/anygym/src/screens/dev/PlatesDevScreen.tsx), then make capture automation assert the expected total, selected unit and plate breakdown before saving. The images alone cannot distinguish stale captures from an initialization defect.

**Feel: 6/10 for the rendered views.** Strong number hierarchy and readable plate colors, but SE hides essential controls and the captures cannot substantiate the heavy-load or kg experience.