// The voice coach's on or off (SPEC 12.4) as You shows it (PLAN M14). It lives in the run setup row
// (db/runSetup.ts); this reads and changes only its `voice` part, so You never loads the run logic
// (the Run tab is its own download). The Run tab reads the whole row and checks every part again.
import { durableRow } from '../lib/durable';
import { sanitizeVoice, type VoiceSettings } from '../lib/run/voice/settings';
import { RUN_SETUP_KEY } from './runSetupKey';
import { db as defaultDb, type AnyGymDB } from './schema';

/** The saved row as an object (empty when nothing or nonsense is saved). */
async function readRow(db: AnyGymDB): Promise<Record<string, unknown>> {
  const row = await db.kv.get(RUN_SETUP_KEY);
  try {
    const parsed: unknown = row?.value ? JSON.parse(row.value) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The voice coach settings as the Run tab would read them (the default when none are saved). */
export async function readRunVoice(db: AnyGymDB = defaultDb): Promise<VoiceSettings> {
  return sanitizeVoice((await readRow(db)).voice);
}

/** Saves the voice coach settings, leaving the rest of the run setup as it is. */
export async function saveRunVoice(voice: VoiceSettings, db: AnyGymDB = defaultDb): Promise<void> {
  const row = await readRow(db);
  await db.kv.put(durableRow(RUN_SETUP_KEY, JSON.stringify({ ...row, voice: sanitizeVoice(voice) })));
}
