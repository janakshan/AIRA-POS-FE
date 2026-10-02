import { isApiError } from '@rbp/api-client';
import type { Ingredient, Recipe } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormSkeleton,
  Input,
  NumberInput,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from '@rbp/ui';
import { cn } from '@rbp/utils';
import { CarrotIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useIngredients, useRecipe, useRecipes, useSaveRecipe } from '../api/queries';
import { useRecipeLocation } from '../lib/location';

interface Line {
  ingredientId: string;
  quantity: number | null;
}

/** REC-003 Recipe form: what one serving uses; saving makes the dish made to order. */
export function RecipeFormPage() {
  const { productId } = useParams();
  const { t } = useTranslation('recipes');
  const { locationId } = useRecipeLocation();
  const recipe = useRecipe(productId, locationId);
  const ingredients = useIngredients({ locationId }, !!locationId);
  const notFound = isApiError(recipe.error) && recipe.error.status === 404;

  if ((productId && recipe.isPending) || !ingredients.data) {
    return (
      <Shell title={t('form.title')}>
        {ingredients.error ? (
          <QueryError error={ingredients.error} onRetry={() => ingredients.refetch()} />
        ) : (
          <Card className="p-6">
            <FormSkeleton fields={4} />
          </Card>
        )}
      </Shell>
    );
  }
  if (recipe.error && !notFound) {
    return (
      <Shell title={t('form.title')}>
        <QueryError error={recipe.error} onRetry={() => recipe.refetch()} />
      </Shell>
    );
  }
  return (
    <RecipeForm
      key={`${productId ?? 'new'}:${recipe.data?.updatedAt ?? ''}`}
      productId={productId ?? null}
      recipe={recipe.data}
      ingredients={ingredients.data}
      locationId={locationId}
    />
  );
}

function Shell({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  useBreadcrumbTitle(title);
  return (
    <Screen id="REC-003" title={title} className="space-y-section">
      <PageHeader eyebrow={<PageBreadcrumbs />} title={title} />
      <div className="grid items-start gap-section xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-section">{children}</div>
        {aside}
      </div>
    </Screen>
  );
}

function RecipeForm({
  productId,
  recipe,
  ingredients,
  locationId,
}: {
  productId: string | null;
  recipe: Recipe | undefined;
  ingredients: Ingredient[];
  locationId: string;
}) {
  const { t } = useTranslation('recipes');
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const [params] = useSearchParams();
  const { locationName } = useRecipeLocation();
  const list = useRecipes(locationId);
  const save = useSaveRecipe();
  const ids = { dish: useId(), note: useId(), active: useId() };
  const [dishId, setDishId] = useState(productId ?? params.get('productId') ?? '');
  const [lines, setLines] = useState<Line[]>(
    recipe?.lines.map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity })) ?? [],
  );
  const [isActive, setIsActive] = useState(recipe?.isActive ?? true);
  const [note, setNote] = useState(recipe?.note ?? '');
  const [adding, setAdding] = useState('');
  const [dirty, setDirty] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const guard = useUnsavedChangesGuard(dirty && !save.isPending);
  const touch = () => setDirty(true);

  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const dishes = list.data?.withoutRecipe ?? [];
  const dishName = recipe?.productName ?? dishes.find((d) => d.productId === dishId)?.name ?? '';

  // Live preview: servings the ingredients allow at this location.
  const preview = useMemo(() => {
    let canMake = Number.POSITIVE_INFINITY;
    let limitedBy: string | null = null;
    for (const l of lines) {
      const ing = byId.get(l.ingredientId);
      if (!ing || !l.quantity) continue;
      const servings = Math.floor(Math.max(0, ing.levels[0]?.onHand ?? 0) / l.quantity);
      if (servings < canMake) {
        canMake = servings;
        limitedBy = ing.name;
      }
    }
    return Number.isFinite(canMake) ? { canMake, limitedBy } : null;
  }, [lines, byId]);

  const invalid = !dishId || lines.length === 0 || lines.some((l) => !l.quantity);
  const submit = () => {
    setSubmitted(true);
    if (invalid) return;
    save.mutate(
      {
        productId: dishId,
        locationId,
        body: {
          lines: lines.map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity ?? 1 })),
          isActive,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      },
      {
        onSuccess: (saved) => {
          guard.bypass();
          toast.success(t('form.saved', { name: saved.productName }));
          navigate(`/production/recipes?${new URLSearchParams({ location: locationId })}`);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const available = ingredients.filter((i) => !lines.some((l) => l.ingredientId === i.id));

  return (
    <Shell
      title={dishName ? t('form.titleFor', { name: dishName }) : t('form.newTitle')}
      aside={
        <div className="space-y-section xl:sticky xl:top-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('form.preview')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {preview ? (
                <>
                  <p>
                    <span className="text-3xl font-semibold tabular">{preview.canMake}</span>{' '}
                    <span className="text-muted-foreground">
                      {t('form.canMakeAt', { location: locationName })}
                    </span>
                  </p>
                  {preview.limitedBy && (
                    <p className="text-muted-foreground">
                      {t('recipes.limitedBy', { name: preview.limitedBy })}
                    </p>
                  )}
                  <div>
                    <p className="font-medium">{t('form.sellingOne')}</p>
                    <ul className="mt-1 space-y-0.5">
                      {lines.map((l) => {
                        const ing = byId.get(l.ingredientId);
                        return (
                          <li key={l.ingredientId} className="flex justify-between gap-2">
                            <span>{ing?.name}</span>
                            <span className="text-muted-foreground tabular">
                              −{l.quantity ?? 0}{' '}
                              {t(`inventory:unit.${ing?.unit ?? 'pcs'}`, {
                                count: l.quantity ?? 0,
                              })}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  {!isActive && (
                    <Alert tone="warning" title={t('form.pausedTitle')}>
                      {t('form.pausedHint')}
                    </Alert>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">{t('form.previewEmpty')}</p>
              )}
              {recipe?.availability.prepared ? (
                <p className="text-muted-foreground">
                  {t('form.plusPrepared', { count: recipe.availability.prepared })}
                </p>
              ) : null}
            </CardContent>
          </Card>
          {productId && <EntityHistory entity="recipe" entityId={productId} />}
        </div>
      }
    >
      {guard.dialog}
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={ids.dish} className="text-sm font-medium">
              {t('fields.dish')}
            </label>
            {productId ? (
              <p id={ids.dish} className="flex min-h-10 items-center font-medium">
                {dishName}
              </p>
            ) : (
              <>
                <Select
                  value={dishId}
                  onValueChange={(v) => {
                    touch();
                    setDishId(v);
                  }}
                >
                  <SelectTrigger
                    id={ids.dish}
                    className="w-full"
                    aria-invalid={submitted && !dishId}
                  >
                    <SelectValue placeholder={t('form.chooseDish')} />
                  </SelectTrigger>
                  <SelectContent>
                    {dishes.map((d) => (
                      <SelectItem key={d.productId} value={d.productId}>
                        {d.code} · {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {submitted && !dishId && (
                  <p role="alert" className="text-sm text-destructive">
                    {t('form.dishRequired')}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.active} className="text-sm font-medium">
              {t('form.deduct')}
            </label>
            <div className="flex min-h-10 items-center gap-3">
              <Switch
                id={ids.active}
                checked={isActive}
                onCheckedChange={(v) => {
                  touch();
                  setIsActive(v);
                }}
              />
              <span className="text-sm text-muted-foreground">
                {t(isActive ? 'form.deductOn' : 'form.deductOff')}
              </span>
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={ids.note} className="text-sm font-medium">
              {t('fields.note')}
            </label>
            <Input
              id={ids.note}
              value={note}
              maxLength={200}
              onChange={(e) => {
                touch();
                setNote(e.target.value);
              }}
              placeholder={t('form.notePlaceholder')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('form.onePlate')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.length ? (
            <ul className="divide-y rounded-xl border" aria-label={t('form.onePlate')}>
              {lines.map((l) => {
                const ing = byId.get(l.ingredientId);
                const onHand = ing?.levels[0]?.onHand ?? 0;
                return (
                  <li
                    key={l.ingredientId}
                    className="grid items-center gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{ing?.name ?? l.ingredientId}</p>
                      <p className="text-xs text-muted-foreground">
                        {ing?.portion?.description ? `${ing.portion.description} · ` : ''}
                        {t('form.onHand', {
                          count: onHand,
                          unit: t(`inventory:unit.${ing?.unit ?? 'pcs'}`, { count: onHand }),
                        })}
                      </p>
                    </div>
                    <NumberInput
                      value={l.quantity}
                      min={1}
                      max={100}
                      onChange={(q) => {
                        touch();
                        setLines((ls) =>
                          ls.map((x) =>
                            x.ingredientId === l.ingredientId ? { ...x, quantity: q } : x,
                          ),
                        );
                      }}
                      aria-label={t('form.quantityFor', { name: ing?.name ?? '' })}
                      aria-invalid={submitted && !l.quantity}
                      decrementLabel={t('form.lessOf', { name: ing?.name ?? '' })}
                      incrementLabel={t('form.moreOf', { name: ing?.name ?? '' })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-touch justify-self-end text-destructive"
                      aria-label={t('form.remove', { name: ing?.name ?? '' })}
                      onClick={() => {
                        touch();
                        setLines((ls) => ls.filter((x) => x.ingredientId !== l.ingredientId));
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={CarrotIcon} title={t('form.noLines')} />
          )}
          {submitted && lines.length === 0 && (
            <p role="alert" className="text-sm text-destructive">
              {t('common:validation.recipeEmpty')}
            </p>
          )}
          <div className={cn('flex flex-wrap items-end gap-2', !available.length && 'hidden')}>
            <Select value={adding} onValueChange={setAdding}>
              <SelectTrigger className="w-full sm:w-64" aria-label={t('form.addIngredient')}>
                <SelectValue placeholder={t('form.chooseIngredient')} />
              </SelectTrigger>
              <SelectContent>
                {available.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!adding}
              onClick={() => {
                touch();
                setLines((ls) => [...ls, { ingredientId: adding, quantity: 1 }]);
                setAdding('');
              }}
            >
              <PlusIcon /> {t('form.addIngredient')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() =>
            navigate(`/production/recipes?${new URLSearchParams({ location: locationId })}`)
          }
        >
          {t('cancel')}
        </Button>
        <Button loading={save.isPending} onClick={submit}>
          {t('form.save')}
        </Button>
      </div>
    </Shell>
  );
}
