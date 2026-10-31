# Audit 2.5: exercise photo and cue audit

Method: both photos (0 and 1) of every exact/variant catalog entry viewed (44 unique catalog ids, 48 plan entries). Verdict keep = named movement and implement visible in both.

| planId | match | catalogId | photo 0 | photo 1 | verdict | note |
|---|---|---|---|---|---|---|
| angled-machine-leg-press | variant | Leg_Press | start position ok | end position ok | keep | Variant: Plan uses a wide stance; the photos show shoulder width feet. |
| band-internal-shoulder-rotation-0-degrees | exact | Internal_Rotation_with_Band | start position ok | end position ok | keep |  |
| barbell-back-squat | variant | Barbell_Squat | start position ok | end position ok | keep | Variant: Plan uses a wide stance; the photos show a normal stance. |
| barbell-bent-over-row | exact | Bent_Over_Barbell_Row | start position ok | end position ok | keep |  |
| barbell-bicep-curl | variant | Barbell_Curl | start position ok | end position ok | keep | Variant: Plan does wide then narrow grip; the photos show shoulder width. |
| barbell-incline-bench-press | exact | Barbell_Incline_Bench_Press_-_Medium_Grip | start position ok | end position ok | keep |  |
| barbell-straight-leg-romanian-deadlift | variant | Stiff-Legged_Barbell_Deadlift | start position ok | end position ok | keep | Variant: Keep a soft knee bend; the plan name mixes straight leg and Romanian styles. |
| bent-over-barbell-row | exact | Bent_Over_Barbell_Row | start position ok | end position ok | keep |  |
| cable-overhead-tricep-extension | variant | Cable_Rope_Overhead_Triceps_Extension | start position ok | end position ok | keep | Variant: Photos use a rope; any cable handle works the same way. |
| cable-seated-close-grip-row | exact | Seated_Cable_Rows | start position ok | end position ok | keep |  |
| cable-single-arm-bicep-curl | exact | Standing_One-Arm_Cable_Curl | start position ok | end position ok | keep |  |
| cable-tricep-pushdown | exact | Triceps_Pushdown | start position ok | end position ok | keep |  |
| crunch | exact | Crunches | start position ok | end position ok | keep |  |
| dead-bug | exact | Dead_Bug | start position ok | end position ok | keep |  |
| deadlift | exact | Barbell_Deadlift | start position ok | end position ok | keep |  |
| dumbbell-arnold-shoulder-press | exact | Arnold_Dumbbell_Press | start position ok | end position ok | keep |  |
| dumbbell-bench-press | exact | Dumbbell_Bench_Press | start position ok | end position ok | keep |  |
| dumbbell-front-raise | variant | Front_Two-Dumbbell_Raise | start position ok | end position ok | keep | Variant: Photos show two dumbbells together; the plan also allows a plate. |
| dumbbell-lateral-raise | exact | Side_Lateral_Raise | start position ok | end position ok | keep |  |
| dumbbell-shrug | exact | Dumbbell_Shrug | start position ok | end position ok | keep |  |
| dumbbell-single-arm-overhead-tricep-extension | exact | Standing_One-Arm_Dumbbell_Triceps_Extension | start position ok | end position ok | keep |  |
| dumbbell-single-arm-preacher-curl | exact | One_Arm_Dumbbell_Preacher_Curl | start position ok | end position ok | keep |  |
| elbow-plank | exact | Plank | kneeling setup, not a plank | forearm plank | downgrade | Photo 0 is a lunge-style kneeling start; doubt means none. |
| front-squat | exact | Front_Barbell_Squat | start position ok | end position ok | keep |  |
| hip-abductor | exact | Thigh_Abductor | start position ok | end position ok | keep |  |
| hip-adductor | exact | Thigh_Adductor | start position ok | end position ok | keep |  |
| hip-thrust | exact | Barbell_Hip_Thrust | start position ok | end position ok | keep |  |
| hyperextension-roman-chair-back-extension | exact | Hyperextensions_Back_Extensions | start position ok | end position ok | keep |  |
| kettlebell-goblet-squat | exact | Goblet_Squat | start position ok | end position ok | keep |  |
| lat-machine-wide-grip-pulldown | exact | Wide-Grip_Lat_Pulldown | start position ok | end position ok | keep |  |
| leg-extension | exact | Leg_Extensions | start position ok | end position ok | keep |  |
| leg-press | exact | Leg_Press | start position ok | end position ok | keep |  |
| leg-press-machine-calf-raise | exact | Calf_Press_On_The_Leg_Press_Machine | start position ok | end position ok | keep |  |
| machine-leg-press | exact | Narrow_Stance_Leg_Press | start position ok | end position ok | keep |  |
| machine-lying-leg-curl | exact | Lying_Leg_Curls | start position ok | end position ok | keep |  |
| machine-seated-calf-raise | exact | Seated_Calf_Raise | start position ok | end position ok | keep |  |
| machine-seated-chest-fly | exact | Butterfly | start position ok | end position ok | keep |  |
| machine-seated-leg-extension | exact | Leg_Extensions | start position ok | end position ok | keep |  |
| machine-seated-reverse-fly | exact | Reverse_Machine_Flyes | start position ok | end position ok | keep |  |
| narrow-grip-lat-pulldown | exact | Close-Grip_Front_Lat_Pulldown | rear view, hands overhead | rear view, bar behind neck area | downgrade | Grip width not verifiable from photos; doubt means none. |
| overhead-press | exact | Standing_Military_Press | start position ok | end position ok | keep |  |
| plank | exact | Plank | kneeling setup, not a plank | forearm plank | downgrade | Photo 0 is a lunge-style kneeling start; doubt means none. |
| romanian-deadlift | exact | Romanian_Deadlift | start position ok | end position ok | keep |  |
| single-arm-dumbbell-row | exact | One-Arm_Dumbbell_Row | start position ok | end position ok | keep |  |
| smith-machine-upright-row | exact | Smith_Machine_Upright_Row | start position ok | end position ok | keep |  |
| v-up | variant | Jackknife_Sit-Up | start position ok | end position ok | keep | Variant: Source calls it a jackknife sit up. |
| wide-grip-pull-up | variant | Pullups | start position ok | end position ok | keep | Variant: Hands wider than shoulders; the photos may show a different width. |
| finisher-jump-rope | exact | Rope_Jumping | start position ok | end position ok | keep |  |

## Cue spot check (20 cues)

| catalogId | cue | from | supported |
|---|---|---|---|
| Arnold_Dumbbell_Press | Press up, turning your palms to face forward. | [1, 2] | yes |
| Barbell_Deadlift | Grip the bar shoulder width, back as straight as possible. | [1] | yes |
| Barbell_Incline_Bench_Press_-_Medium_Grip | Press back up; take twice as long going down. | [2] | yes |
| Bent_Over_Barbell_Row | Bend forward until your back is almost flat, knees soft. | [0] | yes |
| Cable_Rope_Overhead_Triceps_Extension | Rope on the low pulley, hands straight above your head. | [0, 1] | yes |
| Close-Grip_Front_Lat_Pulldown | Knee pad snug, hands closer than shoulder width. | [0, 1] | yes |
| Dead_Bug | Straighten one leg just above the floor, then switch. | [3, 5, 6] | yes |
| Dumbbell_Shrug | Lift your shoulders as high as you can, hold a second. | [1] | yes |
| Front_Two-Dumbbell_Raise | Raise them forward to just above shoulder height. | [1] | yes |
| Hyperextensions_Back_Extensions | Ankles under the pads, thighs flat on the wide pad. | [0, 1] | yes |
| Jackknife_Sit-Up | Lift your arms and legs to meet above you. | [1] | yes |
| Leg_Press | Lower slowly until your knees reach 90 degrees. | [2] | yes |
| Narrow_Stance_Leg_Press | Feet close together on the platform, toes slightly out. | [0] | yes |
| One_Arm_Dumbbell_Preacher_Curl | Curl up and squeeze, then switch arms. | [2, 3, 4] | yes |
| Pullups | Chest up, pull until the bar reaches your upper chest. | [1, 2] | yes |
| Romanian_Deadlift | Lower the bar by pushing your hips back. | [3] | yes |
| Seated_Cable_Rows | Pull the handle to your belly, squeeze, return slowly. | [3] | yes |
| Standing_Military_Press | Grip a little wider than shoulders, bar on your collarbone. | [0, 1] | yes |
| Standing_One-Arm_Dumbbell_Triceps_Extension | Keep your elbow by your head; lower it behind. | [2] | yes |
| Triceps_Pushdown | Bar on the high pulley, overhand grip, elbows at your sides. | [0, 1] | yes |

Result: 20 of 20 cues supported by their cited source lines (also read Leg_Press and Narrow_Stance watchOut lines). No cue edits. Plank and Close-Grip_Front_Lat_Pulldown cue entries are now unreferenced by the map; tests still pass.

Downgraded to none: elbow-plank, plank, narrow-grip-lat-pulldown. Kept: 45 of 48 (exact and variant entries).
