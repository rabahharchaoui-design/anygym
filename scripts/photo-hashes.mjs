// PLAN 4.6c (2): one short hash per exercise photo file (public/ex/<dir>/<frame>), made at build
// time (vite.config.ts) and shipped as one string (src/lib/photoVersion.ts reads it). The hash is
// of the file's bytes only, so a photo keeps its URL until its own bytes change.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 7 base36 characters (36 bits) of the sha256 of the bytes. */
export function shortHash(bytes) {
  return BigInt(`0x${createHash('sha256').update(bytes).digest('hex').slice(0, 9)}`).toString(36).padStart(7, '0').slice(-7);
}

/** { dir: [hash or null per frame] } for every exercise folder under root; {} when there is none. */
export function photoHashes(root, frames) {
  if (!existsSync(root)) return {};
  const out = {};
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    out[dir.name] = frames.map((f) => {
      const file = join(root, dir.name, f);
      return existsSync(file) ? shortHash(readFileSync(file)) : null;
    });
  }
  return out;
}
