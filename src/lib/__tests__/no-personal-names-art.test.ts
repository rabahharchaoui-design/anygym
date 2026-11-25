import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { personalNames } from './personalNames';

// Nov 26: a name slipped into the shipped art manifest. Every file in public/ (the app ships all of
// it, images included) and in docs/art/ (the art folders: READMEs, previews, storyboard) is scanned,
// text and binary alike: an image can carry a name in its metadata (PNG text chunks, compressed or
// not; EXIF or XMP in a JPEG), which the text scan skips.

const ROOT = join(__dirname, '../../..');
const ART_DIRS = ['public', join('docs', 'art')];

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** The text a PNG carries in tEXt, zTXt and iTXt chunks, inflated where compressed. */
export function pngText(b: Buffer): string {
  if (b.length < 8 || b.readUInt32BE(0) !== 0x89504e47) return '';
  const parts: string[] = [];
  for (let i = 8; i + 8 <= b.length; ) {
    const len = b.readUInt32BE(i);
    const type = b.toString('latin1', i + 4, i + 8);
    const data = b.subarray(i + 8, i + 8 + len);
    try {
      if (type === 'tEXt') parts.push(data.toString('latin1'));
      if (type === 'zTXt') { const k = data.indexOf(0); parts.push(data.toString('latin1', 0, k), inflateSync(data.subarray(k + 2)).toString('latin1')); }
      if (type === 'iTXt') {
        const k = data.indexOf(0);
        const compressed = data[k + 1] === 1;
        let j = k + 3;
        j = data.indexOf(0, j) + 1; // language tag
        j = data.indexOf(0, j) + 1; // translated keyword
        const body = data.subarray(j);
        parts.push(data.toString('latin1', 0, k), (compressed ? inflateSync(body) : body).toString('utf8'));
      }
    } catch {
      parts.push(`unreadable ${type} chunk`);
    }
    i += 12 + len;
  }
  return parts.join('\n');
}

/** Every name a file holds: its raw bytes read as text (text files, EXIF, XMP) plus a PNG's text chunks. */
export function namesInFile(b: Buffer): string[] {
  return [...personalNames(b.toString('latin1')), ...personalNames(pngText(b))];
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('names hidden in image metadata are found', () => {
  it('plain, zTXt compressed and iTXt compressed PNG text', () => {
    const plain = Buffer.concat([SIG, chunk('tEXt', Buffer.from('Author\0Rabah', 'latin1'))]);
    const z = Buffer.concat([SIG, chunk('zTXt', Buffer.concat([Buffer.from('Author\0\0', 'latin1'), deflateSync('made by OhRabah')]))]);
    const it3 = Buffer.concat([SIG, chunk('iTXt', Buffer.concat([Buffer.from('Author\0\x01\0en\0\0', 'latin1'), deflateSync('Harchaoui')]))]);
    expect(namesInFile(plain)).toContain('Rabah');
    expect(namesInFile(z)).toContain('OhRabah');
    expect(namesInFile(it3)).toContain('Harchaoui');
    expect(namesInFile(Buffer.concat([SIG, chunk('tEXt', Buffer.from('Software\0Pluto', 'latin1'))]))).toEqual([]);
  });
});

describe('no personal names in the art folders or anything public/ ships', () => {
  const files = ART_DIRS.flatMap((d) => walk(join(ROOT, d), []));
  const rel = files.map((f) => relative(ROOT, f).split(sep).join('/'));

  it('scans the badges, the stamps, the art manifest and the art docs', () => {
    expect(rel).toContain('public/art-manifest.json');
    expect(rel.some((f) => f.startsWith('public/badges/') && f.endsWith('.png'))).toBe(true);
    expect(rel.some((f) => f.startsWith('public/stamps/') && f.endsWith('.png'))).toBe(true);
    expect(rel.some((f) => f.startsWith('docs/art/'))).toBe(true);
  });

  it('no file, text or image metadata, holds OhRabah, Harchaoui or Rabah', () => {
    const hits: string[] = [];
    files.forEach((f, i) => {
      for (const name of namesInFile(readFileSync(f))) hits.push(`${rel[i]}: ${name}`);
    });
    expect(hits).toEqual([]);
  });
});
