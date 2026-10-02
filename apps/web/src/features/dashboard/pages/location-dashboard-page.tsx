import {
  Button,
  Card,
  CardGridSkeleton,
  EmptyState,
  MoneyText,
  PageHeader,
  Skeleton,
  StatCard,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { MapPinIcon, PackageXIcon, ReceiptIcon, TrendingUpIcon, WalletIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useMe, useSwitchLocation } from '@/features/auth/api/queries';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useLocationDashboard } from '../api/queries';
import { LocationCard } from '../components/location-card';

/** DASH-002 Location Dashboard: today at every location the user can see. */
export function LocationDashboardPage() {
  const { t, i18n } = useTranslation('dashboard');
  const { data: me } = useMe();
  const { check, hasFeature } = useAccess();
  const board = useLocationDashboard();
  const switchLocation = useSwitchLocation();
  const navigate = useNavigate();
  const locale = localeFor(i18n.language);
  const lowStock = check({ feature: 'INVENTORY', permission: 'inventory.view' }).allowed;

  const open = (locationId: string) => {
    if (locationId !== me?.currentLocation?.id) switchLocation(locationId);
    void navigate('/');
  };

  return (
    <Screen id="DASH-002" title={t('locationDashboard.title')} className="space-y-section">
      <PageHeader
        title={t('locationDashboard.title')}
        description={
          board.data
            ? `${t('locationDashboard.subtitle', { count: board.data.locations.length })} · ${t(
                'asOf',
                {
                  time: formatDateTime(board.data.asOf, { locale, timeZone: me?.tenant.timezone }),
                },
              )}`
            : t('locationDashboard.subtitle', { count: me?.locations.length ?? 0 })
        }
        actions={
          <Button variant="outline" asChild>
            <Link to="/">{t('locationDashboard.back')}</Link>
          </Button>
        }
      />

      {board.isError ? (
        <Card>
          <QueryError error={board.error} onRetry={() => void board.refetch()} />
        </Card>
      ) : !board.data ? (
        <>
          <CardGridSkeleton />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </>
      ) : board.data.locations.length === 0 ? (
        <Card>
          <EmptyState icon={MapPinIcon} title={t('locationDashboard.empty')} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('salesToday')}
              icon={WalletIcon}
              value={<MoneyText value={board.data.totals.salesToday} locale={locale} />}
            />
            <StatCard
              label={t('ordersToday')}
              icon={ReceiptIcon}
              value={board.data.totals.ordersToday}
            />
            <StatCard
              label={t('averageOrder')}
              icon={TrendingUpIcon}
              value={<MoneyText value={board.data.totals.averageOrderValue} locale={locale} />}
            />
            {lowStock && (
              <StatCard
                label={t('lowStock')}
                icon={PackageXIcon}
                value={board.data.totals.lowStockItems}
              />
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {board.data.locations.map((row) => (
              <LocationCard
                key={row.location.id}
                row={row}
                locale={locale}
                current={row.location.id === me?.currentLocation?.id}
                tables={hasFeature('TABLE_MANAGEMENT')}
                kot={hasFeature('KOT')}
                lowStock={lowStock}
                onOpen={() => open(row.location.id)}
              />
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}
