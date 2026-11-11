// Review persistence (SPEC 9.4). A failed read is never "no decisions": it throws, so the caller can
// show a retryable error and never writes an empty decision set over earlier work. Each verdict is
// merged into the stored state inside one read/write transaction, so two tabs keep both.
import type { AnyGymDB } from './schema';
import { REVIEW_KEY, decide, emptyReview, parseReview, restoreDecision, type Decision, type ReviewState, type Verdict } from '../lib/review';

function parseStored(raw: string | null | undefined): ReviewState {
  if (raw == null) return emptyReview();
  JSON.parse(raw); // a stored value that is not JSON is a read failure, not an empty review
  return parseReview(raw);
}

export async function readReview(db: AnyGymDB): Promise<ReviewState> {
  const row = await db.kv.get(REVIEW_KEY);
  return parseStored(row?.value);
}

/** Merges one verdict into the stored decisions and returns the committed state. */
export async function saveReviewDecision(db: AnyGymDB, id: string, verdict: Verdict, note: string, at: number): Promise<ReviewState> {
  return db.transaction('rw', db.kv, async () => {
    const row = await db.kv.get(REVIEW_KEY);
    const next = decide(parseStored(row?.value), id, verdict, verdict === 'fix-cues' ? note : '', at);
    await db.kv.put({ key: REVIEW_KEY, value: JSON.stringify(next), at });
    return next;
  });
}

/** Undo (PLAN 3.5v): puts one exercise back as it was before its last decision, in the same stored format. */
export async function restoreReviewDecision(db: AnyGymDB, id: string, previous: Decision | undefined, at: number): Promise<ReviewState> {
  return db.transaction('rw', db.kv, async () => {
    const row = await db.kv.get(REVIEW_KEY);
    const next = restoreDecision(parseStored(row?.value), id, previous);
    await db.kv.put({ key: REVIEW_KEY, value: JSON.stringify(next), at });
    return next;
  });
}
