import type { Ingredient } from '@rbp/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  NumberInput,
  PageHeader,
  Skeleton,
} from '@rbp/ui';
import { cn } from '@rbp/utils';
import { CalculatorIcon, PencilIcon, ShoppingBagIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useIngredients, useRecipePlanning } from '../api/queries';
import { IngredientDialog } from '../components/ingredient-dialog';
import { useRecipeLocation } from '../lib/location';

/**
 * REC-004 Portion setup: what one portion of each ingredient is, and today's requirement —
 * expected sales × recipes vs what's in the kitchen → what to buy (core requirements §21).
 */
export function PortionSetupPage() {
  const { t } = useTranslation('recipes');
  const { can, hasFeature } = useAccess();
  const { locationId, locationName, setLocation } = useRecipeLocation();
  const ingredients = useIngredients({ locationId }, !!locationId);
  const planning = useRecipePlanning(locationId);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [expected, setExpected] = useState<Record<string, number | null>>({});
  const canOrder = hasFeature('PURCHASING') && can('purchasing.manage');

  const expectedOf = (productId: string, fallback: number) => expected[productId] ?? fallback;

  const requirement = useMemo(() => {
    if (!planning.data) return [];
    const need = new Map<string, number>();
    for (const d of planning.data.dishes) {
      const n = expected[d.productId] ?? d.averageDaily;
      for (const l of d.lines)
        need.set(l.ingredientId, (need.get(l.ingredientId) ?? 0) + n * l.quantity);
    }
    return planning.data.ingredients.map((i) => {
      const needed = need.get(i.id) ?? 0;
      const buy = Math.max(0, needed - Math.max(0, i.onHand));
      return {
        ...i,
        needed,
        buy,
        packs: i.portion?.perPack && buy ? Math.ceil(buy / i.portion.perPack) : null,
      };
    });
  }, [planning.data, expected]);

  const toBuy = requirement.filter((r) => r.buy > 0);
  const orderHref = `/purchasing/orders/new?${new URLSearchParams({
    location: locationId,
    lines: toBuy.map((r) => `${r.id}:${r.buy}`).join(','),
  })}`;

  return (
    <Screen id="REC-004" title={t('portions.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('portions.title')}
        description={t('portions.hint')}
      />
      <LocationSelect value={locationId} onChange={setLocation} label={t('fields.location')} />

      <section className="space-y-3" aria-labelledby="portion-defs">
        <h2 id="portion-defs" className="text-lg font-semibold">
          {t('portions.definitions')}
        </h2>
        <Card className="p-0">
          {ingredients.isError ? (
            <QueryError error={ingredients.error} onRetry={() => ingredients.refetch()} />
          ) : !ingredients.data ? (
            <Skeleton className="m-4 h-32" />
          ) : (
            <ul className="divide-y" aria-labelledby="portion-defs">
              {ingredients.data.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="w-32 font-medium">{i.name}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    {i.portion ? (
                      <>
                        {t('portions.onePortion', {
                          unit: t(`inventory:unit.${i.unit}`, { count: 1 }),
                          description: i.portion.description,
                        })}
                        <span className="block text-xs text-muted-foreground">
                          {[
                            i.portion.grams ? t('portion.grams', { count: i.portion.grams }) : null,
                            i.portion.perPack
                              ? t('portion.perPack', {
                                  count: i.portion.perPack,
                                  unit: t(`inventory:unit.${i.unit}`, { count: i.portion.perPack }),
                                })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t('portions.notDefined')}</span>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="pointer-coarse:min-h-11"
                    onClick={() => setEditing(i)}
                    aria-label={t('portions.editFor', { name: i.name })}
                  >
                    <PencilIcon /> {t('portions.edit')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="planner">
        <div>
          <h2 id="planner" className="text-lg font-semibold">
            {t('planner.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('planner.hint', { location: locationName })}
          </p>
        </div>
        {planning.isError ? (
          <QueryError error={planning.error} onRetry={() => planning.refetch()} />
        ) : !planning.data ? (
          <Skeleton className="h-48" />
        ) : !planning.data.dishes.length ? (
          <EmptyState icon={CalculatorIcon} title={t('planner.noRecipes')} />
        ) : (
          <div className="grid items-start gap-section lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('planner.expected')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y rounded-xl border" aria-label={t('planner.expected')}>
                  {planning.data.dishes.map((d) => (
                    <li
                      key={d.productId}
                      className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_9rem]"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('planner.average', { count: d.averageDaily })}
                        </p>
                      </div>
                      <NumberInput
                        value={expectedOf(d.productId, d.averageDaily)}
                        min={0}
                        max={10000}
                        onChange={(v) => setExpected((e) => ({ ...e, [d.productId]: v }))}
                        aria-label={t('planner.expectedFor', { name: d.name })}
                        decrementLabel={t('planner.lessOf', { name: d.name })}
                        incrementLabel={t('planner.moreOf', { name: d.name })}
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('planner.requirement')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('planner.requirement')}</caption>
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                      <th scope="col" className="py-2 font-medium">
                        {t('fields.ingredient')}
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        {t('planner.need')}
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        {t('planner.have')}
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        {t('planner.buy')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirement.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <th scope="row" className="py-2 text-left font-medium">
                          {r.name}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {t(`inventory:unit.${r.unit}`, { count: 2 })}
                          </span>
                        </th>
                        <td className="py-2 text-right tabular">{r.needed}</td>
                        <td className="py-2 text-right tabular">{r.onHand}</td>
                        <td
                          className={cn(
                            'py-2 text-right font-semibold tabular',
                            r.buy > 0 ? 'text-status-warning-fg' : 'text-muted-foreground',
                          )}
                        >
                          {r.buy > 0 ? `${r.buy}+` : '—'}
                          {r.packs && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {t('planner.packs', { count: r.packs })}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-sm" aria-live="polite">
                  {toBuy.length
                    ? t('planner.summary', {
                        items: toBuy
                          .map(
                            (r) =>
                              `${r.name} ${r.buy} ${t(`inventory:unit.${r.unit}`, { count: r.buy })}`,
                          )
                          .join(', '),
                      })
                    : t('planner.enough')}
                </p>
                {canOrder && toBuy.length > 0 && (
                  <Button asChild>
                    <Link to={orderHref}>
                      <ShoppingBagIcon /> {t('planner.createPo')}
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <IngredientDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        ingredient={editing}
        locationId={locationId}
        locationName={locationName}
      />
    </Screen>
  );
}
