import { useState } from 'react';
import { CalendarDays, Dumbbell, Weight } from 'lucide-react';
import { SlidingToggle } from '../../ui/SlidingToggle';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { BottomCTA } from '../../ui/BottomCTA';
import { Toast, undoToast, type ToastMessage } from '../../ui/Toast';
import { PRBadge } from '../../ui/PRBadge';
import { AppMarkLoader } from '../../ui/AppMarkLoader';
import styles from './UiDevScreen.module.css';

const GOALS = [
  { id: 'strength', label: 'Get stronger', hint: 'Fewer reps, heavier', icon: Weight },
  { id: 'muscle', label: 'Build muscle', hint: '8 to 12 reps', icon: Dumbbell },
  { id: 'habit', label: 'Train regularly', hint: 'Short, steady sessions', icon: CalendarDays },
] as const;

/**
 * Dev preview (#/dev/ui?dev, PLAN 2.2e): every shared component of the premium foundation in its
 * states, for the visual tests and the critic. Behind the dev flag.
 */
export function UiDevScreen() {
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb');
  const [dist, setDist] = useState<'km' | 'mi' | 'm'>('km');
  const [goal, setGoal] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [pr, setPr] = useState(0);
  const [undone, setUndone] = useState(0);
  const [loader, setLoader] = useState(0);
  return (
    <div className={styles.screen}>
      <main className={styles.main}>
        <h1 className={styles.title}>Components</h1>
        <section className={styles.block} aria-label="Sliding toggle">
          <h2 className={styles.h2}>Sliding toggle</h2>
          <div className={styles.row}>
            <span>Weight</span>
            <SlidingToggle label="Weight unit" testId="toggle-2" options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} value={unit} onChange={setUnit} />
          </div>
          <SlidingToggle label="Distance" testId="toggle-3" block options={[{ value: 'km', label: 'km' }, { value: 'mi', label: 'miles' }, { value: 'm', label: 'meters' }]} value={dist} onChange={setDist} />
          <SlidingToggle label="Off" testId="toggle-off" options={[{ value: 'a', label: 'On' }, { value: 'b', label: 'Off' }]} value="a" onChange={() => undefined} disabled />
        </section>
        <section className={styles.block} aria-label="Choice cards">
          <h2 className={styles.h2}>Choice cards</h2>
          <div className={styles.cards} data-testid="choice-cards">
            {GOALS.map((g) => (
              <ChoiceCard key={g.id} icon={g.icon} label={g.label} hint={g.hint} picked={goal === g.id} onPress={() => setGoal(g.id)} />
            ))}
          </div>
        </section>
        <section className={styles.block} aria-label="PR badge">
          <h2 className={styles.h2}>PR badge</h2>
          <div className={styles.setRow} data-testid="pr-row">
            <span className={`${styles.setNo} num`}>2</span>
            {pr > 0 && <PRBadge key={pr} setId={`dev-${pr}`} title="185 lb × 6, best ever" className={styles.badge} />}
            <span className="num">185</span>
            <span className="num">6</span>
          </div>
          <button type="button" className={`${styles.link} pressable`} onClick={() => setPr((n) => n + 1)}>
            Log a best set
          </button>
        </section>
        <section className={styles.block} aria-label="Toast">
          <h2 className={styles.h2}>Toast with Undo</h2>
          <button type="button" className={`${styles.link} pressable`} onClick={() => setToast(undoToast(Date.now(), 'Set deleted', () => {
                  setUndone((n) => n + 1);
                  setToast(null);
                }))}>
            Delete a set
          </button>
          <p className={styles.note} data-testid="undone">
            Undone {undone}
          </p>
        </section>
        <section className={styles.block} aria-label="Loader">
          <h2 className={styles.h2}>App mark loader</h2>
          <AppMarkLoader key={loader} inline label="Loading preview" />
          <button type="button" className={`${styles.link} pressable`} onClick={() => setLoader((n) => n + 1)}>
            Replay
          </button>
        </section>
      </main>
      <Toast toast={toast} bottom="150px" />
      <BottomCTA onPress={() => setGoal(null)} disabled={!goal} disabledReason="Pick a goal first" note="Stays on this phone." testId="cta">
        Continue
      </BottomCTA>
    </div>
  );
}
