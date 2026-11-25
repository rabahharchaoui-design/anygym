# AnyGym Monolith Pass — Badges & Passport Stamps

Flat matte **Monolith** redesign of AnyGym's existing Titanium Glass badges (`/workspace/anygym-art/3/`) and passport stamp frames (`/workspace/anygym-art/2/`). Art only.

## Palette & Rules

- **Graphite disc**: `#131417`
- **Flat white**: `#FFFFFF`
- **Flat titanium**: `#8A9099`
- **Ice blue (only accent)**: `#9FD3FF`
- **Locked silhouette**: `#2A2C30` disc, `#34373C` recessed mark, `#3F434A` faint outline
- **Finish**: Flat matte, square-cut geometry, no gloss, bevels, glow, metallic gradients, or grain. No text, letters, numbers, real flags, logos, faces, or personal info in the art. The app draws all stamp text into empty bands.

## 1. Badges (`badges/`)

All 9 badges share one consistent medallion frame on a transparent square canvas (`512×512` and `1024×1024`):
- **6% safe margin** (`88%` outer disc diameter: `r = 450` on `1024`)
- **`#131417` graphite disc** + consistent **`#8A9099` flat titanium ring** (`24 px` stroke at `r = 408`)
- **`#FFFFFF` geometric mark** centered at ~55% of the disc + **one `#9FD3FF` ice-blue inset**
- **Locked exports**: `badge-<slug>-locked.png` (`512`) and `badge-<slug>-locked-1024.png` (`1024`)

| Slug | Title | Mark & Ice-Blue Inset | Files |
|---|---|---|---|
| `5k` | 5K | Low-profile side running shoe + short straight ice speed-line | `badge-5k.png`, `badge-5k-1024.png`, `-locked` |
| `10k` | 10K | Side-profile running shoe + long winding S-curve path | `badge-10k.png`, `badge-10k-1024.png`, `-locked` |
| `half-marathon` | Half Marathon | Swallowtail blank flag on pole + closed oval course loop | `badge-half-marathon.png`, `badge-half-marathon-1024.png`, `-locked` |
| `comeback` | Comeback | Square-cut circular arc + ice-blue triangular arrowhead | `badge-comeback.png`, `badge-comeback-1024.png`, `-locked` |
| `early-bird` | Early Bird | Square-cut horizon & 5 rays + ice-blue rising half-disc | `badge-early-bird.png`, `badge-early-bird-1024.png`, `-locked` |
| `night-owl` | Night Owl | Sharp crescent moon + one 4-point ice-blue star | `badge-night-owl.png`, `badge-night-owl-1024.png`, `-locked` |
| `iron-week` | Iron Week | 7 square-cut bars, 7th bar in ice blue | `badge-iron-week.png`, `badge-iron-week-1024.png`, `-locked` |
| `hotel-hero` | Hotel Hero | Tilted rounded keycard (`#9FD3FF` stripe) tucked behind a horizontal dumbbell, graphite overlap gap | `badge-hotel-hero.png`, `badge-hotel-hero-1024.png`, `-locked` |
| `plate-master` | Plate Master | Face-on weight plate with arbor hole, 3 handle cutouts, `#9FD3FF` hub collar | `badge-plate-master.png`, `badge-plate-master-1024.png`, `-locked` |

5K and 10K are both side-profile running shoes, told apart without numbers: 5K uses a short straight speed-line, 10K uses a long winding S-path. Half marathon stays the flag + closed loop.

## 2. Passport Stamps (`stamps/`)

All 8 stamp frames keep their original filenames and `2048×2048` transparent PNG dimensions for drop-in replacement, restyled as solid flat matte ink with only ~1–1.5 px micro-edge roughness (no interior speckle, grain, bleed halo, or metallic look).

Each stamp has two **empty** text bands (thin square-cut rule, no letters in the art). The app draws the text, centered, in the stamp's ink color:

- **City band** (primary): ≥70% of the stamp's inner width, height `225 px` (`10.99%` of 2048). Sized for a long all-caps name such as `SAN FRANCISCO` or `ALBUQUERQUE` (13 characters).
- **Date band** (below): about half the city-band height (`112 px`, `5.47%` of 2048) and narrower.

Band rects below are the **content box** (inside the 12 px rule) at 2048×2048. Fractions are of the 2048 canvas. Suggested max cap height is the largest Inter cap height that still fits `SAN FRANCISCO` (city) or `25 NOV 2026` (date) with padding; the app should not exceed it.

| Filename | Ink | Shape | City band `x,y,w,h` (frac) | City cap | Date band `x,y,w,h` (frac) | Date cap | Notes |
|---|---|---|---|---|---|---|---|
| `stamp-circle-ice.png` | `#9FD3FF` | circle | `444, 838, 1160, 225` (`0.2168, 0.4092, 0.5664, 0.1099`) | 97 | `676, 1099, 696, 112` (`0.3301, 0.5366, 0.3398, 0.0547`) | 68 | Color unchanged |
| `stamp-circle-silver.png` | `#8A9099` | circle | same as circle-ice | 97 | same as circle-ice | 68 | `silver` filename kept; ink is titanium |
| `stamp-rounded-rect-ice.png` | `#9FD3FF` | rect-square-cut | `444, 838, 1160, 225` (`0.2168, 0.4092, 0.5664, 0.1099`) | 97 | `676, 1099, 696, 112` (`0.3301, 0.5366, 0.3398, 0.0547`) | 68 | Square-cut corners; `rounded-rect` filename kept |
| `stamp-rounded-rect-amber.png` | `#FFFFFF` | rect-square-cut | same as rounded-rect-ice | 97 | same as rounded-rect-ice | 68 | Amber retired to white; square-cut; filename kept |
| `stamp-hexagon-silver.png` | `#8A9099` | hexagon | `472, 838, 1104, 225` (`0.2305, 0.4092, 0.5391, 0.1099`) | 91 | `696, 1099, 656, 112` (`0.3398, 0.5366, 0.3203, 0.0547`) | 67 | Bands stay inside the slants + margin |
| `stamp-shield-ice.png` | `#9FD3FF` | shield | `534, 711, 980, 225` (`0.2607, 0.3472, 0.4785, 0.1099`) | 81 | `730, 972, 588, 112` (`0.3564, 0.4746, 0.2871, 0.0547`) | 59 | Bands shifted up into the straight walls |
| `stamp-oval-amber.png` | `#FFFFFF` | oval | `454, 838, 1140, 225` (`0.2217, 0.4092, 0.5566, 0.1099`) | 94 | `684, 1099, 680, 112` (`0.3340, 0.5366, 0.3320, 0.0547`) | 68 | Amber retired to white; filename kept; bands inside the ellipse |
| `stamp-oval-silver.png` | `#8A9099` | oval | same as oval-amber | 94 | same as oval-amber | 68 | `silver` filename kept; ink is titanium |

All city and date text: **alignment `center`**, **text color = the stamp ink**. Machine-readable copies of these rects live in `manifest.json`.

Inner ornaments (stars, plane, chevrons, dashed inner rings, old small bands) were dropped so the city field stays clear.

## Previews & Metadata

- `previews/badges.jpg` — Full unlocked grid, locked row, and 96 px 1:1 strip
- `previews/stamps.jpg` — All 8 stamps on dark ground + 96 px 1:1 strip
- `previews/stamps-text-test.jpg` — **Check only, not an art asset.** Sample text `SAN FRANCISCO` / `ALBUQUERQUE` and `25 NOV 2026` rendered into the bands. The stamp PNGs themselves stay text-free.
- `previews/before-after.jpg` — Side-by-side Titanium Glass / grainy ink vs. Monolith
- `previews/strip-96px.jpg` — Dedicated 96 px 1:1 legibility check (badges unlocked, badges locked, stamps)
- `manifest.json` — Inventory, hex codes, swap notes, and per-stamp city/date band metrics
- `src/generate.py` & `src/svg/` — Reproducible SVG/PNG generator
