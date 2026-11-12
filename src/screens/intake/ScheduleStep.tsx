import { SCHEDULE_STYLES, WEEKDAYS, type ScheduleStyle, type WeekdayId } from '../../lib/intake/options';
import { type IntakeAnswers, weekdayCountNote } from '../../lib/intake/funnel';
import { scheduleStyleOf } from '../../lib/plan/schedule';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Chip } from '../../ui/Chip';
import styles from './Focus.module.css';

export function ScheduleStep({ answers, onStyle, onDays }: { answers: IntakeAnswers; onStyle: (style: ScheduleStyle) => void; onDays: (days: WeekdayId[]) => void }) {
  const style = scheduleStyleOf(answers);
  const days = answers.weekdays ?? [];
  return <div className={styles.stack} data-testid="q-weekdays">
    <div className={styles.stack} role="group" aria-label="Schedule style">
      {SCHEDULE_STYLES.map((s) => <ChoiceCard key={s.id} label={s.label} hint={s.hint} picked={s.id === style} onPress={() => onStyle(s.id)} testId={`q-schedule-${s.id}`} />)}
    </div>
    {style === 'fixed' && <>
      <p>Which days work best?</p>
      <div className={styles.weekdays} role="group" aria-label="Weekdays">
        {WEEKDAYS.map((d) => <Chip key={d.id} label={d.label} picked={days.includes(d.id)} onPress={() => onDays(days.includes(d.id) ? days.filter((id) => id !== d.id) : [...days, d.id])} testId={`q-weekdays-${d.id}`} />)}
      </div>
      <p role="status" data-testid="weekday-count">{weekdayCountNote(answers) ?? ''}</p>
    </>}
    {style === 'flexible' && <p className={styles.note}>Follow your rotation whenever you can. No missed days to catch up on.</p>}
    {style === 'weekly' && <p className={styles.note}>Today asks for your days once each week, starting Monday. Your rotation stays in order.</p>}
  </div>;
}
