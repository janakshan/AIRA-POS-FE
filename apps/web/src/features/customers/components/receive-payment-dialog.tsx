import type { Customer, CustomerPaymentMethod } from '@rbp/types';
import {
  Button,
  FilterChip,
  Input,
  NumericKeypad,
  PaymentMethodButton,
  ResponsiveDialog,
  toast,
} from '@rbp/ui';
import { formatMoney, parseMoney } from '@rbp/utils';
import { BanknoteIcon, CreditCardIcon, LandmarkIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useReceiveCustomerPayment } from '../api/queries';

const METHODS: { method: CustomerPaymentMethod; icon: ReactNode }[] = [
  { method: 'CASH', icon: <BanknoteIcon /> },
  { method: 'CARD', icon: <CreditCardIcon /> },
  { method: 'BANK_TRANSFER', icon: <LandmarkIcon /> },
];

/** CUS-005 money received against the customer's balance (never more than they owe). */
export function ReceivePaymentDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation('customers');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const receive = useReceiveCustomerPayment();
  const referenceId = useId();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<CustomerPaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAmount('');
      setMethod('CASH');
      setReference('');
    }
  }

  const owed = customer.outstanding;
  const fmt = (minor: number) => formatMoney({ amount: minor, currency: owed.currency }, locale);
  const value = (() => {
    try {
      return amount ? parseMoney(amount, owed.currency).amount : 0;
    } catch {
      return 0;
    }
  })();
  const tooMuch = value > owed.amount;
  const canSubmit =
    value > 0 && !tooMuch && (method !== 'BANK_TRANSFER' || reference.trim().length > 0);

  const submit = () =>
    receive.mutate(
      {
        id: customer.id,
        body: {
          amount: { amount: value, currency: owed.currency },
          method,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        },
      },
      {
        onSuccess: ({ payment, customer: updated }) => {
          toast.success(
            t('balance.received', {
              number: payment.number,
              amount: formatMoney(payment.amount, locale),
              balance: formatMoney(updated.outstanding, locale),
            }),
          );
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !receive.isPending && onOpenChange(o)}
      title={t('balance.receiveTitle', { name: customer.name })}
      description={t('balance.owes', { amount: fmt(owed.amount) })}
      closeLabel={t('common:actions.close')}
      size="lg"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!canSubmit || receive.isPending}
          loading={receive.isPending}
          onClick={submit}
        >
          {t('balance.confirm', { amount: fmt(value) })}
        </Button>
      }
    >
      <div data-screen-id="CUS-005" className="grid gap-5 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t('balance.method')}</legend>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(({ method: m, icon }) => (
                <PaymentMethodButton
                  key={m}
                  icon={icon}
                  label={t(`orders.method.${m}`)}
                  selected={method === m}
                  onClick={() => setMethod(m)}
                />
              ))}
            </div>
          </fieldset>
          {method === 'BANK_TRANSFER' && (
            <div className="space-y-1.5">
              <label htmlFor={referenceId} className="text-sm font-medium">
                {t('balance.reference')}
              </label>
              <Input
                id={referenceId}
                value={reference}
                maxLength={40}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          )}
          <div
            aria-live="polite"
            className={
              tooMuch
                ? 'rounded-xl bg-destructive/10 px-4 py-3'
                : 'rounded-xl bg-muted/60 px-4 py-3'
            }
          >
            {tooMuch ? (
              <p className="font-semibold text-destructive">{t('balance.tooMuch')}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t('balance.after')}</p>
                <p className="text-2xl font-bold tabular">{fmt(owed.amount - value)}</p>
              </>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <FilterChip
              active={value === owed.amount}
              onClick={() => setAmount(String(owed.amount / 100))}
            >
              {t('balance.full')}
            </FilterChip>
          </div>
          <NumericKeypad
            value={amount}
            onChange={setAmount}
            mode="decimal"
            maxLength={9}
            label={t('balance.amount')}
            display={fmt(value)}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
