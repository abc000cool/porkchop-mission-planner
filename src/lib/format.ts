// Formatting helpers. All dates are treated as UTC throughout the app.

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const MONTH_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  month: 'short',
  year: '2-digit',
});

/** 2026-11-01 (for date inputs and exports). */
export const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** 01 Nov 2026 */
export const fmtDate = (ms: number): string => DATE_FMT.format(new Date(ms));

/** Nov 26 (axis ticks) */
export const fmtMonth = (ms: number): string => MONTH_FMT.format(new Date(ms)).replace(' ', ' ʼ');

export const fmtNum = (n: number, digits = 2): string =>
  Number.isFinite(n) ? n.toFixed(digits) : '—';

export const fmtInt = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—';

/** Snap a ms timestamp to UTC midnight. */
export const snapToDay = (ms: number): number => Math.round(ms / 86_400_000) * 86_400_000;
