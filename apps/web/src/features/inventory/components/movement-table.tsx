import type { StockMovement } from '@rbp/types';
import { DataTable, type DataTableColumn, EmptyState, StatusBadge } from '@rbp/ui';
import { cn, formatDateTime } from '@rbp/utils';
import { HistoryIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { useAccess } from '@/features/auth/hooks/use-access';
import { MOVEMENT_TONE, signed } from '../lib/stock';
import { useMyLocations } from '../lib/use-locations';

/** INV-003 ledger rows (also the recent list on INV-002). */
export function MovementTable({
  rows,
  loading,
  error,
  footer,
  showItem = true,
  caption,
}: {
  rows: StockMovement[] | undefined;
  loading?: boolean;
  error?: ReactNode;
  footer?: ReactNode;
  showItem?: boolean;
  caption: string;
}) {
  const { t, i18n } = useTranslation('inventory');
  const locale = localeFor(i18n.language);
  const { nameOf } = useMyLocations();
  const { can, hasFeature } = useAccess();
  // Goods receipts open their GRN (PUR-004), batches their BAK-003 page, for users who can.
  const refHref = (m: StockMovement) =>
    !m.reference.id
      ? null
      : m.reference.kind === 'GOODS_RECEIPT' && hasFeature('PURCHASING') && can('purchasing.manage')
        ? `/purchasing/receiving/${m.reference.id}`
        : // BAK-003 batches open from their consumption / output / reject movements.
          m.reference.kind === 'PRODUCTION_BATCH' &&
            hasFeature('BAKERY_PRODUCTION') &&
            can('production.manage')
          ? `/production/batches/${m.reference.id}`
          : // WHO-003/005 van sales and shop returns.
            hasFeature('WHOLESALE') && can('wholesale.manage')
            ? m.reference.kind === 'WHOLESALE_INVOICE'
              ? `/wholesale/field-sales/${m.reference.id}`
              : m.reference.kind === 'WHOLESALE_RETURN'
                ? `/wholesale/returns/${m.reference.id}`
                : null
            : null;
  const columns: DataTableColumn<StockMovement>[] = [
    {
      id: 'at',
      header: t('cols.time'),
      width: 'w-44',
      cell: (m) => formatDateTime(m.at, { locale }),
    },
    ...(showItem
      ? [
          {
            id: 'item',
            header: t('cols.item'),
            primary: true,
            cell: (m: StockMovement) => <span className="font-medium">{m.productName}</span>,
          },
        ]
      : []),
    {
      id: 'location',
      header: t('cols.location'),
      hideOnTablet: true,
      cell: (m) => nameOf(m.locationId),
    },
    {
      id: 'type',
      header: t('cols.type'),
      width: 'w-36',
      ...(showItem ? {} : { primary: true }),
      cell: (m) => (
        <StatusBadge tone={MOVEMENT_TONE[m.type]} size="sm" hideIcon>
          {t(`movement.${m.type}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'qty',
      header: t('cols.quantity'),
      align: 'right',
      width: 'w-24',
      cell: (m) => (
        <span
          className={cn(
            'font-semibold tabular',
            m.quantity > 0 ? 'text-status-success-fg' : 'text-destructive',
          )}
        >
          {signed(m.quantity)}
        </span>
      ),
    },
    {
      id: 'balance',
      header: t('cols.balance'),
      align: 'right',
      width: 'w-24',
      cell: (m) => <span className="tabular">{m.balanceAfter}</span>,
    },
    {
      id: 'ref',
      header: t('cols.reference'),
      cell: (m) => {
        const href = refHref(m);
        return (
          <span className="text-sm">
            {href ? (
              <Link
                to={href}
                className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
              >
                {m.reference.number}
              </Link>
            ) : (
              <span className="font-medium">{m.reference.number ?? '—'}</span>
            )}
            {(m.reason || m.note) && (
              <span className="block text-xs text-muted-foreground">
                {[m.reason?.label, m.note].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'by',
      header: t('cols.by'),
      hideOnTablet: true,
      cell: (m) => (
        <span className="text-sm">
          {m.createdBy}
          {m.approvedBy && m.approvedBy !== m.createdBy && (
            <span className="block text-xs text-muted-foreground">
              {t('approvedBy', { name: m.approvedBy })}
            </span>
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
      getRowId={(m) => m.id}
      getRowLabel={(m) => `${t(`movement.${m.type}`)} ${m.productName} ${signed(m.quantity)}`}
      loading={loading ?? false}
      error={error}
      empty={<EmptyState icon={HistoryIcon} title={t('movements.empty')} />}
      footer={footer}
    />
  );
}
