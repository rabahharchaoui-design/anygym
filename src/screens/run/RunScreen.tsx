import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { GymPill } from '../../components/GymPill';
import { MusicLinks } from '../../components/MusicLinks';
import { useGeo } from '../../hooks/useGeo';
import { useNow } from '../../hooks/useNow';
import { useRunSetup } from '../../hooks/useRunSetup';
import { useTapGuard } from '../../hooks/useTapGuard';
import { DEFAULT_RUN_SETUP, RUN_TYPES, goalLine, gpsStatus, gpsWords, platformOf, type RunType } from '../../lib/run';
import { tick } from '../../ui/haptics';
import { IconButton } from '../../ui/IconButton';
import { ChevronDown, RecentreIcon } from '../../ui/icons';
import { Chip } from '../../ui/Chip';
import { Toast, type ToastMessage } from '../../ui/Toast';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { useToastTimeout } from '../../ui/useToastTimeout';
import { Countdown, type Origin } from './Countdown';
import { GoalSheet, type GoalKind } from './GoalSheet';
import { GpsChip, GpsSheet } from './GpsChip';
import { MapCredit, MapOfflineChip, RunMap } from './RunMap';
import { RunStarted } from './RunStarted';
import styles from './Run.module.css';

type Phase = 'setup' | 'countdown' | 'started';

/**
 * Run With Me, the start screen (SPEC 12.1, PLAN 4.2). The map is the hero: full bleed from under
 * the status bar down to the run types, with the title and the status chips floating on it. The
 * controls sit under it on the app background. One primary action: Start. It works with no setup
 * (a free run) and whatever the GPS says. After the countdown comes a plain placeholder until 4.3.
 */
export function RunScreen() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useToastTimeout(toast, setToast);
  const { state, change, setUnit } = useRunSetup();
  const setup = state?.setup ?? DEFAULT_RUN_SETUP;
  const unit = state?.unit ?? 'km';
  const geo = useGeo();
  const now = useNow(5000);
  const reduceMotion = useReducedMotionLive();

  const status = gpsStatus(geo, now);
  const words = gpsWords(status, geo.fix, unit, platformOf(navigator.userAgent));
  const [gpsOpen, setGpsOpen] = useState(false);
  const [goalKind, setGoalKind] = useState<GoalKind | null>(null);
  const [offline, setOffline] = useState(false);
  const [moved, setMoved] = useState(false);
  const [recentre, setRecentre] = useState(0);
  const [phase, setPhase] = useState<Phase>('setup');
  const [origin, setOrigin] = useState<Origin | null>(null);

  // The room the title and the controls take, so the map centres the dot in what is left.
  const topRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const top = Math.round(topRef.current?.lastElementChild?.getBoundingClientRect().bottom ?? 0);
      const bottom = Math.round(window.innerHeight - (panelRef.current?.getBoundingClientRect().top ?? window.innerHeight));
      setInset((i) => (i.top === top && i.bottom === bottom ? i : { top, bottom }));
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (topRef.current) ro?.observe(topRef.current);
    if (panelRef.current) ro?.observe(panelRef.current);
    return () => ro?.disconnect();
  }, []);

  const pickType = (type: RunType) => {
    change({ type });
    if (type !== 'free') setGoalKind(type);
  };
  const start = useTapGuard((e: React.MouseEvent<HTMLButtonElement>) => {
    if (phase !== 'setup') return;
    const b = e.currentTarget.getBoundingClientRect();
    tick();
    setGoalKind(null);
    setGpsOpen(false);
    setOrigin({ x: b.left + b.width / 2, y: b.top + b.height / 2, size: b.width });
    setPhase('countdown');
  });
  const toSetup = useCallback(() => setPhase('setup'), []);
  const toStarted = useCallback(() => setPhase('started'), []);

  const goal = goalLine(setup);
  const typeLabel = RUN_TYPES.find((t) => t.value === setup.type)!.label;
  const here = geo.fix && status !== 'denied' ? geo.fix : null;
  return (
    <section className={styles.screen} data-testid="run-screen" data-phase={phase}>
      <RunMap here={here} recentre={recentre} reduceMotion={reduceMotion} inset={inset} onOffline={setOffline} onMoved={setMoved} />
      <div className={styles.float} data-testid="run-float">
      <div className={styles.top} ref={topRef}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Run With Me</h1>
          {/* SPEC 19: the gym pill is on the Run tab too. */}
          <span className={styles.pillSlot}>
            <GymPill onToast={setToast} />
          </span>
        </div>
        <div className={styles.chips}>
          <GpsChip status={status} words={words} onPress={() => setGpsOpen(true)} />
          {offline && <MapOfflineChip />}
        </div>
      </div>
      <div className={styles.stage}>
        <MapCredit />
        {here && moved && (
          <IconButton label="Back to where I am" onPress={() => setRecentre((n) => n + 1)} testId="run-recentre">
            <RecentreIcon aria-hidden="true" />
          </IconButton>
        )}
      </div>
      <div className={styles.panel} ref={panelRef}>
        <div className={styles.types} role="group" aria-label="Run type" data-testid="run-types">
          {RUN_TYPES.map((t) => (
            <Chip key={t.value} label={t.label} picked={setup.type === t.value} onPress={() => pickType(t.value)} testId={`run-type-${t.value}`} block small />
          ))}
        </div>
        <div className={styles.row}>
          {setup.type === 'free' ? (
            <p className={styles.goal} data-testid="run-goal">
              <span className={styles.goalLabel}>{goal.label}</span>
              <span className={styles.goalDetail}>{goal.detail}</span>
            </p>
          ) : (
            <button type="button" className={`${styles.goal} pressable`} data-testid="run-goal" aria-label={`${typeLabel}: ${goal.label}. Change`} onClick={() => setGoalKind(setup.type as GoalKind)}>
              <span className={styles.goalLabel}>
                {goal.label}
                <ChevronDown width={18} height={18} strokeWidth={2.4} aria-hidden="true" />
              </span>
              {goal.detail && <span className={styles.goalDetail}>{goal.detail}</span>}
            </button>
          )}
          <span className={styles.music}>
            <MusicLinks />
          </span>
        </div>
        <button type="button" className={styles.start} data-testid="run-start" onClick={start}>
          Start
        </button>
      </div>
      </div>
      <GoalSheet kind={goalKind} setup={setup} unit={unit} onChange={change} onUnit={setUnit} onClose={() => setGoalKind(null)} />
      <GpsSheet open={gpsOpen} status={status} words={words} onClose={() => setGpsOpen(false)} onAsk={geo.ask} />
      {phase === 'countdown' && origin && <Countdown origin={origin} reduceMotion={reduceMotion} onDone={toStarted} onCancel={toSetup} />}
      <Toast toast={toast} bottom="calc(var(--tabbar-capsule) + var(--tabbar-gap) + var(--resume-space, 0px) - var(--safe-bottom) - 4px)" />
      {phase === 'started' && <RunStarted what={setup.type === 'free' ? typeLabel : `${typeLabel} · ${goal.label}`} onStop={toSetup} />}
    </section>
  );
}
