// Report a problem (SPEC 24): the user's words plus exactly what the sheet says is included.
import { newId } from '../../db/ids';
import { APP_VERSION } from './config';
import { deviceInfo, recentErrors, reportRoute } from './diagnostics';
import type { FeedbackPayload } from './types';

export const MESSAGE_MAX = 4000;

/** Only the unit and the gym type are read from the gym: never its name or anything else. */
export type GymFacts = { unit: 'lb' | 'kg' | null; gymType: string | null };

export function gymFacts(gym: { unit: 'lb' | 'kg'; type: string } | undefined | null): GymFacts {
  return gym ? { unit: gym.unit, gymType: gym.type } : { unit: null, gymType: null };
}

export function buildFeedback(message: string, facts: GymFacts, screenshot?: string): FeedbackPayload {
  const payload: FeedbackPayload = {
    requestId: newId(),
    message: message.trim().slice(0, MESSAGE_MAX),
    appVersion: APP_VERSION,
    route: reportRoute(),
    device: deviceInfo(),
    unit: facts.unit,
    gymType: facts.gymType,
    errors: recentErrors(),
  };
  if (screenshot) payload.screenshot = screenshot;
  return payload;
}
