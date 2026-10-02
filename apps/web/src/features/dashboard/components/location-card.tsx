import type { LocationDashboardRow } from '@rbp/types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, MoneyText } from '@rbp/ui';
import { ArrowRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HourlySalesChart } from './hourly-sales-chart';

interface Props {
  row: LocationDashboardRow;
  locale: string;
  current: boolean;
  /** Restaurant tiles also need the tenant to run tables / KOT. */
  tables: boolean;
  kot: boolean;
  lowStock: boolean;
  onOpen: () => void;
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/** One location on DASH-002: today's takings, live counts and the hourly curve. */
export function LocationCard({ row, locale, current, tables, kot, lowStock, onOpen }: Props) {
  const { t } = useTranslation('dashboard');
  const { location } = row;
  const restaurant = location.type === 'RESTAURANT' || location.type === 'MIXED';

  return (
    <Card aria-label={location.name} role="region">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate">{location.name}</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{t(`locationDashboard.types.${location.type}`)}</Badge>
            {current && <Badge>{t('locationDashboard.current')}</Badge>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onOpen}>
          {t('locationDashboard.open')} <ArrowRightIcon />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-3 gap-3">
          <Figure label={t('salesToday')}>
            <MoneyText value={row.salesToday} locale={locale} />
          </Figure>
          <Figure label={t('ordersToday')}>{row.ordersToday}</Figure>
          <Figure label={t('averageOrder')}>
            <MoneyText value={row.averageOrderValue} locale={locale} />
          </Figure>
          {restaurant && tables && <Figure label={t('openTables')}>{row.openTables}</Figure>}
          {restaurant && kot && <Figure label={t('pendingKots')}>{row.pendingKots}</Figure>}
          {lowStock && <Figure label={t('lowStock')}>{row.lowStockItems}</Figure>}
        </dl>
        <HourlySalesChart
          compact
          data={row.hourlySales}
          currency={row.salesToday.currency}
          locale={locale}
          emptyLabel={t('noSales')}
        />
      </CardContent>
    </Card>
  );
}
