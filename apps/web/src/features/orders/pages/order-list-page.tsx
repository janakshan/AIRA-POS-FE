import type { OrderStatus, OrderType, PaymentMethod } from '@rbp/types';
import {
  Button,
  Card,
  EmptyState,
  FilterBar,
  FilterChip,
  Input,
  PageHeader,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rbp/ui';
import { ReceiptTextIcon, SearchXIcon, ShoppingCartIcon } from 'lucide-react';
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useMe } from '@/features/auth/api/queries';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useOrders } from '@/features/pos/api/orders';
import { DATE_RANGES, rangeBounds } from '@/lib/date-range';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { OrderTable } from '../components/order-table';

const PAGE_SIZE = 25;
const ANY = 'all';
const STATUSES: OrderStatus[] = ['PAID', 'HELD', 'OPEN', 'CANCELLED', 'VOIDED'];
const TYPES: OrderType[] = ['RETAIL', 'DINE_IN', 'TAKEAWAY', 'DELIVERY'];
const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT'];
/** A-291: the list opens on today; "All time" is kept in the URL. */
const DEFAULT_RANGE = 'today';

/** SAL-001 Orders: every saved sale at the current location, newest first. */
export function OrderListPage() {
  const { t } = useTranslation('orders');
  const { data: me } = useMe();
  const { can } = useAccess();
  const list = useListParams({
    pageSize: PAGE_SIZE,
    filterKeys: ['status', 'type', 'payment', 'range', 'from', 'to'],
  });
  const status = STATUSES.find((s) => s === list.filters.status);
  const type = TYPES.find((s) => s === list.filters.type);
  const paymentMethod = METHODS.find((s) => s === list.filters.payment);
  const range = DATE_RANGES.find((r) => r === list.filters.range) ?? DEFAULT_RANGE;
  const bounds = useMemo(
    () => rangeBounds(range, list.filters.from, list.filters.to),
    [range, list.filters.from, list.filters.to],
  );
  const ids = { from: useId(), to: useId() };
  const orders = useOrders({
    page: list.page,
    pageSize: PAGE_SIZE,
    ...bounds,
    ...(list.search ? { search: list.search } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
  });
  const filtered = !!(list.search || status || type || paymentMethod || range !== 'all');

  return (
    <Screen id="SAL-001" title={t('list.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('list.title')}
        description={t('list.hint', { location: me?.currentLocation?.name ?? '' })}
        actions={
          can('pos.sale.create') ? (
            <Button asChild>
              <Link to="/pos">
                <ShoppingCartIcon /> {t('list.newSale')}
              </Link>
            </Button>
          ) : undefined
        }
      />
      {range === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor={ids.from} className="text-sm font-medium">
              {t('list.from')}
            </label>
            <Input
              id={ids.from}
              type="date"
              value={list.filters.from ?? ''}
              className="w-full sm:w-44"
              onChange={(e) => list.setFilter('from', e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.to} className="text-sm font-medium">
              {t('list.to')}
            </label>
            <Input
              id={ids.to}
              type="date"
              value={list.filters.to ?? ''}
              className="w-full sm:w-44"
              onChange={(e) => list.setFilter('to', e.target.value || null)}
            />
          </div>
        </div>
      )}
      <Card className="p-0">
        <OrderTable
          caption={t('list.caption')}
          rows={orders.data?.items}
          loading={orders.isPending}
          error={
            orders.isError ? (
              <QueryError error={orders.error} onRetry={() => orders.refetch()} />
            ) : undefined
          }
          empty={
            filtered ? (
              <EmptyState icon={SearchXIcon} title={t('list.noResults')} />
            ) : (
              <EmptyState
                icon={ReceiptTextIcon}
                title={t('list.empty')}
                description={t('list.emptyHint')}
              />
            )
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('list.searchPlaceholder')}
                  aria-label={t('list.search')}
                />
              }
              filters={
                <>
                  {([null, ...STATUSES] as const).map((s) => (
                    <FilterChip
                      key={s ?? 'any'}
                      active={(status ?? null) === s}
                      onClick={() => list.setFilter('status', s)}
                    >
                      {s ? t(`status.${s}`) : t('list.anyStatus')}
                    </FilterChip>
                  ))}
                  <Select
                    value={range}
                    onValueChange={(v) =>
                      list.setFilters({
                        range: v === DEFAULT_RANGE ? null : v,
                        ...(v === 'custom' ? {} : { from: null, to: null }),
                      })
                    }
                  >
                    <SelectTrigger className="w-full sm:w-44" aria-label={t('list.range')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_RANGES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`range.${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={type ?? ANY}
                    onValueChange={(v) => list.setFilter('type', v === ANY ? null : v)}
                  >
                    <SelectTrigger className="w-full sm:w-44" aria-label={t('columns.type')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>{t('list.anyType')}</SelectItem>
                      {TYPES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`pos:orderType.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={paymentMethod ?? ANY}
                    onValueChange={(v) => list.setFilter('payment', v === ANY ? null : v)}
                  >
                    <SelectTrigger className="w-full sm:w-48" aria-label={t('columns.payment')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>{t('list.anyPayment')}</SelectItem>
                      {METHODS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`method.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              }
            />
          }
          footer={
            orders.data && orders.data.total > PAGE_SIZE ? (
              <Pagination
                page={list.page}
                pageSize={PAGE_SIZE}
                total={orders.data.total}
                onPageChange={list.setPage}
                summary={(from, to, total) => t('summary', { from, to, total })}
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
