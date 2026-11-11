// The core review's state (SPEC 9.4, one screen since PLAN 3.5v): the saved decisions, where G is,
// the last decision for Undo and the exercise the reason chips are about. A card leaves at once (the
// decision shows before the write lands); writes run one after another; a failed write rereads what
// is really saved and says so. The stored format and the export are exactly as before.
import { useEffect, useRef, useState } from 'react';
import { db } from '../../db/schema';
import { readReview, restoreReviewDecision, saveReviewDecision } from '../../db/review';
import { CATALOG } from '../../data/muscles';
import { CATALOG_SHA } from '../../data/exerciseInfo';
import { shareOrDownload } from '../../lib/shareFile';
import {
  REASON_WORDS,
  VERDICT_WORDS,
  WRONG_CUES_NOTE,
  buildExport,
  canDecide,
  decide as decided,
  emptyReview,
  exportName,
  nextIndex,
  progress,
  restoreDecision,
  type Decision,
  type ReviewState,
  type Verdict,
  type WrongReason,
} from '../../lib/review';

const IDS = CATALOG.map((e) => e.id);
const SAVE_FAILED = 'Could not save on this phone. Your earlier decisions are kept. Try again.';

/** What Undo takes back: one exercise, as it was before, and where it was. */
type Last = { id: string; previous: Decision | undefined; index: number; words: string };

export function useCoreReview() {
  const [state, setState] = useState<ReviewState>(emptyReview);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  // Every exercise decided: the screen says so, until G goes back through them (the menu).
  const [browsing, setBrowsing] = useState(false);
  const [last, setLast] = useState<Last | null>(null);
  const [reasonFor, setReasonFor] = useState<{ id: string; picked: WrongReason } | null>(null);
  const [message, setMessage] = useState('');

  // The deck calls back from a card's flight: it must act on what is true now, not at the press.
  const now = useRef({ state, index, last });
  now.current = { state, index, last };
  const show = (s: ReviewState, i: number) => {
    now.current = { ...now.current, state: s, index: i };
    setState(s);
    setIndex(i);
  };

  // A failed read keeps whatever was read before and never turns into an empty review.
  useEffect(() => {
    let alive = true;
    readReview(db)
      .then((s) => {
        if (!alive) return;
        show(s, nextIndex(s, IDS, -1));
        setLoadError(false);
        setLoaded(true);
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [attempt]);

  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const write = (work: () => Promise<unknown>, at: number) => {
    const guarded = () =>
      work().catch(async () => {
        const stored = await readReview(db).catch(() => null);
        if (stored) show(stored, at);
        setLast(null);
        setReasonFor(null);
        setMessage(SAVE_FAILED);
      });
    chain.current = chain.current.then(guarded, guarded);
  };

  /** A decision on the exercise on top; `ask` shows the reason chips after it (a left swipe). */
  const decide = (verdict: Verdict, note = '', ask = false) => {
    const { state: s, index: i } = now.current;
    const id = IDS[i]!;
    if (!loaded || !canDecide(verdict, note)) return;
    const at = Date.now();
    const next = decided(s, id, verdict, note, at);
    const to = nextIndex(next, IDS, i);
    // The last undecided one (or the very last card): the screen says the review is done.
    if (to === i || (!s.decisions[id] && progress(next, IDS).reviewed === IDS.length)) setBrowsing(false);
    show(next, to);
    setLast({ id, previous: s.decisions[id], index: i, words: VERDICT_WORDS[verdict] });
    setReasonFor(ask ? { id, picked: 'wrong-demo' } : null);
    setMessage('');
    write(() => saveReviewDecision(db, id, verdict, note, at), i);
  };

  /** A reason chip, for the exercise that just left: the same decision, said more exactly. */
  const pickReason = (reason: WrongReason) => {
    const about = reasonFor;
    if (!about) return;
    const note = reason === 'fix-cues' ? WRONG_CUES_NOTE : '';
    const at = Date.now();
    show(decided(now.current.state, about.id, reason, note, at), now.current.index);
    setReasonFor({ id: about.id, picked: reason });
    setLast((l) => (l && l.id === about.id ? { ...l, words: REASON_WORDS[reason] } : l));
    write(() => saveReviewDecision(db, about.id, reason, note, at), IDS.indexOf(about.id));
  };

  const undo = () => {
    const was = now.current.last;
    if (!was) return;
    setLast(null);
    setReasonFor(null);
    setBrowsing(true);
    show(restoreDecision(now.current.state, was.id, was.previous), was.index);
    write(() => restoreReviewDecision(db, was.id, was.previous, Date.now()), was.index);
  };

  const step = (by: number) => {
    const to = Math.max(0, Math.min(IDS.length - 1, now.current.index + by));
    setReasonFor(null);
    setBrowsing(true);
    show(now.current.state, to);
  };

  const exportReview = async () => {
    const at = Date.now();
    const file = new File([JSON.stringify(buildExport(state, IDS, CATALOG_SHA, at), null, 2)], exportName(at), { type: 'application/json' });
    const out = await shareOrDownload(file);
    setReasonFor(null);
    setMessage(out === 'cancelled' ? '' : out === 'needs-tap' ? 'Tap Export again to share.' : out === 'shared' ? 'Review shared.' : 'Review saved.');
  };

  const counts = progress(state, IDS);
  const ex = CATALOG[index]!;
  // The card already drawn underneath: where a decision on this one leads.
  const after = nextIndex(decided(state, ex.id, 'approved', '', 0), IDS, index);
  const cards = after === index ? [ex] : [ex, CATALOG[after]!];
  return {
    loaded,
    loadError,
    retry: () => setAttempt((n) => n + 1),
    state,
    index,
    total: IDS.length,
    counts,
    allDone: loaded && counts.reviewed === counts.total && !browsing,
    ex,
    cards,
    last,
    forgetLast: () => setLast(null),
    reasonFor,
    closeReasons: () => setReasonFor(null),
    message,
    decide,
    pickReason,
    undo,
    canBack: index > 0,
    canSkip: index < IDS.length - 1,
    back: () => step(-1),
    skip: () => step(1),
    exportReview,
  };
}
