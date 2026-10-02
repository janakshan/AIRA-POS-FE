import { zodResolver } from '@hookform/resolvers/zod';
import type { CategoryTreeNode, Money, Product } from '@rbp/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormActions,
  FormControl,
  FormDescription,
  FormErrorSummary,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
  FormSkeleton,
  Input,
  MoneyInput,
  MoneyText,
  PageHeader,
  RadioCard,
  RadioGroup,
  Skeleton,
  StatusBadge,
  Switch,
  Textarea,
  toast,
} from '@rbp/ui';
import { moneySchema, productInputSchema } from '@rbp/validation';
import { BarcodeIcon, ReceiptIcon, TagIcon, XIcon } from 'lucide-react';
import { type ReactNode, type Ref, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { applyServerErrors } from '@/lib/form-errors';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useCategoryTree,
  useCreateProduct,
  usePriceMatrix,
  useProduct,
  useUpdateProduct,
} from '../api/queries';
import { CategorySelect } from '../components/category-select';
import { ImageField } from '../components/image-field';
import { TranslationFields } from '../components/translation-fields';
import { useTenantCurrency } from '../lib/currency';

/**
 * Money is an object, so `moneySchema` reports its issues at `basePrice.amount`. The field
 * message and error summary read `basePrice`, so re-raise the first issue on the field itself.
 */
const basePriceSchema = z.custom<Money | null>().transform((value, ctx) => {
  const parsed = value ? moneySchema.safeParse(value) : null;
  if (parsed?.success) return parsed.data;
  ctx.addIssue({
    code: 'custom',
    message: parsed?.error.issues[0]?.message ?? 'validation.priceRequired',
  });
  return z.NEVER;
});

const formSchema = productInputSchema.extend({
  basePrice: basePriceSchema,
  description: z.string().max(200, { error: 'validation.descriptionMax' }),
  barcodes: z.array(z.string()),
  showOnQuickPad: z.boolean(),
  isActive: z.boolean(),
});
type FormValues = z.input<typeof formSchema>;
type SubmitValues = z.output<typeof formSchema>;

function toValues(product: Product | undefined): FormValues {
  return {
    categoryId: product?.categoryId ?? '',
    code: product?.code ?? '',
    name: product?.name ?? '',
    description: product?.description ?? '',
    imageUrl: product?.imageUrl ?? null,
    nameTranslations: {
      ta: product?.nameTranslations.ta ?? '',
      si: product?.nameTranslations.si ?? '',
    },
    basePrice: product?.basePrice ?? null,
    taxMode: product?.taxMode ?? 'INCLUSIVE',
    barcodes: product?.barcodes ?? [],
    showOnQuickPad: product?.showOnQuickPad ?? true,
    isActive: product?.isActive ?? true,
  };
}

/** CAT-004 Product Form (new + edit). */
export function ProductFormPage() {
  const { id } = useParams();
  const tree = useCategoryTree();
  const product = useProduct(id);
  const pending = tree.isPending || (!!id && product.isPending);
  const error = tree.error ?? product.error;

  if (pending || error) {
    return (
      <Shell editing={!!id} title={undefined}>
        {error ? (
          <QueryError
            error={error}
            onRetry={() => {
              void tree.refetch();
              void product.refetch();
            }}
          />
        ) : (
          <Card className="p-6">
            <FormSkeleton fields={6} />
          </Card>
        )}
      </Shell>
    );
  }
  return <ProductForm key={id ?? 'new'} tree={tree.data ?? []} product={product.data} />;
}

function Shell({
  editing,
  title,
  aside,
  children,
}: {
  editing: boolean;
  title: string | undefined;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation('catalog');
  const heading = title ?? t(editing ? 'products.formEdit' : 'products.formNew');
  useBreadcrumbTitle(heading);
  return (
    <Screen id="CAT-004" title={heading} className="space-y-section">
      <PageHeader eyebrow={<PageBreadcrumbs />} title={heading} />
      <div className="grid items-start gap-section xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">{children}</div>
        {aside}
      </div>
    </Screen>
  );
}

function ProductForm({
  tree,
  product,
}: {
  tree: CategoryTreeNode[];
  product: Product | undefined;
}) {
  const { t } = useTranslation('catalog');
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { currency, symbol } = useTenantCurrency();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const form = useForm<FormValues, unknown, SubmitValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toValues(product),
  });
  const saving = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    const { basePrice, description, ...rest } = values;
    const body = {
      ...rest,
      basePrice,
      ...(description ? { description } : {}),
    };
    const onError = (error: unknown) => {
      if (!applyServerErrors(form, error)) toast.error(errorMessage(error));
    };
    const done = (key: string) => {
      guard.bypass();
      toast.success(t(key, { name: values.name }));
      navigate('/catalog/products');
    };
    if (product) {
      update.mutate(
        { id: product.id, body },
        { onSuccess: () => done('products.updated'), onError },
      );
    } else {
      const { isActive: _isActive, ...createBody } = body;
      create.mutate(createBody, { onSuccess: () => done('products.created'), onError });
    }
  });

  const guard = useUnsavedChangesGuard(form.formState.isDirty && !saving);

  return (
    <Shell
      editing={!!product}
      title={product?.name}
      aside={
        product ? (
          <div className="space-y-section">
            <WhereSold product={product} />
            <EntityHistory entity="product" entityId={product.id} />
          </div>
        ) : undefined
      }
    >
      {guard.dialog}
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-section">
          <FormErrorSummary
            title={t('common.errorSummary')}
            labels={{
              name: t('common.name'),
              code: t('common.code'),
              categoryId: t('common.category'),
              basePrice: t('products.basePrice'),
              barcodes: t('products.barcodes'),
            }}
          />
          <FormSection title={t('products.details')} description={t('products.detailsHint')}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t('common.name')}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t('common.code')}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      className="font-mono uppercase"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormDescription>{t('products.codeHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel required>{t('common.category')}</FormLabel>
                  <FormControl>
                    <CategorySelect
                      tree={tree.filter((c) => c.isActive || c.id === field.value)}
                      value={field.value || null}
                      onChange={(v) => field.onChange(v ?? '')}
                      placeholder={t('common.category')}
                      inactiveLabel={t('common.inactive')}
                      aria-invalid={!!fieldState.error}
                      triggerRef={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem data-span="full">
                  <FormLabel optionalLabel={t('common.optional')}>
                    {t('products.description')}
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title={t('common.translations')} description={t('common.translationsHint')}>
            <TranslationFields control={form.control} />
          </FormSection>

          <FormSection title={t('products.pricing')} description={t('products.pricingHint')}>
            <FormField
              control={form.control}
              name="basePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t('products.basePrice')}</FormLabel>
                  <FormControl>
                    <MoneyInput
                      currency={currency}
                      symbol={symbol}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="taxMode"
              render={({ field }) => (
                <FormItem data-span="full">
                  <FormLabel>{t('products.tax')}</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="gap-2 sm:grid-cols-2"
                    >
                      <RadioCard
                        value="INCLUSIVE"
                        icon={<TagIcon />}
                        title={t('products.taxINCLUSIVE')}
                        description={t('products.taxInclusiveHint')}
                      />
                      <RadioCard
                        value="EXCLUSIVE"
                        icon={<ReceiptIcon />}
                        title={t('products.taxEXCLUSIVE')}
                        description={t('products.taxExclusiveHint')}
                      />
                    </RadioGroup>
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="barcodes"
              render={({ field }) => (
                <FormItem data-span="full">
                  <FormLabel optionalLabel={t('common.optional')}>
                    {t('products.barcodes')}
                  </FormLabel>
                  <BarcodeList value={field.value} onChange={field.onChange} inputRef={field.ref} />
                  <FormDescription>{t('products.barcodesHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title={t('common.image')} description={t('common.imageHint')}>
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem data-span="full">
                  <ImageField
                    value={field.value}
                    onChange={field.onChange}
                    label={t('common.image')}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title={t('products.options')}>
            <FormField
              control={form.control}
              name="showOnQuickPad"
              render={({ field }) => (
                <FormItem className="flex min-h-touch items-center justify-between gap-4 rounded-lg border px-3">
                  <FormLabel>{t('products.showOnQuickPad')}</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            {product && (
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex min-h-touch items-center justify-between gap-4 rounded-lg border px-3 py-2">
                    <div className="space-y-0.5">
                      <FormLabel>{t('products.active')}</FormLabel>
                      <FormDescription>{t('products.activeHint')}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </FormSection>

          <FormActions>
            <Button type="button" variant="outline" onClick={() => navigate('/catalog/products')}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={saving}>
              {t('common.save')}
            </Button>
          </FormActions>
        </form>
      </Form>
    </Shell>
  );
}

/**
 * Barcode chips. A USB/Bluetooth scanner acts as a keyboard that types the code and presses
 * Enter, so the same field works for scanning and typing.
 */
function BarcodeList({
  value,
  onChange,
  inputRef,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  /** Lets a server field error (e.g. barcode already used) focus the scan input. */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const { t } = useTranslation('catalog');
  const [draft, setDraft] = useState('');
  const add = () => {
    const code = draft.trim();
    if (code && !value.includes(code)) onChange([...value, code]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <FormControl>
          <Input
            ref={inputRef}
            value={draft}
            inputMode="numeric"
            autoComplete="off"
            className="font-mono"
            placeholder="4790001000123"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </FormControl>
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
          <BarcodeIcon /> {t('products.barcodeAdd')}
        </Button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((code) => (
            <li
              key={code}
              className="flex items-center gap-1 rounded-full border bg-muted/50 py-1 pr-1 pl-3 font-mono text-sm"
            >
              {code}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                aria-label={t('products.barcodeRemove', { code })}
                onClick={() => onChange(value.filter((c) => c !== code))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Side card: which locations sell this product, and at what price (links to CAT-005/006). */
function WhereSold({ product }: { product: Product }) {
  const { t, i18n } = useTranslation('catalog');
  const locale = localeFor(i18n.language);
  const matrix = usePriceMatrix({ search: product.code, pageSize: 100 });
  const row = matrix.data?.items.find((r) => r.productId === product.id);
  const sold = matrix.data?.locations.filter((l) => row?.enabled[l.id]) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('products.whereSold')}</CardTitle>
        <CardDescription>{t('products.whereSoldHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {matrix.isPending ? (
          <Skeleton className="h-16" />
        ) : matrix.isError ? (
          <QueryError error={matrix.error} onRetry={() => matrix.refetch()} />
        ) : sold.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('products.notSoldAnywhere')}</p>
        ) : (
          <ul className="divide-y">
            {sold.map((l) => {
              const override = row?.prices[l.id] ?? null;
              return (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{l.name}</span>
                  <span className="flex items-center gap-2">
                    {!override && (
                      <StatusBadge tone="neutral" size="sm" hideIcon>
                        {t('products.usesBase')}
                      </StatusBadge>
                    )}
                    <MoneyText value={override ?? product.basePrice} locale={locale} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/catalog/location-products">{t('products.manageLocations')}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/catalog/pricing?q=${encodeURIComponent(product.code)}`}>
              {t('products.managePrices')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
