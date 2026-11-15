import { focusHeadline } from '../../lib/plan/focusPriority';
import { cap } from '../../lib/words';
import { Link } from 'react-router-dom';
import { ChevronRight } from '../../ui/icons';
import { useNav } from '../../ui/nav';
import type { Plan } from '../../lib/plans';
import { planMeta } from './planWords';
import styles from './Plans.module.css';

/** One curated plan in a list: name, the detail line, the summary. Tap to see every day. */
export function PlanCard({ plan, to, active }: { plan: Plan; to: string; active: boolean }) {
  const go = useNav();
  const headline = plan.focusReport ? focusHeadline(plan.focusReport) : null;
  return (
    <Link
      to={to}
      className={`${styles.planCard} pressable`}
      data-testid={`plan-${plan.id}`}
      onClick={(e) => {
        e.preventDefault();
        go(to);
      }}
    >
      <span className={styles.planName}>{plan.name}</span>
      {/* "Your plan" rides on the detail line, so the name never wraps to make room for it. */}
      <span className={styles.planMeta}>
        {planMeta(plan)}
        {active && <span className={styles.badge}>Your plan</span>}
      </span>
      <span className={styles.planSummary}>{plan.summary}</span>
      {/* The same words as the plan screen's headline (lib/plan/focusPriority.ts focusHeadline): the picks with the most extra. */}
      {headline && <span className={styles.planSummary} data-testid="plan-focus">{cap(headline)}</span>}
      <ChevronRight className={styles.planChevron} aria-hidden="true" />
    </Link>
  );
}
