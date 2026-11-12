# Full matrix after PLAN 3.6x (Nov 12)

8029 tests on seven phones: 7373 passed, 492 skipped, 164 failed. iPhone 15 and iPhone 17 Pro Max are clean on a rerun; iPhone SE has 2 failures; the rest are on Pixel 7, Galaxy compact, Small Android and the 320 floor.

None of this comes from the 3.6x reorganization: the same 38 spec files on the build from before 3.6x (checkpoint 3.6y) fail 160 times on the Android and 320 profiles against 159 after, 147 of them the very same tests, about a dozen flipping each way (timing). The debt built up since the last full matrix because items 3.5f to 3.6h were verified on iPhone 15 and the smoke set only.

`same` = also failed on the pre 3.6x build. `flip` = failed only in this run (timing or flaky; several passed on a calm rerun).

## tests/art-3.6h.spec.ts
- :137 [Galaxy compact] same: 3.6h art pack › effects: each one runs with p90 under 20 ms
- :137 [Pixel 7] same: 3.6h art pack › effects: each one runs with p90 under 20 ms
- :137 [Small Android] same: 3.6h art pack › effects: each one runs with p90 under 20 ms
- :216 [Galaxy compact] same: 3.6h art pack › the first paint of Today asks for no art chunk
- :216 [Small Android] same: 3.6h art pack › the first paint of Today asks for no art chunk

## tests/celebrate-3.6b.spec.ts
- :46 [Galaxy compact] flip: 3.6b celebrations › SMALL: a heavier set shows New best in its row, the check draws, and the next tap is never
- :140 [Galaxy compact] same: 3.6b celebrations › two records on main lifts: one BIG (the bigger gain), the other MEDIUM; nothing moves when
- :140 [Pixel 7] same: 3.6b celebrations › two records on main lifts: one BIG (the bigger gain), the other MEDIUM; nothing moves when
- :140 [Small Android] same: 3.6b celebrations › two records on main lifts: one BIG (the bigger gain), the other MEDIUM; nothing moves when

## tests/codex-2.0k.spec.ts
- :49 [320 floor] same: (5) the muscle list keeps Close pinned, the exercise sheet keeps Back and Close pinned, How to is in the first

## tests/codex-se-edit-finish.spec.ts
- :25 [Pixel 7] flip: SE: five-row workout keeps inline reps controls and current check exposed during rest without scrolling

## tests/critic-1.7e.spec.ts
- :303 [320 floor] same: first time with weights: "Pick" cells and one first time line under the rows

## tests/curate-3.5f-r3.spec.ts
- :131 [320 floor] same: 3.5f round 3: the intake cards at 130% text › full: Not sure, Never and Love stay above Continue, the photo st
- :131 [320 floor] same: 3.5f round 3: the intake cards at 130% text › hotel: Not sure, Never and Love stay above Continue, the photo s
- :131 [Small Android] same: 3.5f round 3: the intake cards at 130% text › full: Not sure, Never and Love stay above Continue, the photo st
- :131 [Small Android] same: 3.5f round 3: the intake cards at 130% text › hotel: Not sure, Never and Love stay above Continue, the photo s
- :179 [Galaxy compact] same: 3.5f round 3: the Preview is what you get › a plan day that opens with stretches says so on Ready to go, and S
- :179 [Pixel 7] same: 3.5f round 3: the Preview is what you get › a plan day that opens with stretches says so on Ready to go, and S
- :179 [Small Android] same: 3.5f round 3: the Preview is what you get › a plan day that opens with stretches says so on Ready to go, and S

## tests/curate-3.5f.spec.ts
- :99 [Galaxy compact] same: 3.5f the deck in Quick workout › many lefts: from the third left on a slot the line offers "Show me 6", a tap 
- :170 [Galaxy compact] same: 3.5f the deck in Quick workout › 3 lefts on one move across workouts ask once "Hide it for good?"
- :510 [320 floor] same: 3.5f Replace › the options as a deck: Next shows the next, 3 lefts bring Show all forward, a tap in the list s
- :510 [Galaxy compact] same: 3.5f Replace › the options as a deck: Next shows the next, 3 lefts bring Show all forward, a tap in the list s
- :510 [Pixel 7] same: 3.5f Replace › the options as a deck: Next shows the next, 3 lefts bring Show all forward, a tap in the list s
- :510 [Small Android] same: 3.5f Replace › the options as a deck: Next shows the next, 3 lefts bring Show all forward, a tap in the list s

## tests/exercise-screen-2.2b.spec.ts
- :50 [320 floor] same: demo exercise: hero on top, the whole table in the first screen, muscles and tips below
- :187 [320 floor] same: swipe down closes the full screen demo
- :203 [320 floor] same: three set exact match: the whole table and every ✓ fit too
- :261 [320 floor] same: reduced motion › the hero shows the start photo still

## tests/exercise-sheet-2.3.spec.ts
- :44 [320 floor] same: variant: photos, the map caveat as a note, numbered cues, watch out and good for, all on the page
- :77 [320 floor] same: the crossfade timing is 1.35 s, 0.15 s, 1.35 s, 0.15 s
- :91 [320 floor] same: exact: demo, muscles, cues and good for on the page
- :126 [320 floor] same: reduced motion › the full screen demo shows the start photo still

## tests/foundation-2.2e.spec.ts
- :428 [Galaxy compact] same: speed budget (PLAN 2.2e point 4) › press feedback under 100 ms: button, choice card, toggle @matrix
- :428 [Pixel 7] same: speed budget (PLAN 2.2e point 4) › press feedback under 100 ms: button, choice card, toggle @matrix
- :428 [Small Android] same: speed budget (PLAN 2.2e point 4) › press feedback under 100 ms: button, choice card, toggle @matrix
- :599 [Galaxy compact] same: speed budget (PLAN 2.2e point 4) › round 2 (critic B1): reduced motion: the pill jumps to the tab at once
- :599 [Small Android] same: speed budget (PLAN 2.2e point 4) › round 2 (critic B1): reduced motion: the pill jumps to the tab at once
- :611 [Galaxy compact] same: speed budget (PLAN 2.2e point 4) › round 3 (critic B1): from the tap, a tab switch and a PR check on a plan da
- :611 [Pixel 7] same: speed budget (PLAN 2.2e point 4) › round 3 (critic B1): from the tap, a tab switch and a PR check on a plan da
- :611 [Small Android] same: speed budget (PLAN 2.2e point 4) › round 3 (critic B1): from the tap, a tab switch and a PR check on a plan da

## tests/gate-3.5g.spec.ts
- :114 [Pixel 7] flip: 3.5g gate fixes › (3) after each log the current row sits above the rest bar; warm ups fold; the hero is small

## tests/intake-3.3.spec.ts
- :890 [Galaxy compact] same: B4: love and never share one optional screen and stay separate answers
- :890 [Pixel 7] same: B4: love and never share one optional screen and stay separate answers
- :890 [Small Android] same: B4: love and never share one optional screen and stay separate answers

## tests/intake-3.5u.spec.ts
- :128 [320 floor] same: the welcome: three steps, each spotlight on its element; Done persists; a reload never shows it again @matrix
- :128 [Galaxy compact] same: the welcome: three steps, each spotlight on its element; Done persists; a reload never shows it again @matrix
- :128 [Small Android] same: the welcome: three steps, each spotlight on its element; Done persists; a reload never shows it again @matrix
- :183 [320 floor] same: Skip ends it for good; a tap outside the light moves on
- :212 [320 floor] same: reduced motion: the same three steps, the light simply there
- :212 [Galaxy compact] same: reduced motion: the same three steps, the light simply there
- :212 [Pixel 7] same: reduced motion: the same three steps, the light simply there
- :212 [Small Android] same: reduced motion: the same three steps, the light simply there

## tests/motion-3.5w.spec.ts
- :411 [Pixel 7] same: round 2: past the intake › B1 a tab switch: the bar is pixel stable on every frame, no page snapshot, the pill
- :411 [Small Android] same: round 2: past the intake › B1 a tab switch: the bar is pixel stable on every frame, no page snapshot, the pill
- :485 [Galaxy compact] same: round 2: past the intake › B2 closing a sheet: the app behind comes forward over about 200 ms, never in one fr
- :485 [Pixel 7] same: round 2: past the intake › B2 closing a sheet: the app behind comes forward over about 200 ms, never in one fr
- :485 [Small Android] same: round 2: past the intake › B2 closing a sheet: the app behind comes forward over about 200 ms, never in one fr
- :506 [Galaxy compact] same: round 2: past the intake › B3 logging a set: the next check does not move from 100 ms to 1500 ms after the tap
- :506 [Pixel 7] same: round 2: past the intake › B3 logging a set: the next check does not move from 100 ms to 1500 ms after the tap
- :506 [Small Android] same: round 2: past the intake › B3 logging a set: the next check does not move from 100 ms to 1500 ms after the tap
- :535 [Galaxy compact] same: round 2: past the intake › M4 Quick workout: an idea card answers the press and grows into the deck (nav.ts ex
- :535 [Pixel 7] same: round 2: past the intake › M4 Quick workout: an idea card answers the press and grows into the deck (nav.ts ex
- :535 [Small Android] same: round 2: past the intake › M4 Quick workout: an idea card answers the press and grows into the deck (nav.ts ex

## tests/picture-2.0d.spec.ts
- :612 [320 floor] same: 2.0d critic r3: 320 x 568 sheets fit @matrix › import editor: the body never scrolls for any kind of set, lb g

## tests/plates.spec.ts
- :128 [320 floor] same: Type it solves exact and closest ────────────────────

## tests/polish-2.2d.spec.ts
- :211 [Galaxy compact] same: speed: a ✓ paints within 100 ms, no layout shift, smooth check and sheet @matrix
- :211 [Pixel 7] same: speed: a ✓ paints within 100 ms, no layout shift, smooth check and sheet @matrix
- :211 [Small Android] same: speed: a ✓ paints within 100 ms, no layout shift, smooth check and sheet @matrix
- :453 [Galaxy compact] same: screen changes: open and back settle in under 350 ms (round 3, B1) @matrix
- :453 [Pixel 7] same: screen changes: open and back settle in under 350 ms (round 3, B1) @matrix
- :453 [Small Android] same: screen changes: open and back settle in under 350 ms (round 3, B1) @matrix
- :453 [iPhone 17 Pro Max] same: screen changes: open and back settle in under 350 ms (round 3, B1) @matrix

## tests/quick-3.5a.spec.ts
- :52 [Galaxy compact] flip: Quick workout builds it for you › curating: swipe right through every card, then Start workout, in under 30 s
- :166 [Pixel 7] same: Quick workout builds it for you › swipe right keeps, left swaps for the same movement and learns a soft dislik
- :166 [Small Android] same: Quick workout builds it for you › swipe right keeps, left swaps for the same movement and learns a soft dislik

## tests/review-3.5i.spec.ts
- :164 [Pixel 7] same: the Check carefully pile comes first in the deck with its note; a light flick decides by velocity; Undo chip; 
- :225 [Galaxy compact] flip: one by one for everything: progress "n of 288", a reload resumes on the same card; reduced motion has no loop 
- :225 [Pixel 7] same: one by one for everything: progress "n of 288", a reload resumes on the same card; reduced motion has no loop 

## tests/review-3.5v.spec.ts
- :93 [Galaxy compact] same: core review: real touch swipes approve and mark wrong, the reason chips stay 3 s, hold opens Fix, Undo restore
- :93 [Pixel 7] same: core review: real touch swipes approve and mark wrong, the reason chips stay 3 s, hold opens Fix, Undo restore
- :93 [Small Android] same: core review: real touch swipes approve and mark wrong, the reason chips stay 3 s, hold opens Fix, Undo restore
- :182 [320 floor] same: core review: one fixed screen, nothing scrolls at 100% or 130%; the map, the cues and Export open from the car
- :182 [Galaxy compact] same: core review: one fixed screen, nothing scrolls at 100% or 130%; the map, the cues and Export open from the car
- :182 [Pixel 7] same: core review: one fixed screen, nothing scrolls at 100% or 130%; the map, the cues and Export open from the car
- :182 [Small Android] same: core review: one fixed screen, nothing scrolls at 100% or 130%; the map, the cues and Export open from the car
- :259 [Galaxy compact] same: core review: decisions saved before 3.5v are read as they are, and a swipe keeps them
- :259 [Pixel 7] same: core review: decisions saved before 3.5v are read as they are, and a swipe keeps them
- :259 [Small Android] same: core review: decisions saved before 3.5v are read as they are, and a swipe keeps them
- :287 [Galaxy compact] same: core review: 20 cards by touch in under 45 s (138 in about 5 minutes)
- :287 [Pixel 7] same: core review: 20 cards by touch in under 45 s (138 in about 5 minutes)
- :287 [Small Android] same: core review: 20 cards by touch in under 45 s (138 in about 5 minutes)
- :307 [Galaxy compact] same: new exercises, one by one: real touch swipes, reason chips for 3 s, hold opens Fix, Undo, no scrolling, a relo
- :307 [Pixel 7] same: new exercises, one by one: real touch swipes, reason chips for 3 s, hold opens Fix, Undo, no scrolling, a relo
- :307 [Small Android] same: new exercises, one by one: real touch swipes, reason chips for 3 s, hold opens Fix, Undo, no scrolling, a relo

## tests/verify-1.5.spec.ts
- :17 [320 floor] same: 1.5 audit: presets DOM counts, tray sizes ────────
- :17 [Galaxy compact] same: 1.5 audit: presets DOM counts, tray sizes ───
- :17 [Small Android] same: 1.5 audit: presets DOM counts, tray sizes ────
- :38 [320 floor] same: 1.5 break it ─────────────────────────────────────

## tests/verify-1.6.spec.ts
- :43 [320 floor] same: 1.6 tap targets and wheel snap ───────────────────

## tests/verify-1.7h.spec.ts
- :211 [Small Android] flip: (g) rest over bar clears by itself within ~3 s; double tap on ✓ makes one set

## tests/verify-1.7i.spec.ts
- :200 [Small Android] flip: (c) pending 135 lb on a barbell and +25 lb on bodyweight survive minimize, kg, Resume (and reload) as themselv

## tests/verify-3.2.spec.ts
- :85 [320 floor] same: pick sheet at 130% text, skip and bring back, keep stores name only

## tests/verify-3.3a-r2.spec.ts
- :20 [Galaxy compact] same: (a) full gym, kettlebells then rower then thigh machine off: reveal still offers a plan (PLAN 3.5: Your plan b
- :20 [Pixel 7] same: (a) full gym, kettlebells then rower then thigh machine off: reveal still offers a plan (PLAN 3.5: Your plan b
- :20 [Small Android] same: (a) full gym, kettlebells then rower then thigh machine off: reveal still offers a plan (PLAN 3.5: Your plan b

## tests/verify-3.5b.spec.ts
- :200 [Galaxy compact] same: verify 3.5b › 6 inclusive: beginner and Go easy on; hotel and dumbbell: all four chips
- :200 [Pixel 7] same: verify 3.5b › 6 inclusive: beginner and Go easy on; hotel and dumbbell: all four chips
- :200 [Small Android] same: verify 3.5b › 6 inclusive: beginner and Go easy on; hotel and dumbbell: all four chips
- :281 [320 floor] same: verify 3.5b › 9 break it: double tap a card, reload mid deck, offline, rapid chips
- :281 [Galaxy compact] same: verify 3.5b › 9 break it: double tap a card, reload mid deck, offline, rapid chips
- :281 [Pixel 7] same: verify 3.5b › 9 break it: double tap a card, reload mid deck, offline, rapid chips
- :281 [Small Android] same: verify 3.5b › 9 break it: double tap a card, reload mid deck, offline, rapid chips
- :281 [iPhone 15] same: verify 3.5b › 9 break it: double tap a card, reload mid deck, offline, rapid chips
- :871 [Galaxy compact] same: verify 3.5b round 4 part 2 › C7 start from a deck writes one session; reload during Start leaves a whole worko
- :871 [Pixel 7] flip: verify 3.5b round 4 part 2 › C7 start from a deck writes one session; reload during Start leaves a whole worko
- :871 [Small Android] same: verify 3.5b round 4 part 2 › C7 start from a deck writes one session; reload during Start leaves a whole worko

## tests/verify-3.5d.spec.ts
- :182 [320 floor] same: check 4 and 6: names, no note, meta line at 100% and 130%
- :182 [Galaxy compact] same: check 4 and 6: names, no note, meta line at 100% and 130%
- :182 [Small Android] same: check 4 and 6: names, no note, meta line at 100% and 130%
- :182 [iPhone SE] same: check 4 and 6: names, no note, meta line at 100% and 130%

## tests/verify-3.5e.spec.ts
- :145 [320 floor] same: deck UX: swipe left/right, Fix sheet, 48pt, 100% and 130%, offline, resume, export privacy @matrix
- :145 [iPhone SE] same: deck UX: swipe left/right, Fix sheet, 48pt, 100% and 130%, offline, resume, export privacy @matrix

## tests/verify-3.5f.spec.ts
- :76 [iPhone 17 Pro Max] same: intake › calm: intake love/never deck @130

## tests/verify-3.5g.spec.ts
- :214 [Galaxy compact] flip: (5) chest and quads trained yesterday: no idea card holds them; why lines are true
- :214 [Small Android] same: (5) chest and quads trained yesterday: no idea card holds them; why lines are true

## tests/verify-3.5h.spec.ts
- :177 [Galaxy compact] same: deck: no layout shift while the demo loops, only top and next move, frame timing during a swipe
- :177 [Pixel 7] same: deck: no layout shift while the demo loops, only top and next move, frame timing during a swipe
- :177 [Small Android] same: deck: no layout shift while the demo loops, only top and next move, frame timing during a swipe

## tests/verify-3.5i.spec.ts
- :60 [Galaxy compact] same: sw off › 1 deck: 20 careful first with notes, frames, washes, undo @matrix
- :60 [Pixel 7] same: sw off › 1 deck: 20 careful first with notes, frames, washes, undo @matrix
- :60 [Small Android] same: sw off › 1 deck: 20 careful first with notes, frames, washes, undo @matrix
- :280 [Pixel 7] flip: sw off › 6 speed: 4 grid screens, 1 wrong each @matrix
- :312 [320 floor] same: sw off › 5 layout 100% and 130%, reduced motion @matrix

## tests/verify-3.5u.spec.ts
- :109 [320 floor] same: (1) fullMuscle: last button, lands on Today, no session, double tap does nothing extra @matrix
- :109 [320 floor] same: (1) hotel: last button, lands on Today, no session, double tap does nothing extra @matrix
- :109 [Galaxy compact] same: (1) hotel: last button, lands on Today, no session, double tap does nothing extra @matrix
- :109 [Pixel 7] same: (1) fullMuscle: last button, lands on Today, no session, double tap does nothing extra @matrix
- :109 [Pixel 7] same: (1) hotel: last button, lands on Today, no session, double tap does nothing extra @matrix
- :109 [Small Android] same: (1) fullMuscle: last button, lands on Today, no session, double tap does nothing extra @matrix
- :109 [Small Android] same: (1) hotel: last button, lands on Today, no session, double tap does nothing extra @matrix
- :144 [320 floor] same: (1) home with no equipment: noPlan notice, keep going to the reveal, Go to Today, no session
- :144 [Galaxy compact] same: (1) home with no equipment: noPlan notice, keep going to the reveal, Go to Today, no session
- :144 [Pixel 7] same: (1) home with no equipment: noPlan notice, keep going to the reveal, Go to Today, no session
- :144 [Small Android] same: (1) home with no equipment: noPlan notice, keep going to the reveal, Go to Today, no session
- :239 [320 floor] same: (2) tour: spotlights match elements, Next/Skip, outside tap and Escape, Start works @matrix
- :239 [Galaxy compact] same: (2) tour: spotlights match elements, Next/Skip, outside tap and Escape, Start works @matrix
- :239 [Small Android] same: (2) tour: spotlights match elements, Next/Skip, outside tap and Escape, Start works @matrix

## tests/verify-3.5v.spec.ts
- :72 [Galaxy compact] same: verify core: decisions from before, byte compat export builder, double tap, offline, reload mid-flow
- :72 [Pixel 7] same: verify core: decisions from before, byte compat export builder, double tap, offline, reload mid-flow
- :72 [Small Android] same: verify core: decisions from before, byte compat export builder, double tap, offline, reload mid-flow

## tests/verify-3.8.spec.ts
- :356 [320 floor] same: verify 3.8 › 8 warm ups for 1_2y: three rows, warm up kind, loadable, never Last time or Next @matrix
- :356 [320 floor] flip: verify 3.8 › 8 warm ups for 3y: three rows, warm up kind, loadable, never Last time or Next @matrix
- :356 [320 floor] same: verify 3.8 › 8 warm ups for break: three rows, warm up kind, loadable, never Last time or Next @matrix

## tests/verify-3.8b.spec.ts
- :220 [320 floor] same: verify 3.8b › 2 missed days card at 100% text: heading, one line, 48 pt buttons above the tab bar @matrix
- :220 [Small Android] same: verify 3.8b › 2 missed days card at 100% text: heading, one line, 48 pt buttons above the tab bar @matrix
- :324 [Pixel 7] flip: verify 3.8b swipe hint › 4 swipe hint is hidden while the effort prompt shows; elsewhere it has real height an
- :395 [320 floor] same: verify 3.8b new best badge › 5 New best badge at 130% text: popover, 44 pt hit, columns not clipped, finish le
- :395 [Galaxy compact] same: verify 3.8b new best badge › 5 New best badge at 130% text: popover, 44 pt hit, columns not clipped, finish le
- :395 [Small Android] same: verify 3.8b new best badge › 5 New best badge at 130% text: popover, 44 pt hit, columns not clipped, finish le
- :559 [Galaxy compact] same: verify 3.8b round 2 › R4b effort buttons clear at 130% text @matrix
- :559 [Pixel 7] same: verify 3.8b round 2 › R4b effort buttons clear at 130% text @matrix
- :559 [Small Android] same: verify 3.8b round 2 › R4b effort buttons clear at 130% text @matrix

## tests/verify-gate-s1-final.spec.ts
- :43 [320 floor] same: a. warm up pick is for that row only; working rows keep 185; Total lifted skips warm ups in header, finish and
