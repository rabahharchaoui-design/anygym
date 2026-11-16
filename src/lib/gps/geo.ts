// Distances on the globe (SPEC 12.3: haversine). Pure.

/** Mean Earth radius in meters (IUGG). */
export const EARTH_RADIUS_M = 6_371_008.8;

type LatLng = { lat: number; lng: number };

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great circle distance between two positions, in meters. Never negative; 0 for the same position. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of the line through the points in order, in meters. 0 for fewer than two points. */
export function pathLengthM(points: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineM(points[i - 1]!, points[i]!);
  return total;
}
