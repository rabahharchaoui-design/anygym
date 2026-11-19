// PLAN 4.6c (2, 5): the short content hash in an asset's URL (exercise photos, voice clips): 7 base36
// characters (36 bits) of the sha256 of the file's bytes. Same bytes, same hash, build after build.
import { createHash } from 'node:crypto';

export function shortHash(bytes) {
  return BigInt(`0x${createHash('sha256').update(bytes).digest('hex').slice(0, 9)}`).toString(36).padStart(7, '0').slice(-7);
}
