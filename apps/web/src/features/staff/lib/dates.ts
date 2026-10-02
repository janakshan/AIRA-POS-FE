const pad = (n: number) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD, `days` from today. */
export function localDay(days = 0, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const thisMonth = () => localDay().slice(0, 7);

/** YYYY-MM `n` months from `month`. */
export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y ?? 1970, (m ?? 1) - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export const monthLabel = (month: string, locale: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
};

export const dayLabel = (date: string, locale: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

/** "7h 45m" */
export const hoursMinutes = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
