// PLAN 3.5i: a grid screen is saved in one transaction (all 9 rows or none), reaches the gate at
// once, can be undone as one, and the review resumes on the next screen; the committed pre check
// file loads through its typed loader.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { readCandidateReviews, saveCandidateDecision, saveCandidateScreen, undoCandidateScreen } from '../candidateReviews';
import { PLACE_KEY, readReviewPlace, writeReviewPlace } from '../reviewPlace';
import { isApprovedCandidate, loadCandidateFile, ownerCandidates, setApproved } from '../../data/candidateGate';
import { loadPrecheck } from '../../data/candidatePrecheck';
import { START_PLACE, gridScreen, screenRows, splitPiles } from '../../lib/candidates/fastReview';
import { decisionRow } from '../../lib/candidates/review';

let db: AnyGymDB;
let name: string;
let order: string[];
beforeEach(async () => {
  await loadCandidateFile();
  order = ownerCandidates().map((c) => c.id);
  setApproved([]);
  name = `cand-35i-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
  setApproved([]);
});

describe('Approve saves the screen in one transaction', () => {
  it('writes all 9 rows, the approved ones are sure at once, and the next screen is the next 9', async () => {
    // G's earlier approvals stay and are skipped.
    for (const id of order.slice(0, 5)) await saveCandidateDecision(decisionRow(id, 'approve', 1), db);
    const before = new Set((await readCandidateReviews(db)).map((r) => r.id));
    const first = gridScreen(order, before);
    expect(first.ids).toEqual(order.slice(5, 14));
    const { previous, rows } = await saveCandidateScreen(screenRows(first.ids, { [first.ids[2]!]: { decision: 'wrong' }, [first.ids[4]!]: { decision: 'fix', reason: 'photo', note: '' } }, 9), db);
    expect(previous).toEqual(Array(9).fill(undefined));
    expect(rows).toHaveLength(14);
    expect(rows.filter((r) => r.decision === 'approve')).toHaveLength(12);
    expect(isApprovedCandidate(first.ids[0]!)).toBe(true);
    expect(isApprovedCandidate(first.ids[2]!)).toBe(false);
    expect(isApprovedCandidate(first.ids[4]!)).toBe(false);
    for (const id of order.slice(0, 5)) expect(isApprovedCandidate(id)).toBe(true);
    // Resume (a reload reads the table again): exactly the next screen.
    const after = gridScreen(order, new Set((await readCandidateReviews(db)).map((r) => r.id)));
    expect(after.ids).toEqual(first.next);
    expect(after.screen).toBe(2);
  });

  it('is all or nothing: one row that cannot be written leaves none of the 9', async () => {
    const screen = screenRows(order.slice(0, 9), {}, 3);
    db.candidateReviews.hook('creating', (key) => {
      if (key === order[6]) throw new Error('disk full');
    });
    await expect(saveCandidateScreen(screen, db)).rejects.toThrow();
    expect(await readCandidateReviews(db)).toEqual([]);
    expect(isApprovedCandidate(order[0]!)).toBe(false);
  });

  it('refuses rows that are not review rows, and the same id twice', async () => {
    const screen = screenRows(order.slice(0, 3), {}, 3);
    await expect(saveCandidateScreen([...screen, { id: 'x', decision: 'maybe', at: 1 } as never], db)).rejects.toThrow();
    await expect(saveCandidateScreen([...screen, screen[0]!], db)).rejects.toThrow();
    expect(await readCandidateReviews(db)).toEqual([]);
  });

  it('Undo takes the whole screen back in one go and keeps what was there before', async () => {
    const kept = decisionRow(order[1]!, 'wrong', 1);
    await saveCandidateDecision(kept, db);
    const ids = order.slice(0, 9);
    const { previous } = await saveCandidateScreen(screenRows(ids, {}, 5), db);
    expect(isApprovedCandidate(order[1]!)).toBe(true);
    const rows = await undoCandidateScreen(ids, previous, db);
    expect(rows).toEqual([kept]);
    expect(isApprovedCandidate(order[0]!)).toBe(false);
    expect(isApprovedCandidate(order[1]!)).toBe(false);
  });
});

describe('the pre check file and the stored place', () => {
  it('the committed file loads typed, and only ever names candidates', async () => {
    const pre = await loadPrecheck();
    expect(Array.isArray(pre.checkCarefully)).toBe(true);
    const piles = splitPiles(order, pre);
    expect(piles.careful.length + piles.grid.length).toBe(order.length);
    expect(piles.careful.length).toBe(pre.checkCarefully.filter((id) => order.includes(id)).length);
    for (const id of Object.keys(pre.notes)) expect(pre.checkCarefully).toContain(id);
  });

  it('the place survives a reload; no storage or broken storage starts fresh', () => {
    const store = new Map<string, string>();
    const real = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
    try {
      expect(readReviewPlace()).toEqual(START_PLACE);
      const place = { mode: 'grid' as const, marks: { [order[3]!]: { decision: 'wrong' as const } } };
      writeReviewPlace(place);
      expect(readReviewPlace()).toEqual(place);
      store.set(PLACE_KEY, '{not json');
      expect(readReviewPlace()).toEqual(START_PLACE);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: real });
    }
  });
});
