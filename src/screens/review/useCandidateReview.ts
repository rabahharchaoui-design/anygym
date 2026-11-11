// The owner review's state (PLAN 3.5e, fast review 3.5i): the candidate file, the pre check and this
// phone's decisions; the two piles (check carefully one by one first, the rest in the grid, 9 per
// screen); the last decision or screen for Undo; and the export. Every decision is saved on the
// phone at once (a grid screen in one transaction), so the review resumes where it was, offline too.
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../db/schema';
import { readCandidateReviews, saveCandidateDecision, saveCandidateScreen, undoCandidateDecision, undoCandidateScreen } from '../../db/candidateReviews';
import { readReviewPlace, writeReviewPlace } from '../../db/reviewPlace';
import { candidateSourceSha, loadCandidateFile, ownerCandidates } from '../../data/candidateGate';
import { loadPrecheck } from '../../data/candidatePrecheck';
import { PATTERN_FILE } from '../../data/patterns';
import { assetUrl, photoEligibility } from '../../data/exerciseInfo';
import { sureLadderMoves } from '../../lib/candidates/coverage';
import { reviewOrder } from '../../lib/candidates/queue';
import { NO_PRECHECK, deckProgress, gridScreen, marksOn, screenRows, screenText, splitPiles, toggleWrong, type Marks, type Precheck, type ReviewMode } from '../../lib/candidates/fastReview';
import { approvalsFileName, buildApprovalsExport, decisionRow, type CandidateDecision, type CandidateReviewRow, type FixReason } from '../../lib/candidates/review';
import type { CandidateRecord } from '../../lib/candidates/types';
import { shareOrDownload } from '../../lib/shareFile';

/** What Undo takes back: one card, or a whole grid screen. */
type Last = { words: string; ids: string[]; previous: (CandidateReviewRow | undefined)[]; marks?: Marks };
type Fix = { reason: FixReason; note: string };
/** Cards whose photos are fetched ahead of the one on top. */
const AHEAD = 6;
const SAVE_FAILED = 'Could not save on this phone. Your earlier decisions are kept. Try again.';

export function useCandidateReview() {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState<CandidateReviewRow[]>([]);
  const [precheck, setPrecheck] = useState<Precheck>(NO_PRECHECK);
  const [place, setPlaceState] = useState(readReviewPlace);
  const [last, setLast] = useState<Last | null>(null);
  const [message, setMessage] = useState('');

  const setPlace = (next: typeof place) => {
    setPlaceState(next);
    writeReviewPlace(next);
  };

  // A failed read never turns into "nothing decided": the screen says so and offers Try again.
  useEffect(() => {
    let alive = true;
    Promise.all([loadCandidateFile(), readCandidateReviews(db), loadPrecheck()])
      .then(([, stored, pre]) => {
        if (!alive) return;
        setRows(stored);
        setPrecheck(pre);
        setFailed(false);
        setLoaded(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [attempt]);

  const byId = useMemo(() => new Map(ownerCandidates().map((c) => [c.id, c])), [loaded]);
  // Ordered against today's committed ladders (never the approvals): the order stays put as G works.
  const order = useMemo(() => (loaded ? reviewOrder(ownerCandidates(), sureLadderMoves(PATTERN_FILE.patterns, (id) => photoEligibility(id) !== 'none')) : []), [loaded]);
  const piles = useMemo(() => splitPiles(order, precheck), [order, precheck]);
  const decided = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  // Check carefully comes first, always one by one; then the grid (or one by one, if G prefers).
  const carefulLeft = piles.careful.some((id) => !decided.has(id));
  const view: 'careful' | ReviewMode = carefulLeft ? 'careful' : place.mode;
  const deckPile = view === 'careful' ? piles.careful : order;
  const cards: CandidateRecord[] = view === 'grid' ? [] : deckPile.filter((id) => !decided.has(id)).map((id) => byId.get(id)!);
  const grid = gridScreen(piles.grid, decided);
  const tiles: CandidateRecord[] = grid.ids.map((id) => byId.get(id)!);
  const marks = marksOn(grid.ids, place.marks);
  const allDone = loaded && order.length > 0 && order.every((id) => decided.has(id));
  const progress = !loaded || allDone ? '' : view === 'grid' ? screenText(grid) : deckProgress(deckPile, decided);

  // What comes next is fetched once while online, so there is no wait (and the service worker keeps
  // the photos for the gym basement).
  const ahead = view === 'grid' ? [...grid.ids, ...grid.next] : cards.slice(0, AHEAD).map((c) => c.id);
  const aheadKey = ahead.join('|');
  const fetched = useRef(new Set<string>());
  useEffect(() => {
    if (!loaded || typeof navigator === 'undefined' || !navigator.onLine) return;
    for (const id of ahead) {
      for (const p of byId.get(id)?.images.webp ?? []) {
        if (fetched.current.has(p)) continue;
        fetched.current.add(p);
        // An image, not a fetch: a reload cancels it without a page error.
        const img = new Image();
        img.onerror = () => fetched.current.delete(p);
        img.src = assetUrl(p);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, aheadKey]);

  // Writes run one after another (a fast run of swipes never races itself). The card leaves at once
  // (the rows are shown decided before the write lands); a failed write puts them back and says so.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const run = (work: () => Promise<void>) => {
    chain.current = chain.current.then(work, work);
  };
  const reread = async (shown: readonly CandidateReviewRow[]) => {
    const stored = await readCandidateReviews(db).catch(() => null);
    setRows(stored ?? ((r) => r.filter((x) => !shown.includes(x))));
    setMessage(SAVE_FAILED);
  };

  /** One card of the deck. */
  const decide = (id: string, decision: CandidateDecision, fix?: Fix) => {
    const row = decisionRow(id, decision, Date.now(), fix);
    setRows((r) => [...r.filter((x) => x.id !== id), row]);
    setLast(null);
    run(async () => {
      try {
        const { previous, rows: next } = await saveCandidateDecision(row, db);
        setRows(next);
        setLast({ words: decision === 'approve' ? 'Approved' : decision === 'wrong' ? 'Marked wrong' : 'Fix saved', ids: [id], previous: [previous] });
        setMessage('');
      } catch {
        await reread([row]);
      }
    });
  };

  /** The grid: a tap marks a tile Wrong or clears it; Fix marks it with what is wrong. */
  const toggle = (id: string) => setPlace({ ...place, marks: toggleWrong(marks, id) });
  const markFix = (id: string, fix: Fix) => setPlace({ ...place, marks: { ...marks, [id]: { decision: 'fix', ...fix } } });

  /** Approve: the whole screen in one transaction, then the next 9. */
  const approveScreen = () => {
    if (!grid.ids.length) return;
    const screen = screenRows(grid.ids, marks, Date.now());
    const had = marks;
    setRows((r) => [...r.filter((x) => !grid.ids.includes(x.id)), ...screen]);
    setPlace({ ...place, marks: {} });
    setLast(null);
    run(async () => {
      try {
        const { previous, rows: next } = await saveCandidateScreen(screen, db);
        setRows(next);
        setLast({ words: `Saved ${screen.length}`, ids: screen.map((r) => r.id), previous, marks: had });
        setMessage('');
      } catch {
        setPlace({ ...place, marks: had });
        await reread(screen);
      }
    });
  };

  const undo = () => {
    const was = last;
    if (!was) return;
    setLast(null);
    run(async () => {
      try {
        const next = was.ids.length === 1 && !was.marks ? await undoCandidateDecision(was.ids[0]!, was.previous[0], db) : await undoCandidateScreen(was.ids, was.previous, db);
        setRows(next);
        // A screen comes back as it was, its Wrong and Fix marks too.
        if (was.marks) setPlace({ ...place, marks: was.marks });
      } catch {
        setLast(was);
        setMessage('Could not undo. Try again.');
      }
    });
  };

  const exportApprovals = async () => {
    const now = Date.now();
    const data = buildApprovalsExport(rows, order, candidateSourceSha(), now);
    const file = new File([JSON.stringify(data, null, 2)], approvalsFileName(now), { type: 'application/json' });
    const out = await shareOrDownload(file);
    setMessage(out === 'cancelled' ? '' : out === 'needs-tap' ? 'Tap Export again to share.' : out === 'shared' ? 'Approvals shared.' : 'Approvals saved.');
  };

  const counts = { approved: rows.filter((r) => r.decision === 'approve').length, decided: rows.length, total: order.length };
  return {
    loaded,
    failed,
    retry: () => setAttempt((n) => n + 1),
    view,
    progress,
    cards,
    note: (id: string) => (view === 'careful' ? (precheck.notes[id] ?? 'Look closely at this one.') : ''),
    tiles,
    screen: grid.screen,
    marks,
    allDone,
    last,
    forgetLast: () => setLast(null),
    message,
    decide,
    toggle,
    markFix,
    approveScreen,
    undo,
    setMode: (mode: ReviewMode) => setPlace({ ...place, mode }),
    exportApprovals,
    counts,
  };
}
