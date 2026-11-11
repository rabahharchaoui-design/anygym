import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '../../ui/Button';
import { FADE, SPRING } from '../../ui/motion';
import { approveLabel, type Marks } from '../../lib/candidates/fastReview';
import type { CandidateRecord } from '../../lib/candidates/types';
import { ReviewTile } from './ReviewTile';
import styles from './ReviewGrid.module.css';

/** After a new screen arrives, Approve waits this long (about the slide itself, never more than 250 ms):
 *  a double tap never approves 9 unseen moves. */
const SETTLE_MS = 250;

const slide = {
  enter: (dir: number) => ({ x: `${dir * 100}%`, opacity: 1 }),
  center: { x: '0%', opacity: 1 },
  exit: (dir: number) => ({ x: `${dir * -100}%`, opacity: 1 }),
};
const fade = { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };

/**
 * The review grid (PLAN 3.5i): 9 moving tiles, all approved unless tapped, and one button that says
 * the real count. Approve saves the screen; it leaves to the left and the next 9 arrive from the
 * right (Undo brings it back from the left). Reduced motion: a short fade.
 */
export function ReviewGrid({ tiles, marks, screen, reduced, onToggle, onFix, onApprove }: { tiles: readonly CandidateRecord[]; marks: Marks; screen: number; reduced: boolean; onToggle: (id: string) => void; onFix: (c: CandidateRecord) => void; onApprove: () => void }) {
  const key = tiles[0]?.id ?? '';
  const was = useRef({ key, screen });
  const dir = useRef(1);
  const settled = useRef(0);
  if (was.current.key !== key) {
    dir.current = screen < was.current.screen ? -1 : 1;
    was.current = { key, screen };
    settled.current = performance.now() + SETTLE_MS;
  }
  // Keeps the latest handler for a press that lands during the slide.
  const approve = useRef(onApprove);
  useEffect(() => {
    approve.current = onApprove;
  });
  const ids = tiles.map((c) => c.id);
  return (
    <>
      <div className={styles.stage}>
        <AnimatePresence initial={false} custom={dir.current} mode="popLayout">
          <motion.div key={key} className={styles.grid} data-testid="review-grid" custom={dir.current} variants={reduced ? fade : slide} initial="enter" animate="center" exit="exit" transition={reduced ? FADE : SPRING}>
            {tiles.map((c) => (
              <ReviewTile key={c.id} c={c} mark={marks[c.id]} still={reduced} onToggle={() => onToggle(c.id)} onFix={() => onFix(c)} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <Button
        variant="primary"
        className={styles.approve}
        data-testid="approve-screen"
        onClick={() => {
          if (performance.now() < settled.current) return;
          approve.current();
        }}
      >
        <span className="num">{approveLabel(ids, marks)}</span>
      </Button>
    </>
  );
}
