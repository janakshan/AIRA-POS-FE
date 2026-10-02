import {
  Button,
  Card,
  EmptyState,
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
import { ClipboardListIcon, PlusIcon, SearchXIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { usePurchaseOrders, useSuppliers } from '../api/queries';
import { PurchaseOrderTable } from '../components/purchase-order-table';
import { PO_STATUSES } from '../lib/status';

const PAGE_SIZE = 20;
const ANY_SUPPLIER = 'all';

/** PUR-003 Purchase orders: draft → ordered → received, for the user's locations. */
export function PurchaseOrderListPage() {
  const { t } = useTranslation('purchasing');
  const list = useListParams({ pageSize: PAGE_SIZE, filterKeys: ['status', 'supplier'] });
  const status = PO_STATUSES.find((s) => s === list.filters.status);
  const supplierId = list.filters.supplier;
  const suppliers = useSuppliers({ pageSize: 100 });
  const orders = usePurchaseOrders({
    page: list.page,
    pageSize: PAGE_SIZE,
    ...(list.search ? { search: list.search } : {}),
    ...(status ? { status } : {}),
    ...(supplierId ? { supplierId } : {}),
  });
  const filtered = !!(list.search || status || supplierId);

  return (
    <Screen id="PUR-003" title={t('orders.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('orders.title')}
        description={t('orders.hint')}
        actions={
          <Button asChild>
            <Link to="new">
              <PlusIcon /> {t('orders.new')}
            </Link>
          </Button>
        }
      />
      <Card className="p-0">
        <PurchaseOrderTable
          caption={t('orders.caption')}
          rows={orders.data?.items}
          loading={orders.isPending}
          error={
            orders.isError ? (
              <QueryError error={orders.error} onRetry={() => orders.refetch()} />
            ) : undefined
          }
          empty={
            filtered ? (
              <EmptyState icon={SearchXIcon} title={t('orders.noResults')} />
            ) : (
              <EmptyState icon={ClipboardListIcon} title={t('orders.empty')} />
            )
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('orders.searchPlaceholder')}
                  aria-label={t('orders.search')}
                />
              }
              filters={
                <>
                  {([null, ...PO_STATUSES] as const).map((s) => (
                    <FilterChip
                      key={s ?? 'any'}
                      active={(status ?? null) === s}
                      onClick={() => list.setFilter('status', s)}
                    >
                      {s ? t(`status.${s}`) : t('orders.anyStatus')}
                    </FilterChip>
                  ))}
                  <Select
                    value={supplierId ?? ANY_SUPPLIER}
                    onValueChange={(v) => list.setFilter('supplier', v === ANY_SUPPLIER ? null : v)}
                  >
                    <SelectTrigger className="w-full sm:w-56" aria-label={t('fields.supplier')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_SUPPLIER}>{t('orders.anySupplier')}</SelectItem>
                      {suppliers.data?.items.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
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
