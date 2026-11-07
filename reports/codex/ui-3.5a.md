| Severity | Screenshot | What is wrong for the user | Likely component | Exact fix |
|---|---|---|---|---|
| **MAJOR** | **#5 — never-gap** | The removal message never names the exercise removed. Another exercise immediately occupies the card, so “Won’t show it again” can appear to refer to **Dumbbell Lateral Raise**, which is still included. The user cannot confidently verify which permanent preference changed. | [QuickScreen.tsx](/Users/rabah/projects/anygym/src/screens/quick/QuickScreen.tsx) — `never()` notice | Include the removed exercise’s name: **“[Exercise name] hidden. No replacement available. Workout now ~23 min.”** Keep **Undo** beside the message and allow the notice to wrap fully. |

No blockers established by these captures. Setup scrolling on SE is permitted by §13.5; it is not an active-workout failure.

**Feel score: 8/10.** Clear hierarchy, readable cards and reachable deck actions; the ambiguous removal feedback weakens confidence when changing a workout.

No files edited.