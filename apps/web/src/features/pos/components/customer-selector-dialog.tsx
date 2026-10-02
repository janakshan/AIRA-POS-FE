import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@rbp/api-client';
import type { Customer } from '@rbp/types';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
  KeyGrid,
  PIN_KEYS,
  ResponsiveDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
  toast,
} from '@rbp/ui';
import { formatMoney, formatPhone, normalizePhone } from '@rbp/utils';
import { type QuickCustomerInput, quickCustomerSchema } from '@rbp/validation';
import { UserPlusIcon, UserRoundCheckIcon, UserRoundIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useAccess } from '@/features/auth/hooks/use-access';
import {
  useCreateCustomer,
  useCustomerByPhone,
  useCustomerSearch,
} from '@/features/customers/api/queries';
import { applyServerErrors } from '@/lib/form-errors';
import type { DraftCustomer } from '../store/cart-store';

export interface CustomerSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (customer: DraftCustomer) => void;
}

const toDraft = (c: Customer): DraftCustomer => ({
  id: c.id,
  name: c.name,
  phone: c.phones.find((p) => p.primary)?.number ?? c.phones[0]?.number ?? null,
});

/**
 * POS-003 Customer Selector (REQ-415…419): phone first — found → select; not found →
 * quick-create with the phone prefilled. Name search as a fallback.
 */
export function CustomerSelectorDialog({
  open,
  onOpenChange,
  onSelect,
}: CustomerSelectorDialogProps) {
  const { t } = useTranslation('pos');
  const [phone, setPhone] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  // Fresh dialog every time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPhone('');
      setNameQuery('');
    }
  }

  const choose = (customer: Customer) => {
    onSelect(toDraft(customer));
    toast.success(t('customer.selected', { name: customer.name }));
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('customer.title')}
      description={t('customer.description')}
      closeLabel={t('closeSale')}
      size="lg"
    >
      <div data-screen-id="POS-003" className="grid gap-5 md:grid-cols-[18rem_minmax(0,1fr)]">
        <PhoneEntry value={phone} onChange={setPhone} />
        <div className="min-w-0 space-y-5">
          <PhoneResult phone={phone} onChoose={choose} />
          <NameSearch query={nameQuery} onQueryChange={setNameQuery} onChoose={choose} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function PhoneEntry({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation('pos');
  const id = useId();
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          {t('customer.phone')}
        </label>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 16))}
          placeholder={t('customer.phonePlaceholder')}
          className="h-touch-pos text-xl tabular"
        />
        <p className="text-xs text-muted-foreground">{t('customer.phoneHint')}</p>
      </div>
      {/* Touch keypad for counter terminals/tablets; phones use their own numeric keyboard. */}
      <KeyGrid
        keys={PIN_KEYS}
        captureKeyboard={false}
        className="hidden md:grid"
        clearLabel={t('clear')}
        backspaceLabel={t('common:actions.clear')}
        onKey={(key) => {
          if (key === 'clear') onChange('');
          else if (key === 'back') onChange(value.slice(0, -1));
          else if (value.replace(/\D/g, '').length < 12) onChange(value + key);
        }}
      />
    </div>
  );
}

function PhoneResult({ phone, onChoose }: { phone: string; onChoose: (c: Customer) => void }) {
  const { t } = useTranslation('pos');
  const e164 = normalizePhone(phone);
  const lookup = useCustomerByPhone(phone);
  const digits = phone.replace(/\D/g, '');

  if (!digits) return null;
  if (!e164) {
    return <p className="text-sm text-muted-foreground">{t('customer.invalidPhone')}</p>;
  }
  if (lookup.isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        <p className="text-sm text-muted-foreground">{t('customer.searching')}</p>
        <Skeleton className="h-20" />
      </div>
    );
  }
  if (lookup.data) {
    return (
      <section aria-label={t('customer.found')} className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{t('customer.found')}</h3>
        <CustomerCard customer={lookup.data} onChoose={onChoose} highlight />
      </section>
    );
  }
  return <QuickCreate phone={e164} onCreated={onChoose} />;
}

function CustomerCard({
  customer,
  onChoose,
  highlight,
}: {
  customer: Customer;
  onChoose: (c: Customer) => void;
  highlight?: boolean;
}) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const primary = customer.phones.find((p) => p.primary) ?? customer.phones[0];
  return (
    <div
      className={
        highlight
          ? 'flex flex-wrap items-center gap-3 rounded-xl border-2 border-primary bg-primary/5 p-3'
          : 'flex flex-wrap items-center gap-3 rounded-xl border p-3'
      }
    >
      <UserRoundCheckIcon className="size-6 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{customer.name}</p>
        <p className="text-sm text-muted-foreground tabular">
          {primary ? formatPhone(primary.number) : ''}
          {customer.type !== 'RETAIL' && ` · ${t(`customer.type${customer.type}`)}`}
        </p>
        {customer.outstanding.amount > 0 && (
          <StatusBadge tone="warning" size="sm" className="mt-1">
            {t('customer.owes', { amount: formatMoney(customer.outstanding, locale) })}
          </StatusBadge>
        )}
      </div>
      <Button
        size="pos"
        onClick={() => onChoose(customer)}
        aria-label={t('customer.selectNamed', { name: customer.name })}
      >
        {t('customer.select')}
      </Button>
    </div>
  );
}

function NameSearch({
  query,
  onQueryChange,
  onChoose,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onChoose: (c: Customer) => void;
}) {
  const { t } = useTranslation('pos');
  const id = useId();
  const term = query.trim();
  const results = useCustomerSearch({ search: term, pageSize: 5 }, term.length >= 2);
  return (
    <section className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {t('customer.orName')}
      </label>
      <Input
        id={id}
        value={query}
        autoComplete="off"
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t('customer.namePlaceholder')}
      />
      {term.length >= 2 &&
        (results.data?.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('customer.noNameMatches', { query: term })}
          </p>
        ) : (
          <ul className="space-y-2">
            {results.data?.items.map((c) => (
              <li key={c.id}>
                <CustomerCard customer={c} onChoose={onChoose} />
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

function QuickCreate({ phone, onCreated }: { phone: string; onCreated: (c: Customer) => void }) {
  const { t } = useTranslation('pos');
  const { can } = useAccess();
  const errorMessage = useErrorMessage();
  const create = useCreateCustomer();
  const [clash, setClash] = useState<{ id: string; name: string } | null>(null);
  const clashLookup = useCustomerByPhone(clash ? phone : '');
  const form = useForm<QuickCustomerInput>({
    resolver: zodResolver(quickCustomerSchema),
    defaultValues: { name: '', phone, type: 'RETAIL', address: '' },
  });

  if (!can('customer.manage') && !can('pos.sale.create')) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm">
        <p className="font-medium">{t('customer.notFound', { phone: formatPhone(phone) })}</p>
        <p className="mt-1 text-muted-foreground">{t('customer.cannotCreate')}</p>
      </div>
    );
  }

  if (clash) {
    const existing = clashLookup.data;
    return (
      <div className="space-y-3 rounded-xl border border-status-warning/50 bg-status-warning/10 p-4">
        <p className="font-medium">
          {t('customer.phoneTakenTitle', { phone: formatPhone(phone), name: clash.name })}
        </p>
        {existing && (
          <Button size="pos" onClick={() => onCreated(existing)}>
            {t('customer.useExisting', { name: clash.name })}
          </Button>
        )}
      </div>
    );
  }

  const onSubmit = form.handleSubmit((values) =>
    create.mutate(
      {
        name: values.name,
        phone,
        ...(values.type ? { type: values.type } : {}),
        ...(values.address?.trim() ? { address: values.address.trim() } : {}),
      },
      {
        onSuccess: (customer) => {
          toast.success(t('customer.created', { name: customer.name }));
          onCreated(customer);
        },
        onError: (error) => {
          if (isApiError(error) && error.code === 'CONFLICT' && error.details?.customerId) {
            setClash({
              id: String(error.details.customerId),
              name: String(error.details.customerName ?? ''),
            });
          } else if (!applyServerErrors(form, error)) {
            toast.error(errorMessage(error));
          }
        },
      },
    ),
  );

  return (
    <section
      aria-labelledby="quick-create-title"
      className="space-y-3 rounded-xl border border-dashed p-4"
    >
      <p className="text-sm text-muted-foreground">
        {t('customer.notFound', { phone: formatPhone(phone) })}
      </p>
      <h3 id="quick-create-title" className="flex items-center gap-2 font-semibold">
        <UserPlusIcon className="size-5" aria-hidden /> {t('customer.createTitle')}
      </h3>
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t('customer.name')}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('customer.address')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    maxLength={200}
                    autoComplete="street-address"
                    placeholder={t('customer.addressPlaceholder')}
                    {...field}
                  />
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
                <FormLabel>{t('customer.type')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(['RETAIL', 'REGULAR', 'CORPORATE'] as const).map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`customer.type${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <Button type="submit" size="pos" className="w-full" loading={create.isPending}>
            <UserRoundIcon /> {t('customer.create')}
          </Button>
        </form>
      </Form>
    </section>
  );
}
