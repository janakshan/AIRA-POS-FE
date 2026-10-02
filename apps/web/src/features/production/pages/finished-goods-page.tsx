import type { FinishedGoodsItem } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  PageHeader,
  StatCard,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { ArrowLeftRightIcon, CakeSliceIcon, PackageXIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { StockStatusBadge } from '@/features/inventory/components/stock-status-badge';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useFinishedGoods } from '../api/queries';
import { WastageDialog } from '../components/wastage-dialog';
import { useProductionLocation } from '../lib/location';

/**
 * BAK-004 Finished goods: bakery products on hand where they're baked — what came out today,
 * what was wasted, and the way on to the shops (INV-005 transfer) or the bin (write-off).
 */
export function FinishedGoodsPage() {
  const { t, i18n } = useTranslation('production');
  const locale = localeFor(i18n.language);
  const { hasFeature } = useAccess();
  const { locationId, locationName, setLocation } = useProductionLocation();
  const goods = useFinishedGoods(locationId);
  const [writingOff, setWritingOff] = useState<FinishedGoodsItem | null>(null);
  const rows = goods.data;
  const sum = (f: (g: FinishedGoodsItem) => number) => rows?.reduce((s, g) => s + f(g), 0) ?? 0;

  const columns: DataTableColumn<FinishedGoodsItem>[] = [
    {
      id: 'item',
      header: t('fields.product'),
      primary: true,
      cell: (g) => (
        <span>
          <span className="font-medium">{g.name}</span>
          <span className="block font-mono text-xs text-muted-foreground">{g.code}</span>
        </span>
      ),
    },
    {
      id: 'onHand',
      header: t('fields.onHand'),
      align: 'right',
      width: 'w-28',
      cell: (g) => (
        <span className="font-semibold tabular">
          {g.onHand}
          {g.minStock > 0 && (
            <span className="block text-xs font-normal text-muted-foreground">
              {t('goods.min', { count: g.minStock })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('fields.status'),
      width: 'w-28',
      cell: (g) => <StockStatusBadge status={g.status} />,
    },
    {
      id: 'produced',
      header: t('goods.producedToday'),
      align: 'right',
      width: 'w-28',
      cell: (g) => <span className="tabular">{g.producedToday}</span>,
    },
    {
      id: 'wasted',
      header: t('goods.wastedToday'),
      align: 'right',
      width: 'w-28',
      cell: (g) =>
        g.wastedToday ? (
          <span className="text-status-danger-fg tabular">{g.wastedToday}</span>
        ) : (
          <span className="text-muted-foreground tabular">0</span>
        ),
    },
    {
      id: 'last',
      header: t('goods.lastBatch'),
      hideOnTablet: true,
      cell: (g) =>
        g.lastBatch ? (
          <span className="text-sm">
            <Link
              to={`/production/batches/${g.lastBatch.id}`}
              className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              {g.lastBatch.number}
            </Link>
            <span className="block text-xs text-muted-foreground">
              {t('goods.lastBatchHint', {
                count: g.lastBatch.goodQuantity,
                at: formatDateTime(g.lastBatch.completedAt, { locale }),
              })}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (g) => (
        <span className="flex flex-wrap justify-end gap-2">
          {hasFeature('INVENTORY') && (
            <Button asChild variant="ghost" size="sm" className="pointer-coarse:min-h-11">
              <Link
                to={`/inventory/stock/${g.productId}?${new URLSearchParams({ location: g.locationId })}`}
                aria-label={t('goods.stockFor', { name: g.name })}
              >
                <ArrowLeftRightIcon /> {t('goods.stock')}
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="pointer-coarse:min-h-11"
            disabled={g.onHand <= 0}
            onClick={() => setWritingOff(g)}
            aria-label={t('goods.writeOffFor', { name: g.name })}
          >
            <Trash2Icon /> {t('goods.writeOff')}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <Screen id="BAK-004" title={t('goods.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('goods.title')}
        description={t('goods.hint', { location: locationName })}
      />
      <LocationSelect
        value={locationId}
        onChange={setLocation}
        types={['BAKERY']}
        label={t('fields.location')}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t('goods.onHandTotal')}
          icon={CakeSliceIcon}
          value={sum((g) => g.onHand)}
        />
        <StatCard
          label={t('goods.producedToday')}
          icon={CakeSliceIcon}
          value={sum((g) => g.producedToday)}
        />
        <StatCard
          label={t('goods.lowCount')}
          icon={PackageXIcon}
          value={rows?.filter((g) => g.status !== 'OK').length ?? 0}
        />
      </div>
      <Card className="p-0">
        <DataTable
          caption={t('goods.caption')}
          columns={columns}
          rows={rows}
          getRowId={(g) => g.productId}
          getRowLabel={(g) => g.name}
          loading={goods.isPending}
          error={
            goods.isError ? (
              <QueryError error={goods.error} onRetry={() => goods.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={CakeSliceIcon} title={t('goods.empty')} />}
        />
      </Card>
      <WastageDialog item={writingOff} onOpenChange={(o) => !o && setWritingOff(null)} />
    </Screen>
  );
}
