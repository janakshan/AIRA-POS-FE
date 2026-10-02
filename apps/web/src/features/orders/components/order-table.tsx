import type { Order } from '@rbp/types';
import { DataTable, type DataTableColumn, MoneyText, StatusBadge } from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { ORDER_TONE } from '@/features/pos/lib/order-rules';

/** Sale payment methods, once each (split payments show both). */
const saleMethods = (o: Order) => [
  ...new Set(o.payments.filter((p) => p.kind === 'SALE').map((p) => p.method)),
];

/** SAL-001 order rows; a row opens the order. */
export function OrderTable({
  rows,
  loading,
  error,
  empty,
  toolbar,
  footer,
  caption,
}: {
  rows: Order[] | undefined;
  loading?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  caption: string;
}) {
  const { t, i18n } = useTranslation('orders');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const columns: DataTableColumn<Order>[] = [
    {
      id: 'number',
      header: t('columns.number'),
      primary: true,
      width: 'w-40',
      cell: (o) => <span className="font-semibold">{o.number}</span>,
    },
    {
      id: 'time',
      header: t('columns.time'),
      width: 'w-44',
      cell: (o) => formatDateTime(o.paidAt ?? o.createdAt, { locale }),
    },
    {
      id: 'type',
      header: t('columns.type'),
      width: 'w-32',
      hideOnTablet: true,
      cell: (o) => (
        <span>
          {t(`pos:orderType.${o.type}`)}
          {o.table && <span className="text-muted-foreground"> · {o.table.name}</span>}
        </span>
      ),
    },
    {
      id: 'customer',
      header: t('columns.customer'),
      hideOnTablet: true,
      cell: (o) =>
        o.customer ? (
          <span className="font-medium">{o.customer.name}</span>
        ) : (
          <span className="text-muted-foreground">{t('walkIn')}</span>
        ),
    },
    {
      id: 'items',
      header: t('columns.items'),
      align: 'right',
      width: 'w-24',
      hideOnTablet: true,
      cell: (o) => <span className="tabular">{o.totals.itemCount}</span>,
    },
    {
      id: 'payment',
      header: t('columns.payment'),
      width: 'w-36',
      hideOnTablet: true,
      cell: (o) => {
        const methods = saleMethods(o);
        return methods.length ? (
          methods.map((m) => t(`method.${m}`)).join(' + ')
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: 'total',
      header: t('columns.total'),
      align: 'right',
      width: 'w-36',
      cell: (o) => <MoneyText value={o.totals.total} locale={locale} className="font-medium" />,
    },
    {
      id: 'status',
      header: t('columns.status'),
      width: 'w-40',
      cell: (o) => (
        <span className="flex flex-wrap gap-1">
          <StatusBadge tone={ORDER_TONE[o.status]} size="sm">
            {t(`status.${o.status}`)}
          </StatusBadge>
          {o.returns.length > 0 && (
            <StatusBadge tone="warning" size="sm">
              {t('returnsCount', { count: o.returns.length })}
            </StatusBadge>
          )}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      getRowId={(o) => o.id}
      getRowLabel={(o) => `${o.number} ${t(`status.${o.status}`)}`}
      loading={loading ?? false}
      onRowClick={(o) => navigate(`/sales/orders/${o.id}`)}
      error={error}
      empty={empty}
      toolbar={toolbar}
      footer={footer}
    />
  );
}
