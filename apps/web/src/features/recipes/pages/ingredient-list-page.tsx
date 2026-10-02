import type { Ingredient } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  PageHeader,
  StatCard,
} from '@rbp/ui';
import {
  AlertTriangleIcon,
  CarrotIcon,
  PencilIcon,
  PlusIcon,
  SearchXIcon,
  ShoppingBagIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { StockStatusBadge } from '@/features/inventory/components/stock-status-badge';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useIngredients } from '../api/queries';
import { IngredientDialog } from '../components/ingredient-dialog';
import { portionSummary } from '../lib/format';
import { useRecipeLocation } from '../lib/location';

/** REC-001 Kitchen ingredients: counted in portions on the same stock ledger as everything else. */
export function IngredientListPage() {
  const { t } = useTranslation('recipes');
  const navigate = useNavigate();
  const { can, hasFeature } = useAccess();
  const { list, locationId, locationName, setLocation } = useRecipeLocation();
  const ingredients = useIngredients(
    { locationId, ...(list.search ? { search: list.search } : {}) },
    !!locationId,
  );
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [creating, setCreating] = useState(false);
  const rows = ingredients.data;
  const low = rows?.filter((i) => i.levels[0] && i.levels[0].status !== 'OK') ?? [];
  const canOrder = hasFeature('PURCHASING') && can('purchasing.manage');

  const orderHref = (items: Ingredient[]) =>
    `/purchasing/orders/new?${new URLSearchParams({
      location: locationId,
      lines: items
        .map((i) => {
          const l = i.levels[0];
          return `${i.id}:${Math.max(1, (l?.minStock ?? 0) * 2 - (l?.onHand ?? 0))}`;
        })
        .join(','),
    })}`;

  const columns: DataTableColumn<Ingredient>[] = [
    {
      id: 'code',
      header: t('fields.code'),
      width: 'w-20',
      hideOnTablet: true,
      cell: (i) => <span className="font-mono text-xs text-muted-foreground">{i.code}</span>,
    },
    {
      id: 'name',
      header: t('fields.ingredient'),
      primary: true,
      cell: (i) => (
        <span>
          <span className="font-medium">{i.name}</span>
          <span className="block text-xs text-muted-foreground">
            {i.usedIn.length
              ? t('ingredient.usedIn', { names: i.usedIn.map((u) => u.name).join(', ') })
              : t('ingredient.notUsed')}
          </span>
        </span>
      ),
    },
    {
      id: 'portion',
      header: t('fields.portion'),
      hideOnTablet: true,
      cell: (i) =>
        i.portion ? (
          <span className="text-sm">{portionSummary(i.portion, t)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'onHand',
      header: t('fields.onHand'),
      align: 'right',
      width: 'w-32',
      cell: (i) => {
        const l = i.levels[0];
        return (
          <span className="tabular">
            <span className="font-semibold">{l?.onHand ?? 0}</span>{' '}
            <span className="text-xs text-muted-foreground">
              {t(`inventory:unit.${i.unit}`, { count: l?.onHand ?? 0 })}
            </span>
          </span>
        );
      },
    },
    {
      id: 'min',
      header: t('fields.minimum'),
      align: 'right',
      width: 'w-24',
      cell: (i) => i.levels[0]?.minStock ?? 0,
    },
    {
      id: 'status',
      header: t('fields.status'),
      width: 'w-32',
      cell: (i) => (i.levels[0] ? <StockStatusBadge status={i.levels[0].status} /> : null),
    },
    {
      id: 'edit',
      header: '',
      align: 'right',
      width: 'w-16',
      cell: (i) => (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="size-touch"
            aria-label={t('ingredient.edit', { name: i.name })}
            onClick={() => setEditing(i)}
          >
            <PencilIcon />
          </Button>
        </span>
      ),
    },
  ];

  return (
    <Screen id="REC-001" title={t('ingredients.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('ingredients.title')}
        description={t('ingredients.hint')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> {t('ingredients.new')}
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label={t('ingredients.tracked')}
          value={rows ? String(rows.length) : '—'}
          icon={CarrotIcon}
          hint={t('ingredients.at', { location: locationName })}
        />
        <StatCard
          label={t('ingredients.low')}
          value={rows ? String(low.length) : '—'}
          icon={AlertTriangleIcon}
          hint={
            canOrder && low.length > 0 ? (
              <Link
                to={orderHref(low)}
                className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
              >
                <ShoppingBagIcon className="mr-1 size-3.5" aria-hidden />
                {t('ingredients.orderLow')}
              </Link>
            ) : (
              t('ingredients.lowHint')
            )
          }
        />
      </div>
      <Card className="p-0">
        <DataTable
          caption={t('ingredients.caption')}
          columns={columns}
          rows={rows}
          getRowId={(i) => i.id}
          getRowLabel={(i) => i.name}
          loading={ingredients.isPending}
          onRowClick={(i) =>
            navigate(`/inventory/stock/${i.id}?${new URLSearchParams({ location: locationId })}`)
          }
          error={
            ingredients.isError ? (
              <QueryError error={ingredients.error} onRetry={() => ingredients.refetch()} />
            ) : undefined
          }
          empty={
            list.search ? (
              <EmptyState icon={SearchXIcon} title={t('ingredients.noResults')} />
            ) : (
              <EmptyState icon={CarrotIcon} title={t('ingredients.empty')} />
            )
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('ingredients.searchPlaceholder')}
                  aria-label={t('ingredients.search')}
                />
              }
              filters={
                <LocationSelect
                  value={locationId}
                  onChange={setLocation}
                  label={t('fields.location')}
                />
              }
            />
          }
        />
      </Card>
      <p className="text-sm text-muted-foreground">{t('ingredients.ledgerHint')}</p>
      <IngredientDialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        ingredient={editing}
        locationId={locationId}
        locationName={locationName}
      />
    </Screen>
  );
}
