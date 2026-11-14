import { useState } from 'react';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { SummaryRow } from '../../ui/SummaryRow';
import { WeekdayChips } from '../../components/WeekdayChips';
import type { WeekdayId } from '../../lib/intake/options';
import type { useSchedule } from '../../hooks/useSchedule';
import { fixedDaysAsk, fixedPickWords } from '../../lib/plan/weekdays';
import styles from './WeekSchedule.module.css';

/**
 * PLAN 3.6f round 3: "Same days each week" with a different number of weekdays than the plan has
 * days (a profile saved before the rule, or a plan with another number of days chosen later).
 * Today asks for the right days with one quiet row instead of pretending; nothing is guessed.
 */
export function FixedDaysSheet({ schedule }: { schedule: ReturnType<typeof useSchedule> }) {
  const fixed = schedule.data?.fixedDays;
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<WeekdayId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!fixed) return null;
  const right = days.length === fixed.planDays;
  const save = async () => {
    if (busy || !right) return;
    setBusy(true); setError('');
    try { await schedule.saveFixed(days); setOpen(false); }
    catch { setError('Could not save your days. Try again.'); }
    finally { setBusy(false); }
  };
  return <>
    <SummaryRow label="Your training days" value={fixedPickWords(fixed.planDays, fixed.weekdays.length)} action={fixedDaysAsk(fixed)} onPress={() => { setDays(fixed.weekdays); setError(''); setOpen(true); }} testId="fixed-days-open" valueTestId="fixed-days-note" />
    <Sheet open={open} onClose={() => setOpen(false)} label="Which days each week?" scroll footer clearTop>
      <div className={styles.sheet}>
        <h2 className={styles.title}>Which days each week?</h2>
        <p className={styles.note}>One weekday for each day of your plan.</p>
        <WeekdayChips value={days} onChange={setDays} label="Weekdays" testIdPrefix="fixed" />
        <p className={styles.note} data-testid="fixed-plan-days" aria-live="polite">{fixedPickWords(fixed.planDays, days.length)}</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <SheetFooter><Button disabled={busy || !right} disabledReason={right ? undefined : fixedPickWords(fixed.planDays, days.length)} onClick={() => void save()}>{busy ? 'Saving…' : 'Save days'}</Button></SheetFooter>
    </Sheet>
  </>;
}
