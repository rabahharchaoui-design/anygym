import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { planById } from '../../../data/plans';
import type { PlanState } from '../../../db/types';
import { DayCard } from '../DayCard';

const plan = planById('five-day-split')!;
const state: PlanState = { id: 'active', planId: plan.id, startedAt: 0, weekIndex: 0, nextDayIndex: 0, doneDays: [] };
const render = (extra = {}) => renderToStaticMarkup(<DayCard plan={plan} state={state} onStart={() => {}} onChangeDay={() => {}} {...extra} />);

describe('Today plan day', () => {
  it('keeps the real plan, start and day choices available', () => {
    const html = render();
    expect(html).toContain(plan.name);
    expect(html).toContain(plan.days[0]!.name);
    expect(html).toContain('>Start<');
    expect(html).toContain('Change day');
  });
  it('shows resume and the real set count while a day is active', () => {
    const html = render({ active: { dayIndex: 0, sets: 3 } });
    expect(html).toContain('>Resume<');
    expect(html).toContain('3 sets');
    expect(html).not.toContain('Change day');
  });
  it('keeps rest day guidance and the option to train', () => {
    const html = render({ rest: { title: 'Rest day', next: 'Next: Monday', start: 'Train today anyway' } });
    expect(html).toContain('Rest day');
    expect(html).toContain('Train today anyway');
  });
});
