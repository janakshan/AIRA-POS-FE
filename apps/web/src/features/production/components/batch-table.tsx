import type { ProductionBatch } from '@rbp/types';
import { Button, DataTable, type DataTableColumn } from '@rbp/ui';
import { PackageCheckIcon, PlayIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { formatPlainDate } from '@/features/purchasing/lib/status';
import { BatchStatusBadge } from './status-badges';

/** BAK-003 batch rows (BAK-001 today, BAK-002 plan detail, BAK-003 list). */
export function BatchTable({
  rows,
  loading,
  error,
  empty,
  toolbar,
  caption,
  onStart,
  onComplete,
  hide = [],
}: {
  rows: ProductionBatch[] | undefined;
  loading?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
  toolbar?: ReactNode;
  caption: string;
  /** Row actions; omitted = read only. */
  onStart?: (b: ProductionBatch) => void;
  onComplete?: (b: ProductionBatch) => void;
  hide?: string[];
}) {
  const { t, i18n } = useTranslation('production');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const all: DataTableColumn<ProductionBatch>[] = [
    {
      id: 'number',
      header: t('fields.batch'),
      primary: true,
      width: 'w-36',
      cell: (b) => <span className="font-semibold">{b.number}</span>,
    },
    {
      id: 'product',
      header: t('fields.product'),
      cell: (b) => <span className="font-medium">{b.productName}</span>,
    },
    {
      id: 'date',
      header: t('fields.planDate'),
      width: 'w-32',
      hideOnTablet: true,
      cell: (b) => formatPlainDate(b.planDate, locale),
    },
    {
      id: 'status',
      header: t('fields.status'),
      cell: (b) => <BatchStatusBadge status={b.status} />,
    },
    {
      id: 'expected',
      header: t('fields.expected'),
      align: 'right',
      width: 'w-24',
      cell: (b) => <span className="tabular">{b.expectedQuantity}</span>,
    },
    {
      id: 'output',
      header: t('fields.output'),
      align: 'right',
      width: 'w-32',
      cell: (b) =>
        b.status === 'COMPLETED' ? (
          <span className="tabular">
            {b.goodQuantity}
            {b.rejectedQuantity ? (
              <span className="block text-xs text-status-danger-fg">
                {t('batches.rejected', { count: b.rejectedQuantity })}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    ...(onStart || onComplete
      ? [
          {
            id: 'action',
            header: '',
            align: 'right' as const,
            cell: (b: ProductionBatch) =>
              b.status === 'PLANNED' && onStart ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="pointer-coarse:min-h-11"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStart(b);
                  }}
                  aria-label={t('batches.startFor', { number: b.number, name: b.productName })}
                >
                  <PlayIcon /> {t('batches.start')}
                </Button>
              ) : b.status === 'IN_PROGRESS' && onComplete ? (
                <Button
                  size="sm"
                  className="pointer-coarse:min-h-11"
                  onClick={(e) => {
                    e.stopPropagation();
                    onComplete(b);
                  }}
                  aria-label={t('batches.outputFor', { number: b.number, name: b.productName })}
                >
                  <PackageCheckIcon /> {t('batches.recordOutput')}
                </Button>
              ) : null,
          },
        ]
      : []),
  ];
  return (
    <DataTable
      caption={caption}
      columns={all.filter((c) => !hide.includes(c.id))}
      rows={rows}
      getRowId={(b) => b.id}
      getRowLabel={(b) => `${b.number} ${b.productName}`}
      loading={loading ?? false}
      onRowClick={(b) => navigate(`/production/batches/${b.id}`)}
      error={error}
      empty={empty}
      toolbar={toolbar}
    />
  );
}
