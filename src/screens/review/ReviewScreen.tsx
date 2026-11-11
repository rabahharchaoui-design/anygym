import { useMemo, useState } from 'react';
import { useNav } from '../../ui/nav';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import type { CatalogExercise } from '../../data/muscles';
import { ownerPreviewForCatalog } from '../../data/exerciseInfo';
import { SwipeDeck, type Decision as Swipe } from '../../components/deck/SwipeDeck';
import { Button } from '../../ui/Button';
import { REASON_WORDS, VERDICT_WORDS, WRONG_REASONS, progressText, type Decision } from '../../lib/review';
import { FitFace } from './FitFace';
import { ReviewActions, ReviewBar, ReviewNotice } from './FitChrome';
import { CoreFixSheet, InfoSheet, MapSheet, MenuSheet } from './ReviewSheets';
import { UndoChip } from './UndoChip';
import { useCoreReview } from './useCoreReview';
import styles from './Fit.module.css';

const REASONS = WRONG_REASONS.map((key) => ({ key, label: REASON_WORDS[key] }));
type Open = 'map' | 'info' | 'menu' | 'fix' | null;

/** One catalog exercise's card: its demo, its muscles, its first cue. */
function CoreFace({ ex, decision, under, onMap, onInfo }: { ex: CatalogExercise; decision: Decision | undefined; under: boolean; onMap: () => void; onInfo: () => void }) {
  const info = useMemo(() => ownerPreviewForCatalog(ex.id), [ex.id]);
  return (
    <FitFace
      demo={info.demo}
      none="No photos for this exercise."
      muscles={info.muscles}
      line={info.cues[0] ?? 'No cues written yet.'}
      lineTestId="review-cues"
      under={under}
      onMap={onMap}
      onInfo={onInfo}
      badge={
        decision && (
          <span className={styles.badge} data-testid={under ? undefined : 'review-verdict'}>
            {VERDICT_WORDS[decision.verdict]}
          </span>
        )
      }
    />
  );
}

/**
 * Hidden owner tool (SPEC 9.4, #/review): every catalog exercise, one card at a time on one fixed
 * screen (PLAN 3.5v). Swipe right to approve, left for wrong (then say what, for 3 seconds), hold
 * to fix. The small buttons do the same; Export and the rest are in the menu.
 */
export function ReviewScreen() {
  const go = useNav();
  const reduced = useReducedMotionLive();
  const r = useCoreReview();
  const [open, setOpen] = useState<Open>(null);
  const [fling, setFling] = useState<{ kind: Swipe; n: number } | null>(null);
  const press = (kind: Swipe) => setFling((f) => ({ kind, n: (f?.n ?? 0) + 1 }));
  const info = useMemo(() => ownerPreviewForCatalog(r.ex.id), [r.ex.id]);
  const note = r.state.decisions[r.ex.id]?.note ?? '';
  const close = () => setOpen(null);
  const menu = (act: () => void) => () => {
    close();
    act();
  };
  const undo = { words: r.last?.words ?? null, token: r.last, onUndo: r.undo, onGone: r.forgetLast };
  const deck = r.loaded && !r.allDone;

  return (
    <div className={styles.page} data-testid="review-screen">
      <ReviewBar
        name={deck ? r.ex.name : 'Review'}
        nameTestId="review-name"
        count={deck ? `${r.index + 1} of ${r.total}` : ''}
        countTestId="review-pos"
        backLabel="Back to Settings"
        onBack={() => go('/settings', { kind: 'pop' })}
        onMenu={() => setOpen('menu')}
      />
      <span className={styles.srOnly} role="status" data-testid="review-progress">
        {r.loaded ? progressText(r.counts) : ''}
      </span>
      {r.loadError && (
        <div className={styles.block} role="alert" data-testid="review-read-error">
          <p className={styles.blockText}>Could not read your saved decisions. Nothing was changed.</p>
          <Button variant="secondary" onClick={r.retry}>
            Try again
          </Button>
        </div>
      )}
      {r.loaded && r.allDone && (
        <div className={styles.block} data-testid="review-all-done">
          <p className={styles.blockTitle}>Every exercise is reviewed</p>
          <p className={`${styles.blockText} num`}>{progressText(r.counts)}. Export the review so the fixes can go into the app.</p>
          <Button variant="primary" onClick={() => void r.exportReview()}>
            Export review
          </Button>
          <UndoChip {...undo} />
        </div>
      )}
      {deck && (
        <>
          <div className={styles.stage} data-testid="review-card" data-id={r.ex.id}>
            <SwipeDeck
              items={r.cards}
              index={0}
              canSwap
              light
              reduced={reduced}
              onDecide={(d) => (d === 'keep' ? r.decide('approved') : r.decide('wrong-demo', '', true))}
              // The chips are about the card that left: they go as the next one leaves.
              onFlyStart={r.closeReasons}
              onNever={() => setOpen('fix')}
              holdWord="Fix"
              onNothingToSwap={() => undefined}
              fling={fling}
              label={(e) => `${e.name}. Swipe right to approve, left if it is wrong, hold to fix.`}
              renderCard={(e, at) => <CoreFace ex={e} decision={r.state.decisions[e.id]} under={at.under} onMap={() => setOpen('map')} onInfo={() => setOpen('info')} />}
            />
          </div>
          <ReviewNotice
            reasons={r.reasonFor && { options: REASONS, picked: r.reasonFor.picked, token: r.reasonFor.id, onPick: r.pickReason, onGone: r.closeReasons }}
            message={r.message}
            messageTestId="review-message"
          />
          <ReviewActions undo={undo} onWrong={() => press('swap')} onFix={() => setOpen('fix')} onApprove={() => press('keep')} ids={{ wrong: 'review-wrong', fix: 'review-fix', approve: 'review-approve' }} />
        </>
      )}
      {r.loaded && r.allDone && <ReviewNotice reasons={null} message={r.message} messageTestId="review-message" />}

      <MapSheet open={open === 'map'} onClose={close} name={r.ex.name} muscles={info.muscles} />
      <InfoSheet open={open === 'info'} onClose={close} name={r.ex.name}>
        {info.cues.length > 0 ? (
          <ol className={styles.lines} data-testid="review-all-cues">
            {info.cues.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        ) : (
          <p className={styles.line}>No cues written yet.</p>
        )}
        {info.watchOut && (
          <p className={styles.line}>
            <b>Watch out:</b> {info.watchOut}
          </p>
        )}
        {info.goodFor && (
          <p className={styles.line}>
            <b>Good for:</b> {info.goodFor}
          </p>
        )}
        {note && (
          <p className={styles.line}>
            <b>Your note:</b> {note}
          </p>
        )}
      </InfoSheet>
      <CoreFixSheet
        open={open === 'fix'}
        onClose={close}
        name={r.ex.name}
        note={note}
        onSave={(verdict, text) => {
          close();
          r.decide(verdict, text);
        }}
      />
      <MenuSheet open={open === 'menu'} onClose={close} head={r.loaded ? progressText(r.counts) : undefined}>
        {r.loaded && (
          <>
            <Button variant="secondary" disabled={!r.canBack} onClick={menu(r.back)}>
              Previous exercise
            </Button>
            <Button variant="secondary" disabled={!r.canSkip || r.allDone} onClick={menu(r.skip)}>
              Skip this one
            </Button>
          </>
        )}
        {/* PLAN 3.5e: the candidate moves waiting for G, as a review of their own. */}
        <Button variant="secondary" onClick={menu(() => go('/review/new'))} data-testid="open-new-exercises">
          Review new exercises
        </Button>
        {r.loaded && (
          <Button variant="secondary" onClick={menu(() => void r.exportReview())}>
            Export review
          </Button>
        )}
      </MenuSheet>
    </div>
  );
}
