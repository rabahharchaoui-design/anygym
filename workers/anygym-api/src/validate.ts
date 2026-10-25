// Request validation. Only allowlisted fields are kept; anything else in the body is dropped.
import { MAX } from './limits';

export type Device = { model: string; os: string; viewport: string; dpr: number; standalone: boolean };

export type Feedback = {
  requestId: string;
  message: string;
  appVersion: string;
  route: string;
  device: Device;
  unit: 'lb' | 'kg' | null;
  gymType: string | null;
  errors: string[];
  screenshot: string | null;
};

export type Crash = {
  requestId: string;
  signature: string;
  message: string;
  stack: string;
  route: string;
  appVersion: string;
  device: Device;
};

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number, min = 0): v is string => typeof v === 'string' && v.length >= min && v.length <= max;

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const VERSION = /^[\w.+-]{1,40}$/;
const VIEWPORT = /^\d{2,5}x\d{2,5}$/;
const GYM_TYPE = /^[a-z_-]{1,30}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function device(v: unknown): Device | null {
  if (!isObj(v)) return null;
  const { model, os, viewport, dpr, standalone } = v;
  if (!str(model, 40, 1) || !str(os, 40, 1) || !str(viewport, 11) || !VIEWPORT.test(viewport)) return null;
  if (typeof dpr !== 'number' || !Number.isFinite(dpr) || dpr <= 0 || dpr > 8) return null;
  if (typeof standalone !== 'boolean') return null;
  return { model, os, viewport, dpr, standalone };
}

function common(b: Record<string, unknown>): Checked<{ requestId: string; route: string; appVersion: string; device: Device }> {
  if (!str(b.requestId, 64) || !REQUEST_ID.test(b.requestId)) return { ok: false, error: 'requestId' };
  if (!str(b.route, MAX.route, 1) || !b.route.startsWith('/')) return { ok: false, error: 'route' };
  if (!str(b.appVersion, 40) || !VERSION.test(b.appVersion)) return { ok: false, error: 'appVersion' };
  const d = device(b.device);
  if (!d) return { ok: false, error: 'device' };
  return { ok: true, value: { requestId: b.requestId, route: b.route, appVersion: b.appVersion, device: d } };
}

export function checkFeedback(body: unknown): Checked<Feedback> {
  if (!isObj(body)) return { ok: false, error: 'body' };
  const c = common(body);
  if (!c.ok) return c;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 1 || message.length > MAX.message) return { ok: false, error: 'message' };
  const unit = body.unit;
  if (unit !== 'lb' && unit !== 'kg' && unit !== null) return { ok: false, error: 'unit' };
  const gymType = body.gymType;
  if (gymType !== null && !(str(gymType, 30) && GYM_TYPE.test(gymType))) return { ok: false, error: 'gymType' };
  const errors = body.errors;
  if (!Array.isArray(errors) || errors.length > MAX.errors || !errors.every((e) => str(e, MAX.errorText))) return { ok: false, error: 'errors' };
  const shot = body.screenshot ?? null;
  if (shot !== null && !(str(shot, MAX.screenshotB64, 4) && BASE64.test(shot))) return { ok: false, error: 'screenshot' };
  return { ok: true, value: { ...c.value, message, unit, gymType, errors: errors as string[], screenshot: shot } };
}

export function checkCrash(body: unknown): Checked<Crash> {
  if (!isObj(body)) return { ok: false, error: 'body' };
  const c = common(body);
  if (!c.ok) return c;
  if (!str(body.signature, MAX.signature, 1)) return { ok: false, error: 'signature' };
  if (!str(body.message, MAX.crashMessage, 1)) return { ok: false, error: 'message' };
  if (!str(body.stack, MAX.stack)) return { ok: false, error: 'stack' };
  return { ok: true, value: { ...c.value, signature: body.signature, message: body.message, stack: body.stack } };
}

/** The device column: one readable line. */
export const deviceLine = (d: Device): string => `${d.model} · ${d.os} · ${d.viewport} @${d.dpr}x${d.standalone ? ' · home screen' : ''}`;
