import { Button, Card, EmptyState, FilterBar, PageHeader, Pagination } from '@rbp/ui';
import { PackageCheckIcon, SearchXIcon, TruckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useGoodsReceipts, usePurchaseOrders } from '../api/queries';
import { GoodsReceiptTable } from '../components/goods-receipt-table';
import { PurchaseOrderTable } from '../components/purchase-order-table';

const PAGE_SIZE = 20;

/** PUR-004 Goods receiving: what's due in, and every delivery received (GRNs). */
export function GoodsReceivingPage() {
  const { t } = useTranslation('purchasing');
  const list = useListParams({ pageSize: PAGE_SIZE });
  const awaiting = usePurchaseOrders({ open: true, pageSize: 50 });
  const receipts = useGoodsReceipts({
    page: list.page,
    pageSize: PAGE_SIZE,
    ...(list.search ? { search: list.search } : {}),
  });
  // Soonest expected first; undated last.
  const due = [...(awaiting.data?.items ?? [])].sort((a, b) =>
    (a.expectedDate ?? '9999').localeCompare(b.expectedDate ?? '9999'),
  );

  return (
    <Screen id="PUR-004" title={t('receiving.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('receiving.title')}
        description={t('receiving.hint')}
      />

      <section className="space-y-3" aria-labelledby="awaiting">
        <h2 id="awaiting" className="text-lg font-semibold">
          {t('receiving.awaiting')}
          {awaiting.data && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {t('receiving.awaitingCount', { count: awaiting.data.total })}
            </span>
          )}
        </h2>
        <Card className="p-0">
          <PurchaseOrderTable
            caption={t('receiving.awaiting')}
            rows={awaiting.data ? due : undefined}
            loading={awaiting.isPending}
            error={
              awaiting.isError ? (
                <QueryError error={awaiting.error} onRetry={() => awaiting.refetch()} />
              ) : undefined
            }
            empty={<EmptyState icon={TruckIcon} title={t('receiving.nothingDue')} />}
            hide={['created', 'total']}
            action={(po) => (
              // Keep the row click (open the PO) separate from Receive.
              <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <Button asChild size="sm">
                  <Link
                    to={`new?${new URLSearchParams({ po: po.id })}`}
                    aria-label={t('receiving.receiveFor', { number: po.number })}
                  >
                    <PackageCheckIcon /> {t('receiving.receive')}
                  </Link>
                </Button>
              </span>
            )}
          />
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="history">
        <h2 id="history" className="text-lg font-semibold">
          {t('receiving.history')}
        </h2>
        <Card className="p-0">
          <GoodsReceiptTable
            caption={t('receiving.history')}
            rows={receipts.data?.items}
            loading={receipts.isPending}
            error={
              receipts.isError ? (
                <QueryError error={receipts.error} onRetry={() => receipts.refetch()} />
              ) : undefined
            }
            empty={
              list.search ? (
                <EmptyState icon={SearchXIcon} title={t('receiving.noResults')} />
              ) : (
                <EmptyState icon={PackageCheckIcon} title={t('receiving.empty')} />
              )
            }
            toolbar={
              <FilterBar
                search={
                  <ListSearch
                    value={list.search}
                    onSearch={list.setSearch}
                    placeholder={t('receiving.searchPlaceholder')}
                    aria-label={t('receiving.search')}
                  />
                }
              />
            }
            footer={
              receipts.data && receipts.data.total > PAGE_SIZE ? (
                <Pagination
                  page={list.page}
                  pageSize={PAGE_SIZE}
                  total={receipts.data.total}
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
      </section>
    </Screen>
  );
}
