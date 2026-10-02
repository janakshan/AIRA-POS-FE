import type { PortionDefinition } from '@rbp/types';

/** "150 g boneless · 6 per pack" */
export function portionSummary(
  p: PortionDefinition | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  if (!p) return '';
  return [p.description, p.perPack ? t('portion.perPackShort', { count: p.perPack }) : null]
    .filter(Boolean)
    .join(' · ');
}

/** Minutes → "3 h 10 min" / "25 min". */
export function formatDuration(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}
