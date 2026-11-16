// The MapLibre map itself (SPEC 12.10). This file and everything it imports is one lazy chunk:
// it loads only when the Run tab opens (RunMap.tsx), never with the app.
import { useEffect, useRef } from 'react';
import { Map as GlMap, Marker, setWorkerUrl } from 'maplibre-gl';
// The worker is a file of our own origin (no blob: worker), so the CSP keeps worker-src 'self'.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { HERE_ZOOM, MAP_PALETTE_TOKENS, NEUTRAL_VIEW, runMapStyle, type MapPalette } from '../../lib/run/mapStyle';
import { DUR } from '../../ui/motion';
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
};

const SOURCE = 'openmaptiles';

/** The map colours, read from the tokens (src/styles/tokens.css) so the map is always the app's palette. */
function readPalette(): MapPalette {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(Object.entries(MAP_PALETTE_TOKENS).map(([k, token]) => [k, css.getPropertyValue(token).trim()])) as MapPalette;
}

export default function RunMapGl({ here, recentre, reduceMotion, inset, onReady, onOffline, onMoved }: RunMapGlProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<GlMap | null>(null);
  const dot = useRef<Marker | null>(null);
  const following = useRef(true);
  const placed = useRef(false);
  const cb = useRef({ onReady, onOffline, onMoved });
  cb.current = { onReady, onOffline, onMoved };
  const hereRef = useRef(here);
  hereRef.current = here;

  useEffect(() => {
    if (!box.current) return;
    let gl: GlMap;
    let failed = false;
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
    gl.on('error', () => {
      failed = true;
      cb.current.onOffline(true);
      cb.current.onReady();
    });
    gl.on('load', () => cb.current.onReady());
    gl.on('idle', () => {
      if (!failed && gl.isSourceLoaded(SOURCE)) cb.current.onOffline(false);
    });
    gl.on('dragstart', () => {
      following.current = false;
      if (hereRef.current) cb.current.onMoved(true);
    });
    // Signal is back: ask for the tile list and the tiles again.
    const retry = () => {
      if (!failed) return;
      failed = false;
      gl.setStyle(runMapStyle(readPalette()) as never);
    };
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('online', retry);
      dot.current?.remove();
      dot.current = null;
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
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'You are here');
      dot.current = new Marker({ element: el }).setLngLat(at).addTo(gl);
    } else dot.current.setLngLat(at);
    if (!placed.current) {
      placed.current = true;
      gl.jumpTo({ center: at, zoom: HERE_ZOOM });
    } else if (following.current) gl.easeTo({ center: at, duration: reduceMotion ? 0 : DUR.slow });
  }, [here, reduceMotion]);

  // The dot stays in the middle of the part of the map that shows.
  useEffect(() => {
    const gl = map.current;
    if (!gl) return;
    const h = hereRef.current;
    const padding = { top: inset.top, bottom: inset.bottom, left: 0, right: 0 };
    if (h && placed.current && following.current) gl.easeTo({ center: [h.lng, h.lat], padding, duration: 0 });
    else gl.setPadding(padding);
  }, [inset.top, inset.bottom]);

  useEffect(() => {
    const gl = map.current;
    const h = hereRef.current;
    if (!gl || !h || recentre === 0) return;
    following.current = true;
    cb.current.onMoved(false);
    gl.easeTo({ center: [h.lng, h.lat], zoom: Math.max(gl.getZoom(), HERE_ZOOM), duration: reduceMotion ? 0 : DUR.slow });
  }, [recentre, reduceMotion]);

  return <div ref={box} className={styles.gl} data-testid="run-map-gl" />;
}
