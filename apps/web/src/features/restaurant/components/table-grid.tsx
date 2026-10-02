import type { RestaurantTable } from '@rbp/types';
import { StatusBadge, type StatusTone } from '@rbp/ui';
import { cn, formatElapsed, formatMoney } from '@rbp/utils';
import { SendIcon, UsersIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';

const TONE: Record<RestaurantTable['status'], StatusTone> = {
  FREE: 'success',
  OCCUPIED: 'progress',
  BILLING: 'warning',
};

const SURFACE: Record<RestaurantTable['status'], string> = {
  FREE: 'border-status-success/40 bg-status-success/5',
  OCCUPIED: 'border-status-progress/50 bg-status-progress/8',
  BILLING: 'border-status-warning/60 bg-status-warning/10',
};

export interface TableGridProps {
  tables: RestaurantTable[];
  onSelect: (table: RestaurantTable) => void;
  /** The table this terminal is on (highlighted). */
  currentTableId?: string | null;
  /** Tables that can't be picked right now (e.g. occupied while transferring). */
  isDisabled?: (table: RestaurantTable) => boolean;
}

/**
 * REST-001 floor grid, grouped by area. State (free / occupied / bill printed) is shown by
 * badge + text + colour, never colour alone; each tile is one big touch target.
 */
export function TableGrid({ tables, onSelect, currentTableId, isDisabled }: TableGridProps) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const areas = [...new Set(tables.map((tb) => tb.area))];

  return (
    <div className="space-y-5">
      {areas.map((area) => (
        <section key={area} aria-labelledby={`area-${area}`} className="space-y-2">
          <h3 id={`area-${area}`} className="text-sm font-semibold text-muted-foreground">
            {area} ·{' '}
            {t('tables.freeCount', {
              count: tables.filter((tb) => tb.area === area && tb.status === 'FREE').length,
            })}
          </h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
            {tables
              .filter((tb) => tb.area === area)
              .map((tb) => {
                const current = tb.id === currentTableId;
                return (
                  <li key={tb.id}>
                    <button
                      type="button"
                      data-touch="pos"
                      disabled={isDisabled?.(tb)}
                      onClick={() => onSelect(tb)}
                      aria-current={current || undefined}
                      aria-label={`${t('tables.table', { name: tb.name })} · ${t(`tables.${tb.status}`)}${
                        tb.order ? ` · ${formatMoney(tb.order.total, locale)}` : ''
                      }`}
                      className={cn(
                        'flex h-full min-h-28 w-full flex-col gap-1.5 rounded-xl border-2 p-3 text-left transition-colors',
                        'hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        'disabled:cursor-not-allowed disabled:opacity-45',
                        SURFACE[tb.status],
                        current && 'border-primary ring-2 ring-primary/40',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xl font-bold">{tb.name}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <UsersIcon className="size-3.5" aria-hidden /> {tb.seats}
                        </span>
                      </span>
                      <StatusBadge tone={TONE[tb.status]} size="sm">
                        {t(`tables.${tb.status}`)}
                      </StatusBadge>
                      {tb.order && (
                        <span className="mt-auto space-y-0.5 text-xs">
                          <span className="block font-semibold tabular">
                            {formatMoney(tb.order.total, locale)}
                          </span>
                          <span className="block text-muted-foreground">
                            {t('tables.since', { ago: formatElapsed(tb.order.openedAt) })} ·{' '}
                            {tb.order.createdBy}
                          </span>
                          {tb.order.unsent > 0 && (
                            <span className="flex items-center gap-1 font-medium text-status-warning-fg">
                              <SendIcon className="size-3" aria-hidden />
                              {t('tables.unsent', { count: tb.order.unsent })}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
