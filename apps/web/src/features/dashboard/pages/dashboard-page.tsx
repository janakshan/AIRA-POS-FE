import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardGridSkeleton,
  MoneyText,
  PageHeader,
  Skeleton,
  StatCard,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import {
  ArmchairIcon,
  ChefHatIcon,
  MapPinnedIcon,
  PackageXIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
  WalletIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useMe } from '@/features/auth/api/queries';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useEmployeeVerification } from '@/features/auth/hooks/use-employee-verification';
import { isRestaurantPos } from '@/features/pos/lib/pos-mode';
import { LOCATION_DASHBOARD_ITEM } from '@/navigation/nav-config';
import { useDashboardSummary } from '../api/queries';
import { useShowLocationDashboard } from '../hooks/use-show-location-dashboard';
import { HourlySalesChart } from '../components/hourly-sales-chart';

/** DASH-001 Main Dashboard */
export function DashboardPage() {
  const { t, i18n } = useTranslation('dashboard');
  const { data: me } = useMe();
  const { check, hasFeature } = useAccess();
  const summary = useDashboardSummary();
  const verify = useEmployeeVerification();
  const locale = localeFor(i18n.language);

  // Restaurant-only shortcuts and tiles follow the location: a store or a van has no counter,
  // tables or kitchen.
  const type = me?.currentLocation?.type;
  const counter = type !== 'WAREHOUSE' && type !== 'VAN';
  const restaurant = type === 'RESTAURANT' || type === 'MIXED';
  const canPos = counter && check({ feature: 'POS_RETAIL', permission: 'pos.sale.create' }).allowed;
  const canKitchen = restaurant && check({ feature: 'KOT', permission: 'kot.view' }).allowed;
  const showLocations = useShowLocationDashboard();

  return (
    <Screen id="DASH-001" title={t('title')} className="space-y-section">
      <PageHeader
        title={t('title')}
        description={t('subtitle', { location: me?.currentLocation?.name })}
        actions={
          <>
            {showLocations && (
              <Button variant="outline" asChild>
                <Link to={LOCATION_DASHBOARD_ITEM.path}>
                  <MapPinnedIcon /> {t('allLocations')}
                </Link>
              </Button>
            )}
            {canKitchen && (
              <Button variant="outline" asChild>
                <Link to="/kitchen">
                  <ChefHatIcon /> {t('openKitchen')}
                </Link>
              </Button>
            )}
            {canPos && (
              <Button asChild>
                <Link to="/pos">
                  <ShoppingCartIcon /> {t(isRestaurantPos(me) ? 'openRestaurantPos' : 'openPos')}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {summary.isError ? (
        <Card>
          <QueryError error={summary.error} onRetry={() => void summary.refetch()} />
        </Card>
      ) : !summary.data ? (
        <>
          <CardGridSkeleton />
          <Skeleton className="h-72 rounded-xl" />
        </>
      ) : (
        <>
          {summary.data.lowStockItems > 0 &&
            check({ feature: 'INVENTORY', permission: 'inventory.view' }).allowed && (
              <Alert
                tone="warning"
                title={t('lowStockAlert', {
                  count: summary.data.lowStockItems,
                  location: me?.currentLocation?.name ?? '',
                })}
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/inventory/low-stock">{t('viewLowStock')}</Link>
                  </Button>
                }
              />
            )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('salesToday')}
              icon={WalletIcon}
              value={<MoneyText value={summary.data.salesToday} locale={locale} />}
            />
            <StatCard
              label={t('ordersToday')}
              icon={ReceiptIcon}
              value={summary.data.ordersToday}
            />
            <StatCard
              label={t('averageOrder')}
              icon={TrendingUpIcon}
              value={<MoneyText value={summary.data.averageOrderValue} locale={locale} />}
            />
            {restaurant && hasFeature('TABLE_MANAGEMENT') ? (
              <StatCard
                label={t('openTables')}
                icon={ArmchairIcon}
                value={summary.data.openTables}
                hint={
                  hasFeature('KOT') ? `${t('pendingKots')}: ${summary.data.pendingKots}` : undefined
                }
              />
            ) : (
              <StatCard
                label={t('lowStock')}
                icon={PackageXIcon}
                value={summary.data.lowStockItems}
              />
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t('hourlySales')}</CardTitle>
                <CardDescription>
                  {t('hourlySalesHint')} ·{' '}
                  {t('asOf', {
                    time: formatDateTime(summary.data.asOf, {
                      locale,
                      timeZone: me?.tenant.timezone,
                    }),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HourlySalesChart
                  data={summary.data.hourlySales}
                  currency={summary.data.salesToday.currency}
                  locale={locale}
                  emptyLabel={t('noSales')}
                />
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('verifyEmployee')}</CardTitle>
                  <CardDescription>{t('verifyHint')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => void verify('pos.discount.apply')}
                  >
                    <ShieldCheckIcon /> {t('verifyEmployee')}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('yourAccess')}</CardTitle>
                  <CardDescription>
                    {t('role')}: {me?.roles.map((r) => r.name).join(', ')} ·{' '}
                    {t('permissions', { count: me?.permissions.length ?? 0 })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{t('enabledModules')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {me?.features.map((f) => (
                      <Badge key={f} variant="secondary">
                        {t(`common:features.${f}`)}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </Screen>
  );
}
