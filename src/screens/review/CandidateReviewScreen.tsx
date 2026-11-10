import { useState } from 'react';
import { useNav } from '../../ui/nav';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { SwipeDeck, type Decision } from '../../components/deck/SwipeDeck';
import { DeckButtons } from '../../components/deck/DeckButtons';
import { Button } from '../../ui/Button';
import { CheckIcon, XIcon } from '../../ui/icons';
import { batchText } from '../../lib/candidates/queue';
import type { CandidateDecision } from '../../lib/candidates/review';
import { CandidateCard } from './CandidateCard';
import { FixSheet } from './FixSheet';
import { useCandidateReview } from './useCandidateReview';
import styles from './CandidateReview.module.css';

const DONE_WORDS: Record<CandidateDecision, string> = { approve: 'Approved', wrong: 'Marked wrong', fix: 'Fix saved' };

/**
 * New exercises (PLAN 3.5e, owner only, #/review/new): one card per candidate move. Swipe right or
 * Approve, swipe left or Wrong, Fix for details. Batches of 20, Undo for the last decision, saved on
 * the phone at once. Approved moves are sure moves on this phone from then on; nothing else ever shows.
 */
export function CandidateReviewScreen() {
  const go = useNav();
  const reduced = useReducedMotionLive();
  const q = useCandidateReview();
  const [fling, setFling] = useState<{ kind: Decision; n: number } | null>(null);
  const [fixing, setFixing] = useState(false);
  const top = q.items[0];
  // The card the Fix sheet is about: fixed when it opens, so its name never changes under it.
  const [fixFor, setFixFor] = useState<typeof top>(undefined);

  const onDecide = (d: Decision) => top && q.decide(top.id, d === 'keep' ? 'approve' : 'wrong');
  const press = (kind: Decision) => setFling((f) => ({ kind, n: (f?.n ?? 0) + 1 }));
  const lastName = q.last ? q.byName(q.last.id) : '';

  return (
    <div className={styles.page} data-testid="candidate-review">
      <header className={styles.header}>
        <Button variant="tertiary" onClick={() => go('/review', { kind: 'pop' })}>
          Back
        </Button>
        <span className={`${styles.progress} num`} data-testid="batch-progress">
          {q.loaded && !q.allDone ? batchText(q.view) : ''}
        </span>
      </header>
      <h1 className={styles.title}>New exercises</h1>
      {q.failed && (
        <div role="alert" className={styles.empty} data-testid="candidate-read-error">
          <p>Could not read your saved decisions. Nothing was changed.</p>
          <Button variant="secondary" onClick={q.retry}>
            Try again
          </Button>
        </div>
      )}
      {q.loaded && top && (
        <>
          <SwipeDeck
            items={q.items}
            index={0}
            canSwap
            reduced={reduced}
            onDecide={onDecide}
            onNothingToSwap={() => undefined}
            fling={fling}
            label={(c) => `${c.name}. Swipe right to approve, left if it is wrong.`}
            renderCard={(c, at) => <CandidateCard c={c} under={at.under} />}
          />
          <p className={styles.notice} role="status" data-testid="candidate-notice">
            {q.last && (
              <>
                <span className={styles.noticeText}>
                  {DONE_WORDS[q.last.decision]}: {lastName}
                </span>
                <button type="button" className={`${styles.undo} pressable`} onClick={q.undo} data-testid="candidate-undo">
                  Undo
                </button>
              </>
            )}
          </p>
          <DeckButtons
            left={{ kind: 'swap', testId: 'candidate-wrong', onClick: () => press('swap'), icon: <XIcon width={20} height={20} strokeWidth={2.6} aria-hidden="true" />, label: <span>Wrong</span> }}
            middle={{ kind: 'other', testId: 'candidate-fix', onClick: () => {
              setFixFor(top);
              setFixing(true);
            }, icon: null, label: <span>Fix</span> }}
            right={{ kind: 'keep', testId: 'candidate-approve', onClick: () => press('keep'), icon: <CheckIcon width={20} height={20} strokeWidth={2.8} aria-hidden="true" />, label: <span>Approve</span> }}
          />
        </>
      )}
      {/* Outside the deck's branch, so a closing sheet always finishes leaving whatever the deck does. */}
      <FixSheet
        name={fixFor?.name ?? ''}
        open={fixing && !!fixFor}
        onClose={() => setFixing(false)}
        onSave={(fix) => {
          setFixing(false);
          if (fixFor) q.decide(fixFor.id, 'fix', fix);
        }}
      />
      {q.loaded && !top && (
        <div className={styles.empty} data-testid={q.allDone ? 'candidates-all-done' : 'batch-done'}>
          <p className={styles.emptyTitle}>{q.allDone ? 'Every new exercise is decided' : `Batch ${q.view.index + 1} done`}</p>
          <p className={styles.emptyText}>
            {q.counts.approved} approved so far. Approved moves show in your workouts on this phone now. Export them so they can go into the app for everyone.
          </p>
          {!q.allDone && (
            <Button variant="primary" onClick={q.nextBatch} data-testid="next-batch">
              Next batch
            </Button>
          )}
          {q.last && (
            <Button variant="tertiary" onClick={q.undo} data-testid="candidate-undo">
              Undo the last one
            </Button>
          )}
        </div>
      )}
      {q.loaded && (
        <Button variant="tertiary" onClick={() => void q.exportApprovals()} data-testid="export-approvals">
          Export approvals
        </Button>
      )}
      <p className={styles.message} role="status" data-testid="candidate-message">
        {q.message}
      </p>
    </div>
  );
}
