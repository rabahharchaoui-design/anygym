# Session 4 report (in progress)

Branch `s4-run` from tag `pre-s4` (master 294654c0, Nov 17 2026, Session 3 merged and live).

## Run log
- 4.1 (Nov 17): the GPS engine for runs is in: it throws out bad fixes, measures distance, pace, splits and pauses, and marks gaps honestly instead of guessing. Tested on made up tracks (a noisy loop, spikes, a gap, standing still). Nothing to see in the app yet.
- Checkpoint 4.1 live (Nov 17): check, build and deploy green on master, live check passed.
- 4.2 (Nov 17): the Run tab has its start screen: a dark map of where you are as the hero, a GPS chip that never blocks Start, run types with distance and time pickers, Spotify and Apple Music buttons, and a 3, 2, 1 countdown. After the countdown it only says "Run started" with Stop: the live run screen is 4.3. One review round: the map was a thin strip at first; I also asked to remove the gym pill and took that back because SPEC 19 keeps it on Run. To check on the phone: whether the music buttons open the apps from the Home Screen app.
