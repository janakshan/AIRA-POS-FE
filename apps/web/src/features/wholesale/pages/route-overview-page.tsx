import type { WholesaleShop } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardGridSkeleton,
  EmptyState,
  Input,
  MoneyText,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
  StatusBadge,
} from '@rbp/ui';
import { cn, formatMoney } from '@rbp/utils';
import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  HandCoinsIcon,
  MapIcon,
  ReceiptIcon,
  ShoppingCartIcon,
  Undo2Icon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { formatPlainDate } from '@/features/purchasing/lib/status';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useRouteOverview, useWholesaleRoutes } from '../api/queries';
import { CollectionDialog } from '../components/collection-dialog';
import { useCanSell } from '../hooks/use-can-sell';
import { localDay } from '../lib/format';

/**
 * WHO-006 Route overview: a route's stops for a day in visiting order — visited or not,
 * what was sold, collected and taken back — plus what's left on the van.
 */
export function RouteOverviewPage() {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const { can, hasFeature } = useAccess();
  const list = useListParams({ filterKeys: ['route', 'date'] });
  const routes = useWholesaleRoutes();
  const ids = { route: useId(), date: useId() };
  const date = list.filters.date ?? localDay();
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay();
  const todays = routes.data?.find((r) => r.days.includes(weekday)) ?? routes.data?.[0];
  const routeId = list.filters.route ?? todays?.id ?? '';
  const overview = useRouteOverview(routeId, date);
  const [collecting, setCollecting] = useState<WholesaleShop | null>(null);
  const o = overview.data;
  const canTransfer = hasFeature('INVENTORY') && can('inventory.transfer');
  // Selling needs this route's van; managers without it still see the route and collect.
  const canSell = useCanSell().from(o?.route.vanLocationId);

  return (
    <Screen id="WHO-006" title={t('routes.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('routes.title')}
        description={o ? `${o.route.name} · ${o.route.repName}` : t('routes.hint')}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor={ids.route} className="text-sm font-medium">
            {t('fields.route')}
          </label>
          <Select value={routeId} onValueChange={(v) => list.setFilter('route', v)}>
            <SelectTrigger id={ids.route} className="w-full sm:w-64">
              <SelectValue placeholder={t('fields.route')} />
            </SelectTrigger>
            <SelectContent>
              {routes.data?.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.date} className="text-sm font-medium">
            {t('fields.date')}
          </label>
          <Input
            id={ids.date}
            type="date"
            value={date}
            className="w-full sm:w-44"
            onChange={(e) => list.setFilter('date', e.target.value || null)}
          />
        </div>
      </div>

      {overview.isError ? (
        <QueryError error={overview.error} onRetry={() => overview.refetch()} />
      ) : !o ? (
        <CardGridSkeleton />
      ) : (
        <>
          {!o.scheduled && (
            <Alert
              tone="info"
              title={t('routes.notScheduled', { date: formatPlainDate(date, locale) })}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('routes.visited')}
              icon={MapIcon}
              value={`${o.totals.visited} / ${o.stops.length}`}
            />
            <StatCard
              label={t('routes.sales')}
              icon={ReceiptIcon}
              value={<MoneyText value={o.totals.sales} locale={locale} />}
              hint={
                <>
                  {t('routes.creditGiven')}{' '}
                  <MoneyText value={o.totals.creditGiven} locale={locale} />
                </>
              }
            />
            <StatCard
              label={t('routes.cash')}
              icon={BanknoteIcon}
              value={
                <MoneyText
                  value={{
                    amount: o.totals.cashAtSale.amount + o.totals.collected.amount,
                    currency: o.totals.collected.currency,
                  }}
                  locale={locale}
                />
              }
              hint={
                <>
                  {t('routes.collected')} <MoneyText value={o.totals.collected} locale={locale} />
                </>
              }
            />
            <StatCard
              label={t('routes.returns')}
              icon={Undo2Icon}
              value={<MoneyText value={o.totals.returns} locale={locale} />}
            />
          </div>

          <div className="grid items-start gap-section lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="space-y-3" aria-labelledby="route-stops">
              <h2 id="route-stops" className="text-lg font-semibold">
                {t('routes.stops', { date: formatPlainDate(date, locale) })}
              </h2>
              {!o.stops.length ? (
                <EmptyState icon={MapIcon} title={t('routes.noStops')} />
              ) : (
                <ol className="space-y-2">
                  {o.stops.map((s) => (
                    <li key={s.shop.id}>
                      <Card
                        className={cn(
                          'flex flex-row flex-wrap items-center gap-3 p-3',
                          s.visited && 'border-status-success/40',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                            s.visited ? 'bg-status-success/15 text-status-success-fg' : 'bg-muted',
                          )}
                          aria-hidden
                        >
                          {s.shop.stopOrder}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 font-medium">
                            <Link
                              to={`/customers/external-shops/${s.shop.id}`}
                              className="inline-flex items-center underline-offset-2 hover:underline pointer-coarse:min-h-11"
                            >
                              {s.shop.name}
                            </Link>
                            {s.visited ? (
                              <StatusBadge tone="success" size="sm">
                                {t('routes.done')}
                              </StatusBadge>
                            ) : (
                              <StatusBadge tone="neutral" size="sm">
                                {t('routes.toVisit')}
                              </StatusBadge>
                            )}
                            {s.shop.overLimit && (
                              <StatusBadge tone="danger" size="sm">
                                {t('shops.overLimit')}
                              </StatusBadge>
                            )}
                            {!s.shop.overLimit && s.shop.overdue.amount > 0 && (
                              <StatusBadge tone="warning" size="sm">
                                {t('shops.overdue')}
                              </StatusBadge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t('sale.owes')}{' '}
                            <MoneyText value={s.shop.outstanding} locale={locale} />
                            {s.visited &&
                              ` · ${t('routes.stopSummary', {
                                sales: formatMoney(s.sales, locale),
                                collected: formatMoney(s.collected, locale),
                              })}`}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {canSell && (
                            <Button asChild size="sm" className="pointer-coarse:min-h-11">
                              <Link
                                to={`/wholesale/field-sales?${new URLSearchParams({ shop: s.shop.id })}`}
                                aria-label={t('routes.sellTo', { name: s.shop.name })}
                              >
                                <ShoppingCartIcon /> {t('routes.sell')}
                              </Link>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="pointer-coarse:min-h-11"
                            disabled={s.shop.outstanding.amount <= 0}
                            onClick={() => setCollecting(s.shop)}
                            aria-label={t('routes.collectFrom', { name: s.shop.name })}
                          >
                            <HandCoinsIcon /> {t('routes.collect')}
                          </Button>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <Card>
              <CardHeader>
                <CardTitle>{t('routes.van', { name: o.van.name })}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="divide-y text-sm" aria-label={t('routes.van', { name: o.van.name })}>
                  {o.van.items.map((i) => (
                    <li key={i.productId} className="flex justify-between gap-2 py-1.5">
                      <span>{i.name}</span>
                      <span
                        className={cn(
                          'font-semibold tabular',
                          i.onHand === 0 && 'text-status-danger-fg',
                        )}
                      >
                        {i.onHand}
                      </span>
                    </li>
                  ))}
                </ul>
                {canTransfer && (
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/inventory/transfers">
                      <ArrowLeftRightIcon /> {t('routes.loadVan')}
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <CollectionDialog shop={collecting} onOpenChange={(open) => !open && setCollecting(null)} />
    </Screen>
  );
}
