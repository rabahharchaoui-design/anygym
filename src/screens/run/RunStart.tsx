import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { rememberTold, wasTold } from '../../hooks/runFlags';
import { runEngine } from '../../hooks/useRunEngine';
import { unlockVoice } from '../../hooks/voicePlayer';
import { GymPill } from '../../components/GymPill';
import { MusicLinks } from '../../components/MusicLinks';
import { useGeo } from '../../hooks/useGeo';
import { useNow } from '../../hooks/useNow';
import { useRunSetup } from '../../hooks/useRunSetup';
import { useTapGuard } from '../../hooks/useTapGuard';
import { DEFAULT_RUN_SETUP, RUN_TYPES, goalLine, gpsStatus, gpsWords, platformOf, type RunType } from '../../lib/run';
import { tick } from '../../ui/haptics';
import { IconButton } from '../../ui/IconButton';
import { Button } from '../../ui/Button';
import { ChevronDown, RecentreIcon, TuneIcon } from '../../ui/icons';
import { Chip } from '../../ui/Chip';
import { Toast, type ToastMessage } from '../../ui/Toast';
import { useToastTimeout } from '../../ui/useToastTimeout';
import { Countdown } from './Countdown';
import { GoalSheet, type GoalKind } from './GoalSheet';
import { GpsChip, GpsSheet } from './GpsChip';
import { MapCredit, MapOfflineChip, RunMap } from './RunMap';
import { PocketSheet, RunSettingsSheet } from './RunSheets';
import styles from './Run.module.css';

type Phase = 'setup' | 'countdown';

type Props = {
  /** A run is going on behind this screen (hidden, not ended): its numbers in one line, or null. */
  going: { readout: string; paused: boolean } | null;
  /** Back to the live run. */
  onOpen: () => void;
  reduceMotion: boolean;
};

/**
 * Run With Me, the start screen (SPEC 12.1, PLAN 4.2). The map is the hero: full bleed from under
 * the status bar down to the run types, with the title and the status chips floating on it. The
 * controls sit under it on the app background. One primary action: Start. It works with no setup
 * (a free run) and whatever the GPS says. After the countdown the run starts (hooks/runEngine) and
 * the live run screen takes over. While a run goes on hidden, the controls give way to one card:
 * "Run in progress" and the way back.
 */
export function RunStart({ going, onOpen, reduceMotion }: Props) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useToastTimeout(toast, setToast);
  const { state, change, setUnit } = useRunSetup();
  const setup = state?.setup ?? DEFAULT_RUN_SETUP;
  const unit = state?.unit ?? 'km';
  // While a run goes on the engine listens to the phone; this screen does not start a second watch.
  const geo = useGeo(!going);
  const now = useNow(5000);

  const status = gpsStatus(geo, now);
  const words = gpsWords(status, geo.fix, unit, platformOf(navigator.userAgent));
  const [gpsOpen, setGpsOpen] = useState(false);
  const [goalKind, setGoalKind] = useState<GoalKind | null>(null);
  const [offline, setOffline] = useState(false);
  const [moved, setMoved] = useState(false);
  const [recentre, setRecentre] = useState(0);
  const [phase, setPhase] = useState<Phase>('setup');
  const [pocket, setPocket] = useState(false);
  const [settings, setSettings] = useState(false);

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
  // The countdown is up: GPS starts now, so the first position is there at GO (PLAN 4.4a).
  const toCountdown = () => {
    runEngine.warmGps();
    setPhase('countdown');
  };
  const start = useTapGuard(() => {
    if (phase !== 'setup') return;
    // The tap's tick, and the countdown's first one when it opens straight away (PLAN 4.4c).
    tick();
    // A phone lets sound start only from a tap: this is the tap the voice coach's first words hang on.
    unlockVoice();
    setGoalKind(null);
    setGpsOpen(false);
    // SPEC 12.2: said once, before the first run. "Got it" goes on to the countdown.
    if (!wasTold('pocket')) setPocket(true);
    else toCountdown();
  });
  const afterPocket = () => {
    // The countdown's first tick: inside this tap, the only place iPhone plays it (PLAN 4.4c).
    tick();
    rememberTold('pocket');
    setPocket(false);
    toCountdown();
  };
  // Leaving the tab mid countdown: the early GPS stops too (after GO the run owns it).
  useEffect(() => () => runEngine.coolGps(), []);
  const toSetup = useCallback(() => {
    runEngine.coolGps();
    setPhase('setup');
  }, []);
  // The countdown is over: the run exists from this moment (hooks/runEngine), and the live screen opens.
  const toStarted = useCallback(() => {
    runEngine.start(setup, unit);
    onOpen();
  }, [setup, unit, onOpen]);

  const goal = goalLine(setup);
  const typeLabel = RUN_TYPES.find((t) => t.value === setup.type)!.label;
  const here = geo.fix && status !== 'denied' ? geo.fix : null;
  // While the countdown covers it the map sleeps: hidden, and the dot does not move (no WebGL drawing under the count).
  const mapHere = useRef(here);
  if (phase === 'setup') mapHere.current = here;
  return (
    <section className={styles.screen} data-testid="run-screen" data-phase={phase} data-going={going ? true : undefined}>
      <RunMap asleep={phase === 'countdown'} here={mapHere.current} recentre={recentre} reduceMotion={reduceMotion} inset={inset} onOffline={setOffline} onMoved={setMoved} />
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
          {/* While a run goes on the engine has the GPS; this chip would only describe the idle start screen. */}
          {!going && <GpsChip status={status} words={words} onPress={() => setGpsOpen(true)} />}
          {offline && <MapOfflineChip />}
          {!going && (
            <span className={styles.settingsSlot}>
              <IconButton label="Run settings" onPress={() => setSettings(true)} testId="run-settings">
                <TuneIcon aria-hidden="true" />
              </IconButton>
            </span>
          )}
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
        {going ? (
          <div className={styles.going} data-testid="run-going">
            <p className={styles.goingTitle}>{going.paused ? 'Run paused' : 'Run in progress'}</p>
            <p className={`${styles.goingLine} num`} data-testid="run-going-readout">
              {going.readout}
            </p>
            <Button size="lg" onClick={onOpen} data-testid="run-going-open">
              Back to the run
            </Button>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
      </div>
      <GoalSheet kind={goalKind} setup={setup} unit={unit} onChange={change} onUnit={setUnit} onClose={() => setGoalKind(null)} />
      <GpsSheet open={gpsOpen} status={status} words={words} onClose={() => setGpsOpen(false)} onAsk={geo.ask} />
      {phase === 'countdown' && <Countdown reduceMotion={reduceMotion} onDone={toStarted} onCancel={toSetup} />}
      <Toast toast={toast} bottom="calc(var(--tabbar-capsule) + var(--tabbar-gap) + var(--resume-space, 0px) - var(--safe-bottom) - 4px)" />
      <PocketSheet open={pocket} onGo={afterPocket} onClose={() => setPocket(false)} />
      <RunSettingsSheet open={settings} autoPause={setup.autoPause} onAutoPause={(on) => change({ autoPause: on })} voice={setup.voice} onVoice={(voice) => change({ voice })} unit={unit} onClose={() => setSettings(false)} />
    </section>
  );
}
