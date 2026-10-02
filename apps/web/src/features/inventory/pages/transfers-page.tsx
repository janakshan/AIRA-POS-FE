import type { StockTransfer, StockTransferStatus } from '@rbp/types';
import {
  Button,
  Card,
  EmptyState,
  FilterChip,
  PageHeader,
  Pagination,
  Skeleton,
  StatusBadge,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { ArrowRightIcon, TruckIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useStockTransfers } from '../api/queries';
import { TransferDetailDialog } from '../components/transfer-detail-dialog';
import { TransferDialog } from '../components/transfer-dialog';
import { TRANSFER_TONE } from '../lib/stock';
import { useMyLocations } from '../lib/use-locations';

const PAGE_SIZE = 20;
const STATUSES: StockTransferStatus[] = ['IN_TRANSIT', 'RECEIVED', 'CANCELLED'];

/** INV-005 Stock transfers between locations: dispatch → receive. */
export function TransfersPage() {
  const { t, i18n } = useTranslation('inventory');
  const locale = localeFor(i18n.language);
  const { nameOf, current } = useMyLocations();
  const list = useListParams({ pageSize: PAGE_SIZE, filterKeys: ['direction', 'status'] });
  const direction =
    list.filters.direction === 'in' || list.filters.direction === 'out'
      ? list.filters.direction
      : undefined;
  const status = STATUSES.find((s) => s === list.filters.status);
  const transfers = useStockTransfers({
    page: list.page,
    pageSize: PAGE_SIZE,
    ...(direction ? { direction } : {}),
    ...(status ? { status } : {}),
  });
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<StockTransfer | null>(null);

  return (
    <Screen id="INV-005" title={t('transfer.pageTitle')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('transfer.pageTitle')}
        description={t('transfer.pageHint', { location: current?.name ?? '' })}
        actions={
          <Button onClick={() => setCreating(true)}>
            <TruckIcon /> {t('transfer.new')}
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        {([null, 'in', 'out'] as const).map((d) => (
          <FilterChip
            key={d ?? 'all'}
            active={(direction ?? null) === d}
            onClick={() => list.setFilter('direction', d)}
          >
            {t(`transfer.direction.${d ?? 'all'}`)}
          </FilterChip>
        ))}
        <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
        {([null, ...STATUSES] as const).map((s) => (
          <FilterChip
            key={s ?? 'any'}
            active={(status ?? null) === s}
            onClick={() => list.setFilter('status', s)}
          >
            {s ? t(`transferStatus.${s}`) : t('transfer.anyStatus')}
          </FilterChip>
        ))}
      </div>
      <Card className="p-0">
        {transfers.isError ? (
          <QueryError error={transfers.error} onRetry={() => transfers.refetch()} />
        ) : !transfers.data ? (
          <Skeleton className="m-4 h-40" />
        ) : !transfers.data.items.length ? (
          <EmptyState icon={TruckIcon} title={t('transfer.empty')} />
        ) : (
          <>
            <ul className="divide-y" aria-label={t('transfer.pageTitle')}>
              {transfers.data.items.map((tr) => (
                <li key={tr.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(tr)}
                    aria-label={t('transfer.open', { number: tr.number })}
                    className="flex min-h-touch w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left focus-ring hover:bg-accent/50"
                  >
                    <span className="font-semibold">{tr.number}</span>
                    <StatusBadge tone={TRANSFER_TONE[tr.status]} size="sm">
                      {t(`transferStatus.${tr.status}`)}
                    </StatusBadge>
                    <span className="flex items-center gap-1.5 text-sm">
                      {nameOf(tr.fromLocationId)}{' '}
                      <ArrowRightIcon className="size-3.5" aria-label={t('transfer.toShort')} />{' '}
                      {nameOf(tr.toLocationId)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {tr.lines.map((l) => `${l.name} ×${l.quantity}`).join(', ')}
                    </span>
                    <span className="ml-auto text-sm text-muted-foreground">
                      {formatDateTime(tr.dispatchedAt, { locale })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {transfers.data.total > PAGE_SIZE && (
              <div className="border-t p-3">
                <Pagination
                  page={list.page}
                  pageSize={PAGE_SIZE}
                  total={transfers.data.total}
                  onPageChange={list.setPage}
                  summary={(f, to, total) => t('summary', { from: f, to, total })}
                  previousLabel={t('previous')}
                  nextLabel={t('next')}
                  pageLabel={(p) => t('page', { page: p })}
                />
              </div>
            )}
          </>
        )}
      </Card>
      <TransferDialog open={creating} onOpenChange={setCreating} />
      <TransferDetailDialog transfer={open} onOpenChange={(o) => !o && setOpen(null)} />
    </Screen>
  );
}
