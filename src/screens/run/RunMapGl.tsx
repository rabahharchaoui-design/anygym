// The MapLibre map itself (SPEC 12.10). This file and everything it imports is one lazy chunk:
// it loads only when the Run tab opens (RunMap.tsx), never with the app.
import { useEffect, useRef } from 'react';
import { getGlobalDispatcher, Map as GlMap, Marker, setWorkerUrl } from 'maplibre-gl';
// The worker is a file of our own origin (no blob: worker), so the CSP keeps worker-src 'self'.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { HEALTHY, mapHealthStep, mapOffline, type MapHealth, type MapHealthEvent } from '../../lib/run/mapHealth';
import { HERE_ZOOM, MAP_PALETTE_TOKENS, NEUTRAL_VIEW, runMapStyle, type MapPalette } from '../../lib/run/mapStyle';
import type { RouteGeo } from '../../lib/run/routeGeo';
import { DUR } from '../../ui/motion';
import { addRouteLayers, drawRouteOn, startMarker } from './mapRoute';
import styles from './RunMap.module.css';

setWorkerUrl(workerUrl);

export type RunMapGlProps = {
  /** Where the phone is, or null while that is not known (no dot is drawn then). */
  here: { lat: number; lng: number } | null;
  /** Grows by one on every tap of the recentre button. */
  recentre: number;
  reduceMotion: boolean;
  /** Room taken by the title above and the controls below, in px: the dot is centred in what is left. */
  inset: { top: number; bottom: number };
  /** The map is drawn (or gave up): the placeholder can go. */
  onReady: () => void;
  /** Tiles, the tile list or WebGL failed (true), or the map is whole again (false). */
  onOffline: (offline: boolean) => void;
  /** The user dragged the map away from the dot (true) or it is centred on it again (false). */
  onMoved: (moved: boolean) => void;
  /** A run's line (PLAN 4.3): solid pieces, dashed joins and the start mark. */
  route?: RouteGeo | null;
  /** A finished run: the map shows the whole route and does not answer touches. */
  still?: boolean;
  /** The live run is locked (PLAN 4.4b 5): the map does not pan or zoom until it is unlocked. */
  locked?: boolean;
};

const SOURCE = 'openmaptiles';
/** Room between a fitted route and the map's edge, in px (the line's width and the start mark fit in it). */
const FIT_PAD = 28;

/** The map colours, read from the tokens (src/styles/tokens.css) so the map is always the app's palette. */
function readPalette(): MapPalette {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(Object.entries(MAP_PALETTE_TOKENS).map(([k, token]) => [k, css.getPropertyValue(token).trim()])) as MapPalette;
}

export default function RunMapGl({ here, recentre, reduceMotion, inset, onReady, onOffline, onMoved, route = null, still = false, locked = false }: RunMapGlProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<GlMap | null>(null);
  const dot = useRef<Marker | null>(null);
  const following = useRef(true);
  const placed = useRef(false);
  const cb = useRef({ onReady, onOffline, onMoved });
  cb.current = { onReady, onOffline, onMoved };
  const hereRef = useRef(here);
  hereRef.current = here;
  const routeRef = useRef(route);
  routeRef.current = route;
  const startMark = useRef<Marker | null>(null);
  // The part of the map a person can see: the dot is centred in it, never in the whole canvas.
  const padding = { top: inset.top, bottom: inset.bottom, left: 0, right: 0 };
  const paddingRef = useRef(padding);
  paddingRef.current = padding;

  useEffect(() => {
    if (!box.current) return;
    let gl: GlMap;
    let health: MapHealth = HEALTHY;
    const step = (e: MapHealthEvent) => {
      const next = mapHealthStep(health, e);
      if (next === health) return;
      const was = mapOffline(health);
      health = next;
      if (mapOffline(next) !== was) cb.current.onOffline(mapOffline(next));
    };
    try {
      gl = new GlMap({
        container: box.current,
        style: runMapStyle(readPalette()) as never,
        center: NEUTRAL_VIEW.center,
        zoom: NEUTRAL_VIEW.zoom,
        // Our own credit line is always on screen (RunMap.tsx), also when tiles never arrive.
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        rollEnabled: false,
        maxPitch: 0,
        keyboard: false,
        interactive: !still,
        fadeDuration: reduceMotion ? 0 : DUR.base,
      });
    } catch {
      // No WebGL on this phone: the plain dark background stays, with the offline chip.
      cb.current.onOffline(true);
      cb.current.onReady();
      return;
    }
    map.current = gl;
    gl.touchZoomRotate.disableRotation();
    // Any failed request of the map (tile list, a tile, glyphs) or a lost WebGL context.
    // PLAN 4.4b (15): one failed tile is not the map gone (mapHealth): only that holds the chip.
    const onError = (e: { error?: { message?: string }; tile?: unknown }) => {
      // What failed, for tests and problem reports; the screen only ever says "Map offline".
      if (box.current) box.current.dataset.mapError = String(e.error?.message ?? 'error').slice(0, 120);
      step({ type: 'error', tile: !!e.tile });
      cb.current.onReady();
    };
    gl.on('error', onError);
    // A worker that could not load (signal lost, or the app left mid load) reports to MapLibre's
    // dispatchers, which print to the console when nobody listens. Same answer: map offline.
    type Reports = { on: (type: 'error', fn: typeof onError) => unknown; off: (type: 'error', fn: typeof onError) => unknown };
    const dispatchers = [getGlobalDispatcher(), gl.style?.dispatcher].filter(Boolean) as unknown as Reports[];
    for (const d of dispatchers) d.on('error', onError);
    gl.on('load', () => cb.current.onReady());
    // The run's line belongs to the style: it is put back every time the style (re)loads.
    gl.on('style.load', () => {
      const palette = readPalette();
      addRouteLayers(gl, palette.accent, palette.bg);
      if (routeRef.current) drawRouteOn(gl, routeRef.current);
    });
    gl.on('sourcedata', (e: { sourceId?: string; tile?: unknown }) => {
      if (e.sourceId === SOURCE && e.tile) step({ type: 'tile-ok' });
    });
    gl.on('dragstart', () => {
      following.current = false;
      if (hereRef.current) cb.current.onMoved(true);
    });
    // Signal is back: ask for the tile list and the tiles again.
    const retry = () => {
      if (!health.latched) return;
      step({ type: 'retry' });
      gl.setStyle(runMapStyle(readPalette()) as never);
    };
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('online', retry);
      for (const d of dispatchers) d.off('error', onError);
      dot.current?.remove();
      dot.current = null;
      startMark.current?.remove();
      startMark.current = null;
      placed.current = false;
      map.current = null;
      gl.remove();
    };
    // The map is made once; reduced motion is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The dot follows the phone; the first position brings the map to street level around it.
  useEffect(() => {
    const gl = map.current;
    if (!gl) return;
    if (!here) {
      dot.current?.remove();
      dot.current = null;
      return;
    }
    const at: [number, number] = [here.lng, here.lat];
    if (!dot.current) {
      const el = document.createElement('div');
      el.className = styles.dot!;
      el.setAttribute('data-testid', 'run-dot');
      el.setAttribute('data-round', 'ok');
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'You are here');
      dot.current = new Marker({ element: el }).setLngLat(at).addTo(gl);
    } else dot.current.setLngLat(at);
    if (!placed.current) {
      placed.current = true;
      gl.jumpTo({ center: at, zoom: HERE_ZOOM, padding: paddingRef.current });
    } else if (following.current) gl.easeTo({ center: at, padding: paddingRef.current, duration: reduceMotion ? 0 : DUR.slow });
  }, [here, reduceMotion]);

  // The dot stays in the middle of the part of the map that shows.
  useEffect(() => {
    const gl = map.current;
    if (!gl) return;
    const h = hereRef.current;
    if (still) return;
    if (h && placed.current && following.current) gl.easeTo({ center: [h.lng, h.lat], padding: paddingRef.current, duration: 0 });
    else gl.setPadding(paddingRef.current);
  }, [inset.top, inset.bottom, still]);

  // The run's line, redrawn as it grows; a finished run is shown whole.
  useEffect(() => {
    const gl = map.current;
    if (!gl) return;
    if (route) drawRouteOn(gl, route);
    if (route?.start && !startMark.current) startMark.current = startMarker(gl, route.start);
    else if (route?.start) startMark.current?.setLngLat(route.start);
    else {
      startMark.current?.remove();
      startMark.current = null;
    }
    if (still && route?.bounds) {
      const [w, s, e, n] = route.bounds;
      // The whole route, with room around it; `inset` keeps it clear of what sits on the map's edges.
      gl.fitBounds([[w, s], [e, n]], { padding: { top: FIT_PAD + inset.top, bottom: FIT_PAD + inset.bottom, left: FIT_PAD, right: FIT_PAD }, maxZoom: HERE_ZOOM, duration: 0 });
    }
  }, [route, still, inset.top, inset.bottom]);

  useEffect(() => {
    const gl = map.current;
    const h = hereRef.current;
    if (!gl || !h || recentre === 0) return;
    following.current = true;
    cb.current.onMoved(false);
    gl.easeTo({ center: [h.lng, h.lat], zoom: Math.max(gl.getZoom(), HERE_ZOOM), padding: paddingRef.current, duration: reduceMotion ? 0 : DUR.slow });
  }, [recentre, reduceMotion]);

  // Locked: no drag, pinch, double tap or scroll moves the map.
  useEffect(() => {
    const gl = map.current;
    if (!gl || still) return;
    for (const h of [gl.dragPan, gl.touchZoomRotate, gl.doubleClickZoom, gl.scrollZoom, gl.boxZoom]) {
      if (locked) h.disable();
      else h.enable();
    }
    if (!locked) gl.touchZoomRotate.disableRotation();
  }, [locked, still]);

  return <div ref={box} className={styles.gl} data-testid="run-map-gl" />;
}
