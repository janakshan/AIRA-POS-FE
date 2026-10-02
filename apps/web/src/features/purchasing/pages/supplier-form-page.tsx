import { zodResolver } from '@hookform/resolvers/zod';
import type { Supplier, SupplierRequest } from '@rbp/types';
import {
  Button,
  Card,
  Form,
  FormActions,
  FormControl,
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
  Textarea,
  toast,
} from '@rbp/ui';
import { type SupplierInput, supplierSchema } from '@rbp/validation';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { applyServerErrors } from '@/lib/form-errors';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useSaveSupplier, useSupplier } from '../api/queries';

const toValues = (s: Supplier | undefined): SupplierInput => ({
  name: s?.name ?? '',
  contactName: s?.contactName ?? '',
  phone: s?.phone ?? '',
  email: s?.email ?? '',
  address: s?.address ?? '',
  paymentTermsDays: s?.paymentTermsDays ?? 14,
  note: s?.note ?? '',
});

/** PUR-002 supplier form (new + edit), reached from the list or the supplier detail. */
export function SupplierFormPage() {
  const { id } = useParams();
  const { t } = useTranslation('purchasing');
  const supplier = useSupplier(id);
  if (id && (supplier.isPending || supplier.error)) {
    return (
      <Shell title={t('supplierForm.editTitle')}>
        {supplier.error ? (
          <QueryError error={supplier.error} onRetry={() => supplier.refetch()} />
        ) : (
          <Card className="p-6">
            <FormSkeleton fields={6} />
          </Card>
        )}
      </Shell>
    );
  }
  return <SupplierForm key={id ?? 'new'} supplier={supplier.data} />;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  useBreadcrumbTitle(title);
  return (
    <Screen id="PUR-002" title={title} className="space-y-section">
      <PageHeader eyebrow={<PageBreadcrumbs />} title={title} />
      <div className="max-w-3xl">{children}</div>
    </Screen>
  );
}

function SupplierForm({ supplier }: { supplier: Supplier | undefined }) {
  const { t } = useTranslation('purchasing');
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const save = useSaveSupplier();
  const form = useForm<SupplierInput, unknown, SupplierRequest>({
    resolver: zodResolver(supplierSchema),
    defaultValues: toValues(supplier),
  });
  const guard = useUnsavedChangesGuard(form.formState.isDirty && !save.isPending);
  const back = supplier ? `/purchasing/suppliers/${supplier.id}` : '/purchasing/suppliers';

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(
      {
        ...(supplier ? { id: supplier.id } : {}),
        // '' clears an optional field on the server.
        body: { ...values, email: values.email ?? '' },
      },
      {
        onSuccess: (saved) => {
          guard.bypass();
          toast.success(
            t(supplier ? 'supplierForm.updated' : 'supplierForm.created', { name: saved.name }),
          );
          navigate(`/purchasing/suppliers/${saved.id}`);
        },
        onError: (error) => {
          if (!applyServerErrors(form, error)) toast.error(errorMessage(error));
        },
      },
    ),
  );

  const text = (
    name: 'name' | 'contactName' | 'phone' | 'email',
    opts: { required?: boolean; type?: string; autoComplete?: string } = {},
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel
            required={opts.required}
            {...(opts.required ? {} : { optionalLabel: t('supplierForm.optional') })}
          >
            {t(`fields.${name}`)}
          </FormLabel>
          <FormControl>
            <Input
              type={opts.type ?? 'text'}
              autoComplete={opts.autoComplete ?? 'off'}
              {...field}
              value={field.value ?? ''}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Shell title={supplier ? supplier.name : t('supplierForm.newTitle')}>
      {guard.dialog}
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-section">
          <FormErrorSummary
            title={t('supplierForm.errorSummary')}
            labels={{ name: t('fields.name'), email: t('fields.email') }}
          />
          <FormSection
            title={t('supplierForm.details')}
            description={t('supplierForm.detailsHint')}
          >
            {text('name', { required: true })}
            <FormField
              control={form.control}
              name="paymentTermsDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.paymentTerms')}</FormLabel>
                  <FormControl>
                    <NumberInput
                      value={field.value ?? null}
                      onChange={(v) => field.onChange(v ?? 0)}
                      min={0}
                      max={365}
                      decrementLabel={t('supplierForm.fewerDays')}
                      incrementLabel={t('supplierForm.moreDays')}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">{t('supplierForm.termsHint')}</p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
          <FormSection
            title={t('supplierForm.contact')}
            description={t('supplierForm.contactHint')}
          >
            {text('contactName')}
            {text('phone', { type: 'tel' })}
            {text('email', { type: 'email', autoComplete: 'email' })}
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem data-span="full">
                  <FormLabel optionalLabel={t('supplierForm.optional')}>
                    {t('fields.address')}
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={200} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem data-span="full">
                  <FormLabel optionalLabel={t('supplierForm.optional')}>
                    {t('fields.note')}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      maxLength={500}
                      placeholder={t('supplierForm.notePlaceholder')}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
          <FormActions>
            <Button type="button" variant="outline" onClick={() => navigate(back)}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('supplierForm.save')}
            </Button>
          </FormActions>
        </form>
      </Form>
    </Shell>
  );
}
