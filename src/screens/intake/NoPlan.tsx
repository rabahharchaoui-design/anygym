// The "no plan fits" notice of the intake (PLAN 3.3a). Moved out of IntakeScreen.tsx as it was (PLAN
// 3.5f, code organization).
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { progressOf, type IntakeAnswers } from '../../lib/intake/funnel';
import { EQUIPMENT_LABEL, PLACES } from '../../lib/intake/options';
import { noPlanWords } from '../../lib/intake/planPick';
import { EquipmentArt } from './EquipmentArt';
import { STAYS_HERE } from './copy';
import styles from './Intake.module.css';
import noPlanStyles from './IntakeNoPlan.module.css';
import equipStyles from './IntakeEquipment.module.css';

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
    <div className={noPlanStyles.noPlanBody}>
      <section className={noPlanStyles.gymCard} data-testid="noplan-gym">
        <p className={noPlanStyles.gymCardTitle}>Your gym: {place?.label ?? 'not set'}</p>
        <p className={noPlanStyles.gymCardKit}>{kit}</p>
        {equipment.length > 0 && (
          <ul className={noPlanStyles.gymArt} aria-hidden="true">
            {equipment.slice(0, 6).map((id) => (
              <li key={id}>
                <EquipmentArt id={id} className={equipStyles.art} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <ol className={noPlanStyles.quickSteps} aria-label="How a quick workout goes" data-testid="noplan-steps">
        {QUICK_STEPS.map((t, i) => (
          <li key={t} className={noPlanStyles.quickStep}>
            <span className={`${noPlanStyles.quickNum} num`}>{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Right after the equipment, when no plan can fit: say so, and keep going. PLAN 3.5u: the intake
 * never starts a workout; the quick workout it describes is on Today, where the intake ends.
 */
export function NoPlanNotice({ answers, onBack, onKeepGoing }: { answers: IntakeAnswers; onBack: () => void; onKeepGoing: () => void }) {
  const words = noPlanWords(answers.place);
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
      <BottomCTA onPress={onKeepGoing} reasonAndNote note={STAYS_HERE} testId="noplan-cta" className={styles.cta}>
        Keep going
      </BottomCTA>
    </div>
  );
}
