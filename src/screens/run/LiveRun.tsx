import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { rememberTold, wasTold } from '../../hooks/runFlags';
import { runEngine, type EngineState } from '../../hooks/useRunEngine';
import { usePocketDim } from '../../hooks/usePocketDim';
import { useRunSetup } from '../../hooks/useRunSetup';
import { blockEffort, DEFAULT_VOICE, readIntervals, readLive, distanceWithUnit, goalProgress, type LiveRun as Live, type VoiceSettings } from '../../lib/run';
import { formatElapsed } from '../../lib/timer';
import { tick } from '../../ui/haptics';
import { IconButton } from '../../ui/IconButton';
import { ChevronDown, TuneIcon } from '../../ui/icons';
import { Toast, type ToastMessage } from '../../ui/Toast';
import { useToastTimeout } from '../../ui/useToastTimeout';
import { LiveControls } from './LiveControls';
import { LiveMap } from './LiveMap';
import { LiveStats, nextMetric, type LiveNote, type Metric } from './LiveStats';
import { pageAfterSwipe, type Page } from './liveSwipe';
import { RunSettingsSheet } from './RunSheets';
import styles from './Live.module.css';
import iv from './Intervals.module.css';

type Props = { live: Live; wake: EngineState['wake']; saveFailed: boolean; reduceMotion: boolean; onHide: () => void };

function noteOf(live: Live, status: ReturnType<typeof readLive>['status']): LiveNote {
  if (status === 'paused') return { tone: 'paused', text: live.closed ? 'Paused while the app was closed' : 'Paused' };
  if (live.gps === 'denied') return { tone: 'wait', text: 'Location is off for AnyGym' };
  if (status === 'waiting') return { tone: 'wait', text: 'Looking for GPS' };
  if (status === 'auto-paused') return { tone: 'auto', text: 'Auto paused · move to go on' };
  return null;
}

/**
 * The live run (SPEC 12.2): full screen, two pages. The stats page is pure black with one giant
 * number; the map page shows the route. Pages change by swiping the stats page sideways, by
 * swiping in from the left edge of the map page (the map keeps its own drags), or with the two
 * dots at the top. The bottom controls never move. After 10 seconds with no touch the screen dims
 * to near black; the first tap only wakes it.
 */
export function LiveRun({ live, wake, saveFailed, reduceMotion, onHide }: Props) {
  const reading = readLive(live);
  const paused = reading.status === 'paused';
  const [big, setBig] = useState<Metric>('distance');
  const [page, setPage] = useState<Page>(0);
  const [mapSeen, setMapSeen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [settings, setSettings] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useToastTimeout(toast, setToast);
  const dim = usePocketDim(!paused && !settings);
  // The voice coach's settings live with the run setup; a change counts from the next cue.
  const runSetup = useRunSetup();
  const voice = runSetup.state?.setup.voice ?? DEFAULT_VOICE;
  const setVoice = (v: VoiceSettings) => {
    runSetup.change({ voice: v });
    runEngine.setVoice(v);
  };

  // Intervals (SPEC 12.7): the current block, its colour, and a flash of that colour at each switch
  // (only a switch seen on this screen: opening the run again does not flash).
  const blocks = live.intervals ? readIntervals(live.intervals) : null;
  const effort = blocks?.block ? blockEffort(blocks.block.name) : null;
  const seenBlock = useRef(blocks?.index ?? -1);
  const [flash, setFlash] = useState<{ index: number; effort: 'push' | 'ease' } | null>(null);
  useEffect(() => {
    const index = blocks?.index ?? -1;
    if (index === seenBlock.current) return;
    seenBlock.current = index;
    if (effort) setFlash({ index, effort });
  }, [blocks?.index, effort]);

  // Said once, ever: this phone cannot keep its own screen on.
  useEffect(() => {
    if ((wake !== 'missing' && wake !== 'refused') || wasTold('wake')) return;
    rememberTold('wake');
    setToast({ id: Date.now(), text: 'This phone will not keep the screen on by itself. Set Auto-Lock to Never while you run.' });
  }, [wake]);
  useEffect(() => {
    if (saveFailed) setToast({ id: Date.now(), text: 'The run could not be saved. Hold End to try again.' });
  }, [saveFailed]);

  // The pages: one strip, two screens wide. It follows the finger (no transition) and settles on a
  // page with the app's page spring (CSS, on the compositor; tokens mirror ui/motion PAGE_SPRING).
  const strip = useRef<HTMLDivElement>(null);
  const width = () => strip.current?.parentElement?.clientWidth ?? window.innerWidth;
  const place = (px: number, settle: boolean) => {
    const el = strip.current;
    if (!el) return;
    el.dataset.settle = settle ? 'true' : 'false';
    el.style.transform = `translate3d(${px}px, 0, 0)`;
  };
  const goTo = useCallback((p: Page) => {
    setPage(p);
    if (p === 1) setMapSeen(true);
    place(-p * width(), true);
  }, []);
  // A resize keeps the page in place.
  useEffect(() => {
    const fit = () => place(-page * width(), false);
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [page]);

  const drag = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const down = (e: React.PointerEvent) => {
    if (locked || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
  };
  const moveTo = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) < 10) return;
    if (!d.moved && Math.abs(dy) > Math.abs(dx)) return void (drag.current = null);
    d.moved = true;
    if (!reduceMotion) place(Math.min(0, Math.max(-width(), -page * width() + dx)), false);
  };
  // A swipe that ends on the numbers must not also count as a tap on them.
  const swiped = useRef(false);
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.moved) return;
    swiped.current = true;
    window.setTimeout(() => (swiped.current = false), 0);
    goTo(pageAfterSwipe(page, e.clientX - d.x, width()));
  };
  const cancel = () => {
    if (drag.current?.moved) goTo(page);
    drag.current = null;
  };
  // The map page is drawn as soon as a swipe toward it starts.
  const swipe = {
    onPointerDown: down,
    onPointerMove: (e: React.PointerEvent) => {
      if (!mapSeen && drag.current && Math.abs(e.clientX - drag.current.x) >= 10) setMapSeen(true);
      moveTo(e);
    },
    onPointerUp: up,
    onPointerCancel: cancel,
  };

  // Room the bar and the controls take, for the map's own centring.
  const barRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const top = Math.round(barRef.current?.getBoundingClientRect().bottom ?? 0);
      const bottom = Math.round(window.innerHeight - (footRef.current?.getBoundingClientRect().top ?? window.innerHeight));
      setInset((i) => (i.top === top && i.bottom === bottom ? i : { top, bottom }));
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (barRef.current) ro?.observe(barRef.current);
    if (footRef.current) ro?.observe(footRef.current);
    return () => ro?.disconnect();
  }, [locked]);

  const readout = `${distanceWithUnit(reading.distanceM, live.unit)} · ${formatElapsed(reading.movingSec)}`;
  const cycle = () => {
    if (swiped.current || locked) return;
    tick();
    setBig(nextMetric);
  };
  return createPortal(
    <section
      className={styles.live}
      data-testid="live-run"
      data-status={reading.status}
      data-page={page}
      data-locked={locked || undefined}
      data-dim={dim.phase}
      data-fix={live.here?.t ?? ''}
      data-wake={wake}
      data-effort={effort ?? undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Run in progress"
      onPointerDownCapture={dim.touched}
    >
      <div className={styles.pages}>
        <div className={styles.strip} ref={strip}>
          <div className={styles.page} aria-hidden={page !== 0} style={{ paddingTop: inset.top, paddingBottom: inset.bottom }} {...swipe}>
            {effort && <div className={iv.tint} data-effort={effort} data-testid="interval-tint" aria-hidden="true" />}
            <button type="button" className={styles.cycle} disabled={locked || page !== 0 || !!effort} aria-label="Show the next number big" data-testid="live-cycle" onClick={cycle}>
              <LiveStats reading={reading} unit={live.unit} big={big} note={noteOf(live, reading.status)} goal={goalProgress(live.goal, reading, live.unit)} paused={paused} intervals={blocks} />
            </button>
          </div>
          <div className={styles.page} aria-hidden={page !== 1}>
            {mapSeen && <LiveMap live={live} readout={readout} reduceMotion={reduceMotion} inset={inset} locked={locked} />}
            {/* The map keeps its own drags: only a swipe that starts on this left edge turns the page. */}
            <div
              className={styles.edge}
              data-testid="live-edge"
              {...swipe}
              onPointerDown={(e) => {
                // The finger soon leaves this narrow strip: it keeps the swipe all the same.
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // No capture here: the swipe then ends where it leaves the strip.
                }
                down(e);
              }}
            />
          </div>
        </div>
      </div>

      <div className={styles.bar} ref={barRef}>
        <span className={styles.barSlot}>
          {!locked && (
            <IconButton label="Hide the run. It keeps going." onPress={onHide} testId="live-hide">
              <ChevronDown aria-hidden="true" />
            </IconButton>
          )}
        </span>
        <div className={styles.dots} role="tablist" aria-label="Run pages">
          {(['Numbers', 'Map'] as const).map((name, i) => (
            <button key={name} type="button" role="tab" aria-selected={page === i} aria-label={name} className={styles.dotHit} disabled={locked} data-testid={`live-dot-${i}`} onClick={() => goTo(i as Page)}>
              <span className={styles.pageDot} data-on={page === i || undefined} />
            </button>
          ))}
        </div>
        <span className={styles.barSlot}>
          {paused && !locked && (
            <IconButton label="Run settings" onPress={() => setSettings(true)} testId="live-settings">
              <TuneIcon aria-hidden="true" />
            </IconButton>
          )}
        </span>
      </div>

      <div className={styles.foot} ref={footRef}>
        <LiveControls
          paused={paused}
          locked={locked}
          onPause={runEngine.pause}
          onResume={runEngine.resume}
          onLock={() => {
            tick();
            setLocked(true);
          }}
          onUnlock={() => setLocked(false)}
          onEnd={() => void runEngine.end()}
        />
      </div>
      <Toast toast={toast} bottom={`${inset.bottom - 8}px`} />
      <RunSettingsSheet open={settings} autoPause={live.tracker.autoPause} onAutoPause={runEngine.setAutoPause} voice={voice} onVoice={setVoice} unit={live.unit} onClose={() => setSettings(false)} />
      {/* Pocket mode: near black. It takes the waking touch for itself, so nothing under it is pressed. */}
      <div className={styles.dim} data-testid="live-dim" data-phase={dim.phase} onPointerDown={dim.wake} aria-hidden="true" />
      {flash && !reduceMotion && <div key={flash.index} className={iv.flash} data-effort={flash.effort} data-testid="interval-flash" onAnimationEnd={() => setFlash(null)} aria-hidden="true" />}
    </section>,
    document.body,
  );
}
