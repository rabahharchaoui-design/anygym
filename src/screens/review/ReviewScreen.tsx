import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/schema';
import { CATALOG } from '../../data/muscles';
import { CATALOG_SHA, infoForCatalog } from '../../data/exerciseInfo';
import { FormDemo } from '../../components/exercise/FormDemo';
import { MuscleMap } from '../../components/muscles/MuscleMap';
import { Button } from '../../ui/Button';
import { shareOrDownload } from '../../lib/shareFile';
import {
  REVIEW_KEY,
  buildExport,
  canDecide,
  decide,
  emptyReview,
  exportName,
  nextIndex,
  parseReview,
  progress,
  progressText,
  type ReviewState,
  type Verdict,
} from '../../lib/review';
import styles from './ReviewScreen.module.css';

const IDS = CATALOG.map((e) => e.id);
const VERDICT_WORDS: Record<Verdict, string> = {
  approved: 'Approved',
  'wrong-demo': 'Wrong demo',
  'wrong-muscles': 'Wrong muscles',
  'fix-cues': 'Fix cues',
};

/** Hidden owner tool (SPEC 9.4, #/review): every catalog exercise one at a time, with a verdict and an export. */
export function ReviewScreen() {
  const navigate = useNavigate();
  const [state, setState] = useState<ReviewState>(emptyReview);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const first = useRef(true);

  useEffect(() => {
    let alive = true;
    db.kv
      .get(REVIEW_KEY)
      .then((row) => {
        if (!alive) return;
        const s = parseReview(row?.value ?? null);
        setState(s);
        setIndex(nextIndex(s, IDS, -1));
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const save = (s: ReviewState) => {
    setState(s);
    void db.kv.put({ key: REVIEW_KEY, value: JSON.stringify(s), at: Date.now() }).catch(() => setMessage('Could not save on this phone.'));
  };

  const ex = CATALOG[index]!;
  const info = useMemo(() => infoForCatalog(ex.id), [ex.id]);
  const done = progress(state, IDS);
  const current = state.decisions[ex.id];
  const howTo = info.cues;

  useEffect(() => {
    if (first.current) first.current = false;
    setNoting(false);
    setNote(state.decisions[ex.id]?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.id]);

  const choose = (verdict: Verdict) => {
    if (!canDecide(verdict, note)) return;
    const s = decide(state, ex.id, verdict, verdict === 'fix-cues' ? note : '', Date.now());
    save(s);
    setMessage('');
    setIndex(nextIndex(s, IDS, index));
  };

  const exportReview = async () => {
    const now = Date.now();
    const file = new File([JSON.stringify(buildExport(state, IDS, CATALOG_SHA, now), null, 2)], exportName(now), { type: 'application/json' });
    const out = await shareOrDownload(file);
    setMessage(out === 'cancelled' ? '' : out === 'needs-tap' ? 'Tap Export again to share.' : out === 'shared' ? 'Review shared.' : 'Review saved.');
  };

  return (
    <div className={styles.page} data-testid="review-screen">
      <header className={styles.header}>
        <Button variant="tertiary" onClick={() => navigate('/settings')}>
          Done
        </Button>
        <span className={`${styles.progress} num`} data-testid="review-progress">
          {progressText(done)}
        </span>
      </header>
      {loaded && (
        <>
          <div className={styles.nav}>
            <Button variant="tertiary" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Previous exercise">
              Back
            </Button>
            <span className={`${styles.pos} num`}>
              {index + 1} of {IDS.length}
            </span>
            <Button variant="tertiary" disabled={index === IDS.length - 1} onClick={() => setIndex(index + 1)} aria-label="Next exercise">
              Skip
            </Button>
          </div>
          <section className={styles.card} data-testid="review-card" data-id={ex.id}>
            <div className={styles.titleRow}>
              <h1 className={styles.name}>{ex.name}</h1>
              {current ? (
                <span className={styles.badge} data-testid="review-verdict">
                  {VERDICT_WORDS[current.verdict]}
                </span>
              ) : (
                <span className={styles.unreviewed} data-testid="unreviewed">
                  <span className={styles.dot} aria-hidden="true" />
                  Unreviewed
                </span>
              )}
            </div>
            {info.demo ? <FormDemo demo={info.demo} name={ex.name} /> : <p className={styles.none}>No photos for this exercise.</p>}
            {info.muscles ? <MuscleMap data={info.muscles} /> : <p className={styles.none}>No muscle map (muscles not sure).</p>}
            {howTo.length > 0 ? (
              <ol className={styles.cues} data-testid="review-cues">
                {howTo.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            ) : (
              <p className={styles.none}>No cues written yet.</p>
            )}
            {info.watchOut && <p className={styles.line}>Watch out: {info.watchOut}</p>}
            {info.goodFor && <p className={styles.line}>Good for: {info.goodFor}</p>}
            {current?.note && <p className={styles.line}>Your note: {current.note}</p>}
          </section>
          {noting && (
            <label className={styles.noteBox}>
              What should the cues say?
              <textarea className={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} rows={3} data-testid="review-note" />
            </label>
          )}
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => choose('approved')}>
              Approve
            </Button>
            <div className={styles.row}>
              <Button variant="secondary" onClick={() => choose('wrong-demo')}>
                Wrong demo
              </Button>
              <Button variant="secondary" onClick={() => choose('wrong-muscles')}>
                Wrong muscles
              </Button>
            </div>
            {noting ? (
              <Button variant="secondary" onClick={() => choose('fix-cues')} disabled={!canDecide('fix-cues', note)} disabledReason="Write a note first.">
                Save cue note
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setNoting(true)}>
                Fix cues
              </Button>
            )}
          </div>
          <Button variant="tertiary" onClick={exportReview}>
            Export review
          </Button>
          <p className={styles.message} role="status" data-testid="review-message">
            {message}
          </p>
        </>
      )}
    </div>
  );
}
