import { zodResolver } from '@hookform/resolvers/zod';
import type { CategoryTreeNode } from '@rbp/types';
import {
  Button,
  Card,
  ColorSwatchPicker,
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
  NumberInput,
  PageHeader,
  SWATCH_COLORS,
  toast,
} from '@rbp/ui';
import { categoryInputSchema } from '@rbp/validation';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { applyServerErrors } from '@/lib/form-errors';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useCategoryTree, useCreateCategory, useUpdateCategory } from '../api/queries';
import { CategorySelect } from '../components/category-select';
import { ImageField } from '../components/image-field';
import { TranslationFields } from '../components/translation-fields';

const formSchema = categoryInputSchema.extend({
  parentId: z.string().nullable(),
  sortOrder: z.number().int().min(0).nullable(),
});
type FormValues = z.infer<typeof formSchema>;

function toValues(category: CategoryTreeNode | undefined, parentId: string | null): FormValues {
  return {
    code: category?.code ?? '',
    name: category?.name ?? '',
    color: category?.color ?? SWATCH_COLORS[0],
    imageUrl: category?.imageUrl ?? null,
    nameTranslations: {
      ta: category?.nameTranslations.ta ?? '',
      si: category?.nameTranslations.si ?? '',
    },
    parentId: category ? category.parentId : parentId,
    sortOrder: category?.sortOrder ?? null,
  };
}

/** CAT-002 Category Form (new + edit). */
export function CategoryFormPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const tree = useCategoryTree();
  const category = id ? tree.data?.find((c) => c.id === id) : undefined;

  if (tree.isPending) {
    return (
      <Shell editing={!!id} title={undefined}>
        <Card className="p-6">
          <FormSkeleton fields={5} />
        </Card>
      </Shell>
    );
  }
  if (tree.isError || (id && !category)) {
    return (
      <Shell editing={!!id} title={undefined}>
        <QueryError error={tree.error} onRetry={() => tree.refetch()} />
      </Shell>
    );
  }
  return (
    <CategoryForm
      key={id ?? 'new'}
      tree={tree.data}
      category={category}
      defaultParent={search.get('parent')}
    />
  );
}

function Shell({
  editing,
  title,
  children,
}: {
  editing: boolean;
  title: string | undefined;
  children: ReactNode;
}) {
  const { t } = useTranslation('catalog');
  useBreadcrumbTitle(title ?? t(editing ? 'categories.formEdit' : 'categories.formNew'));
  return (
    <Screen
      id="CAT-002"
      title={title ?? t(editing ? 'categories.formEdit' : 'categories.formNew')}
      className="mx-auto max-w-3xl space-y-section"
    >
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={title ?? t(editing ? 'categories.formEdit' : 'categories.formNew')}
      />
      {children}
    </Screen>
  );
}

function CategoryForm({
  tree,
  category,
  defaultParent,
}: {
  tree: CategoryTreeNode[];
  category: CategoryTreeNode | undefined;
  defaultParent: string | null;
}) {
  const { t } = useTranslation('catalog');
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toValues(category, defaultParent),
  });
  const saving = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    const body = { ...values, sortOrder: values.sortOrder ?? undefined };
    const onError = (error: unknown) => {
      if (!applyServerErrors(form, error)) toast.error(errorMessage(error));
    };
    const done = (key: string) => {
      guard.bypass();
      toast.success(t(key, { name: values.name }));
      navigate('/catalog/categories');
    };
    if (category) {
      update.mutate(
        { id: category.id, body },
        { onSuccess: () => done('categories.updated'), onError },
      );
    } else {
      create.mutate(body, { onSuccess: () => done('categories.created'), onError });
    }
  });

  const guard = useUnsavedChangesGuard(form.formState.isDirty && !saving);

  return (
    <Shell editing={!!category} title={category?.name}>
      {guard.dialog}
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-section">
          <FormErrorSummary
            title={t('common.errorSummary')}
            labels={{
              code: t('common.code'),
              name: t('common.name'),
              parentId: t('categories.parent'),
              color: t('common.color'),
            }}
          />
          <FormSection title={t('categories.details')} description={t('categories.detailsHint')}>
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
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="parentId"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t('categories.parent')}</FormLabel>
                  <FormControl>
                    <CategorySelect
                      tree={tree}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t('categories.topLevel')}
                      noneLabel={t('categories.topLevel')}
                      inactiveLabel={t('common.inactive')}
                      {...(category ? { excludeSubtreeOf: category.id } : {})}
                      aria-invalid={!!fieldState.error}
                      triggerRef={field.ref}
                    />
                  </FormControl>
                  <FormDescription>{t('categories.parentHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sortOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel optionalLabel={t('common.optional')}>
                    {t('categories.sortOrder')}
                  </FormLabel>
                  <FormControl>
                    <NumberInput
                      min={0}
                      max={999}
                      value={field.value}
                      onChange={field.onChange}
                      name={field.name}
                    />
                  </FormControl>
                  <FormDescription>{t('categories.sortOrderHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
          <FormSection title={t('common.translations')} description={t('common.translationsHint')}>
            <TranslationFields control={form.control} />
          </FormSection>
          <FormSection
            title={t('categories.appearance')}
            description={t('categories.appearanceHint')}
          >
            <FormField
              control={form.control}
              name="color"
              render={({ field, fieldState }) => (
                <FormItem data-span="full">
                  <FormLabel required>{t('common.color')}</FormLabel>
                  <FormControl>
                    <ColorSwatchPicker
                      value={field.value}
                      onChange={field.onChange}
                      label={t('common.color')}
                      customLabel={t('common.customColor')}
                      aria-invalid={!!fieldState.error}
                    />
                  </FormControl>
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
          <FormActions>
            <Button type="button" variant="outline" onClick={() => navigate('/catalog/categories')}>
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
