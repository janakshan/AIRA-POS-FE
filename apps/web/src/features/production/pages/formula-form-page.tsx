import { zodResolver } from '@hookform/resolvers/zod';
import type { ProductionFormula, ProductionFormulaRequest, ProductionMaterial } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  Form,
  FormActions,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
  FormSkeleton,
  NumberInput,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@rbp/ui';
import { productionFormulaSchema } from '@rbp/validation';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { type Resolver, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { applyServerErrors } from '@/lib/form-errors';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useProductionFormulas,
  useProductionMaterials,
  useSaveProductionFormula,
} from '../api/queries';
import { useProductionLocation } from '../lib/location';

/** Quantities may be blank while typing; the schema reports them (validation.quantityRequired). */
interface FormValues {
  yieldQuantity: number | null;
  lines: { ingredientId: string; quantity: number | null }[];
}

const resolver = zodResolver(productionFormulaSchema) as unknown as Resolver<
  FormValues,
  unknown,
  ProductionFormulaRequest
>;

/** BAK-006 edit one product's formula (A-309): yield per run and raw materials per run. */
export function FormulaFormPage() {
  const { productId } = useParams();
  const { t } = useTranslation('production');
  const { locationId } = useProductionLocation();
  const formulas = useProductionFormulas(locationId);
  const materials = useProductionMaterials(locationId);
  const formula = formulas.data?.find((f) => f.productId === productId);
  const back = `/production/formulas?${new URLSearchParams({ location: locationId })}`;

  if (formulas.isError || materials.isError) {
    const error = formulas.error ?? materials.error;
    return (
      <Shell title={t('formulaForm.title')}>
        <QueryError
          error={error}
          onRetry={() => void Promise.all([formulas.refetch(), materials.refetch()])}
        />
      </Shell>
    );
  }
  if (!formulas.data || !materials.data) {
    return (
      <Shell title={t('formulaForm.title')}>
        <Card className="p-6">
          <FormSkeleton fields={4} />
        </Card>
      </Shell>
    );
  }
  if (!formula) {
    return (
      <Shell title={t('formulaForm.title')}>
        <Alert tone="info" title={t('formulaForm.notFound')}>
          <Link
            to={back}
            className="inline-flex items-center font-medium underline pointer-coarse:min-h-11"
          >
            {t('formulaForm.back')}
          </Link>
        </Alert>
      </Shell>
    );
  }
  return (
    <FormulaForm
      key={`${formula.productId}:${formula.updatedAt ?? ''}`}
      formula={formula}
      materials={materials.data}
      locationId={locationId}
      back={back}
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
  const { t } = useTranslation('production');
  useBreadcrumbTitle(title);
  return (
    <Screen id="BAK-006" title={title} className="space-y-section">
      <PageHeader eyebrow={<PageBreadcrumbs />} title={title} description={t('formulaForm.hint')} />
      <div className="grid items-start gap-section xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-section">{children}</div>
        {aside}
      </div>
    </Screen>
  );
}

function FormulaForm({
  formula,
  materials,
  locationId,
  back,
}: {
  formula: ProductionFormula;
  materials: ProductionMaterial[];
  locationId: string;
  back: string;
}) {
  const { t } = useTranslation('production');
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { locationName } = useProductionLocation();
  const save = useSaveProductionFormula();
  const form = useForm<FormValues, unknown, ProductionFormulaRequest>({
    resolver,
    defaultValues: {
      yieldQuantity: formula.yieldQuantity,
      lines: formula.lines.map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity })),
    },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const watched = useWatch({ control: form.control, name: 'lines' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty && !save.isPending);
  const byId = new Map(materials.map((m) => [m.id, m]));
  const unit = (n: number) => t(`inventory:unit.${formula.unit}`, { count: n });

  const onSubmit = form.handleSubmit((body) => {
    save.mutate(
      { productId: formula.productId, body, locationId },
      {
        onSuccess: (saved) => {
          guard.bypass();
          toast.success(t('formulaForm.saved', { name: saved.productName }));
          navigate(back);
        },
        onError: (error) => {
          if (!applyServerErrors(form, error)) toast.error(errorMessage(error));
        },
      },
    );
  });

  const rootLinesError =
    form.formState.errors.lines?.root?.message ?? form.formState.errors.lines?.message;

  return (
    <Shell
      title={t('formulaForm.titleFor', { name: formula.productName })}
      aside={<EntityHistory entity="production-formula" entityId={formula.productId} />}
    >
      {guard.dialog}
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-section">
          <FormSection title={t('formulaForm.yield')}>
            <FormField
              control={form.control}
              name="yieldQuantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t('formulaForm.yield')}</FormLabel>
                  <FormControl>
                    <NumberInput
                      min={0}
                      max={100_000}
                      value={field.value}
                      onChange={field.onChange}
                      name={field.name}
                      decrementLabel={t('formulaForm.lessYield')}
                      incrementLabel={t('formulaForm.moreYield')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('formulaForm.yieldHint', { unit: unit(2), name: formula.productName })}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection
            title={t('formulaForm.materials')}
            description={t('formulaForm.materialsHint')}
          >
            <div data-span="full" className="space-y-3">
              {lines.fields.length ? (
                <ul className="space-y-3" aria-label={t('formulaForm.materials')}>
                  {lines.fields.map((row, index) => {
                    const n = index + 1;
                    const material = byId.get(watched[index]?.ingredientId ?? '');
                    return (
                      <li
                        key={row.id}
                        className="grid items-start gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
                      >
                        <FormField
                          control={form.control}
                          name={`lines.${index}.ingredientId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel required className="sr-only sm:not-sr-only">
                                {t('formulaForm.materialN', { n })}
                              </FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger
                                    ref={field.ref}
                                    aria-label={t('formulaForm.materialN', { n })}
                                  >
                                    <SelectValue placeholder={t('formulaForm.choose')} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {materials.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                      {m.code} · {m.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {material && (
                                <FormDescription>
                                  {material.portionDescription
                                    ? `${material.portionDescription} · `
                                    : ''}
                                  {t('formulaForm.onHand', {
                                    count: material.onHand,
                                    location: locationName,
                                  })}
                                </FormDescription>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`lines.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel required className="sr-only sm:not-sr-only">
                                {t('fields.quantity')}
                              </FormLabel>
                              <FormControl>
                                <NumberInput
                                  min={0}
                                  max={100_000}
                                  value={field.value}
                                  onChange={field.onChange}
                                  name={field.name}
                                  aria-label={t('formulaForm.quantityFor', { n })}
                                  decrementLabel={t('formulaForm.lessOf', { n })}
                                  incrementLabel={t('formulaForm.moreOf', { n })}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-touch text-destructive sm:mt-6"
                          aria-label={t('formulaForm.remove', { n })}
                          onClick={() => lines.remove(index)}
                        >
                          <Trash2Icon />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t('formulaForm.noLines')}</p>
              )}
              {rootLinesError && (
                <p role="alert" className="text-sm text-destructive">
                  {t(`common:${rootLinesError}`)}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => lines.append({ ingredientId: '', quantity: 1 })}
              >
                <PlusIcon /> {t('formulaForm.add')}
              </Button>
            </div>
          </FormSection>

          <FormActions>
            <Button type="button" variant="outline" onClick={() => navigate(back)}>
              {t('formulaForm.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('formulaForm.save')}
            </Button>
          </FormActions>
        </form>
      </Form>
    </Shell>
  );
}
