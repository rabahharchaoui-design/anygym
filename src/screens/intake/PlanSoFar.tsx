// PLAN 3.3a: the slim "Your plan so far" strip at the bottom of every intake question. It fills in
// as the answers come (days, minutes, place), so the space under a short question shows progress.
// Only what the user said, in their words; an empty slot says what it waits for.
import type { IntakeAnswers } from '../../lib/intake/funnel';
import type { PlaceAnswer } from '../../lib/intake/options';
import styles from './Intake.module.css';

/** The place in a word or two, so the strip stays one line on the SE. */
const PLACE_SHORT: Record<PlaceAnswer, string> = { full: 'Full gym', hotel: 'Hotel gyms', home: 'Home', outdoors: 'Outdoors', mix: 'Mix' };

type Slot = { id: 'days' | 'minutes' | 'place'; empty: string; value: string | undefined };

export function planSoFarSlots(a: IntakeAnswers): Slot[] {
  return [
    { id: 'days', empty: 'Days', value: a.days ? `${a.days} days` : undefined },
    { id: 'minutes', empty: 'Minutes', value: a.minutes ? (a.minutes === 75 ? '75+ min' : `${a.minutes} min`) : undefined },
    { id: 'place', empty: 'Place', value: a.place ? PLACE_SHORT[a.place] : undefined },
  ];
}

export function PlanSoFar({ answers }: { answers: IntakeAnswers }) {
  const slots = planSoFarSlots(answers);
  return (
    <section className={styles.soFar} aria-label="Your plan so far" data-testid="plan-so-far">
      <span className={styles.soFarLabel}>Your plan so far</span>
      <ul className={styles.soFarSlots}>
        {slots.map((s) => (
          <li key={s.id} className={styles.soFarSlot} data-filled={s.value ? '' : undefined} data-testid={`so-far-${s.id}`}>
            {s.value ?? s.empty}
          </li>
        ))}
      </ul>
    </section>
  );
}
