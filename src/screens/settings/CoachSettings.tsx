// Settings → Coach (PLAN 3.8, SPEC 15): the Auto level up switch, off by default, with its plain
// words right under it. The first time it is turned on, a short sheet shows one real example from
// the user's own lifts (or says honestly that there is none yet) with Turn on and Not now.
import { useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { Button } from '../../ui/Button';
import { useLive } from '../../hooks/useLive';
import { getProfile } from '../../db/intake';
import { setAutoLevelUp } from '../../db/coach';
import { coachData } from '../../db/coachData';
import { AUTO_LEVEL_UP_HINT, autoExample, weightWords } from '../../lib/coach';
import { formatAmount } from '../../lib/load';
import settings from '../Settings.module.css';
import styles from './AutoLevelUp.module.css';

export function CoachSettings() {
  const profile = useLive(() => getProfile(), []);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(false);
  const on = profile.data?.coach?.autoLevelUp === true;
  const seen = profile.data?.coach?.autoIntroAt !== undefined;

  const save = (value: boolean) => {
    setError(false);
    return setAutoLevelUp(value).then(
      () => true,
      () => {
        setError(true);
        return false;
      },
    );
  };

  return (
    <section className={settings.group} aria-labelledby="set-coach">
      <h2 id="set-coach" className={settings.groupTitle}>
        Coach
      </h2>
      <div className={settings.card} data-testid="settings-coach">
        <Switch
          label="Auto level up"
          hint={AUTO_LEVEL_UP_HINT}
          checked={on}
          disabled={!profile.ready}
          onChange={(value) => {
            if (value && !seen) setAsking(true);
            else void save(value);
          }}
        />
      </div>
      <p className={settings.error} role="status">
        {error ? 'Could not save that. Try again.' : ''}
      </p>
      <AutoLevelUpSheet
        open={asking}
        onClose={() => setAsking(false)}
        onTurnOn={async () => {
          if (await save(true)) setAsking(false);
        }}
      />
    </section>
  );
}

function AutoLevelUpSheet({ open, onClose, onTurnOn }: { open: boolean; onClose: () => void; onTurnOn: () => Promise<void> }) {
  // Read only while open: the user's own lifts, for one real example.
  const live = useLive(() => (open ? coachData(Date.now()) : Promise.resolve(undefined)), [open]);
  const [busy, setBusy] = useState(false);
  const example = live.data ? autoExample(live.data.lifts, live.data.changes, live.data.now) : null;
  return (
    <Sheet open={open} onClose={onClose} label="Auto level up">
      <div className={styles.body} data-testid="auto-sheet">
        <h2 className={styles.title}>Auto level up</h2>
        <p className={styles.sub}>When you hit all your reps on a lift for a week, AnyGym adds a little weight for next week. Today shows what changed, with Undo for each lift.</p>
        {!live.ready ? (
          <div className={styles.none} aria-hidden="true">
            &nbsp;
          </div>
        ) : example ? (
          <div className={styles.example} data-testid="auto-example">
            <span className={styles.exName}>{example.name}</span>
            <span className={`${styles.exNumbers} num`}>
              {formatAmount(example.from)} → <b>{weightWords(example.loadKind, example.to, example.unit)}</b>
            </span>
            <span className={styles.exWhen}>next week, once you hit all your reps</span>
          </div>
        ) : (
          <p className={styles.none} data-testid="auto-example-none">
            No lifts logged yet, so there is no example to show. Once you log a week of workouts, it works on its own.
          </p>
        )}
        <div className={styles.buttons}>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onTurnOn().finally(() => setBusy(false));
            }}
          >
            Turn on
          </Button>
          <Button variant="tertiary" onClick={onClose}>
            Not now
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
