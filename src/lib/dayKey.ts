const two = (n: number): string => String(n).padStart(2, '0');

/** A local calendar day as YYYY-MM-DD ("2026-11-06"), in the phone's own time zone. */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/** A local clock time as HHmm ("0705"), in the phone's own time zone (file names, PLAN 4.6a 7). */
export const timeKey = (d: Date): string => `${two(d.getHours())}${two(d.getMinutes())}`;
