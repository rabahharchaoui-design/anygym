import type { ReactNode } from 'react';
import { DeckPhoto } from '../../components/deck/DeckFace';
import { MiniMusclePair } from '../../components/muscles/MuscleMap';
import type { DemoImages } from '../../lib/exerciseInfo';
import type { MuscleMapData } from '../../lib/muscles';
import { muscleChips } from '../../lib/review';
import { CheckIcon, InfoIcon, XIcon } from '../../ui/icons';
import deck from '../../components/deck/Deck.module.css';
import cand from './CandidateReview.module.css';
import styles from './Fit.module.css';

type Props = {
  demo: DemoImages | null;
  /** The honest words when there is no demo (never another move's photo). */
  none: string;
  muscles: MuscleMapData | null;
  /** The one line under the muscles (the first cue, or the gear), and its test id. */
  line: string;
  lineTestId?: string;
  /** The line is the point (the gear a new move needs). */
  strong?: boolean;
  musclesTestId?: string;
  /** Over the demo's corner: the decision this exercise already has. */
  badge?: ReactNode;
  /** Between the demo and the words: why to look closely. */
  note?: ReactNode;
  under: boolean;
  onMap: () => void;
  onInfo: () => void;
};

/**
 * The review card's face (PLAN 3.5v), for a catalog exercise and a new one alike: the moving demo as
 * big as the card allows, a small muscle map with the primary muscle names as chips (tap the map
 * for the full one), and one line with an info button. Three things, and the swipe washes over all.
 */
export function FitFace({ demo, none, muscles, line, lineTestId, strong, musclesTestId, badge, note, under, onMap, onInfo }: Props) {
  const drawn = !!muscles && Object.keys(muscles.shading).length > 0;
  const { chips, more } = muscleChips(muscles?.primary ?? []);
  const id = (name?: string) => (under ? undefined : name);
  return (
    <>
      <DeckPhoto demo={demo} none={none} whole />
      {badge}
      {note}
      <div className={styles.info}>
        {drawn && (
          <button type="button" className={styles.thumb} onClick={onMap} aria-label="Open the muscle map" tabIndex={under ? -1 : undefined} data-testid={id('review-map')}>
            <MiniMusclePair data={muscles} />
          </button>
        )}
        <div className={styles.chips} data-testid={id(musclesTestId ?? 'review-muscles')}>
          {chips.length > 0 ? (
            <>
              {chips.map((c) => (
                <span key={c} className={styles.mchip}>
                  {c}
                </span>
              ))}
              {more > 0 && (
                <span className={`${styles.mchip} num`} data-more="">
                  +{more}
                </span>
              )}
            </>
          ) : (
            <span className={styles.unsure}>Muscles not sure</span>
          )}
        </div>
      </div>
      <div className={styles.cueRow}>
        <p className={styles.cueLine} data-strong={strong || undefined} data-testid={id(lineTestId ?? 'review-line')}>
          {line}
        </p>
        <button type="button" className={styles.infoBtn} onClick={onInfo} aria-label="More about this exercise" tabIndex={under ? -1 : undefined} data-testid={id('review-info')}>
          <InfoIcon width={20} height={20} aria-hidden="true" />
        </button>
      </div>
      {/* The drag sets --keep and --swap on the card (SwipeDeck); over everything, so the answer reads at once. */}
      <span className={cand.wash} data-side="keep" aria-hidden="true" />
      <span className={cand.wash} data-side="swap" aria-hidden="true" />
      <span className={deck.cue} data-side="keep" aria-hidden="true">
        <CheckIcon width={26} height={26} strokeWidth={3} />
      </span>
      <span className={`${deck.cue} ${cand.wrongCue}`} data-side="swap" aria-hidden="true">
        <XIcon width={26} height={26} strokeWidth={3} />
      </span>
    </>
  );
}
