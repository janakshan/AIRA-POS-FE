/** Timestamps are stored/transported as ISO-8601 UTC and only localised for display. */

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function formatDateTime(
  iso: string,
  opts: { locale?: string; timeZone?: string } = {},
): string {
  return new Intl.DateTimeFormat(opts.locale ?? 'en-LK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: opts.timeZone ?? 'Asia/Colombo',
  }).format(new Date(iso));
}

/** Date only, e.g. "27 Sept 2026". */
export function formatDate(iso: string, opts: { locale?: string; timeZone?: string } = {}): string {
  return new Intl.DateTimeFormat(opts.locale ?? 'en-LK', {
    dateStyle: 'medium',
    timeZone: opts.timeZone ?? 'Asia/Colombo',
  }).format(new Date(iso));
}

/** "5m", "1h 12m" — used for KOT age and similar. */
export function formatElapsed(fromIso: string, toIso: string = nowIso()): string {
  const totalMinutes = Math.max(
    0,
    Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
