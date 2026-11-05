// PLAN 3.3a: the slim "Your plan so far" strip. Round 2 (B7): it leads with the goals, then the level,
// and grows by one pill per answer the plan really uses (goals, level, days, minutes, place). It
// shows only on the screens that add to it, wraps instead of cutting a word, and when the question
// leaves no room for it whole it waits out of sight (useStripFit), never clipped.
import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { goalsOf, type IntakeAnswers, type ScreenId } from '../../lib/intake/funnel';
import type { ExperienceId, GoalId, PlaceAnswer } from '../../lib/intake/options';
import styles from './Intake.module.css';

/** The screens whose answer becomes a pill: elsewhere the strip has nothing to add. */
export const STRIP_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>(['goal', 'experience', 'days', 'minutes', 'place']);

const GOAL_SHORT: Record<GoalId, string> = {
  muscle: 'Muscle',
  strength: 'Strength',
  fat_loss: 'Fat loss',
  tone: 'Tone up',
  health: 'Health',
  athletic: 'Athletic',
  race: 'Race',
  comeback: 'Comeback',
};
const LEVEL_SHORT: Record<ExperienceId, string> = { new: 'Brand new', months: 'A few months', '1_2y': '1 to 2 years', '3y': '3+ years', break: 'Coming back' };
/** The place in a word or two. */
const PLACE_SHORT: Record<PlaceAnswer, string> = { full: 'Full gym', hotel: 'Hotel gyms', home: 'Home', outdoors: 'Outdoors', mix: 'Mix' };

export type Pill = { id: 'goals' | 'level' | 'days' | 'minutes' | 'place'; text: string };

/** Only what was answered, goals first ("Muscle + fat loss"). */
export function planSoFarPills(a: IntakeAnswers): Pill[] {
  const goals = goalsOf(a).map((g, i) => (i === 0 ? GOAL_SHORT[g] : GOAL_SHORT[g].toLowerCase()));
  const out: Array<Pill | null> = [
    goals.length ? { id: 'goals', text: goals.join(' + ') } : null,
    a.experience ? { id: 'level', text: LEVEL_SHORT[a.experience] } : null,
    a.days ? { id: 'days', text: `${a.days} days` } : null,
    a.minutes ? { id: 'minutes', text: a.minutes === 75 ? '75+ min' : `${a.minutes} min` } : null,
    a.place ? { id: 'place', text: PLACE_SHORT[a.place] } : null,
  ];
  return out.filter((p): p is Pill => !!p);
}

export function PlanSoFar({ answers }: { answers: IntakeAnswers }) {
  const pills = planSoFarPills(answers);
  return (
    <section className={styles.soFar} aria-label="Your plan so far" data-testid="plan-so-far">
      <span className={styles.soFarLabel}>Your plan so far</span>
      {pills.length === 0 ? (
        <span className={styles.soFarEmpty}>Builds as you answer</span>
      ) : (
        <ul className={styles.soFarSlots}>
          {pills.map((p) => (
            <li key={p.id} className={styles.soFarSlot} data-filled="" data-testid={`so-far-${p.id}`}>
              {p.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Whole or not at all: the strip shows only while the question and the strip both fit the
 * scroller; with no room (a small phone, large text) it waits out of sight until there is.
 */
export function useStripFit(ref: RefObject<HTMLElement | null>): void {
  const update = () => {
    const el = ref.current;
    const strip = el?.querySelector<HTMLElement>('[data-testid="plan-so-far"]');
    if (!el || !strip) return;
    const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
    if (strip.dataset.away !== undefined) {
      if (el.scrollHeight + strip.offsetHeight + gap <= el.clientHeight) delete strip.dataset.away;
    } else if (el.scrollHeight > el.clientHeight + 1) strip.dataset.away = '';
  };
  useLayoutEffect(update);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
}
