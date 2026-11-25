STATUS: HANDLED covered by H2 (1) and R1 (3), (4)
Grok Build honesty audit, written Nov 24 06:43 at ef1579b3. A second opinion, not orders: SPEC.md wins.

I'll audit AnyGym for numbers, muscles, demos, and coach lines the app shows without being sure. First I'll read the spec and the newest reports so I don't repeat findings already listed.

The last honesty pass already covers the muscle-sheet titles and the helper-muscle “trained” lines. I’ll look for other numbers, demos, and coach lines the built app shows without a source.

I'll finish the honesty pass on the open cases: spoken split time versus pace, plate drawings past sleeve capacity, and muscle claims the map does not back.

The newest reports are in. Next I’ll check the spoken split clock and the plate drawing against the spec, and drop anything those reports already named.

# Grok honesty audit

- MAJOR `src/lib/quickCards.ts:195` — Log one working set of barbell bench and open Quick. Hit what's fresh says "Skips chest (trained today)" (`src/screens/quick/ConceptCard.tsx:58`) and drops chest moves. That stamp is one certain working set (`src/db/training.ts:51` via `readRecentMuscles`). SPEC 20.3 counts a muscle as trained only after 3 primary working sets, and `src/lib/recovery` already does that. One set is not enough, and a warm-up does not do it either. Smallest fix: build the Skips and rested lines from `src/lib/recovery` (3 primary working sets), and name nothing under that.
