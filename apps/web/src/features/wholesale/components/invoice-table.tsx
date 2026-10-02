import type { WholesaleInvoice } from '@rbp/types';
import { DataTable, type DataTableColumn, MoneyText, StatusBadge } from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';

/** Invoice rows (WHO-002 shop, WHO-003 today). */
export function InvoiceTable({
  rows,
  loading,
  error,
  empty,
  caption,
  showShop = true,
}: {
  rows: WholesaleInvoice[] | undefined;
  loading?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
  caption: string;
  showShop?: boolean;
}) {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const columns: DataTableColumn<WholesaleInvoice>[] = [
    {
      id: 'number',
      header: t('fields.invoice'),
      primary: true,
      width: 'w-36',
      cell: (i) => <span className="font-semibold">{i.number}</span>,
    },
    ...(showShop
      ? [
          {
            id: 'shop',
            header: t('fields.shop'),
            cell: (i: WholesaleInvoice) => <span className="font-medium">{i.shopName}</span>,
          },
        ]
      : []),
    {
      id: 'at',
      header: t('fields.date'),
      width: 'w-44',
      hideOnTablet: true,
      cell: (i) => formatDateTime(i.at, { locale }),
    },
    {
      id: 'total',
      header: t('fields.total'),
      align: 'right',
      width: 'w-32',
      cell: (i) => <MoneyText value={i.total} locale={locale} className="font-medium" />,
    },
    {
      id: 'balance',
      header: t('fields.unpaid'),
      align: 'right',
      width: 'w-32',
      cell: (i) =>
        i.balance.amount ? (
          <MoneyText value={i.balance} locale={locale} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'status',
      header: t('fields.status'),
      width: 'w-32',
      cell: (i) => (
        <span className="inline-flex flex-wrap gap-1">
          <StatusBadge
            tone={i.status === 'VOIDED' ? 'danger' : i.status === 'PAID' ? 'success' : 'warning'}
            size="sm"
          >
            {t(`invoiceStatus.${i.status}`)}
          </StatusBadge>
          {i.creditWarning && !i.voided && (
            <StatusBadge tone="danger" size="sm">
              {t('invoice.overLimit')}
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
      getRowId={(i) => i.id}
      getRowLabel={(i) => `${i.number} ${i.shopName}`}
      loading={loading ?? false}
      onRowClick={(i) => navigate(`/wholesale/field-sales/${i.id}`)}
      error={error}
      empty={empty}
    />
  );
}
