STATUS: HANDLED
Grok Build feel audit, written Nov 17 16:02 at 7c28c839. A second opinion, not orders: SPEC.md wins.

I'll audit iPhone feel against the spec and the newest reports, starting with the project docs and the mobile-native rules.

The docs and mobile rules are in. Next I’ll read SPEC 13 and 23, what’s already built, and the newest feel reports so I don’t repeat them.

Reports share one copy time, so I’ll use the latest dated Codex notes and SPEC 23, then check the built screens for the feel bugs.

Newest Codex notes are data bugs, and there is no `reports/grok`. I’ll check the built UI for the feel failures those notes do not already list.

I'll finish the feel audit from the code already in view: confirm the live-run tap targets, measure whether run labels clip at 320 and large type, and check reduced-motion on the intake chips.

The live page dots are 36 points wide. Next I’ll measure whether run labels and the small stats actually clip at 320 and at 130% text.

# Grok feel audit

- MAJOR src/screens/run/Run.module.css:297 — On a 320-wide phone, Distance and Time each put four goal chips in one fixed row. At normal text "Custom" is ellipsized (about 45px of word in a 40px label). At 130% text that same row also cuts "10 km", "20 min", "30 min", and "45 min", so the control that opens the wheel reads as "Cust…" and the minute chips lose "min". Small chip labels ellipsize in src/ui/Chip.module.css:192. Smallest fix: change `.presets` to `repeat(auto-fit, minmax(5.5em, 1fr))` so a chip wraps onto the next row once the word no longer fits.
- MINOR src/screens/intake/IntakeSoFar.module.css:50 — On a 320-wide phone at 130% text, a short intake screen hides the full plan strip and shows the one-line summary. Two goals such as "Comeback + strength" are wider than the room beside "Your plan so far", and the pill ellipsizes, so the second goal is gone on the later questions. Smallest fix: let `.soFarLineEnd .soFarSlot` wrap onto a second line.
- MINOR src/screens/run/Live.module.css:273 — During a run the Numbers and Map tabs are 36×48 pt. On the map page those tabs are the tap back to the big numbers; the map itself pans, and the other page-change gesture is the 28 pt strip at the left edge. A thumb that lands between the dots, or a few points wide of one, does nothing. Smallest fix: make `.dotHit` at least 44px wide (48px to match `--tap`).
- MINOR src/screens/intake/IntakeSoFar.module.css:96 — With Reduce Motion on, each new "Your plan so far" pill still scales up from 85% and overshoots on the tap spring (`slot-in`). Smallest fix: under `prefers-reduced-motion: reduce`, play an opacity fade on `.soFarSlot`.
