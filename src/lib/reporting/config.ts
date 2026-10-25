// Where reports go (SPEC 24): the anygym-api Cloudflare Worker. A build can point elsewhere with
// VITE_ANYGYM_API (tests in the normal suite instead route this host to a mock: tests/fixtures.ts).
import { version } from '../../../package.json';

export const DEFAULT_API_BASE = 'https://anygym-api.rabahharchaoui.workers.dev';

export const API_BASE: string = (import.meta.env?.VITE_ANYGYM_API as string | undefined) || DEFAULT_API_BASE;

declare const __APP_SHA__: string | undefined;

/** The git short sha baked in at build time; 'dev' when the build had none. */
export const APP_SHA: string = typeof __APP_SHA__ === 'string' && /^[0-9a-f]{4,12}$/.test(__APP_SHA__) ? __APP_SHA__ : 'dev';

/** e.g. '0.1.0+1eadd8a'. */
export const APP_VERSION = `${version}+${APP_SHA}`;
