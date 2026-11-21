import { SCHEDULE_STYLES, WEEKDAYS } from '../../lib/intake/options';
import { sanitizeAnswers } from '../../lib/intake/funnel';
import { focusName, normalizeFocusPicks } from '../../lib/plan/focus';
import { scheduleStyleOf } from '../../lib/plan/schedule';
import { list } from '../../lib/words';
import styles from '../Settings.module.css';

type Props = {
  /** The saved intake answers, as the profile keeps them (absent before the first intake). */
  intake: unknown;
  go: (to: string) => void;
};

/**
 * Settings, My profile: the intake's answers stay changeable. All the questions again, or (PLAN
 * 3.6f) just the schedule or the focus areas: that one question opens, then "Your plan" rebuilds.
 * The two short ways show only once there are answers to change, each with what is chosen now.
 */
export function PlanAnswerRows({ intake, go }: Props) {
  const a = intake ? sanitizeAnswers(intake) : null;
  const style = a ? scheduleStyleOf(a) : null;
  const days = a && style === 'fixed' ? WEEKDAYS.filter((d) => a.weekdays?.includes(d.id)).map((d) => d.label) : [];
  const picks = a ? normalizeFocusPicks(a.focusPicks ?? a.focus).filter((p) => p !== 'balance') : [];
  const rows = [
    { id: 'redo-intake', to: '/welcome?redo=1', label: 'Answer the questions again', hint: 'Goal, days, where you train, equipment and more. Then pick your plan.' },
    ...(a
      ? [
          { id: 'redo-schedule', to: '/welcome?redo=1&only=weekdays', label: 'Schedule', hint: `${SCHEDULE_STYLES.find((s) => s.id === style)!.label}${days.length ? ` · ${days.join(', ')}` : ''}` },
          { id: 'redo-focus', to: '/welcome?redo=1&only=focus', label: 'Focus areas', hint: picks.length ? list(picks.map(focusName)) : 'Whole body balance' },
        ]
      : []),
  ];
  return (
    <>
      {rows.map((r) => (
        <button key={r.id} type="button" className={`${styles.linkRow} pressable`} onClick={() => go(r.to)} data-testid={r.id}>
          <span className={styles.unitText}>
            <span className={styles.unitLabel}>{r.label}</span>
            <span className={styles.unitHint}>{r.hint}</span>
          </span>
        </button>
      ))}
    </>
  );
}
