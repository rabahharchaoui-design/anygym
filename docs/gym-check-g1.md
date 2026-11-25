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
