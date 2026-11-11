import { useState } from 'react';
import { SwipeDeck, type Decision } from '../../components/deck/SwipeDeck';
import { EQUIPMENT_LABEL } from '../../lib/intake/options';
import { FIX_WORDS, type CandidateDecision, type FixReason } from '../../lib/candidates/review';
import { GROUP_WORDS, candidateMuscles, gearLine } from '../../lib/candidates/view';
import type { CandidateRecord } from '../../lib/candidates/types';
import { CandidateCard } from './CandidateCard';
import { ReviewActions, ReviewNotice } from './FitChrome';
import { InfoSheet, MapSheet } from './ReviewSheets';
import styles from './Fit.module.css';

/** What a left swipe can be about on a new move: the three things its card shows. */
const REASONS = (['photo', 'muscles', 'gear'] as const satisfies readonly FixReason[]).map((key) => ({ key, label: FIX_WORDS[key] }));
type Reason = (typeof REASONS)[number]['key'];
type Undo = { words: string | null; token: unknown; onUndo: () => void; onGone: () => void };

/**
 * The one by one deck (PLAN 3.5e, swipe friendly in 3.5i, one fixed screen in 3.5v): the card takes
 * all the room, a light flick decides (right approves, left is wrong, then what was wrong for 3
 * seconds), a hold opens Fix, the next card is already drawn underneath, and nothing asks "are you
 * sure" (Undo, for 5 seconds). The small buttons mirror the swipe.
 */
export function ReviewDeck({
  cards,
  note,
  reduced,
  message,
  undo,
  onDecide,
  onFix,
}: {
  cards: readonly CandidateRecord[];
  note: (id: string) => string;
  reduced: boolean;
  message: string;
  undo: Undo;
  onDecide: (id: string, d: CandidateDecision, fix?: { reason: FixReason; note: string }, amend?: boolean) => void;
  onFix: (c: CandidateRecord) => void;
}) {
  const [fling, setFling] = useState<{ kind: Decision; n: number } | null>(null);
  const [asking, setAsking] = useState<{ id: string; picked: Reason | null } | null>(null);
  const [sheet, setSheet] = useState<'map' | 'info' | null>(null);
  const top = cards[0];
  if (!top) return null;
  const press = (kind: Decision) => setFling((f) => ({ kind, n: (f?.n ?? 0) + 1 }));
  const why = note(top.id);
  return (
    <>
      <div className={styles.stage}>
        <SwipeDeck
          items={cards}
          index={0}
          canSwap
          light
          reduced={reduced}
          onDecide={(d) => {
            setAsking(d === 'swap' ? { id: top.id, picked: null } : null);
            onDecide(top.id, d === 'keep' ? 'approve' : 'wrong');
          }}
          // The chips are about the card that left: they go as the next one leaves.
          onFlyStart={() => setAsking(null)}
          onNever={() => onFix(top)}
          holdWord="Fix"
          onNothingToSwap={() => undefined}
          fling={fling}
          label={(c) => `${c.name}. Swipe right to approve, left if it is wrong, hold to fix.`}
          renderCard={(c, at) => <CandidateCard c={c} under={at.under} note={note(c.id)} onMap={() => setSheet('map')} onInfo={() => setSheet('info')} />}
        />
      </div>
      <ReviewNotice<Reason>
        reasons={
          asking && {
            options: REASONS,
            picked: asking.picked,
            token: asking.id,
            onGone: () => setAsking(null),
            // The move that just left: its Wrong becomes a Fix that says what.
            onPick: (reason) => {
              setAsking({ id: asking.id, picked: reason });
              onDecide(asking.id, 'fix', { reason, note: '' }, true);
            },
          }
        }
        message={message}
        messageTestId="candidate-message"
      />
      <ReviewActions undo={undo} onWrong={() => press('swap')} onFix={() => onFix(top)} onApprove={() => press('keep')} ids={{ wrong: 'candidate-wrong', fix: 'candidate-fix', approve: 'candidate-approve' }} />
      <MapSheet open={sheet === 'map'} onClose={() => setSheet(null)} name={top.name} muscles={candidateMuscles(top)} />
      <InfoSheet open={sheet === 'info'} onClose={() => setSheet(null)} name={top.name}>
        <p className={styles.line}>
          <b>Kind:</b> {GROUP_WORDS[top.pattern]}
        </p>
        <p className={styles.line}>
          <b>Gear:</b> {gearLine(top, EQUIPMENT_LABEL)}
        </p>
        <p className={styles.line}>
          <b>Muscles:</b> {candidateMuscles(top)?.text ?? 'Not sure'}
        </p>
        {why && (
          <p className={styles.line}>
            <b>Check carefully:</b> {why}
          </p>
        )}
      </InfoSheet>
    </>
  );
}
