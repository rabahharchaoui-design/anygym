# G1: "What does this gym have?" check when switching gyms (Rabah, Nov 26 2:21 AM)

Rabah: when I switch gyms from the home page, show me what that gym or hotel gym has, so its profile gets saved.

## When the check shows (smart, not every time)
Pure rule in src/lib (unit tested), using a new additive field on Gym: `equipmentCheckedAt?: number` (not indexed, no migration).
- Show it when you switch to a gym whose equipment was never confirmed (no `equipmentCheckedAt`). This covers every gym that exists today, once each, and preset gyms like "Hotel gym" that still carry the preset's guess.
- Show it again when the gym was last confirmed more than 60 days ago AND you have not trained there for 30 days (equipment changes, you forget).
- Never for a gym just made with "+ New gym" (that form already picks the equipment): creating a gym sets `equipmentCheckedAt`.
- Never when you tap the gym you are already at.
- Confirming once means a confirmed gym switches in one tap, exactly like today.

## What it looks like (inside the same gym sheet, Monolith)
- Headline: "What does Westin Guam have?" with the city under it when there is one.
- Everything the gym has, all of it (no "+ 3 more"), using the intake's equipment picker (src/screens/intake/Steps EquipmentStep, the same one Settings uses). Every tap saves through setGymEquipment, like Settings. The dumbbell range sits right under dumbbells, in the gym's unit, and is required while dumbbells are on (no guessed range).
- Pinned footer: "Looks right" (primary, ice blue bar): saves `equipmentCheckedAt` and finishes the switch. A quiet "Not now": finishes the switch without confirming, so it asks again next switch. Back goes to the gym list without switching.
- The switch itself happens only after "Looks right" or "Not now", so the workout is built from the confirmed equipment.

## In the middle of a workout
- Unconfirmed gym: the check comes first, then the existing switch preview (SwitchPreview) shows what changes with the confirmed equipment, then "Switch gym" or "Stay".
- Confirmed gym: unchanged, straight to the preview.

## Rules
- Reuse the existing pieces: GymSheet, EquipmentStep, setGymEquipment, useGymSwitch, Sheet and Button. No second copy of the equipment picker or a new sheet.
- No bad data: never show equipment the gym was not given; an empty gym shows "Nothing picked yet" and Looks right stays off until at least one thing (or bodyweight only) is picked.
- Today updates right away: after the check, Today's "Next up" and time reflect the confirmed equipment.

## Tests
- Unit: the rule (never checked, 61 days old and 31 days unused, recent, new gym, same gym, clock edges).
- End to end at 393x852 and 440x956: switch from Today to an unconfirmed gym shows the check; turning cable station off saves it and Today's workout updates; Looks right saves and the next switch to that gym is one tap; Not now switches and asks again next time; + New gym never shows the check; in a workout the check comes before the switch preview; footer visible above the home indicator, nothing clipped.

# G1b: every new gym gets its equipment asked, then saved (Rabah, Nov 26 2:36 AM)
Rabah: whenever a new gym gets added, ask for its equipment so it is saved to the profile. Builds after G1 is merged (G1 adds `equipmentCheckedAt` and the check view).

What exists today: "+ New gym" (gym sheet and Settings, both NewGymForm) already shows "Tap what it has" with the intake equipment picker. Two holes make it a guess, not an answer:
1. The kind pre-ticks a typical list AND a typical dumbbell rack (a hotel gym gets 5 to 50 lb), so tapping "Add and switch" without looking saves the guess as fact.
2. Gyms made without the form are never asked: the default "My Gym" made on first start (src/db/bootstrap.ts), and an intake where equipment was skipped and the kind's preset was used (src/db/intake.ts).

Fixes:
- New gym form: the dumbbell rack is never pre-filled from the kind; with dumbbells on, "Heaviest dumbbell" is required and empty until typed (the button says "Type the dumbbells it has" until then). The pre-ticked equipment stays as a starting point, with one line above it: "Started from a typical <kind>. Tap anything it doesn't have." Saving the form sets `equipmentCheckedAt`, because the person just answered it.
- Intake: when the person answered the equipment step, the gym gets `equipmentCheckedAt`; when they skipped it and the preset was used, it stays unconfirmed.
- An unconfirmed ACTIVE gym asks once on Today: a slim row under the gym pill, "Check what <gym> has", ice blue, which opens the same G1 check view in the gym sheet. "Looks right" saves and the row is gone for good; "Not now" hides it until the next day. It never shows during a workout.
- No new picker, sheet or check view: reuse NewGymForm, EquipmentStep and the G1 check.

Tests: unit (the rack is never pre-filled; form save and answered intake set equipmentCheckedAt; skipped intake and bootstrap leave it unset). End to end at 393x852 and 440x956: + New gym cannot be added with dumbbells on and no rack typed; a new gym is never checked again on its first switch; a fresh install's "My Gym" shows the Today row once, Looks right removes it for good, Not now hides it until the next day.
