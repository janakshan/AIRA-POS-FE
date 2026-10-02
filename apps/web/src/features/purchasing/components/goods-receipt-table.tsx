import type { GoodsReceipt } from '@rbp/types';
import { DataTable, type DataTableColumn, MoneyText } from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { useMyLocations } from '@/features/inventory/lib/use-locations';

/** GRN rows (PUR-004 history, PUR-002 / PUR-003 receipts). */
export function GoodsReceiptTable({
  rows,
  loading,
  error,
  empty,
  toolbar,
  footer,
  caption,
  showSupplier = true,
}: {
  rows: GoodsReceipt[] | undefined;
  loading?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  caption: string;
  showSupplier?: boolean;
}) {
  const { t, i18n } = useTranslation('purchasing');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const { nameOf } = useMyLocations();
  const columns: DataTableColumn<GoodsReceipt>[] = [
    {
      id: 'number',
      header: t('fields.grnNumber'),
      primary: true,
      cell: (g) => {
        const items = g.lines.map((l) => `${l.productName} +${l.receivedQuantity}`).join(', ');
        return (
          <span>
            <span className="font-semibold">{g.number}</span>
            <span className="block max-w-56 truncate text-xs text-muted-foreground" title={items}>
              {items}
            </span>
          </span>
        );
      },
    },
    {
      id: 'po',
      header: t('fields.poNumber'),
      width: 'w-32',
      cell: (g) => g.purchaseOrderNumber,
    },
    ...(showSupplier
      ? [
          {
            id: 'supplier',
            header: t('fields.supplier'),
            cell: (g: GoodsReceipt) => <span className="font-medium">{g.supplierName}</span>,
          },
        ]
      : []),
    {
      id: 'location',
      header: t('fields.location'),
      hideOnTablet: true,
      cell: (g) => nameOf(g.locationId),
    },
    {
      id: 'total',
      header: t('fields.value'),
      align: 'right',
      width: 'w-36',
      cell: (g) => <MoneyText value={g.total} locale={locale} className="font-medium" />,
    },
    {
      id: 'received',
      header: t('fields.receivedAt'),
      width: 'w-44',
      cell: (g) => (
        <span className="text-sm">
          {formatDateTime(g.receivedAt, { locale })}
          <span className="block text-xs text-muted-foreground">{g.receivedBy}</span>
        </span>
      ),
    },
  ];
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      getRowId={(g) => g.id}
      getRowLabel={(g) => `${g.number} ${g.supplierName}`}
      loading={loading ?? false}
      onRowClick={(g) => navigate(`/purchasing/receiving/${g.id}`)}
      error={error}
      empty={empty}
      toolbar={toolbar}
      footer={footer}
    />
  );
}
