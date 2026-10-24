import { useState, type ReactNode } from 'react';
import { BodyweightInput } from '../../components/load/BodyweightInput';
import { DumbbellWheel } from '../../components/load/DumbbellWheel';
import { EquipmentWeightSheet } from '../../components/load/EquipmentWeightSheet';
import { PlateMachineInput } from '../../components/load/PlateMachineInput';
import { StackSelector } from '../../components/load/StackSelector';
import { TimedInput } from '../../components/load/TimedInput';
import type { Load } from '../../db/types';
import { useActiveGym } from '../../db/useActiveGym';
import type { PromptKind } from '../../lib/equipmentPrompt';
import styles from './LoadsDevScreen.module.css';

const PLATE_MACHINE = 'leg_press';
const STACK_MACHINE = 'lat_pulldown';
const BAR_PROMPTS: Array<{ kind: PromptKind; machineId: string; label: string }> = [
  { kind: 'smith', machineId: 'smith_machine', label: 'Smith' },
  { kind: 'ez_curl', machineId: 'ez_curl_bar', label: 'EZ curl' },
  { kind: 'trap', machineId: 'trap_bar', label: 'Trap bar' },
];

/** Dev harness for every load input (#/dev/loads), on the active gym. Hidden behind the dev flag. */
export function LoadsDevScreen() {
  const gym = useActiveGym();
  const [dumbbell, setDumbbell] = useState<Load | null>(null);
  const [single, setSingle] = useState<Load | null>(null);
  const [stack, setStack] = useState<Load | null>(null);
  const [perSide, setPerSide] = useState<number[]>([]);
  const [machine, setMachine] = useState<Load | null>(null);
  const [bodyweight, setBodyweight] = useState<Load | null>(null);
  const [timed, setTimed] = useState<Load | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [prompt, setPrompt] = useState<(typeof BAR_PROMPTS)[number] | null>(null);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Loads</h1>
        <span className={styles.gym}>{gym ? `${gym.name} · ${gym.unit}` : ' '}</span>
      </header>

      {!gym ? (
        <div className={styles.skeleton} aria-hidden="true" />
      ) : (
        <>
          <Section id="dumbbell" title="Dumbbells" json={dumbbell}>
            <DumbbellWheel unit={gym.unit} range={gym.dumbbellRange} mode="dumbbell_each" value={dumbbell} onChange={setDumbbell} />
          </Section>
          <Section id="single" title="Single weight" json={single}>
            <DumbbellWheel unit={gym.unit} range={gym.dumbbellRange} mode="single" value={single} onChange={setSingle} />
          </Section>
          <Section id="stack" title="Stack" json={stack}>
            <StackSelector gym={gym} machineId={STACK_MACHINE} value={stack} onChange={setStack} />
          </Section>
          <Section id="plate-machine" title="Plate loaded machine" json={machine}>
            <PlateMachineInput
              gym={gym}
              machineId={PLATE_MACHINE}
              perSide={perSide}
              onChange={(p, l) => {
                setPerSide(p);
                setMachine(l);
              }}
            />
          </Section>
          <Section id="bodyweight" title="Bodyweight" json={bodyweight}>
            <BodyweightInput unit={gym.unit} value={bodyweight} onChange={setBodyweight} />
          </Section>
          <Section id="timed" title="Timed" json={timed} extra={{ seconds }}>
            <TimedInput unit={gym.unit} targetSeconds={30} onChange={setTimed} onSeconds={setSeconds} />
          </Section>
          <Section id="prompts" title="First use prompts" json={{ bars: gym.bars, equipmentWeights: gym.equipmentWeights }}>
            <div className={styles.prompts}>
              {BAR_PROMPTS.map((p) => (
                <button key={p.kind} type="button" className={`${styles.chip} pressable`} onClick={() => setPrompt(p)}>
                  {p.label}
                </button>
              ))}
            </div>
            <EquipmentWeightSheet
              open={prompt !== null}
              onClose={() => setPrompt(null)}
              gymId={gym.id}
              unit={gym.unit}
              machineId={prompt?.machineId ?? ''}
              kind={prompt?.kind ?? 'smith'}
            />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  json,
  extra,
  children,
}: {
  id: string;
  title: string;
  json: unknown;
  extra?: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <section className={styles.card} data-testid={`section-${id}`} aria-label={title}>
      <h2 className={styles.cardTitle}>{title}</h2>
      {children}
      <pre className={styles.json} data-testid={`json-${id}`}>
        {JSON.stringify(json)}
      </pre>
      {extra && (
        <pre className={styles.json} data-testid={`json-${id}-extra`}>
          {JSON.stringify(extra)}
        </pre>
      )}
    </section>
  );
}
