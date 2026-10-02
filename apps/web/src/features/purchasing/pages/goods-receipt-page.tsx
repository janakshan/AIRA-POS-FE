import type { GoodsReceiptLine } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  MoneyText,
  PageHeader,
  PageSkeleton,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { HistoryIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { signed } from '@/features/inventory/lib/stock';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useGoodsReceipt } from '../api/queries';

/** PUR-004 goods received note: what arrived, what it cost, and the stock it added. */
export function GoodsReceiptPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('purchasing');
  const locale = localeFor(i18n.language);
  const { can } = useAccess();
  const { nameOf } = useMyLocations();
  const receipt = useGoodsReceipt(id);
  useBreadcrumbTitle(receipt.data?.number);

  if (receipt.isError)
    return <QueryError error={receipt.error} onRetry={() => receipt.refetch()} />;
  if (!receipt.data) return <PageSkeleton />;
  const g = receipt.data;
  const currency = g.total.currency;

  const columns: DataTableColumn<GoodsReceiptLine>[] = [
    {
      id: 'item',
      header: t('fields.item'),
      primary: true,
      cell: (l) => (
        <span>
          <span className="font-medium">{l.productName}</span>
          <span className="block font-mono text-xs text-muted-foreground">{l.productCode}</span>
        </span>
      ),
    },
    {
      id: 'ordered',
      header: t('fields.ordered'),
      align: 'right',
      width: 'w-24',
      hideOnTablet: true,
      cell: (l) => l.orderedQuantity,
    },
    {
      id: 'received',
      header: t('grn.stockIn'),
      align: 'right',
      width: 'w-28',
      cell: (l) => (
        <span className="font-semibold text-status-success-fg tabular">
          {signed(l.receivedQuantity)}{' '}
          <span className="text-xs font-normal text-muted-foreground">
            {t(`inventory:unit.${l.unit}`, { count: l.receivedQuantity })}
          </span>
        </span>
      ),
    },
    {
      id: 'balance',
      header: t('grn.balanceAfter'),
      align: 'right',
      width: 'w-28',
      cell: (l) => <span className="tabular">{l.balanceAfter}</span>,
    },
    {
      id: 'cost',
      header: t('fields.unitCost'),
      align: 'right',
      width: 'w-32',
      cell: (l) => <MoneyText value={l.unitCost} locale={locale} />,
    },
    {
      id: 'total',
      header: t('fields.lineTotal'),
      align: 'right',
      width: 'w-36',
      cell: (l) => (
        <MoneyText
          value={{ amount: l.receivedQuantity * l.unitCost.amount, currency }}
          locale={locale}
          className="font-medium"
        />
      ),
    },
  ];

  return (
    <Screen id="PUR-004" title={g.number} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={g.number}
        description={t('grn.subtitle', {
          supplier: g.supplierName,
          location: nameOf(g.locationId),
        })}
        actions={
          can('inventory.view') && (
            <Button asChild variant="outline">
              <Link to="/inventory/movements?type=PURCHASE">
                <HistoryIcon /> {t('grn.viewMovements')}
              </Link>
            </Button>
          )
        }
      />
      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t('fields.poNumber')}>
          <Link
            to={`/purchasing/orders/${g.purchaseOrderId}`}
            className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
          >
            {g.purchaseOrderNumber}
          </Link>
        </Fact>
        <Fact label={t('fields.supplier')}>
          <Link
            to={`/purchasing/suppliers/${g.supplierId}`}
            className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
          >
            {g.supplierName}
          </Link>
        </Fact>
        <Fact label={t('fields.receivedAt')}>
          {formatDateTime(g.receivedAt, { locale })}
          <span className="block text-xs text-muted-foreground">{g.receivedBy}</span>
        </Fact>
        <Fact label={t('fields.value')}>
          <MoneyText value={g.total} locale={locale} className="font-semibold" />
        </Fact>
        <Fact label={t('fields.invoiceRef')}>{g.supplierInvoiceRef ?? '—'}</Fact>
        {g.note && (
          <div className="sm:col-span-2 lg:col-span-3">
            <Fact label={t('fields.note')}>{g.note}</Fact>
          </div>
        )}
      </Card>
      <section className="space-y-2" aria-labelledby="grn-lines">
        <h2 id="grn-lines" className="text-lg font-semibold">
          {t('grn.lines')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('grn.linesHint', { location: nameOf(g.locationId), number: g.number })}
        </p>
        <Card className="p-0">
          <DataTable
            caption={t('grn.lines')}
            columns={columns}
            rows={g.lines}
            getRowId={(l) => l.productId}
            getRowLabel={(l) => l.productName}
            loading={false}
          />
        </Card>
      </section>
    </Screen>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="break-words">{children}</div>
    </div>
  );
}
