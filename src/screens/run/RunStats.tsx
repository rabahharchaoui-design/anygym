import { useCallback, type ReactNode } from 'react';
import type { DistanceUnit } from '../../lib/intake/answers';
import { paceUnit, type RunSummary } from '../../lib/run';
import { DataField } from '../../ui/DataField';
import styles from './Summary.module.css';

type Props = {
  summary: RunSummary;
  unit: DistanceUnit;
  /** Test id prefix ("summary", "detail"): `<prefix>-distance`, `-time`, `-pace`. */
  ids: 'summary' | 'detail';
};

/**
 * The stat row of a finished run (PLAN M3, SPEC 12.9): distance, moving time and average pace as
 * three Monolith data fields, side by side, read exactly as lib/run printed them. A pace the app is
 * not sure of is the honest blank (DataField shows "--"). Used by the finish screen and the run's
 * detail, so the two look like one family.
 *
 * Test ids: the finish screen's ids sit on the number itself (its tests read the printed value);
 * the detail's sit on the whole field (its tests read the number with its unit).
 */
export function RunStats({ summary, unit, ids }: Props) {
  const fields = [
    { key: 'distance', label: 'Distance', value: summary.distance, unit },
    { key: 'time', label: 'Time', value: summary.time, unit: undefined },
    { key: 'pace', label: 'Pace', value: summary.pace, unit: paceUnit(unit) },
  ] as const;
  return (
    <div className={styles.stats} data-testid={`${ids}-stats`}>
      {fields.map((f) =>
        ids === 'summary' ? (
          <ValueTagged key={f.key} id={`${ids}-${f.key}`}>
            <DataField label={f.label} value={f.value} unit={f.unit} size="medium" />
          </ValueTagged>
        ) : (
          <DataField key={f.key} label={f.label} value={f.value} unit={f.unit} size="medium" testId={`${ids}-${f.key}`} />
        ),
      )}
    </div>
  );
}

/** Puts `id` on the data field's number (DataField takes a test id for the whole field only). */
function ValueTagged({ id, children }: { id: string; children: ReactNode }) {
  const ref = useCallback((el: HTMLDivElement | null) => el?.querySelector('[data-value]')?.setAttribute('data-testid', id), [id]);
  return (
    <div ref={ref} className={styles.stat}>
      {children}
    </div>
  );
}
