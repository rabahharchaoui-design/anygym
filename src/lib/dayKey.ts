const two = (n: number): string => String(n).padStart(2, '0');

/** A local calendar day as YYYY-MM-DD ("2026-11-06"), in the phone's own time zone. */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/** A local clock time as HHmm ("0705"), in the phone's own time zone (file names, PLAN 4.6a 7). */
export const timeKey = (d: Date): string => `${two(d.getHours())}${two(d.getMinutes())}`;

/** A local clock time to the second as HHmmss ("070503"): names that must differ within a minute (PLAN 4.6b 2). */
export const timeKeySec = (d: Date): string => `${timeKey(d)}${two(d.getSeconds())}`;
