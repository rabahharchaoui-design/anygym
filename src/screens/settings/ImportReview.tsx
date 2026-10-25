import { useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { useNav } from '../../ui/nav';
import { useActiveGym } from '../../db/useActiveGym';
import { machineStartFor } from '../../db/gyms';
import { importedHashes, writeImport } from '../../db/importHistory';
import type { BarId, Gym, Load } from '../../db/types';
import { useLive } from '../../hooks/useLive';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { formatSetLine } from '../../lib/load';
import { setsIn, type ParsedImport } from '../../lib/import/anygymImportV1';
import {
  ASK_LOAD,
  SKIP,
  chooseKind,
  emptyChoices,
  fileSetText,
  kindOf,
  planImport,
  type LoadContext,
  type PlannedExercise,
  type PlannedSet,
  type ReviewChoices,
  type SetEdit,
} from '../../lib/import/importPlan';
import { EquipmentWeightSheet } from '../../components/load/EquipmentWeightSheet';
import { LOAD_TYPE_CHOICES, loadSetupFor, machineIdFor } from '../workout/exerciseLoad';
import { LoadTypeSheet } from '../workout/LoadTypeSheet';
import { setCount } from '../history/historyWords';
import { ImportSetSheet } from './ImportSetSheet';
import { PickExerciseSheet, skipText } from './PickExerciseSheet';
import { importDraft, type ImportDone } from './importDraft';
import css from './Import.module.css';

/** What the active gym knows for one exercise (bars, starting weight, what it can load). */
function contextFor(gym: Gym) {
  return (exerciseId: string, name: string): LoadContext => ({
    gymUnit: gym.unit,
    olympic: gym.bars.olympic,
    smith: gym.bars.smith,
    machineStart: machineStartFor(gym, machineIdFor(exerciseId, name)),
    setupFor: (kind) => ({ unit: gym.unit, ...loadSetupFor(gym, kind, exerciseId, name) }),
  });
}

/** The sets "Skip these" leaves out: every set of that exercise not imported before. */
const setsToSkip = (e: PlannedExercise) => e.sessions.reduce((n, s) => n + (s.already ? 0 : s.sets.length), 0);

const kindLabel = (kind: Load['kind']) => LOAD_TYPE_CHOICES.find((c) => c.kind === kind)?.label ?? kind;

/**
 * Import history review (SPEC 9.3): every set of the file, grouped by exercise, before anything is
 * written. Unsure sets are amber with the reason and fixable inline; a load type the file does not
 * know is asked once per exercise; a name the app cannot match is picked or skipped. One action:
 * "Import N sets".
 */
export function ImportReview() {
  // Read once: the draft is let go on the way back, while this screen may still draw.
  const [parsed] = useState(() => importDraft.get());
  const gym = useActiveGym();
  if (!parsed) return <Navigate to="/settings" replace />;
  return gym ? <Review gym={gym} parsed={parsed} /> : <Skeleton height={180} radius={20} />;
}

type Ask =
  | { type: 'pick'; ex: PlannedExercise }
  | { type: 'kind'; ex: PlannedExercise }
  | { type: 'base'; ex: PlannedExercise }
  | { type: 'set'; ex: PlannedExercise; set: PlannedSet; index: number };

function Review({ gym, parsed }: { gym: Gym; parsed: ParsedImport }) {
  const go = useNav();
  const [choices, setChoices] = useState<ReviewChoices>(emptyChoices);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const saving = useRef(false);
  const existing = useLive(() => importedHashes(), []);

  const plan = useMemo(
    () => planImport(parsed, choices, { planExercises: PLAN_EXERCISES, contextFor: contextFor(gym), existing: existing.data ?? new Set() }),
    [parsed, choices, gym, existing.data],
  );
  const total = setsIn(parsed.sessions);
  // A set waiting on its exercise's question is asked there, not flagged row by row.
  const flagged = (x: PlannedSet) => x.uncertain && !x.skipped && x.reason !== ASK_LOAD;
  const unsure = plan.exercises.reduce((n, e) => n + (e.skipped ? 0 : e.sessions.reduce((m, s) => m + (s.already ? 0 : s.sets.filter(flagged).length), 0)), 0);

  const update = (f: (c: ReviewChoices) => ReviewChoices) => setChoices((c) => f(c));
  const edit = (key: string, e: SetEdit) => update((c) => ({ ...c, edits: { ...c.edits, [key]: { ...c.edits[key], ...e } } }));

  const firstOpen = () => {
    const ex = plan.open[0];
    if (!ex) return;
    document.getElementById(`import-ex-${ex.ex.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setAsk({ type: ex.needsPick ? 'pick' : 'kind', ex });
  };

  const confirm = async () => {
    if (saving.current || plan.sets === 0) return;
    saving.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await writeImport(plan.sessions, gym.id, plan.fills);
      importDraft.set(null);
      const state: ImportDone = { importDone: result };
      go('/settings', { kind: 'pop', replace: true, state });
    } catch {
      saving.current = false;
      setBusy(false);
      setError(true);
    }
  };

  const label = !existing.ready
    ? 'Checking…'
    : plan.open.length > 0
      ? `Answer ${plan.open.length} ${plan.open.length === 1 ? 'question' : 'questions'}`
      : plan.sets === 0
        ? 'Nothing new to import'
        : `Import ${setCount(plan.sets)}`;

  const asked = ask?.ex;
  const askedName = asked ? (asked.target?.name ?? asked.ex.name) : '';
  const barOf = (e: PlannedExercise): BarId | undefined =>
    e.ex.loadType === 'smith_per_side' ? 'smith' : e.ex.loadType === 'barbell_per_side' ? 'olympic' : e.target?.bar;

  return (
    <div className={css.screen}>
      <TopBar title="Import history" leading={<BackButton to="/settings" label="Back to Settings" />}>
        <p className={`${css.meta} num`} data-testid="import-summary">
          {setCount(total)} · {parsed.exercises.length} {parsed.exercises.length === 1 ? 'exercise' : 'exercises'} · {parsed.unit}
        </p>
        {unsure > 0 && (
          <p className={`${css.metaAmber} num`} data-testid="import-unsure">
            {unsure} to check
          </p>
        )}
      </TopBar>

      {parsed.issues.length > 0 && <p className={css.notice}>Some lines in the file could not be read and are left out ({parsed.issues.length}).</p>}
      {plan.already > 0 && (
        <p className={css.notice} data-testid="import-already">
          {plan.already} {plan.already === 1 ? 'workout was' : 'workouts were'} imported before and {plan.already === 1 ? 'is' : 'are'} left out.
        </p>
      )}

      {plan.exercises.map((e) => {
        // Not matched to an exercise (yet): the file's own name, said plainly.
        const title = e.target?.name ?? `${e.ex.name} (not matched)`;
        return (
          <section key={e.ex.index} id={`import-ex-${e.ex.index}`} className={css.exercise} data-testid="import-exercise" data-skipped={e.skipped || undefined} aria-label={title}>
            <header className={css.head}>
              <h2 className={css.name}>{title}</h2>
              {e.target && e.ex.name !== e.target.name && <p className={css.sub}>In your file: {e.ex.name}</p>}
              {e.ex.note && <p className={css.sub}>{e.ex.note}</p>}
              {e.ex.gymNote && <p className={css.sub}>{e.ex.gymNote}</p>}
            </header>

            {e.needsPick && (
              <div className={css.ask} data-testid="ask-pick">
                <p className={css.askText}>We could not match this name to an exercise.</p>
                <div className={css.askRow}>
                  <button type="button" className={`${css.askButton} pressable`} onClick={() => setAsk({ type: 'pick', ex: e })}>
                    Pick the exercise
                  </button>
                  <button type="button" className={`${css.askQuiet} pressable`} onClick={() => update((c) => ({ ...c, picks: { ...c.picks, [e.ex.index]: SKIP } }))}>
                    {skipText(setsToSkip(e))}
                  </button>
                </div>
              </div>
            )}
            {!e.matched && (e.target || e.skipped) && (
              <p className={css.answer}>
                {e.skipped ? 'Skipped: not imported' : 'Picked by you'}
                <button
                  type="button"
                  className={`${css.link} pressable`}
                  onClick={() =>
                    e.skipped
                      ? update((c) => {
                          const picks = { ...c.picks };
                          delete picks[e.ex.index];
                          return { ...c, picks };
                        })
                      : setAsk({ type: 'pick', ex: e })
                  }
                >
                  {e.skipped ? 'Bring back' : 'Change'}
                </button>
              </p>
            )}
            {e.needsKind && (
              <div className={css.ask} data-testid="ask-kind">
                <p className={css.askText}>Your file does not say how this is loaded.</p>
                <div className={css.askRow}>
                  <button type="button" className={`${css.askButton} pressable`} onClick={() => setAsk({ type: 'kind', ex: e })}>
                    How do you load this?
                  </button>
                </div>
              </div>
            )}
            {e.ex.loadType === 'unknown' && e.kind && !e.skipped && (
              <p className={css.answer}>
                Loaded with: {kindLabel(e.kind)}
                <button type="button" className={`${css.link} pressable`} onClick={() => setAsk({ type: 'kind', ex: e })}>
                  Change
                </button>
              </p>
            )}
            {e.missingBase && !e.skipped && (
              <div className={css.ask} data-testid="ask-base">
                <p className={css.askText}>
                  {e.missingBase === 'smith' ? 'Set the Smith bar weight for this gym to count these sets.' : 'Set the starting weight of this machine to count these sets.'}
                </p>
                <div className={css.askRow}>
                  <button type="button" className={`${css.askButton} pressable`} onClick={() => setAsk({ type: 'base', ex: e })}>
                    {e.missingBase === 'smith' ? 'Set bar weight' : 'Set starting weight'}
                  </button>
                </div>
              </div>
            )}

            {e.sessions.map((s, si) => (
              <div key={s.source.hash + si} className={css.session} data-already={s.already || undefined}>
                <p className={css.sessionTitle}>
                  Workout {si + 1} of {e.sessions.length}
                  {s.already && <span className={css.tag}>Already imported</span>}
                </p>
                {s.source.note && <p className={css.sub}>{s.source.note}</p>}
                <ol className={css.sets}>
                  {s.sets.map((x, i) => (
                    <li key={x.key}>
                      <button
                        type="button"
                        className={`${css.set} pressable`}
                        data-testid="import-set"
                        data-uncertain={(flagged(x) && !e.skipped) || undefined}
                        data-skipped={x.skipped || undefined}
                        disabled={s.already || e.skipped}
                        onClick={() => (e.needsPick ? setAsk({ type: 'pick', ex: e }) : e.needsKind ? setAsk({ type: 'kind', ex: e }) : setAsk({ type: 'set', ex: e, set: x, index: i }))}
                      >
                        <span className={`${css.index} num`}>{i + 1}</span>
                        <span className={css.setMain}>
                          <span className={css.setLine}>
                            <span className="num">{x.load ? formatSetLine({ reps: x.reps, load: x.load }) : x.edited ? `${x.reps} reps` : fileSetText(x.source)}</span>
                            {x.kind === 'warmup' && <span className={css.tag}>Warm up</span>}
                            {x.kind === 'drop' && <span className={css.tag}>Drop</span>}
                            {x.skipped && <span className={css.tag}>Skip</span>}
                            {x.edited && !x.skipped && <span className={css.tagOk}>Checked</span>}
                          </span>
                          {flagged(x) && x.reason && <span className={css.reason}>{x.reason}</span>}
                          {x.note && <span className={css.note}>{x.note}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        );
      })}

      <div className={css.dock} data-testid="import-dock">
        <p className={css.error} role="status">
          {error ? 'Could not save the import. Try again.' : ''}
        </p>
        <Button
          onClick={() => (plan.open.length > 0 ? firstOpen() : void confirm())}
          disabled={busy || !existing.ready || (plan.open.length === 0 && plan.sets === 0)}
          aria-busy={busy}
          data-testid="import-confirm"
        >
          {label}
        </Button>
      </div>

      <PickExerciseSheet
        open={ask?.type === 'pick'}
        onClose={() => setAsk(null)}
        fileName={asked?.ex.name ?? ''}
        startFrom={asked?.ex.planExercise ?? ''}
        loadType={asked ? (asked.kind ?? kindOf(asked.ex.loadType)) : undefined}
        skipCount={asked ? setsToSkip(asked) : 0}
        onPick={(id) => {
          if (asked) update((c) => ({ ...c, picks: { ...c.picks, [asked.ex.index]: id } }));
          setAsk(null);
        }}
        onSkip={() => {
          if (asked) update((c) => ({ ...c, picks: { ...c.picks, [asked.ex.index]: SKIP } }));
          setAsk(null);
        }}
      />
      <LoadTypeSheet
        open={ask?.type === 'kind'}
        onClose={() => setAsk(null)}
        exerciseName={askedName}
        without={['timed']}
        current={asked?.kind}
        onPick={(kind) => {
          if (asked) update((c) => chooseKind(c, parsed, asked.ex.index, kind));
          setAsk(null);
        }}
      />
      <EquipmentWeightSheet
        open={ask?.type === 'base'}
        onClose={() => setAsk(null)}
        gymId={gym.id}
        unit={gym.unit}
        kind={asked?.missingBase === 'plate_machine' ? 'plate_machine' : 'smith'}
        machineId={asked?.missingBase === 'plate_machine' && asked.target ? machineIdFor(asked.target.id, asked.target.name) : 'smith_machine'}
      />
      <ImportSetSheet
        set={ask?.type === 'set' ? ask.set : null}
        index={ask?.type === 'set' ? ask.index : 0}
        exerciseId={asked?.target?.id ?? ''}
        exerciseName={askedName}
        kind={asked?.kind}
        bar={asked ? barOf(asked) : undefined}
        gym={gym}
        onClose={() => setAsk(null)}
        onSave={(e) => {
          if (ask?.type === 'set') edit(ask.set.key, e);
          setAsk(null);
        }}
        onSkip={(skip) => {
          if (ask?.type === 'set') edit(ask.set.key, { skip });
          setAsk(null);
        }}
      />
    </div>
  );
}
