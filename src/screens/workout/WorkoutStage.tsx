import type { ReactNode, MutableRefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FADE, PAGE_SPRING, pageVariants, pageVariantsReduced } from '../../ui/motion';
import { EdgeSwipe } from '../../ui/EdgeSwipe';
import { Skeleton } from '../../ui/Skeleton';
import { LoadError } from '../../components/LoadError';
import { DayList } from './DayList';
import { Present } from './Present';
import type { Workout } from './useWorkout';
import styles from './Workout.module.css';

type Props = {
  w: Workout;
  /** The day list or the exercise view, already built by the screen. */
  view: ReactNode;
  exerciseId: string | null;
  expanding: boolean;
  fallback: boolean;
  dir: number;
  reduce: boolean | null;
  viewRef: MutableRefObject<HTMLDivElement | null>;
  onBack: () => void;
};

/** Where the views live: the load error, the skeleton, or the list / exercise with its push and pop motion and edge swipe. */
export function WorkoutStage({ w, view, exerciseId, expanding, fallback, dir, reduce, viewRef, onBack }: Props) {
  return (
    <div className={styles.stage} data-expand={expanding || undefined}>
      {w.error ? (
        <div className={styles.view}>
          <LoadError text="Could not load this workout" onRetry={w.retry} />
        </div>
      ) : !w.ready ? (
        <Skeleton height={220} className={styles.skeleton} />
      ) : (
        <>
          {fallback ? (
            <AnimatePresence initial={false} custom={dir}>
              <motion.div
                key={exerciseId ?? 'list'}
                ref={(el: HTMLDivElement | null) => {
                  // Only the arriving view: the leaving one must never take the edge swipe layer away.
                  if (el) viewRef.current = el;
                }}
                className={styles.view}
                data-motion-view="true"
                custom={dir}
                variants={reduce ? pageVariantsReduced : pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={reduce ? FADE : PAGE_SPRING}
              >
                <Present>{view}</Present>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div key={exerciseId ?? 'list'} ref={viewRef} className={styles.view}>
              {view}
            </div>
          )}
          {exerciseId && (
            <EdgeSwipe
              key={`swipe-${exerciseId}`}
              layerRef={viewRef}
              onBack={onBack}
              under={() => (
                <div className={styles.view}>
                  <DayList w={w} heroId={null} onOpen={() => undefined} onAdd={() => undefined} still />
                </div>
              )}
            />
          )}
        </>
      )}
    </div>
  );
}
