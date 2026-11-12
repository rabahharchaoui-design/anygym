import { useEffect, useState } from 'react';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { WEEKDAYS, type WeekdayId } from '../../lib/intake/options';
import type { useSchedule } from '../../hooks/useSchedule';
import styles from '../intake/Focus.module.css';

export function WeekScheduleSheet({ schedule, active }: { schedule: ReturnType<typeof useSchedule>; active: boolean }) {
  const data = schedule.data;
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [days, setDays] = useState<WeekdayId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (data?.needsWeek && !active && dismissed !== data.weekKey) setOpen(true); }, [data?.needsWeek, data?.weekKey, active, dismissed]);
  if (data?.style !== 'weekly') return null;
  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await schedule.save(days); setOpen(false); setDismissed(data?.weekKey ?? null); }
    catch { setError('Could not save your days. Try again.'); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="tertiary" data-testid="week-schedule-open" onClick={() => { setDays(data.weekly?.weekdays ?? []); setOpen(true); }}>Your days this week</Button>
    <Sheet open={open} onClose={() => { setOpen(false); setDismissed(data?.weekKey ?? null); }} label="Which days this week?" scroll footer clearTop>
      <div className={styles.stack}>
        <h2>Which days this week?</h2>
        <p className={styles.note}>Pick any days. Your next workout stays in the rotation.</p>
        <div className={styles.weekdays} role="group" aria-label="Days this week">
          {WEEKDAYS.map((d) => <Chip key={d.id} label={d.label} picked={days.includes(d.id)} onPress={() => setDays(days.includes(d.id) ? days.filter((id) => id !== d.id) : [...days, d.id])} testId={`week-${d.id}`} />)}
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
      <SheetFooter><Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save days'}</Button></SheetFooter>
    </Sheet>
  </>;
}
