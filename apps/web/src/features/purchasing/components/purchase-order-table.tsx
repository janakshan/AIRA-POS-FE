import type { PurchaseOrder } from '@rbp/types';
import { DataTable, type DataTableColumn, MoneyText } from '@rbp/ui';
import { formatDate } from '@rbp/utils';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { formatPlainDate } from '../lib/status';
import { PoStatusBadge } from './po-status-badge';

/** PO rows (PUR-003 list, PUR-002 supplier history, PUR-004 awaiting delivery). */
export function PurchaseOrderTable({
  rows,
  loading,
  error,
  empty,
  toolbar,
  footer,
  caption,
  showSupplier = true,
  action,
  hide = [],
}: {
  rows: PurchaseOrder[] | undefined;
  loading?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  caption: string;
  showSupplier?: boolean;
  /** Trailing cell, e.g. a Receive button. */
  action?: (po: PurchaseOrder) => ReactNode;
  /** Column ids to leave out where space is tight. */
  hide?: string[];
}) {
  const { t, i18n } = useTranslation('purchasing');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const { nameOf } = useMyLocations();
  const all: DataTableColumn<PurchaseOrder>[] = [
    {
      id: 'number',
      header: t('fields.poNumber'),
      primary: true,
      width: 'w-36',
      cell: (po) => <span className="font-semibold">{po.number}</span>,
    },
    ...(showSupplier
      ? [
          {
            id: 'supplier',
            header: t('fields.supplier'),
            cell: (po: PurchaseOrder) => <span className="font-medium">{po.supplierName}</span>,
          },
        ]
      : []),
    {
      id: 'location',
      header: t('fields.deliverTo'),
      hideOnTablet: true,
      cell: (po) => nameOf(po.locationId),
    },
    {
      id: 'status',
      header: t('fields.status'),
      cell: (po) => <PoStatusBadge order={po} />,
    },
    {
      id: 'expected',
      header: t('fields.expected'),
      width: 'w-32',
      hideOnTablet: true,
      cell: (po) =>
        po.expectedDate ? (
          formatPlainDate(po.expectedDate, locale)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'progress',
      header: t('fields.received'),
      align: 'right',
      width: 'w-28',
      hideOnTablet: true,
      cell: (po) => {
        const ordered = po.lines.reduce((s, l) => s + l.quantity, 0);
        const received = po.lines.reduce((s, l) => s + l.receivedQuantity, 0);
        return po.status === 'DRAFT' || po.status === 'CANCELLED' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular">
            {received}/{ordered}
          </span>
        );
      },
    },
    {
      id: 'total',
      header: t('fields.total'),
      align: 'right',
      width: 'w-36',
      cell: (po) => <MoneyText value={po.total} locale={locale} className="font-medium" />,
    },
    {
      id: 'created',
      header: t('fields.created'),
      width: 'w-32',
      hideOnTablet: true,
      cell: (po) => formatDate(po.createdAt, { locale }),
    },
    ...(action
      ? [
          {
            id: 'action',
            header: '',
            align: 'right' as const,
            cell: (po: PurchaseOrder) => action(po),
          },
        ]
      : []),
  ];
  const columns = all.filter((c) => !hide.includes(c.id));
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      getRowId={(po) => po.id}
      getRowLabel={(po) => `${po.number} ${po.supplierName}`}
      loading={loading ?? false}
      onRowClick={(po) => navigate(`/purchasing/orders/${po.id}`)}
      error={error}
      empty={empty}
      toolbar={toolbar}
      footer={footer}
    />
  );
}
