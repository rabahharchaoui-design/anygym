// Report a problem and crash reports (SPEC 24): what leaves the phone, field by field. Nothing
// else is ever sent: no workout history, names, emails, gym names or session ids.

/** The phone, from the user agent and the screen. */
export type DeviceInfo = {
  /** 'iPhone', 'iPad', 'Android' or 'Other'. */
  model: string;
  /** 'iOS 18.2', 'Android 14' or 'unknown'. */
  os: string;
  /** CSS pixels, e.g. '393x852'. */
  viewport: string;
  dpr: number;
  /** Opened from the Home Screen. */
  standalone: boolean;
};

/** Settings → Help → Report a problem. */
export type FeedbackPayload = {
  requestId: string;
  message: string;
  /** package version + build short sha, e.g. '0.1.0+1eadd8a'. */
  appVersion: string;
  /** The screen the user was on before Settings, ids replaced (e.g. '/workout/:id'). */
  route: string;
  device: DeviceInfo;
  unit: 'lb' | 'kg' | null;
  gymType: string | null;
  /** The last (at most 20) app errors, cleaned. */
  errors: string[];
  /** Optional: the user's own screenshot, a JPEG (max 900 px wide) in base64 without a prefix. */
  screenshot?: string;
};

/** A crash: window.onerror, unhandledrejection or a React error boundary. */
export type CrashPayload = {
  requestId: string;
  /** Message plus first stack frame, cleaned: the same bug gives the same signature. */
  signature: string;
  message: string;
  stack: string;
  route: string;
  appVersion: string;
  device: DeviceInfo;
};

export type ReportKind = 'feedback' | 'crash';

/**
 * `retryAfterUntil` (PLAN 2.0c, additive, not indexed): the server asked to wait (Retry-After) until
 * then. No send starts before it, not even a forced one (back online, app reopened, Send).
 */
type QueueFields = { id: string; createdAt: number; attempts: number; nextAttemptAt: number; leaseUntil: number; retryAfterUntil?: number };
export type ReportQueueRow = (QueueFields & { kind: 'feedback'; payload: FeedbackPayload }) | (QueueFields & { kind: 'crash'; payload: CrashPayload });

/** A crash signature already reported on this local day (YYYY-MM-DD). */
export type CrashSignatureRow = { signature: string; day: string; reportId: string };

export type ReportPreferencesRow = { id: 'privacy'; sendCrashReports: boolean };
