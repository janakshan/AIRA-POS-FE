import type { StockMovementType } from '@rbp/types';
import {
  Card,
  FilterBar,
  FilterChip,
  PageHeader,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rbp/ui';
import { XIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useInventoryItem, useStockMovements } from '../api/queries';
import { LocationSelect } from '../components/location-select';
import { MovementTable } from '../components/movement-table';

const PAGE_SIZE = 25;
const TYPES: StockMovementType[] = [
  'SALE',
  'RETURN',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'PURCHASE',
  'PRODUCTION_CONSUMPTION',
  'PRODUCTION_OUTPUT',
  'WASTAGE',
  'STAFF_MEAL',
  'ADJUSTMENT',
  'OPENING',
];
const RANGES = { today: 0, week: 7, month: 30 } as const;
type Range = keyof typeof RANGES;

function rangeStart(range: Range | undefined) {
  if (!range) return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - RANGES[range]);
  return d.toISOString();
}

/** INV-003 Stock movements: the ledger every balance is built from. */
export function StockMovementsPage() {
  const { t } = useTranslation('inventory');
  const list = useListParams({
    pageSize: PAGE_SIZE,
    filterKeys: ['location', 'type', 'item', 'range'],
  });
  const type = TYPES.find((x) => x === list.filters.type);
  const range = (Object.keys(RANGES) as Range[]).find((r) => r === list.filters.range);
  const from = useMemo(() => rangeStart(range), [range]);
  const itemId = list.filters.item;
  const item = useInventoryItem(itemId);
  const movements = useStockMovements({
    page: list.page,
    pageSize: PAGE_SIZE,
    ...(list.filters.location ? { locationId: list.filters.location } : {}),
    ...(type ? { type } : {}),
    ...(itemId ? { productId: itemId } : {}),
    ...(from ? { from } : {}),
  });

  return (
    <Screen id="INV-003" title={t('movements.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('movements.title')}
        description={t('movements.hint')}
      />
      <Card className="p-0">
        <div className="border-b p-3">
          <FilterBar
            filters={
              <>
                <LocationSelect
                  value={list.filters.location ?? 'all'}
                  onChange={(v) => list.setFilter('location', v === 'all' ? null : v)}
                  allowAll
                  label={t('location')}
                />
                <Select
                  value={type ?? 'all'}
                  onValueChange={(v) => list.setFilter('type', v === 'all' ? null : v)}
                >
                  <SelectTrigger className="w-full sm:w-48" aria-label={t('cols.type')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('movements.allTypes')}</SelectItem>
                    {TYPES.map((x) => (
                      <SelectItem key={x} value={x}>
                        {t(`movement.${x}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {([null, 'today', 'week', 'month'] as const).map((r) => (
                  <FilterChip
                    key={r ?? 'all'}
                    active={(range ?? null) === r}
                    onClick={() => list.setFilter('range', r)}
                  >
                    {t(`movements.range.${r ?? 'all'}`)}
                  </FilterChip>
                ))}
                {itemId && (
                  <FilterChip
                    active
                    onClick={() => list.setFilter('item', null)}
                    aria-label={t('movements.clearItem', { name: item.data?.name ?? '' })}
                  >
                    {item.data?.name ?? itemId} <XIcon className="size-3.5" aria-hidden />
                  </FilterChip>
                )}
              </>
            }
          />
        </div>
        <MovementTable
          caption={t('movements.title')}
          rows={movements.data?.items}
          loading={movements.isPending}
          error={
            movements.isError ? (
              <QueryError error={movements.error} onRetry={() => movements.refetch()} />
            ) : undefined
          }
          footer={
            movements.data && movements.data.total > 0 ? (
              <Pagination
                page={list.page}
                pageSize={PAGE_SIZE}
                total={movements.data.total}
                onPageChange={list.setPage}
                summary={(f, to, total) => t('summary', { from: f, to, total })}
                previousLabel={t('previous')}
                nextLabel={t('next')}
                pageLabel={(p) => t('page', { page: p })}
              />
            ) : undefined
          }
        />
      </Card>
    </Screen>
  );
}
