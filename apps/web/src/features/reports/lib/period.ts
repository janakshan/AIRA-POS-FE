import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useListParams } from '@/lib/use-list-params';

const pad = (n: number) => String(n).padStart(2, '0');
export const localDay = (days = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

type Range = () => [from: string, to: string];

export const PRESETS: Record<'today' | 'yesterday' | 'week' | 'month' | 'thisMonth', Range> = {
  today: () => [localDay(), localDay()],
  yesterday: () => [localDay(-1), localDay(-1)],
  week: () => [localDay(-6), localDay()],
  month: () => [localDay(-29), localDay()],
  thisMonth: () => [`${localDay().slice(0, 8)}01`, localDay()],
};
export type Preset = keyof typeof PRESETS;

export type PeriodError = 'fromAfterTo' | 'future';

/** A period the reports can answer: From ≤ To, and nothing after today (local dates). */
export function periodError(from: string, to: string): PeriodError | null {
  if (from > to) return 'fromAfterTo';
  if (to > localDay()) return 'future';
  return null;
}

/** REP-* period + location in the URL (`?from=&to=&location=`); default the last 7 days. */
export function useReportParams(extraKeys: string[] = []) {
  const list = useListParams({ filterKeys: ['from', 'to', 'location', ...extraKeys] });
  const { nameOf } = useMyLocations();
  const [defFrom, defTo] = PRESETS.week();
  const from = list.filters.from ?? defFrom;
  const to = list.filters.to ?? defTo;
  const locationId = list.filters.location ?? 'all';
  const preset = (Object.keys(PRESETS) as Preset[]).find((p) => {
    const [f, t] = PRESETS[p]();
    return f === from && t === to;
  });
  return {
    list,
    from,
    to,
    locationId,
    preset,
    /** Why the period can't be reported on (shown instead of the report), or null. */
    error: periodError(from, to),
    params: { from, to, locationId },
    locationLabel: locationId === 'all' ? null : nameOf(locationId),
    setPeriod: (f: string, t: string) => {
      const [df, dt] = PRESETS.week();
      list.setFilters({
        from: f === df && t === dt ? null : f,
        to: f === df && t === dt ? null : t,
      });
    },
    setLocation: (id: string) => list.setFilter('location', id === 'all' ? null : id),
  };
}

/** For file names: report-2026-09-01_2026-09-28. */
export const fileStem = (name: string, from: string, to: string) =>
  `${name}-${from}${from === to ? '' : `_${to}`}`;
