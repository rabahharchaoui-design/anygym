// PLAN M0 started this list of files that still wrote a raw corner (or the removed --radius-pill);
// PLAN M10 emptied it (93 files on the day Monolith started, 0 now). It stays empty:
// radiusGuard.test.ts fails on any new raw corner. A true circle (the GPS dot, the record dot, a
// progress ring) uses border-radius: 50% and data-round="ok" in its markup, and needs no entry here.
export const RADIUS_ALLOW: string[] = [];
