import { useState } from 'react';
import { useNav } from '../../ui/nav';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { Button } from '../../ui/Button';
import type { CandidateRecord } from '../../lib/candidates/types';
import { FixSheet } from './FixSheet';
import { ReviewDeck } from './ReviewDeck';
import { ReviewGrid } from './ReviewGrid';
import { UndoChip } from './UndoChip';
import { useCandidateReview } from './useCandidateReview';
import styles from './CandidateReview.module.css';

/**
 * New exercises (PLAN 3.5e, fast review 3.5i; owner only, #/review/new). The moves the pre check was
 * unsure about come first, one by one in the swipe deck with the reason on the card. All the others
 * come 9 to a screen, approved unless tapped: tap the wrong ones, hold one to say what is wrong, then
 * Approve. Saved on the phone at once; approved moves are sure moves on this phone from then on.
 */
export function CandidateReviewScreen() {
  const go = useNav();
  const reduced = useReducedMotionLive();
  const q = useCandidateReview();
  // The move the Fix sheet is about: fixed when it opens, so its name never changes under it.
  const [fixFor, setFixFor] = useState<CandidateRecord | null>(null);
  const [fixing, setFixing] = useState(false);
  const openFix = (c: CandidateRecord) => {
    setFixFor(c);
    setFixing(true);
  };
  const grid = q.view === 'grid';
  const showGrid = q.loaded && grid && q.tiles.length > 0;
  const showDeck = q.loaded && !grid && q.cards.length > 0;

  return (
    <div className={styles.page} data-testid="candidate-review" data-view={q.loaded ? q.view : undefined}>
      <header className={styles.header}>
        <Button variant="tertiary" onClick={() => go('/review', { kind: 'pop' })}>
          Back
        </Button>
        <UndoChip words={q.last?.words ?? null} token={q.last} onUndo={q.undo} onGone={q.forgetLast} />
        <span className={`${styles.progress} num`} data-testid="review-progress">
          {q.progress}
        </span>
      </header>
      <h1 className={showGrid ? styles.title : styles.srOnly}>{showGrid ? 'Tap the wrong ones' : 'New exercises'}</h1>
      {q.failed && (
        <div role="alert" className={styles.empty} data-testid="candidate-read-error">
          <p>Could not read your saved decisions. Nothing was changed.</p>
          <Button variant="secondary" onClick={q.retry}>
            Try again
          </Button>
        </div>
      )}
      {showGrid && <ReviewGrid tiles={q.tiles} marks={q.marks} screen={q.screen} reduced={reduced} onToggle={q.toggle} onFix={openFix} onApprove={q.approveScreen} />}
      {showDeck && <ReviewDeck cards={q.cards} note={q.note} reduced={reduced} onDecide={q.decide} onFix={openFix} />}
      {/* Outside the views, so a closing sheet always finishes leaving whatever they do. */}
      <FixSheet
        name={fixFor?.name ?? ''}
        open={fixing && !!fixFor}
        onClose={() => setFixing(false)}
        onSave={(fix) => {
          setFixing(false);
          if (!fixFor) return;
          if (grid) q.markFix(fixFor.id, fix);
          else q.decide(fixFor.id, 'fix', fix);
        }}
      />
      {q.loaded && !showGrid && !showDeck && (
        <div className={styles.empty} data-testid="candidates-all-done">
          <p className={styles.emptyTitle}>Every new exercise is decided</p>
          <p className={`${styles.emptyText} num`}>
            {q.counts.approved} approved. They show in your workouts on this phone now. Export them so they can go into the app for everyone.
          </p>
        </div>
      )}
      {q.loaded && (
        <div className={styles.foot}>
          {q.view !== 'careful' && !q.allDone && (
            <Button variant="tertiary" onClick={() => q.setMode(grid ? 'deck' : 'grid')} data-testid="review-mode">
              {grid ? 'One by one' : 'Grid of 9'}
            </Button>
          )}
          <Button variant="tertiary" onClick={() => void q.exportApprovals()} data-testid="export-approvals">
            Export approvals
          </Button>
        </div>
      )}
      <p className={styles.message} role="status" data-testid="candidate-message">
        {q.message}
      </p>
    </div>
  );
}
