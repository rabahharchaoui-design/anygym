import { focusHeadline } from '../../lib/plan/focusPriority';
import { cap } from '../../lib/words';
import { Link } from 'react-router-dom';
import { useNav } from '../../ui/nav';
import type { Plan } from '../../lib/plans';
import { planMeta } from './planWords';
import styles from './Plans.module.css';

/**
 * One plan in a list (PLAN M6, board 10's rows): the name in bold on the left with its detail line
 * small under it, "Your plan" small in ice blue on the right when it is the one in use. No box, no
 * chevron: the row is the button. Tap to see every day.
 */
export function PlanCard({ plan, to, active }: { plan: Plan; to: string; active: boolean }) {
  const go = useNav();
  const headline = plan.focusReport ? focusHeadline(plan.focusReport) : null;
  return (
    <Link
      to={to}
      className={`${styles.planRow} pressable`}
      data-testid={`plan-${plan.id}`}
      onClick={(e) => {
        e.preventDefault();
        go(to);
      }}
    >
      <span className={styles.planText}>
        <span className={styles.planName}>{plan.name}</span>
        <span className={`${styles.planMeta} num`}>{planMeta(plan)}</span>
        {/* The same words as the plan screen's headline (lib/plan/focusPriority.ts focusHeadline): the picks with the most extra. */}
        {headline && (
          <span className={styles.planMeta} data-testid="plan-focus">
            {cap(headline)}
          </span>
        )}
      </span>
      {active && <span className={styles.badge}>Your plan</span>}
    </Link>
  );
}
