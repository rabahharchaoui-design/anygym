import { useEffect, useRef } from 'react';
import { CalendarClock, CalendarDays, Repeat } from 'lucide-react';
import { SCHEDULE_STYLES, type ScheduleStyle, type WeekdayId } from '../../lib/intake/options';
import { type IntakeAnswers, weekdayCountNote } from '../../lib/intake/funnel';
import { scheduleStyleOf } from '../../lib/plan/schedule';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { WeekdayChips } from '../../components/WeekdayChips';
import intake from './Intake.module.css';
import styles from './Schedule.module.css';

const ICONS = { fixed: CalendarDays, flexible: Repeat, weekly: CalendarClock } as const;
/** What the picked style means on Today, in plain words. */
const MEANS: Record<Exclude<ScheduleStyle, 'fixed'>, [string, string]> = {
  flexible: ['How it works', 'Today always shows your next workout, in order. A missed day never piles up.'],
  weekly: ['How it works', 'Every Monday, Today asks which days you can train. Your workouts stay in order.'],
};

/**
 * PLAN 3.6f: how the week runs. Three choices that never move (Flexible is the default), and under
 * them one steady place: the weekday chips for "Same days each week", or what the choice means.
 * The place keeps its height, so picking a style never pushes anything under the thumb.
 */
export function ScheduleStep({ answers, onStyle, onDays }: { answers: IntakeAnswers; onStyle: (style: ScheduleStyle) => void; onDays: (days: WeekdayId[]) => void }) {
  const style = scheduleStyleOf(answers);
  const count = weekdayCountNote(answers);
  // What a choice brings in sits under the three cards: on a short screen or at large text the page
  // brings it above the button, so the weekday chips are never left waiting under the bar.
  const detail = useRef<HTMLDivElement>(null);
  const shown = useRef(style);
  useEffect(() => {
    if (shown.current === style) return;
    shown.current = style;
    detail.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [style]);
  return (
    <div className={styles.step} data-testid="q-weekdays">
      <div className={intake.cards} data-fill role="group" aria-label="Schedule style">
        {SCHEDULE_STYLES.map((s) => (
          <ChoiceCard key={s.id} icon={ICONS[s.id]} label={s.label} hint={s.hint} picked={s.id === style} onPress={() => onStyle(s.id)} testId={`q-schedule-${s.id}`} />
        ))}
      </div>
      <div ref={detail} className={styles.detail}>
        {style === 'fixed' ? (
          <div key="fixed" className={`${styles.days} ${intake.fadeIn}`}>
            <WeekdayChips value={answers.weekdays ?? []} onChange={onDays} label="Weekdays" testIdPrefix="q-weekdays" />
            <p className={styles.count} role="status" data-testid="weekday-count">
              {count ?? ''}
            </p>
          </div>
        ) : (
          <div key={style} className={`${styles.means} ${intake.fadeIn}`} data-testid="schedule-means">
            <p className={styles.meansTitle}>{MEANS[style][0]}</p>
            <p className={styles.meansText}>{MEANS[style][1]}</p>
          </div>
        )}
      </div>
    </div>
  );
}
