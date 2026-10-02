import type { RestaurantTable } from '@rbp/types';
import { Button, Card, EmptyState, PageHeader, Skeleton, StatCard } from '@rbp/ui';
import { ArmchairIcon, MonitorIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useTables } from '../api/queries';
import { TableGrid } from '../components/table-grid';

/**
 * REST-001 Tables (floor grid by area). A free table starts a dine-in order on the POS;
 * an occupied one opens its order there.
 */
export function TablesPage() {
  const { t } = useTranslation('pos');
  const navigate = useNavigate();
  const { can } = useAccess();
  const tables = useTables();
  const canSell = can('pos.sale.create');
  const count = (status: RestaurantTable['status']) =>
    tables.data?.filter((tb) => tb.status === status).length ?? 0;

  const open = (tb: RestaurantTable) => {
    if (tb.order) navigate(`/pos?order=${encodeURIComponent(tb.order.id)}`);
    else navigate(`/pos?${new URLSearchParams({ table: tb.id, name: tb.name })}`);
  };

  return (
    <Screen id="REST-001" title={t('tables.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('tables.title')}
        description={t('tables.pageHint')}
        actions={
          canSell && (
            <Button asChild variant="outline">
              <Link to="/pos">
                <MonitorIcon /> {t('tables.toPos')}
              </Link>
            </Button>
          )
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('tables.FREE')} value={String(count('FREE'))} />
        <StatCard label={t('tables.OCCUPIED')} value={String(count('OCCUPIED'))} />
        <StatCard label={t('tables.BILLING')} value={String(count('BILLING'))} />
      </div>
      <Card className="p-4">
        {tables.isError ? (
          <QueryError error={tables.error} onRetry={() => tables.refetch()} />
        ) : !tables.data ? (
          <Skeleton className="h-64" />
        ) : !tables.data.length ? (
          <EmptyState icon={ArmchairIcon} title={t('tables.none')} />
        ) : (
          <TableGrid tables={tables.data} onSelect={open} isDisabled={() => !canSell} />
        )}
      </Card>
    </Screen>
  );
}
