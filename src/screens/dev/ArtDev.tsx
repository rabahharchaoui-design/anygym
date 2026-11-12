import { useState } from 'react';
import { ArtBadge, ArtInkBloom, ArtLeather, ArtPaper, ArtScene } from '../../ui/art/lazy';
import { SCENES } from '../../ui/art/scenes';
import { BADGE_FAMILIES, MILESTONES, type BadgeFamily } from '../../ui/badges/families';
import { EFFECTS, Effect } from '../../ui/celebrate';
import { Switch } from '../../ui/Switch';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import styles from './ArtDev.module.css';

/** Sample names and numbers for the sheet only: real badges get theirs from the achievements logic (Session 5). */
const SAMPLE: Record<BadgeFamily, { name: string; value?: number }> = {
  first_workout: { name: 'First workout' },
  streak: { name: '7 day streak', value: 7 },
  pr: { name: 'New best' },
  milestone: { name: '25 workouts', value: 25 },
  first_run: { name: 'First run' },
  new_city: { name: 'New city' },
  level: { name: 'Level 3', value: 3 },
};
const SIZES = [32, 48, 64, 96, 160] as const;
const SCENE_NAME = { today: 'Today, no plan', history: 'History, no workouts', plans: 'Plans, empty', planReady: 'Plan ready', welcome: 'Welcome' } as const;
const EFFECT_NAME = { burst: 'Burst: a record', shards: 'Glass shards: first workout', ambient: 'Drifting glass: behind a summary', ring: 'Ring: level up', trail: 'Light trail: run record' } as const;

/**
 * The art sheet of the dev UI screen (#/dev/ui?dev, PLAN 3.6h): every badge family unlocked and
 * locked, the sizes, each celebration effect with Run again and a still switch, the scenes and the
 * passport surfaces.
 */
export function ArtDev() {
  const system = useReducedMotionLive();
  const [still, setStill] = useState(false);
  const [runs, setRuns] = useState<Record<string, number>>({});
  const reduce = still || !!system;
  return (
    <>
      <section className={styles.block} aria-label="Badges" data-testid="art-badges">
        <h2 className={styles.h2}>Badges</h2>
        <ul className={styles.badges}>
          {BADGE_FAMILIES.flatMap((family) =>
            [false, true].map((locked) => (
              <li key={`${family}-${locked}`} className={styles.cell} data-testid={`badge-cell-${family}-${locked ? 'locked' : 'open'}`}>
                <ArtBadge family={family} {...SAMPLE[family]} locked={locked} size={72} caption />
              </li>
            )),
          )}
        </ul>
        <h2 className={styles.h2}>Milestones</h2>
        <ul className={styles.line} data-testid="badge-milestones">
          {MILESTONES.map((n) => (
            <li key={n} className={styles.cell}>
              <ArtBadge family="milestone" name={`${n} workouts`} value={n} size={64} caption />
            </li>
          ))}
        </ul>
        <h2 className={styles.h2}>Sizes, 32 to 160</h2>
        <div className={styles.sizes} data-testid="badge-sizes">
          {SIZES.map((size) => (
            <ArtBadge key={size} family="streak" name="7 day streak" value={7} size={size} />
          ))}
        </div>
      </section>
      <section className={styles.block} aria-label="Effects" data-testid="art-effects">
        <h2 className={styles.h2}>Celebration effects</h2>
        <div data-testid="fx-still">
          <Switch label="Show as stills" hint="What reduced motion shows" checked={still} onChange={setStill} />
        </div>
        {EFFECTS.map((variant) => (
          <div key={variant} className={styles.fx}>
            <div className={styles.stage} data-testid={`fx-stage-${variant}`}>
              <Effect key={`${runs[variant] ?? 0}-${reduce}`} variant={variant} reduce={reduce} />
            </div>
            <div className={styles.head}>
              <span className={styles.fxName}>{EFFECT_NAME[variant]}</span>
              <button type="button" className={`${styles.link} pressable`} onClick={() => setRuns((r) => ({ ...r, [variant]: (r[variant] ?? 0) + 1 }))} data-testid={`fx-replay-${variant}`}>
                Run again
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className={styles.block} aria-label="Scenes" data-testid="art-scenes">
        <h2 className={styles.h2}>Scenes: empty states and heroes</h2>
        <ul className={styles.badges}>
          {SCENES.map((name) => (
            <li key={name} className={styles.sceneCell}>
              <ArtScene name={name} width={120} />
              <span className={styles.h2}>{SCENE_NAME[name]}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.block} aria-label="Passport surfaces" data-testid="art-passport">
        <h2 className={styles.h2}>Passport surfaces: leather, guilloche paper, ink bloom</h2>
        <div className={styles.passport}>
          <ArtLeather>AnyGym</ArtLeather>
          <ArtPaper>
            <ArtInkBloom size={104} />
          </ArtPaper>
        </div>
      </section>
    </>
  );
}
