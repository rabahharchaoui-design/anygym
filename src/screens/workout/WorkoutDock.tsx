// The bottom of the workout frame (SPEC 20.2, 21.1): the "Nice. Next" chip, the Next in the pair bar
// (3.5d; PLAN 3.5g: plan pairs too) and the rest bar. They float over space every screen keeps free,
// so they never cover a heading or a row, and nothing moves when they come or go.
// Moved out of WorkoutScreen as it was (PLAN 3.5g, code organization).
import { AnimatePresence, motion } from 'motion/react';
import { FADE, SHEET_SPRING } from '../../ui/motion';
import { extendRest, shortenRest, type Rest } from '../../lib/rest';
import { RestDock } from './RestDock';
import styles from './Workout.module.css';

/** `open`: the chip is a button that opens this exercise. */
export type Chip = { id: number; text: string; open?: string };

type Props = {
  chip: Chip | null;
  reduce: boolean;
  /** A finger on the chip holds the automatic return; lifted without a tap, it carries on. */
  onChipHold: () => void;
  onChipRelease: () => void;
  onChipOpen: (exerciseId: string) => void;
  /** The next member of the pair or circuit, once this exercise's set of the round is done. */
  pairNext: { exerciseId: string; name: string; circuit: boolean } | null;
  onPairNext: () => void;
  rest: Rest | null;
  onRest: (rest: Rest | null) => void;
};

export function WorkoutDock({ chip, reduce, onChipHold, onChipRelease, onChipOpen, pairNext, onPairNext, rest, onRest }: Props) {
  return (
    <div className={styles.dockWrap} data-dock>
      <AnimatePresence>
        {chip && (
          <motion.div
            key={chip.id}
            className={styles.nextChipWrap}
            role="status"
            data-testid="next-chip"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={reduce ? FADE : SHEET_SPRING}
          >
            {chip.open ? (
              <button
                type="button"
                className={`${styles.nextChip} pressable`}
                onPointerDown={onChipHold}
                onPointerCancel={onChipRelease}
                onPointerLeave={(e) => e.buttons && onChipRelease()}
                onClick={() => onChipOpen(chip.open!)}
              >
                {chip.text}
              </button>
            ) : (
              <span className={styles.nextChip}>{chip.text}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {/* 3.5d (10): after a set inside a pair or circuit, the next member is one tap in the bottom bar. */}
      <AnimatePresence>
        {pairNext && (
          <motion.div
            key={`pair-${pairNext.exerciseId}`}
            className={styles.groupDock}
            data-rest={!!rest || undefined}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.16 } }}
            transition={reduce ? FADE : SHEET_SPRING}
          >
            <button type="button" className={`${styles.groupNext} pressable`} data-testid="group-next" onClick={onPairNext}>
              Next in the {pairNext.circuit ? 'circuit' : 'pair'}: {pairNext.name}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {rest && (
          <RestDock
            key="rest"
            rest={rest}
            onExtend={() => onRest(extendRest(rest, Date.now()))}
            onShorten={() => onRest(shortenRest(rest, Date.now()))}
            onSkip={() => onRest(null)}
            onDone={() => onRest(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
