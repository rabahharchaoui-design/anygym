import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Session } from '../db/types';
import { useNow } from '../hooks/useNow';
import { formatElapsed } from '../lib/timer';
import { planById } from '../data/plans';
import { dayIndexOf } from '../lib/plans';
import { FADE, SHEET_SPRING } from './motion';
import { useNav } from './nav';
import styles from './ResumeBar.module.css';

type Props = { session: Session | null; hidden?: boolean };

/**
 * "Day 1 · 12:34 · Resume" (or "Workout · …" for a quick one) floating just above the tab bar while a workout is active (ux-critic,
 * like a music mini player): the workout keeps going on any tab, one tap goes back to its list.
 */
export function ResumeBar({ session, hidden = false }: Props) {
  const reduce = useReducedMotion();
  const go = useNav();
  const show = !!session && !hidden;
  const now = useNow(1000, show);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="resume"
          className={styles.wrap}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, transition: { duration: 0.16 } }}
          transition={reduce ? FADE : SHEET_SPRING}
        >
          <button type="button" className={`${styles.bar} pressable`} data-testid="resume-bar" onClick={() => go(`/workout/${session.id}`, { kind: 'push' })}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.text}>
              {dayLabel(session)} · <span className="num">{formatElapsed(Math.max(0, now - session.startedAt) / 1000)}</span>
            </span>
            <span className={styles.resume}>Resume</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** "Day 1" for a plan day, else "Workout". */
function dayLabel(session: Session): string {
  const plan = planById(session.planId);
  const i = plan ? dayIndexOf(plan, session.dayId) : -1;
  return plan && i >= 0 ? `Day ${plan.days[i]!.n}` : 'Workout';
}
