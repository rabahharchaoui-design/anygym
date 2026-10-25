// What a report knows about the app (SPEC 24), masked before it is stored or sent (mask.ts).
import type { DeviceInfo } from './types';

import { maskRoute, maskText, MASK_MAX } from './mask';

export const RING_SIZE = 20;

/** Masks automatic text (lib/reporting/mask.ts): no names, emails, phones, numbers, ids or URLs. */
export const sanitizeText = (input: string, max = MASK_MAX): string => maskText(input, max);

/** A route with its ids replaced: '/workout/3f2…/done?x' → '/workout/:id/done'. */
export const sanitizeRoute = (hashOrPath: string): string => maskRoute(hashOrPath);

/** One line for any thrown value or console argument, without ever stringifying objects. */
export function describeValue(v: unknown): string {
  if (v instanceof Error) return `${v.name || 'Error'}: ${v.message}`;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) return String(v);
  if (typeof v === 'object' && v !== null && 'message' in v && typeof (v as { message: unknown }).message === 'string') return (v as { message: string }).message;
  return '[object]';
}

// ---- The last 20 app errors ---------------------------------------------------------------------

const ring: string[] = [];

export function pushError(text: string): void {
  const clean = sanitizeText(text);
  if (!clean) return;
  ring.push(clean);
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
}

export const recentErrors = (): string[] => ring.slice();

/** Tests only. */
export const clearErrors = (): void => void ring.splice(0);

let consoleWrapped = false;

/** Keeps a copy of every console.error (cleaned) in the ring. console.error itself behaves as before. */
export function installConsoleRing(target: Pick<Console, 'error'> = console): void {
  if (consoleWrapped) return;
  consoleWrapped = true;
  const original = target.error;
  target.error = function (...args: unknown[]) {
    try {
      pushError(args.map(describeValue).join(' '));
    } catch {
      // Never let the ring break logging.
    }
    return original.apply(this, args);
  };
}

// ---- The screen the user was on ---------------------------------------------------------------

let lastScreen = '/';

/** Remembers the last screen that is not Settings, so a report says where the problem was. */
export function noteRoute(hash: string): void {
  const r = sanitizeRoute(hash);
  if (!r.startsWith('/settings')) lastScreen = r;
}

export const reportRoute = (): string => lastScreen;

export function currentRoute(): string {
  try {
    return sanitizeRoute(window.location.hash || '/');
  } catch {
    return '/';
  }
}

// ---- The phone --------------------------------------------------------------------------------

export function parseDevice(ua: string, maxTouchPoints = 0): Pick<DeviceInfo, 'model' | 'os'> {
  const ios = /\b(?:iPhone|CPU) OS (\d+)[_.](\d+)/.exec(ua);
  if (/iPhone/.test(ua)) return { model: 'iPhone', os: ios ? `iOS ${ios[1]}.${ios[2]}` : 'iOS unknown' };
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return { model: 'iPad', os: ios ? `iPadOS ${ios[1]}.${ios[2]}` : 'iPadOS unknown' };
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) return { model: 'Android', os: `Android ${android[1]}` };
  return { model: 'Other', os: 'unknown' };
}

export function deviceInfo(): DeviceInfo {
  const { model, os } = parseDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  let standalone = false;
  try {
    standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    standalone = false;
  }
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  return { model, os, viewport: `${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}`, dpr, standalone };
}
