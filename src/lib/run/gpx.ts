// A run as a GPX 1.1 file (PLAN 4.6, SPEC 12.12). Pure. One track segment per solid piece, so a
// GPS gap is a break and not a straight line. A move of the estimate (Run.shifts, PLAN 4.4f 5) is
// no break: the file splits where the app draws dashed (dashedGaps, PLAN R5 2). No elevation: the
// phone's altitude is not shown.
import type { Run } from '../../db/types';
import { dashedGaps, fromRunPoint, toSegments } from '../gps';
import { dayKey, timeKeySec } from '../dayKey';
import { runLabel } from './goal';

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const iso = (t: number): string => new Date(t).toISOString();

/**
 * The file name, in the phone's local date and start time to the second: two runs on one day
 * (PLAN 4.6a 7), even in one minute (PLAN 4.6b 2), get two files. "AnyGym-run-2026-06-01-070503.gpx".
 */
export function gpxFileName(run: Pick<Run, 'startedAt'>): string {
  const d = new Date(run.startedAt);
  return `AnyGym-run-${dayKey(d)}-${timeKeySec(d)}.gpx`;
}

const nameOf = (run: Run): string => {
  const label = runLabel(run.type);
  return run.goal ? `${label} ${run.goal}` : label;
};

/** The whole file. Points keep six decimal places (about a tenth of a meter). */
export function gpxDocument(run: Run): string {
  const name = xml(nameOf(run));
  const segs = toSegments(run.points.map(fromRunPoint), dashedGaps(run.gaps, run.shifts))
    .map((seg) => seg.points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.t)))
    .filter((pts) => pts.length > 0)
    .map((pts) => {
      const body = pts.map((p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><time>${iso(p.t)}</time></trkpt>`).join('\n');
      return `    <trkseg>\n${body}\n    </trkseg>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AnyGym" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${iso(run.startedAt)}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <type>running</type>
${segs}
  </trk>
</gpx>
`;
}
