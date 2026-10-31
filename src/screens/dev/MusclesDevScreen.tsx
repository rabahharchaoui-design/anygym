import { useId, useState } from 'react';
import { MuscleMap } from '../../components/muscles/MuscleMap';
import { CATALOG, EXERCISE_MAP, musclesForCatalog, musclesForPlan } from '../../data/muscles';
import styles from './MusclesDevScreen.module.css';

/** Dev audit page (#/dev/muscles): the muscle map for any plan or catalog exercise. Behind the dev flag. */
export function MusclesDevScreen() {
  const [choice, setChoice] = useState('cat:Barbell_Incline_Bench_Press_-_Medium_Grip');
  const selectId = useId();
  const [kind, id] = [choice.slice(0, choice.indexOf(':')), choice.slice(choice.indexOf(':') + 1)];
  const plan = kind === 'plan' ? EXERCISE_MAP.find((e) => e.planId === id) : undefined;
  const name = plan ? plan.name : (CATALOG.find((e) => e.id === id)?.name ?? id);
  const detail = plan ? `plan · ${plan.match}${plan.catalogId ? ` · ${plan.catalogId}` : ''}` : `catalog · ${id}`;
  const data = kind === 'plan' ? musclesForPlan(id) : musclesForCatalog(id);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Muscle map</h1>
        <span className={styles.count}>{CATALOG.length} catalog · {EXERCISE_MAP.length} plan</span>
      </header>
      <label className={styles.label} htmlFor={selectId}>
        Exercise
      </label>
      <select id={selectId} className={styles.select} value={choice} onChange={(e) => setChoice(e.target.value)}>
        <optgroup label="Catalog">
          {CATALOG.map((e) => (
            <option key={e.id} value={`cat:${e.id}`}>
              {e.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Plan exercises">
          {EXERCISE_MAP.map((e) => (
            <option key={e.planId} value={`plan:${e.planId}`}>
              {e.name} ({e.match})
            </option>
          ))}
        </optgroup>
      </select>
      <section className={styles.card} data-testid="muscle-card">
        <h2 className={styles.name}>{name}</h2>
        <p className={styles.id}>{detail}</p>
        <MuscleMap data={data} />
      </section>
    </div>
  );
}
