# AnyGym Passport Stamp Slam — Storyboard (Art Only)

Monolith visual storyboard for the passport **stamp slam** sequence on the **Workout saved** finish screen (`440 × 956` iPhone frame ratio, rendered at `2×` `880 × 1912` in `frames/`).

## Visual Rules (Monolith Flat & Matte)
- **No Titanium Glass:** graphite surfaces (`#131417` screen, `#191B20` passport card), flat white/titanium ink (`#FFFFFF` / `#E8EAED`), single `#9FD3FF` ice-blue accent, square cuts, zero gloss, zero bevels, zero metallic gradients.
- **Stamps:** geometric flat shapes matching `appstore-promo-1` (`05.png` round, rect, hex): double rings/borders, dashed inner ring, top-view airplane/star motifs, blank bands filled with rounded placeholder bars (no letters, numbers, or real flags).
- **Shadows:** minimal flat offset shadow only during the hover (`300 ms`) and mid-drop (`380 ms`) frames; flush contact at impact (`440 ms`).
- **Ink bleed:** slight uniform edge spread rather than noisy grain or textured smear.
- **Motion language:** heavy-slab drop (fast in, firm stop, zero bounce), `-8°` angle for a new city (`3–6°` standard), single haptic fired on impact.

## Frames

| # | File | Timing | Easing / Motion | Notes |
|---|---|---|---|---|
| 01 | `frames/01_summary_settling.png` | `0 ms` | `cubic-bezier(0.22, 1.0, 0.36, 1.0)` (ease-out settle) | Workout saved stats settle; blank passport page already visible below. |
| 02 | `frames/02_stamp_appears.png` | `300 ms` | Instant appear (`opacity 0 → 1`, `40 ms`) | Stamp appears at `1.15×`, `-8°` (new city; `3–6°` std), hovering with minimal flat offset shadow. |
| 03 | `frames/03_mid_drop.png` | `380 ms` | Heavy-slab ease-in (`cubic-bezier(0.55, 0.0, 0.90, 0.25)`) | `1.06×` scale, shadow tightens, slight concentric motion-blur trail. |
| 04 | `frames/04_impact.png` | `440 ms` | Firm linear/hard clamp at `1.00×` (0 overshoot/bounce) | Flush impact, `2–3 px` page dip, small flat ink spatter ring, `1×` haptic fired. |
| 05 | `frames/05_ink_bleed.png` | `440–640 ms` | `ease-out` (`cubic-bezier(0.16, 1.0, 0.30, 1.0)`) | Passport page rebounds; ink spreads slightly at outer edges (flat edge spread). |
| 06 | `frames/06_city_date_fade.png` | `640–900 ms` | `ease-out` (`cubic-bezier(0.20, 0.0, 0.20, 1.0)`) | Blank bands fill with soft rounded placeholder bars and light shimmer (no letters). |
| 07 | `frames/07_ice_ring_pulse.png` | `900–1300 ms` | `ease-out` (`cubic-bezier(0.12, 0.85, 0.25, 1.0)`) | One `#9FD3FF` ice-blue ring expands and fades out behind the new-city stamp. |
| 08 | `frames/08_passport_zoom.png` | `1300–1800 ms` | Smooth camera push (`cubic-bezier(0.25, 0.10, 0.25, 1.0)`) | Pushes into the passport page showing the new stamp among faint older rect/hex stamps. |
| RM | `frames/09_reduce_motion.png` | `0–250 ms` | Linear crossfade (`opacity 0 → 1`) | Reduce Motion fallback: crossfade at `1.00×` resting pose, no drop/scale/dip/ring, haptic kept. |

## Outputs
- `storyboard.png` — full-resolution `3000 × 4820` storyboard sheet (`4`-column grid + Reduce Motion panel + `0–1800 ms` timeline & heavy-slab easing curve).
- `storyboard.jpg` — `2400 × 3856` JPEG for chat review.
- `frames/01_summary_settling.png` … `frames/09_reduce_motion.png` — individual `880 × 1912` (`2×` `440 × 956`) frames.
- `src/build_storyboard.py` — generator script (`python3 src/build_storyboard.py`).
