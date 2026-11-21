// The kv row that keeps the run start screen's remembered choice (PLAN 4.2). Its own file so a
// light reader (the voice coach row on You, db/runVoice.ts) can find it without the run logic.
export const RUN_SETUP_KEY = 'anygym-run-setup';
