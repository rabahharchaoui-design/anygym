// The GPX export is parsed back with a small strict reader (no DOM in the Vitest node run), so a
// broken tag, an unquoted attribute or a bad entity fails here and not in Strava (PLAN 4.6, SPEC 12.12).
import { describe, expect, it } from 'vitest';
import type { Run, RunPoint } from '../../../db/types';
import { at } from '../../gps/__tests__/fixtures';
import { toRunPoint } from '../../gps';
import { gpxDocument } from '../gpx';

type Node = { name: string; attrs: Record<string, string>; kids: Node[]; text: string };

function parseXml(src: string): Node {
  const decl = /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*/.exec(src);
  if (!decl) throw new Error('no xml declaration');
  const root: Node = { name: '#root', attrs: {}, kids: [], text: '' };
  const stack = [root];
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<&]*")*)\s*(\/?)>|([^<]+)/gy;
  re.lastIndex = decl[0].length;
  let m: RegExpExecArray | null;
  while (re.lastIndex < src.length) {
    m = re.exec(src);
    if (!m) throw new Error(`bad markup at ${re.lastIndex}: ${src.slice(re.lastIndex, re.lastIndex + 30)}`);
    if (m[5] !== undefined) {
      const bad = m[5].replace(/&(amp|lt|gt|quot|apos);/g, '').includes('&');
      if (bad) throw new Error('bad entity');
      stack[stack.length - 1]!.text += m[5].trim();
      continue;
    }
    if (m[1]) {
      const top = stack.pop()!;
      if (top.name !== m[2]) throw new Error(`closing ${m[2]} for ${top.name}`);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3]!.matchAll(/([\w:.-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!;
    const node: Node = { name: m[2]!, attrs, kids: [], text: '' };
    stack[stack.length - 1]!.kids.push(node);
    if (!m[4]) stack.push(node);
  }
  if (stack.length !== 1) throw new Error('unclosed tag');
  if (root.kids.length !== 1) throw new Error('one root only');
  return root.kids[0]!;
}

const pts = (from: number, to: number, t0: number): RunPoint[] => {
  const out: RunPoint[] = [];
  for (let m = from; m <= to; m += 50) {
    const p = at(m, 0, t0 + (m - from) / 3);
    out.push(toRunPoint({ lat: p.lat!, lng: p.lng!, t: p.t!, accuracy: 5 }));
  }
  return out;
};

const find = (n: Node, name: string): Node[] => [...(n.name === name ? [n] : []), ...n.kids.flatMap((k) => find(k, name))];

describe('GPX export parses (PLAN 4.6)', () => {
  const a = pts(0, 100, 0);
  const b = pts(100, 300, 100);
  const run: Run = { id: 'g', startedAt: a[0]![2], endedAt: b.at(-1)![2], type: 'distance', goal: '5 km <fast> & "loud"', movingSec: 200, elapsedSec: 200, distanceM: 300, points: [...a, ...b], gaps: [[a.at(-1)![2], b[0]![2]]], splits: [] };

  it('is well formed GPX 1.1 with every point valid and in order', () => {
    const root = parseXml(gpxDocument(run));
    expect(root.name).toBe('gpx');
    expect(root.attrs.version).toBe('1.1');
    expect(root.attrs.xmlns).toBe('http://www.topografix.com/GPX/1/1');
    expect(root.attrs.creator).toBe('AnyGym');
    const trk = find(root, 'trk')[0]!;
    expect(find(trk, 'type')[0]!.text).toBe('running');
    const segs = find(trk, 'trkseg');
    expect(segs).toHaveLength(2);
    const all = segs.flatMap((s) => s.kids);
    expect(all).toHaveLength(run.points.length);
    let last = -Infinity;
    for (const p of all) {
      expect(p.name).toBe('trkpt');
      const lat = Number(p.attrs.lat);
      const lon = Number(p.attrs.lon);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      const time = find(p, 'time')[0]!.text;
      expect(time).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      const ms = Date.parse(time);
      expect(ms).toBeGreaterThan(last);
      last = ms;
    }
  });

  it('keeps awkward words inside the markup, escaped', () => {
    const name = find(parseXml(gpxDocument(run)), 'name')[0]!.text;
    expect(name).toBe('Distance 5 km &lt;fast&gt; &amp; &quot;loud&quot;');
  });

  it('a run with no points is still a valid file, with no track points', () => {
    const root = parseXml(gpxDocument({ ...run, points: [], gaps: [] }));
    expect(find(root, 'trkpt')).toHaveLength(0);
  });
});
