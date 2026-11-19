// Whether the run map says "Map offline" (SPEC 12.10, PLAN 4.4b 15). Pure. A style or WebGL failure
// (the tile list, the worker, the map itself) holds until the signal is back and the style is asked
// for again; one failed tile only says so until a tile loads again.

export type MapHealth = { latched: boolean; tileFailed: boolean };

export type MapHealthEvent =
  /** A failure; `tile`: one tile of the map's source, else the style, tile list, worker or WebGL. */
  | { type: 'error'; tile: boolean }
  /** A tile of the map's source arrived. */
  | { type: 'tile-ok' }
  /** The signal is back and the style is asked for again. */
  | { type: 'retry' };

export const HEALTHY: MapHealth = { latched: false, tileFailed: false };

export function mapHealthStep(h: MapHealth, e: MapHealthEvent): MapHealth {
  switch (e.type) {
    case 'error':
      return e.tile ? { ...h, tileFailed: true } : { ...h, latched: true };
    case 'tile-ok':
      return h.tileFailed ? { ...h, tileFailed: false } : h;
    case 'retry':
      return HEALTHY;
  }
}

export const mapOffline = (h: MapHealth): boolean => h.latched || h.tileFailed;
