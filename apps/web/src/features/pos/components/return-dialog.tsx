import type { Order } from '@rbp/types';
import {
  Button,
  Checkbox,
  QuantityStepper,
  RadioGroup,
  RadioGroupItem,
  ResponsiveDialog,
  Skeleton,
  toast,
} from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { useErrorMessage } from '@/components/use-error-message';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { localizedName } from '@/features/catalog/lib/localized-name';
import { useCreateReturn, useOrder } from '../api/orders';

/**
 * Estimated refund for the chosen units: their share of each line's net after discounts plus
 * the matching share of service charge and tax. The server computes the exact figure.
 */
function estimateRefund(order: Order, picked: Record<string, number>): number {
  const t = order.totals;
  const net = (productId: string) =>
    t.lines.find((l) => l.productId === productId)?.net.amount ?? 0;
  const scBase = order.lines.reduce((s, l) => s + (l.serviceCharge ? net(l.productId) : 0), 0);
  const taxBase = order.lines.reduce(
    (s, l) => s + (l.taxMode === 'EXCLUSIVE' ? net(l.productId) : 0),
    0,
  );
  return order.lines.reduce((sum, l) => {
    const q = picked[l.id] ?? 0;
    if (!q || !l.quantity) return sum;
    const part = (net(l.productId) * q) / l.quantity;
    const sc = l.serviceCharge && scBase ? (t.serviceCharge.amount * part) / scBase : 0;
    const tax = l.taxMode === 'EXCLUSIVE' && taxBase ? (t.tax.amount * part) / taxBase : 0;
    return sum + Math.round(part + sc + tax);
  }, 0);
}

/** POS-011 Return (REQ-225/228, SCN-007): pick items → refund method → PIN → reason. */
export function ReturnDialog({
  orderId,
  onOpenChange,
  onDone,
}: {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
  onDone: (order: Order, returnId: string) => void;
}) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const confirmSensitive = useSensitiveAction();
  const order = useOrder(orderId);
  const create = useCreateReturn();
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'ORIGINAL'>('ORIGINAL');
  const [restock, setRestock] = useState(true);
  const restockId = useId();

  const [wasOpen, setWasOpen] = useState(orderId);
  if (orderId !== wasOpen) {
    setWasOpen(orderId);
    setPicked({});
    setRefundMethod('ORIGINAL');
    setRestock(true);
  }

  const data = order.data;
  const original = data?.payments.find((p) => p.kind === 'SALE');
  const estimate = data ? estimateRefund(data, picked) : 0;
  const count = Object.values(picked).reduce((s, q) => s + q, 0);
  const money = (amount: number) =>
    formatMoney({ amount, currency: data?.totals.total.currency ?? 'LKR' }, locale);

  const submit = async () => {
    if (!data) return;
    const lines = Object.entries(picked)
      .filter(([, q]) => q > 0)
      .map(([lineId, quantity]) => ({ lineId, quantity }));
    const items = lines
      .map(
        ({ lineId, quantity }) => `${data.lines.find((l) => l.id === lineId)?.name} ×${quantity}`,
      )
      .join(', ');
    const verification = await confirmSensitive('pos.return', {
      reasonTitle: t('returns.reasonTitle'),
      reasonDescription: t('returns.reasonDescription'),
      summary: `${data.number} · ${items} · ${money(estimate)}`,
    });
    if (!verification) return;
    create.mutate(
      { id: data.id, body: { lines, refundMethod, restock, verification } },
      {
        onSuccess: (updated) => {
          const ret = updated.returns.at(-1);
          if (!ret) return;
          toast.success(
            t('returns.done', { number: ret.number, amount: formatMoney(ret.amount, locale) }),
          );
          onDone(updated, ret.id);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={!!orderId}
      onOpenChange={onOpenChange}
      title={data ? t('returns.title', { number: data.number }) : ' '}
      description={t('returns.hint')}
      closeLabel={t('closeSale')}
      size="lg"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={count === 0 || create.isPending}
          loading={create.isPending}
          onClick={() => void submit()}
        >
          {t('returns.refund', { amount: money(estimate) })}
        </Button>
      }
    >
      <div data-screen-id="POS-011" className="space-y-4">
        {order.isError ? (
          <QueryError error={order.error} onRetry={() => order.refetch()} />
        ) : !data ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <ul className="divide-y rounded-xl border">
              {data.lines
                .filter((l) => l.quantity > 0)
                .map((l) => {
                  const remaining = l.quantity - l.returnedQuantity;
                  const name = localizedName(l, i18n.language);
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('returns.sold', { count: l.quantity })}
                          {l.returnedQuantity > 0 &&
                            ` · ${t('returns.returned', { count: l.returnedQuantity })}`}
                        </p>
                      </div>
                      {remaining > 0 ? (
                        <QuantityStepper
                          value={picked[l.id] ?? 0}
                          min={0}
                          max={remaining}
                          onChange={(q) => setPicked((p) => ({ ...p, [l.id]: q }))}
                          label={t('returns.quantityFor', { name })}
                          decrementLabel={t('decrease', { name })}
                          incrementLabel={t('increase', { name })}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">{t('returns.none')}</span>
                      )}
                    </li>
                  );
                })}
            </ul>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('returns.refundMethod')}</legend>
              <RadioGroup
                value={refundMethod}
                onValueChange={(v) => setRefundMethod(v as 'CASH' | 'ORIGINAL')}
                className="grid gap-2 sm:grid-cols-2"
              >
                {(['ORIGINAL', 'CASH'] as const).map((m) => (
                  <label
                    key={m}
                    className="flex min-h-touch cursor-pointer items-center gap-3 rounded-lg border px-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value={m} />
                    <span className="text-sm font-medium">
                      {m === 'CASH'
                        ? t('returns.CASH')
                        : original?.method === 'CREDIT' && data.customer
                          ? t('returns.ORIGINAL_CREDIT', { name: data.customer.name })
                          : t('returns.ORIGINAL', {
                              method: t(`payment.${original?.method ?? 'CASH'}`),
                            })}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
            <label
              htmlFor={restockId}
              className="flex min-h-touch items-start gap-3 rounded-lg border px-3 py-2"
            >
              <Checkbox
                id={restockId}
                checked={restock}
                onCheckedChange={(v) => setRestock(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="block font-medium">{t('returns.restock')}</span>
                <span className="block text-muted-foreground">
                  {restock ? t('returns.restockHint') : t('returns.wastageHint')}
                </span>
              </span>
            </label>
            {count > 0 && (
              <p
                aria-live="polite"
                className="rounded-lg bg-muted/60 px-3 py-2 text-sm font-medium"
              >
                {t('returns.preview', { amount: money(estimate) })}
              </p>
            )}
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
