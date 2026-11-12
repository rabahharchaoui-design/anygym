import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Unit } from '../../../db/types';
import { TypedReadout } from '../TypedReadout';
import styles from '../TypedReadout.module.css';

// 3.6x: TypeItSheet and EquipmentWeightSheet each wrote out this readout and its four CSS rules.
// The old markup is kept here as written; the shared one must render the same.
function OldCopy({ text, unit, testId }: { text: string; unit: Unit; testId: string }) {
  return (
    <div className={styles.display}>
      <span className={`${styles.typed} num`} data-testid={testId} aria-live="polite">
        {text || <span className={styles.placeholder}>0</span>}
      </span>
      <span className={styles.unit}>{unit}</span>
    </div>
  );
}

describe('TypedReadout', () => {
  const cases: Array<[string, Unit, string]> = [
    ['', 'lb', 'typed'],
    ['137.5', 'lb', 'typed'],
    ['0', 'kg', 'typed'],
    ['', 'kg', 'equipment-typed'],
    ['110', 'lb', 'equipment-typed'],
  ];
  it.each(cases)('text %j in %s (%s): the same markup as the old copy', (text, unit, testId) => {
    const html = renderToStaticMarkup(<TypedReadout text={text} unit={unit} testId={testId} />);
    expect(html).toBe(renderToStaticMarkup(<OldCopy text={text} unit={unit} testId={testId} />));
    expect(html).toContain(`data-testid="${testId}"`);
    expect(html).toContain('aria-live="polite"');
  });

  it('a dim 0 until something is typed, then the typed text and the unit', () => {
    const strip = (h: string) => h.replace(/<[^>]+>/g, '');
    expect(strip(renderToStaticMarkup(<TypedReadout text="" unit="lb" testId="t" />))).toBe('0lb');
    expect(strip(renderToStaticMarkup(<TypedReadout text="42.5" unit="kg" testId="t" />))).toBe('42.5kg');
  });
});
