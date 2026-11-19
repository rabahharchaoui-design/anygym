# Monolith audit: hard coded colors and corners (PLAN M0, Nov 19)

Made on branch build-m0 before the token change. Rules: SPEC 10 (Monolith). Guards: src/styles/__tests__/colorGuard.test.ts (colors, since 3.5t) and src/styles/__tests__/radiusGuard.test.ts (corners, new in M0, allow list in radiusAllow.ts that may only shrink).

## Summary

- Raw colors outside src/styles/tokens.css: 116 values in 6 files, all in the color guard's fixed ink allow list (real world paint and third party art). No raw color in any screen or src/ui file. src/styles/base.css has none.
- Raw corners outside src/styles/tokens.css and base.css: 214 declarations in 96 files. Of these, 83 use var(--radius-pill), which M0 removes (they fall back to square corners until their M item), and 131 are raw lengths (px).
- Radius guard allow list: 96 files (today's offenders). Each M item that restyles a screen removes its files from the list.
- Not counted: border-radius 50% (dots, rings, the GPS dot: round in real life), inherit and 0; SVG rx inside drawings (picture geometry: src/ui/art/Scene.tsx, src/ui/EmptyState.tsx, src/ui/art/passport/Leather.tsx, src/screens/intake/FocusIcons.tsx, EquipmentArt.tsx); WelcomeTour's computed borderRadius (copies the radius of the thing it highlights).

Token mapping used below: 1 to 2 px becomes --radius-sm (2 px, chips and small frames), 3 to 9 px --radius-md (4 px), 10 px and up --radius-lg (4 px, the old cards; Monolith prefers no card at all, so 0 or a hairline where the M item drops the card). var(--radius-pill) becomes --radius-sm for chips and 0 for buttons and bars (buttons become underline buttons, SPEC 23.2).

## Colors (fixed inks, stay as they are)

| file | values | token |
|---|---|---|
| src/components/load/BarSvg.tsx | 38 values | none: steel of the drawn barbell (color guard ALLOW) |
| src/lib/bodyArt/femaleBack.ts | 14 values | none: third party body drawing data (MIT); painted from tokens at run time (color guard ALLOW) |
| src/lib/bodyArt/femaleFront.ts | 19 values | none: third party body drawing data (MIT); painted from tokens at run time (color guard ALLOW) |
| src/lib/bodyArt/maleBack.ts | 16 values | none: third party body drawing data (MIT); painted from tokens at run time (color guard ALLOW) |
| src/lib/bodyArt/maleFront.ts | 19 values | none: third party body drawing data (MIT); painted from tokens at run time (color guard ALLOW) |
| src/lib/plateColors.ts | 10 values | none: real plate paint (and SHEET_BG, equal to --sheet-bg) (color guard ALLOW) |

## Corners

| file:line | value | should use |
|---|---|---|
| src/components/LoadError.module.css:22 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/MusicLinks.module.css:10 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/MusicLinks.module.css:19 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/deck/Curate.module.css:98 | `20px` | --radius-lg (4 px, cards and frames) or 0 |
| src/components/deck/Curate.module.css:145 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/deck/Deck.module.css:46 | `28px` | --radius-lg (4 px, cards and frames) or 0 |
| src/components/deck/Deck.module.css:88 | `28px` | --radius-lg (4 px, cards and frames) or 0 |
| src/components/deck/Deck.module.css:226 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/deck/Deck.module.css:271 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/deck/Deck.module.css:323 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/deck/Deck.module.css:366 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/exercise/DemoViewer.module.css:61 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/exercise/FormDemo.module.css:31 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/components/gym/Gym.module.css:34 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/gym/Gym.module.css:120 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/components/gym/Gym.module.css:142 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/components/gym/Gym.module.css:231 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/components/gym/Gym.module.css:271 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/components/gym/Gym.module.css:313 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/hint/Hint.module.css:15 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/info/Info.module.css:13 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/info/Info.module.css:78 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/info/Info.module.css:91 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/load/BarQuestion.module.css:7 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/components/load/BarQuestion.module.css:56 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/components/load/BarQuestion.module.css:78 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/components/load/EquipmentWeightSheet.module.css:64 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/load/EquipmentWeightSheet.module.css:79 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/load/LoadInput.module.css:103 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/load/PlateDiagram.module.css:263 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/load/PlateDiagram.module.css:410 | `2px` | --radius-sm (2 px) |
| src/components/load/StackSelector.module.css:61 | `9px` | --radius-md (4 px) |
| src/components/load/StackSelector.module.css:116 | `5px` | --radius-md (4 px) |
| src/components/load/TypeItSheet.module.css:67 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/components/muscles/MuscleMap.module.css:194 | `3px` | --radius-md (4 px) |
| src/components/muscles/MuscleMap.module.css:314 | `999px` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/HistoryScreen.tsx:65 | `radius={20}` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/TodayScreen.module.css:16 | `28px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/TodayScreen.module.css:49 | `28px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/TodayScreen.module.css:79 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/TodayScreen.module.css:104 | `28px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/TodayScreen.module.css:132 | `22px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/TodayScreen.module.css:145 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/TodayScreen.module.css:182 | `22px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/TodayScreen.module.css:193 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/TodayScreen.module.css:313 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/TodayScreen.module.css:405 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/TodayScreen.tsx:244 | `radius={28}` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/dev/LoadsDevScreen.module.css:34 | `20px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/dev/LoadsDevScreen.module.css:41 | `20px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/dev/LoadsDevScreen.module.css:78 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/dev/PlatesDevScreen.module.css:30 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/dev/PlatesDevScreen.module.css:37 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/dev/PlatesDevScreen.module.css:56 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/dev/PlatesDevScreen.module.css:71 | `20px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/dev/UiDevScreen.module.css:58 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/dev/ViewportDevScreen.module.css:11 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/history/History.module.css:94 | `20px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/history/History.module.css:129 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/history/HistoryDetail.tsx:48 | `radius={20}` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/history/RunDetail.tsx:39 | `radius={20}` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/history/RunRecords.tsx:36 | `radius={20}` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/Focus.module.css:160 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/Intake.module.css:54 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/intake/Intake.module.css:89 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/intake/IntakeEquipment.module.css:69 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/intake/IntakeEquipment.module.css:143 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/IntakeFields.module.css:6 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/IntakeFields.module.css:39 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/IntakeFields.module.css:137 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/IntakeFields.module.css:151 | `2px` | --radius-sm (2 px) |
| src/screens/intake/IntakeNoPlan.module.css:14 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/IntakeNoPlan.module.css:62 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/IntakeRange.module.css:10 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/IntakeRange.module.css:44 | `12px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/IntakeReveal.module.css:38 | `22px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/IntakeReveal.module.css:119 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/IntakeReveal.module.css:252 | `12px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/intake/IntakeSoFar.module.css:89 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/intake/Schedule.module.css:43 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/plans/CoachTips.module.css:111 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/plans/Plans.module.css:24 | `24px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/plans/Plans.module.css:55 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/plans/Plans.module.css:248 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/plans/Plans.module.css:260 | `2px` | --radius-sm (2 px) |
| src/screens/plans/Plans.module.css:300 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/plans/Plans.module.css:364 | `10px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/quick/ConceptCard.module.css:7 | `24px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/quick/ConceptCard.module.css:19 | `24px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/quick/IdeaSheet.module.css:18 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/quick/Quick.module.css:123 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/quick/Quick.module.css:159 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/quick/Quick.module.css:224 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/quick/Quick.module.css:247 | `22px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/quick/Quick.module.css:316 | `24px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/quick/Quick.module.css:344 | `20px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/quick/QuickScreen.tsx:306 | `radius={24}` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/review/CandidateReview.module.css:62 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/review/CandidateReview.module.css:212 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/review/Fit.module.css:82 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/review/Fit.module.css:112 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/review/Fit.module.css:181 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/review/ReviewGrid.module.css:39 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/review/ReviewGrid.module.css:55 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/review/ReviewGrid.module.css:120 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/run/Countdown.module.css:154 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/run/Live.module.css:93 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/run/Live.module.css:220 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/run/Run.module.css:86 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/run/Run.module.css:95 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/settings/AutoLevelUp.module.css:32 | `20px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/AutoLevelUp.module.css:63 | `20px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/GymDetail.tsx:94 | `radius={20}` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/GymEquipment.tsx:46 | `radius={20}` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/Gyms.module.css:28 | `12px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/Gyms.module.css:76 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/GymsScreen.tsx:92 | `radius={20}` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/Import.module.css:88 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/settings/Import.module.css:97 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/settings/Import.module.css:203 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/settings/Import.module.css:228 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/settings/Import.module.css:301 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/settings/Import.module.css:326 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/Import.module.css:419 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/settings/ImportReview.tsx:70 | `radius={20}` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/ReportProblem.module.css:27 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/ReportProblem.module.css:53 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/settings/ReportProblem.module.css:82 | `12px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/Restore.module.css:34 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/Restore.module.css:93 | `20px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/settings/Restore.module.css:128 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/today/Coach.module.css:10 | `24px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/today/Coach.module.css:38 | `8px` | --radius-md (4 px) |
| src/screens/today/Coach.module.css:165 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/today/Coach.module.css:296 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/today/Fresh.module.css:11 | `24px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/today/Fresh.module.css:115 | `3px` | --radius-md (4 px) |
| src/screens/today/WelcomeTour.module.css:77 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/DayList.module.css:137 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/DayList.module.css:236 | `2px` | --radius-sm (2 px) |
| src/screens/workout/DayList.module.css:344 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/Effort.module.css:10 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/Effort.module.css:59 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/ExerciseHead.module.css:191 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/ExerciseMenu.module.css:22 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/ExerciseMenu.module.css:84 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/ExerciseView.module.css:49 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/ExerciseView.module.css:58 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/Finish.module.css:87 | `22px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/Finish.module.css:157 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/Finish.module.css:294 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/FinishScreen.tsx:158 | `radius={22}` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/Picker.module.css:21 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/Picker.module.css:48 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/Picker.module.css:183 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/RestDock.module.css:53 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/SetRow.module.css:13 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/SetRow.module.css:22 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/SetRow.module.css:54 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/SetRowParts.module.css:13 | `12px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/SetRowParts.module.css:28 | `6px` | --radius-md (4 px) |
| src/screens/workout/SetRowParts.module.css:73 | `12px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/SetRowParts.module.css:95 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/SetRowParts.module.css:110 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/SetTable.module.css:91 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/SetTable.module.css:217 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/Sheets.module.css:17 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/Sheets.module.css:35 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/Sheets.module.css:46 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/SwapSheet.module.css:38 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/SwapSheet.module.css:88 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/Thumb.module.css:9 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/Thumb.module.css:18 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/TimeBudgetSheet.module.css:32 | `20px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/UpNext.module.css:7 | `22px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/UpNext.module.css:36 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/screens/workout/WorkoutDock.module.css:20 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/WorkoutDock.module.css:79 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/screens/workout/WorkoutHeader.module.css:60 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/Button.module.css:10 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/Chip.module.css:9 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/Chip.module.css:113 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/Chip.module.css:180 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/ChoiceCard.module.css:10 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/ChoiceCard.module.css:41 | `12px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/ChoiceCard.module.css:141 | `12px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/EmptyState.module.css:8 | `24px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/PRBadge.module.css:9 | `12px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/PRBadge.module.css:25 | `7px` | --radius-md (4 px) |
| src/ui/PRBadge.module.css:83 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/ResumeBar.module.css:23 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/ResumeBar.module.css:57 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/Sheet.module.css:40 | `28px 28px 0 0` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/Sheet.module.css:137 | `3px` | --radius-md (4 px) |
| src/ui/Sheet.module.css:227 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/SlidingToggle.module.css:11 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/SlidingToggle.module.css:31 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/SlidingToggle.module.css:52 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/SummaryRow.module.css:10 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/Switch.module.css:49 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/TabBar.module.css:56 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/TabBar.module.css:76 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/TabBar.module.css:105 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/Toast.module.css:21 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/Toast.module.css:78 | `var(--radius-pill)` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/WheelColumn.module.css:16 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/WheelColumn.module.css:50 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/art/passport/passport.module.css:16 | `14px 18px 18px 14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/art/passport/passport.module.css:66 | `14px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/card.module.css:6 | `20px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/celebrate/celebrate.module.css:21 | `18px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/celebrate/celebrate.module.css:32 | `16px` | --radius-lg (4 px, cards and frames) or 0 |
| src/ui/celebrate/celebrate.module.css:94 | `999px` | --radius-sm (chips, 2 px) or 0; a true dot uses 50% |
| src/ui/celebrate/fx/fx.module.css:51 | `26px` | --radius-lg (4 px, cards and frames) or 0 |
