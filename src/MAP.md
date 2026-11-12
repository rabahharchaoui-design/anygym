# Map of src/

This file explains every folder under `src/` in plain words. If you are about to write something new, look here first, then search the folder for something that already does the job. Never write a second copy of a button, card, sheet or helper.

## The rules (from CLAUDE.md)

- Screens live in `src/screens/<area>/`. One folder per area of the app.
- Pieces shared by several screens live in `src/components/` (bigger pieces that know about AnyGym) and `src/ui/` (small, generic building blocks like buttons and sheets).
- Saving and loading data lives in `src/db/`. It is the only code that talks to the phone's database directly.
- Pure logic lives in `src/lib/`. "Pure" means it takes numbers and words in and gives numbers and words out. It never touches the screen or the database.
- Weight math lives only in `src/lib/load/`. No other file adds, converts or rounds weights. Screens never do their own arithmetic.
- One job per file. New files stay under about 300 lines. A file over 400 lines gets split the next time someone touches it, without changing what it does. A script (`npm run size`) fails the build if a file grows past its limit.
- Some folders (`src/lib/load/`, `src/lib/generator/`, `src/lib/quickStyles/`, `src/lib/coach/`, and a few more) are folders with an `index.ts` file. Importing the folder (for example `from '../lib/load'`) gives you everything that folder offers. The index file is the front door; the other files inside are the rooms.
- Test files live in `__tests__` folders next to the code they check. They are left out of this map.

## Files directly in src/

- `main.tsx`: the very first code that runs. It opens the database, restores saved drafts, then draws the app.
- `App.tsx`: the list of screens and which address (route) shows which one.
- `pwa.ts`: lets the app update itself in the background, but only when no workout is running.
- `vite-env.d.ts`: a small note for the build tool. You will almost never open it.

## Folders

### src/screens/
One folder per area of the app. The four files at the top (`TodayScreen`, `HistoryScreen`, `SettingsScreen`, `RunScreen`) are the main tabs. The `Today` and `Settings` styles sit beside them.
- `screens/today/`: the home screen. The coach card, the next workout, resume a workout, the welcome tour, the backup reminder.
- `screens/workout/`: the live workout. The list of exercises, the set table where you log weight and reps, the rest timer, the finish screen.
- `screens/history/`: looking back at finished workouts.
- `screens/plans/`: the list of workout plans, a plan's days, and plans by place (gym, hotel, home).
- `screens/quick/`: "quick workout" ideas. A deck of cards you swipe through and keep.
- `screens/intake/`: the first run questions (goals, level, equipment) that lead to a first plan.
- `screens/settings/`: gyms, the equipment of each gym, backup and restore, importing a workout history, problem reports.
- `screens/review/`: the private screens used to check exercises and muscles before they ship to people.
- `screens/dev/`: developer pages that show parts of the app on their own (plates, muscles, loads). Hidden unless a developer switch is on.

### src/components/
Bigger shared pieces that know about AnyGym. Loose files here are app wide: the shell with the tab bar, error screens, the gate that sends new people to the intake, the "rotate your phone" guard, the gym pill.
- `components/load/`: everything for entering a weight (number pad, plate picture, bar picker, dumbbell wheel, stack selector). These show weights but never do the math; they ask `lib/load/`.
- `components/exercise/`: the exercise sheet with demo, form tips and the video or photo viewer.
- `components/muscles/`: the body drawing, the muscle picker and the list of exercises for a muscle.
- `components/gym/`: the gym switcher sheet, new gym form and the preview of a switch.
- `components/deck/`: the swipeable card deck used by quick workouts and intake.
- `components/info/`: the small "i" buttons and sheets that explain a word.
- `components/hint/`: the one time hints that point at something.

### src/ui/
Small generic building blocks with no AnyGym knowledge: `Button`, `Sheet` (the slide up panel), `TopBar`, `TabBar`, `Toast`, `Chip`, `Switch`, `Skeleton` and so on. Also the motion rules (`motion.ts`: every spring and duration), screen navigation (`nav.ts`), haptics and safe area helpers.
- `ui/art/`: the drawn scenes and pictures for empty states and celebrations. Loaded on demand.
- `ui/art/passport/`: the passport style artwork (leather, paper, ink) used for milestones.
- `ui/celebrate/`: the big moments (new record, level up). `ui/celebrate/fx/` holds the particle and glow effects.
- `ui/badges/`: the badge shapes and glyphs.

### src/db/
Saving and loading. Everything here talks to the phone's database (Dexie on top of IndexedDB). `schema.ts` lists the tables, `types.ts` describes every saved record, and the rest is one file per job (workouts, gyms, plans, backup, coach data, undo, and so on). `workouts.ts` is just a front door for the `workout*.ts` files next to it. Screens should reach this folder through the helpers in `src/hooks/`.

### src/hooks/
Small React helpers: `useLive` (watch the database and re-draw when it changes), `useNow` (a ticking clock), `useWakeLock` (keep the screen on during a workout), `useMedia`, `useInView` and a few more. This is the bridge between screens and the database.

### src/lib/
Pure logic, the brain of the app. About 70 loose files, one job each, plus folders:
- `lib/load/`: the only place that does weight math (plates, bars, dumbbells, kg and lb, exact adding without rounding errors). A folder with an `index.ts` front door.
- `lib/coach/`: the progression coach. Decides the next weight, when to level up, rest times. A folder with an `index.ts`.
- `lib/generator/`: writes a plan from the intake answers and the gym's equipment. A folder with an `index.ts`.
- `lib/quickStyles/`: builds the quick workout ideas (circuit, superset, strength and others). A folder with an `index.ts`.
- `lib/intake/`: the logic behind the intake questions (options, which plan fits, equipment groups).
- `lib/candidates/`: the checks used to decide whether a new exercise or demo is good enough to ship.
- `lib/reporting/`: problem reports and crash notes, with private details masked before sending.
- `lib/import/`: reading a workout history from another app.
- `lib/bodyArt/`: the body outline drawings (front and back, male and female) used by the muscle map.
- Loose files worth knowing: `progression.ts` (last time and next target), `plans.ts` (plan shapes and timing), `planWorkout.ts` (a plan day as a workout), `setTable.ts` (rows of the set table), `backup.ts` (backup file format), `durable.ts` (keeps live workout state alive if the app is killed).

### src/data/
Small TypeScript files that load the JSON data at the top of the repo (`data/` next to `src/`: exercise catalog, plans, muscle map) and hand it to the app in a safe, checked form. This is where shipped content is bound to code. Data files are exempt from the size limit.

### src/styles/
The look. `tokens.css` is the only place colors, fonts and motion values are defined. `base.css` is the page reset, `transitions.css` holds the screen change animations. Everything else uses these tokens. A test fails if a raw color appears anywhere else.

### src/assets/
Static files shipped with the app. `assets/fonts/` holds the Inter font (with its license).

## The 15 most important files

1. `src/main.tsx`: the app's start. Open it to see what happens at launch and in which order.
2. `src/App.tsx`: every route in one place. Open it to find which screen shows at an address.
3. `src/components/AppShell.tsx`: the frame around the tab screens (tab bar, resume bar, tab arrival animation). Open it when something about the tabs or the bar looks wrong.
4. `src/db/schema.ts`: the list of database tables and every version upgrade. Open it before adding or changing saved data.
5. `src/db/types.ts`: the shape of every saved record (gym, session, set, load, plan). Open it to learn what a "Load" or a "WorkoutSet" is.
6. `src/db/workouts.ts`: the front door to starting, logging, finishing and deleting workouts. Open it to find which `workout*.ts` file holds a given action.
7. `src/lib/load/index.ts`: the front door of the weight math. Open it for any question about plates, bars, dumbbells or kg and lb.
8. `src/lib/progression.ts`: works out "last time" and "next" for one exercise. Open it when a suggested weight or rep count looks off.
9. `src/lib/coach/index.ts`: the coach's front door (levelling up, missed sessions, rest, recovery). Open it to change how the app advises.
10. `src/lib/generator/index.ts`: builds a plan from the intake answers. Open it when a generated plan is wrong or empty.
11. `src/lib/plans.ts`: the plan format, day timing estimates and the "where is the plan now" logic. Open it for anything about plan days or length.
12. `src/screens/workout/WorkoutScreen.tsx`: the live workout. Open it to follow what happens from the first set to finish.
13. `src/screens/workout/SetTable.tsx`: the table where each set is logged. Open it when the weight or reps entry misbehaves.
14. `src/ui/Sheet.tsx`: the slide up panel almost every picker uses. Open it for any sheet drag, close or focus issue.
15. `src/styles/tokens.css`: every color, font and motion value. Open it to change the look; never write a raw color elsewhere.

Honorable mentions: `src/ui/motion.ts` (all springs and durations), `src/ui/nav.ts` (screen transitions), `src/hooks/useLive.ts` (how screens read the database) and `src/lib/backup.ts` (the backup file).
