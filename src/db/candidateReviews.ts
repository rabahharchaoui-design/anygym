// G's decisions on candidate moves (PLAN 3.5e), stored on this phone (Dexie candidateReviews, backed
// up). Every write hands the approved ids to the gate (src/data/candidateGate.ts), so an approved
// move is a sure move at once; app start does the same (loadApprovals). A failed read throws: it is
// never "no decisions", so nothing is ever written over earlier work by mistake.
import { db as defaultDb, type AnyGymDB } from './schema';
import { approvedIds, isReviewRow, type CandidateReviewRow } from '../lib/candidates/review';
import { loadCandidateFile, setApproved } from '../data/candidateGate';

export async function readCandidateReviews(db: AnyGymDB = defaultDb): Promise<CandidateReviewRow[]> {
  const rows = await db.candidateReviews.toArray();
  return rows.filter(isReviewRow);
}

/** The gate gets these rows' approved ids (the candidate file is loaded first when any exist). */
export async function applyApprovals(rows: readonly CandidateReviewRow[]): Promise<number> {
  const ids = approvedIds(rows);
  if (ids.length) await loadCandidateFile();
  setApproved(ids);
  return ids.length;
}

/** App start and after a restore: this phone's approvals reach the gate. */
export async function loadApprovals(db: AnyGymDB = defaultDb): Promise<number> {
  return applyApprovals(await readCandidateReviews(db));
}

/** Writes one decision and returns the row it replaced (for Undo) and every row after it. */
export async function saveCandidateDecision(row: CandidateReviewRow, db: AnyGymDB = defaultDb): Promise<{ previous: CandidateReviewRow | undefined; rows: CandidateReviewRow[] }> {
  if (!isReviewRow(row)) throw new Error('Not a review row');
  const out = await db.transaction('rw', db.candidateReviews, async () => {
    const previous = await db.candidateReviews.get(row.id);
    await db.candidateReviews.put(row);
    return { previous, rows: (await db.candidateReviews.toArray()).filter(isReviewRow) };
  });
  await applyApprovals(out.rows);
  return out;
}

/** Undo: the id goes back to what it was before (no row: undecided again). */
export async function undoCandidateDecision(id: string, previous: CandidateReviewRow | undefined, db: AnyGymDB = defaultDb): Promise<CandidateReviewRow[]> {
  const rows = await db.transaction('rw', db.candidateReviews, async () => {
    if (previous) await db.candidateReviews.put(previous);
    else await db.candidateReviews.delete(id);
    return (await db.candidateReviews.toArray()).filter(isReviewRow);
  });
  await applyApprovals(rows);
  return rows;
}
