Codex brief for PLAN item 4.4b, written Nov 19 01:04 at commit 10272278. SPEC.md wins if they disagree; code may have moved since.

# PLAN 4.4b implementation brief

## Scope and acceptance

- [PLAN.md:41](/Users/rabah/projects/anygym/PLAN.md:41) is the work item.
- It requires nine fixes, three inexpensive follow-ups, and reproduction of three audit findings before fixing them.
- PLAN assigns the builder to Opus and changes in `src/lib/gps/` or the engine reducer to Fable.
- **SPEC 9.1–9.2 and 12.11:** backups include runs; Restore offers merge or replace.
- Both restore modes must refuse while a local run is active, using the existing workout wording.
- A backup made during a run must never create an active run when restored.
- Preserve completed run data and the atomic rollback guarantees of restore.
- **SPEC 12.2–12.3:** lock prevents accidental map interactions; wake lock supports pocket mode.
- After more than `GAP_SEC` without a good GPS fix, show `--` for current pace and a GPS-lost note.
- Restart the location watch after loss; recovery must preserve honest gap and moving-time behavior.
- Surface an autosave failure once on the live screen while retries continue.
- Detect a system-released wake lock, reacquire it when visible, and warn once if it cannot be held.
- **SPEC 12.4 and 12.7:** split speech matches the displayed clock; interval name, countdown, and round are accessible.
- Resume incomplete voice-pack caching on `pageshow` and a later launch.
- **SPEC 13.1 and 13.3:** errors explain what happened; no clipped run notices; accessible controls and 130% text.
- SPEC asks for **48 pt** tap targets: use 48 × 48 for page dots, exceeding PLAN’s 44 pt minimum.
- Run `verify-4.3` and `verify-4.4` on the configured matrix, including WebKit iPhone SE and 17 Pro Max.
- Physical iPhone testing remains necessary for real wake-lock, background GPS, VoiceOver, and audio behavior.

## Files and implementation

- [src/db/backup.ts](/Users/rabah/projects/anygym/src/db/backup.ts): extend `refuseIfActive(db)` inside both restore transactions.
- Check `getActiveRun(db)` as well as active sessions; retain `ActiveWorkoutError` and “Finish your workout first”.
- In `restoreReplace` and `restoreMerge`, omit incoming run rows without `endedAt`.
- Omission preserves honest completed history without inventing an end time for an interrupted run.
- Clear stale `RUN_LIVE_KEY` transactionally when replacing run data; never import a live snapshot.
- Guard the in-memory engine too: a failed initial DB write can leave `runEngine.get().live` active with no row.
- Coordinate that guard with the restore entry point and queued run writes; do not introduce a db-to-hook dependency.
- [src/screens/settings/RestoreSheet.tsx](/Users/rabah/projects/anygym/src/screens/settings/RestoreSheet.tsx): reuse existing error presentation for both modes.
- [src/ui/Toast.tsx](/Users/rabah/projects/anygym/src/ui/Toast.tsx) and `Toast.module.css`: add an explicit wrapping variant.
- Apply it to run notices in `LiveRun`; keep the existing one-line Undo/subject contract for other screens.
- Ensure long unbroken text can wrap and an action, if present, remains visible and usable.
- [src/hooks/runEngine.ts](/Users/rabah/projects/anygym/src/hooks/runEngine.ts): expose autosave failure separately from end failure.
- Mark failure for both `startRunRow` and `saveLiveRun`; keep the latest state dirty and retry on the existing timer.
- Clear the failure only after a successful current save; avoid an older queued success masking a newer failure.
- [src/screens/run/RunScreen.tsx](/Users/rabah/projects/anygym/src/screens/run/RunScreen.tsx) and `LiveRun.tsx`: pass and present that state.
- Use a once-per-failure-episode notice such as “Run not saved yet. We’ll keep trying.”
- Retain the distinct End failure message and avoid one notice silently replacing another.
- [src/hooks/runWake.ts](/Users/rabah/projects/anygym/src/hooks/runWake.ts): attach a release listener to each acquired sentinel.
- Invalidate only the current sentinel; request again when visible, with bounded retry after rejection.
- Ignore intentional release and late promise results after detach; remove listeners where supported.
- Reuse the existing wake warning in `LiveRun` and `runFlags.ts`; ensure failed reacquisition reaches it.
- [src/screens/run/LiveMap.tsx](/Users/rabah/projects/anygym/src/screens/run/LiveMap.tsx), `RunMap.tsx`, and `RunMapGl.tsx`: pass a dynamic lock prop.
- Disable and re-enable MapLibre gesture handlers on lock changes, without recreating the map.
- Do not reuse `still`: it also changes route fitting and follow behavior for finished runs.
- [src/hooks/runEngine.ts](/Users/rabah/projects/anygym/src/hooks/runEngine.ts): run a bounded GPS-health timer for every active run.
- Compare current time with the last **accepted** fix and `GAP_SEC`; restart the watch once per loss episode or with bounded backoff.
- Do not retry permission denial in a loop; clean up timers and watches on end, detach, and restoration.
- [src/lib/run/live.ts](/Users/rabah/projects/anygym/src/lib/run/live.ts) and `LiveRun.tsx`: expose loss without altering recorded distance or split data.
- Suppress `currentPace` consistently in big and small stats while lost; show a GPS-lost note with sensible pause/denial priority.
- A new accepted fix clears loss; let the existing tracker classify the gap and reset its pace window.
- [src/hooks/voiceWarm.ts](/Users/rabah/projects/anygym/src/hooks/voiceWarm.ts): replace the permanent `started` latch with an in-flight lifecycle.
- Abort on `pagehide`, restart on `pageshow`, and allow later launches to retry failed or missing clips.
- Reuse `warmPhotos`: it skips cached URLs; prevent overlapping jobs and clean up lifecycle listeners.
- [src/screens/run/LiveRun.tsx](/Users/rabah/projects/anygym/src/screens/run/LiveRun.tsx): render interval stats outside the labelled cycle button.
- Keep `IntervalFace`’s timer label discoverable without announcing a changing countdown every 250 ms.
- [src/lib/run/voice/compose.ts](/Users/rabah/projects/anygym/src/lib/run/voice/compose.ts): floor `timeClips` like `formatElapsed`.
- Keep `paceClips` rounding: `formatPace` rounds pace independently.
- [src/lib/run/voice/events.ts](/Users/rabah/projects/anygym/src/lib/run/voice/events.ts): emit each newly completed split in order.
- Preserve each split’s count, cumulative moving time at that boundary, own pace, and configured speech frequency.
- [src/hooks/voiceSpeech.ts](/Users/rabah/projects/anygym/src/hooks/voiceSpeech.ts): if `getVoices()` is empty, wait briefly for `voiceschanged`.
- Remove the listener and resolve on timeout; never block the speech queue indefinitely.
- [src/screens/run/Live.module.css](/Users/rabah/projects/anygym/src/screens/run/Live.module.css): enlarge `.dotHit` to 48 × 48 without shifting controls.

## Audit findings: reproduce first

- Gap split: reproduce `runCues` plus `composeCue` with `last.gap === true`.
- If confirmed, make split time nullable in `VoiceEvent`; emit count and unit only for that split.
- Test that neither time nor pace is spoken, while subsequent clean splits remain correct.
- Side delts: reproduce the side-raise sheet and coach/fresh-card labels.
- Trace `src/data/muscles.ts`, `src/data/muscleExercises.ts`, `src/lib/bodyArt/`, and `src/components/muscles/MuscleExercises.tsx`.
- Carry the precise muscle label alongside the shared drawing region; do not rename the shared region globally.
- Photo cache: reproduce an updated image at the same URL against an existing CacheFirst entry.
- If confirmed, version the photo URL at the common asset construction path in `src/data/exerciseInfo.ts`.
- Update `vite.config.ts`’s `ex/` matcher to accept the query and keep warm, display, and offline lookup URLs identical.
- Verify changed versions fetch new bytes, unchanged versions reuse cache, and offline fallback remains honest.

## Data model and migration

- No Dexie version change is needed for the proposed transient failure, lock, or GPS-health state.
- Keep `Run.endedAt` semantics: absent means active; do not synthesize an end time during import.
- Preserve `splitGaps`, `splitUnit`, and `timedM` when importing completed runs.
- Check `src/lib/backupChecks.ts` validation and round trips for those additive fields before changing backup handling.
- Do not persist transient wake or autosave warnings in the run snapshot.
- Resolve the active-run/start-versus-restore race explicitly; a DB-only check cannot see an unsaved in-memory run.

## Tests

- **Vitest, `src/db/__tests__/backup-4.4b.test.ts`:** both modes refuse an active row and leave every table and snapshot unchanged.
- Test the unsaved in-memory start/restore race, incoming unfinished rows, completed rows, stale snapshot removal, and rollback.
- **Vitest, `src/hooks/__tests__/runEngine-4.3.test.ts`:** initial-write and autosave failures notify once, retry, and save the newest state.
- Cover queued failure/success ordering, end failure, detach, and no late write resurrecting a finished run.
- **Vitest, new `runWake` tests:** unexpected release, visible reacquisition, hidden return, rejection, intentional release, and late request completion.
- **Vitest, live/GPS tests:** just below, exactly at, and beyond `GAP_SEC`; rejected fixes; denial; recovery; pause and auto-pause.
- Assert one bounded watch restart and no fabricated moving time or distance across the gap.
- **Vitest, voice tests:** floor boundaries, pace rounding, multiple splits and frequency, gap-only cue, and delayed/absent voices.
- **Vitest, voice warming tests:** abort, `pageshow` restart, cached-clip reuse, offline return, failed fetch, and no duplicate job.
- **Vitest, conditional audit tests:** side/front labels stay distinct; versioned photo cache updates without breaking offline lookup.
- **Playwright, `tests/verify-4.3.spec.ts`:** inject save and wake failures; assert full wrapped text and retry behavior.
- Assert locked map drags do not move it, unlocking restores gestures, and dots have 48 pt hit boxes.
- Simulate missing GPS and accepted recovery; assert pace, note, watch restart, and dashed gap.
- **Playwright, `tests/verify-4.4.spec.ts`:** assert the interval timer’s accessible name and value are exposed.
- Simulate `pagehide`/`pageshow` during warming and verify unfinished clips are requested and cached.
- Check speech against displayed elapsed time at a fractional-second boundary and multiple split crossings.
- Run these on **iPhone SE and 17 Pro Max**, including 130% text and screenshots of wrapped notices.
- Run `npm run test`, `npm run build`, and the updated Playwright suites; check console errors and unhandled rejections.

## Risks and existing conflicts

- Item **4.4a is still unchecked** and changes the live clock; coordinate its tick with GPS aging to avoid duplicate timers or conflicting time semantics.
- GPS gap classification happens on the next accepted fix; UI aging must not preemptively mutate the tracker.
- The shared Toast deliberately enforces one line for Undo; a global wrap change would regress that contract.
- `still` on the map means “finished route”, not “temporarily locked”.
- A restored mid-run backup currently contains an unfinished row but no live snapshot; omission prevents accidental resurrection.
- VoiceOver and actual iOS wake-lock behavior cannot be established fully by mocked WebKit tests.
- The three audit fixes are conditional on reproduction; record evidence and results, including any finding not reproduced.