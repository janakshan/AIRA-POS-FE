import type { Order, OrderStatus } from '@rbp/types';
import { Card, EmptyState, FilterChip, Pagination, Skeleton } from '@rbp/ui';
import { ReceiptTextIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { useCustomerOrders } from '../api/queries';
import { OrderDetailDialog } from '../components/order-detail-dialog';
import { OrderRow } from '../components/order-row';
import { useCustomerContext } from '../lib/customer-context';

const PAGE_SIZE = 20;
const STATUSES: OrderStatus[] = ['PAID', 'HELD', 'OPEN', 'CANCELLED', 'VOIDED'];

/** CUS-004 Order history: every order at every location, newest first. */
export function CustomerOrdersPage() {
  const { customer } = useCustomerContext();
  const { t } = useTranslation('customers');
  const list = useListParams({ pageSize: PAGE_SIZE, filterKeys: ['status'] });
  const status = STATUSES.find((s) => s === list.filters.status);
  const orders = useCustomerOrders(customer.id, {
    page: list.page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
  });
  const [open, setOpen] = useState<Order | null>(null);

  return (
    <Screen id="CUS-004" title={t('orders.title', { name: customer.name })} className="space-y-3">
      <div
        role="group"
        aria-label={t('orders.filter')}
        className="-mx-1 scrollbar-none flex gap-2 overflow-x-auto px-1"
      >
        {([null, ...STATUSES] as const).map((s) => (
          <FilterChip
            key={s ?? 'all'}
            active={(status ?? null) === s}
            onClick={() => list.setFilter('status', s)}
          >
            {s ? t(`orders.status.${s}`) : t('orders.all')}
          </FilterChip>
        ))}
      </div>
      <Card className="p-0">
        {orders.isError ? (
          <QueryError error={orders.error} onRetry={() => orders.refetch()} />
        ) : !orders.data ? (
          <Skeleton className="m-4 h-40" />
        ) : !orders.data.items.length ? (
          <EmptyState icon={ReceiptTextIcon} title={t('orders.empty')} />
        ) : (
          <>
            <ul className="divide-y" aria-label={t('orders.title', { name: customer.name })}>
              {orders.data.items.map((o) => (
                <OrderRow key={o.id} order={o} onOpen={() => setOpen(o)} />
              ))}
            </ul>
            <div className="border-t p-3">
              <Pagination
                page={list.page}
                pageSize={PAGE_SIZE}
                total={orders.data.total}
                onPageChange={list.setPage}
                summary={(from, to, total) => t('list.summary', { from, to, total })}
                previousLabel={t('list.previous')}
                nextLabel={t('list.next')}
                pageLabel={(p) => t('list.page', { page: p })}
              />
            </div>
          </>
        )}
      </Card>
      <OrderDetailDialog order={open} onOpenChange={(o) => !o && setOpen(null)} />
    </Screen>
  );
}
