STATUS: HANDLED its real points are in R1 (3), (4)
Grok Build honesty audit, written Nov 23 09:06 at 31e12fd5. A second opinion, not orders: SPEC.md wins.

I'll audit AnyGym for numbers, muscles, demos, and coach lines the app shows without backing them up. First I'll read the spec, the plan, and the newest reports so I don't repeat findings already listed.

The newest reports and the honesty rules are next, so I can judge only built work and skip findings already written down.

The last honesty pass already covers the muscle-sheet titles and the helper-muscle “trained” lines. I’ll look for other numbers, demos, and coach lines the built app shows without a source.

I'll finish the honesty checks that were still open: pace windows, GPS-gap best efforts, shift distance in the average, and whether "Worked lately" shows the muscle name on screen.

Pace windows match the spec. Next I’ll check whether “Worked lately” hides the muscle name, and whether a GPS shift can invent a pace or a best effort.

# Grok honesty audit

- MAJOR src/screens/today/FreshMuscles.tsx:49 — Log only dumbbell side lateral raises. Today’s Worked lately paints the front-shoulder shape amber, and the only visible words are “Under 24 h” and “Gray: no logged sets we can map.” That is the same shape a bench press or overhead press paints, so a sighted user reads it as front delts. The log’s name, “side delts”, is only inside that stage’s aria-label. A lat pulldown and a mid-back row both paint upper back with no name, and a hip abductor and a hip thrust both paint the glutes with no name. Smallest fix: show `freshWords(named)` as visible text under the bodies.

- MINOR src/db/coachData.ts:214 — Log Band Internal Shoulder Rotation (0 degrees) as a normal set (its row starts as a warm-up; the type chip switches it). Today says “Not on the map: Band Internal Shoulder Rotation (0 degrees) (muscles not confirmed)” (`src/screens/today/FreshMuscles.tsx:34`). The exercise sheet already names it “Rotator cuff”; that muscle has no shape, so `primaryRegions` is empty and the set is filed with exercises whose muscles are unknown. Smallest fix: when the muscles resolve to text and no region, show that text under the card, and keep “muscles not confirmed” for a real null map.
