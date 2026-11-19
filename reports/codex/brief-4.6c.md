Codex brief for PLAN item 4.6c, written Nov 19 19:45 at commit 172eb9a3. SPEC.md wins if they disagree; code may have moved since.

## Scope and acceptance checks

1. [PLAN.md](/Users/rabah/projects/anygym/PLAN.md:62) defines six 4.6c fixes. Write failing tests first.
2. SPEC §0.1 and §4.3: never claim an unconfirmed muscle; keep an honest empty state.
3. SPEC §0.4, §12.4 and §12.10: cached photos and voice remain useful offline.
4. SPEC §12.2, §12.3 and §12.9: explain GPS gaps consistently on summary and history.
5. SPEC §15: the coach’s recovery line must describe muscles actually trained and planned.
6. The existing PWA checkpoint rule in [src/pwa.ts](/Users/rabah/projects/anygym/src/pwa.ts:1) holds updates during activity.
7. Acceptance: an update cannot reload a live run held only in memory after its first save fails.
8. Acceptance: changing one photo or voice clip changes only that file’s versioned URL.
9. Acceptance: photo and voice runtime caches opt into Workbox quota-error purging.
10. Acceptance: recovery wording uses supported exercise-specific names on **both** sides of the comparison.
11. Acceptance: both dashed-route captions state that bridged gap distance is excluded from average pace.
12. Keep this item independent of 4.5 ghost/turnaround and the unfinished 4.6b GPS fix.

## Implementation

13. [src/pwa.ts](/Users/rabah/projects/anygym/src/pwa.ts:1): have `activity()` include `runEngine.get().live`.
14. Check in-memory live state **after** the asynchronous database reads as well as using `getActiveRun()`.
15. A live engine should block even before the first write settles; do not depend only on `dirty` or a failure flag.
16. Preserve the storage-error fallback: unreadable activity must still prevent an update.
17. Both `onNeedRefresh` and `reloadWhenIdle` already call `activity()`; keep their final rechecks.
18. Check for an import cycle and initial bundle growth if importing the engine into the PWA entry point.
19. If necessary, expose a small synchronous activity accessor without importing the live run UI or MapLibre.

20. [vite.config.ts](/Users/rabah/projects/anygym/vite.config.ts:14): replace `photoVersion()` with a deterministic path-to-hash map.
21. Hash each `public/ex/<id>/<file>` independently from its bytes, with sorted paths.
22. Inject the map at build time; make failures explicit rather than silently sharing one stale production token.
23. [src/lib/photoVersion.ts](/Users/rabah/projects/anygym/src/lib/photoVersion.ts:1): update `versionedAsset()` to look up the individual relative path.
24. Preserve non-exercise paths and a deliberate unversioned development/test fallback for missing entries.
25. [src/data/exerciseInfo.ts](/Users/rabah/projects/anygym/src/data/exerciseInfo.ts:71): replace the global `__PHOTO_VERSION__` lookup with the map.
26. Keep `assetUrl()` as the common entry point so display and plan-photo warming request identical URLs.
27. Keep `PHOTO_URL_PATTERN` compatible with versioned and legacy unversioned JPG/WebP requests.
28. Verify both formats receive their own hash; changing a JPG must not invalidate its WebP twin.

29. [scripts/make-voice-pack.mjs](/Users/rabah/projects/anygym/scripts/make-voice-pack.mjs:1): write a content hash for each encoded clip in its manifest entry.
30. [src/lib/run/voice/manifest.json](/Users/rabah/projects/anygym/src/lib/run/voice/manifest.json): populate hashes from the existing committed audio bytes.
31. [src/hooks/voiceAudio.ts](/Users/rabah/projects/anygym/src/hooks/voiceAudio.ts:15): make `clipUrl()` use the clip’s hash.
32. Keep `allClipUrls()` and `warmVoicePack()` on the same URLs as playback.
33. Do not regenerate audio merely to calculate hashes; keep generation reproducible for future packs.
34. Update any tests or consumers of the pack-wide `manifest.version` before removing or retaining it.

35. [vite.config.ts](/Users/rabah/projects/anygym/vite.config.ts:173): set `purgeOnQuotaError: true` on `exercise-photos` and `run-voice` options.
36. Preserve their `CacheFirst` handlers, cache names, URL matching, and entry limits.
37. [src/db/coachData.ts](/Users/rabah/projects/anygym/src/db/coachData.ts:68): carry exercise-specific primary names through `recoveryRegions()`.
38. Extend `primaryNames()` beyond `ownShoulderLabel()`: gluteal also represents abductors, and other regions can have distinct labels.
39. Derive names from sure `infoForExercise(id).muscles.primary` targets and their regions, including overrides.
40. [src/lib/coach/today.ts](/Users/rabah/projects/anygym/src/lib/coach/today.ts:34): compare the actual primary names from yesterday and the next day.
41. Keep the existing two-name limit, card priority, kept-day behavior and no-active-workout rule.
42. [src/screens/today/useCoach.ts](/Users/rabah/projects/anygym/src/screens/today/useCoach.ts:58): pass the resolved recovery data instead of `regionWord`.
43. [src/lib/run/summary.ts](/Users/rabah/projects/anygym/src/lib/run/summary.ts:27): add a sentence to `DASHED_NOTE`:
44. “Distance bridged across a GPS gap is left out of average pace.”
45. Existing `RunSummary` and `RunDetail` both consume this constant; retain the current clock explanation.

## Data and migration

46. No Dexie table, index, stored run, backup format, or migration should change.
47. `CoachData.recovery` is an in-memory read model; update its TypeScript type and callers together.
48. Photo hashes are build metadata; voice hashes are shipped manifest metadata, not user data.
49. Existing cached URLs can remain until normal eviction; new versioned requests populate new entries.

## Edge cases and conflicts

50. A first `startRunRow()` failure sets `dirty` asynchronously; an update may arrive before its rejection.
51. A run can also start while `activity()` awaits IndexedDB; read the engine after the await.
52. A finished or discarded run must stop blocking once neither engine nor database reports it active.
53. A database read failure remains conservative even if the in-memory engine says idle.
54. Old aggregate-hash URLs will miss once on upgrade; the benefit is independent changes thereafter.
55. `maxEntries: 600` limits accumulated photo versions; it does not guarantee old versions persist.
56. Workbox quota purging covers its runtime cache writes; `warmPhotos()` writes directly with Cache Storage.
57. Direct warmer quota failures are already caught, but Workbox’s purge callback does not automatically cover them.
58. Test and document that distinction; do not claim quota recovery for direct writes without implementing it.
59. Avoid matching front delts yesterday to side delts today merely because both use `front-deltoids`.
60. Likewise, glutes and outer hips share `gluteal`; a shared drawing alone is not proof of shared wording.
61. For multiple primary targets sharing a region, retain all supported labels and intersect names deterministically.
62. Unknown or `match: none` exercises contribute no invented recovery name or overlap.
63. `rowPace()` also excludes untimed distance at an auto-pause boundary; the new sentence specifically describes bridged gaps.
64. 4.6b may change tracker distance handling; preserve its separate work and verify the caption against the final behavior.
65. `PHOTO_URL_PATTERN` currently accepts only frames `0` and `1`; D1 later proposes up to four.
66. Keep 4.6c’s current-file behavior correct, and coordinate any expanded matcher with D1.
67. [CLAUDE.md](/Users/rabah/projects/anygym/CLAUDE.md:1) requires splitting touched files over 400 lines and reusing existing helpers.

## Tests

68. Add Vitest coverage around `activity()` or an extracted injectable activity reader.
69. Reject `startRunRow()`, leave `runEngine.get().live` populated, and assert update and reload are deferred.
70. Resolve a delayed database read after starting a run; assert the final activity check still sees it.
71. Assert idle permits application, a saved run blocks it, and a rejected database read remains conservative.
72. Extend [src/lib/__tests__/pwaUpdate.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/pwaUpdate.test.ts:1) for deferred manual application and reload rechecks.
73. Extend [src/lib/__tests__/photoVersion-4.4b.test.ts](/Users/rabah/projects/anygym/src/lib/__tests__/photoVersion-4.4b.test.ts:1).
74. Assert one changed file changes only its URL, including independent JPG/WebP and unchanged non-photo assets.
75. Assert photo display and warming produce the same URL and the Workbox matcher accepts it.
76. Test actual checked-in voice manifest hashes against audio bytes; changing one fixture changes only its URL.
77. Assert playback and `allClipUrls()` agree, unknown IDs return `null`, and missing clips retain fallback behavior.
78. Inspect generated Workbox configuration or built `sw.js`: both named caches have quota purging enabled.
79. Test a quota rejection in direct warming: it is caught, does not stop the app, and can be retried.
80. Add coach tests for front versus side delts, glutes versus outer hips, and a true exact-name overlap.
81. Assert uncertain, warmup, unmatched and secondary-only muscles do not create a recovery claim.
82. Assert mixed exercises, duplicate names, two-name limit, rest day and kept-day behavior remain correct.
83. Extend run summary tests: bridged meters are excluded by `rowPace()` and `DASHED_NOTE` says so.
84. Add [tests/fixes-4.6c.spec.ts](/Users/rabah/projects/anygym/tests): run with WebKit projects **iPhone SE** and **iPhone 17 Pro Max**.
85. Simulate first-run storage failure and an update; assert no reload and the live run remains visible.
86. Seed a dashed-gap run; assert the same readable caption on finish and history detail.
87. Seed yesterday’s workout and today’s plan; assert the recovery line names only their supported overlap.
88. Use the built preview and real service worker for a cache test: warm assets, go offline, and verify reuse.
89. Verify per-file invalidation across two controlled builds or equivalent cache fixtures; assert unchanged assets are not fetched again.
90. Run `npm run test`, `npm run build`, and the targeted Playwright spec on both requested projects.
91. Check the actual production bundle impact and generated service worker; report real-iPhone quota behavior as unverified if not tested.