# M7 visual declaration inventory (before changes)

Source inventory grouped by file. Entries are candidates for review, not all defects: artwork, masks, photo readability and plate rendering have separate requirements. Token definitions are excluded. Multiline declarations are listed at each matching line. This static inventory does not establish computed styles or screen coverage.

## src/components/WeekdayChips.module.css

- L17 (gradient): `background: linear-gradient(color-mix(in srgb, var(--accent) 26%, transparent), color-mix(in srgb, var(--accent) 26%, transparent)), var(--surface-1);`
- L18 (shadow): `box-shadow: inset 0 0 0 1px var(--accent);`

## src/components/deck/Deck.module.css

- L149 (gradient): `background: linear-gradient(to left, color-mix(in srgb, var(--accent) 50%, transparent), transparent);`
- L156 (gradient): `background: linear-gradient(to right, color-mix(in srgb, var(--white) 50%, transparent), transparent);`
- L175 (shadow): `box-shadow: var(--accent-glow);`
- L184 (shadow): `box-shadow: 0 6px 22px color-mix(in srgb, var(--black) 45%, transparent);`

## src/components/exercise/DemoViewer.module.css

- L48 (blur): `-webkit-backdrop-filter: var(--glass-blur);`
- L49 (blur): `backdrop-filter: var(--glass-blur);`

## src/components/exercise/FormDemo.module.css

- L191 (blur): `-webkit-backdrop-filter: var(--glass-blur);`
- L192 (blur): `backdrop-filter: var(--glass-blur);`
- L213 (blur): `filter: blur(32px) brightness(0.42) saturate(1.2);`
- L233 (gradient): `-webkit-mask-image: linear-gradient(to right, transparent, black var(--seam, 0px), black calc(100% - var(--seam, 0px)), transparent);`
- L234 (gradient): `mask-image: linear-gradient(to right, transparent, black var(--seam, 0px), black calc(100% - var(--seam, 0px)), transparent);`

## src/components/gym/Gym.module.css

- L133 (gradient): `background: linear-gradient(to right, color-mix(in srgb, var(--accent) 7%, transparent), var(--surface-1) 60%);`

## src/components/load/BarSvg.tsx

- L127 (off-token color): `<stop offset="0" stopColor="#7E838B" />`
- L128 (off-token color): `<stop offset="0.28" stopColor="#D6D9DE" />`
- L129 (off-token color): `<stop offset="0.55" stopColor="#A4A8AF" />`
- L130 (off-token color): `<stop offset="1" stopColor="#53575E" />`
- L134 (off-token color): `<stop offset="0" stopColor="#5E636B" />`
- L135 (off-token color): `<stop offset="0.14" stopColor="#FFFFFF" />`
- L136 (off-token color): `<stop offset="0.26" stopColor="#DADDE2" />`
- L137 (off-token color): `<stop offset="0.55" stopColor="#8C9199" />`
- L138 (off-token color): `<stop offset="0.82" stopColor="#3F434A" />`
- L139 (off-token color): `<stop offset="1" stopColor="#9DA2A9" />`
- L142 (off-token color): `<stop offset="0" stopColor="#555A61" />`
- L143 (off-token color): `<stop offset="0.16" stopColor="#E9EBEE" />`
- L144 (off-token color): `<stop offset="0.5" stopColor="#868B92" />`
- L145 (off-token color): `<stop offset="0.85" stopColor="#33363C" />`
- L146 (off-token color): `<stop offset="1" stopColor="#7C8188" />`
- L149 (off-token color): `<stop offset="0" stopColor="#3A3B42" />`
- L150 (off-token color): `<stop offset="1" stopColor="#222328" />`
- L154 (off-token color): `<path d="M0 0L2.6 2.6M2.6 0L0 2.6" stroke="#1B1C20" strokeOpacity="0.55" strokeWidth="0.55" />`
- L158 (off-token color): `<stop offset="0" stopColor="#FFFFFF" stopOpacity="0.34" />`
- L159 (off-token color): `<stop offset="0.08" stopColor="#FFFFFF" stopOpacity="0.12" />`
- L160 (off-token color): `<stop offset="0.4" stopColor="#FFFFFF" stopOpacity="0" />`
- L161 (off-token color): `<stop offset="0.8" stopColor="#000000" stopOpacity="0.22" />`
- L162 (off-token color): `<stop offset="1" stopColor="#000000" stopOpacity="0.5" />`
- L166 (off-token color): `<stop offset="0" stopColor="#000000" stopOpacity="0.55" />`
- L167 (off-token color): `<stop offset="0.18" stopColor="#000000" stopOpacity="0.08" />`
- L168 (off-token color): `<stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.1" />`
- L169 (off-token color): `<stop offset="0.8" stopColor="#000000" stopOpacity="0.1" />`
- L170 (off-token color): `<stop offset="1" stopColor="#000000" stopOpacity="0.6" />`
- L174 (off-token color): `<stop offset="0" stopColor="#3A3D43" />`
- L175 (off-token color): `<stop offset="0.28" stopColor="#A2A6AD" />`
- L176 (off-token color): `<stop offset="0.55" stopColor="#4A4D54" />`
- L177 (off-token color): `<stop offset="1" stopColor="#141518" />`
- L180 (off-token color): `<stop offset="0" stopColor="#000000" stopOpacity="0.85" />`
- L181 (off-token color): `<stop offset="1" stopColor="#000000" stopOpacity="0" />`
- L195 (off-token color): `<rect {...frame} data-bar-part="frame" rx={Math.min(6, frame.width / 4)} fill={ref('frame')} stroke="#4A4B52" strokeWidth={1} vectorEffect="non-scaling-stroke" />`
- L269 (off-token color): `<rect x={lipX} y={rect.y - 1} width={lip} height={rect.height + 2} rx={0.8} fill="#000" opacity={0.18} />`
- L326 (off-token color): `<rect x={w * 0.14} y={y + 0.3} width={w * 0.72} height={lip} rx={lip / 2} fill={iron ? '#FFFFFF' : paint.rim} opacity={0.75} />`
- L327 (off-token color): `<rect x={w * 0.14} y={y + h - lip - 0.3} width={w * 0.72} height={lip} rx={lip / 2} fill="#FFFFFF" opacity={0.08} />`

## src/components/load/DumbbellWheel.module.css

- L118 (gradient): `background: linear-gradient(90deg, var(--sheet-bg), transparent);`
- L123 (gradient): `background: linear-gradient(270deg, var(--sheet-bg), transparent);`
- L131 (shadow): `box-shadow: inset 0 0 0 2px var(--accent);`

## src/components/load/PlateChips.module.css

- L38 (gradient): `radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--white) 45%, transparent), transparent 60%),`
- L42 (shadow): `box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--white) 22%, transparent), 0 0 0 1px var(--edge);`

## src/components/load/PlateDiagram.module.css

- L200 (gradient): `-webkit-mask-image: linear-gradient(to right, transparent 0, black 28px);`
- L201 (gradient): `mask-image: linear-gradient(to right, transparent 0, black 28px);`
- L322 (shadow): `box-shadow: inset 0 0 0 1px var(--hairline);`
- L340 (gradient): `-webkit-mask-image: linear-gradient(to right, black calc(100% - 28px), transparent);`
- L341 (gradient): `mask-image: linear-gradient(to right, black calc(100% - 28px), transparent);`
- L414 (gradient): `linear-gradient(90deg, color-mix(in srgb, var(--black) 45%, transparent), transparent 30%, transparent 70%, color-mix(in srgb, var(--black) 50%, transparent)),`
- L415 (gradient): `linear-gradient(180deg, color-mix(in srgb, var(--white) 32%, transparent), transparent 40%, color-mix(in srgb, var(--black) 40%, transparent)),`
- L418 (shadow): `box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--white) 12%, transparent), 0 0 0 1px var(--edge, transparent);`

## src/components/load/StackSelector.module.css

- L38 (gradient): `background: linear-gradient(180deg, transparent, var(--sheet-bg));`
- L77 (gradient): `background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 22%, var(--surface-solid)), color-mix(in srgb, var(--accent) 12%, var(--surface-solid)));`
- L105 (shadow): `box-shadow: inset 0 1px 2px color-mix(in srgb, var(--black) 80%, transparent);`

## src/components/muscles/MuscleMap.module.css

- L199 (shadow): `box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 50%, transparent);`

## src/lib/plateColors.ts

- L54 (off-token color): `red: { fill: '#D7322C', rim: '#FF7A70', shade: '#7A1410' },`
- L55 (off-token color): `blue: { fill: '#2D63D8', rim: '#7FA6FF', shade: '#132F72' },`
- L56 (off-token color): `yellow: { fill: '#EFC12F', rim: '#FFE58A', shade: '#8A6A08' },`
- L57 (off-token color): `green: { fill: '#2E9E4F', rim: '#7CDD95', shade: '#11512A' },`
- L58 (off-token color): `white: { fill: '#E8E8EB', rim: '#FFFFFF', shade: '#8E8E96' },`
- L59 (off-token color): `black: { fill: '#232327', rim: '#6A6A74', shade: '#050506', edge: '#8A8A94' },`
- L60 (off-token color): `gray: { fill: '#8C9098', rim: '#C4C8CF', shade: '#3E4147', edge: '#B9BDC4' },`
- L61 (off-token color): `graphite: { fill: '#6B6F77', rim: '#A5A9B1', shade: '#2C2E33', edge: '#A0A4AC' },`
- L62 (off-token color): `chrome: { fill: '#B4B9C1', rim: '#F2F4F7', shade: '#5E636B' },`
- L69 (off-token color): `export const SHEET_BG = '#1B1D21';`

## src/lib/run/mapStyle.ts

- L13 (off-token color): `// #rrggbb or the short #rgb: the build minifies tokens (#ffffff ships as #fff), any letter case.`

## src/screens/TodayScreen.module.css

- L26 (shadow): `box-shadow:`
- L189 (shadow): `box-shadow: none;`

## src/screens/intake/Focus.module.css

- L100 (gradient): `background: linear-gradient(transparent, var(--bg) var(--space-2));`

## src/screens/intake/Intake.module.css

- L68 (shadow): `box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 35%, transparent);`
- L164 (gradient): `background: linear-gradient(transparent, var(--bg));`

## src/screens/intake/IntakeEquipment.module.css

- L165 (gradient): `background: linear-gradient(to bottom, color-mix(in srgb, var(--accent) 8%, transparent), color-mix(in srgb, var(--accent) 2%, transparent)), var(--surface-1);`

## src/screens/intake/IntakeFields.module.css

- L154 (shadow): `box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 45%, transparent);`
- L167 (gradient): `-webkit-mask-image: linear-gradient(90deg, transparent, black 18%, black 82%, transparent);`
- L168 (gradient): `mask-image: linear-gradient(90deg, transparent, black 18%, black 82%, transparent);`
- L176 (shadow): `box-shadow: inset 0 0 0 2px var(--accent);`
- L189 (gradient): `linear-gradient(90deg, var(--text) 0 2px, transparent 2px),`
- L190 (gradient): `linear-gradient(90deg, color-mix(in srgb, var(--text) 55%, transparent) 0 1.5px, transparent 1.5px),`
- L191 (gradient): `linear-gradient(90deg, color-mix(in srgb, var(--text-2) 60%, transparent) 0 1px, transparent 1px);`

## src/screens/intake/IntakeNoPlan.module.css

- L74 (shadow): `box-shadow: inset 0 0 0 1.5px var(--accent);`

## src/screens/plans/Plans.module.css

- L370 (shadow): `box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent);`

## src/screens/quick/ConceptCard.module.css

- L91 (shadow): `box-shadow: 0 0 0 2px var(--accent), 0 0 28px color-mix(in srgb, var(--accent) 45%, transparent);`

## src/screens/run/RunMap.module.css

- L45 (shadow): `box-shadow: 0 2px 10px color-mix(in srgb, var(--black) 50%, transparent);`
- L66 (shadow): `box-shadow: 0 1px 6px color-mix(in srgb, var(--black) 50%, transparent);`
- L106 (shadow): `text-shadow:`

## src/screens/settings/GymDetail.tsx

- L42 (blur): `if (e.key === 'Enter') (e.target as HTMLInputElement).blur();`

## src/screens/settings/Import.module.css

- L263 (gradient): `background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--bg) 94%, transparent) 28px, color-mix(in srgb, var(--bg) 98%, transparent));`

## src/screens/settings/Restore.module.css

- L134 (gradient): `background: linear-gradient(to bottom, var(--accent-hi), var(--accent) 55%);`
- L136 (shadow): `box-shadow:`

## src/screens/today/Coach.module.css

- L184 (gradient): `background: linear-gradient(to bottom, var(--accent-hi), var(--accent) 55%);`
- L186 (shadow): `box-shadow:`

## src/screens/today/WelcomeTour.module.css

- L15 (shadow): `box-shadow:`
- L38 (shadow): `box-shadow: var(--shadow-float);`

## src/screens/workout/DayList.module.css

- L147 (gradient): `radial-gradient(90% 120% at 0% 50%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 60%),`
- L149 (shadow): `box-shadow:`
- L329 (gradient): `background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--bg) 86%, transparent) 45%, color-mix(in srgb, var(--bg) 62%, transparent));`
- L347 (shadow): `box-shadow:`

## src/screens/workout/ExerciseHead.module.css

- L108 (gradient): `background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--bg) 72%, transparent) 42%, var(--bg));`
- L136 (shadow): `text-shadow: none;`
- L142 (blur): `-webkit-backdrop-filter: var(--glass-blur);`
- L143 (blur): `backdrop-filter: var(--glass-blur);`
- L148 (shadow): `text-shadow: 0 1px 12px color-mix(in srgb, var(--black) 50%, transparent);`

## src/screens/workout/Finish.module.css

- L110 (gradient): `radial-gradient(110% 120% at 100% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%),`

## src/screens/workout/Picker.module.css

- L177 (gradient): `background: linear-gradient(to bottom, transparent, var(--sheet-bg) 30%);`

## src/screens/workout/RestDock.module.css

- L15 (blur): `-webkit-backdrop-filter: var(--glass-blur);`
- L16 (blur): `backdrop-filter: var(--glass-blur);`

## src/screens/workout/SetRow.module.css

- L75 (shadow): `box-shadow: inset 0 0 0 1px var(--hairline-strong);`
- L103 (shadow): `box-shadow: none;`
- L152 (shadow): `box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);`
- L187 (shadow): `box-shadow: inset 0 0 0 2px var(--accent), 0 0 0 4px var(--accent-soft);`
- L194 (shadow): `box-shadow: inset 0 0 0 2px var(--accent), 0 0 0 4px var(--accent-soft);`
- L201 (shadow): `box-shadow: inset 0 0 0 2px var(--accent);`

## src/screens/workout/SetTable.module.css

- L30 (blur): `-webkit-backdrop-filter: var(--glass-blur);`
- L31 (blur): `backdrop-filter: var(--glass-blur);`

## src/screens/workout/Sheets.module.css

- L198 (shadow): `box-shadow: inset 0 0 0 1px var(--accent);`

## src/screens/workout/UpNext.module.css

- L83 (shadow): `box-shadow: 0 0 18px var(--accent-glow);`

## src/screens/workout/WorkoutDock.module.css

- L63 (blur): `-webkit-backdrop-filter: var(--glass-blur);`
- L64 (blur): `backdrop-filter: var(--glass-blur);`

## src/screens/workout/WorkoutHeader.module.css

- L14 (blur): `-webkit-backdrop-filter: var(--glass-blur);`
- L15 (blur): `backdrop-filter: var(--glass-blur);`

## src/styles/transitions.css

- L68 (shadow): `box-shadow: -12px 0 32px color-mix(in srgb, var(--black) 55%, transparent);`
- L75 (shadow): `box-shadow: -12px 0 32px color-mix(in srgb, var(--black) 55%, transparent);`
- L208 (shadow): `box-shadow: none !important;`

## src/ui/BackButton.module.css

- L23 (blur): `-webkit-backdrop-filter: var(--glass-blur);`
- L24 (blur): `backdrop-filter: var(--glass-blur);`
- L25 (shadow): `box-shadow: inset 0 1px 0 color-mix(in srgb, var(--white) 7%, transparent);`
- L69 (shadow): `box-shadow: none;`
- L87 (blur): `-webkit-backdrop-filter: none;`
- L88 (blur): `backdrop-filter: none;`

## src/ui/BottomCTA.module.css

- L10 (blur): `-webkit-backdrop-filter: var(--glass-blur);`
- L11 (blur): `backdrop-filter: var(--glass-blur);`
- L24 (gradient): `background: linear-gradient(to bottom, transparent, var(--bg) 28px);`

## src/ui/Chip.module.css

- L38 (gradient): `background: linear-gradient(to right, color-mix(in srgb, var(--accent) 12%, transparent), color-mix(in srgb, var(--accent) 5%, transparent)), var(--surface-1);`
- L161 (shadow): `box-shadow: inset 0 0 0 1.5px var(--accent);`
- L218 (gradient): `background: linear-gradient(to right, color-mix(in srgb, var(--accent) 12%, transparent), color-mix(in srgb, var(--accent) 5%, transparent)), var(--surface-1);`

## src/ui/ChoiceCard.module.css

- L28 (gradient): `background: linear-gradient(to right, color-mix(in srgb, var(--accent) 7%, transparent), color-mix(in srgb, var(--accent) 2%, transparent)), var(--surface-1);`
- L88 (shadow): `box-shadow: inset 0 0 0 2px var(--hairline);`
- L93 (shadow): `box-shadow: inset 0 0 0 2px var(--accent);`
- L185 (shadow): `box-shadow: none;`

## src/ui/PRBadge.module.css

- L63 (shadow): `box-shadow: inset 0 0 0 0 transparent;`
- L66 (shadow): `box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 95%, transparent), 0 0 18px color-mix(in srgb, var(--accent) 25%, transparent);`
- L69 (shadow): `box-shadow: inset 0 0 0 2px transparent;`

## src/ui/ResumeBar.module.css

- L37 (shadow): `box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent);`

## src/ui/Skeleton.module.css

- L13 (gradient): `background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--white) 4.5%, transparent), transparent);`

## src/ui/SlidingToggle.module.css

- L15 (shadow): `box-shadow: inset 0 0 0 1px var(--hairline);`
- L71 (shadow): `box-shadow:`
- L92 (shadow): `box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 50%, transparent);`
- L115 (shadow): `box-shadow: none;`

## src/ui/Switch.module.css

- L62 (shadow): `box-shadow: 0 2px 6px color-mix(in srgb, var(--black) 35%, transparent);`

## src/ui/TopBar.module.css

- L25 (gradient): `linear-gradient(color-mix(in srgb, var(--white) 3.5%, transparent), transparent),`

## src/ui/WheelColumn.module.css

- L25 (gradient): `background: linear-gradient(to right, color-mix(in srgb, var(--accent) 10%, transparent), color-mix(in srgb, var(--accent) 4%, transparent)), var(--surface-2);`
- L49 (shadow): `box-shadow: inset 0 0 0 2px var(--accent);`
- L96 (gradient): `background: linear-gradient(var(--bg), transparent);`
- L101 (gradient): `background: linear-gradient(transparent, var(--bg));`

## src/ui/celebrate/celebrate.module.css

- L132 (gradient): `radial-gradient(70% 38% at 50% 50%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 72%),`

## src/ui/celebrate/fx/fx.module.css

- L43 (gradient): `background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 11%, transparent), transparent);`

