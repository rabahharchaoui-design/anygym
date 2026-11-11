import { useState } from 'react';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { UndoIcon } from '../../ui/icons';
import { demoFor } from '../../data/exerciseInfo';
import { conceptMinutes, metaLine, warmUpLine, type QuickItem } from '../../lib/quick';
import { detailRows } from '../../lib/quickNotes';
import { FactSheet, HideAskSheet, SixSheet, type Fact } from '../../components/deck/CurateSheets';
import curate from '../../components/deck/Curate.module.css';
import { Deck, DeckButtons, itemLine } from './Deck';
import type { useDeck } from './useDeck';
import styles from './Quick.module.css';

// "Curate it" (PLAN 3.5a, SPEC 20.3; 3.5f): the deck of the chosen workout, or of today's plan day
// (Preview), one exercise per card. One line above the card (a hint, a notice with Undo, "Show me 6"
// or the honest end), Swap, Hide and Keep under it, and Start pinned at the bottom: glass while the
// cards are being decided (Keep is the action then), accent once the deck is done.

type Props = {
  deck: ReturnType<typeof useDeck>;
  reduced: boolean;
  error: string;
  onBack: () => void;
  onStart: () => void;
  /** Today's plan day, looked through before Start: its own title and Start words. */
  preview?: { title: string };
};

export function CurateStage({ deck, reduced, error, onBack, onStart, preview }: Props) {
  const { stage, notice, hint } = deck;
  const [fact, setFact] = useState<Fact | null>(null);
  if (!stage) return null;
  const done = stage.index >= stage.items.length;
  const total = conceptMinutes({ items: stage.items, ...(stage.plan ? { plan: stage.plan } : {}) });
  // 3.5f round 3 (polish): one label for the action everywhere.
  const label = 'Start workout';
  const info = (item: QuickItem) => setFact({ name: item.name, why: item.why, more: item.more ?? '', rows: [itemLine(item), ...detailRows(item, stage.items)] });
  const noticeRow = (
    <div className={styles.notice} data-testid="deck-hint" aria-live="polite">
      {notice ? (
        <>
          <span className={styles.noticeText}>{notice.text}</span>
          {notice.undo && (
            <button type="button" className={`${styles.undo} pressable`} onClick={notice.undo}>
              <UndoIcon width={16} height={16} strokeWidth={2.2} aria-hidden="true" />
              Undo
            </button>
          )}
        </>
      ) : done ? null : deck.atEnd ? (
        <span className={styles.noticeText} data-testid="deck-end">
          {deck.endLine}
        </span>
      ) : deck.sixOffered ? (
        <button type="button" className={`${curate.offer} pressable`} data-testid="show-six" onClick={() => deck.setSixOpen(true)}>
          Show me {deck.six.length}
        </button>
      ) : hint ? (
        'Right keeps it, left swaps it.'
      ) : (
        'Hold a card: never show it again.'
      )}
    </div>
  );
  return (
    <div className={styles.screen} data-stage={done ? 'ready' : 'deck'} data-preview={preview ? '' : undefined} data-scroller>
      {/* One compact bar (round 2, B1, P14): the title never takes the card's room. */}
      <header className={styles.deckHead}>
        <BackButton label={preview ? 'Back to Today' : 'Back to the workouts'} onPress={onBack} />
        <div className={styles.deckHeadText}>
          <h1 className={styles.deckTitle}>{done ? 'Ready to go' : (preview?.title ?? stage.concept.title)}</h1>
          <p className={`${styles.deckMeta} num`} data-testid="curate-meta">
            {metaLine(stage.items, total)}
          </p>
        </div>
        {!done && (
          <p className={`${styles.deckCount} num`} data-testid="deck-count" aria-hidden="true">
            {stage.index + 1} of {stage.items.length}
          </p>
        )}
      </header>
      {done && notice ? noticeRow : null}
      {done ? (
        <ol aria-label="Ready to go" className={styles.ready} data-testid="ready-list" data-reduced={reduced || undefined}>
          {/* Round 3 (M8): Start opens with the plan's warm up; the list says so first. */}
          {stage.concept.warmUp && (
            <li className={styles.readyRow} data-warmup="" data-testid="ready-warmup">
              <span className={styles.readyName}>{warmUpLine(stage.concept.warmUp)}</span>
              <span className={`${styles.readySets} num`}>First</span>
            </li>
          )}
          {stage.items.map((it, i) => (
            <li key={it.slot + it.id} className={styles.readyRow} style={{ ['--i' as string]: i }}>
              <span className={styles.readyName}>{it.name}</span>
              <span className={`${styles.readySets} num`} data-testid="ready-sets">{itemLine(it)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <>
          {noticeRow}
          <Deck
            items={stage.items}
            index={stage.index}
            canSwap={deck.canSwap}
            swapIn={deck.incoming}
            reduced={reduced}
            fling={deck.fling}
            onDecide={deck.decide}
            onFlyStart={deck.flyStart}
            onNever={deck.never}
            onNothingToSwap={deck.nothingToSwap}
            onInfo={info}
          />
          <DeckButtons
            leaving={deck.leaving}
            swapNote={deck.swapNote}
            onSwap={() => deck.setFling((f) => ({ kind: 'swap', n: (f?.n ?? 0) + 1 }))}
            onKeep={() => deck.setFling((f) => ({ kind: 'keep', n: (f?.n ?? 0) + 1 }))}
            onNever={deck.never}
          />
        </>
      )}
      <BottomCTA
        className={styles.cta}
        onPress={onStart}
        variant={done ? 'primary' : 'secondary'}
        disabled={!stage.items.length}
        {...(!stage.items.length ? { disabledReason: 'Nothing left. Go back and pick another.' } : {})}
        testId="quick-start"
        above={error ? <p className={styles.error} role="status">{error}</p> : null}
      >
        {label}
      </BottomCTA>
      <FactSheet fact={fact} onClose={() => setFact(null)} />
      <SixSheet open={deck.sixOpen && deck.six.length > 0} onClose={() => deck.setSixOpen(false)} options={deck.six.map((o) => ({ id: o.id, name: o.name, demo: demoFor(o.id) }))} onPick={(id) => deck.pickSix(deck.six.find((o) => o.id === id)!)} />
      <HideAskSheet name={deck.ask?.name ?? null} onAnswer={deck.answerAsk} />
    </div>
  );
}
