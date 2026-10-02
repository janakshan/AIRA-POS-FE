export const DATE_RANGES = ['all', 'today', 'week', 'month', 'custom'] as const;
export type DateRange = (typeof DATE_RANGES)[number];

/** ISO bounds for a preset, or a custom local from–to (yyyy-mm-dd, inclusive). */
export function rangeBounds(
  range: string | undefined,
  from?: string,
  to?: string,
): { from?: string; to?: string } {
  const startOf = (d: Date) => {
    d.setHours(0, 0, 0, 0);
    return d;
  };
  if (range === 'today') return { from: startOf(new Date()).toISOString() };
  if (range === 'week') return { from: new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString() };
  if (range === 'month')
    return { from: new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString() };
  if (range === 'custom') {
    const at = (v: string, end: boolean) => {
      const [y, m, d] = v.split('-').map(Number);
      return new Date(
        y ?? 1970,
        (m ?? 1) - 1,
        d ?? 1,
        end ? 23 : 0,
        end ? 59 : 0,
        end ? 59 : 0,
        end ? 999 : 0,
      ).toISOString();
    };
    return { ...(from ? { from: at(from, false) } : {}), ...(to ? { to: at(to, true) } : {}) };
  }
  return {};
}
