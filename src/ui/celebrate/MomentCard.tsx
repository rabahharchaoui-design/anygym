import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { FADE, GLIDE, SPRINGS } from '../motion';
import { afterLanding } from '../nav';
import { TrophyIcon } from '../icons';
import { Particles } from './Particles';
import { stagingFor } from './select';
import type { Moment } from './types';
import styles from './celebrate.module.css';

/**
 * How the card arrives:
 *   burst   it springs in, then its trophy bursts (the screen drew itself, no screen change running);
 *   land    it is already drawn (it came in with the screen); its trophy bursts once the screen landed;
 *   hidden  its room is kept but it is not shown yet: a full screen moment is on its way to it;
 *   still   shown, no motion (it was seen before, or the full screen moment just settled into it).
 */
export type Arrival = 'burst' | 'land' | 'hidden' | 'still';

type Props = {
  moment: Moment;
  arrival: Arrival;
  /** lead: the first card of a summary, two lines and a large number line. row: one compact line in a list. */
  size?: 'lead' | 'row';
  as?: 'p' | 'li';
  /** Seconds before a burst arrival starts (cards arriving together are staggered by the caller). */
  delay?: number;
  reduce: boolean | null;
  testId?: string;
};

/**
 * The MEDIUM tier (PLAN 3.6b): a card on a summary screen with the real fact, at most three things
 * on its face: what, the number line, and how much more than before. It bursts in with a few ice
 * blue particles from its trophy. Reduced motion: a fade, the same words, no particles.
 */
export function MomentCard({ moment, arrival, size = 'lead', as = 'p', delay = 0, reduce, testId }: Props) {
  const staging = stagingFor(reduce);
  // How it first arrived is kept: a later 'still' (the same card, seen) never replays or cuts the burst.
  const [first] = useState(arrival);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (!staging.particles || (first !== 'burst' && first !== 'land')) return;
    return afterLanding(() => setBurst(true));
  }, [first, staging.particles]);

  const Tag = as === 'li' ? motion.li : motion.p;
  const shown = arrival !== 'hidden';
  const enter =
    first === 'burst'
      ? staging.travel
        ? { initial: { opacity: 0, y: 10, scale: 0.94 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { ...SPRINGS.sheet, delay } }
        : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ...FADE, delay } }
      : { initial: false as const, animate: { opacity: shown ? 1 : 0 }, transition: staging.travel ? GLIDE : FADE };

  return (
    <Tag
      className={styles.card}
      data-size={size}
      data-tier="medium"
      data-arrival={arrival}
      data-celebrate-home={moment.id}
      data-testid={testId}
      aria-label={`${moment.title} ${moment.detail}${moment.plus ? `, ${moment.plus}` : ''}`}
      {...enter}
    >
      <span className={styles.cardIcon} data-pop={burst || undefined} aria-hidden="true">
        <TrophyIcon width={18} height={18} strokeWidth={2.2} />
      </span>
      <span className={styles.cardText}>
        <span className={styles.cardName}>{moment.title}</span>
        <span className={styles.cardDetail}>{moment.detail}</span>
      </span>
      {moment.plus && (
        <span className={`${styles.plus} num`} data-testid="celebrate-plus">
          {moment.plus}
        </span>
      )}
      {burst && <Particles count={size === 'lead' ? 16 : 10} origin={{ x: 0.5, y: 0.5 }} reach={size === 'lead' ? 64 : 40} delay={first === 'burst' ? delay * 1000 + 140 : 0} onDone={() => setBurst(false)} className={styles.cardParticles} />}
    </Tag>
  );
}
