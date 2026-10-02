import type { Recipe } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  PageHeader,
  StatusBadge,
} from '@rbp/ui';
import { cn } from '@rbp/utils';
import { BookOpenIcon, PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useRecipes } from '../api/queries';
import { useRecipeLocation } from '../lib/location';

/** REC-002 Recipes: what each dish uses, and how many can be made here right now. */
export function RecipeListPage() {
  const { t } = useTranslation('recipes');
  const navigate = useNavigate();
  const { locationId, locationName, setLocation } = useRecipeLocation();
  const recipes = useRecipes(locationId);
  const q = new URLSearchParams({ location: locationId });

  const columns: DataTableColumn<Recipe>[] = [
    {
      id: 'dish',
      header: t('fields.dish'),
      primary: true,
      cell: (r) => (
        <span>
          <span className="font-medium">{r.productName}</span>
          <span className="block font-mono text-xs text-muted-foreground">{r.productCode}</span>
        </span>
      ),
    },
    {
      id: 'uses',
      header: t('fields.onePlateUses'),
      cell: (r) => (
        <span className="text-sm">{r.lines.map((l) => `${l.name} ${l.quantity}`).join(' · ')}</span>
      ),
    },
    {
      id: 'canMake',
      header: t('fields.canMake'),
      align: 'right',
      width: 'w-40',
      cell: (r) =>
        r.isActive ? (
          <span>
            <span
              className={cn(
                'text-base font-semibold tabular',
                r.availability.canMake <= 0 && 'text-destructive',
              )}
            >
              {r.availability.canMake}
            </span>
            {r.availability.limitedBy && (
              <span className="block text-xs text-muted-foreground">
                {t('recipes.limitedBy', { name: r.availability.limitedBy.name })}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'ready',
      header: t('fields.ready'),
      align: 'right',
      width: 'w-24',
      cell: (r) =>
        r.availability.prepared > 0 ? (
          <StatusBadge tone="info" size="sm">
            {t('recipes.ready', { count: r.availability.prepared })}
          </StatusBadge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'status',
      header: t('fields.status'),
      width: 'w-28',
      cell: (r) => (
        <StatusBadge tone={r.isActive ? 'success' : 'neutral'} size="sm">
          {t(r.isActive ? 'recipes.active' : 'recipes.paused')}
        </StatusBadge>
      ),
    },
  ];

  return (
    <Screen id="REC-002" title={t('recipes.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('recipes.title')}
        description={t('recipes.hint')}
        actions={
          <Button asChild>
            <Link to={`new?${q}`}>
              <PlusIcon /> {t('recipes.new')}
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <LocationSelect value={locationId} onChange={setLocation} label={t('fields.location')} />
        <p className="text-sm text-muted-foreground">
          {t('recipes.canMakeHint', { location: locationName })}
        </p>
      </div>
      <Card className="p-0">
        <DataTable
          caption={t('recipes.caption')}
          columns={columns}
          rows={recipes.data?.recipes}
          getRowId={(r) => r.productId}
          getRowLabel={(r) => r.productName}
          loading={recipes.isPending}
          onRowClick={(r) => navigate(`${r.productId}?${q}`)}
          error={
            recipes.isError ? (
              <QueryError error={recipes.error} onRetry={() => recipes.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={BookOpenIcon} title={t('recipes.empty')} />}
        />
      </Card>

      <section className="space-y-3" aria-labelledby="no-recipe">
        <div>
          <h2 id="no-recipe" className="text-lg font-semibold">
            {t('recipes.withoutTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('recipes.withoutHint')}</p>
        </div>
        {recipes.data && (
          <Card className="p-0">
            {recipes.data.withoutRecipe.length ? (
              <ul className="divide-y" aria-labelledby="no-recipe">
                {recipes.data.withoutRecipe.map((p) => (
                  <li key={p.productId} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                      {p.code}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">{p.name}</span>
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        to={`new?${new URLSearchParams({ location: locationId, productId: p.productId })}`}
                        aria-label={t('recipes.addFor', { name: p.name })}
                      >
                        <PlusIcon /> {t('recipes.add')}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={BookOpenIcon} title={t('recipes.allHaveRecipes')} />
            )}
          </Card>
        )}
      </section>
    </Screen>
  );
}
