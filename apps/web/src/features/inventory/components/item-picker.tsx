import type { StockLevel } from '@rbp/types';
import { EmptyState, SearchInput, Skeleton } from '@rbp/ui';
import { cn } from '@rbp/utils';
import { SearchXIcon } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '../api/queries';
import { StockStatusBadge } from './stock-status-badge';

/** Pick a stock item at a location (INV-004 step 1, INV-005 lines). Shows on hand. */
export function ItemPicker({
  locationId,
  onPick,
  disabledIds = [],
  requireStock = false,
}: {
  locationId: string;
  onPick: (level: StockLevel) => void;
  disabledIds?: string[];
  /** Items with nothing on hand can't be picked (e.g. to send). */
  requireStock?: boolean;
}) {
  const { t } = useTranslation('inventory');
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search.trim());
  const items = useInventory({ locationId, pageSize: 50, ...(term ? { search: term } : {}) });

  return (
    <div className="space-y-2">
      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder={t('picker.search')}
        aria-label={t('picker.search')}
        clearLabel={t('picker.clear')}
        autoFocus
      />
      {!items.data ? (
        <Skeleton className="h-40" />
      ) : !items.data.items.length ? (
        <EmptyState icon={SearchXIcon} title={t('picker.none')} />
      ) : (
        <ul
          className="max-h-[45dvh] divide-y overflow-y-auto rounded-xl border"
          aria-label={t('picker.results')}
        >
          {items.data.items.map((l) => {
            const disabled = disabledIds.includes(l.productId) || (requireStock && l.onHand <= 0);
            return (
              <li key={l.productId}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(l)}
                  aria-label={t('picker.pick', {
                    name: l.name,
                    count: l.onHand,
                    unit: t(`unit.${l.unit}`, { count: l.onHand }),
                  })}
                  className={cn(
                    'flex min-h-touch w-full items-center gap-3 px-3 py-2 text-left focus-ring hover:bg-accent/50',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                    {l.code}
                  </span>
                  <span className="min-w-0 flex-1 font-medium">{l.name}</span>
                  {l.status !== 'OK' && <StockStatusBadge status={l.status} />}
                  <span className="w-20 text-right tabular">
                    {l.onHand}{' '}
                    <span className="text-xs text-muted-foreground">
                      {t(`unit.${l.unit}`, { count: l.onHand })}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
