import type { Customer } from '@rbp/types';
import { deliverySchema } from '@rbp/validation';
import { Button, FilterChip, Input, ResponsiveDialog, Textarea } from '@rbp/ui';
import { normalizePhone } from '@rbp/utils';
import { LoaderIcon, UserRoundCheckIcon, UserRoundIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCustomerByPhone } from '@/features/customers/api/queries';
import type { DraftCustomer, DraftDelivery } from '../store/cart-store';

type Errors = Partial<Record<keyof DraftDelivery, string>>;

/** A customer's known addresses, most relevant first (last delivery, then their address). */
const addressesOf = (c: Customer) => [
  ...new Set([c.deliveryAddress, c.address].filter((a): a is string => !!a?.trim())),
];

const asDraftCustomer = (c: Customer): DraftCustomer => ({
  id: c.id,
  name: c.name,
  phone: c.phones.find((p) => p.primary)?.number ?? c.phones[0]?.number ?? null,
});

/**
 * REST-006 delivery details. Phone comes first: a known customer is found by phone, their
 * saved delivery address is filled in and they're attached to the sale. New numbers are
 * typed in by hand; the address is remembered on the customer once the order is saved.
 */
export function DeliveryDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current details, or a prefill from the sale's customer. */
  initial: Partial<DraftDelivery>;
  /** `customer` is the customer found by phone (attach to the sale), else null. */
  onSave: (delivery: DraftDelivery, customer: DraftCustomer | null) => void;
}) {
  const { t } = useTranslation(['pos', 'common']);
  const id = useId();
  const [form, setForm] = useState<DraftDelivery>({ address: '', phone: '' });
  const [errors, setErrors] = useState<Errors>({});
  /** Customer whose address was last filled in, and that address (so edits aren't overwritten). */
  const [filled, setFilled] = useState<{ customerId: string; address: string } | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm({ address: '', phone: '', ...initial });
      setErrors({});
      setFilled(null);
    }
  }

  const validPhone = !!normalizePhone(form.phone);
  const lookup = useCustomerByPhone(open ? form.phone : '');
  const found = validPhone ? (lookup.data ?? null) : null;
  const known = found ? addressesOf(found) : [];

  // A newly found customer fills the address, unless staff already typed their own.
  if (found && found.id !== filled?.customerId) {
    const untouched = !form.address.trim() || form.address === filled?.address;
    const address = untouched ? (known[0] ?? form.address) : form.address;
    setFilled({ customerId: found.id, address });
    if (address !== form.address) {
      setForm((f) => ({ ...f, address }));
      setErrors(({ address: _, ...rest }) => rest);
    }
  }

  /** Editing a field clears its stale error; the next Save re-checks it. */
  const change = (key: keyof DraftDelivery, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors(({ [key]: _, ...rest }) => rest);
  };

  const submit = () => {
    const parsed = deliverySchema.safeParse({
      ...form,
      ...(form.instructions?.trim() ? {} : { instructions: undefined }),
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => {
            const key = String(i.path[0]);
            // A short address isn't an empty one: say how long it needs to be.
            if (key === 'address' && i.code === 'too_small' && form.address.trim()) {
              return [key, t('delivery.addressShort', { min: Number(i.minimum) })];
            }
            return [key, t(`common:${i.message}`)];
          }),
        ),
      );
      return;
    }
    const { instructions, ...rest } = parsed.data;
    onSave({ ...rest, ...(instructions ? { instructions } : {}) }, found && asDraftCustomer(found));
  };

  const field = (key: keyof DraftDelivery, control: ReactNode, extra?: ReactNode) => (
    <div className="space-y-1.5">
      <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
        {t(`delivery.${key}`)}
      </label>
      {control}
      {errors[key] && (
        <p id={`${id}-${key}-error`} role="alert" className="text-sm text-destructive">
          {errors[key]}
        </p>
      )}
      {extra}
    </div>
  );
  const describedBy = (key: keyof DraftDelivery) =>
    errors[key] ? { 'aria-invalid': true, 'aria-describedby': `${id}-${key}-error` } : {};

  const phoneStatus = !validPhone ? (
    <p className="text-xs text-muted-foreground">{t('delivery.phoneHint')}</p>
  ) : lookup.isFetching && !found ? (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      <LoaderIcon className="size-3.5 animate-spin" aria-hidden /> {t('delivery.looking')}
    </p>
  ) : found ? (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-status-success/40 bg-status-success/10 px-3 py-2 text-sm"
    >
      <UserRoundCheckIcon className="mt-0.5 size-4 shrink-0 text-status-success-fg" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{t('delivery.found', { name: found.name })}</p>
        <p className="text-xs text-muted-foreground">
          {known.includes(form.address)
            ? t('delivery.filled')
            : known.length
              ? t('delivery.keptAddress')
              : t('delivery.noSavedAddress')}
        </p>
        {found.notes && <p className="mt-1 text-xs font-medium">{found.notes}</p>}
      </div>
    </div>
  ) : (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      <UserRoundIcon className="size-3.5" aria-hidden /> {t('delivery.newNumber')}
    </p>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('delivery.title')}
      closeLabel={t('closeSale')}
      size="md"
      footer={
        <Button size="pos" className="w-full sm:w-auto" onClick={submit}>
          {t('delivery.save')}
        </Button>
      }
    >
      <form
        data-screen-id="REST-006"
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {field(
          'phone',
          <Input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            autoFocus
            maxLength={20}
            placeholder="077 123 4567"
            value={form.phone}
            onChange={(e) => change('phone', e.target.value)}
            {...describedBy('phone')}
          />,
          phoneStatus,
        )}
        {field(
          'address',
          <Textarea
            id={`${id}-address`}
            rows={2}
            maxLength={200}
            value={form.address}
            onChange={(e) => change('address', e.target.value)}
            {...describedBy('address')}
          />,
          known.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('delivery.saved')}>
              {known.map((a) => (
                <FilterChip
                  key={a}
                  active={form.address === a}
                  onClick={() => change('address', a)}
                >
                  {a}
                </FilterChip>
              ))}
            </div>
          ),
        )}
        {field(
          'instructions',
          <Input
            id={`${id}-instructions`}
            maxLength={200}
            placeholder={t('delivery.instructionsPlaceholder')}
            value={form.instructions ?? ''}
            onChange={(e) => change('instructions', e.target.value)}
          />,
        )}
        <button type="submit" hidden />
      </form>
    </ResponsiveDialog>
  );
}
