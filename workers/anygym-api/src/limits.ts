// SPEC 24 abuse limits and field bounds, in one place.

export const PROD_ORIGIN = 'https://rabahharchaoui-design.github.io';
export const MAX_BODY_BYTES = 1_000_000;
export const RATE_PER_HOUR = 20;
export const PUSHES_PER_HOUR = 10;

export const MAX = {
  message: 4000,
  crashMessage: 500,
  stack: 4000,
  signature: 300,
  route: 200,
  errors: 20,
  errorText: 500,
  /** Base64 of a JPEG of about 300 KB, with headroom. */
  screenshotB64: 450_000,
} as const;
