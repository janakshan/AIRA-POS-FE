import type { ProductionPlan } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  FilterChip,
  PageHeader,
} from '@rbp/ui';
import { ClipboardListIcon, PlusIcon, SearchXIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { formatPlainDate } from '@/features/purchasing/lib/status';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useProductionPlans } from '../api/queries';
import { PlanStatusBadge } from '../components/status-badges';
import { useProductionLocation } from '../lib/location';
import { PLAN_STATUSES } from '../lib/status';

/** BAK-002 Production plans: what each day bakes, draft → confirmed → in progress → done. */
export function PlanListPage() {
  const { t, i18n } = useTranslation('production');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const { list, locationId, locationName, setLocation } = useProductionLocation(['status']);
  const status = PLAN_STATUSES.find((s) => s === list.filters.status);
  const plans = useProductionPlans({ locationId, ...(status ? { status } : {}) });

  const columns: DataTableColumn<ProductionPlan>[] = [
    {
      id: 'number',
      header: t('fields.plan'),
      primary: true,
      width: 'w-36',
      cell: (p) => <span className="font-semibold">{p.number}</span>,
    },
    {
      id: 'date',
      header: t('fields.planDate'),
      width: 'w-36',
      cell: (p) => formatPlainDate(p.planDate, locale),
    },
    {
      id: 'status',
      header: t('fields.status'),
      cell: (p) => <PlanStatusBadge status={p.status} />,
    },
    {
      id: 'items',
      header: t('fields.products'),
      hideOnTablet: true,
      cell: (p) => {
        const items = p.lines.map((l) => `${l.productName} ×${l.plannedQuantity}`).join(', ');
        // Bounded so a long plan doesn't make the table scroll sideways.
        return (
          <span className="block max-w-72 truncate text-sm" title={items}>
            {items}
          </span>
        );
      },
    },
    {
      id: 'progress',
      header: t('fields.progress'),
      align: 'right',
      width: 'w-32',
      cell: (p) =>
        p.progress.batches ? (
          <span className="tabular">
            {t('plans.progress', { done: p.progress.completed, total: p.progress.batches })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'produced',
      header: t('fields.produced'),
      align: 'right',
      width: 'w-28',
      cell: (p) => (
        <span className="tabular">
          {p.progress.produced} / {p.lines.reduce((s, l) => s + l.plannedQuantity, 0)}
        </span>
      ),
    },
  ];

  return (
    <Screen id="BAK-002" title={t('plans.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('plans.title')}
        description={t('plans.hint', { location: locationName })}
        actions={
          <Button asChild>
            <Link to={`new?${new URLSearchParams({ location: locationId })}`}>
              <PlusIcon /> {t('plans.new')}
            </Link>
          </Button>
        }
      />
      <Card className="p-0">
        <DataTable
          caption={t('plans.caption')}
          columns={columns}
          rows={plans.data}
          getRowId={(p) => p.id}
          getRowLabel={(p) => `${p.number} ${p.planDate}`}
          loading={plans.isPending}
          onRowClick={(p) => navigate(`/production/plan/${p.id}`)}
          error={
            plans.isError ? (
              <QueryError error={plans.error} onRetry={() => plans.refetch()} />
            ) : undefined
          }
          empty={
            status ? (
              <EmptyState icon={SearchXIcon} title={t('plans.noResults')} />
            ) : (
              <EmptyState icon={ClipboardListIcon} title={t('plans.empty')} />
            )
          }
          toolbar={
            <FilterBar
              search={
                <LocationSelect
                  value={locationId}
                  onChange={setLocation}
                  types={['BAKERY']}
                  label={t('fields.location')}
                />
              }
              filters={([null, ...PLAN_STATUSES] as const).map((s) => (
                <FilterChip
                  key={s ?? 'any'}
                  active={(status ?? null) === s}
                  onClick={() => list.setFilter('status', s)}
                >
                  {s ? t(`planStatus.${s}`) : t('plans.anyStatus')}
                </FilterChip>
              ))}
            />
          }
        />
      </Card>
    </Screen>
  );
}
