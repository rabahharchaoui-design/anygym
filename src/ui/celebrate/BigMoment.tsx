import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { DUR, FADE, GENTLE, GLIDE, STAGGER } from '../motion';
import { afterLanding } from '../nav';
import { Odometer } from '../Odometer';
import { Effect } from './Effect';
import { effectFor } from './effects';
import { stagingFor } from './select';
import type { Moment } from './types';
import styles from './celebrate.module.css';

type Props = {
  moment: Moment;
  /** Reduced motion: a calm fade with the same words (no particles, no count up, no travel). */
  reduce: boolean | null;
  /** It started to leave: the screen under it shows the element it settles into, now. */
  onSettle?: () => void;
  /** It is gone: take it out of the tree. */
  onDone: () => void;
};

/** The count up and the burst, from the words arriving until the number has landed (SPEC: celebrations are about 900 ms; the whole BIG, settle included, stays near 1.4 s). */
export const BIG_COUNT_MS = 660;
/** How long the landed number stays before it settles on its own. Any tap leaves sooner. */
export const BIG_HOLD_MS = 340;

/** The settle, as seen: GLIDE is visually at rest in 300 ms; a little longer so the last of the fade is not cut. */
const SETTLE_MS = DUR.slow + 80;

/** Where the hero number goes when it leaves: toward `[data-celebrate-home="<moment id>"]` on the screen under it. */
function travelTo(hero: HTMLElement | null, id: string): { x: number; y: number; scale: number } | null {
  const home = document.querySelector<HTMLElement>(`[data-celebrate-home="${CSS.escape(id)}"]`);
  if (!hero || !home) return null;
  const from = hero.getBoundingClientRect();
  const to = home.getBoundingClientRect();
  if (!from.width || !to.width) return null;
  return { x: to.left + to.width / 2 - (from.left + from.width / 2), y: to.top + to.height / 2 - (from.top + from.height / 2), scale: Math.max(0.3, Math.min(1, to.height / from.height)) };
}

/**
 * The BIG tier (PLAN 3.6b): the whole screen, for a rare moment, on a summary screen only. A dark
 * backdrop, what it is, the one number counting up, a burst of particles as it lands, then it
 * settles: the number travels to its place on the screen under it while the backdrop fades. It
 * arrives with the screen (the backdrop is in the first frame; the words start once the screen has
 * landed). Any tap leaves at once and is used up here: it never presses what is underneath.
 */
export function BigMoment({ moment, reduce, onSettle, onDone }: Props) {
  const staging = stagingFor(reduce);
  const [phase, setPhase] = useState<'wait' | 'in' | 'out'>('wait');
  const [travel, setTravel] = useState<{ x: number; y: number; scale: number } | null>(null);
  const hero = useRef<HTMLDivElement>(null);
  const live = useRef({ onSettle, onDone });
  live.current = { onSettle, onDone };

  useEffect(() => afterLanding(() => setPhase((p) => (p === 'wait' ? 'in' : p))), []);

  const leave = () => {
    if (phase === 'out') return;
    setTravel(staging.travel ? travelTo(hero.current, moment.id) : null);
    setPhase('out');
    live.current.onSettle?.();
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    if (phase !== 'in') return;
    const t = window.setTimeout(() => leaveRef.current(), BIG_COUNT_MS + BIG_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const out = phase === 'out';
  // Gone as soon as the eye sees it gone: a spring's last few percent take as long again, and the
  // screen under it must not stay covered by something invisible.
  useEffect(() => {
    if (!out) return;
    const t = window.setTimeout(() => live.current.onDone(), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [out]);
  const rise = (i: number) =>
    staging.travel
      ? { initial: { opacity: 0, y: 14 }, animate: { opacity: out ? 0 : 1, y: 0 }, transition: out ? FADE : { ...GENTLE, delay: STAGGER * i } }
      : { initial: { opacity: 0 }, animate: { opacity: out ? 0 : 1 }, transition: FADE };

  return (
    <motion.div
      className={styles.big}
      role="status"
      aria-label={`${moment.title}. ${moment.hero}, ${moment.caption}${moment.plus ? `, ${moment.plus}` : ''}`}
      data-testid="celebrate-big"
      data-phase={phase}
      data-kind={moment.kind}
      initial={false}
      animate={{ opacity: out ? 0 : 1 }}
      transition={staging.travel ? GLIDE : FADE}
      onAnimationComplete={() => out && live.current.onDone()}
      onClick={(e) => {
        e.stopPropagation();
        leave();
      }}
    >
      {phase !== 'wait' && (
        <>
          {/* The moment's own effect (PLAN 3.6h): glass shards for the first workout, the burst for a record. */}
          {staging.particles && !out && <Effect variant={effectFor(moment.kind)} delay={160} life={BIG_COUNT_MS + BIG_HOLD_MS - 160} className={styles.bigParticles} />}
          <div className={styles.bigBody}>
            <motion.p className={styles.bigTitle} {...rise(0)}>
              {moment.title}
            </motion.p>
            <motion.div
              ref={hero}
              className={`${styles.bigHero} num`}
              data-long={moment.hero.length > 8 || undefined}
              data-testid="celebrate-hero"
              initial={staging.travel ? { opacity: 0, scale: 0.9 } : { opacity: 0 }}
              animate={out ? { opacity: 0, ...(travel ?? {}) } : { opacity: 1, scale: 1 }}
              transition={staging.travel ? (out ? GLIDE : GENTLE) : FADE}
            >
              <Odometer value={moment.hero} countUp={staging.countUp} stagger={20} />
            </motion.div>
            <motion.p className={styles.bigCaption} {...rise(1)}>
              <span>{moment.caption}</span>
              {moment.plus && <span className={`${styles.plus} num`}>{moment.plus}</span>}
            </motion.p>
          </div>
        </>
      )}
    </motion.div>
  );
}
