// Plain words for plans (SPEC 13.1). No arithmetic beyond counting.
import type { Plan } from '../../lib/plans';

const GYM_LABEL: Record<string, string> = { full: 'Full gym', hotel: 'Hotel gym', home: 'Home gym', none: 'No equipment' };

export const gymLabel = (type: string): string => GYM_LABEL[type] ?? 'Any gym';

/** "5 days · Full gym", "5 days · 6 weeks · Full gym". */
export function planMeta(plan: Plan): string {
  const parts = [`${plan.daysPerWeek} days`];
  if (plan.weeks) parts.push(`${plan.weeks} weeks`);
  parts.push(gymLabel(plan.gymType));
  return parts.join(' · ');
}

/** "Day 3 · Back and biceps" */
export const dayTitle = (n: number, name: string): string => `Day ${n} · ${name}`;
