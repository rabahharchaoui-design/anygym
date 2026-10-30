Two concrete issues; no blockers found. Nothing edited.

| Severity | Screenshot | What is wrong for the user | Likely component | Exact fix |
|---|---|---|---|---|
| **POLISH** | #1 keep, #2 move-on | Each exercise shows one set result without identifying it as the **best set**. Users cannot tell how “8 × 45 lb” relates to their 22–23 saved sets. Completed rows also omit their set count. | `src/screens/workout/FinishScreen.tsx` | Label the result column **“Best set”**. Show logged/planned counts consistently on every planned exercise, including completed ones: “3 of 3 sets,” alongside existing partial counts. |
| **POLISH** | #4 change sheet | The current next day is indicated only by a lime border. Users who cannot distinguish that color must infer which day is selected. | `src/screens/today/ChangeDaySheet.tsx`, `src/screens/TodayScreen.module.css` | Add a visible checkmark to the row matching `state.nextDayIndex`, retaining `aria-current` and the border. Reserve the icon space so names and durations remain aligned. |

**Feel: 8/10** — Clear hierarchy, readable results and a reachable Done action; the summary’s meaning and selection indicator need small clarity fixes. Static screenshots cannot establish motion quality.