import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@rbp/api-client';
import type { Customer } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  Checkbox,
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
  PageHeader,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@rbp/ui';
import { formatPhone } from '@rbp/utils';
import {
  type CustomerFormInput,
  type CustomerFormValues,
  customerFormSchema,
  MAX_CUSTOMER_PHONES,
} from '@rbp/validation';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { applyServerErrors } from '@/lib/form-errors';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useCustomer, useSaveCustomer } from '../api/queries';

const LABELS = ['Mobile', 'Home', 'Work', 'Other'] as const;

/** Local 0… format for editing; the schema turns it back into E.164. */
const editable = (e164: string) => formatPhone(e164);

function toValues(customer: Customer | undefined, phone: string | null): CustomerFormInput {
  return {
    name: customer?.name ?? '',
    type: customer?.type ?? 'RETAIL',
    phones: customer?.phones.length
      ? customer.phones.map((p) => ({
          number: editable(p.number),
          label: p.label ?? (p.primary ? 'Mobile' : ''),
          primary: p.primary,
        }))
      : [{ number: phone ?? '', label: 'Mobile', primary: true }],
    address: customer?.address ?? '',
    deliveryAddress: customer?.deliveryAddress ?? '',
    notes: customer?.notes ?? '',
  };
}

/** CUS-002 Customer form (new + edit): several phones, addresses, type and notes. */
export function CustomerFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const customer = useCustomer(id);
  const { t } = useTranslation('customers');

  if (id && (customer.isPending || customer.error)) {
    return (
      <Shell title={t('form.editTitle')}>
        {customer.error ? (
          <QueryError error={customer.error} onRetry={() => customer.refetch()} />
        ) : (
          <Card className="p-6">
            <FormSkeleton fields={6} />
          </Card>
        )}
      </Shell>
    );
  }
  return <CustomerForm key={id ?? 'new'} customer={customer.data} phone={params.get('phone')} />;
}

function Shell({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  useBreadcrumbTitle(title);
  return (
    <Screen id="CUS-002" title={title} className="space-y-section">
      <PageHeader eyebrow={<PageBreadcrumbs />} title={title} />
      <div className="grid items-start gap-section xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">{children}</div>
        {aside}
      </div>
    </Screen>
  );
}

function CustomerForm({
  customer,
  phone,
}: {
  customer: Customer | undefined;
  phone: string | null;
}) {
  const { t } = useTranslation('customers');
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const save = useSaveCustomer();
  const sameId = useId();
  // `numbers` snapshots the phones that clashed: once any phone is edited the warning no
  // longer describes the form, so it hides even if the next submit fails client validation.
  const [clash, setClash] = useState<{ id: string; name: string; numbers: string } | null>(null);
  const [sameAsAddress, setSameAsAddress] = useState(
    !customer?.deliveryAddress || customer.deliveryAddress === customer.address,
  );
  const form = useForm<CustomerFormInput, unknown, CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: toValues(customer, phone),
  });
  const phones = useFieldArray({ control: form.control, name: 'phones' });
  const watched = useWatch({ control: form.control, name: 'phones' });
  const primaryIndex = Math.max(
    0,
    watched.findIndex((p) => p.primary),
  );
  const guard = useUnsavedChangesGuard(form.formState.isDirty && !save.isPending);
  const back = customer ? `/customers/${customer.id}` : '/customers';

  const phoneKey = watched.map((p) => p.number).join('|');
  const showClash = clash !== null && clash.numbers === phoneKey;

  const setPrimary = (index: number) =>
    watched.forEach((_, i) =>
      form.setValue(`phones.${i}.primary`, i === index, { shouldDirty: true }),
    );

  const onSubmit = form.handleSubmit((values) => {
    setClash(null);
    const body = {
      ...values,
      address: values.address ?? '',
      deliveryAddress: sameAsAddress ? '' : (values.deliveryAddress ?? ''),
      notes: values.notes ?? '',
    };
    save.mutate(
      { ...(customer ? { id: customer.id } : {}), body },
      {
        onSuccess: (saved) => {
          guard.bypass();
          toast.success(t(customer ? 'form.updated' : 'form.created', { name: saved.name }));
          navigate(`/customers/${saved.id}`);
        },
        onError: (error) => {
          if (isApiError(error) && error.code === 'CONFLICT' && error.details?.customerId) {
            setClash({
              id: String(error.details.customerId),
              name: String(error.details.customerName ?? ''),
              numbers: form
                .getValues('phones')
                .map((p) => p.number)
                .join('|'),
            });
          }
          if (!applyServerErrors(form, error)) toast.error(errorMessage(error));
        },
      },
    );
  });

  const rootPhonesError =
    form.formState.errors.phones?.root?.message ?? form.formState.errors.phones?.message;

  return (
    <Shell
      title={customer ? customer.name : t('form.newTitle')}
      aside={customer ? <EntityHistory entity="customer" entityId={customer.id} /> : undefined}
    >
      {guard.dialog}
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-section">
          <FormErrorSummary
            title={t('form.errorSummary')}
            labels={{ name: t('fields.name'), phones: t('fields.phones') }}
          />
          {showClash && (
            <Alert tone="warning" title={t('form.clashTitle', { name: clash.name })}>
              <Link to={`/customers/${clash.id}`} className="font-medium underline">
                {t('form.openClash', { name: clash.name })}
              </Link>
            </Alert>
          )}
          <FormSection title={t('form.details')} description={t('form.detailsHint')}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t('fields.name')}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.type')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger ref={field.ref}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(['RETAIL', 'REGULAR', 'CORPORATE'] as const).map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`type.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title={t('fields.phones')} description={t('form.phonesHint')}>
            <div data-span="full" className="space-y-3">
              <RadioGroup
                value={String(primaryIndex)}
                onValueChange={(v) => setPrimary(Number(v))}
                aria-label={t('form.primaryGroup')}
                className="gap-3"
              >
                {phones.fields.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid items-start gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto_auto]"
                  >
                    <FormField
                      control={form.control}
                      name={`phones.${index}.number`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required className="sr-only sm:not-sr-only">
                            {t('form.phoneN', { n: index + 1 })}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              inputMode="tel"
                              autoComplete="off"
                              placeholder="077 123 4567"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`phones.${index}.label`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only sm:not-sr-only">
                            {t('form.label')}
                          </FormLabel>
                          <Select value={field.value ?? ''} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger
                                ref={field.ref}
                                aria-label={t('form.labelFor', { n: index + 1 })}
                              >
                                <SelectValue placeholder={t('form.label')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {LABELS.map((l) => (
                                <SelectItem key={l} value={l}>
                                  {t(`form.labels.${l}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <label className="flex min-h-touch items-center gap-2 text-sm sm:mt-6">
                      <RadioGroupItem
                        value={String(index)}
                        aria-label={t('form.primaryFor', { n: index + 1 })}
                      />
                      {t('form.primary')}
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-touch text-destructive sm:mt-6"
                      disabled={phones.fields.length === 1}
                      aria-label={t('form.removePhone', { n: index + 1 })}
                      onClick={() => {
                        const wasPrimary = watched[index]?.primary;
                        phones.remove(index);
                        if (wasPrimary)
                          form.setValue('phones.0.primary', true, { shouldDirty: true });
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
              </RadioGroup>
              {rootPhonesError && (
                <p role="alert" className="text-sm text-destructive">
                  {t(`common:${rootPhonesError}`)}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={phones.fields.length >= MAX_CUSTOMER_PHONES}
                onClick={() => phones.append({ number: '', label: 'Home', primary: false })}
              >
                <PlusIcon /> {t('form.addPhone')}
              </Button>
            </div>
          </FormSection>

          <FormSection title={t('form.addresses')} description={t('form.addressesHint')}>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem data-span="full">
                  <FormLabel optionalLabel={t('form.optional')}>{t('fields.address')}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={200} autoComplete="street-address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div data-span="full" className="space-y-2">
              <label htmlFor={sameId} className="flex min-h-touch items-center gap-2 text-sm">
                <Checkbox
                  id={sameId}
                  checked={sameAsAddress}
                  onCheckedChange={(v) => setSameAsAddress(v === true)}
                />
                {t('form.sameAsAddress')}
              </label>
              {!sameAsAddress && (
                <FormField
                  control={form.control}
                  name="deliveryAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('fields.deliveryAddress')}</FormLabel>
                      <FormControl>
                        <Textarea rows={2} maxLength={200} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem data-span="full">
                  <FormLabel optionalLabel={t('form.optional')}>{t('fields.notes')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      maxLength={500}
                      placeholder={t('form.notesPlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormActions>
            <Button type="button" variant="outline" onClick={() => navigate(back)}>
              {t('form.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('form.save')}
            </Button>
          </FormActions>
        </form>
      </Form>
    </Shell>
  );
}
