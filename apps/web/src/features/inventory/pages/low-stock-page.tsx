import type { StockLevel } from '@rbp/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@rbp/ui';
import { CheckCircle2Icon, PencilIcon, SlidersHorizontalIcon, TruckIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { useAccess } from '@/features/auth/hooks/use-access';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { toast } from '@rbp/ui';
import { useLowStock } from '../api/queries';
import { AdjustmentDialog } from '../components/adjustment-dialog';
import { MinStockDialog } from '../components/min-stock-dialog';
import { StockStatusBadge } from '../components/stock-status-badge';
import { type TransferPrefill, TransferDialog } from '../components/transfer-dialog';
import { useMyLocations } from '../lib/use-locations';

/** INV-006 Low stock: items at or below their minimum (REQ §20), and what to do about it. */
export function LowStockPage() {
  const { t } = useTranslation('inventory');
  const { can } = useAccess();
  const errorMessage = useErrorMessage();
  const { locations, nameOf } = useMyLocations();
  const low = useLowStock();
  const [adjusting, setAdjusting] = useState<StockLevel | null>(null);
  const [minFor, setMinFor] = useState<StockLevel | null>(null);
  const [transfer, setTransfer] = useState<TransferPrefill | null>(null);

  const byLocation = locations
    .map((l) => ({ location: l, rows: (low.data ?? []).filter((r) => r.locationId === l.id) }))
    .filter((g) => g.rows.length);

  /** Prefill a transfer from the location holding the most of it. */
  const transferIn = async (row: StockLevel) => {
    try {
      const item = await api.inventory.get(row.productId);
      const source = item.levels
        .filter((l) => l.locationId !== row.locationId && l.onHand > 0)
        .sort((a, b) => b.onHand - a.onHand)[0];
      if (!source) {
        toast.warning(t('low.noSource', { name: row.name }));
        return;
      }
      setTransfer({
        fromLocationId: source.locationId,
        toLocationId: row.locationId,
        items: [source],
        quantities: { [row.productId]: Math.max(1, row.minStock * 2 - row.onHand) },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Screen id="INV-006" title={t('low.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('low.title')}
        description={t('low.hint')}
      />
      {low.isError ? (
        <QueryError error={low.error} onRetry={() => low.refetch()} />
      ) : !low.data ? (
        <Skeleton className="h-48" />
      ) : !byLocation.length ? (
        <Card>
          <EmptyState
            icon={CheckCircle2Icon}
            title={t('low.none')}
            description={t('low.noneHint')}
          />
        </Card>
      ) : (
        byLocation.map(({ location, rows }) => (
          <Card key={location.id} className="p-0">
            <CardHeader className="px-4 pt-4">
              <CardTitle>
                {location.name} · {t('low.count', { count: rows.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul
                className="divide-y border-t"
                aria-label={t('low.at', { location: location.name })}
              >
                {rows.map((r) => (
                  <li key={r.productId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/inventory/stock/${r.productId}?location=${r.locationId}`}
                          className="inline-flex items-center font-medium hover:underline pointer-coarse:min-h-11"
                        >
                          {r.name}
                        </Link>
                        <StockStatusBadge status={r.status} />
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('low.line', {
                          onHand: r.onHand,
                          min: r.minStock,
                          unit: t(`unit.${r.unit}`, { count: r.onHand }),
                        })}
                        {r.minStock > r.onHand &&
                          ` · ${t('low.shortBy', { count: r.minStock - r.onHand })}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {can('inventory.transfer') && (
                        <Button
                          size="sm"
                          onClick={() => void transferIn(r)}
                          aria-label={t('low.transferIn', {
                            name: r.name,
                            location: nameOf(r.locationId),
                          })}
                        >
                          <TruckIcon /> {t('low.transfer')}
                        </Button>
                      )}
                      {can('inventory.adjust') && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAdjusting(r)}
                            aria-label={t('low.adjustFor', { name: r.name })}
                          >
                            <SlidersHorizontalIcon /> {t('item.adjust')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setMinFor(r)}
                            aria-label={t('min.editFor', { name: r.name })}
                          >
                            <PencilIcon /> {t('low.setMin')}
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
      <AdjustmentDialog
        open={!!adjusting}
        onOpenChange={(o) => !o && setAdjusting(null)}
        item={adjusting}
      />
      <MinStockDialog level={minFor} onOpenChange={(o) => !o && setMinFor(null)} />
      <TransferDialog
        open={!!transfer}
        onOpenChange={(o) => !o && setTransfer(null)}
        {...(transfer ? { initial: transfer } : {})}
      />
    </Screen>
  );
}
