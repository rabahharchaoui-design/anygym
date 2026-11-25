# AnyGym Monolith Pass 2 — Finish-screen milestone badges

Flat matte **Monolith** badges for the Workout saved finish screen. Matches the existing set in `/workspace/anygym-art/monolith-pass/` (disc, ring, sizes, safe margin, locked treatment). Art only. Nothing in this folder has been pushed.

The existing `5k`, `10k`, `half-marathon`, `hotel-hero`, `iron-week` and `plate-master` badges stay as later run / gym badges and are not redone here.

## Palette & Rules

- **Graphite disc**: `#131417`
- **Flat white**: `#FFFFFF`
- **Flat titanium**: `#8A9099`
- **Ice blue (only accent)**: `#9FD3FF`
- **Locked silhouette**: `#2A2C30` disc, `#34373C` recessed mark, `#3F434A` faint outline
- **Finish**: Flat matte, square-cut geometry, no gloss, bevels, glow, metallic gradients, or grain. **No text, letters, numbers, real flags, logos, faces, or personal info in the art.**

All badges share the pass-1 medallion frame on a transparent square canvas (`512×512` and `1024×1024`):

- **6% safe margin** (`88%` outer disc diameter: `r = 450` on `1024`)
- **`#131417` graphite disc** + **`#8A9099` flat titanium ring** (`24 px` stroke at `r = 408`) unless the tier ring rule below applies
- **`#FFFFFF` geometric mark** at ~55% of the disc + **one `#9FD3FF` ice-blue inset**
- **Locked exports**: `badge-<slug>-locked.png` (`512`) and `badge-<slug>-locked-1024.png` (`1024`)

## Tier rule (Workouts + Lifted)

One system, no numerals in the art, applied to both families:

1. **Pips** — a count of short ice bars under the mark: **1 / 2 / 3** for t1 / t2 / t3.
2. **Ring treatment** that escalates:
   - **t1** — titanium ring (same as the rest of the set)
   - **t2** — white ring
   - **t3** — white ring plus an ice-blue outer hairline (`16 px` stroke at `r = 436` on the `1024` canvas)

Locked variants keep the set-1 locked outline (the ring escalation is an unlocked treatment). Locked t1 / t2 / t3 stay distinct through the pip count, which remains visible in `#34373C`.

Meanings (for the app, not drawn in the art):

| Family | t1 | t2 | t3 |
|---|---|---|---|
| Workouts | 10 sessions | 50 sessions | 100 sessions |
| Lifted | 1,000 lb | 10,000 lb | 100,000 lb |

## Badges (`badges/`)

| Slug | Title | Mark & ice inset | Files |
|---|---|---|---|
| `first-workout` | First Workout | Bold horizontal dumbbell + ice 4-point spark at the upper right | `badge-first-workout.png`, `-1024`, `-locked`, `-locked-1024` |
| `streak-3` | Streak · 3 | Asymmetric two-tongue flame with a graphite inner cut + **3** chunky ice notches in a top arc | `badge-streak-3.png`, `-1024`, `-locked`, `-locked-1024` |
| `streak-7` | Streak · 7 | Same two-tongue flame + **7** ice notches in a 180° crown | `badge-streak-7.png`, `-1024`, `-locked`, `-locked-1024` |
| `streak-30` | Streak · 30 | Same two-tongue flame + a **full ice ring** at the same radius as the notches | `badge-streak-30.png`, `-1024`, `-locked`, `-locked-1024` |
| `week-complete` | Week Complete | 7 filled square-cut day cells in a row + large ice check | `badge-week-complete.png`, `-1024`, `-locked`, `-locked-1024` |
| `new-pr` | New PR | Wide white up-chevron over a baseline bar + smaller ice up-chevron above | `badge-new-pr.png`, `-1024`, `-locked`, `-locked-1024` |
| `new-city` | New City | Blank mini square-cut passport-stamp frame (double rect, same outline as the Monolith stamp set) + one ice-blue dot. No text, bands, flags or maps. | `badge-new-city.png`, `-1024`, `-locked`, `-locked-1024` |
| `workouts-t1` | Workouts · 10 | Side-on stack of **2** white plates on a titanium sleeve (bore at the top), **1** ice pip, titanium ring | `badge-workouts-t1.png`, `-1024`, `-locked`, `-locked-1024` |
| `workouts-t2` | Workouts · 50 | Same family, **3** plates, **2** ice pips, white ring | `badge-workouts-t2.png`, `-1024`, `-locked`, `-locked-1024` |
| `workouts-t3` | Workouts · 100 | Same family, **4** plates, **3** ice pips, white ring + ice hairline | `badge-workouts-t3.png`, `-1024`, `-locked`, `-locked-1024` |
| `lifted-t1` | Lifted · 1k lb | Side-view loaded barbell (3 plates per side) + ice collars, **1** ice pip, titanium ring | `badge-lifted-t1.png`, `-1024`, `-locked`, `-locked-1024` |
| `lifted-t2` | Lifted · 10k lb | Same mark, **2** ice pips, white ring | `badge-lifted-t2.png`, `-1024`, `-locked`, `-locked-1024` |
| `lifted-t3` | Lifted · 100k lb | Same mark, **3** ice pips, white ring + ice hairline | `badge-lifted-t3.png`, `-1024`, `-locked`, `-locked-1024` |

Streak 3 / 7 / 30 share one flame so they read as a family; the notch count (or the full ring) is what changes, and that change is built to hold at 96 px. Week Complete uses a short horizontal day-strip + check so it does not collide with Iron Week (7 tall vertical bars, last one ice). Workouts is a side-on stack of plates on a titanium sleeve (2 / 3 / 4 plates for t1 / t2 / t3), so it does not read as a menu and does not collide with Lifted (a long open bar with plates at the ends) or Plate Master (a face-on plate). New City is a blank mini square-cut passport-stamp frame from the Monolith stamp set, with a single ice dot and no text.

## Previews & Metadata

- `previews/badges.jpg` — Full unlocked grid, locked row, and 96 px 1:1 strip (unlocked + locked)
- `previews/tiers.jpg` — Workouts and Lifted tier ladders, with the pip + ring rule and a 96 px check
- `previews/with-set-1.jpg` — New badges beside the existing 9, plus a combined 96 px strip
- `manifest.json` — Inventory, hex codes, tier rule, file list
- `src/generate.py` & `src/svg/` — Reproducible SVG/PNG generator
