// Records the run coach's voice pack (PLAN 4.4, SPEC 12.4). Run by hand on the machine that has the
// Kokoro install, never by `npm run build`: the finished files are committed.
//   node scripts/make-voice-pack.mjs
// What it does: the clip list (src/lib/run/voice/clips.ts) is spoken by Kokoro, voice am_michael,
// through the Python of the install OUTSIDE this repo (~/kokoro, or KOKORO_HOME); ffmpeg then trims
// the silence off both ends, brings every clip to one loudness (EBU R128, measured on the clip
// looped, since one word is too short to measure alone), and writes small mono AAC files to
// public/voice/ with src/lib/run/voice/manifest.json (id, file, length in ms).
// LICENSE RULE: the speech engine and its text to phoneme step (GPL) never enter the app or this
// repo. Only the audio, the manifest and this script do.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shortHash } from './short-hash.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const KOKORO = process.env.KOKORO_HOME ?? join(homedir(), 'kokoro');
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const VOICE = 'am_michael';
const LANG = 'en-us';
/** One loudness for every clip. */
const TARGET_LUFS = -17;
/** No sample above this after the gain (0.89 is about -1 dB): a limiter holds the few peaks that would pass it. */
const PEAK_LIMIT = 0.89;
const SAMPLE_RATE = 24000;
const BITRATE = '32k';
/** Quieter than this at either end is silence and is cut. */
const TRIM_DB = -45;
const SPEED = { word: 1.12, phrase: 1.0 };

const OUT_DIR = join(ROOT, 'public', 'voice');
const MANIFEST = join(ROOT, 'src', 'lib', 'run', 'voice', 'manifest.json');
const REPORT = process.env.VOICE_REPORT ?? join(tmpdir(), 'w44-voice-report.json');
/** Optional: a folder that keeps the spoken WAVs between runs, so only new or changed clips are spoken again. */
const RAW_KEEP = process.env.VOICE_RAW_DIR;

function need(path, what) {
  if (!existsSync(path)) {
    console.error(`make-voice-pack: ${what} not found at ${path}.\nThe voice pack is recorded with the Kokoro install outside this repo (PLAN 4.0). Set KOKORO_HOME or install it there; nothing was changed.`);
    process.exit(1);
  }
}
need(KOKORO, 'the Kokoro install');
const python = join(KOKORO, 'bin', 'python');
need(python, "Kokoro's Python");
// v1.0 only: the v1.1 model file crashes on the speed input (PLAN 4.0).
const model = join(KOKORO, 'kokoro-v1.0.onnx');
const voices = join(KOKORO, 'voices-v1.0.bin');
need(model, 'the Kokoro v1.0 model');
need(voices, 'the Kokoro voices file');
need(FFMPEG, 'ffmpeg');

const { CLIPS, clipFile } = await import(join(ROOT, 'src/lib/run/voice/clips.ts'));
const work = mkdtempSync(join(tmpdir(), 'anygym-voice-'));
const ff = (args) => spawnSync(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8' });

/** Integrated loudness (LUFS) of a file, measured on ten plays in a row. */
function loudness(file) {
  const out = ff(['-stream_loop', '9', '-i', file, '-af', 'ebur128', '-f', 'null', '-']).stderr;
  const m = /Integrated loudness:\s+I:\s+(-?[\d.]+) LUFS/.exec(out);
  if (!m) throw new Error(`no loudness for ${file}`);
  return Number(m[1]);
}
/** Highest sample of a file, in dB. */
function peakDb(file) {
  const m = /max_volume: (-?[\d.]+) dB/.exec(ff(['-i', file, '-af', 'volumedetect', '-f', 'null', '-']).stderr);
  if (!m) throw new Error(`no peak for ${file}`);
  return Number(m[1]);
}
/** A clip brought to the target: gain, then the limiter; a second pass makes up what the limiter took. */
function level(from, to) {
  let gain = TARGET_LUFS - loudness(from);
  for (let pass = 0; pass < 3; pass++) {
    const r = ff(['-i', from, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=${PEAK_LIMIT}:attack=2:release=40:level=false`, '-ar', String(SAMPLE_RATE), '-ac', '1', to]);
    if (r.status !== 0) throw new Error(`level failed for ${from}: ${r.stderr.slice(-300)}`);
    const miss = TARGET_LUFS - loudness(to);
    if (Math.abs(miss) <= 0.3) break;
    gain += miss;
  }
  return gain;
}
const seconds = (file) => {
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(ff(['-i', file]).stderr);
  if (!m) throw new Error(`no length for ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
};

try {
  // 1. Speak every clip (the slow part).
  const job = join(work, 'job.json');
  const rawDir = RAW_KEEP ?? join(work, 'raw');
  mkdirSync(rawDir, { recursive: true });
  // A kept WAV is used again only when it was spoken from the very same words, voice and speed.
  const stamp = (c) => `${VOICE}|${LANG}|${SPEED[c.kind]}|${c.text}`;
  const fresh = (c) => existsSync(join(rawDir, `${c.id}.wav`)) && existsSync(join(rawDir, `${c.id}.txt`)) && readFileSync(join(rawDir, `${c.id}.txt`), 'utf8') === stamp(c);
  const todo = CLIPS.filter((c) => !fresh(c));
  if (todo.length) {
    writeFileSync(job, JSON.stringify({ model, voices, voice: VOICE, lang: LANG, clips: todo.map((c) => ({ id: c.id, text: c.text, speed: SPEED[c.kind] })) }));
    execFileSync(python, [join(ROOT, 'scripts', 'voice-synth.py'), job, rawDir], { stdio: 'inherit' });
    for (const c of todo) writeFileSync(join(rawDir, `${c.id}.txt`), stamp(c));
  }

  // 2. Trim, match loudness, encode.
  mkdirSync(OUT_DIR, { recursive: true });
  const cut = `silenceremove=start_periods=1:start_threshold=${TRIM_DB}dB:start_silence=0.005`;
  const report = [];
  const clips = {};
  for (const c of CLIPS) {
    const raw = join(rawDir, `${c.id}.wav`);
    const trimmed = join(work, `${c.id}.trim.wav`);
    let r = ff(['-i', raw, '-af', `${cut},areverse,${cut},areverse`, '-ar', String(SAMPLE_RATE), '-ac', '1', trimmed]);
    if (r.status !== 0) throw new Error(`trim failed for ${c.id}: ${r.stderr.slice(-300)}`);
    const before = loudness(trimmed);
    const levelled = join(work, `${c.id}.level.wav`);
    const gain = level(trimmed, levelled);
    const len = seconds(trimmed);
    const out = join(OUT_DIR, clipFile(c.id));
    const fade = `afade=t=in:d=0.004,afade=t=out:st=${Math.max(0, len - 0.012).toFixed(3)}:d=0.012`;
    r = ff(['-i', levelled, '-af', fade, '-c:a', 'aac_at', '-b:a', BITRATE, '-ar', String(SAMPLE_RATE), '-ac', '1', '-map_metadata', '-1', '-fflags', '+bitexact', '-movflags', '+faststart', out]);
    if (r.status !== 0) throw new Error(`encode failed for ${c.id}: ${r.stderr.slice(-300)}`);
    const ms = Math.round(len * 1000);
    // PLAN 4.6c (5): each clip's own version, so a new clip is fetched again on its own.
    clips[c.id] = { file: clipFile(c.id), ms, v: shortHash(readFileSync(out)) };
    report.push({ id: c.id, text: c.text, rawMs: Math.round(seconds(raw) * 1000), ms, lufsBefore: before, gainDb: Number(gain.toFixed(2)), lufs: loudness(out), peakDb: peakDb(out), bytes: statSync(out).size });
  }

  // 3. Files that are no longer in the list go; the manifest names the pack by its content.
  const keep = new Set(CLIPS.map((c) => clipFile(c.id)));
  for (const f of readdirSync(OUT_DIR)) if (f.endsWith('.m4a') && !keep.has(f)) rmSync(join(OUT_DIR, f));
  const hash = createHash('sha256');
  for (const c of CLIPS) hash.update(readFileSync(join(OUT_DIR, clipFile(c.id))));
  const bytes = report.reduce((sum, r) => sum + r.bytes, 0);
  writeFileSync(MANIFEST, `${JSON.stringify({ version: hash.digest('hex').slice(0, 10), voice: VOICE, lufs: TARGET_LUFS, bytes, clips }, null, 1)}\n`);
  writeFileSync(REPORT, JSON.stringify(report, null, 1));
  console.log(`voice pack: ${CLIPS.length} clips, ${bytes} bytes, manifest ${MANIFEST}, report ${REPORT}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
