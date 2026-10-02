import type { StockLevel } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  FilterChip,
  PageHeader,
  Pagination,
  StatCard,
} from '@rbp/ui';
import { cn, formatDateTime } from '@rbp/utils';
import {
  AlertTriangleIcon,
  BoxesIcon,
  PackageXIcon,
  SearchXIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { localeFor } from '@/app/i18n';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useCategoryTree } from '@/features/catalog/api/queries';
import { CategorySelect } from '@/features/catalog/components/category-select';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useInventory } from '../api/queries';
import { AdjustmentDialog } from '../components/adjustment-dialog';
import { LocationSelect } from '../components/location-select';
import { StockStatusBadge } from '../components/stock-status-badge';
import { useMyLocations } from '../lib/use-locations';

const PAGE_SIZE = 25;

/** INV-001 Stock overview: on hand per item and location, from the stock ledger. */
export function StockOverviewPage() {
  const { t, i18n } = useTranslation('inventory');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const { can } = useAccess();
  const { current, nameOf } = useMyLocations();
  const tree = useCategoryTree();
  const list = useListParams({
    pageSize: PAGE_SIZE,
    filterKeys: ['location', 'status', 'category'],
  });
  const locationId = list.filters.location ?? current?.id ?? '';
  const status =
    list.filters.status === 'LOW' || list.filters.status === 'OUT'
      ? list.filters.status
      : undefined;
  const stock = useInventory(
    {
      locationId,
      page: list.page,
      pageSize: PAGE_SIZE,
      ...(list.search ? { search: list.search } : {}),
      ...(status ? { status } : {}),
      ...(list.filters.category ? { categoryId: list.filters.category } : {}),
    },
    !!locationId,
  );
  const [adjusting, setAdjusting] = useState(false);
  const summary = stock.data?.summary;
  const all = locationId === 'all';

  const columns: DataTableColumn<StockLevel>[] = [
    {
      id: 'code',
      header: t('cols.code'),
      width: 'w-20',
      cell: (l) => <span className="font-mono text-xs">{l.code}</span>,
    },
    {
      id: 'name',
      header: t('cols.item'),
      primary: true,
      cell: (l) => <span className="font-medium">{l.name}</span>,
    },
    ...(all
      ? [
          {
            id: 'location',
            header: t('cols.location'),
            cell: (l: StockLevel) => nameOf(l.locationId),
          },
        ]
      : []),
    {
      id: 'onHand',
      header: t('cols.onHand'),
      align: 'right',
      width: 'w-32',
      cell: (l) => (
        <span
          className={cn(
            'font-semibold tabular',
            l.status === 'OUT' && 'text-destructive',
            l.status === 'LOW' && 'text-status-warning-fg',
          )}
        >
          {l.onHand}{' '}
          <span className="text-xs font-normal text-muted-foreground">
            {t(`unit.${l.unit}`, { count: l.onHand })}
          </span>
        </span>
      ),
    },
    {
      id: 'min',
      header: t('cols.min'),
      align: 'right',
      width: 'w-24',
      hideOnTablet: true,
      cell: (l) =>
        l.minStock ? (
          <span className="tabular">{l.minStock}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'status',
      header: t('cols.status'),
      width: 'w-32',
      cell: (l) => <StockStatusBadge status={l.status} />,
    },
    {
      id: 'last',
      header: t('cols.lastMovement'),
      width: 'w-44',
      hideOnTablet: true,
      cell: (l) => (l.lastMovementAt ? formatDateTime(l.lastMovementAt, { locale }) : '—'),
    },
  ];

  return (
    <Screen id="INV-001" title={t('overview.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('overview.title')}
        description={t('overview.hint')}
        actions={
          can('inventory.adjust') && (
            <Button onClick={() => setAdjusting(true)}>
              <SlidersHorizontalIcon /> {t('adjust.new')}
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t('overview.tracked')}
          value={summary ? String(summary.tracked) : '—'}
          icon={BoxesIcon}
        />
        <StatCard
          label={t('overview.low')}
          value={summary ? String(summary.low) : '—'}
          icon={AlertTriangleIcon}
          className={summary?.low ? 'ring-1 ring-status-warning/40' : undefined}
        />
        <StatCard
          label={t('overview.out')}
          value={summary ? String(summary.out) : '—'}
          icon={PackageXIcon}
          className={summary?.out ? 'ring-1 ring-status-danger/40' : undefined}
        />
      </div>
      <Card className="p-0">
        <DataTable
          caption={t('overview.caption')}
          columns={columns}
          rows={stock.data?.items}
          getRowId={(l) => `${l.productId}:${l.locationId}`}
          getRowLabel={(l) => (all ? `${l.name} · ${nameOf(l.locationId)}` : l.name)}
          loading={stock.isPending}
          onRowClick={(l) => navigate(`${l.productId}?location=${l.locationId}`)}
          error={
            stock.isError ? (
              <QueryError error={stock.error} onRetry={() => stock.refetch()} />
            ) : undefined
          }
          empty={
            <EmptyState
              icon={SearchXIcon}
              title={t('overview.empty')}
              description={t('overview.emptyHint')}
            />
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('overview.search')}
                  aria-label={t('overview.search')}
                />
              }
              filters={
                <>
                  <LocationSelect
                    value={locationId}
                    onChange={(v) => list.setFilter('location', v === current?.id ? null : v)}
                    allowAll
                    label={t('location')}
                  />
                  <CategorySelect
                    tree={tree.data}
                    value={list.filters.category ?? null}
                    onChange={(v) => list.setFilter('category', v)}
                    placeholder={t('overview.allCategories')}
                    noneLabel={t('overview.allCategories')}
                    inactiveLabel={t('overview.inactive')}
                    aria-label={t('cols.category')}
                    className="w-full sm:w-52"
                  />
                  {([null, 'LOW', 'OUT'] as const).map((s) => (
                    <FilterChip
                      key={s ?? 'all'}
                      active={(status ?? null) === s}
                      onClick={() => list.setFilter('status', s)}
                    >
                      {s ? t(`status.${s}`) : t('overview.allStatuses')}
                    </FilterChip>
                  ))}
                </>
              }
            />
          }
          footer={
            stock.data && stock.data.total > 0 ? (
              <Pagination
                page={list.page}
                pageSize={PAGE_SIZE}
                total={stock.data.total}
                onPageChange={list.setPage}
                summary={(from, to, total) => t('summary', { from, to, total })}
                previousLabel={t('previous')}
                nextLabel={t('next')}
                pageLabel={(p) => t('page', { page: p })}
              />
            ) : undefined
          }
        />
      </Card>
      <AdjustmentDialog
        open={adjusting}
        onOpenChange={setAdjusting}
        {...(locationId && !all ? { locationId } : {})}
      />
    </Screen>
  );
}
