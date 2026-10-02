import type { StockLevel } from '@rbp/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageSkeleton,
} from '@rbp/ui';
import { cn } from '@rbp/utils';
import { ArrowRightLeftIcon, PencilIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useInventoryItem } from '../api/queries';
import { AdjustmentDialog } from '../components/adjustment-dialog';
import { MinStockDialog } from '../components/min-stock-dialog';
import { MovementTable } from '../components/movement-table';
import { StockStatusBadge } from '../components/stock-status-badge';
import { TransferDialog } from '../components/transfer-dialog';
import { useMyLocations } from '../lib/use-locations';

/** INV-002 Stock item detail: every location, minimum levels, recent movements. */
export function StockItemPage() {
  const { productId } = useParams();
  const [params] = useSearchParams();
  const focus = params.get('location');
  const { t } = useTranslation('inventory');
  const { can } = useAccess();
  const { nameOf } = useMyLocations();
  const item = useInventoryItem(productId);
  useBreadcrumbTitle(item.data?.name);
  const [adjusting, setAdjusting] = useState<StockLevel | null>(null);
  const [minFor, setMinFor] = useState<StockLevel | null>(null);
  const [sending, setSending] = useState<StockLevel | null>(null);

  if (item.isError) return <QueryError error={item.error} onRetry={() => item.refetch()} />;
  if (!item.data) return <PageSkeleton />;
  const d = item.data;
  const unit = (n: number) => t(`unit.${d.unit}`, { count: n });

  return (
    <Screen id="INV-002" title={d.name} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={d.name}
        description={t('item.hint', { code: d.code, unit: t(`unit.${d.unit}`, { count: 2 }) })}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {d.levels.map((l) => (
          <Card
            key={l.locationId}
            aria-label={nameOf(l.locationId)}
            className={cn('gap-3 p-4', l.locationId === focus && 'ring-2 ring-primary/40')}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{nameOf(l.locationId)}</h2>
              <StockStatusBadge status={l.status} />
            </div>
            <p className="text-3xl font-bold tabular">
              {l.onHand}{' '}
              <span className="text-base font-normal text-muted-foreground">{unit(l.onHand)}</span>
            </p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {l.minStock ? t('item.min', { count: l.minStock }) : t('item.noMin')}
              {can('inventory.adjust') && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 pointer-coarse:size-11"
                  onClick={() => setMinFor(l)}
                  aria-label={t('min.edit', { location: nameOf(l.locationId) })}
                >
                  <PencilIcon />
                </Button>
              )}
            </p>
            <div className="mt-auto flex flex-wrap gap-2">
              {can('inventory.adjust') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAdjusting(l)}
                  aria-label={t('item.adjustAt', { location: nameOf(l.locationId) })}
                >
                  <SlidersHorizontalIcon /> {t('item.adjust')}
                </Button>
              )}
              {can('inventory.transfer') && l.onHand > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSending(l)}
                  aria-label={t('item.sendFrom', { location: nameOf(l.locationId) })}
                >
                  <ArrowRightLeftIcon /> {t('item.send')}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-0">
        <CardHeader className="flex-row items-center justify-between px-4 pt-4">
          <CardTitle>{t('item.recent')}</CardTitle>
          <Button asChild variant="link" className="h-auto px-0">
            <Link to={`/inventory/movements?item=${encodeURIComponent(d.productId)}`}>
              {t('item.allMovements')}
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <MovementTable rows={d.recent} showItem={false} caption={t('item.recent')} />
        </CardContent>
      </Card>
      <AdjustmentDialog
        open={!!adjusting}
        onOpenChange={(o) => !o && setAdjusting(null)}
        item={adjusting}
      />
      <MinStockDialog level={minFor} onOpenChange={(o) => !o && setMinFor(null)} />
      <TransferDialog
        open={!!sending}
        onOpenChange={(o) => !o && setSending(null)}
        {...(sending ? { initial: { fromLocationId: sending.locationId, items: [sending] } } : {})}
      />
    </Screen>
  );
}
