import { focusLabel } from '../../lib/plan/focus';
import { Link } from 'react-router-dom';
import { ChevronRight } from '../../ui/icons';
import { useNav } from '../../ui/nav';
import type { Plan } from '../../lib/plans';
import { planMeta } from './planWords';
import styles from './Plans.module.css';

/** One curated plan in a list: name, the detail line, the summary. Tap to see every day. */
export function PlanCard({ plan, to, active }: { plan: Plan; to: string; active: boolean }) {
  const go = useNav();
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
      {plan.focusReport?.priorities.some((p) => p.extra > 0) && <span className={styles.planSummary}>Extra {plan.focusReport.priorities.filter((p) => p.extra > 0).slice(0, 2).map((p) => focusLabel(p.id).toLowerCase()).join(" and ")} work</span>}
      <ChevronRight className={styles.planChevron} aria-hidden="true" />
    </Link>
  );
}
