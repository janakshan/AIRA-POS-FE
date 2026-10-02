import type { Order, PaymentMethod } from '@rbp/types';
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
import { BanknoteIcon, CreditCardIcon, HandCoinsIcon, LandmarkIcon, NfcIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { usePayOrder } from '../api/orders';
import { usePaymentMethods } from '../api/queries';
import type { CartView } from '../hooks/use-cart';
import type { useSaleActions } from '../hooks/use-sale-actions';

export interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartView;
  sale: ReturnType<typeof useSaleActions>;
  onPaid: (order: Order) => void;
}

const METHODS: { method: PaymentMethod; icon: ReactNode }[] = [
  { method: 'CASH', icon: <BanknoteIcon /> },
  { method: 'CARD', icon: <CreditCardIcon /> },
  { method: 'BANK_TRANSFER', icon: <LandmarkIcon /> },
  { method: 'CREDIT', icon: <HandCoinsIcon /> },
];

/** Cash quick amounts: exact, the next round 100, and common notes above the total. */
function cashPresets(total: number): number[] {
  const up = (step: number) => Math.ceil(total / step) * step;
  return [...new Set([up(10_000), up(50_000), up(100_000), up(500_000)])]
    .filter((v) => v > total)
    .slice(0, 3);
}

/**
 * POS-008 Payment (REQ-896…903): one method per sale (split payment is future).
 * Saves the draft as an order first, so a failed payment can be retried on the same order.
 */
export function PaymentDialog({ open, onOpenChange, cart, sale, onPaid }: PaymentDialogProps) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const pay = usePayOrder();
  const referenceId = useId();
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  // SET-006: only what the business accepts (cash is always on, so it stays the default).
  const accepted = usePaymentMethods().data;
  const methods = METHODS.filter(
    ({ method: m }) => !accepted || accepted.some((a) => a.method === m && a.enabled),
  );
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMethod('CASH');
      setTendered('');
      setReference('');
      setError(null);
    }
  }

  const total = cart.totals?.total ?? { amount: 0, currency: 'LKR' as const };
  const fmt = (amount: number) => formatMoney({ amount, currency: total.currency }, locale);
  const tenderedAmount = (() => {
    try {
      return tendered ? parseMoney(tendered, total.currency).amount : 0;
    } catch {
      return 0;
    }
  })();
  const change = tenderedAmount - total.amount;
  const canPay =
    total.amount > 0 &&
    (method !== 'CASH' || change >= 0) &&
    (method !== 'BANK_TRANSFER' || reference.trim().length > 0) &&
    (method !== 'CREDIT' || !!cart.customer);
  const busy = sale.saving || pay.isPending;

  const confirm = async () => {
    setError(null);
    let order: Order;
    try {
      order = await sale.saveOrder('OPEN');
    } catch (e) {
      toast.error(errorMessage(e));
      return;
    }
    pay.mutate(
      {
        id: order.id,
        body: {
          method,
          ...(method === 'CASH'
            ? { tendered: { amount: tenderedAmount, currency: total.currency } }
            : {}),
          ...(method === 'BANK_TRANSFER' ? { reference: reference.trim() } : {}),
        },
      },
      {
        onSuccess: onPaid,
        // The order stays OPEN and linked to the draft; paying again reuses it.
        onError: (e) =>
          setError(`${errorMessage(e)} ${t('payment.failed', { number: order.number })}`),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={t('payment.title')}
      closeLabel={t('closeSale')}
      size="lg"
      footer={
        <Button
          size="pos-lg"
          className="w-full sm:w-auto"
          disabled={!canPay || busy}
          loading={busy}
          onClick={() => void confirm()}
        >
          {t('payment.confirm', { amount: fmt(total.amount) })}
        </Button>
      }
    >
      <div data-screen-id="POS-008" className="grid gap-5 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <div className="rounded-xl bg-muted/60 px-4 py-3">
            <p className="text-sm text-muted-foreground">{t('payment.due')}</p>
            <p className="text-pos-total tabular">{fmt(total.amount)}</p>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t('payment.method')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {methods.map(({ method: m, icon }) => (
                <PaymentMethodButton
                  key={m}
                  icon={icon}
                  label={t(`payment.${m}`)}
                  selected={method === m}
                  disabled={m === 'CREDIT' && !cart.customer}
                  hint={m === 'CREDIT' && !cart.customer ? t('payment.creditHint') : undefined}
                  onClick={() => setMethod(m)}
                />
              ))}
            </div>
          </fieldset>
          {method === 'CARD' && (
            <p className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
              <NfcIcon className="size-5 text-primary" aria-hidden /> {t('payment.cardSteps')}
            </p>
          )}
          {method === 'BANK_TRANSFER' && (
            <div className="space-y-1.5">
              <label htmlFor={referenceId} className="text-sm font-medium">
                {t('payment.reference')}
              </label>
              <Input
                id={referenceId}
                value={reference}
                maxLength={40}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t('payment.referencePlaceholder')}
              />
            </div>
          )}
          {method === 'CREDIT' && cart.customer && (
            <p className="rounded-lg bg-status-warning/10 p-3 text-sm">
              {t('payment.creditNote', { amount: fmt(total.amount), name: cart.customer.name })}
            </p>
          )}
          {method === 'CASH' && (
            <div
              aria-live="polite"
              className={
                change >= 0 && tenderedAmount > 0
                  ? 'rounded-xl bg-status-success/10 px-4 py-3'
                  : 'rounded-xl bg-muted/40 px-4 py-3'
              }
            >
              {tenderedAmount > 0 && change < 0 ? (
                <p className="font-semibold text-destructive">
                  {t('payment.short', { amount: fmt(-change) })}
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{t('payment.change')}</p>
                  <p className="text-3xl font-bold tabular">{fmt(Math.max(change, 0))}</p>
                </>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        {method === 'CASH' && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={tenderedAmount === total.amount}
                onClick={() => setTendered(String(total.amount / 100))}
              >
                {t('payment.exact')}
              </FilterChip>
              {cashPresets(total.amount).map((v) => (
                <FilterChip
                  key={v}
                  active={tenderedAmount === v}
                  onClick={() => setTendered(String(v / 100))}
                >
                  {fmt(v)}
                </FilterChip>
              ))}
            </div>
            <NumericKeypad
              value={tendered}
              onChange={setTendered}
              mode="decimal"
              maxLength={9}
              label={t('payment.tendered')}
              display={fmt(tenderedAmount)}
            />
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
