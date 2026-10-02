import type { DeliveryStatus, Money, Order } from '@rbp/types';
import { Button, MoneyInput, PaymentMethodButton, ResponsiveDialog, toast } from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { ArrowRightIcon, BanknoteIcon, BikeIcon, CreditCardIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useAdvanceDelivery } from '../api/queries';
import { NEXT, RIDER_STEPS } from '../lib/status';
import { AssignRiderDialog } from './assign-rider-dialog';

/**
 * DEL-004 the next step for an order (plus DEL-003 assign). Out for delivery needs a rider;
 * Delivered on an unpaid order collects the payment first.
 */
export function DeliveryActions({
  order,
  size = 'sm',
  full = false,
}: {
  order: Order;
  size?: 'sm' | 'pos';
  full?: boolean;
}) {
  const { t } = useTranslation('delivery');
  const errorMessage = useErrorMessage();
  const { can } = useAccess();
  const advance = useAdvanceDelivery();
  const [assigning, setAssigning] = useState<Order | null>(null);
  const [collecting, setCollecting] = useState(false);
  const status = order.delivery?.status;
  const next = status ? NEXT[status] : undefined;
  const dispatcher = can('delivery.manage');
  const mayStep = !!next && (dispatcher || RIDER_STEPS.includes(next));
  const needsRider = next === 'OUT_FOR_DELIVERY' && !order.delivery?.riderId;
  const canAssign =
    dispatcher && !!status && ['NEW', 'CONFIRMED', 'PREPARING', 'READY'].includes(status);

  const step = (to: DeliveryStatus) =>
    advance.mutate(
      { id: order.id, body: { status: to } },
      {
        onSuccess: (o) =>
          toast.success(t('step.done', { number: o.number, status: t(`status.${to}`) })),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const cls = full ? 'w-full sm:w-auto' : 'pointer-coarse:min-h-11';
  return (
    <div className="flex flex-wrap gap-2">
      {canAssign && (
        <Button
          variant={needsRider ? 'default' : 'outline'}
          size={size}
          className={cls}
          onClick={() => setAssigning(order)}
          aria-label={t('assign.for', { number: order.number })}
        >
          <BikeIcon /> {order.delivery?.riderId ? t('assign.change') : t('assign.action')}
        </Button>
      )}
      {mayStep && next && !needsRider && (
        <Button
          size={size}
          className={cls}
          loading={advance.isPending}
          onClick={() =>
            next === 'DELIVERED' && order.status !== 'PAID' ? setCollecting(true) : step(next)
          }
          aria-label={t('step.for', { step: t(`step.${next}`), number: order.number })}
        >
          {t(`step.${next}`)} <ArrowRightIcon />
        </Button>
      )}
      <AssignRiderDialog order={assigning} onOpenChange={(o) => !o && setAssigning(null)} />
      <CollectDialog order={collecting ? order : null} onOpenChange={setCollecting} />
    </div>
  );
}

/** Cash or card at the door, then Delivered. */
function CollectDialog({
  order,
  onOpenChange,
}: {
  order: Order | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation('delivery');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const advance = useAdvanceDelivery();
  const tenderedId = useId();
  const [method, setMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [tendered, setTendered] = useState<Money | null>(null);
  const [was, setWas] = useState(order);
  if (order !== was) {
    setWas(order);
    setMethod('CASH');
    setTendered(order?.totals.total ?? null);
  }
  const total = order?.totals.total;
  const short = method === 'CASH' && (!tendered || !total || tendered.amount < total.amount);
  const change =
    method === 'CASH' && tendered && total ? Math.max(0, tendered.amount - total.amount) : 0;

  const submit = () =>
    order &&
    advance.mutate(
      {
        id: order.id,
        body: {
          status: 'DELIVERED',
          payment: { method, ...(method === 'CASH' && tendered ? { tendered } : {}) },
        },
      },
      {
        onSuccess: (o) => {
          toast.success(t('collect.done', { number: o.number }));
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <ResponsiveDialog
      open={!!order}
      onOpenChange={(o) => !advance.isPending && onOpenChange(o)}
      title={t('collect.title', { number: order?.number ?? '' })}
      description={total ? t('collect.hint', { amount: formatMoney(total, locale) }) : undefined}
      closeLabel={t('close')}
      size="md"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={short}
          loading={advance.isPending}
          onClick={submit}
        >
          {t('collect.confirm')}
        </Button>
      }
    >
      <div data-screen-id="DEL-004" className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <PaymentMethodButton
            icon={<BanknoteIcon />}
            label={t('collect.CASH')}
            selected={method === 'CASH'}
            onClick={() => setMethod('CASH')}
          />
          <PaymentMethodButton
            icon={<CreditCardIcon />}
            label={t('collect.CARD')}
            selected={method === 'CARD'}
            onClick={() => setMethod('CARD')}
          />
        </div>
        {method === 'CASH' && (
          <div className="space-y-1.5">
            <label htmlFor={tenderedId} className="text-sm font-medium">
              {t('collect.tendered')}
            </label>
            <MoneyInput
              id={tenderedId}
              value={tendered}
              onChange={setTendered}
              currency={total?.currency ?? 'LKR'}
              symbol="Rs"
            />
            <p className="text-sm" aria-live="polite">
              {short
                ? t('collect.short')
                : t('collect.change', {
                    amount: formatMoney(
                      { amount: change, currency: total?.currency ?? 'LKR' },
                      locale,
                    ),
                  })}
            </p>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
