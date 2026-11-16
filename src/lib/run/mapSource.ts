// Where the run map's data comes from (SPEC 12.10). Tiny on purpose: the start screen needs the
// credit line before the map chunk has loaded, so this is not in mapStyle.ts.

/** The only host the map talks to: tile list, tiles and label glyphs. Free, no key. */
export const TILE_ORIGIN = 'https://tiles.openfreemap.org';

/** The credit MapLibre would add by itself from the tile list; kept on screen by the app so it shows offline too. */
export const MAP_ATTRIBUTION = '© OpenFreeMap · OpenMapTiles · OpenStreetMap';

/** True for a request the map makes to its tile host (tiles, tile list, glyphs). */
export const isTileHostUrl = (url: string, origin: string = TILE_ORIGIN): boolean => {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
};
