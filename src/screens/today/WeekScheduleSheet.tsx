import { useEffect, useState } from 'react';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { SummaryRow } from '../../ui/SummaryRow';
import { WeekdayChips } from '../../components/WeekdayChips';
import { WEEKDAYS, type WeekdayId } from '../../lib/intake/options';
import type { useSchedule } from '../../hooks/useSchedule';
import { weekPickWords } from '../../lib/plan/scheduleWords';
import styles from './WeekSchedule.module.css';

/**
 * PLAN 3.6f: "Changes week to week". Once each new week Today asks "Which days this week?"; closing
 * it is respected until next week. A quiet row on Today says the days picked and opens it again.
 * Save needs at least one day (a week off is closing the sheet, never an empty save).
 */
export function WeekScheduleSheet({ schedule, active }: { schedule: ReturnType<typeof useSchedule>; active: boolean }) {
  const data = schedule.data;
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [days, setDays] = useState<WeekdayId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (data?.asksWeek && !active && dismissed !== data.weekKey) setOpen(true); }, [data?.asksWeek, data?.weekKey, active, dismissed]);
  if (data?.style !== 'weekly') return null;
  const save = async () => {
    if (busy || !days.some((d) => data.weekdaysLeft.includes(d))) return;
    setBusy(true); setError('');
    try { await schedule.save(days); setOpen(false); setDismissed(data?.weekKey ?? null); }
    catch { setError('Could not save your days. Try again.'); }
    finally { setBusy(false); }
  };
  // The saved days in week order, whatever order they were tapped in.
  const saved = data.needsWeek ? [] : WEEKDAYS.filter((d) => data.weekly?.weekdays.includes(d.id)).map((d) => d.label);
  return <>
    <SummaryRow label="Your days this week" value={saved.length ? saved.join(', ') : 'Not picked yet'} action={saved.length ? 'Change' : 'Pick days'} onPress={() => { setDays(data.needsWeek ? [] : data.weekly?.weekdays ?? []); setError(''); setOpen(true); }} testId="week-schedule-open" valueTestId="week-schedule-days" />
    <Sheet open={open} onClose={() => { setOpen(false); setDismissed(data?.weekKey ?? null); }} label="Which days this week?" scroll footer clearTop>
      <div className={styles.sheet}>
        <h2 className={styles.title}>Which days this week?</h2>
        <p className={styles.note}>Tap the days you can train. Your workouts stay in order.</p>
        <WeekdayChips value={days} onChange={setDays} label="Days this week" testIdPrefix="week" open={data.weekdaysLeft} />
        {/* The plan's number of days, and what is picked against it (lib/plan/scheduleWords.ts). Fewer or more is fine, and said. */}
        {data.planDays > 0 && <p className={styles.note} data-testid="week-plan-days" aria-live="polite">{weekPickWords(data.planDays, days.length)}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <SheetFooter><Button disabled={busy || !days.some((d) => data.weekdaysLeft.includes(d))} disabledReason={days.some((d) => data.weekdaysLeft.includes(d)) ? undefined : 'Pick at least one day'} onClick={() => void save()}>{busy ? 'Saving…' : 'Save days'}</Button></SheetFooter>
    </Sheet>
  </>;
}
