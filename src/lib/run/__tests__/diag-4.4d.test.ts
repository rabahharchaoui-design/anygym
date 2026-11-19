// PLAN 4.4d (2): the run diagnostics log, its export, and the loader that turns an export (or a
// GPX) in tests/fixtures/gps/ into a replay.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startTracker } from '../../gps';
import { DIAG_FATES, MAX_DIAG_ENTRIES, diagDocument, diagEntry, diagFileName, diagNote, fixFate, parseDiag, type DiagEntry } from '../diag';
import { loadRecorded, parseGpx, traceFromFile } from '../../../../tests/fixtures/gps/load';
import { replay } from '../../../../tests/fixtures/gps/replay';
import { makeTrace, type Trace } from '../../../../tests/fixtures/gps/traces';

/** A trace written down as the engine would log it. */
function asExport(trace: Trace): string {
  const entries: DiagEntry[] = trace.fixes.map((f) => diagEntry(trace.t0, f.arrival, { lat: f.lat, lng: f.lng, accuracy: f.accuracy, speed: f.speed, stamp: f.stamp }, 'kept', { still: false }));
  return diagDocument('run-x', trace.t0, [diagNote(trace.t0, trace.t0, 'watch:restarted'), ...entries]);
}

describe('4.4d diagnostics log', () => {
  it('an entry is seven numbers plus the still flag, compact and rounded', () => {
    const e = diagEntry(1000, 3500, { lat: 40.123456789, lng: -73.987654321, accuracy: 12.345, speed: 2.3456, stamp: 3000 }, 'held:still', { still: true });
    expect(e).toEqual([2500, -500, 40.1234568, -73.9876543, 12.3, 2.35, DIAG_FATES.indexOf('held:still'), 1]);
    expect(diagEntry(0, 10, { lat: 1, lng: 2, accuracy: null, speed: null, stamp: null }, 'rejected:accuracy', null)).toEqual([10, 0, 1, 2, null, null, DIAG_FATES.indexOf('rejected:accuracy'), 0]);
  });

  it('size: a 2 hour run at one fix a second is under 500 KB as JSON', () => {
    const entries = Array.from({ length: 7200 }, (_, i) => diagEntry(0, i * 1000, { lat: 40.7812345 + i * 1e-5, lng: -73.9665432, accuracy: 16.4, speed: 2.81, stamp: i * 1000 - 312 }, 'kept', { still: false }));
    const bytes = diagDocument('r', 0, entries).length;
    expect(bytes).toBeLessThan(500_000);
  });

  it('the export is bounded at MAX_DIAG_ENTRIES and says so', () => {
    const e = diagNote(0, 0, 'watch:restarted');
    const doc = JSON.parse(diagDocument('r', 0, Array.from({ length: MAX_DIAG_ENTRIES + 3 }, () => e)));
    expect(doc.entries).toHaveLength(MAX_DIAG_ENTRIES);
    expect(doc.truncated).toBe(true);
  });

  it('fixFate is the judgement the run makes', () => {
    const t = startTracker({ splitM: 1000 });
    expect(fixFate(t, { lat: 40, lng: -74, t: 1, accuracy: 5 })).toBe('kept');
    expect(fixFate(t, { lat: 40, lng: -74, t: 1, accuracy: null })).toBe('rejected:accuracy');
    expect(fixFate(t, { lat: 200, lng: -74, t: 1, accuracy: 5 })).toBe('rejected:bad-position');
  });

  it('the file name carries the start to the second', () => {
    expect(diagFileName(new Date(2026, 10, 19, 18, 5, 9).getTime())).toBe('AnyGym-run-diagnostics-2026-11-19-180509.json');
  });

  it('an export reads back to the same fixes and replays exactly like the trace it came from', () => {
    const trace = makeTrace({ speed: 'jog', cadence: 1, noise: 15, scenario: 'tunnel', seed: 1 });
    const back = traceFromFile('x.json', asExport(trace))!;
    expect(back.fixes).toHaveLength(trace.fixes.length);
    const a = replay(trace);
    const b = replay(back);
    expect(b.endM).toBeCloseTo(a.endM, 0);
    expect(b.ticks.length).toBe(a.ticks.length);
  });

  it('anything else is no export', () => {
    expect(parseDiag('{"format":"other"}')).toBeNull();
    expect(parseDiag('not json')).toBeNull();
    expect(traceFromFile('a.json', '{}')).toBeNull();
  });

  it('a GPX reads as its track points with their times', () => {
    const gpx = '<gpx><trk><trkseg><trkpt lat="40.1" lon="-73.9"><time>2026-11-19T18:00:00Z</time></trkpt><trkpt lat="40.1001" lon="-73.9"><time>2026-11-19T18:00:01Z</time></trkpt></trkseg></trk></gpx>';
    const fixes = parseGpx(gpx);
    expect(fixes.map((f) => [f.lat, f.lng, f.stamp - fixes[0]!.stamp])).toEqual([[40.1, -73.9, 0], [40.1001, -73.9, 1000]]);
  });

  it('a file dropped into the fixture folder becomes a replay', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gps-'));
    writeFileSync(join(dir, 'a-run.json'), asExport(makeTrace({ speed: 'walk', cadence: 5, noise: 5, scenario: 'surge', seed: 2 })));
    writeFileSync(join(dir, 'b-run.gpx'), '<gpx><trkpt lat="40" lon="-74"/><trkpt lat="40.0001" lon="-74"/></gpx>');
    writeFileSync(join(dir, 'notes.json'), '{"hello":1}');
    expect(loadRecorded(dir).map((t) => t.name)).toEqual(['a-run.json', 'b-run.gpx']);
  });
});

// Every real export or GPX in tests/fixtures/gps/ (G's runs, once he sends them). No truth is known,
// so only the rules that need none: the numbers on the screen never go down, never turn into NaN.
describe('4.4d recorded runs replay', () => {
  it('the fixture folder loads (empty until a real export is dropped in)', () => {
    expect(Array.isArray(loadRecorded())).toBe(true);
  });
  for (const trace of loadRecorded()) {
    it(`${trace.name}: distance and time on the screen only ever go up`, () => {
      const r = replay(trace);
      for (let i = 1; i < r.ticks.length; i++) {
        expect(r.ticks[i]!.distanceM).toBeGreaterThanOrEqual(r.ticks[i - 1]!.distanceM);
        expect(r.ticks[i]!.movingSec).toBeGreaterThanOrEqual(r.ticks[i - 1]!.movingSec - 1e-9);
      }
      expect(Number.isFinite(r.endM)).toBe(true);
    });
  }
});
