// The owner review queue's state (PLAN 3.5e): the candidate file and this phone's decisions, the
// queue order (what is short today first), the batch G is in, the last decision for Undo, and the
// export. Every decision is saved on the phone at once, so the queue resumes where it was, offline too.
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../db/schema';
import { readCandidateReviews, saveCandidateDecision, undoCandidateDecision } from '../../db/candidateReviews';
import { candidateSourceSha, loadCandidateFile, ownerCandidates } from '../../data/candidateGate';
import { PATTERN_FILE } from '../../data/patterns';
import { assetUrl, photoEligibility } from '../../data/exerciseInfo';
import { sureLadderMoves } from '../../lib/candidates/coverage';
import { BATCH, batchView, currentBatch, reviewOrder } from '../../lib/candidates/queue';
import { approvalsFileName, buildApprovalsExport, decisionRow, type CandidateDecision, type CandidateReviewRow, type FixReason } from '../../lib/candidates/review';
import type { CandidateRecord } from '../../lib/candidates/types';
import { shareOrDownload } from '../../lib/shareFile';

type Last = { id: string; decision: CandidateDecision; previous: CandidateReviewRow | undefined };

export function useCandidateReview() {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState<CandidateReviewRow[]>([]);
  const [batch, setBatch] = useState(0);
  const [last, setLast] = useState<Last | null>(null);
  const [message, setMessage] = useState('');

  // A failed read never turns into "nothing decided": the screen says so and offers Try again.
  useEffect(() => {
    let alive = true;
    Promise.all([loadCandidateFile(), readCandidateReviews(db)])
      .then(([, stored]) => {
        if (!alive) return;
        setRows(stored);
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
  const decided = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  // Opens on the batch with the first undecided move (resumes after a reload).
  useEffect(() => {
    if (loaded) setBatch(Math.max(0, currentBatch(order, decided)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, order]);

  const view = batchView(order, decided, batch);
  const items: CandidateRecord[] = view.left.map((id) => byId.get(id)!).filter(Boolean);
  const allDone = loaded && order.length > 0 && currentBatch(order, decided) === -1;

  // The batch's photos are fetched once while online, so the service worker keeps them for the gym basement.
  useEffect(() => {
    if (!loaded || typeof navigator === 'undefined' || !navigator.onLine) return;
    for (const id of view.ids) for (const p of byId.get(id)?.images.webp ?? []) void fetch(assetUrl(p)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, batch]);

  // Writes run one after another (a fast run of swipes never races itself). The card leaves at once
  // (the row is shown decided before the write lands); a failed write puts it back and says so.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const run = (work: () => Promise<void>) => {
    chain.current = chain.current.then(work, work);
  };

  const decide = (id: string, decision: CandidateDecision, fix?: { reason: FixReason; note: string }) => {
    const row = decisionRow(id, decision, Date.now(), fix);
    setRows((r) => [...r.filter((x) => x.id !== id), row]);
    setLast(null);
    run(async () => {
      try {
        const { previous, rows: next } = await saveCandidateDecision(row, db);
        setRows(next);
        setLast({ id, decision, previous });
        setMessage('');
      } catch {
        setRows((await readCandidateReviews(db).catch(() => null)) ?? ((r) => r.filter((x) => x !== row)));
        setMessage('Could not save on this phone. Your earlier decisions are kept. Try again.');
      }
    });
  };

  const undo = () => {
    const was = last;
    if (!was) return;
    setLast(null);
    run(async () => {
      try {
        setRows(await undoCandidateDecision(was.id, was.previous, db));
        // The batch it came from shows again (it may have been the last move of the batch).
        setBatch(Math.floor(order.indexOf(was.id) / BATCH));
      } catch {
        setLast(was);
        setMessage('Could not undo. Try again.');
      }
    });
  };

  const nextBatch = () => setBatch(Math.max(0, currentBatch(order, decided)));

  const exportApprovals = async () => {
    const now = Date.now();
    const data = buildApprovalsExport(rows, order, candidateSourceSha(), now);
    const file = new File([JSON.stringify(data, null, 2)], approvalsFileName(now), { type: 'application/json' });
    const out = await shareOrDownload(file);
    setMessage(out === 'cancelled' ? '' : out === 'needs-tap' ? 'Tap Export again to share.' : out === 'shared' ? 'Approvals shared.' : 'Approvals saved.');
  };

  const counts = { approved: rows.filter((r) => r.decision === 'approve').length, decided: rows.length, total: order.length };
  const byName = (id: string) => byId.get(id)?.name ?? '';
  return { byName, loaded, failed, retry: () => setAttempt((n) => n + 1), items, view, allDone, last, message, decide, undo, nextBatch, exportApprovals, counts };
}
