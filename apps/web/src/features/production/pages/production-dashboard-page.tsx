import type { ProductionBatch } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardGridSkeleton,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
} from '@rbp/ui';
import {
  ArrowRightIcon,
  CakeSliceIcon,
  ClipboardListIcon,
  FlameIcon,
  PackageXIcon,
  PlusIcon,
  ShoppingBagIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { formatPlainDate } from '@/features/purchasing/lib/status';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useProductionBatches, useProductionSummary } from '../api/queries';
import { BatchTable } from '../components/batch-table';
import { RecordOutputDialog } from '../components/record-output-dialog';
import { StartBatchDialog } from '../components/start-batch-dialog';
import { useProductionLocation } from '../lib/location';
import { localDay, percent } from '../lib/status';

const FLOW = ['plan', 'start', 'consume', 'output', 'wastage', 'stock'] as const;

/** BAK-001 Production dashboard: today's plan vs output, batches, shortages and wastage. */
export function ProductionDashboardPage() {
  const { t, i18n } = useTranslation('production');
  const locale = localeFor(i18n.language);
  const { can, hasFeature } = useAccess();
  const { locationId, locationName, setLocation } = useProductionLocation();
  const summary = useProductionSummary(locationId);
  const today = localDay();
  const batches = useProductionBatches({ locationId, date: today });
  const [starting, setStarting] = useState<ProductionBatch | null>(null);
  const [completing, setCompleting] = useState<ProductionBatch | null>(null);
  const canOrder = hasFeature('PURCHASING') && can('purchasing.manage');
  const s = summary.data;
  const orderHref = s
    ? `/purchasing/orders/new?${new URLSearchParams({
        location: locationId,
        lines: s.shortages.map((x) => `${x.ingredientId}:${x.needed - x.onHand}`).join(','),
      })}`
    : '';

  return (
    <Screen id="BAK-001" title={t('dashboard.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('dashboard.title')}
        description={t('dashboard.hint', { location: locationName })}
        actions={
          <Button asChild>
            <Link to={`/production/plan/new?${new URLSearchParams({ location: locationId })}`}>
              <PlusIcon /> {t('plans.new')}
            </Link>
          </Button>
        }
      />
      <LocationSelect
        value={locationId}
        onChange={setLocation}
        types={['BAKERY']}
        label={t('fields.location')}
      />

      <Card className="p-4">
        <p className="mb-2 text-sm font-medium">{t('dashboard.flowTitle')}</p>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {FLOW.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              {i > 0 && <ArrowRightIcon className="size-3.5" aria-hidden />}
              {t(`dashboard.flow.${step}`)}
            </li>
          ))}
        </ol>
      </Card>

      {summary.isError ? (
        <QueryError error={summary.error} onRetry={() => summary.refetch()} />
      ) : !s ? (
        <CardGridSkeleton />
      ) : (
        <>
          {s.shortages.length > 0 && (
            <Alert
              tone="warning"
              title={t('dashboard.shortageTitle', { count: s.shortages.length })}
              action={
                canOrder ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to={orderHref}>
                      <ShoppingBagIcon /> {t('dashboard.orderShort')}
                    </Link>
                  </Button>
                ) : undefined
              }
            >
              {s.shortages
                .map((x) =>
                  t('dashboard.shortageLine', {
                    name: x.name,
                    needed: x.needed,
                    onHand: x.onHand,
                    unit: t(`inventory:unit.${x.unit}`, { count: x.needed }),
                  }),
                )
                .join(' · ')}
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('dashboard.producedToday')}
              icon={CakeSliceIcon}
              value={`${s.produced} / ${s.planned}`}
              hint={t('dashboard.producedHint')}
            />
            <StatCard
              label={t('dashboard.batchesToday')}
              icon={FlameIcon}
              value={s.batches.IN_PROGRESS}
              hint={t('dashboard.batchesHint', {
                planned: s.batches.PLANNED,
                done: s.batches.COMPLETED,
              })}
            />
            <StatCard
              label={t('dashboard.wastage7d')}
              icon={Trash2Icon}
              value={percent(s.wastageBps)}
              hint={t('dashboard.wastageHint', {
                wasted: s.wastageUnits7d,
                produced: s.producedUnits7d,
              })}
            />
            <StatCard
              label={t('dashboard.lowGoods')}
              icon={PackageXIcon}
              value={s.lowFinishedGoods}
              hint={
                <Link
                  to={`/production/finished-goods?${new URLSearchParams({ location: locationId })}`}
                  className="inline-flex items-center underline-offset-2 hover:underline pointer-coarse:min-h-11"
                >
                  {t('dashboard.viewGoods')}
                </Link>
              }
            />
          </div>
        </>
      )}

      <section className="space-y-3" aria-labelledby="bak-today">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="bak-today" className="text-lg font-semibold">
            {t('dashboard.todayBatches', { date: formatPlainDate(today, locale) })}
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/production/batches?${new URLSearchParams({ location: locationId })}`}>
              {t('dashboard.allBatches')} <ArrowRightIcon />
            </Link>
          </Button>
        </div>
        <Card className="p-0">
          <BatchTable
            caption={t('dashboard.todayBatches', { date: formatPlainDate(today, locale) })}
            rows={batches.data}
            loading={batches.isPending}
            hide={['date']}
            error={
              batches.isError ? (
                <QueryError error={batches.error} onRetry={() => batches.refetch()} />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={ClipboardListIcon}
                title={t('dashboard.noBatches')}
                description={t('dashboard.noBatchesHint')}
              />
            }
            onStart={setStarting}
            onComplete={setCompleting}
          />
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.trend')}</CardTitle>
          <CardDescription>{t('dashboard.trendHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!s ? (
            <Skeleton className="h-40" />
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">{t('dashboard.trend')}</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th scope="col" className="py-2 font-medium">
                    {t('fields.date')}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {t('dashboard.produced')}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {t('dashboard.wasted')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.trend.map((d) => (
                  <tr key={d.date} className="border-b last:border-0">
                    <th scope="row" className="py-2 text-left font-medium">
                      {formatPlainDate(d.date, locale)}
                    </th>
                    <td className="py-2 text-right tabular">{d.produced}</td>
                    <td className="py-2 text-right tabular">
                      {d.wasted ? (
                        <span className="text-status-danger-fg">{d.wasted}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <StartBatchDialog batch={starting} onOpenChange={(o) => !o && setStarting(null)} />
      <RecordOutputDialog batch={completing} onOpenChange={(o) => !o && setCompleting(null)} />
    </Screen>
  );
}
