# M19: UX polish and the passport stamp moment (G, Nov 25 2026)

Comes after M18 (docs/finish-celebration.md). Split into M19a to M19f; each part tests and merges on its own. Same rules as always: the full suite, Codex's check, and a live phone check at 393 x 852 and 440 x 956 before the 🚀. SPEC.md wins on anything this page does not cover.

## Art decision (Rabah, Nov 25 11:28 PM): Monolith everything
Badges and passport stamps are flat and matte. No Titanium Glass anywhere. Graphite #131417, white and titanium #8A9099, ice blue #9FD3FF as the only accent, square cuts. Build the badge and stamp slots and placeholders in this style now; Pluto delivers the final Monolith art (512 and 1024 exports, never upscaled).

## Reuse first (CLAUDE.md)
The app already has src/ui/motion.ts, src/ui/nav.ts, src/ui/haptics.ts, src/ui/Odometer.tsx, src/ui/Skeleton.tsx and src/ui/useReducedMotionLive.ts. M19e extends these into the one shared motion system; do not write second copies.

## M19a Bugs (first; each with a test that fails before and passes after)
1. A quick workout or a "Got 15 min?" workout must NOT move the plan forward. Only a finished plan day moves "Next up" to the next day.
2. Finish with exercises left undone asks "Finish anyway / Keep going". With nothing logged it asks "Discard workout?" instead of quietly throwing it away.
3. The Undo in the "Workout saved" toast shows disabled right away. Make it work for about 5 seconds.
4. The finish screen count up briefly overlaps digits (seen as "42/520"). Tabular figures and a fixed width.

## M19b Navigation and tap targets
- Bottom tab bar: one Monolith icon family plus a 12 to 13 pt label, the active tab in white with an ice blue bar, the rest in titanium. Each tab at least 44 pt tall and respecting the home bar safe area.
- Anything tappable looks tappable: Preview, Change day, Pick exercises myself, Edit gyms, Run settings Done, Turn on GPS, and "Apply to this workout" (it looks disabled today).
- On/Off and lb/kg become real square cut switches or segmented controls, not just underlines.
- Press states everywhere: 0.97 scale plus a slight dim on touch down.
- Back labels match tab names ("You", not "Back to Settings"). History detail keeps the tab bar.

## M19c Onboarding
- Every step works the same way: single choice steps move on when tapped, multi choice steps use Continue, Skip on every optional step.
- "About you" says "All optional", so Continue works without picking anything. The height wheel gets a clear way to confirm.
- Cut or merge steps until it really takes about 2 minutes. The days choices match what the note says the plans support (3 or 5 days).
- Motion: the headline arrives first, then the options stagger in at 30 ms each. On the last screen the plan builds as rows dropping in.

## M19d Layout
- Today: fill the dead space, put the main action within thumb reach, label the rotation dots.
- Run: with GPS off, a compact map or location card, not a whole world map. "Turn on GPS" is a real button. Hide "My Gym" on Run.
- Plans: "You're on: <plan>" at the top. Shorter descriptions.
- Exercise screen: the muscle map takes more room than the sets, so shrink it and remove the "Which body?" question (already chosen in onboarding). The All list sorts strictly A to Z. Body part chips scroll and are never cut off.
- No blank empty states: one big dim mark, one line, one ice blue action.
- Shorten the "Auto level up" text. Units are set in one place (You).
- html and body background graphite so the iOS rubber band never shows white. The keyboard never covers the Log button.

## M19e Motion language (one system app wide, in one shared file)
- Pushes 220 ms cubic-bezier(0.2, 0, 0, 1), fades 160 ms, no bounce, at most 2 things animating at once.
- Tabs crossfade with a 12 px vertical shift (no horizontal slide). Drill downs use an iOS style push and keep back swipe working. Large titles shrink into the nav bar on scroll.
- Numbers roll odometer style (150 to 250 ms) with tabular figures, never swap.
- Logging a set: the row dims, an ice check draws in over 180 ms, a light haptic, and the rest timer slides up. On the last set of an exercise, a stronger haptic and an ice underline sweeps across the name.
- Plate loader: plates slide on with a 2 px settle, a click haptic per plate, the total rolls up, matching the App Store promo.
- Skeleton blocks instead of spinners. Reduce Motion swaps moves for fades and keeps the haptics.

## M19f Passport stamp moment (ties into the M18 finish screen)
- After the summary settles, the passport page is there. The stamp drops from 1.15x with a random 3 to 6 degree rotation, hits 1.0 in about 120 ms with one heavy haptic, the page dips 2 px, no bounce.
- Ink bleed: a rough edge fades in over about 400 ms at 85 to 90% opacity so the paper shows through. A seeded rotation and offset per stamp so no two look pasted.
- City and date fade up last, inside the stamp bands, drawn by the app. See CITY TEXT ON STAMPS below.
- A new city gets the full slam plus one ice ring pulse. A repeat visit gets a smaller stamp overlapping the old one.
- "View passport" zooms the stamp into its spot on the real page (shared element). Pages turn with a left hinge (rotateY about 450 ms, follows the finger), a faint guilloche background, 4 to 6 stamps loosely placed per page.
- The share card shows the same stamp at the same rotation. Sound is off by default.
- Style check: no leftover system blue, green toggles, default red, default focus rings or emoji icons. Square corners everywhere. 512 and 1024 art exports only, never upscaled.

## Performance
60 fps on a real iPhone for every animation (paste the numbers), transform and opacity only, no layout thrash, no new heavy libraries.

CITY TEXT ON STAMPS (Rabah, Nov 25 11:38 PM):
- The city name is the main text on every stamp: ALL CAPS, always bigger than the date, drawn by the app inside the stamp's city band.
- Long names shrink to fit the band (for example SAN FRANCISCO); the name is never cut off, never ellipsized and never runs outside the band. Shrink the font size first, then tighten letter spacing a little; never squash the letters sideways.
- The date sits in its own band (or below the city when the stamp has one band) and stays smaller than the city at every name length.
- Band size and position come from Pluto's README for each stamp (and the same numbers in its manifest.json, as fractions of the canvas: x, y, width, height). Until the Monolith stamps land, use a centred band of 60% width as the placeholder.
- The fitting math is pure logic in src/lib with unit tests: a short name (ROME), SAN FRANCISCO, a very long name (LLANFAIRPWLLGWYNGYLL), names with accents and spaces (SÃO PAULO, ST. JOHN'S), and the date always smaller than the city. End to end: stamps at 393x852 and 440x956 show the full city name inside the band.

FINAL MONOLITH ART (Rabah approved, Nov 26 12:30 AM):
- Pluto's final pass: 9 badges with -locked variants, 8 text free passport stamps and the stamp slam storyboard, in a monolith-pass folder with README.md and manifest.json. Filenames match the existing art, so it is a drop in swap. Commit it into the repo as part of M18d (badges) and M19f (stamps), with the usual tests and live checks.
- The README and manifest give each stamp's city band and date band as pixel boxes, the ink colour, centred alignment and the max cap height. Use those numbers exactly (they replace the 60% placeholder band above); the city still shrinks below the max cap height to fit and is never cut off.
- The storyboard is the timing reference for M19f: 1.8 s total. Reduce Motion is a 250 ms crossfade and keeps the haptic.
- In the repo (Nov 26 12:40 AM): stamps in public/stamps/ (2048 px, text free, filenames unchanged), badges in public/badges/ (512 and 1024, with -locked), the machine readable manifest at public/art-manifest.json (paths in it are relative to public/), Pluto's README and previews in docs/art/monolith-pass/, the storyboard README and frames in docs/art/stamp-storyboard/.
- Stamp bands: read city_band and date_band from public/art-manifest.json (rect_frac, alignment center, text_color = the stamp ink, suggested_max_cap_height_px at 2048). Scale the max cap height with the stamp's rendered size, never exceed it, shrink below it to fit, never cut off. Pluto measured caps in Inter; measure with the app's own display font so the cap height, not the font size, stays under the max.
- Ink colours changed with the filenames kept: "silver" stamps are titanium #8A9099 and "amber" stamps are white #FFFFFF. Use the manifest's ink_hex, never the filename.
- Storyboard timings (reference for M19f): summary settles at 0 ms; the stamp appears at 300 ms at 1.15x (40 ms fade in); heavy slab drop to impact at 440 ms, hard stop at 1.00x with no bounce, 2 to 3 px page dip and one haptic; ink edge spread 440 to 640 ms; city and date fade up 640 to 900 ms; one ice ring pulse 900 to 1300 ms (new city only); zoom to the passport page 1300 to 1800 ms. A new city rotates -8 degrees; repeat visits use a seeded 3 to 6 degrees. Reduce Motion: 250 ms linear crossfade at the resting pose, no drop, scale, dip or ring, haptic kept. Easing curves are in docs/art/stamp-storyboard/README.md.
- The storyboard frames are for timing only. They still draw the old stamp ornaments (plane, stars, dashed ring, spatter dots) and a plain underlined Done; the stamp look comes from public/stamps/ and the Done bar from the M18 spec.
