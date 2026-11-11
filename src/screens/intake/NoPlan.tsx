// The "no plan fits" notice of the intake (PLAN 3.3a). Moved out of IntakeScreen.tsx as it was (PLAN
// 3.5f, code organization).
import { useRef, useState, type MutableRefObject } from 'react';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { Button } from '../../ui/Button';
import { useNav } from '../../ui/nav';
import { useTapGuard } from '../../hooks/useTapGuard';
import { getActiveGym, startDb } from '../../db/bootstrap';
import { clearIntakeDraft } from '../../db/intake';
import { startWorkout } from '../../db/workouts';
import { progressOf, type IntakeAnswers } from '../../lib/intake/funnel';
import { EQUIPMENT_LABEL, PLACES } from '../../lib/intake/options';
import { noPlanWords } from '../../lib/intake/planPick';
import { EquipmentArt } from './EquipmentArt';
import { persistAnswers } from './persist';
import { STAYS_HERE } from './copy';
import styles from './Intake.module.css';

const QUICK_STEPS = ['Add an exercise from the list', 'Log each set: weight and reps', 'Finish, and it goes in your history'] as const;

/**
 * PLAN 3.3a: the notice fills with what is true right now: the gym as answered, with the pictures
 * of what is on, and how a quick workout goes.
 */
function NoPlanBody({ answers }: { answers: IntakeAnswers }) {
  const equipment = answers.equipment ?? [];
  const place = PLACES.find((p) => p.id === answers.place);
  const named = equipment.slice(0, 2).map((id) => EQUIPMENT_LABEL[id]);
  const kit = equipment.length === 0 ? 'Nothing picked: bodyweight only' : equipment.length <= 2 ? named.join(' and ') : `${named.join(', ')} and ${equipment.length - 2} more`;
  return (
    <div className={styles.noPlanBody}>
      <section className={styles.gymCard} data-testid="noplan-gym">
        <p className={styles.gymCardTitle}>Your gym: {place?.label ?? 'not set'}</p>
        <p className={styles.gymCardKit}>{kit}</p>
        {equipment.length > 0 && (
          <ul className={styles.gymArt} aria-hidden="true">
            {equipment.slice(0, 6).map((id) => (
              <li key={id}>
                <EquipmentArt id={id} className={styles.art} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <ol className={styles.quickSteps} aria-label="How a quick workout goes" data-testid="noplan-steps">
        {QUICK_STEPS.map((t, i) => (
          <li key={t} className={styles.quickStep}>
            <span className={`${styles.quickNum} num`}>{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Right after the equipment, when no plan can fit: say so, and let them start or keep going. */
export function NoPlanNotice({ answers, baseline, onBack, onKeepGoing }: { answers: IntakeAnswers; baseline: MutableRefObject<IntakeAnswers | undefined>; onBack: () => void; onKeepGoing: () => void }) {
  const go = useNav();
  const words = noPlanWords(answers.place);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const quick = useTapGuard(async () => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    try {
      await persistAnswers(answers, baseline);
      const gym = (await getActiveGym()) ?? (await startDb());
      const s = await startWorkout(gym.id);
      void clearIntakeDraft();
      go(`/workout/${s.id}`, { kind: 'push', replace: true });
    } catch {
      setError('Could not start the workout. Try again.');
    } finally {
      busy.current = false;
    }
  });
  return (
    <div className={styles.screen} data-testid="intake" data-step="noPlan">
      <header className={styles.top}>
        <BackButton label="Back" onPress={onBack} />
        <div className={styles.progress} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: `${Math.max(4, progressOf('noPlan', answers) * 100)}%` }} />
        </div>
        <span className={styles.topSpacer} aria-hidden="true" />
      </header>
      <main className={styles.body} data-scroller>
        <h1 className={styles.title}>{words.title}</h1>
        <p className={styles.sub}>{words.quick}</p>
        <NoPlanBody answers={answers} />
      </main>
      <BottomCTA
        onPress={() => void quick()}
        reasonAndNote
        note={STAYS_HERE}
        testId="noplan-cta"
        className={styles.cta}
        above={
          <>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <p className={styles.keepHint}>It won&apos;t change what you can do today.</p>
            <Button variant="secondary" className={styles.keepGoing} onClick={onKeepGoing} data-testid="noplan-continue">
              Finish my profile
            </Button>
          </>
        }
      >
        Start a quick workout
      </BottomCTA>
    </div>
  );
}
