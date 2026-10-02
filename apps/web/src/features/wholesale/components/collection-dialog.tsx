import type { Money, WholesalePaymentMethod, WholesaleShop } from '@rbp/types';
import { Button, Input, MoneyInput, PaymentMethodButton, ResponsiveDialog, toast } from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useCreateCollection } from '../api/queries';
import { METHODS } from '../lib/methods';

/** WHO-004 money from a shop; applied to its oldest invoices first (never more than owed). */
export function CollectionDialog({
  shop,
  onOpenChange,
}: {
  shop: WholesaleShop | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const create = useCreateCollection();
  const ids = { amount: useId(), reference: useId() };
  const [amount, setAmount] = useState<Money | null>(null);
  const [method, setMethod] = useState<WholesalePaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [was, setWas] = useState(shop);
  if (shop !== was) {
    setWas(shop);
    setAmount(shop ? shop.outstanding : null);
    setMethod('CASH');
    setReference('');
  }
  const owed = shop?.outstanding.amount ?? 0;
  const value = amount?.amount ?? 0;
  const tooMuch = value > owed;
  const needsRef = method !== 'CASH';
  const valid = value > 0 && !tooMuch && (!needsRef || reference.trim().length > 0);
  const fmt = (minor: number) => formatMoney({ amount: minor, currency: 'LKR' }, locale);

  const submit = () =>
    shop &&
    create.mutate(
      {
        shopId: shop.id,
        amount: value,
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      },
      {
        onSuccess: (c) => {
          toast.success(
            t('collect.done', {
              number: c.number,
              amount: formatMoney(c.amount, locale),
              balance: formatMoney(c.balanceAfter, locale),
            }),
          );
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <ResponsiveDialog
      open={!!shop}
      onOpenChange={(o) => !create.isPending && onOpenChange(o)}
      title={t('collect.title', { name: shop?.name ?? '' })}
      description={t('collect.owes', { amount: fmt(owed) })}
      closeLabel={t('close')}
      size="md"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!valid}
          loading={create.isPending}
          onClick={submit}
        >
          {t('collect.confirm', { amount: fmt(value) })}
        </Button>
      }
    >
      <div data-screen-id="WHO-004" className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('fields.method')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ method: m, icon }) => (
              <PaymentMethodButton
                key={m}
                icon={icon}
                label={t(`method.${m}`)}
                selected={method === m}
                onClick={() => setMethod(m)}
              />
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <label htmlFor={ids.amount} className="text-sm font-medium">
            {t('fields.amount')}
          </label>
          <MoneyInput
            id={ids.amount}
            value={amount}
            onChange={setAmount}
            currency="LKR"
            symbol="Rs"
          />
        </div>
        {needsRef && (
          <div className="space-y-1.5">
            <label htmlFor={ids.reference} className="text-sm font-medium">
              {t(method === 'CHEQUE' ? 'collect.chequeNo' : 'collect.reference')}
            </label>
            <Input
              id={ids.reference}
              value={reference}
              maxLength={40}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        )}
        <p
          aria-live="polite"
          className={
            tooMuch
              ? 'rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive'
              : 'rounded-lg bg-muted/60 px-3 py-2 text-sm'
          }
        >
          {tooMuch
            ? t('collect.tooMuch')
            : t('collect.after', { amount: fmt(Math.max(0, owed - value)) })}
        </p>
      </div>
    </ResponsiveDialog>
  );
}
