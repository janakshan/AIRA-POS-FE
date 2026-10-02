import type { StockAdjustment } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  PageHeader,
  Pagination,
  StatusBadge,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { ClipboardListIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useStockAdjustments } from '../api/queries';
import { AdjustmentDialog } from '../components/adjustment-dialog';
import { useMyLocations } from '../lib/use-locations';

const PAGE_SIZE = 20;

/** INV-004 Stock adjustments: who changed what, approved by whom and why. */
export function AdjustmentsPage() {
  const { t, i18n } = useTranslation('inventory');
  const locale = localeFor(i18n.language);
  const { nameOf } = useMyLocations();
  const list = useListParams({ pageSize: PAGE_SIZE });
  const adjustments = useStockAdjustments({ page: list.page, pageSize: PAGE_SIZE });
  const [open, setOpen] = useState(false);

  const columns: DataTableColumn<StockAdjustment>[] = [
    {
      id: 'number',
      header: t('cols.number'),
      width: 'w-32',
      cell: (a) => <span className="font-medium">{a.number}</span>,
    },
    { id: 'item', header: t('cols.item'), primary: true, cell: (a) => a.productName },
    {
      id: 'location',
      header: t('cols.location'),
      hideOnTablet: true,
      cell: (a) => nameOf(a.locationId),
    },
    {
      id: 'kind',
      header: t('cols.kind'),
      width: 'w-32',
      cell: (a) => (
        <StatusBadge
          tone={a.kind === 'WASTAGE' ? 'danger' : a.kind === 'STAFF_MEAL' ? 'warning' : 'info'}
          size="sm"
          hideIcon
        >
          {t(`kind.${a.kind}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'change',
      header: t('cols.change'),
      align: 'right',
      width: 'w-28',
      cell: (a) => (
        <span className="tabular">
          {a.before} → <span className="font-semibold">{a.after}</span>
        </span>
      ),
    },
    {
      id: 'reason',
      header: t('cols.reason'),
      cell: (a) => (
        <span className="text-sm">
          {a.reason.label}
          <span className="block text-xs text-muted-foreground">
            {t('approvedBy', { name: a.approvedBy })}
          </span>
        </span>
      ),
    },
    {
      id: 'at',
      header: t('cols.time'),
      width: 'w-44',
      hideOnTablet: true,
      cell: (a) => formatDateTime(a.at, { locale }),
    },
  ];

  return (
    <Screen id="INV-004" title={t('adjust.pageTitle')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('adjust.pageTitle')}
        description={t('adjust.pageHint')}
        actions={
          <Button onClick={() => setOpen(true)}>
            <SlidersHorizontalIcon /> {t('adjust.new')}
          </Button>
        }
      />
      <Card className="p-0">
        <DataTable
          caption={t('adjust.pageTitle')}
          columns={columns}
          rows={adjustments.data?.items}
          getRowId={(a) => a.id}
          getRowLabel={(a) => `${a.number} ${a.productName}`}
          loading={adjustments.isPending}
          error={
            adjustments.isError ? (
              <QueryError error={adjustments.error} onRetry={() => adjustments.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={ClipboardListIcon} title={t('adjust.empty')} />}
          footer={
            adjustments.data && adjustments.data.total > PAGE_SIZE ? (
              <Pagination
                page={list.page}
                pageSize={PAGE_SIZE}
                total={adjustments.data.total}
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
      <AdjustmentDialog open={open} onOpenChange={setOpen} />
    </Screen>
  );
}
