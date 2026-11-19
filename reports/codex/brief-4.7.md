Codex brief for PLAN item 4.7, written Nov 19 15:02 at commit ea2cef8f. SPEC.md wins if they disagree; code may have moved since.

## 1. Applicable specification and acceptance checks

- **SPEC 12.8:** Resolve each finished run against the bundled GeoNames `cities15000` list, entirely offline.
- Choose the nearest city at most **30 km** away; otherwise display “Somewhere new.”
- Credit GeoNames and its CC BY 4.0 license on Settings → About.
- Show one city stamp with city, country flag, first run date, run count and total run distance.
- **SPEC 16:** Open a leather-and-foil passport with a roughly 600 ms 3D cover swing and fanning pages.
- Page turns work by swipe and tap and have a visible page curl.
- The ID page has a locally selected photo or configurable avatar, name, home gym, issued date and member number.
- It also shows total cities, workouts and distance, plus a decorative machine-readable strip.
- City pages include runs and workouts at city-tagged gyms; stamps show date and run distance or workout duration.
- Include visa milestones for first run, 10 cities and first marathon distance; share the open spread as an image.
- Gym creation already has an optional city field; preserve editing it and allow workouts there to earn stamps.
- **SPEC 12.9, 12.11 and 19:** Keep run finish, share card, history heatmap, backup and gym switching coherent with city data.
- **SPEC 13.3–13.4:** Exercise the device matrix, offline behavior, double taps and navigation; respect reduced motion.
- **PLAN 4.7 adds:** New-city stamp fills the screen, drops, shakes, blooms and flies to its page.
- It must support drag-to-tilt, tap-to-replay and tap-to-skip; reduced motion shows the finished stamp.
- A repeat city receives a smaller date stamp on its existing page; each city has stable shape and ink color.
- Use the eight approved frames in `.design-ref/pluto/2/`; close art issue 2 only after the feature is live.

## 2. Implementation map

- **Start with the reviewed head start:** copy only `src/lib/run/cityLookup.ts` and `src/lib/run/__tests__/cityLookup.test.ts` from branch `codex-build-4.7-1119-1144`.
- Its `nearestCity(position, cities)` returns a match or `null`; do not bring over that branch’s stray PNGs.
- **Create `src/lib/run/cities.ts`** for lazy-loading the bundled, compact GeoNames data and converting its records to lookup inputs.
- Add a reproducible preparation script and source/license notes; retain a stable GeoNames ID and country code in the generated data.
- **Change `src/hooks/runEngine.ts` → `end()`** to resolve a valid saved run position and attach the result before `finishRunRow()`.
- Keep lookup failure from losing a run: save it without a confirmed city and expose an honest fallback.
- **Change `src/db/workoutFinish.ts` → `finishLocked()`** to snapshot the confirmed gym city on the session in the existing finish transaction.
- Include `db.gyms` in that transaction; do not change the existing empty-workout, retry, Undo or plan-progress guarantees.
- **Create `src/lib/passport/`** for city identity, aggregation, milestones, stable stamp styling and presentation data.
- Derive pages from finished records; include deterministic date ordering and first activity across both runs and workouts.
- **Create `src/db/passport.ts` and a hook in `src/hooks/`** to read the required profile, gyms, runs and sessions and save ID preferences.
- Return the existing loading/error/retry pattern; do not let screens access Dexie directly.
- **Create `src/screens/passport/`** with focused components for the book, ID page, city pages, visa pages, stamp animation and sharing.
- Reuse `Leather`, `Paper` and `InkBloom` from `src/ui/art/passport/`, plus existing buttons, sheets and motion tokens.
- Add an accessible Passport entry and lazy route in `src/App.tsx`; update `src/MAP.md` for new folders.
- **Change `src/screens/run/RunFacts.tsx` and `src/screens/workout/FinishScreen.tsx`** to show the appropriate saved city moment.
- Coordinate it with `useFinishCelebration()` and `selectCelebrations()` so a PR and a stamp do not overlap.
- **Change `src/lib/run/city.ts` and `src/lib/run/heatmap.ts`** to use the same canonical city identity.
- Wire the confirmed city into the existing `RunShare`/`posterCanvas` path and `RunRecords` heatmap.
- **Change `src/screens/SettingsScreen.tsx`** for GeoNames attribution and license link.
- Extend `scripts/make-icons-3d.mjs` or its Sharp conversion approach for the approved transparent stamp assets under `public/`.
- **Change `vite.config.ts`** so the city data and needed passport assets are available offline after installation.
- Lazy import controls execution, but Workbox precaching is separately required for a first offline passport visit.
- Reuse `src/lib/shareFile.ts` and the prepared-file-before-tap pattern in `RunShare.tsx` for iOS sharing.

## 3. Data and migration

- `Run.city` and `Run.country` already exist; add an optional canonical city ID and define country as an ISO code consistently.
- Add optional city identity and display snapshot to `Session`; never infer an old workout’s location from a gym renamed later.
- `Gym.city` is currently free text only: add an optional confirmed city ID/country alongside it.
- Offer explicit offline city selection for ambiguous gym names; preserve unmatched user text without inventing a country or flag.
- Store avatar choices, issued date, member number and bounded, locally processed photo data with the profile or a dedicated record.
- Prefer optional, unindexed fields: current Dexie schema is version 11, so these alone need no version upgrade.
- If a separate passport table is chosen, add a new Dexie version and include it in backup, restore, merge and validation.
- Update `src/lib/backupChecks.ts` for each saved field and test old backups as well as new ones.
- Choose a photo representation compatible with the JSON backup format; make its local storage and backup behavior explicit in the UI.
- Derive stamps and visas from records rather than duplicating them; persist only identity, user choices and any necessary claim state.
- Do not backfill old gym workouts from today’s gym city without user confirmation.

## 4. Edge cases and decisions

- Use a valid accepted run point, with a documented deterministic choice; a run with no usable point gets no fabricated city.
- “Somewhere new” is a display fallback, not a shared city ID or an earned city stamp.
- Same-named cities in different countries, and same-country duplicates, must remain separate by GeoNames ID.
- The reviewed lookup breaks exact-distance ties by input order; make generated data order deterministic and test it.
- Save the run before announcing a stamp; a failed lookup or asset load must never block the existing finish/retry flow.
- A short or no-GPS run currently offers Discard or Keep after saving: do not permanently award a stamp before Keep.
- Snapshot the gym city at finish, including after gym switches; define which gym wins when a workout spans gyms.
- Recommended rule: use the session’s finishing gym only if the saved session actually identifies it; otherwise require an explicit choice.
- Reopening, undoing, deleting, restoring or merging activities must recalculate pages without duplicate or orphaned stamps.
- A deleted first activity must not leave incorrect first-date, totals or visa claims.
- Set a stable issued date/member number once; avoid putting anything beyond typed personal data into the decorative strip.
- Catch photo decoding, quota, share cancellation and unavailable tilt/haptics; retain usable controls and a static result.
- Long city names, flags unsupported by the device, large histories and many page turns need bounded layout and responsive rendering.
- Render share images from local assets and user-approved content; never introduce a network request for location or image generation.

## 5. Tests

- **Vitest — lookup:** retain branch tests for nearest, 30 km boundary, invalid coordinates and date line; add ties and real data parsing.
- **Vitest — identity:** same names across countries and IDs stay separate; ambiguous gym text never earns a guessed flag.
- **Vitest — aggregation:** mixed run/workout order, repeat visits, totals, deleted first activity and no-city records produce correct pages.
- **Vitest — milestones:** first run, exactly 10 distinct confirmed cities, and marathon boundary; removing qualifying data removes the visa.
- **Vitest — finish:** successful run and workout persist their city once; empty/discarded activities do not award one.
- **Vitest — durability:** failed lookup/write, double finish, workout Undo/refinish and run discard preserve existing transaction behavior.
- **Vitest — backup:** old backups restore; new identity/avatar/photo fields round-trip and merge without duplicates or invalid records.
- **Vitest — sharing:** spread content contains the selected page and local image; share/download failure leaves data intact.
- **Playwright `tests/verify-4.7.spec.ts`:** run on **iPhone SE** and **iPhone 17 Pro Max** WebKit projects.
- Verify opening, swipe/tap page turns, ID editing, photo/avatar persistence, reload, share preview and no horizontal overflow.
- Complete a new-city run and a same-city run; assert BIG then repeat stamp, correct totals and no duplicate on reload.
- Complete a city-tagged workout; test ambiguous city selection and an untagged gym without a false stamp.
- Test skip, replay, drag, reduced motion, simultaneous PR, double tap and back navigation.
- Install/cache, go offline before the first passport visit, then resolve a city, open pages and prepare a share image.
- Run the broader SPEC device matrix as well; Playwright mocks do not establish real iPhone haptic, tilt or share-sheet behavior.

## 6. Existing-code risks and conflicts

- `newCityMoment()` currently compares **run city strings only** and marks the moment `big: false`; it misses workouts and conflates names.
- `heatmap.ts` also groups by city string; changing storage alone would leave incorrect heatmaps.
- `selectCelebrations()` permits only one BIG and ranks `first_workout` ahead of `city_stamp`; PLAN requires a new-city full-screen stamp.
- Resolve that priority explicitly, sequencing moments or updating the shared rule and tests; do not silently suppress the stamp.
- `claimBig()` stores one phone-local claim per activity in `kv`, which is excluded from backup; account for restore and replay semantics.
- `Gym.city` has no country or stable identity, and sessions currently reference a gym rather than a historical city snapshot.
- Workbox currently excludes general WebP/AVIF assets and JSON from its precache patterns; lazy loading alone does not satisfy offline-first.
- The existing image script is specialized for icons; extend it carefully rather than assuming it already processes these stamp frames.
- Existing files over 400 lines must be split when touched under `CLAUDE.md`; keep each new file near 300 lines or less.
- The 4.6a fixes are still unchecked in `PLAN.md`; avoid masking their known run-read and verdict issues while integrating this item.

No files were edited.