# M18: the "Workout saved" finish screen as a full celebration (G, Nov 25 2026)

This is the customer's payoff screen. Go all out on UI and animation, but it must stay smooth with zero lag and zero bugs.
PLAN items M18a to M18d build it in order. SPEC.md wins on anything this page does not cover; add a SPEC section when M18a starts.

## Problems today
- On an iPhone 17 Pro Max (440 x 956) the Time / Sets / Total lifted row is cramped, the bottom half is empty, and "Done" is a plain underlined label.
- A 12 set workout shows "Time 1 min". Verify the timer measures from workout start to save and fix it if it is wrong.

## Style (Monolith, from Pluto)
Graphite #131417 background, flat white and titanium #8A9099, ice blue #9FD3FF as the ONLY accent. No rainbow, no gradients, no circles in the confetti.

## Sequence (about 2.5 s in all; a tap anywhere skips to the end state)
1. Confetti: a 1.2 s burst from the headline. About 40 flat rectangles and squares only, 60% white, 25% titanium, 15% ice blue, with a slight tumble and gravity. It fires once and settles off screen.
2. Hero: the workout name small, then a huge "Nice work." (text drawn by the app). The stats row becomes 3 stacked oversized numbers that count up from 0: Total lifted biggest, then Sets, then Time. "+X% vs last time" under a stat when history exists.
3. Weekly ring: about 160 pt, ice blue progress over a titanium track, filling with a 600 ms ease out after the confetti, with "1 of 4 this week" in big type inside. The goal comes from the user's plan, or 3 if none is set. A full week shows "Week complete."
4. PRs: one row per new PR (best weight or reps for that exercise) with an ice blue left bar, the new number in huge type and a small up chevron.
5. Streak: the day count next to the existing flame art at 48 pt. Do not make a new flame. (G named art/goal-icons/goal-lose-fat.png; in this repo that art ships as public/icons3d/goal-fat_loss.avif and .webp, the M9 goal icon.)
6. Badges: each new badge scales 0.6 to 1.08 to 1.0 (spring, about 450 ms) with one ice blue ring pulse behind it and one light haptic (navigator.vibrate where supported). Stagger several badges by 250 ms, show at most 3, then "+N more".
7. A full width "Done" bar pinned to the bottom with the safe area inset, plus a secondary "Share" that makes a clean summary image with stats, badges and the date only (no name, location or personal info). The exercise list goes below the hero, collapsible.
8. If the workout logged a new city, the passport stamp with a "thunk" rotate in at -8 degrees. Stamps are for cities only; badges must NOT look like stamps. (Runs already have a first run in a city stamp: src/screens/run/RunFacts.tsx, newCityMoment, art public/icons3d/later/passport-*. For a workout, take the city from the active gym if it has one; never read or store the phone's location for this.)

## Badges (flat medallions, stored locally with the date earned)
- Single: first-workout, streak-3, streak-7, streak-30, week-complete, new-pr, early-bird (before 7 AM device local time), night-owl (after 9 PM device local time), new-city (first workout in a new city), comeback (a workout after 14+ days off).
- Tiered (one badge, 3 tiers): workouts (10 / 50 / 100) and lifted (1k / 10k / 100k lb). The app draws the number under the badge, never inside the art.
- Early Bird and Night Owl use device time only. No location stored for them.
- A Badges page under the You tab: earned badges in a grid at 64 pt, locked ones with progress ("7 of 10 workouts").

## Art slots (Pluto delivers to art/badges/ in anygym-art with a manifest.json)
- Transparent square PNG: badge-<slug>.png (512) and badge-<slug>-1024.png. Locked: badge-<slug>-locked.png (do NOT CSS grayscale it). Tiers: badge-<slug>-t1, -t2, -t3.png.
- 96 pt on the finish screen, 64 pt in grids. The art has no text; the app draws all names and numbers.
- Fall back to a plain titanium circle when a file is missing, so the build does not wait for the art.
- Open an art-request issue in rabahharchaoui-design/anygym-art listing every final slug (PROMPT.md, PLUTO ART rules).

## Performance (non negotiable)
- CSS transforms and opacity or the Web Animations API only, on GPU friendly properties. No layout thrash, no heavy animation libraries, bundle increase under 30 KB (and the first download stays under its size limit).
- 60 fps on a real iPhone with no dropped frames during confetti plus count up. Profile it and report the numbers.
- prefers-reduced-motion: no confetti or springs, only fades, and the numbers appear at once.
- Clean up every animation timer and listener on leave. Done and Back mid animation never break anything or save twice.

## Tests (must pass before the 🚀)
- Unit: badge unlock rules and tiers, streak math across midnight and time zones, the weekly count, PR detection, the comeback 14 day rule, the timer fix, the missing art fallback, badges never awarded twice.
- End to end: finish a workout, see the celebration and its end state, tap to skip, reduced motion, open the Badges page.
- Full suite plus a Codex verify PASS, then a live phone check at 393 x 852 and 440 x 956: no overflow, no clipped text, Done visible above the home indicator. Then the 🚀 so Rabah can test.

## Art decision (Rabah, Nov 25 11:28 PM): Monolith everything
Badges and passport stamps are flat and matte. No Titanium Glass anywhere: graphite #131417, white and titanium #8A9099, ice blue #9FD3FF as the only accent, square cuts. Build the badge and stamp slots and placeholders in this style (the missing art fallback is a flat titanium mark in a square cut, not a glossy circle). Pluto delivers the final Monolith art. The passport stamp moment itself is M19f (docs/ux-polish-m19.md).

City text on the stamp follows CITY TEXT ON STAMPS in docs/ux-polish-m19.md (Rabah, Nov 25 11:38 PM): city in caps as the main text, bigger than the date, shrunk to fit its band, never cut off.

BADGE ART DECISION (Rabah, Nov 26 12:33 AM):
- M18 uses this spec's badge list. Final Monolith art is in public/badges/ only for comeback, early-bird and night-owl. The other 9 M18 badges (first-workout, streak-3, streak-7, streak-30, week-complete, new-pr, new-city, and the tiered workouts and lifted badges) show the flat titanium placeholder until Pluto delivers them in Monolith with -locked variants under the same filename rules (a drop in swap, no code change).
- public/badges/ also holds 10k, 5k, half-marathon, hotel-hero, iron-week and plate-master. They are kept for future run and gym badges and must NOT appear anywhere in M18 (finish screen, Badges page, locked grid).
- No new art request is needed for M18d: Pluto is already drawing the missing 9.
